import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WebSocket as WsClient} from 'ws';
import {MAX_CONTROLLERS,MAX_MESSAGE_BYTES,MAX_SNAPSHOT_BYTES,PROTOCOL,STALE_MS} from '../relay/src/protocol.ts';
import {HttpError,RehearsalRoom,startRehearsalRelay,type RehearsalRelay} from '../scripts/rehearsal-relay.ts';
import {relayTicket,type RelayRole} from '../lib/relay.ts';
import {BrowserRealtimeTransport,type RealtimeSnapshot} from '../lib/browser-realtime.ts';
import {OverlayClient,type OverlaySnapshot} from '../companion/src/client.ts';

const SECRET=`rehearsal-${randomUUID()}`;
process.env.RELAY_SECRET=SECRET;

const CUES=[{id:'cue-one',title:'One'},{id:'cue-two',title:'Two'}];
const INITIALIZE={state:{revision:0,cue:null,mode:'animate',updated:1,cuePayload:null},catalogVersion:'rehearsal-v1',cues:CUES};

const running:RehearsalRelay[]=[];
after(async()=>{for(const relay of running.splice(0))await relay.close()});

async function startRelay(now?:()=>number){
 const relay=await startRehearsalRelay({port:0,secret:SECRET,now});
 running.push(relay);
 return relay;
}
function request(relay:RehearsalRelay,path:string,body?:unknown,authorize=true){
 return fetch(`${relay.url}${path}`,{
  method:body===undefined?'GET':'POST',
  headers:{...(authorize?{Authorization:`Bearer ${SECRET}`}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
  body:body===undefined?undefined:JSON.stringify(body),
 });
}
async function initializedRelay(now?:()=>number){
 const relay=await startRelay(now);
 assert.equal((await request(relay,'/initialize',INITIALIZE)).status,201);
 return relay;
}

type Frame=Record<string,unknown>;
type Recorder={frames:Frame[];next(match:(frame:Frame)=>boolean):Promise<Frame>;closed:Promise<number>};

function connect(relay:RehearsalRelay,role:RelayRole,ticket=relayTicket(role)){
 const socket=new WebSocket(`${relay.url.replace(/^http/,'ws')}/connect`,[PROTOCOL,`ticket.${ticket}`]);
 const frames:Frame[]=[];
 const waiters:{match:(frame:Frame)=>boolean;resolve:(frame:Frame)=>void}[]=[];
 socket.addEventListener('message',event=>{
  const frame=JSON.parse(String(event.data)) as Frame;
  const index=waiters.findIndex(waiter=>waiter.match(frame));
  if(index>=0)waiters.splice(index,1)[0].resolve(frame);
  else frames.push(frame);
 });
 const closed=new Promise<number>(resolve=>socket.addEventListener('close',event=>resolve(event.code)));
 const opened=new Promise<'open'|'refused'>(resolve=>{
  socket.addEventListener('open',()=>resolve('open'));
  socket.addEventListener('error',()=>resolve('refused'));
 });
 const recorder:Recorder={frames,closed,next(match){
  const index=frames.findIndex(match);
  if(index>=0)return Promise.resolve(frames.splice(index,1)[0]);
  return new Promise<Frame>(resolve=>waiters.push({match,resolve}));
 }};
 return {socket,recorder,opened};
}
const hello=(socket:WebSocket,id=randomUUID())=>{socket.send(JSON.stringify({type:'hello',id}));return id};

test('a valid control ticket upgrades, echoes the subprotocol, and receives a snapshot first',async()=>{
 const relay=await initializedRelay();
 const {socket,recorder,opened}=connect(relay,'control');
 assert.equal(await opened,'open');
 assert.equal(socket.protocol,PROTOCOL);
 const frame=await recorder.next(()=>true);
 assert.equal(frame.type,'snapshot');
 assert.equal((frame.snapshot as Frame).revision,0);
 assert.equal((frame.snapshot as Frame).catalogVersion,'rehearsal-v1');
 assert.ok(Number.isFinite((frame.snapshot as Frame).serverTime));
 assert.deepEqual((frame.snapshot as Frame).renderers,[]);
 socket.close();
});

test('a hello id that is not a UUID closes the socket with 4400',async()=>{
 const relay=await initializedRelay();
 const {socket,opened,recorder}=connect(relay,'control');
 assert.equal(await opened,'open');
 socket.send(JSON.stringify({type:'hello',id:'not-a-uuid'}));
 assert.equal(await recorder.closed,4400);
});

test('an unsupported message type closes the socket with 4400',async()=>{
 const relay=await initializedRelay();
 const {socket,opened,recorder}=connect(relay,'control');
 assert.equal(await opened,'open');
 hello(socket);
 socket.send(JSON.stringify({type:'command'}));
 assert.equal(await recorder.closed,4400);
});

test('a ticket is single use: the replayed jti is refused before the upgrade',async()=>{
 const relay=await initializedRelay();
 const ticket=relayTicket('control');
 const first=connect(relay,'control',ticket);
 assert.equal(await first.opened,'open');
 const replay=connect(relay,'control',ticket);
 assert.equal(await replay.opened,'refused');
 first.socket.close();
});

test('a heartbeat is answered with a pong',async()=>{
 const relay=await initializedRelay();
 const {socket,opened,recorder}=connect(relay,'control');
 assert.equal(await opened,'open');
 hello(socket);
 socket.send(JSON.stringify({type:'heartbeat'}));
 const pong=await recorder.next(frame=>frame.type==='pong');
 assert.ok(Number.isFinite(pong.serverTime));
 socket.close();
});

test('an output ack for the current revision and cue becomes presence for a control socket',async()=>{
 const relay=await initializedRelay();
 const control=connect(relay,'control');
 assert.equal(await control.opened,'open');
 const output=connect(relay,'output');
 assert.equal(await output.opened,'open');
 const id=hello(output.socket);
 output.socket.send(JSON.stringify({type:'ack',id,revision:0,cue:null,phase:'settled'}));
 const presence=await control.recorder.next(frame=>frame.type==='presence'&&(frame.renderers as Frame[]).length===1);
 assert.equal((presence.renderers as Frame[])[0].id,id);
 assert.equal((presence.renderers as Frame[])[0].phase,'settled');
 control.socket.close();output.socket.close();
});

test('an output ack for the wrong revision is not presence and earns a corrective snapshot',async()=>{
 const relay=await initializedRelay();
 const output=connect(relay,'output');
 assert.equal(await output.opened,'open');
 await output.recorder.next(frame=>frame.type==='snapshot');
 const id=hello(output.socket);
 output.socket.send(JSON.stringify({type:'ack',id,revision:99,cue:null,phase:'settled'}));
 await output.recorder.next(frame=>frame.type==='snapshot');
 assert.equal(relay.room.currentRenderers().length,0);
 output.socket.close();
});

test('a control socket cannot acknowledge',async()=>{
 const relay=await initializedRelay();
 const {socket,opened,recorder}=connect(relay,'control');
 assert.equal(await opened,'open');
 const id=hello(socket);
 socket.send(JSON.stringify({type:'ack',id,revision:0,cue:null,phase:'settled'}));
 assert.equal(await recorder.closed,4400);
});

test('an output socket that goes stale is closed with 4408',async()=>{
 let clock=Date.now();
 const relay=await initializedRelay(()=>clock);
 const output=connect(relay,'output');
 assert.equal(await output.opened,'open');
 const id=hello(output.socket);
 output.socket.send(JSON.stringify({type:'ack',id,revision:0,cue:null,phase:'settled'}));
 await output.recorder.next(frame=>frame.type==='presence'&&(frame.renderers as Frame[]).length===1);
 clock+=STALE_MS;
 assert.equal(await output.recorder.closed,4408);
});

test('commands require the bearer secret, advance revision through nextState, and are idempotent',async()=>{
 const relay=await initializedRelay();
 const denied=await request(relay,'/command',{action:'in',cue:'cue-one',commandId:randomUUID(),clientId:null,sequence:null},false);
 assert.equal(denied.status,401);
 assert.deepEqual(await denied.json(),{error:'Relay authentication required'});

 const inId=randomUUID();
 const shown=await (await request(relay,'/command',{action:'in',cue:'cue-one',commandId:inId,clientId:null,sequence:null})).json();
 assert.equal(shown.commandId,inId);
 assert.equal(shown.revision,1);
 assert.equal(shown.cue,'cue-one');
 assert.equal(shown.mode,'animate');

 const cleared=await (await request(relay,'/command',{action:'out',cue:'cue-one',commandId:randomUUID(),clientId:null,sequence:null})).json();
 assert.equal(cleared.revision,2);
 assert.equal(cleared.cue,null);

 const replayed=await (await request(relay,'/command',{action:'in',cue:'cue-one',commandId:inId,clientId:null,sequence:null})).json();
 assert.equal(replayed.commandId,inId);
 assert.equal(replayed.revision,2);
 assert.equal(replayed.cue,null);

 const conflict=await request(relay,'/command',{action:'cut',cue:null,commandId:inId,clientId:null,sequence:null});
 assert.equal(conflict.status,409);
 assert.equal((await conflict.json()).error,'Command ID already used for a different command');

 const invalid=await request(relay,'/command',{action:'in',cue:'no-such-cue',commandId:randomUUID(),clientId:null,sequence:null});
 assert.equal(invalid.status,400);
});

test('an accepted command broadcasts a snapshot to connected sockets',async()=>{
 const relay=await initializedRelay();
 const control=connect(relay,'control');
 assert.equal(await control.opened,'open');
 await control.recorder.next(frame=>frame.type==='snapshot');
 await request(relay,'/command',{action:'in',cue:'cue-two',commandId:randomUUID(),clientId:null,sequence:null});
 const frame=await control.recorder.next(item=>item.type==='snapshot');
 assert.equal((frame.snapshot as Frame).cue,'cue-two');
 assert.equal((frame.snapshot as Frame).revision,1);
 control.socket.close();
});

test('initialize seeds the catalog once and state and catalog read back over HTTP',async()=>{
 const relay=await startRelay();
 assert.equal(await (await request(relay,'/state')).json(),null);
 assert.equal(await (await request(relay,'/catalog')).json(),null);

 const created=await request(relay,'/initialize',INITIALIZE);
 assert.equal(created.status,201);
 assert.equal((await created.json()).revision,0);

 const catalog=await (await request(relay,'/catalog')).json();
 assert.equal(catalog.version,'rehearsal-v1');
 assert.deepEqual(catalog.cues,CUES);

 const state=await (await request(relay,'/state')).json();
 assert.equal(state.catalogVersion,'rehearsal-v1');
 assert.deepEqual(state.renderers,[]);

 const again=await request(relay,'/initialize',INITIALIZE);
 assert.equal(again.status,409);
 assert.equal((await again.json()).error,'Relay is already initialized');
});

test('a new approved catalog version is broadcast to connected sockets',async()=>{
 const relay=await initializedRelay();
 const control=connect(relay,'control');
 assert.equal(await control.opened,'open');
 const updated=await request(relay,'/catalog',{version:'rehearsal-v2',cues:[...CUES,{id:'cue-three',title:'Three'}]});
 assert.equal(updated.status,200);
 const frame=await control.recorder.next(item=>item.type==='catalog');
 assert.equal(frame.version,'rehearsal-v2');
 assert.equal(relay.room.state?.catalogVersion,'rehearsal-v2');
 control.socket.close();
});

// MCP plan A3: a graphic that is retired while it is on air leaves the approved catalog on the
// next sync. The relay keeps the payload it already holds, so the screen does not change; the
// operator can still take that graphic out with its own button; nobody can put it up again.
test('an on-air graphic that leaves the catalog stays on air, can be taken out, and cannot be shown again',async()=>{
 const relay=await initializedRelay();
 const shown=await (await request(relay,'/command',{action:'in',cue:'cue-two',commandId:randomUUID(),clientId:null,sequence:null})).json();
 assert.equal(shown.cue,'cue-two');
 const control=connect(relay,'control');
 assert.equal(await control.opened,'open');
 await control.recorder.next(frame=>frame.type==='snapshot');

 const synced=await request(relay,'/catalog',{version:'rehearsal-v2',cues:[CUES[0]]});
 assert.equal(synced.status,200);
 assert.equal((await control.recorder.next(frame=>frame.type==='catalog')).version,'rehearsal-v2');
 // Nothing on screen moves: same revision, same cue, same payload. A sync is not a command.
 const held=await (await request(relay,'/state')).json();
 assert.equal(held.revision,1);
 assert.equal(held.cue,'cue-two');
 assert.deepEqual(held.cuePayload,CUES[1]);
 assert.equal(held.catalogVersion,'rehearsal-v2');
 assert.equal(control.recorder.frames.some(frame=>frame.type==='snapshot'),false);

 const again=await request(relay,'/command',{action:'in',cue:'cue-two',commandId:randomUUID(),clientId:null,sequence:null});
 assert.equal(again.status,400);
 assert.equal((await again.json()).error,'Unknown cue');
 // Out for some other graphic that is not in the catalog is still refused.
 const stray=await request(relay,'/command',{action:'out',cue:'no-such-cue',commandId:randomUUID(),clientId:null,sequence:null});
 assert.equal(stray.status,400);

 const out=await request(relay,'/command',{action:'out',cue:'cue-two',commandId:randomUUID(),clientId:null,sequence:null});
 assert.equal(out.status,200);
 const taken=await out.json();
 assert.equal(taken.outcome,'applied');
 assert.equal(taken.revision,2);
 assert.equal(taken.cue,null);
 assert.equal(taken.cuePayload,null);
 const history=await (await request(relay,'/history')).json();
 assert.deepEqual(history.rows.map((row:{action:string;cueId:string|null})=>[row.action,row.cueId]),[['in','cue-two'],['out','cue-two']]);
 control.socket.close();
});

test('clear and cut still take down an on-air graphic that left the catalog',async()=>{
 for(const action of ['clear','cut']){
  const relay=await initializedRelay();
  await request(relay,'/command',{action:'in',cue:'cue-two',commandId:randomUUID(),clientId:null,sequence:null});
  assert.equal((await request(relay,'/catalog',{version:'rehearsal-v2',cues:[CUES[0]]})).status,200);
  const down=await (await request(relay,'/command',{action,cue:null,commandId:randomUUID(),clientId:null,sequence:null})).json();
  assert.equal(down.cue,null,action);
  assert.equal(down.revision,2,action);
 }
});

test('unknown routes are 404 and unauthenticated routes are 401',async()=>{
 const relay=await startRelay();
 assert.equal((await request(relay,'/nope')).status,404);
 assert.equal((await request(relay,'/state',undefined,false)).status,401);
 assert.equal((await fetch(`${relay.url}/connect`)).status,426);
});

// --- worker-parity gaps (audit F10) -----------------------------------------
// The global WebSocket cannot set Origin or expose a refused upgrade's status
// line, so these use the `ws` client, which can do both.
type Refused={status:number;body:string};
function upgradeWith(relay:RehearsalRelay,ticket:string,headers:Record<string,string>={}){
 const socket=new WsClient(`${relay.url.replace(/^http/,'ws')}/connect`,[PROTOCOL,`ticket.${ticket}`],{headers});
 const outcome=new Promise<'open'|Refused>(resolve=>{
  socket.on('open',()=>resolve('open'));
  socket.on('error',()=>{});
  socket.on('unexpected-response',(_request,response)=>{
   const chunks:Buffer[]=[];
   response.on('data',(chunk:Buffer)=>chunks.push(chunk));
   response.on('end',()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks).toString('utf8')}));
  });
 });
 return {socket,outcome};
}
const command=(overrides:Record<string,unknown>={})=>({action:'in',cue:'cue-one',commandId:randomUUID(),clientId:null,sequence:null,...overrides});

