import {describe,expect,it} from 'vitest';
import {MAX_CONTROLLERS,MAX_CUE_PAYLOAD_BYTES,MAX_SNAPSHOT_BYTES,STALE_MS,jsonBytes,nextState,parseCatalog,parseCommand,parseHello,parseInitialState,rendererExpired,verifyTicket,type Controller,type LiveState,type Snapshot} from '../src/protocol';

const encode=(value:Uint8Array|string)=>{
 const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
 return Buffer.from(bytes).toString('base64url');
};

async function ticket(payload:Record<string,unknown>,secret='relay-secret'){
 const encoded=encode(JSON.stringify(payload));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return `${encoded}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(encoded))))}`;
}

describe('relay protocol',()=>{
 it('accepts a valid short-lived ticket and rejects expired or far-future tickets',async()=>{
  const now=2_000_000_000;
  const base={room:'crc',role:'control',jti:'ticket_12345678'};
  expect(await verifyTicket(await ticket({...base,exp:now+60}),'relay-secret',now)).toMatchObject(base);
  expect(await verifyTicket(await ticket({...base,exp:now}),'relay-secret',now)).toBeNull();
  expect(await verifyTicket(await ticket({...base,exp:now+121}),'relay-secret',now)).toBeNull();
 });

 it('accepts ID-only commands and rejects caller-supplied playback content',()=>{
  const command={action:'in',cue:'cue-a',commandId:'command_12345678',clientId:'client_12345678',sequence:4};
  expect(parseCommand(command)).toEqual({...command,bug:null,logo:null,source:'control',serviceRef:null});
  expect(parseCommand({...command,cuePayload:{id:'cue-a'}})).toBeNull();
  expect(parseCommand({...command,catalogVersion:'old'})).toBeNull();
 });

 it('requires a non-empty catalog with unique cue IDs',()=>{
  expect(parseCatalog({version:'v1',cues:[{id:'cue-a'},{id:'cue-b'}]})).not.toBeNull();
  expect(parseCatalog({version:'v1',cues:[]})).toBeNull();
  expect(parseCatalog({version:'v1',cues:[{id:'cue-a'},{id:'cue-a'}]})).toBeNull();
 });

 it('allows a growing catalog beyond one snapshot while rejecting an unplayable cue',()=>{
  const cues=Array.from({length:80},(_,index)=>({id:`cue-${index}`,text:'x'.repeat(4096)}));
  const catalog={version:'large-v1',cues};
  expect(JSON.stringify(catalog).length).toBeGreaterThan(MAX_SNAPSHOT_BYTES);
  expect(parseCatalog(catalog)).not.toBeNull();
  expect(parseCatalog({version:'large-cue',cues:[{id:'cue-huge',text:'x'.repeat(MAX_CUE_PAYLOAD_BYTES)}]})).toBeNull();
 });

 it('pins selected catalog content and preserves it for an out on another cue',()=>{
  const state:LiveState={revision:8,cue:'cue-a',mode:'animate',updated:10,cuePayload:{id:'cue-a',name:'Original'},catalogVersion:'v1'};
  const selected={id:'cue-b',name:'Approved'};
  const next=nextState(state,{action:'in',cue:'cue-b',bug:null,logo:null,commandId:'command_abcdefgh',clientId:null,sequence:null,source:'control',serviceRef:null},selected,20);
  expect(next).toMatchObject({revision:9,cue:'cue-b',cuePayload:selected,catalogVersion:'v1'});
  const retained=nextState(state,{action:'out',cue:'cue-b',bug:null,logo:null,commandId:'command_ijklmnop',clientId:null,sequence:null,source:'control',serviceRef:null},null,30);
  expect(retained).toMatchObject({revision:9,cue:'cue-a',cuePayload:state.cuePayload});
 });

 it('parses initialized state without replacing its pinned payload',()=>{
  const payload={id:'cue-a',name:'Pinned'};
  expect(parseInitialState({revision:1,cue:'cue-a',mode:'cut',updated:12,cuePayload:payload},'catalog-v1')).toEqual({revision:1,cue:'cue-a',mode:'cut',updated:12,cuePayload:payload,catalogVersion:'catalog-v1'});
 });
});

describe('renderer expiry',()=>{
 it('expires a renderer at exactly the stale deadline',()=>{
  const seen=1_000_000;
  expect(rendererExpired(seen,seen+STALE_MS-1)).toBe(false);
  expect(rendererExpired(seen,seen+STALE_MS)).toBe(true);
  expect(rendererExpired(seen,seen+STALE_MS+1)).toBe(true);
 });
});

describe('hello',()=>{
 const id='00000000-0000-4000-8000-000000000001';

 it('accepts a 1.4.0 hello that names its client and version',()=>{
  expect(parseHello({type:'hello',id,client:'companion',version:'1.4.0'})).toEqual({id,client:'companion',version:'1.4.0'});
  expect(parseHello({type:'hello',id,client:'browser',version:'0.1.0'})).toEqual({id,client:'browser',version:'0.1.0'});
 });

 it('accepts a 1.3.0 hello that omits client and version',()=>{
  expect(parseHello({type:'hello',id})).toEqual({id,client:'unknown',version:null});
  expect(parseHello({type:'hello',id,client:'stream-deck'})).toEqual({id,client:'unknown',version:null});
 });

 it('yields a null version for a malformed version rather than refusing the hello',()=>{
  for(const version of ['1.4','1.4.0-beta','v1.4.0','','1.'+'0'.repeat(40)+'.0',7,null,{}]){
   expect(parseHello({type:'hello',id,client:'companion',version})).toEqual({id,client:'companion',version:null});
  }
 });

 it('still rejects a hello whose id is not a UUID',()=>{
  expect(parseHello({type:'hello',id:'not-a-uuid',client:'companion',version:'1.4.0'})).toBeNull();
  expect(parseHello({type:'hello'})).toBeNull();
  expect(parseHello(null)).toBeNull();
  expect(parseHello([{id}])).toBeNull();
 });
});

describe('controller presence size',()=>{
 it('keeps a snapshot with MAX_CONTROLLERS controllers under MAX_SNAPSHOT_BYTES',()=>{
  const controllers:Controller[]=Array.from({length:MAX_CONTROLLERS},(_,index)=>({
   id:`0000000${index.toString(16).padStart(1,'0')}-0000-4000-8000-00000000000${index.toString(16)}`.slice(0,36),
   client:'companion',
   version:'1.4.0',
   seen:1_700_000_000_000+index,
  }));
  const snapshot:Snapshot={revision:12,cue:'cue-a',mode:'animate',updated:1_700_000_000_000,cuePayload:{id:'cue-a',text:'x'.repeat(2048)},catalogVersion:'catalog-v1',renderers:[],controllers,serverTime:1_700_000_000_000};
  expect(snapshot.controllers).toHaveLength(MAX_CONTROLLERS);
  expect(jsonBytes(snapshot)).toBeLessThan(MAX_SNAPSHOT_BYTES);
 });
});
