// In-process rehearsal relay: a faithful Node port of the Cloudflare worker in
// relay/src/index.ts (worker `fetch` + Durable Object `LiveRoom`) so rehearsal
// mode speaks the live contract without touching Cloudflare. Every wire rule --
// validation, state transitions, ticket verification -- is imported from
// relay/src/protocol.ts rather than re-implemented here.
import {createHash,timingSafeEqual} from 'node:crypto';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import type {Duplex} from 'node:stream';
import {WebSocketServer,type WebSocket as RelaySocket} from 'ws';
import {MAX_CATALOG_BYTES,MAX_MESSAGE_BYTES,MAX_RECEIPTS,MAX_REQUEST_BYTES,MAX_SNAPSHOT_BYTES,PROTOCOL,jsonBytes,nextState,parseAck,parseCatalog,parseCommand,parseInitialState,rendererExpired,validCatalogVersion,validInteger,validToken,validUuid,verifyTicket,type ApprovedCatalog,type Command,type LiveState,type Renderer,type Role,type Snapshot,type SocketAttachment} from '../relay/src/protocol.ts';

export const DEFAULT_REHEARSAL_RELAY_PORT=8788;
// Real-time cadence of the presence sweep. The worker uses a Durable Object
// alarm pinned to `seen+STALE_MS`; polling keeps the same inclusive deadline
// while letting an injected clock move independently of wall time.
const SWEEP_INTERVAL_MS=250;
const HEADERS={'Cache-Control':'no-store','Content-Type':'application/json','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'} as const;
const STATUS_TEXT:Record<number,string>={400:'Bad Request',401:'Unauthorized',403:'Forbidden',404:'Not Found',409:'Conflict',413:'Payload Too Large',426:'Upgrade Required',503:'Service Unavailable'};
const ROUTES=['/state','/initialize','/command','/catalog','/ack'];
const LOCAL_ORIGIN=/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

export class HttpError extends Error{constructor(readonly status:number,message:string){super(message)}}

type Receipt={action:string;cue:string|null;createdAt:number};

function secretMatches(candidate:string,expected:string){
 if(!candidate||!expected)return false;
 const left=createHash('sha256').update(candidate).digest(),right=createHash('sha256').update(expected).digest();
 return timingSafeEqual(left,right);
}
function bearer(request:IncomingMessage){return (request.headers.authorization??'').replace(/^Bearer /,'')}
function allowedOrigin(request:IncomingMessage){
 const origin=request.headers.origin;
 // The worker matches ALLOWED_ORIGINS; the stub is local-only, and the
 // Companion module sends no Origin at all.
 return !origin||LOCAL_ORIGIN.test(origin);
}
function ticketProtocol(request:IncomingMessage){
 const protocols=String(request.headers['sec-websocket-protocol']??'').split(',').map(value=>value.trim());
 if(!protocols.includes(PROTOCOL))return null;
 const tickets=protocols.filter(value=>value.startsWith('ticket.'));
 return tickets.length===1?tickets[0].slice('ticket.'.length):null;
}
function sendJson(response:ServerResponse,value:unknown,status=200){
 const body=JSON.stringify(value)??'null';
 response.writeHead(status,{...HEADERS,'Content-Length':Buffer.byteLength(body)});
 response.end(body);
}
function refuseUpgrade(socket:Duplex,status:number,message:string){
 const body=JSON.stringify({error:message});
 const head=[`HTTP/1.1 ${status} ${STATUS_TEXT[status]??'Error'}`,...Object.entries(HEADERS).map(([key,value])=>`${key}: ${value}`),`Content-Length: ${Buffer.byteLength(body)}`,'Connection: close','',''].join('\r\n');
 socket.end(head+body);
}

export class RehearsalRoom{
 state:LiveState|null=null;
 catalog:ApprovedCatalog|null=null;
 readonly sockets=new Map<RelaySocket,SocketAttachment>();
 readonly receipts=new Map<string,Receipt>();
 readonly sequences=new Map<string,number>();
 readonly tickets=new Map<string,number>();
 readonly legacyPresence=new Map<string,Renderer>();
 constructor(private readonly now:()=>number=Date.now){}