test('a replayed ticket is refused with HTTP 409 and the worker body',async()=>{
 const relay=await initializedRelay();
 const ticket=relayTicket('control');
 const first=upgradeWith(relay,ticket);
 assert.equal(await first.outcome,'open');
 const replay=upgradeWith(relay,ticket);
 const refused=await replay.outcome as Refused;
 assert.equal(refused.status,409);
 assert.deepEqual(JSON.parse(refused.body),{error:'Ticket already used'});
 first.socket.close();
});

test('a server event above the snapshot ceiling closes the socket with 4409',async()=>{
 const relay=await initializedRelay();
 const {socket,opened,recorder}=connect(relay,'control');
 assert.equal(await opened,'open');
 await recorder.next(frame=>frame.type==='snapshot');
 const [server]=[...relay.room.sockets.keys()];
 relay.room.send(server,{type:'snapshot',snapshot:{padding:'x'.repeat(MAX_SNAPSHOT_BYTES)}});
 assert.equal(await recorder.closed,4409);
 socket.close();
});

test('an oversized command body is 413 and does not consume the controller sequence',async()=>{
 const relay=await initializedRelay();
 const clientId=randomUUID();
 const oversized=await request(relay,'/command',command({clientId,sequence:1,note:'x'.repeat(MAX_MESSAGE_BYTES)}));
 assert.equal(oversized.status,413);
 assert.deepEqual(await oversized.json(),{error:'Request too large'});
 assert.equal(relay.room.sequences.has(clientId),false);
 const retried=await request(relay,'/command',command({clientId,sequence:1}));
 assert.equal(retried.status,200);
 assert.equal((await retried.json()).revision,1);
 assert.equal(relay.room.sequences.get(clientId),1);
});

