import test from 'node:test';
import assert from 'node:assert/strict';
import {syncLiveCatalog} from '../lib/sync-live-catalog.ts';

test('a concurrent publication retries from fresh authoring data, never replays the stale catalog',async()=>{
 let attempt=0;const order:string[]=[];const writes:unknown[]=[];
 const result=await syncLiveCatalog({
  readRelay:async()=>{order.push('relay');return {version:`relay-${attempt}`,cues:[]}},
  readAuthoring:async()=>{order.push('authoring');return {version:`publication-${attempt}`,cues:[]}},
  writeRelay:async(_path,body)=>{order.push('write');writes.push(body);return Response.json({}, {status:attempt++===0?409:200})},
 });
 assert.deepEqual(result,{version:'publication-1',count:0});
 assert.deepEqual(order,['relay','authoring','write','relay','authoring','write']);
 assert.deepEqual(writes,[{version:'publication-0',cues:[],expectedVersion:'relay-0'},{version:'publication-1',cues:[],expectedVersion:'relay-1'}]);
});

test('unavailable relay does not trigger repeated authoring queries',async()=>{
 let reads=0;
 await assert.rejects(()=>syncLiveCatalog({
  readRelay:async()=>{throw Error('relay unavailable')},
  readAuthoring:async()=>{reads++;return {version:'unused',cues:[]}},
  writeRelay:async()=>{throw Error('unexpected write')},
 }),/relay unavailable/);
 assert.equal(reads,0);
});

test('continuous publication conflicts have a bounded retry limit',async()=>{
 let writes=0;
 await assert.rejects(()=>syncLiveCatalog({
  readRelay:async()=>({version:'current',cues:[]}),
  readAuthoring:async()=>({version:'next',cues:[]}),
  writeRelay:async()=>{writes++;return Response.json({}, {status:409})},
 }),/concurrently/);
 assert.equal(writes,3);
});