 // --- ticket single use -----------------------------------------------------
 consumeTicket(jti:string,expires:number){
  const nowSeconds=Math.floor(this.now()/1000);
  for(const [id,deadline] of this.tickets)if(deadline<=nowSeconds)this.tickets.delete(id);
  if(this.tickets.has(jti))return false;
  this.tickets.set(jti,expires);
  return true;
 }

 // --- presence --------------------------------------------------------------
 currentRenderers(exclude?:RelaySocket){
  const now=this.now();
  const current=this.state;
  const renderers=new Map<string,Renderer>();
  for(const [socket,attachment] of this.sockets){
   if(socket===exclude||attachment.role!=='output')continue;
   if(rendererExpired(attachment.seen,now)){attachment.ack=null;socket.close(4408,'Heartbeat timeout');continue}
   if(attachment.ack&&current&&attachment.ack.revision===current.revision&&attachment.ack.cue===current.cue)renderers.set(attachment.ack.id,attachment.ack);
  }
  for(const [id,renderer] of this.legacyPresence){
   if(rendererExpired(renderer.seen,now))this.legacyPresence.delete(id);
   else if(current&&renderer.revision===current.revision&&renderer.cue===current.cue)renderers.set(id,renderer);
  }
  return [...renderers.values()].sort((a,b)=>b.seen-a.seen);
 }
 snapshot(exclude?:RelaySocket):Snapshot|null{
  const state=this.state;
  return state?{...state,renderers:this.currentRenderers(exclude),serverTime:this.now()}:null;
 }
 private ensureSnapshotSize(snapshot:Snapshot|null){if(jsonBytes(snapshot)>MAX_SNAPSHOT_BYTES)throw new HttpError(413,'Snapshot too large')}