test('a 413 from the snapshot size check rolls the controller sequence back like the worker transaction',()=>{
 const room=new RehearsalRoom();
 room.initialize(INITIALIZE);
 const clientId=randomUUID();
 const guard=Reflect.get(room,'ensureSnapshotSize') as (snapshot:unknown)=>void;
 Reflect.set(room,'ensureSnapshotSize',()=>{throw new HttpError(413,'Snapshot too large')});
 assert.throws(()=>room.command(command({clientId,sequence:7})),(error:unknown)=>error instanceof HttpError&&error.status===413&&error.message==='Snapshot too large');
 Reflect.set(room,'ensureSnapshotSize',guard);
 assert.equal(room.sequences.has(clientId),false);
 assert.equal(room.state?.revision,0);
 const [accepted]=room.command(command({clientId,sequence:7})) as [Frame,number];
 assert.equal(accepted.revision,1);
 assert.equal(room.sequences.get(clientId),7);
});

test('a stale controller sequence is ignored: 200, commandId echoed, state unchanged',async()=>{
 const relay=await initializedRelay();
 const clientId=randomUUID();
 assert.equal((await (await request(relay,'/command',command({clientId,sequence:5}))).json()).revision,1);
 for(const sequence of [3,5]){
  const staleId=randomUUID();
  const stale=await request(relay,'/command',command({cue:'cue-two',commandId:staleId,clientId,sequence}));
  assert.equal(stale.status,200);
  const body=await stale.json();
  assert.equal(body.commandId,staleId);
  assert.equal(body.revision,1);
  assert.equal(body.cue,'cue-one');
 }
 assert.equal(relay.room.sequences.get(clientId),5);
 assert.equal((await (await request(relay,'/command',command({cue:'cue-two',clientId,sequence:6}))).json()).revision,2);
});

