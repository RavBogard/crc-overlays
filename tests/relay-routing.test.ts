import test from 'node:test';
import assert from 'node:assert/strict';
import {db,snapshot,catalog} from '../lib/server.ts';
import {POST as command} from '../app/api/command/route.ts';
import {POST as ack} from '../app/api/ack/route.ts';

test('all relay playback operations bypass Postgres entirely, including cue selection',async()=>{
 const saved={fetch:globalThis.fetch,query:db.query,connect:db.connect,env:{...process.env}};
 Object.assign(process.env,{RELAY_URL:'https://relay.example.test',RELAY_SECRET:'relay-secret',CONTROL_KEY:'control',OUTPUT_KEY:'output'});
 const calls:string[]=[];const state={revision:12,cue:null,mode:'cut',cuePayload:null,renderers:[],serverTime:1000};
 db.query=(()=>{throw Error('Unexpected database query')}) as typeof db.query;
 db.connect=(()=>{throw Error('Unexpected database connection')}) as typeof db.connect;
 globalThis.fetch=async(input,init)=>{
  const path=new URL(String(input)).pathname;calls.push(path);
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer relay-secret');
  assert.equal(init?.redirect,'error');
  if(path==='/command'){const body=JSON.parse(String(init?.body));assert.ok(!('cuePayload' in body));}
  return Response.json(path==='/ack'?{ok:true}:path==='/catalog'?{cues:[],version:'test'}:state);
 };
 try{
  assert.deepEqual(await snapshot(),state);
  assert.deepEqual(await catalog(),{cues:[],version:'test'});
  const response=await command(new Request('https://site.test/api/command',{method:'POST',headers:{Authorization:'Bearer control'},body:JSON.stringify({action:'cut',commandId:'command-123',clientId:'client-123',sequence:1})}));assert.equal(response.status,200);
  const selection=await command(new Request('https://site.test/api/command',{method:'POST',headers:{Authorization:'Bearer control'},body:JSON.stringify({action:'in',cue:'prayer-123',commandId:'command-124',clientId:'client-123',sequence:2})}));assert.equal(selection.status,200);
  const acknowledgment=await ack(new Request('https://site.test/api/ack',{method:'POST',headers:{Authorization:'Bearer output'},body:JSON.stringify({id:'renderer-123',revision:12,cue:null,phase:'settled'})}));assert.equal(acknowledgment.status,200);
  assert.deepEqual(calls,['/state','/catalog','/command','/command','/ack']);
 }finally{
  globalThis.fetch=saved.fetch;db.query=saved.query;db.connect=saved.connect;
  for(const k of ['RELAY_URL','RELAY_SECRET','CONTROL_KEY','OUTPUT_KEY']){if(saved.env[k]===undefined)delete process.env[k];else process.env[k]=saved.env[k]}
 }
});
