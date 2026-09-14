import {describe,expect,it} from 'vitest';
import {MAX_CONTROLLERS,MAX_CUE_PAYLOAD_BYTES,MAX_SNAPSHOT_BYTES,STALE_MS,jsonBytes,presenceFrame,rankControllers,rendererExpired,type Controller,type Renderer,type Snapshot} from '../src/protocol';

const uuid=(index:number)=>`00000000-0000-4000-8000-${index.toString(16).padStart(12,'0')}`;
const controller=(index:number,seen:number,overrides:Partial<Controller>={}):Controller=>({id:uuid(index),client:'companion',version:'1.4.0',seen,...overrides});
// Worst realistic field widths per the MAX_CONTROLLER_BYTES comment in protocol.ts:
// longest ClientKind ('companion') and an 'xx.yy.zz'-shaped version.
const worstCaseController=(index:number,seen:number):Controller=>controller(index,seen,{client:'companion',version:'99.99.99'});
// A cue payload serialized to exactly `bytes` total, by padding a text field.
const cuePayloadOfSize=(bytes:number)=>{
 const overhead=jsonBytes({id:'cue-a',text:''});
 return {id:'cue-a',text:'x'.repeat(Math.max(0,bytes-overhead))};
};
const realisticRenderers=(count:number):Renderer[]=>Array.from({length:count},(_,index)=>({id:uuid(200+index),revision:9,cue:'cue-a',phase:'settled' as const,seen:1_700_000_000_000+index}));

describe('controller presence',()=>{
 it('expires a controller on the same inclusive 30000 ms deadline as a renderer',()=>{
  const seen=1_700_000_000_000;
  expect(STALE_MS).toBe(30_000);
  expect(rendererExpired(seen,seen+29_999)).toBe(false);
  expect(rendererExpired(seen,seen+30_000)).toBe(true);
  expect(rendererExpired(seen,seen+30_001)).toBe(true);
 });

 it('reports controllers newest first',()=>{
  const ranked=rankControllers([controller(1,100),controller(2,300),controller(3,200)]);
  expect(ranked.map(entry=>entry.id)).toEqual([uuid(2),uuid(3),uuid(1)]);
 });

 it('caps the reported set at MAX_CONTROLLERS, keeping the most recently seen',()=>{
  const crowd=Array.from({length:MAX_CONTROLLERS+20},(_,index)=>controller(index,1_000+index));
  const ranked=rankControllers(crowd);
  expect(ranked).toHaveLength(MAX_CONTROLLERS);
  expect(ranked[0].seen).toBe(1_000+MAX_CONTROLLERS+19);
  expect(ranked.at(-1)?.seen).toBe(1_000+20);
 });

 it('keeps a full controller set far inside one snapshot',()=>{
  const ranked=rankControllers(Array.from({length:MAX_CONTROLLERS},(_,index)=>controller(index,1_700_000_000_000+index)));
  expect(jsonBytes(ranked)).toBeLessThan(MAX_SNAPSHOT_BYTES/8);
 });

 // The test above only measures a bare controllers array against MAX_SNAPSHOT_BYTES/8;
 // it cannot see MAX_CUE_PAYLOAD_BYTES eating into the same budget the controllers array
 // shares in a real snapshot (this is what commit 410d127 got wrong). These two build a
 // real Snapshot — a max-size cue payload, a full 32-controller set at worst-case field
 // widths, and 8 renderers — to prove the reserved allowance is actually big enough, and
 // that the pre-fix formula was not.
 it('keeps a real snapshot with a max-size cue payload and a full controller set under MAX_SNAPSHOT_BYTES',()=>{
  const controllers=Array.from({length:MAX_CONTROLLERS},(_,index)=>worstCaseController(index,1_700_000_000_000+index));
  const renderers=realisticRenderers(8);
  const cuePayload=cuePayloadOfSize(MAX_CUE_PAYLOAD_BYTES);
  expect(jsonBytes(cuePayload)).toBe(MAX_CUE_PAYLOAD_BYTES);
  const snapshot:Snapshot={revision:9,cue:'cue-a',mode:'animate',updated:1_700_000_000_000,cuePayload,catalogVersion:'catalog-v1',renderers,controllers,serverTime:1_700_000_000_000};
  expect(jsonBytes(snapshot)).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES);
 });

 it('shows the pre-410d127 formula (MAX_SNAPSHOT_BYTES-4096, no controller allowance) would have overflowed that same snapshot',()=>{
  const oldMaxCuePayloadBytes=MAX_SNAPSHOT_BYTES-4096;
  const controllers=Array.from({length:MAX_CONTROLLERS},(_,index)=>worstCaseController(index,1_700_000_000_000+index));
  const renderers=realisticRenderers(8);
  const cuePayload=cuePayloadOfSize(oldMaxCuePayloadBytes);
  const snapshot:Snapshot={revision:9,cue:'cue-a',mode:'animate',updated:1_700_000_000_000,cuePayload,catalogVersion:'catalog-v1',renderers,controllers,serverTime:1_700_000_000_000};
  expect(jsonBytes(snapshot)).toBeGreaterThan(MAX_SNAPSHOT_BYTES);
 });

 it('carries an unknown client and a null version for a module that did not name itself',()=>{
  const [entry]=rankControllers([controller(4,10,{client:'unknown',version:null})]);
  expect(entry).toEqual({id:uuid(4),client:'unknown',version:null,seen:10});
 });

 it('broadcasts renderers and controllers in one presence frame',()=>{
  const renderers:Renderer[]=[{id:uuid(9),revision:4,cue:'cue-a',phase:'settled',seen:50}];
  const controllers=[controller(1,60)];
  expect(presenceFrame(renderers,controllers,70)).toEqual({type:'presence',renderers,controllers,serverTime:70});
  expect(Object.keys(presenceFrame([],[],0))).toEqual(['type','renderers','controllers','serverTime']);
 });
});