test('HTTP POST /ack with the bearer secret registers a renderer',async()=>{
 const relay=await initializedRelay();
 const id=randomUUID();
 const acked=await request(relay,'/ack',{id,revision:0,cue:null,phase:'settled'});
 assert.equal(acked.status,200);
 assert.deepEqual(await acked.json(),{ok:true});
 const state=await (await request(relay,'/state')).json();
 assert.equal(state.renderers.length,1);
 assert.equal(state.renderers[0].id,id);
 assert.equal(state.renderers[0].phase,'settled');
 const mismatched=await request(relay,'/ack',{id:randomUUID(),revision:9,cue:null,phase:'settled'});
 assert.equal(mismatched.status,409);
 assert.deepEqual(await mismatched.json(),{error:'Acknowledgment does not match current state'});
});

test('the upgrade Origin policy admits local origins and no Origin, and refuses others with 403',async()=>{
 const relay=await initializedRelay();
 const local=upgradeWith(relay,relayTicket('control'),{Origin:'http://localhost:5175'});
 assert.equal(await local.outcome,'open');
 const absent=upgradeWith(relay,relayTicket('control'));
 assert.equal(await absent.outcome,'open');
 const foreign=upgradeWith(relay,relayTicket('control'),{Origin:'https://evil.example'});
 const refused=await foreign.outcome as Refused;
 assert.equal(refused.status,403);
 assert.deepEqual(JSON.parse(refused.body),{error:'Origin not allowed'});
 local.socket.close();absent.socket.close();
});

test('the presence sweep stays silent while the renderer set is unchanged',async()=>{
 const relay=await initializedRelay();
 const {socket,opened,recorder}=connect(relay,'control');
 assert.equal(await opened,'open');
 await recorder.next(frame=>frame.type==='snapshot');
 await recorder.next(frame=>frame.type==='presence');
 await new Promise(resolve=>setTimeout(resolve,700));
 assert.deepEqual(recorder.frames.filter(frame=>frame.type==='presence'),[]);
 socket.close();
});

// --- R5 controller presence ---------------------------------------------------
// The stub must speak the same D8 contract as the worker: hello carries an optional
// client and version, presence and /state carry a controllers array, and a controller
// expires on the same inclusive 30 s deadline as a renderer.

const controlHello=(socket:WebSocket,client:string,version:string,id=randomUUID())=>{socket.send(JSON.stringify({type:'hello',id,client,version}));return id};

test('a controller that names its client and version appears in presence and in /state',async()=>{
 const relay=await initializedRelay();
 const watcher=connect(relay,'control');
 assert.equal(await watcher.opened,'open');
 hello(watcher.socket);
 const companion=connect(relay,'control');
 assert.equal(await companion.opened,'open');
 const id=controlHello(companion.socket,'companion','1.4.0');
 const presence=await watcher.recorder.next(frame=>frame.type==='presence'&&(frame.controllers as Frame[]).some(entry=>entry.id===id));
 assert.deepEqual(Object.keys(presence).sort(),['controllers','renderers','serverTime','type']);
 const entry=(presence.controllers as Frame[]).find(candidate=>candidate.id===id)!;
 assert.deepEqual(Object.keys(entry).sort(),['client','id','seen','version']);
 assert.equal(entry.client,'companion');
 assert.equal(entry.version,'1.4.0');
 assert.ok(Number.isFinite(entry.seen));

 const state=await (await request(relay,'/state')).json();
 assert.equal((state.controllers as Frame[]).length,2);
 assert.equal((state.controllers as Frame[]).filter(candidate=>candidate.id===id).length,1);
 watcher.socket.close();companion.socket.close();
});

test('a 1.3.0 hello without client or version still connects and reports an unknown controller',async()=>{
 const relay=await initializedRelay();
 const watcher=connect(relay,'control');
 assert.equal(await watcher.opened,'open');
 hello(watcher.socket);
 const legacy=connect(relay,'control');
 assert.equal(await legacy.opened,'open');
 const id=hello(legacy.socket);
 const presence=await watcher.recorder.next(frame=>frame.type==='presence'&&(frame.controllers as Frame[]).some(entry=>entry.id===id));
 const entry=(presence.controllers as Frame[]).find(candidate=>candidate.id===id)!;
 assert.equal(entry.client,'unknown');
 assert.equal(entry.version,null);
 watcher.socket.close();legacy.socket.close();
});

test('a malformed hello version is reported as null rather than closing the socket',async()=>{
 const relay=await initializedRelay();
 const watcher=connect(relay,'control');
 assert.equal(await watcher.opened,'open');
 hello(watcher.socket);
 const companion=connect(relay,'control');
 assert.equal(await companion.opened,'open');
 const id=controlHello(companion.socket,'companion','1.4.0-beta');
 const presence=await watcher.recorder.next(frame=>frame.type==='presence'&&(frame.controllers as Frame[]).some(entry=>entry.id===id));
 assert.equal((presence.controllers as Frame[]).find(candidate=>candidate.id===id)!.version,null);
 companion.socket.send(JSON.stringify({type:'heartbeat'}));
 assert.equal((await companion.recorder.next(frame=>frame.type==='pong')).type,'pong');
 watcher.socket.close();companion.socket.close();
});

