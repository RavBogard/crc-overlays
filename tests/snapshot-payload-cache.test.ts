import test from 'node:test';
import assert from 'node:assert/strict';
import {SNAPSHOT_STATE_SQL,newestPayloadCache,resolvePayload,type PayloadCache} from '../lib/snapshot-payload-cache.ts';

test('cold snapshots load and freeze the pinned cue payload',()=>{
 const loaded=resolvePayload(null,{revision:4,cuePayload:{id:'cue',texts:{title:'Pinned'}}});
 assert.equal(loaded.candidate.revision,4);assert.equal(Object.isFrozen(loaded.payload),true);assert.equal(Object.isFrozen((loaded.payload as {texts:object}).texts),true);
});

test('same revision reuses the captured payload when SQL omits it',()=>{
 const captured={revision:8,payload:{id:'same'}};
 const resolved=resolvePayload(captured,{revision:8,cuePayload:null});
 assert.equal(resolved.payload,captured.payload);assert.equal(resolved.candidate,captured);
 assert.match(SNAPSHOT_STATE_SQL,/CASE WHEN revision=\$1 THEN NULL ELSE cue_payload END/);
});

test('new revisions replace payload and cuts reset it to null',()=>{
 const prior={revision:8,payload:{id:'old'}};
 const next=resolvePayload(prior,{revision:9,cuePayload:{id:'new'}});assert.deepEqual(next.payload,{id:'new'});
 const cut=resolvePayload(next.candidate,{revision:10,cuePayload:null});assert.equal(cut.payload,null);assert.deepEqual(cut.candidate,{revision:10,payload:null});
});

test('late concurrent reads cannot regress the process cache or mismatch their own payload',()=>{
 const captured={revision:11,payload:{id:'eleven'}};
 const slow=resolvePayload(captured,{revision:12,cuePayload:{id:'twelve'}});
 const fast=resolvePayload(captured,{revision:13,cuePayload:{id:'thirteen'}});
 let current:PayloadCache|null=captured;current=newestPayloadCache(current,fast.candidate);current=newestPayloadCache(current,slow.candidate);
 assert.deepEqual(current,{revision:13,payload:{id:'thirteen'}});assert.deepEqual(slow.payload,{id:'twelve'});assert.deepEqual(fast.payload,{id:'thirteen'});
});