 // --- HTTP operations -------------------------------------------------------
 initialize(value:unknown):[unknown,number]{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Invalid initialization');
  const input=value as Record<string,unknown>;
  const catalog=parseCatalog({version:input.catalogVersion,cues:input.cues});
  const state=parseInitialState(input.state,input.catalogVersion);
  if(!state||!catalog||(state.cue===null)!==(state.cuePayload===null))throw new HttpError(400,'Invalid initialization');
  if(state.cue!==null&&state.cuePayload?.id!==state.cue)throw new HttpError(400,'Selected cue payload does not match cue');
  if(state.cue!==null&&!catalog.cues.some(cue=>cue.id===state.cue))throw new HttpError(400,'Selected cue is not in approved catalog');
  if(jsonBytes(catalog)>MAX_CATALOG_BYTES)throw new HttpError(413,'Catalog too large');
  this.ensureSnapshotSize({...state,renderers:[],serverTime:this.now()});
  if(this.state||this.catalog)throw new HttpError(409,'Relay is already initialized');
  this.catalog=catalog;
  this.state=state;
  const snapshot=this.snapshot();
  this.broadcast({type:'snapshot',snapshot});
  return [snapshot,201];
 }
 command(value:unknown):[unknown,number]{
  const command=parseCommand(value);
  if(!command)throw new HttpError(400,'Invalid command');
  const accepted=this.applyCommand(command);
  const snapshot=this.snapshot();
  this.ensureSnapshotSize(snapshot);
  if(accepted)this.broadcast({type:'snapshot',snapshot});
  return [{commandId:command.commandId,...snapshot},200];
 }
 private applyCommand(command:Command){
  const current=this.state;
  const catalog=this.catalog;
  if(!current||!catalog)throw new HttpError(409,'Relay initialization required');
  const receipt=this.receipts.get(command.commandId);
  if(receipt){
   if(receipt.action!==command.action||receipt.cue!==command.cue)throw new HttpError(409,'Command ID already used for a different command');
   return false;
  }
  const selected=command.cue===null?null:catalog.cues.find(cue=>cue.id===command.cue)??null;
  if((command.action==='in'||command.action==='out')&&!selected)throw new HttpError(400,'Unknown cue');
  let accepted=true;
  if(command.clientId!==null){
   const prior=this.sequences.get(command.clientId)??-1;
   accepted=command.sequence!>prior;
   if(accepted)this.sequences.set(command.clientId,command.sequence!);
  }
  if(accepted){
   const next=nextState(current,command,selected,this.now());
   this.ensureSnapshotSize({...next,renderers:[],serverTime:this.now()});
   this.state=next;
  }
  this.receipts.set(command.commandId,{action:command.action,cue:command.cue,createdAt:this.now()});
  const excess=this.receipts.size-MAX_RECEIPTS;
  if(excess>0)for(const [id] of [...this.receipts].sort((a,b)=>a[1].createdAt-b[1].createdAt||(a[0]<b[0]?-1:1)).slice(0,excess))this.receipts.delete(id);
  return accepted;
 }
 approvedCatalog(value:unknown):[unknown,number]{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Invalid approved catalog');
  const input=value as Record<string,unknown>;
  const expectedVersion=input.expectedVersion;
  if(expectedVersion!==undefined&&!validCatalogVersion(expectedVersion))throw new HttpError(400,'Invalid expected catalog version');
  const catalog=parseCatalog(value);
  if(!catalog)throw new HttpError(400,'Invalid approved catalog');
  if(jsonBytes(catalog)>MAX_CATALOG_BYTES)throw new HttpError(413,'Catalog too large');
  const state=this.state;
  if(!state)throw new HttpError(409,'Relay initialization required');
  const currentCatalog=this.catalog;
  if(!currentCatalog)throw new HttpError(409,'Relay initialization required');
  if(expectedVersion!==undefined&&expectedVersion!==currentCatalog.version)throw new HttpError(409,'Approved catalog changed');
  if(state.catalogVersion===catalog.version&&JSON.stringify(currentCatalog.cues)!==JSON.stringify(catalog.cues))throw new HttpError(409,'Catalog version already identifies different content');
  if(state.catalogVersion!==catalog.version){
   this.catalog=catalog;
   this.state={...state,catalogVersion:catalog.version};
   this.broadcast({type:'catalog',version:catalog.version});
  }
  return [{ok:true,version:catalog.version},200];
 }
 ack(value:unknown):[unknown,number]{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Invalid acknowledgment');
  const id=(value as Record<string,unknown>).id;
  if(!validUuid(id))throw new HttpError(400,'Invalid acknowledgment');
  const parsed=parseAck(value,id as string);
  const state=this.state;
  if(!parsed||!state)throw new HttpError(400,'Invalid acknowledgment');
  if(parsed.revision!==state.revision||parsed.cue!==state.cue)throw new HttpError(409,'Acknowledgment does not match current state');
  // parseAck stamps `seen` from Date.now(); re-stamp so an injected clock stays
  // the single source of truth for expiry. Identical when now === Date.now.
  this.legacyPresence.set(parsed.id,{...parsed,seen:this.now()});
  this.broadcastPresence();
  return [{ok:true},200];
 }