test('a controller that goes stale is closed with 4408 at exactly the stale deadline and leaves presence',async()=>{
 let clock=Date.now();
 const relay=await initializedRelay(()=>clock);
 const watcher=connect(relay,'control');
 assert.equal(await watcher.opened,'open');
 const companion=connect(relay,'control');
 assert.equal(await companion.opened,'open');
 const id=controlHello(companion.socket,'companion','1.4.0');
 await watcher.recorder.next(frame=>frame.type==='presence'&&(frame.controllers as Frame[]).some(entry=>entry.id===id));
 clock+=STALE_MS-1;
 assert.equal(relay.room.currentControllers().some(entry=>entry.id===id),true);
 // Every heartbeat keeps the watcher alive; only the silent companion crosses the deadline.
 watcher.socket.send(JSON.stringify({type:'heartbeat'}));
 clock+=1;
 assert.equal(await companion.recorder.closed,4408);
 assert.equal(relay.room.currentControllers().some(entry=>entry.id===id),false);
 watcher.socket.close();
});

test('a full controller set stays inside MAX_SNAPSHOT_BYTES',async()=>{
 const relay=await initializedRelay();
 const controllers=[];
 for(let index=0;index<MAX_CONTROLLERS+4;index++){
  const client=connect(relay,'control');
  assert.equal(await client.opened,'open');
  controlHello(client.socket,'companion','1.4.0');
  controllers.push(client);
 }
 const state=await (await request(relay,'/state')).json();
 assert.equal((state.controllers as Frame[]).length,MAX_CONTROLLERS);
 assert.ok(Buffer.byteLength(JSON.stringify(state))<MAX_SNAPSHOT_BYTES);
 for(const client of controllers)client.socket.close();
});

// A 1.3.0-shaped client is one that omits `client`/`version` from hello and knows
// nothing about `controllers`. Both shipped parsers allowlist fields, so the new array
// must be ignored rather than rejected -- asserted against the real validators
// (`isSnapshot` inside BrowserRealtimeTransport, `parseSnapshot` inside
// RealtimeSubscription), never a copy of them.

class LegacyBrowserSocket{
 readyState=0;onopen:((event:Event)=>void)|null=null;onmessage:((event:MessageEvent<unknown>)=>void)|null=null;onclose:((event:Event)=>void)|null=null;onerror:((event:Event)=>void)|null=null;
 readonly sent:string[]=[];
 constructor(readonly url:string,readonly protocols:string[]){}
 open(){this.readyState=1;this.onopen?.(new Event('open'))}
 receive(frame:unknown){this.onmessage?.(new MessageEvent('message',{data:JSON.stringify(frame)}))}
 send(data:string){this.sent.push(data)}
 close(){this.readyState=3;this.onclose?.(new Event('close'))}
}

class LegacyCompanionSocket{
 readyState=1;protocol='crc-overlays-v1';
 readonly sent:string[]=[];
 readonly listeners=new Map<string,Array<(event:Event|MessageEvent)=>void>>();
 constructor(readonly url:string,readonly protocols:string[]){}
 addEventListener(type:'open'|'close'|'error'|'message',listener:(event:Event|MessageEvent)=>void){
  this.listeners.set(type,[...(this.listeners.get(type)??[]),listener]);
 }
 emit(type:string,event:Event|MessageEvent){for(const listener of this.listeners.get(type)??[])listener(event)}
 open(){this.emit('open',new Event('open'))}
 receive(frame:unknown){this.emit('message',new MessageEvent('message',{data:JSON.stringify(frame)}))}
 send(data:string){this.sent.push(data)}
 close(){this.readyState=3}
}

test('the shipped clients accept controllers in snapshot and presence, and Companion names itself in its hello',async()=>{
 const relay=await initializedRelay();

 // 1. The relay accepts the 1.3.0 hello and still reports the controller.
 const legacy=connect(relay,'control');
 assert.equal(await legacy.opened,'open');
 const snapshotFrame=await legacy.recorder.next(frame=>frame.type==='snapshot');
 const id=hello(legacy.socket);
 const presence=await legacy.recorder.next(frame=>frame.type==='presence'&&(frame.controllers as Frame[]).some(entry=>entry.id===id));
 assert.ok(Array.isArray(presence.controllers));

 // 2. The real snapshot the relay emits, now carrying `controllers`.
 const live=await (await request(relay,'/state')).json() as Record<string,unknown>;
 assert.ok(Object.hasOwn(live,'controllers'));
 assert.ok(Object.hasOwn(snapshotFrame.snapshot as Record<string,unknown>,'controllers'));

 // 3. The real `isSnapshot` in lib/browser-realtime.ts must accept it.
 const browserSockets:LegacyBrowserSocket[]=[];
 const browserSnapshots:RealtimeSnapshot[]=[];
 const transport=new BrowserRealtimeTransport({
  key:'secret',role:'control',id:randomUUID(),
  onSnapshot:value=>{browserSnapshots.push(value)},
  dependencies:{
   fetch:async()=>Response.json({url:'wss://relay.example/connect',ticket:'signed.ticket',heartbeatMs:10000,staleMs:30000,protocol:1}),
   socket:(url,protocols)=>{const socket=new LegacyBrowserSocket(url,protocols);browserSockets.push(socket);return socket},
  },
 });
 transport.start();
 await new Promise(resolve=>setTimeout(resolve,0));
 browserSockets[0].open();
 browserSockets[0].receive({type:'snapshot',snapshot:live});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(browserSnapshots.length,1,'the shipped isSnapshot rejected the controllers field');
 assert.equal(browserSnapshots[0].revision,live.revision);
 transport.stop();

 // 4. The real `parseSnapshot` in companion/src/client.ts must accept it and drop it.
 const companionSockets:LegacyCompanionSocket[]=[];
 const companionSnapshots:OverlaySnapshot[]=[];
 const client=new OverlayClient({
  baseUrl:'http://overlays.invalid',credential:'secret',clientId:randomUUID(),
  fetch:(async()=>Response.json({url:'ws://localhost:8788/connect',ticket:'signed.ticket',heartbeatMs:10000,staleMs:30000,protocol:1})) as typeof globalThis.fetch,
  webSocketFactory:(url,protocols)=>{const socket=new LegacyCompanionSocket(url,protocols);companionSockets.push(socket);return socket},
 });
 const subscription=client.subscribe({
  onSnapshot:snapshot=>{companionSnapshots.push(snapshot)},
  onPresence:()=>{},onCatalog:()=>{},onConnection:()=>{},
 });
 subscription.start();
 await new Promise(resolve=>setTimeout(resolve,0));
 companionSockets[0].open();
 companionSockets[0].receive({type:'snapshot',snapshot:live});
 assert.equal(companionSnapshots.length,1,'the shipped parseSnapshot rejected the controllers field');
 assert.equal(companionSnapshots[0].revision,live.revision);
 assert.equal(Object.hasOwn(companionSnapshots[0],'controllers'),false);
 // The 1.4.0 hello names the client; the version is the packaged one or null, never a guess.
 const sentHello=JSON.parse(companionSockets[0].sent[0]) as Record<string,unknown>;
 assert.deepEqual(Object.keys(sentHello).sort(),['client','id','type','version']);
 assert.equal(sentHello.client,'companion');
 assert.ok(sentHello.version===null||/^d+.d+.d+$/.test(String(sentHello.version)),'version is null or x.y.z');
 // A presence frame carrying controllers is also tolerated, and does not close the socket.
 companionSockets[0].receive({type:'presence',renderers:[],controllers:live.controllers,serverTime:Date.now()});
 assert.equal(companionSockets[0].readyState,1);
 subscription.stop();
 legacy.socket.close();
});

