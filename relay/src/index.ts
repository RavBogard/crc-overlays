import {DurableObject} from 'cloudflare:workers';
import {HISTORY_WINDOW_DAYS,MAX_CATALOG_BYTES,MAX_HISTORY_ROWS,MAX_MESSAGE_BYTES,MAX_RECEIPTS,MAX_REQUEST_BYTES,MAX_SNAPSHOT_BYTES,PROTOCOL,STALE_MS,collectionFromNamesCue,historyPage,historyRow,historyWindowStart,jsonBytes,librarySourceIds,nextState,parseAck,parseCatalog,parseCommand,parseHello,parseHistoryRange,parseInitialState,presenceFrame,rankControllers,rendererExpired,validCatalogVersion,validInteger,validToken,validUuid,verifyTicket,type ApprovedCatalog,type Command,type Controller,type CuePayload,type HistoryAction,type HistoryRow,type HistorySource,type LiveState,type Renderer,type Role,type Snapshot,type SocketAttachment} from './protocol';

interface Env{
 LIVE_ROOM:DurableObjectNamespace<LiveRoom>;
 RELAY_SECRET:string;
 ALLOWED_ORIGINS:string;
 /** Which congregation this worker serves. Named in the cue log so a reader cannot confuse two. */
 WORKSPACE?:string;
}

type StateRow={state_json:string};
type CatalogRow={version:string;cues_json:string};
type ReceiptRow={action:string;cue:string|null};
type HistoryRecord={seq:number;at:number;action:string;cue_id:string|null;source:string;service_ref:string|null;source_ids:string};
const HISTORY_COLUMNS='seq,at,action,cue_id,source,service_ref,source_ids';
const readHistoryRow=(row:HistoryRecord):HistoryRow=>{
 let sourceIds:string[]=[];
 try{const parsed=JSON.parse(row.source_ids) as unknown;if(Array.isArray(parsed))sourceIds=parsed.filter((id):id is string=>typeof id==='string')}catch{sourceIds=[]}
 return historyRow({seq:Number(row.seq),at:Number(row.at),action:row.action as HistoryAction,cueId:row.cue_id,source:row.source as HistorySource,serviceRef:row.service_ref,sourceIds});
};
const ROOM='crc';
const headers={'Cache-Control':'no-store','Content-Type':'application/json','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});

async function secretMatches(candidate:string,expected:string){
 if(!candidate||!expected)return false;
 const [left,right]=await Promise.all([candidate,expected].map(value=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
 const a=new Uint8Array(left),b=new Uint8Array(right);
 let different=0;
 for(let index=0;index<a.length;index++)different|=a[index]^b[index];
 return different===0;
}

function bearer(request:Request){return request.headers.get('authorization')?.replace(/^Bearer /,'')??''}
function allowedOrigin(request:Request,env:Env){
 const origin=request.headers.get('origin');
 return !origin||env.ALLOWED_ORIGINS.split(',').map(value=>value.trim()).filter(Boolean).includes(origin);
}
function ticketProtocol(request:Request){
 const protocols=(request.headers.get('sec-websocket-protocol')??'').split(',').map(value=>value.trim());
 if(!protocols.includes(PROTOCOL))return null;
 const tickets=protocols.filter(value=>value.startsWith('ticket.'));
 return tickets.length===1?tickets[0].slice('ticket.'.length):null;
}

export default {
 async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/connect'){
   if(request.method!=='GET'||request.headers.get('upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket upgrade required'},426);
   if(!allowedOrigin(request,env))return json({error:'Origin not allowed'},403);
   const raw=ticketProtocol(request);
   const ticket=raw?await verifyTicket(raw,env.RELAY_SECRET):null;
   if(!ticket)return json({error:'Invalid or expired ticket'},401);
   const internal=new Request(request);
   internal.headers.set('X-CRC-Role',ticket.role);
   internal.headers.set('X-CRC-JTI',ticket.jti);
   internal.headers.set('X-CRC-Exp',String(ticket.exp));
   return env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName(ROOM)).fetch(internal);
  }
  if(!['/state','/initialize','/command','/catalog','/ack','/history','/history/clear'].includes(url.pathname))return json({error:'Not found'},404);
  if(!await secretMatches(bearer(request),env.RELAY_SECRET))return json({error:'Relay authentication required'},401);
  return env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName(ROOM)).fetch(request);
 },
} satisfies ExportedHandler<Env>;