 // --- sockets ---------------------------------------------------------------
 attach(socket:RelaySocket,role:Role){
  this.sockets.set(socket,{role,id:null,seen:this.now(),ack:null});
  this.send(socket,{type:'snapshot',snapshot:this.snapshot()});
  this.broadcastPresence();
 }
 detach(socket:RelaySocket){
  if(!this.sockets.delete(socket))return;
  this.broadcastPresence(socket);
 }
 handleMessage(socket:RelaySocket,message:string|null){
  if(message===null||Buffer.byteLength(message)>MAX_MESSAGE_BYTES)return this.closeProtocol(socket,'Invalid message');
  let input:Record<string,unknown>;
  try{input=JSON.parse(message) as Record<string,unknown>}catch{return this.closeProtocol(socket,'Invalid JSON')}
  if(!input||typeof input!=='object'||Array.isArray(input))return this.closeProtocol(socket,'Invalid message');
  const attachment=this.sockets.get(socket);
  if(!attachment)return this.closeProtocol(socket,'Missing session');
  if(input.type==='hello'){
   if(attachment.id!==null||!validUuid(input.id))return this.closeProtocol(socket,'Invalid hello');
   attachment.id=input.id as string;attachment.seen=this.now();
   this.broadcastPresence();
   return;
  }
  if(attachment.id===null)return this.closeProtocol(socket,'Hello required');
  if(input.type==='heartbeat'){
   attachment.seen=this.now();
   if(input.ack!==undefined){
    if(attachment.role!=='output')return this.closeProtocol(socket,'Role cannot acknowledge');
    const ack=this.readAck(input.ack,attachment.id);
    if(!ack)return this.closeProtocol(socket,'Invalid acknowledgment');
    const state=this.state;
    attachment.ack=state&&ack.revision===state.revision&&ack.cue===state.cue?ack:null;
   }
   this.send(socket,{type:'pong',serverTime:this.now()});
   this.broadcastPresence();
   return;
  }
  if(input.type==='ack'){
   if(attachment.role!=='output')return this.closeProtocol(socket,'Role cannot acknowledge');
   const ack=this.readAck(input.ack??input,attachment.id);
   if(!ack)return this.closeProtocol(socket,'Invalid acknowledgment');
   const state=this.state;
   attachment.seen=this.now();
   attachment.ack=state&&ack.revision===state.revision&&ack.cue===state.cue?ack:null;
   if(!attachment.ack)this.send(socket,{type:'snapshot',snapshot:this.snapshot()});
   this.broadcastPresence();
   return;
  }
  this.closeProtocol(socket,'Unsupported message');
 }
 private readAck(value:unknown,helloId:string){
  const ack=parseAck(value,helloId);
  return ack?{...ack,seen:this.now()}:null;
 }
 sweep(){this.broadcastPresence()}
 send(socket:RelaySocket,event:unknown){
  const encoded=JSON.stringify(event);
  if(Buffer.byteLength(encoded)>MAX_SNAPSHOT_BYTES){socket.close(4409,'Server event too large');return}
  try{socket.send(encoded)}catch{}
 }
 broadcast(event:unknown,exclude?:RelaySocket){for(const socket of [...this.sockets.keys()])if(socket!==exclude)this.send(socket,event)}
 broadcastPresence(exclude?:RelaySocket){this.broadcast({type:'presence',renderers:this.currentRenderers(exclude),serverTime:this.now()},exclude)}
 private closeProtocol(socket:RelaySocket,reason:string){socket.close(4400,reason)}
}

async function readBody(request:IncomingMessage,maxBytes:number){
 const declared=Number(request.headers['content-length']??0);
 if(declared>maxBytes)throw new HttpError(413,'Request too large');
 const chunks:Buffer[]=[];
 let size=0;
 for await (const chunk of request){
  const buffer=chunk as Buffer;
  size+=buffer.byteLength;
  if(size>maxBytes)throw new HttpError(413,'Request too large');
  chunks.push(buffer);
 }
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown}catch{throw new HttpError(400,'Invalid JSON')}
}

export type RehearsalRelayOptions={port:number;host?:string;secret:string;now?:()=>number};
export type RehearsalRelay={url:string;port:number;close():Promise<void>;room:RehearsalRoom};