// --- the scan card ("bug") in live state -------------------------------------------
// D1/D2: one optional field on LiveState and one new command action. The stub imports
// parseCommand/nextState from relay/src/protocol.ts, so what these assert about the
// rehearsal relay is true of the worker by construction.

const bugCommand=(bug:{on:boolean;page:string|null}|null,overrides:Record<string,unknown>={})=>({action:'bug',cue:null,bug,commandId:randomUUID(),clientId:null,sequence:null,...overrides});

test('a bug command sets the scan card, bumps the revision and leaves the live cue alone',async()=>{
 const relay=await initializedRelay();
 const shown=await (await request(relay,'/command',{action:'in',cue:'cue-one',commandId:randomUUID(),clientId:null,sequence:null})).json();
 assert.equal(shown.revision,1);
 const carded=await (await request(relay,'/command',bugCommand({on:true,page:'128'}))).json();
 assert.deepEqual(carded.bug,{on:true,page:'128'});
 assert.equal(carded.revision,2,'the scan card bumps the revision so reconnecting clients converge');
 assert.equal(carded.cue,'cue-one');
 assert.equal(carded.mode,'animate');
 assert.deepEqual(carded.cuePayload,CUES[0]);
});

test('in, out and clear preserve a set scan card; cut removes it',async()=>{
 const relay=await initializedRelay();
 await request(relay,'/command',bugCommand({on:true,page:'128'}));
 for(const body of [
  {action:'in',cue:'cue-one',commandId:randomUUID(),clientId:null,sequence:null},
  {action:'out',cue:'cue-one',commandId:randomUUID(),clientId:null,sequence:null},
  {action:'in',cue:'cue-two',commandId:randomUUID(),clientId:null,sequence:null},
  {action:'clear',cue:null,commandId:randomUUID(),clientId:null,sequence:null},
 ]){
  const snapshot=await (await request(relay,'/command',body)).json();
  assert.deepEqual(snapshot.bug,{on:true,page:'128'},`${body.action} dropped the scan card`);
 }
 // F1: Clear now removes every layer, the scan card included.
 const cut=await (await request(relay,'/command',{action:'cut',cue:null,commandId:randomUUID(),clientId:null,sequence:null})).json();
 assert.equal(Object.hasOwn(cut,'bug'),false,'cut left a bug field behind');
 assert.equal(cut.cue,null);
 assert.equal(cut.mode,'cut');
});

test('turning the scan card off deletes the field rather than storing an off',async()=>{
 const relay=await initializedRelay();
 await request(relay,'/command',bugCommand({on:true,page:'p. 128'}));
 const off=await (await request(relay,'/command',bugCommand({on:false,page:null}))).json();
 assert.equal(Object.hasOwn(off,'bug'),false);
 const state=await (await request(relay,'/state')).json() as Record<string,unknown>;
 assert.equal(Object.hasOwn(state,'bug'),false);
 assert.equal(JSON.stringify(state).includes('"bug"'),false);
});

test('a scan card survives a reconnect: the authoritative state hands it to a fresh socket',async()=>{
 const relay=await initializedRelay();
 const first=connect(relay,'control');
 assert.equal(await first.opened,'open');
 await first.recorder.next(frame=>frame.type==='snapshot');
 await request(relay,'/command',bugCommand({on:true,page:'128'}));
 const broadcast=await first.recorder.next(frame=>frame.type==='snapshot');
 assert.deepEqual((broadcast.snapshot as Frame).bug,{on:true,page:'128'},'the card did not reach a connected socket');
 first.socket.close();

 const reconnected=connect(relay,'control');
 assert.equal(await reconnected.opened,'open');
 const restored=await reconnected.recorder.next(frame=>frame.type==='snapshot');
 assert.deepEqual((restored.snapshot as Frame).bug,{on:true,page:'128'},'the card was forgotten across a reconnect');
 reconnected.socket.close();

 // ...and once cut has removed it, a reconnect does not resurrect it.
 await request(relay,'/command',{action:'cut',cue:null,commandId:randomUUID(),clientId:null,sequence:null});
 const after=connect(relay,'control');
 assert.equal(await after.opened,'open');
 const clean=await after.recorder.next(frame=>frame.type==='snapshot');
 assert.equal(Object.hasOwn(clean.snapshot as Frame,'bug'),false);
 after.socket.close();
});

