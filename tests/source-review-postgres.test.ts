import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import {Pool} from 'pg';
import {editableFromBaseline,sourcePinFor,sourceSnapshotsFor,type AuthoringSource,type Draft} from '../lib/authoring-model.ts';
import {PgAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import {PgSourceReviewRepository,createSourceReviewService,type SourceChangeSummary} from '../lib/source-review.ts';

const isolated=Boolean(process.env.SOURCE_REVIEW_POSTGRES_TEST==='1'&&process.env.DATABASE_URL&&process.env.PGOPTIONS?.includes('search_path=crc_authoring_'));
const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');

type DraftResult={draft:Draft};
type ScanResult={records:SourceChangeSummary[]};
type DecideResult={record:SourceChangeSummary;draft:Draft|null};
type DraftSetResult={drafts:Draft[]};

test('PostgreSQL keeps variants and accepted source changes independent and unpublished',{skip:!isolated},async()=>{
 const repo=new PgAuthoringRepository(),authoring=createAuthoringService(repo),reviews=new PgSourceReviewRepository(),sourceReview=createSourceReviewService(repo,reviews);const createdIds:string[]=[],reviewIds:string[]=[];const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
 try{
  const editable=editableFromBaseline(BARECHU);assert.equal(editable.content.mode,'bilingual');const snapshots=sourceSnapshotsFor(editable.content),now=Date.now(),baseId=randomUUID();const base:Draft={...editable,id:baseId,version:1,sourcePin:sourcePinFor(editable.content,snapshots),sourceSnapshots:snapshots,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'pg-test',updatedBy:'pg-test'};await repo.insertDraft(base);createdIds.push(baseId);
  const group=editable.content.hebrewGroups[0],block=snapshots.find(source=>source.id===group.sourceId)!.blocks.find(item=>item.id===group.blockIds[0])!;const variant=await authoring.operation('create_local_variant',{draftId:baseId,label:'PostgreSQL test variant',overrides:[{sourceId:group.sourceId,blockId:block.id,channel:'he',localText:`${block.he}׃`}]},'pg-test') as DraftResult;createdIds.push(variant.draft.id);assert.equal((await repo.getDraft(variant.draft.id))!.content.mode,'local-variant');assert.equal(variant.draft.activeRevision,null);
  const prior=structuredClone(snapshots.find(source=>source.id===group.sourceId)!) as AuthoringSource,priorBlock=prior.blocks.find(item=>item.id===block.id)!;priorBlock.he=`${priorBlock.he} old`;priorBlock.sourceBlockSha256=sha(JSON.stringify(priorBlock));prior.unitSha256=sha(JSON.stringify(prior.blocks));const oldId=randomUUID(),oldDraft:Draft={...editable,id:oldId,version:1,sourcePin:sourcePinFor(editable.content,[prior],'0'.repeat(64)),sourceSnapshots:[prior],activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'pg-test',updatedBy:'pg-test'};await repo.insertDraft(oldDraft);createdIds.push(oldId);
  const scan=await sourceReview.operation('scan',{},'pg-reviewer') as ScanResult;const record=scan.records.find(item=>item.affected.draftId===oldId);assert.ok(record);reviewIds.push(record.id);const accepted=await sourceReview.operation('decide',{id:record.id,expectedVersion:record.version,decision:'accept'},'pg-reviewer') as DecideResult;createdIds.push(accepted.draft!.id);assert.equal(accepted.record.status,'accepted');assert.equal((await repo.getDraft(accepted.draft!.id))!.activeRevision,null);assert.equal((await repo.getDraft(oldId))!.content.mode,'bilingual');
  const archived=await authoring.operation('archive_draft',{draftId:baseId,expectedVersion:1},'pg-test') as DraftResult;assert.ok(archived.draft.archivedAt);const restored=await authoring.operation('restore_draft',{draftId:baseId,expectedVersion:2},'pg-test') as DraftResult;assert.equal(restored.draft.archivedAt,undefined);
  const setId=randomUUID(),setIds=[randomUUID(),randomUUID()];const setDrafts=setIds.map((id,index)=>({...structuredClone(base),id,name:`Set ${index+1}`,draftSetId:setId,setIndex:index+1,setCount:2}));await repo.insertDraftSet(setDrafts);createdIds.push(...setIds);const archivedSet=await authoring.operation('archive_draft_set',{setId,expectedDraftIds:setIds},'pg-test') as DraftSetResult;assert.ok(archivedSet.drafts.every(item=>item.archivedAt));const restoredSet=await authoring.operation('restore_draft_set',{setId,expectedDraftIds:setIds},'pg-test') as DraftSetResult;assert.ok(restoredSet.drafts.every(item=>!item.archivedAt&&item.version===3));
 }finally{const client=await pool.connect();try{if(reviewIds.length)await client.query('DELETE FROM source_change_reviews WHERE id=ANY($1)',[reviewIds]);if(createdIds.length)await client.query('DELETE FROM authoring_revisions WHERE draft_id=ANY($1)',[createdIds]);if(createdIds.length)await client.query('DELETE FROM authoring_previews WHERE draft_id=ANY($1)',[createdIds]);if(createdIds.length)await client.query('DELETE FROM authoring_drafts WHERE id=ANY($1)',[createdIds])}finally{client.release();await pool.end()}}
});
