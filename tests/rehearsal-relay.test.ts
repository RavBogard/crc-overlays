import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WebSocket as WsClient} from 'ws';
import {MAX_MESSAGE_BYTES,MAX_SNAPSHOT_BYTES,PROTOCOL,STALE_MS} from '../relay/src/protocol.ts';
import {HttpError,RehearsalRoom,startRehearsalRelay,type RehearsalRelay} from '../scripts/rehearsal-relay.ts';
import {relayTicket,type RelayRole} from '../lib/relay.ts';

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