test('a page that fails validBugPage is a 400 Invalid command, never a socket close',async()=>{
 const relay=await initializedRelay();
 const watcher=connect(relay,'control');
 assert.equal(await watcher.opened,'open');
 await watcher.recorder.next(frame=>frame.type==='snapshot');
 for(const bug of [{on:true,page:'1234567890123'},{on:true,page:''},{on:true,page:'<script>'},{on:true,page:'p/128'},{on:true,page:'x'.repeat(200)},{on:'yes',page:'128'},{page:'128'}] as unknown[]){
  const refused=await request(relay,'/command',bugCommand(bug as {on:boolean;page:string|null}));
  assert.equal(refused.status,400);
  assert.deepEqual(await refused.json(),{error:'Invalid command'});
 }
 // A page big enough to breach the 4096-byte message cap is the existing 413, not a close.
 const oversized=await request(relay,'/command',bugCommand({on:true,page:'x'.repeat(MAX_MESSAGE_BYTES)}));
 assert.equal(oversized.status,413);
 // A bug attached to any other action is refused the same way.
 assert.equal((await request(relay,'/command',{action:'cut',cue:null,bug:{on:true,page:'128'},commandId:randomUUID(),clientId:null,sequence:null})).status,400);
 // A bug command with a selected cue is refused rather than half-applied.
 assert.equal((await request(relay,'/command',bugCommand({on:true,page:'128'},{cue:'cue-one'}))).status,400);
 // Nothing moved, and the watching socket is still open.
 const state=await (await request(relay,'/state')).json() as Record<string,unknown>;
 assert.equal(state.revision,0);
 assert.equal(Object.hasOwn(state,'bug'),false);
 assert.equal(watcher.socket.readyState,WebSocket.OPEN);
 watcher.socket.close();
});

test('the scan card rides the same receipt and sequence guard as every other action',async()=>{
 const relay=await initializedRelay();
 const clientId='client_12345678';
 const id=randomUUID();
 const first=await (await request(relay,'/command',bugCommand({on:true,page:'128'},{commandId:id,clientId,sequence:1}))).json();
 assert.equal(first.revision,1);
 // Replaying the same commandId is idempotent, not a second revision.
 const replay=await (await request(relay,'/command',bugCommand({on:true,page:'128'},{commandId:id,clientId,sequence:1}))).json();
 assert.equal(replay.revision,1);
 // A stale sequence from the same controller is recorded but not applied.
 const stale=await (await request(relay,'/command',bugCommand({on:false,page:null},{clientId,sequence:0}))).json();
 assert.deepEqual(stale.bug,{on:true,page:'128'});
 const fresh=await (await request(relay,'/command',bugCommand({on:false,page:null},{clientId,sequence:2}))).json();
 assert.equal(Object.hasOwn(fresh,'bug'),false);
});

test('a state row without a bug deserializes as no scan card, and one with a card round-trips',()=>{
 const room=new RehearsalRoom(()=>1_700_000_000_000);
 const [initialized]=room.initialize(INITIALIZE);
 assert.equal(Object.hasOwn(initialized as Record<string,unknown>,'bug'),false);
 assert.equal(Object.hasOwn(room.state as Record<string,unknown>,'bug'),false);
 // An /initialize that carries a card keeps it; one that carries an off keeps the field absent.
 const carded=new RehearsalRoom(()=>1_700_000_000_000);
 carded.initialize({...INITIALIZE,state:{...INITIALIZE.state,bug:{on:true,page:'128'}}});
 assert.deepEqual(carded.state?.bug,{on:true,page:'128'});
 const off=new RehearsalRoom(()=>1_700_000_000_000);
 off.initialize({...INITIALIZE,state:{...INITIALIZE.state,bug:{on:false,page:null}}});
 assert.equal(Object.hasOwn(off.state as Record<string,unknown>,'bug'),false);
 // A malformed card is refused at the door rather than silently dropped.
 const bad=new RehearsalRoom(()=>1_700_000_000_000);
 assert.throws(()=>bad.initialize({...INITIALIZE,state:{...INITIALIZE.state,bug:{on:true,page:'1234567890123'}}}),(error:unknown)=>error instanceof HttpError&&error.status===400);
});

// The 1.4.0 contract under the new field: a client that knows nothing about `bug` must
// still complete a handshake against a snapshot that carries one. Asserted against the
// REAL validators -- `isSnapshot` in lib/browser-realtime.ts and `parseSnapshot` in
// companion/src/client.ts -- never a copy. This deliberately does NOT assert whether the
// field survives parsing: today both allowlists drop it, and once WP2 and WP3 admit it
// both will keep it. Either way the handshake completes and the snapshot is accepted.
test('a client that ignores the scan card still completes a handshake against a snapshot carrying one',async()=>{
 const relay=await initializedRelay();
 await request(relay,'/command',{action:'in',cue:'cue-one',commandId:randomUUID(),clientId:null,sequence:null});
 await request(relay,'/command',bugCommand({on:true,page:'128'}));
 const live=await (await request(relay,'/state')).json() as Record<string,unknown>;
 assert.deepEqual(live.bug,{on:true,page:'128'},'the relay did not put a scan card in the snapshot under test');

 const browserSockets:LegacyBrowserSocket[]=[];
 const browserSnapshots:RealtimeSnapshot[]=[];
 const transport=new BrowserRealtimeTransport({
  key:'secret',role:'control',id:randomUUID(),
  onSnapshot:value=>{browserSnapshots.push(value)},
  dependencies:{
   fetch:async()=>Response.json({url:'wss://relay.example/connect',ticket:'signed.ticket',heartbeatMs:10000,staleMs:30000,protocol:1}),
   socket:(url,protocols)=>{const socket=new LegacyBrowserSocket(url,protocols);browserSockets.push(socket);return socket},
  },
 });
 transport.start();
 await new Promise(resolve=>setTimeout(resolve,0));
 browserSockets[0].open();
 browserSockets[0].receive({type:'snapshot',snapshot:live});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(browserSnapshots.length,1,'the shipped isSnapshot rejected a snapshot carrying a bug field');
 assert.equal(browserSnapshots[0].revision,live.revision);
 assert.equal(browserSnapshots[0].cue,live.cue);
 transport.stop();

 const companionSockets:LegacyCompanionSocket[]=[];
 const companionSnapshots:OverlaySnapshot[]=[];
 const client=new OverlayClient({
  baseUrl:'http://overlays.invalid',credential:'secret',clientId:randomUUID(),
  fetch:(async()=>Response.json({url:'ws://localhost:8788/connect',ticket:'signed.ticket',heartbeatMs:10000,staleMs:30000,protocol:1})) as typeof globalThis.fetch,
  webSocketFactory:(url,protocols)=>{const socket=new LegacyCompanionSocket(url,protocols);companionSockets.push(socket);return socket},
 });
 const subscription=client.subscribe({
  onSnapshot:snapshot=>{companionSnapshots.push(snapshot)},
  onPresence:()=>{},onCatalog:()=>{},onConnection:()=>{},
 });
 subscription.start();
 await new Promise(resolve=>setTimeout(resolve,0));
 companionSockets[0].open();
 companionSockets[0].receive({type:'snapshot',snapshot:live});
 assert.equal(companionSnapshots.length,1,'the shipped parseSnapshot rejected a snapshot carrying a bug field');
 assert.equal(companionSnapshots[0].revision,live.revision);
 assert.equal(companionSnapshots[0].cue,live.cue);
 assert.equal(companionSockets[0].readyState,1,'a snapshot carrying a bug field closed the socket');
 subscription.stop();
});

