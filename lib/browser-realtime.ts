import type {Cue} from './player';
import type {BugState} from './bug-layer';

export type RealtimeRole='control'|'output'|'preview';
export type RealtimeStatus='bootstrapping'|'live'|'reconnecting'|'stopped';

export type RendererAck={id:string;revision:number;cue:string|null;phase:string;seen?:number};
/* D1/D5: the relay carries the scan card as one optional field on live state, so a snapshot
   written by a worker that predates it reads as "no scan card". isSnapshot is deliberately
   unchanged — it validates the fields the renderer depends on and tolerates new keys, which
   is what lets a 1.4.0-shaped client keep working against a newer relay. */
export type RealtimeSnapshot={revision:number;cue:string|null;mode:'animate'|'cut';updated:number;cuePayload:Cue|null;catalogVersion:string;renderers:RendererAck[];serverTime:number;bug?:BugState};

type Ticket={url:string;ticket:string;heartbeatMs:number;staleMs:number;protocol:1};
type SocketLike={readyState:number;onopen:null|((event:Event)=>void);onmessage:null|((event:MessageEvent<unknown>)=>void);onclose:null|((event:Event)=>void);onerror:null|((event:Event)=>void);send(data:string):void;close(code?:number,reason?:string):void};

export type RealtimeDependencies={
 fetch:typeof fetch;
 socket:(url:string,protocols:string[])=>SocketLike;
 setTimeout:(callback:()=>void,delay:number)=>ReturnType<typeof setTimeout>;
 clearTimeout:(timer:ReturnType<typeof setTimeout>)=>void;
 setInterval:(callback:()=>void,delay:number)=>ReturnType<typeof setInterval>;
 clearInterval:(timer:ReturnType<typeof setInterval>)=>void;
 now:()=>number;
 random:()=>number;
};

export type BrowserRealtimeOptions={
 key:string;
 role:RealtimeRole;
 id:string;
 getAck?:()=>Omit<RendererAck,'seen'>;
 getCatalogVersion?:()=>string;
 onSnapshot:(snapshot:RealtimeSnapshot)=>void|Promise<void>;
 onPresence?:(renderers:RendererAck[],serverTime:number)=>void|Promise<void>;
 onCatalog?:(version:string)=>void|Promise<void>;
 onStatus?:(status:RealtimeStatus)=>void;
 dependencies?:Partial<RealtimeDependencies>;
};

export class CatalogRefreshCoordinator<T extends {version:string}>{
 private desired='';
 private attempted='';
 private pending:Promise<void>|null=null;
 private readonly operations:{getVersion:()=>string;load:()=>Promise<T>;apply:(value:T)=>void|Promise<void>};
 constructor(operations:{getVersion:()=>string;load:()=>Promise<T>;apply:(value:T)=>void|Promise<void>}){this.operations=operations}
 request(version:string){
  this.desired=version;
  if(version===this.operations.getVersion())return Promise.resolve();
  if(!this.pending){const run=this.drain();this.pending=run.finally(()=>{this.pending=null;if(this.desired!==this.attempted&&this.desired!==this.operations.getVersion())void this.request(this.desired).catch(()=>{})})}
  return this.pending;
 }
 private async drain(){
  while(this.desired!==this.operations.getVersion()){
   const target=this.desired;this.attempted=target;
   const value=await this.operations.load();await this.operations.apply(value);
   // One fetch satisfies one marker. A different marker received during the
   // fetch gets its own pass; a lagging marker cannot create an idle loop.
   if(this.desired===target)return;
  }
 }
}

const defaults:RealtimeDependencies={
 fetch:globalThis.fetch.bind(globalThis),
 socket:(url,protocols)=>new WebSocket(url,protocols) as unknown as SocketLike,
 setTimeout:(callback,delay)=>setTimeout(callback,delay),
 clearTimeout:timer=>clearTimeout(timer),
 setInterval:(callback,delay)=>setInterval(callback,delay),
 clearInterval:timer=>clearInterval(timer),
 now:()=>Date.now(),
 random:()=>Math.random(),
};