export function startRehearsalRelay({port,host='127.0.0.1',secret,now=Date.now}:RehearsalRelayOptions):Promise<RehearsalRelay>{
 const room=new RehearsalRoom(now);
 const sockets=new WebSocketServer({noServer:true,handleProtocols:protocols=>protocols.has(PROTOCOL)?PROTOCOL:false});
 const server:Server=createServer((request,response)=>{void route(request,response)});

 async function route(request:IncomingMessage,response:ServerResponse){
  const url=new URL(request.url??'/','http://relay.invalid');
  if(url.pathname==='/connect')return sendJson(response,{error:'WebSocket upgrade required'},426);
  if(!ROUTES.includes(url.pathname))return sendJson(response,{error:'Not found'},404);
  if(!secretMatches(bearer(request),secret))return sendJson(response,{error:'Relay authentication required'},401);
  try{
   if(url.pathname==='/state'&&request.method==='GET')return sendJson(response,room.snapshot());
   if(url.pathname==='/catalog'&&request.method==='GET')return sendJson(response,room.catalog);
   const bodyLimit=url.pathname==='/initialize'?MAX_REQUEST_BYTES:url.pathname==='/catalog'?MAX_CATALOG_BYTES:MAX_MESSAGE_BYTES;
   const input=await readBody(request,bodyLimit);
   if(url.pathname==='/initialize'&&request.method==='POST')return sendJson(response,...room.initialize(input));
   if(url.pathname==='/command'&&request.method==='POST')return sendJson(response,...room.command(input));
   if(url.pathname==='/catalog'&&request.method==='POST')return sendJson(response,...room.approvedCatalog(input));
   if(url.pathname==='/ack'&&request.method==='POST')return sendJson(response,...room.ack(input));
   return sendJson(response,{error:'Not found'},404);
  }catch(error){
   if(error instanceof HttpError)return sendJson(response,{error:error.message},error.status);
   return sendJson(response,{error:'Relay unavailable'},503);
  }
 }

 server.on('upgrade',(request,socket,head)=>{void (async()=>{
  const url=new URL(request.url??'/','http://relay.invalid');
  if(url.pathname!=='/connect')return refuseUpgrade(socket,404,'Not found');
  if(request.method!=='GET'||request.headers.upgrade?.toLowerCase()!=='websocket')return refuseUpgrade(socket,426,'WebSocket upgrade required');
  if(!allowedOrigin(request))return refuseUpgrade(socket,403,'Origin not allowed');
  const raw=ticketProtocol(request);
  const ticket=raw?await verifyTicket(raw,secret,Math.floor(now()/1000)):null;
  if(!ticket)return refuseUpgrade(socket,401,'Invalid or expired ticket');
  const role=ticket.role as Role;
  if(!['control','output','preview'].includes(role)||!validToken(ticket.jti)||!validInteger(ticket.exp))return refuseUpgrade(socket,401,'Invalid ticket');
  if(!room.consumeTicket(ticket.jti,ticket.exp))return refuseUpgrade(socket,409,'Ticket already used');
  sockets.handleUpgrade(request,socket,head,accepted=>{
   accepted.on('message',(data:Buffer,isBinary:boolean)=>room.handleMessage(accepted,isBinary?null:data.toString('utf8')));
   accepted.on('close',()=>room.detach(accepted));
   accepted.on('error',()=>{room.detach(accepted);accepted.close(1011,'WebSocket error')});
   room.attach(accepted,role);
  });
 })().catch(()=>refuseUpgrade(socket,503,'Relay unavailable'))});

 const sweep=setInterval(()=>room.sweep(),SWEEP_INTERVAL_MS);
 sweep.unref();

 return new Promise<RehearsalRelay>((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,host,()=>{
   server.removeListener('error',reject);
   const address=server.address();
   const bound=typeof address==='object'&&address?address.port:port;
   resolve({
    url:`http://${host}:${bound}`,
    port:bound,
    room,
    close:()=>new Promise<void>(done=>{
     clearInterval(sweep);
     for(const socket of [...room.sockets.keys()])socket.terminate();
     sockets.close(()=>server.close(()=>done()));
    }),
   });
  });
 });
}

if(process.argv[1]?.endsWith('rehearsal-relay.ts')){
 const port=Number(process.env.CRC_REHEARSAL_RELAY_PORT??DEFAULT_REHEARSAL_RELAY_PORT);
 const secret=process.env.RELAY_SECRET??'';
 if(!secret)throw Error('RELAY_SECRET is required to start the rehearsal relay');
 const relay=await startRehearsalRelay({port,secret});
 console.log(`rehearsal relay listening on ${relay.url}`);
}