export class LiveRoom extends DurableObject<Env>{
 private readonly sql:SqlStorage;
 private legacyPresence=new Map<string,Renderer>();
 constructor(ctx:DurableObjectState,env:Env){
  super(ctx,env);
  this.sql=ctx.storage.sql;
  this.sql.exec(`
   CREATE TABLE IF NOT EXISTS live_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),state_json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS approved_catalog(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version TEXT NOT NULL,cues_json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS command_receipts(command_id TEXT PRIMARY KEY,action TEXT NOT NULL,cue TEXT,created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS controller_sequences(client_id TEXT PRIMARY KEY,sequence INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS ticket_receipts(jti TEXT PRIMARY KEY,expires INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS command_receipts_created ON command_receipts(created_at);
   CREATE INDEX IF NOT EXISTS ticket_receipts_expires ON ticket_receipts(expires);
   CREATE TABLE IF NOT EXISTS command_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,action TEXT NOT NULL,cue_id TEXT,source TEXT NOT NULL,service_ref TEXT,source_ids TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS command_history_at ON command_history(at);
  `);
 }

 async fetch(request:Request):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/connect')return this.acceptConnection(request);
  try{
   if(url.pathname==='/state'&&request.method==='GET')return json(this.snapshot());
   if(url.pathname==='/catalog'&&request.method==='GET')return json(this.readCatalog());
   if(url.pathname==='/history'&&request.method==='GET')return this.history(url);
   if(url.pathname==='/history/clear'&&request.method==='POST')return this.clearHistory();
   const bodyLimit=url.pathname==='/initialize'?MAX_REQUEST_BYTES:url.pathname==='/catalog'?MAX_CATALOG_BYTES:MAX_MESSAGE_BYTES;
   const input=await this.readBody(request,bodyLimit);
   if(url.pathname==='/initialize'&&request.method==='POST')return this.initialize(input);
   if(url.pathname==='/command'&&request.method==='POST')return this.command(input);
   if(url.pathname==='/catalog'&&request.method==='POST')return this.catalog(input);
   if(url.pathname==='/ack'&&request.method==='POST')return this.ack(input);
   return json({error:'Not found'},404);
  }catch(error){
   if(error instanceof HttpError)return json({error:error.message},error.status);
   return json({error:'Relay unavailable'},503);
  }
 }

 private acceptConnection(request:Request){
  const role=request.headers.get('X-CRC-Role') as Role|null;
  const jti=request.headers.get('X-CRC-JTI')??'';
  const expires=Number(request.headers.get('X-CRC-Exp'));
  if(!['control','output','preview'].includes(role??'')||!validToken(jti)||!validInteger(expires))return json({error:'Invalid ticket'},401);
  const nowSeconds=Math.floor(Date.now()/1000);
  const consumed=this.ctx.storage.transactionSync(()=>{
   this.sql.exec('DELETE FROM ticket_receipts WHERE expires<=?',nowSeconds);
   if(this.sql.exec('SELECT jti FROM ticket_receipts WHERE jti=?',jti).toArray().length)return false;
   this.sql.exec('INSERT INTO ticket_receipts(jti,expires) VALUES(?,?)',jti,expires);
   return true;
  });
  if(!consumed)return json({error:'Ticket already used'},409);
  const pair=new WebSocketPair();
  const client=pair[0],server=pair[1];
  this.ctx.acceptWebSocket(server);
  const attachment:SocketAttachment={role:role!,id:null,client:'unknown',version:null,seen:Date.now(),ack:null};
  server.serializeAttachment(attachment);
  this.send(server,{type:'snapshot',snapshot:this.snapshot()});
  this.broadcastPresence();
  if(role==='output'||role==='control')void this.scheduleExpiry();
  return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':PROTOCOL}});
 }

 private readState(){
  const row=this.sql.exec<StateRow>('SELECT state_json FROM live_state WHERE singleton=1').toArray()[0];
  return row?JSON.parse(row.state_json) as LiveState:null;
 }
 private writeState(state:LiveState){this.sql.exec('INSERT OR REPLACE INTO live_state(singleton,state_json) VALUES(1,?)',JSON.stringify(state))}
 private readCatalog(){
  const row=this.sql.exec<CatalogRow>('SELECT version,cues_json FROM approved_catalog WHERE singleton=1').toArray()[0];
  return row?{version:row.version,cues:JSON.parse(row.cues_json) as CuePayload[]}:null;
 }
 private writeCatalog(catalog:ApprovedCatalog){this.sql.exec('INSERT OR REPLACE INTO approved_catalog(singleton,version,cues_json) VALUES(1,?,?)',catalog.version,JSON.stringify(catalog.cues))}
 /**
  * The cue log's one write. It runs after the command has committed and before the broadcast,
  * outside the transaction on purpose: a history that cannot be written must never cost the
  * congregation a graphic, so every failure here is logged and swallowed.
  */
 private appendHistory(command:Command,selected:CuePayload|null,now:number){
  try{
   this.sql.exec(
    'INSERT INTO command_history(at,action,cue_id,source,service_ref,source_ids) VALUES(?,?,?,?,?,?)',
    now,command.action,command.cue,command.source,command.serviceRef??collectionFromNamesCue(command.cue),JSON.stringify(librarySourceIds(selected)),
   );
   this.pruneHistory(now);
  }catch(error){console.error('history_append_failed',{name:error instanceof Error?error.name:'UnknownError'})}
 }
 /** 2,000 rows or 14 days, whichever is smaller. Dropped, not archived. */
 private pruneHistory(now:number){
  this.sql.exec('DELETE FROM command_history WHERE at<?',historyWindowStart(now));
  this.sql.exec('DELETE FROM command_history WHERE seq<COALESCE((SELECT seq FROM command_history ORDER BY seq DESC LIMIT 1 OFFSET ?),0)',MAX_HISTORY_ROWS-1);
 }
 private history(url:URL){
  const now=Date.now();
  const range=parseHistoryRange(url.searchParams.get('since'),url.searchParams.get('until'),url.searchParams.get('after'),now,url.searchParams.get('limit'));
  if(!range)throw new HttpError(400,'Invalid history range');
  this.pruneHistory(now);
  const rows=this.sql.exec<HistoryRecord>(`SELECT ${HISTORY_COLUMNS} FROM command_history WHERE at>=? AND at<=? AND seq>? ORDER BY seq LIMIT ?`,range.since,range.until,range.after,range.limit+1).toArray().map(readHistoryRow);
  const limited=rows.slice(0,range.limit);
  const page=historyPage(limited);
  const nextAfter=page.nextAfter??(rows.length>range.limit&&limited.length?limited[limited.length-1].seq:null);
  return json({workspace:this.env.WORKSPACE??'crc',window:{rows:MAX_HISTORY_ROWS,days:HISTORY_WINDOW_DAYS},rows:page.rows,nextAfter});
 }
 /** The administrator's "clear history". The clearing itself is the last row left standing. */
 private clearHistory(){
  const now=Date.now();
  const cleared=this.ctx.storage.transactionSync(()=>{
   const count=this.sql.exec<{count:number}>('SELECT COUNT(*) AS count FROM command_history').toArray()[0]?.count??0;
   this.sql.exec('DELETE FROM command_history');
   this.sql.exec("INSERT INTO command_history(at,action,cue_id,source,service_ref,source_ids) VALUES(?,'history_cleared',NULL,'control',NULL,'[]')",now);
   return count;
  });
  const seq=this.sql.exec<{seq:number}>('SELECT seq FROM command_history ORDER BY seq DESC LIMIT 1').toArray()[0]?.seq??0;
  return json({ok:true,cleared,seq:Number(seq)});
 }
 private async readBody(request:Request,maxBytes:number){
  const declared=Number(request.headers.get('content-length')??0);
  if(declared>maxBytes)throw new HttpError(413,'Request too large');
  const body=await request.text();
  if(new TextEncoder().encode(body).byteLength>maxBytes)throw new HttpError(413,'Request too large');
  try{return JSON.parse(body) as unknown}catch{throw new HttpError(400,'Invalid JSON')}
 }
 private currentRenderers(exclude?:WebSocket){
  const now=Date.now();
  const current=this.readState();
  const renderers=new Map<string,Renderer>();
  for(const socket of this.ctx.getWebSockets()){
   if(socket===exclude)continue;
   const attachment=socket.deserializeAttachment() as SocketAttachment|null;
   if(!attachment||attachment.role!=='output')continue;
   if(rendererExpired(attachment.seen,now)){attachment.ack=null;socket.serializeAttachment(attachment);socket.close(4408,'Heartbeat timeout');continue}
   if(attachment.ack&&current&&attachment.ack.revision===current.revision&&attachment.ack.cue===current.cue)renderers.set(attachment.ack.id,attachment.ack);
  }
  for(const [id,renderer] of this.legacyPresence){
   if(rendererExpired(renderer.seen,now))this.legacyPresence.delete(id);
   else if(current&&renderer.revision===current.revision&&renderer.cue===current.cue)renderers.set(id,renderer);
  }
  return [...renderers.values()].sort((a,b)=>b.seen-a.seen);
 }
 // Controllers live in Durable Object memory only: the attachments of role 'control'
 // that have completed a hello, expired on the same inclusive deadline as renderers.
 private currentControllers(exclude?:WebSocket){
  const now=Date.now();
  const controllers:Controller[]=[];
  for(const socket of this.ctx.getWebSockets()){
   if(socket===exclude)continue;
   const attachment=socket.deserializeAttachment() as SocketAttachment|null;
   if(!attachment||attachment.role!=='control')continue;
   if(rendererExpired(attachment.seen,now)){socket.close(4408,'Heartbeat timeout');continue}
   if(attachment.id===null)continue;
   controllers.push({id:attachment.id,client:attachment.client??'unknown',version:attachment.version??null,seen:attachment.seen});
  }
  return rankControllers(controllers);
 }
 private snapshot(exclude?:WebSocket):Snapshot|null{
  const state=this.readState();
  return state?{...state,renderers:this.currentRenderers(exclude),controllers:this.currentControllers(exclude),serverTime:Date.now()}:null;
 }
 private ensureSnapshotSize(snapshot:Snapshot|null){if(jsonBytes(snapshot)>MAX_SNAPSHOT_BYTES)throw new HttpError(413,'Snapshot too large')}
 private initialize(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Invalid initialization');
  const input=value as Record<string,unknown>;
  const catalog=parseCatalog({version:input.catalogVersion,cues:input.cues});
  const state=parseInitialState(input.state,input.catalogVersion);
  if(!state||!catalog||(state.cue===null)!==(state.cuePayload===null))throw new HttpError(400,'Invalid initialization');
  if(state.cue!==null&&state.cuePayload?.id!==state.cue)throw new HttpError(400,'Selected cue payload does not match cue');
  if(state.cue!==null&&!catalog.cues.some(cue=>cue.id===state.cue))throw new HttpError(400,'Selected cue is not in approved catalog');
  if(jsonBytes(catalog)>MAX_CATALOG_BYTES)throw new HttpError(413,'Catalog too large');
  this.ensureSnapshotSize({...state,renderers:[],controllers:[],serverTime:Date.now()});
  const created=this.ctx.storage.transactionSync(()=>{
   if(this.readState()||this.readCatalog())return false;
   this.writeCatalog(catalog);
   this.writeState(state);
   return true;
  });
  if(!created)throw new HttpError(409,'Relay is already initialized');
  const snapshot=this.snapshot();
  this.broadcast({type:'snapshot',snapshot});
  return json(snapshot,201);
 }
 private command(value:unknown){
  const command=parseCommand(value);
  if(!command)throw new HttpError(400,'Invalid command');
  const outcome=this.ctx.storage.transactionSync(()=>this.applyCommand(command));
  // The cue log is a side effect of an accepted command: after the commit, before the
  // broadcast, and never able to refuse or delay what is already on screen.
  if(outcome.accepted)this.appendHistory(command,outcome.selected,Date.now());
  const snapshot=this.snapshot();
  this.ensureSnapshotSize(snapshot);
  if(outcome.accepted)this.broadcast({type:'snapshot',snapshot});
  return json({commandId:command.commandId,...snapshot});
 }
 // Every action -- 'in', 'out', 'clear', 'cut', the scan card's 'bug' and the resting
 // logo's 'logo' -- takes this one path: the same command receipt, the same
 // controller_sequences replay guard, the same ensureSnapshotSize on the produced state,
 // and the same broadcast in command(). Neither layer needs a storage key of its own; both
 // ride inside the persisted live_state row, which is what keeps them free of a migration
 // and is also what makes the logo preference survive a worker restart -- the row is in the
 // Durable Object's SQL storage, not in memory. A malformed page or logo is refused by
 // parseCommand as a 400 'Invalid command' before reaching here, never a socket close.
 private applyCommand(command:Command){
  const current=this.readState();
  const catalog=this.readCatalog();
  if(!current||!catalog)throw new HttpError(409,'Relay initialization required');
  // Receipts key on action+cue, so a replayed commandId is idempotent for 'bug' exactly
  // as it already is for 'cut' and 'clear', both of which also carry a null cue.
  const receipt=this.sql.exec<ReceiptRow>('SELECT action,cue FROM command_receipts WHERE command_id=?',command.commandId).toArray()[0];
  if(receipt){
   if(receipt.action!==command.action||receipt.cue!==command.cue)throw new HttpError(409,'Command ID already used for a different command');
   return {accepted:false,selected:null};
  }
  const selected=command.cue===null?null:catalog.cues.find(cue=>cue.id===command.cue)??null;
  if((command.action==='in'||command.action==='out')&&!selected)throw new HttpError(400,'Unknown cue');
  let accepted=true;
  if(command.clientId!==null){
   const prior=this.sql.exec<{sequence:number}>('SELECT sequence FROM controller_sequences WHERE client_id=?',command.clientId).toArray()[0]?.sequence??-1;
   accepted=command.sequence!>prior;
   if(accepted)this.sql.exec('INSERT INTO controller_sequences(client_id,sequence) VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET sequence=excluded.sequence',command.clientId,command.sequence);
  }
  if(accepted){
   const next=nextState(current,command,selected,Date.now());
   this.ensureSnapshotSize({...next,renderers:[],controllers:[],serverTime:Date.now()});
   this.writeState(next);
  }
  this.sql.exec('INSERT INTO command_receipts(command_id,action,cue,created_at) VALUES(?,?,?,?)',command.commandId,command.action,command.cue,Date.now());
  const excess=(this.sql.exec<{count:number}>('SELECT COUNT(*) AS count FROM command_receipts').toArray()[0]?.count??0)-MAX_RECEIPTS;
  if(excess>0)this.sql.exec('DELETE FROM command_receipts WHERE command_id IN (SELECT command_id FROM command_receipts ORDER BY created_at,command_id LIMIT ?)',excess);
  return {accepted,selected};
 }
 private catalog(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Invalid approved catalog');
  const input=value as Record<string,unknown>;
  const expectedVersion=input.expectedVersion;
  if(expectedVersion!==undefined&&!validCatalogVersion(expectedVersion))throw new HttpError(400,'Invalid expected catalog version');
  const catalog=parseCatalog(value);
  if(!catalog)throw new HttpError(400,'Invalid approved catalog');
  if(jsonBytes(catalog)>MAX_CATALOG_BYTES)throw new HttpError(413,'Catalog too large');
  const state=this.readState();
  if(!state)throw new HttpError(409,'Relay initialization required');
  const currentCatalog=this.readCatalog();
  if(!currentCatalog)throw new HttpError(409,'Relay initialization required');
  if(expectedVersion!==undefined&&expectedVersion!==currentCatalog.version)throw new HttpError(409,'Approved catalog changed');
  if(state.catalogVersion===catalog.version&&JSON.stringify(currentCatalog.cues)!==JSON.stringify(catalog.cues))throw new HttpError(409,'Catalog version already identifies different content');
  if(state.catalogVersion!==catalog.version){
   this.ctx.storage.transactionSync(()=>{this.writeCatalog(catalog);this.writeState({...state,catalogVersion:catalog.version})});
   this.broadcast({type:'catalog',version:catalog.version});
  }
  return json({ok:true,version:catalog.version});
 }
 private ack(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Invalid acknowledgment');
  const id=(value as Record<string,unknown>).id;
  if(!validUuid(id))throw new HttpError(400,'Invalid acknowledgment');
  const renderer=parseAck(value,id as string);
  const state=this.readState();
  if(!renderer||!state)throw new HttpError(400,'Invalid acknowledgment');
  if(renderer.revision!==state.revision||renderer.cue!==state.cue)throw new HttpError(409,'Acknowledgment does not match current state');
  this.legacyPresence.set(renderer.id,renderer);
  this.broadcastPresence();
  void this.scheduleExpiry();
  return json({ok:true});
 }

 async webSocketMessage(socket:WebSocket,message:string|ArrayBuffer){
  if(typeof message!=='string'||new TextEncoder().encode(message).byteLength>MAX_MESSAGE_BYTES)return this.closeProtocol(socket,'Invalid message');
  let input:Record<string,unknown>;
  try{input=JSON.parse(message) as Record<string,unknown>}catch{return this.closeProtocol(socket,'Invalid JSON')}
  if(!input||typeof input!=='object'||Array.isArray(input))return this.closeProtocol(socket,'Invalid message');
  const attachment=socket.deserializeAttachment() as SocketAttachment|null;
  if(!attachment)return this.closeProtocol(socket,'Missing session');
  if(input.type==='hello'){
   const hello=attachment.id===null?parseHello(input):null;
   if(!hello)return this.closeProtocol(socket,'Invalid hello');
   attachment.id=hello.id;attachment.client=hello.client;attachment.version=hello.version;attachment.seen=Date.now();socket.serializeAttachment(attachment);
   this.broadcastPresence();
   if(attachment.role==='output'||attachment.role==='control')await this.scheduleExpiry();
   return;
  }
  if(attachment.id===null)return this.closeProtocol(socket,'Hello required');
  if(input.type==='heartbeat'){
   attachment.seen=Date.now();
   if(input.ack!==undefined){
    if(attachment.role!=='output')return this.closeProtocol(socket,'Role cannot acknowledge');
    const ack=parseAck(input.ack,attachment.id);
    if(!ack)return this.closeProtocol(socket,'Invalid acknowledgment');
    const state=this.readState();
    attachment.ack=state&&ack.revision===state.revision&&ack.cue===state.cue?ack:null;
   }
   socket.serializeAttachment(attachment);
   this.send(socket,{type:'pong',serverTime:Date.now()});
   this.broadcastPresence();
   if(attachment.role==='output'||attachment.role==='control')await this.scheduleExpiry();
   return;
  }
  if(input.type==='ack'){
   if(attachment.role!=='output')return this.closeProtocol(socket,'Role cannot acknowledge');
   const ack=parseAck(input.ack??input,attachment.id);
   if(!ack)return this.closeProtocol(socket,'Invalid acknowledgment');
   const state=this.readState();
   attachment.seen=Date.now();attachment.ack=state&&ack.revision===state.revision&&ack.cue===state.cue?ack:null;
   socket.serializeAttachment(attachment);
   if(!attachment.ack)this.send(socket,{type:'snapshot',snapshot:this.snapshot()});
   this.broadcastPresence();
   await this.scheduleExpiry();
   return;
  }
  this.closeProtocol(socket,'Unsupported message');
 }
 async webSocketClose(socket:WebSocket,code:number,reason:string){
  socket.close(code,reason);
  this.broadcastPresence(socket);
  await this.scheduleExpiry(socket);
 }
 async webSocketError(socket:WebSocket){
  socket.close(1011,'WebSocket error');
  this.broadcastPresence(socket);
  await this.scheduleExpiry(socket);
 }
 async alarm(){this.broadcastPresence();await this.scheduleExpiry()}

 private send(socket:WebSocket,event:unknown){
  const encoded=JSON.stringify(event);
  if(new TextEncoder().encode(encoded).byteLength>MAX_SNAPSHOT_BYTES){socket.close(4409,'Server event too large');return}
  try{socket.send(encoded)}catch{}
 }
 private broadcast(event:unknown,exclude?:WebSocket){for(const socket of this.ctx.getWebSockets())if(socket!==exclude)this.send(socket,event)}
 private broadcastPresence(exclude?:WebSocket){this.broadcast(presenceFrame(this.currentRenderers(exclude),this.currentControllers(exclude),Date.now()),exclude)}
 private closeProtocol(socket:WebSocket,reason:string){socket.close(4400,reason)}
 private async scheduleExpiry(exclude?:WebSocket){
  const now=Date.now();
  const deadlines:number[]=[];
  for(const socket of this.ctx.getWebSockets()){
   if(socket===exclude)continue;
   const attachment=socket.deserializeAttachment() as SocketAttachment|null;
   if((attachment?.role==='output'||attachment?.role==='control')&&socket.readyState===WebSocket.OPEN&&!rendererExpired(attachment.seen,now))deadlines.push(attachment.seen+STALE_MS);
  }
  for(const renderer of this.legacyPresence.values())if(!rendererExpired(renderer.seen,now))deadlines.push(renderer.seen+STALE_MS);
  if(!deadlines.length){await this.ctx.storage.deleteAlarm();return}
  await this.ctx.storage.setAlarm(Math.max(now+1,Math.min(...deadlines)));
 }
}

class HttpError extends Error{constructor(readonly status:number,message:string){super(message)}}
