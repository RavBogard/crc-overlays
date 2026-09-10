import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserRealtimeTransport,CatalogRefreshCoordinator,type RealtimeDependencies,type RealtimeSnapshot} from '../lib/browser-realtime.ts';

class FakeSocket{
 readyState=0;onopen:((event:any)=>void)|null=null;onmessage:((event:{data:unknown})=>void)|null=null;onclose:((event:any)=>void)|null=null;onerror:((event:any)=>void)|null=null;sent:string[]=[];
 readonly url:string;readonly protocols:string[];
 constructor(url:string,protocols:string[]){this.url=url;this.protocols=protocols}
 open(){this.readyState=1;this.onopen?.({})}
 receive(message:unknown){this.onmessage?.({data:JSON.stringify(message)})}
 close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.({})}
 send(data:string){this.sent.push(data)}
}

const snapshot=(revision:number,serverTime=revision):RealtimeSnapshot=>({revision,cue:revision?`cue-${revision}`:null,mode:'animate',updated:serverTime,cuePayload:revision?{id:`cue-${revision}`,texts:{}}:null,catalogVersion:'catalog-a',renderers:[],serverTime});
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('catalog refresh serializes fetches and retains a newer marker received in flight',async()=>{
 let version='old';const resolvers:Array<(value:{version:string})=>void>=[];const applied:string[]=[];
 const refresh=new CatalogRefreshCoordinator({getVersion:()=>version,load:()=>new Promise<{version:string}>(resolve=>resolvers.push(resolve)),apply:value=>{version=value.version;applied.push(value.version)}});
 const first=refresh.request('marker-a');refresh.request('marker-b');assert.equal(resolvers.length,1);resolvers[0]({version:'marker-a'});await settle();assert.equal(resolvers.length,2);resolvers[1]({version:'marker-b'});await first;
 assert.deepEqual(applied,['marker-a','marker-b']);
});

test('catalog refresh does not loop when the published marker lags the fetched catalog',async()=>{
 let version='old',loads=0;const refresh=new CatalogRefreshCoordinator({getVersion:()=>version,load:async()=>{loads++;return {version:'already-newer'}},apply:value=>{version=value.version}});
 await refresh.request('lagging-marker');await settle();assert.equal(loads,1);assert.equal(version,'already-newer');
});

function harness(role:'control'|'output'|'preview'='control'){
 const sockets:FakeSocket[]=[];const urls:string[]=[];const timeouts=new Map<number,()=>void>();const intervals=new Map<number,()=>void>();let timerId=0;let now=100;
 const dependencies:Partial<RealtimeDependencies>={
  fetch:async(input:any)=>{urls.push(String(input));return Response.json({url:'wss://relay.example/connect',ticket:'signed.ticket',heartbeatMs:10000,staleMs:30000,protocol:1})},
  socket:(url,protocols)=>{const socket=new FakeSocket(url,protocols);sockets.push(socket);return socket},
  setTimeout:(callback)=>{const id=++timerId;timeouts.set(id,callback);return id as any},clearTimeout:(id)=>{timeouts.delete(id as any)},
  setInterval:(callback)=>{const id=++timerId;intervals.set(id,callback);return id as any},clearInterval:(id)=>{intervals.delete(id as any)},
  now:()=>now,random:()=>0.5,
 };
 const snapshots:RealtimeSnapshot[]=[];const statuses:string[]=[];const presence:any[]=[];
 const transport=new BrowserRealtimeTransport({key:'secret',role,id:'00000000-0000-4000-8000-000000000000',getAck:()=>({id:'00000000-0000-4000-8000-000000000000',revision:4,cue:'cue-4',phase:'settled'}),onSnapshot:value=>{snapshots.push(value)},onPresence:(renderers,serverTime)=>{presence.push({renderers,serverTime})},onStatus:status=>statuses.push(status),dependencies});
 return {transport,sockets,urls,timeouts,intervals,snapshots,statuses,presence,setNow:(value:number)=>{now=value}};
}