// --- MCP plan V1: outcome, commandId on the cue log, preconditions, press time per class --------

test('every command answer names its outcome: applied, replayed (with the original), superseded',async()=>{
 const relay=await initializedRelay();
 const clientId=randomUUID();
 const first=command({clientId,sequence:5});
 const applied=await (await request(relay,'/command',first)).json();
 assert.equal(applied.outcome,'applied');
 assert.equal(applied.revision,1);
 assert.equal('originalOutcome' in applied,false);
 const replayed=await (await request(relay,'/command',first)).json();
 assert.equal(replayed.outcome,'replayed');
 assert.equal(replayed.originalOutcome,'applied');
 assert.equal(replayed.revision,1);
 const stale=command({cue:'cue-two',clientId,sequence:4});
 const superseded=await (await request(relay,'/command',stale)).json();
 assert.equal(superseded.outcome,'superseded');
 assert.equal(superseded.revision,1);
 assert.equal(superseded.cue,'cue-one');
 const retried=await (await request(relay,'/command',stale)).json();
 assert.equal(retried.outcome,'replayed');
 assert.equal(retried.originalOutcome,'superseded');
 // Only the applied command reached the cue log, and it carries the caller's commandId.
 assert.deepEqual(relay.room.history.map(row=>row.commandId),[first.commandId]);
});

test('a command without the V1 fields gets the same body as before plus outcome and lastPress',async()=>{
 const relay=await initializedRelay();
 const body=await (await request(relay,'/command',command())).json();
 assert.deepEqual(Object.keys(body).sort(),['catalogVersion','commandId','controllers','cue','cuePayload','lastPress','mode','outcome','renderers','revision','serverTime','updated']);
 assert.equal(body.outcome,'applied');
});

test('ifRevision refuses in words with 409 and writes nothing; the same commandId applies once it holds',async()=>{
 const relay=await initializedRelay();
 const clientId=randomUUID();
 const guarded=command({clientId,sequence:1,ifRevision:3});
 const refused=await request(relay,'/command',guarded);
 assert.equal(refused.status,409);
 assert.deepEqual(await refused.json(),{error:'Live state has moved on: it is at revision 0, not 3. Nothing was changed; read the live state and decide again.',commandId:guarded.commandId,precondition:'ifRevision',revision:0,cue:null});
 assert.equal(relay.room.state?.revision,0);
 assert.equal(relay.room.receipts.has(guarded.commandId),false);
 assert.equal(relay.room.sequences.has(clientId),false);
 assert.equal(relay.room.history.length,0);
 assert.deepEqual(relay.room.lastPress(),{control:null,companion:null,mcp:null});
 const held=await (await request(relay,'/command',{...guarded,ifRevision:0})).json();
 assert.equal(held.outcome,'applied');
 assert.equal(held.revision,1);
 // A retry of the command that moved the state replays; it is not refused by its own precondition.
 const retried=await request(relay,'/command',{...guarded,ifRevision:0});
 assert.equal(retried.status,200);
 assert.equal((await retried.json()).outcome,'replayed');
});

test('ifCue holds only while that graphic, or nothing for null, is pinned',async()=>{
 const relay=await initializedRelay();
 const wrong=await request(relay,'/command',command({ifCue:'cue-two'}));
 assert.equal(wrong.status,409);
 assert.equal((await wrong.json()).precondition,'ifCue');
 assert.equal((await (await request(relay,'/command',command({ifCue:null}))).json()).outcome,'applied');
 const out=await request(relay,'/command',command({action:'out',cue:'cue-one',ifCue:'cue-one',ifRevision:1}));
 assert.equal((await out.json()).outcome,'applied');
 const malformed=await request(relay,'/command',command({ifRevision:'1'}));
 assert.equal(malformed.status,400);
 assert.deepEqual(await malformed.json(),{error:'Invalid command'});
});

test('press time per controller class is on /state and /command, never in a socket frame',async()=>{
 // Starts at wall time because the socket ticket is minted from the real clock.
 let clock=Date.now();
 const relay=await initializedRelay(()=>clock);
 const {socket,recorder:listener,opened}=connect(relay,'control');
 assert.equal(await opened,'open');
 await listener.next(frame=>frame.type==='snapshot');
 assert.deepEqual((await (await request(relay,'/state')).json()).lastPress,{control:null,companion:null,mcp:null});
 const clientId=randomUUID();
 const deck=await (await request(relay,'/command',command({source:'companion',clientId,sequence:2}))).json();
 assert.deepEqual(deck.lastPress,{control:null,companion:clock,mcp:null});
 const broadcast=await listener.next(frame=>frame.type==='snapshot');
 assert.equal('lastPress' in (broadcast.snapshot as Frame),false);
 clock+=1000;
 // A superseded press is still a press; a replay of it is not.
 const stale=command({source:'companion',clientId,sequence:1});
 await request(relay,'/command',stale);
 clock+=1000;
 await request(relay,'/command',stale);
 await request(relay,'/command',command({source:'mcp'}));
 const state=await (await request(relay,'/state')).json();
 assert.deepEqual(state.lastPress,{control:null,companion:clock-1000,mcp:clock});
 socket.close();
});