function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null}
function isRendererAck(value:unknown):value is RendererAck{return isRecord(value)&&typeof value.id==='string'&&Number.isSafeInteger(value.revision)&&(value.cue===null||typeof value.cue==='string')&&typeof value.phase==='string'&&(value.seen===undefined||Number.isFinite(value.seen))}
function isCuePayload(value:unknown):value is Cue{return isRecord(value)&&typeof value.id==='string'}
function isSnapshot(value:unknown):value is RealtimeSnapshot{return isRecord(value)&&Number.isSafeInteger(value.revision)&&Number(value.revision)>=0&&(value.cue===null||typeof value.cue==='string')&&(value.mode==='animate'||value.mode==='cut')&&Number.isFinite(value.updated)&&(value.cuePayload===null||isCuePayload(value.cuePayload))&&typeof value.catalogVersion==='string'&&Array.isArray(value.renderers)&&value.renderers.every(isRendererAck)&&Number.isFinite(value.serverTime)}
function isTicket(value:unknown):value is Ticket{return isRecord(value)&&value.protocol===1&&typeof value.url==='string'&&/^wss?:\/\//.test(value.url)&&typeof value.ticket==='string'&&value.ticket.length>0&&Number.isFinite(value.heartbeatMs)&&Number.isFinite(value.staleMs)}

export class BrowserRealtimeTransport{
 private readonly options:BrowserRealtimeOptions;
 private readonly dependencies:RealtimeDependencies;
 private socket:SocketLike|null=null;
 private ticketAbort:AbortController|null=null;
 private reconnectTimer:ReturnType<typeof setTimeout>|null=null;
 private ticketTimer:ReturnType<typeof setTimeout>|null=null;
 private heartbeatTimer:ReturnType<typeof setInterval>|null=null;
 private handshakeTimer:ReturnType<typeof setTimeout>|null=null;
 private stopped=true;
 private live=false;
 private generation=0;
 private failures=0;
 private lastRevision=-1;
 private lastServerTime=-1;
 private lastMessageAt=0;
 private queue=Promise.resolve();

 constructor(options:BrowserRealtimeOptions){this.options=options;this.dependencies={...defaults,...options.dependencies}}

 start(){if(!this.stopped)return;this.stopped=false;this.generation++;this.options.onStatus?.('bootstrapping');void this.connect(this.generation)}

 stop(){if(this.stopped)return;this.stopped=true;this.live=false;this.generation++;this.clearTimers();this.ticketAbort?.abort();this.ticketAbort=null;const socket=this.socket;this.socket=null;if(socket)socket.close(1000,'disposed');this.options.onStatus?.('stopped')}

 sendAck(ack:Omit<RendererAck,'seen'>){if(this.options.role!=='output'||!this.live||this.socket?.readyState!==1)return false;this.socket.send(JSON.stringify({type:'ack',...ack}));return true}

 private async connect(generation:number){
  this.ticketAbort?.abort();const abort=new AbortController();this.ticketAbort=abort;
  const ticketTimer=this.dependencies.setTimeout(()=>abort.abort(),5000);this.ticketTimer=ticketTimer;
  const clearTicket=()=>{this.dependencies.clearTimeout(ticketTimer);if(this.ticketTimer===ticketTimer)this.ticketTimer=null;if(this.ticketAbort===abort)this.ticketAbort=null};
  try{
   const response=await this.dependencies.fetch(`/api/realtime?role=${this.options.role}`,{headers:this.options.key==='session'?{}:{Authorization:`Bearer ${this.options.key}`},cache:'no-store',signal:abort.signal});
   if(!response.ok)throw Error('Realtime ticket unavailable');
   const ticket:unknown=await response.json();if(!isTicket(ticket))throw Error('Invalid realtime ticket');
   clearTicket();
   if(this.stopped||generation!==this.generation)return;
   this.open(ticket,generation);
  }catch{clearTicket();if(!this.stopped&&generation===this.generation)this.scheduleReconnect(generation)}
 }

 private open(ticket:Ticket,generation:number){
  const socket=this.dependencies.socket(ticket.url,['crc-overlays-v1',`ticket.${ticket.ticket}`]);this.socket=socket;this.live=false;
  this.handshakeTimer=this.dependencies.setTimeout(()=>socket.close(4000,'connection timeout'),10000);
  socket.onopen=()=>{if(this.stopped||generation!==this.generation||this.socket!==socket){socket.close(1000,'stale');return}this.lastMessageAt=this.dependencies.now();socket.send(JSON.stringify({type:'hello',id:this.options.id}));const heartbeatMs=Math.max(1000,Math.min(60000,ticket.heartbeatMs));const staleMs=Math.max(heartbeatMs*2,Math.min(120000,ticket.staleMs));this.heartbeatTimer=this.dependencies.setInterval(()=>{if(this.socket!==socket)return;if(this.dependencies.now()-this.lastMessageAt>staleMs){socket.close(4000,'stale');return}const ack=this.live&&this.options.role==='output'?this.options.getAck?.():undefined;socket.send(JSON.stringify(ack?{type:'heartbeat',ack}:{type:'heartbeat'}))},heartbeatMs)};
  socket.onmessage=event=>{if(this.stopped||generation!==this.generation||this.socket!==socket||typeof event.data!=='string'||event.data.length>262144)return;this.lastMessageAt=this.dependencies.now();let message:unknown;try{message=JSON.parse(event.data)}catch{return}this.queue=this.queue.then(()=>this.handle(message,generation,socket)).catch(()=>{if(!this.stopped&&generation===this.generation&&this.socket===socket)socket.close(4000,'event failed')})};
  socket.onerror=()=>socket.close();
  socket.onclose=()=>{if(this.socket!==socket)return;this.socket=null;this.live=false;this.clearSocketTimers();if(!this.stopped&&generation===this.generation)this.scheduleReconnect(generation)};
 }

 private async handle(message:unknown,generation:number,socket:SocketLike){
  if(this.stopped||generation!==this.generation||this.socket!==socket)return;
  if(!isRecord(message))return;
  if(message.type==='pong')return;
  if(message.type==='presence'&&Array.isArray(message.renderers)&&message.renderers.every(isRendererAck)&&Number.isFinite(message.serverTime)){const serverTime=Number(message.serverTime);if(serverTime>=this.lastServerTime){this.lastServerTime=serverTime;await this.options.onPresence?.(message.renderers,serverTime)}return}
  if(message.type==='catalog'&&typeof message.version==='string'){if(message.version!==this.options.getCatalogVersion?.())void Promise.resolve(this.options.onCatalog?.(message.version)).catch(()=>{});return}
  if(message.type!=='snapshot'||!isSnapshot(message.snapshot))return;
  const snapshot=message.snapshot;if(snapshot.revision<this.lastRevision||(snapshot.revision===this.lastRevision&&snapshot.serverTime<this.lastServerTime))return;
  this.lastRevision=Math.max(this.lastRevision,snapshot.revision);this.lastServerTime=Math.max(this.lastServerTime,snapshot.serverTime);
  await this.options.onSnapshot(snapshot);
  if(this.stopped||generation!==this.generation||this.socket!==socket)return;
  if(this.handshakeTimer){this.dependencies.clearTimeout(this.handshakeTimer);this.handshakeTimer=null}
  this.failures=0;this.live=true;this.options.onStatus?.('live');
 }

 private scheduleReconnect(generation:number){
  if(this.reconnectTimer||this.stopped)return;this.options.onStatus?.('reconnecting');const base=Math.min(30000,1000*2**Math.min(this.failures++,5));const delay=Math.round(base*(0.8+this.dependencies.random()*0.4));this.reconnectTimer=this.dependencies.setTimeout(()=>{this.reconnectTimer=null;if(!this.stopped&&generation===this.generation)void this.connect(generation)},delay)
 }

 private clearSocketTimers(){if(this.heartbeatTimer){this.dependencies.clearInterval(this.heartbeatTimer);this.heartbeatTimer=null}if(this.handshakeTimer){this.dependencies.clearTimeout(this.handshakeTimer);this.handshakeTimer=null}}
 private clearTimers(){this.clearSocketTimers();if(this.ticketTimer){this.dependencies.clearTimeout(this.ticketTimer);this.ticketTimer=null}if(this.reconnectTimer){this.dependencies.clearTimeout(this.reconnectTimer);this.reconnectTimer=null}}
}
