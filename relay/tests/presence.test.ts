import {describe,expect,it} from 'vitest';
import {MAX_CONTROLLERS,MAX_SNAPSHOT_BYTES,STALE_MS,jsonBytes,presenceFrame,rankControllers,rendererExpired,type Controller,type Renderer} from '../src/protocol';

const uuid=(index:number)=>`00000000-0000-4000-8000-${index.toString(16).padStart(12,'0')}`;
const controller=(index:number,seen:number,overrides:Partial<Controller>={}):Controller=>({id:uuid(index),client:'companion',version:'1.4.0',seen,...overrides});

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