test('connects with a short ticket and becomes live only after the initial snapshot',async()=>{
 const h=harness();h.transport.start();await settle();
 assert.deepEqual(h.urls,['/api/realtime?role=control']);
 assert.deepEqual(h.sockets[0].protocols,['crc-overlays-v1','ticket.signed.ticket']);
 h.sockets[0].open();assert.deepEqual(JSON.parse(h.sockets[0].sent[0]),{type:'hello',id:'00000000-0000-4000-8000-000000000000'});assert.equal(h.statuses.includes('live'),false);
 h.sockets[0].receive({type:'snapshot',snapshot:snapshot(2)});await settle();
 assert.deepEqual(h.snapshots.map(value=>value.revision),[2]);assert.equal(h.statuses.at(-1),'live');h.transport.stop();
});

test('rejects old snapshots while accepting newer revisions and current presence',async()=>{
 const h=harness();h.transport.start();await settle();h.sockets[0].open();
 h.sockets[0].receive({type:'snapshot',snapshot:snapshot(5,50)});h.sockets[0].receive({type:'snapshot',snapshot:snapshot(4,60)});h.sockets[0].receive({type:'snapshot',snapshot:snapshot(6,70)});h.sockets[0].receive({type:'presence',renderers:[{id:'out',revision:6,cue:'cue-6',phase:'settled'}],serverTime:80});await settle();
 assert.deepEqual(h.snapshots.map(value=>value.revision),[5,6]);assert.equal(h.presence.length,1);h.transport.stop();
});

test('output sends changed-state acknowledgments and heartbeat acknowledgments without HTTP polling',async()=>{
 const h=harness('output');h.transport.start();await settle();h.sockets[0].open();assert.equal(h.transport.sendAck({id:'out',revision:0,cue:null,phase:'empty'}),false);h.sockets[0].receive({type:'snapshot',snapshot:snapshot(4)});await settle();
 assert.equal(h.transport.sendAck({id:'out',revision:4,cue:'cue-4',phase:'settled'}),true);
 const heartbeat=[...h.intervals.values()][0];heartbeat();
 assert.deepEqual(h.sockets[0].sent.slice(-2).map(value=>JSON.parse(value)),[
  {type:'ack',id:'out',revision:4,cue:'cue-4',phase:'settled'},
  {type:'heartbeat',ack:{id:'00000000-0000-4000-8000-000000000000',revision:4,cue:'cue-4',phase:'settled'}},
 ]);
 assert.equal(h.urls.some(url=>url.includes('/api/state')||url.includes('/api/ack')),false);h.transport.stop();
});

test('preview heartbeats never contain a renderer acknowledgment',async()=>{
 const h=harness('preview');h.transport.start();await settle();h.sockets[0].open();
 assert.equal(h.transport.sendAck({id:'preview',revision:1,cue:null,phase:'empty'}),false);[...h.intervals.values()][0]();
 assert.deepEqual(JSON.parse(h.sockets[0].sent.at(-1)!),{type:'heartbeat'});h.transport.stop();
});

test('a socket that never opens is closed by the initial snapshot deadline',async()=>{
 const h=harness();h.transport.start();await settle();
 [...h.timeouts.values()][0]();
 assert.equal(h.sockets[0].readyState,3);assert.equal(h.statuses.at(-1),'reconnecting');h.transport.stop();
});

test('heartbeats without an initial snapshot do not satisfy the handshake deadline',async()=>{
 const h=harness();h.transport.start();await settle();h.sockets[0].open();
 h.sockets[0].receive({type:'pong',serverTime:200});await settle();
 [...h.timeouts.values()][0]();
 assert.equal(h.sockets[0].readyState,3);assert.equal(h.statuses.includes('live'),false);h.transport.stop();
});

test('disconnect holds client state, mints a fresh ticket, and stop cancels further reconnects',async()=>{
 const h=harness();h.transport.start();await settle();h.sockets[0].open();h.sockets[0].receive({type:'snapshot',snapshot:snapshot(3)});await settle();h.sockets[0].close();
 assert.deepEqual(h.snapshots.map(value=>value.revision),[3]);assert.equal(h.statuses.at(-1),'reconnecting');
 const reconnect=[...h.timeouts.values()][0];reconnect();await settle();assert.equal(h.urls.length,2);assert.equal(h.sockets.length,2);h.sockets[0].receive({type:'snapshot',snapshot:snapshot(99)});h.sockets[1].open();h.sockets[1].receive({type:'snapshot',snapshot:snapshot(4)});await settle();assert.deepEqual(h.snapshots.map(value=>value.revision),[3,4]);
 h.transport.stop();for(const callback of h.timeouts.values())callback();await settle();assert.equal(h.urls.length,2);
});
