import test from 'node:test';
import assert from 'node:assert/strict';
import {baselineCues,buildCue,editableFromBaseline,newDraftId,sourcePinFor,type Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import {SHARED_LIBRARY_MAX_BYTES,SharedLibraryClient,TBI_WORKSPACE_ID,buildSharedLibraryPayload,type SharedLibrarySnapshot} from '../lib/shared-library.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const KEY='s'.repeat(43);
const env={WORKSPACE_ID:TBI_WORKSPACE_ID,CRC_SHARED_LIBRARY_URL:'https://crc.example.test/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:KEY};

test('CRC export contains every visible published baseline and only required source snapshots',()=>{
 const visible=baselineCues.filter(cue=>!cue.hidden);const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'},1234);
 assert.equal(payload.schemaVersion,1);assert.equal(payload.sourceWorkspace,'crc');assert.equal(payload.generatedAt,1234);assert.equal(payload.cues.length,visible.length);assert.ok(payload.sources.length>0);assert.ok(Buffer.byteLength(JSON.stringify(payload))<SHARED_LIBRARY_MAX_BYTES);
 const thankYou=payload.cues.find(entry=>entry.name==='Thank you')!;assert.equal(thankYou.copySpec.content.mode,'custom');assert.deepEqual(thankYou.sourceIds,[]);
 const sourceIds=new Set(payload.sources.map(source=>source.id));assert.ok(payload.cues.every(entry=>entry.sourceIds.every(id=>sourceIds.has(id))));
});

test('newly published cue definitions carry immutable copy specifications for future sharing',()=>{
 const editable=editableFromBaseline(BARECHU);const now=Date.now();const draft:Draft={...editable,id:newDraftId(),version:3,sourcePin:sourcePinFor(editable.content),activeRevision:2,activeDraftVersion:3,createdAt:now,updatedAt:now,createdBy:'crc',updatedBy:'crc'};const cue=buildCue(draft);
 const payload=buildSharedLibraryPayload({cues:[cue],version:'future'});assert.equal(payload.cues[0].copySpec.title,editable.title);assert.deepEqual(payload.cues[0].copySpec.content,editable.content);assert.deepEqual(payload.cues[0].copySpec.sourcePin,draft.sourcePin);
});

test('TBI client deduplicates refreshes, serves a sixty-second cache, and falls back to last good data',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'});let calls=0;let fail=false;
 const fetcher=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return fail?new Response('down',{status:503}):Response.json(payload)};
 const client=new SharedLibraryClient(env,fetcher as typeof fetch);const [first,second]=await Promise.all([client.get(),client.get()]);assert.equal(calls,1);assert.equal(first.available,true);assert.equal(second.available,true);
 await client.get();assert.equal(calls,1);fail=true;const stale=await client.get(true);assert.equal(calls,2);assert.equal(stale.available,true);if(stale.available)assert.equal(stale.stale,true);
});

test('shared library operations preview exact CRC cues and create independent unpublished TBI drafts',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'});const snapshot:SharedLibrarySnapshot={available:true,configured:true,stale:false,refreshedAt:456,payload};const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo,undefined,{get:async()=>snapshot});
 const list=await service.operation('list_shared_library',{query:'Barechu',limit:1000},'simone') as any;assert.equal(list.available,true);assert.equal(list.cues.length,1);assert.equal(list.total,1);assert.equal(list.truncated,false);assert.equal(list.cues[0].id,BARECHU);assert.equal(list.refreshedAt,456);
 const preview=await service.operation('preview_shared_cue',{cueId:BARECHU},'simone') as any;assert.deepEqual(preview.cue,payload.cues.find(entry=>entry.id===BARECHU)!.cue);assert.equal(preview.cueHash,list.cues[0].cueHash);
 await assert.rejects(service.operation('customize_shared_cue',{cueId:BARECHU,expectedCueHash:'0'.repeat(64)},'simone'),(error:any)=>error.code==='shared_cue_changed');
 const customized=await service.operation('customize_shared_cue',{cueId:BARECHU,expectedCueHash:preview.cueHash},'simone') as any;assert.notEqual(customized.draft.id,BARECHU);assert.equal(customized.draft.activeRevision,null);assert.equal(customized.draft.sharedFrom.cueId,BARECHU);assert.ok(customized.draft.sourceSnapshots.length>0);assert.deepEqual(buildCue(customized.draft).texts,preview.cue.texts);assert.deepEqual(await service.publishedCues(),[]);
 const updated=await service.operation('update_draft',{draftId:customized.draft.id,expectedVersion:1,patch:{title:'TBI wording'}},'simone') as any;assert.equal(updated.draft.title,'TBI wording');assert.equal(updated.draft.sharedFrom.cueId,BARECHU);
});

test('an unavailable CRC library does not disrupt local TBI authoring',async()=>{
 const unavailable:SharedLibrarySnapshot={available:false,configured:true,stale:false,error:'CRC library is temporarily unavailable.'};const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo,undefined,{get:async()=>unavailable});
 const list=await service.operation('list_shared_library',{},'simone') as any;assert.equal(list.available,false);
 await assert.rejects(service.operation('customize_shared_cue',{cueId:BARECHU,expectedCueHash:'0'.repeat(64)},'simone'),(error:any)=>error.code==='shared_library_unavailable');
 const editable=editableFromBaseline(BARECHU);const local=await service.operation('create_draft',editable,'simone') as any;assert.ok(local.draft.id);
});
