import assert from 'node:assert/strict';
import test from 'node:test';
import {PUBLISHED_CUES_SQL,PUBLISHED_SIGNATURE_SQL,signatureCache} from '../lib/authoring';

test('unchanged metadata signatures reuse the bounded payload snapshot',async()=>{
 let signature='draft-a:1';
 let loads=0;
 const published=signatureCache(async()=>signature,async()=>({signature,value:[{version:++loads}]}));
 assert.deepEqual(await published(),[{version:1}]);
 assert.deepEqual(await published(),[{version:1}]);
 assert.equal(loads,1);
 signature='draft-a:2';
 assert.deepEqual(await published(),[{version:2}]);
 assert.equal(loads,2);
});

test('concurrent misses for one signature share one full payload query',async()=>{
 let release:((value:string[])=>void)|undefined;
 let loads=0;
 const published=signatureCache(async()=>'same',async()=>{
  loads++;
  return new Promise<{signature:string;value:string[]}>(resolve=>{release=value=>resolve({signature:'same',value})});
 });
 const first=published();
 const second=published();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(loads,1);
 release?.(['cue']);
 assert.deepEqual(await Promise.all([first,second]),[['cue'],['cue']]);
});

test('a failed refresh is retried and cannot replace the last valid snapshot',async()=>{
 let signature='one';
 let attempt=0;
 const published=signatureCache(async()=>signature,async()=>{
  attempt++;
  if(attempt===2)throw new Error('database unavailable');
  return {signature,value:`payload-${attempt}`};
 });
 assert.equal(await published(),'payload-1');
 signature='two';
 await assert.rejects(published(),/database unavailable/);
 assert.equal(await published(),'payload-3');
 signature='one';
 assert.equal(await published(),'payload-4');
});

test('database signature transfers active revision metadata rather than cue payloads',()=>{
 assert.match(PUBLISHED_SIGNATURE_SQL,/active_revision/);
 assert.doesNotMatch(PUBLISHED_SIGNATURE_SQL,/\br\.cue\b|document|authoring_revisions/i);
 assert.match(PUBLISHED_CUES_SQL,/AS cues[\s\S]+AS signature/);
 assert.match(PUBLISHED_CUES_SQL,/WITH active AS MATERIALIZED/);
});

test('an atomic full read is cached under the signature read with its payload',async()=>{
 let signature='before';
 let loads=0;
 const published=signatureCache(async()=>signature,async()=>{
  loads++;
  signature='after';
  return {signature:'after',value:['new payload']};
 });
 assert.deepEqual(await published(),['new payload']);
 assert.deepEqual(await published(),['new payload']);
 assert.equal(loads,1);
});
