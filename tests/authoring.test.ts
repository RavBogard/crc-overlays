import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,baselineCues,editableFromBaseline} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const measurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'test-renderer',measuredAt:Date.now()} as const;

test('existing cue import seeds an immutable baseline and is idempotent',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const first=await service.operation('import_cue',{cueId:BARECHU},'tester') as any;
 const second=await service.operation('import_cue',{cueId:BARECHU},'tester') as any;
 assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(first.draft.id,BARECHU);
 const published=await service.publishedCues();assert.deepEqual(published[0],baselineCues.find(cue=>cue.id===BARECHU));
});

test('template discovery exposes stable IDs and importability',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());const result=await service.operation('list_templates',{},'tester') as any;
 assert.ok(result.templates.some((template:any)=>template.id===BARECHU&&template.importable===true));
});

test('optimistic updates, reviewed publish, immutable revisions, and rollback',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);const editable=editableFromBaseline(BARECHU);
 const created=await service.operation('create_draft',editable,'tester') as any;const id=created.draft.id;
 const updated=await service.operation('update_draft',{draftId:id,expectedVersion:1,patch:{title:'Reviewed title'}},'tester') as any;
 await assert.rejects(service.operation('update_draft',{draftId:id,expectedVersion:1,patch:{title:'stale'}},'tester'),(e:any)=>e instanceof AuthoringError&&e.code==='version_conflict');
 const preview=await service.operation('preview_draft',{draftId:id,expectedVersion:2},'tester') as any;
 await assert.rejects(service.operation('publish_draft',{draftId:id,expectedVersion:2,previewId:preview.previewId},'tester'),(e:any)=>e.code==='review_required');
 await service.operation('review_draft',{draftId:id,expectedVersion:2,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 const first=await service.operation('publish_draft',{draftId:id,expectedVersion:2,previewId:preview.previewId},'publisher') as any;
 assert.equal(first.cue.id,id);assert.equal((await service.publishedCues())[0].texts.textTitle,'Reviewed title');
 await service.operation('update_draft',{draftId:id,expectedVersion:2,patch:{title:'Next title'}},'tester');
 assert.equal((await service.publishedCues())[0].texts.textTitle,'Reviewed title','editing does not mutate the published payload');
 const next=await service.operation('preview_draft',{draftId:id,expectedVersion:3},'tester') as any;
 await service.operation('review_draft',{draftId:id,expectedVersion:3,previewId:next.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 await service.operation('publish_draft',{draftId:id,expectedVersion:3,previewId:next.previewId},'publisher');
 assert.equal((await service.publishedCues())[0].texts.textTitle,'Next title');
 const revisions=await service.operation('list_revisions',{draftId:id},'tester') as any;assert.equal(revisions.revisions.length,2);assert.equal(revisions.revisions[0].cue.texts.textTitle,'Reviewed title');
 await service.operation('rollback_draft',{draftId:id,expectedVersion:3,revision:1},'publisher');
 assert.equal((await service.publishedCues())[0].texts.textTitle,'Reviewed title');
});
