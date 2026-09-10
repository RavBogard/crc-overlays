import {describe,expect,it} from 'vitest';
import {MAX_CUE_PAYLOAD_BYTES,MAX_SNAPSHOT_BYTES,nextState,parseCatalog,parseCommand,parseInitialState,verifyTicket,type LiveState} from '../src/protocol';

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
  expect(parseCommand(command)).toEqual(command);
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
  const next=nextState(state,{action:'in',cue:'cue-b',commandId:'command_abcdefgh',clientId:null,sequence:null},selected,20);
  expect(next).toMatchObject({revision:9,cue:'cue-b',cuePayload:selected,catalogVersion:'v1'});
  const retained=nextState(state,{action:'out',cue:'cue-b',commandId:'command_ijklmnop',clientId:null,sequence:null},null,30);
  expect(retained).toMatchObject({revision:9,cue:'cue-a',cuePayload:state.cuePayload});
 });

 it('parses initialized state without replacing its pinned payload',()=>{
  const payload={id:'cue-a',name:'Pinned'};
  expect(parseInitialState({revision:1,cue:'cue-a',mode:'cut',updated:12,cuePayload:payload},'catalog-v1')).toEqual({revision:1,cue:'cue-a',mode:'cut',updated:12,cuePayload:payload,catalogVersion:'catalog-v1'});
 });
});
