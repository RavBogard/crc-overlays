import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,assertSourcePin,sourcePack,sourcePinFor,newDraftId,type BilingualContent,type Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';

const LEFT_PANEL='bbd7c98b-f1de-41ee-9719-2bb27a30d0db';
type DraftResult={draft:Draft};
const code=(expected:string)=>(error:unknown)=>(error as AuthoringError).code===expected;

// Gap D: a draft whose stored pin no longer matches its own content (source authority metadata
// moved on) could not be edited at all, not even by the explicit rebase its error asks for.
function staleDraft(){
 const source=sourcePack.sources.find(item=>item.id==='library:legacy-shabbat-morning:shma.barchu@legacy-shabbat-morning')!;
 const content:BilingualContent={mode:'bilingual',hebrewGroups:[{sourceId:source.id,blockIds:[source.blocks[0].id]}],transliterationGroups:[{sourceId:source.id,blockIds:[source.blocks[0].id]}]};
 const pin=sourcePinFor(content,[source],'old-feed');pin.unitSha256[source.id]='stale-unit';
 const now=Date.now();
 const draft:Draft={id:newDraftId(),name:'Stale',title:'Stale',layout:'left',templateCueId:LEFT_PANEL,content,presentation:{},sourceSnapshots:[structuredClone(source)],sourcePin:pin,version:1,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'tester',updatedBy:'tester'};
 assert.throws(()=>assertSourcePin(draft),code('source_pin_mismatch'),'fixture is stale');
 return {source,content,draft};
}

test('a stale-pinned draft still refuses ordinary edits and edits that keep the stale source unrefreshed',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);const {draft,content}=staleDraft();await repo.insertDraft(draft);
 const before=structuredClone(await repo.getDraft(draft.id));
 await assert.rejects(service.operation('update_draft',{draftId:draft.id,expectedVersion:1,patch:{title:'Renamed'}},'tester'),code('source_pin_mismatch'));
 await assert.rejects(service.operation('update_draft',{draftId:draft.id,expectedVersion:1,patch:{content}},'tester'),code('source_pin_mismatch'));
 const second=sourcePack.sources.find(item=>item.id!==draft.content.mode&&item.id.startsWith('library:legacy-shabbat-morning:')&&item.id!==(draft.content as BilingualContent).hebrewGroups[0].sourceId&&item.blocks.some(block=>block.kind==='bilingual'))!;
 const secondBlock=second.blocks.find(block=>block.kind==='bilingual')!;
 const both:BilingualContent={mode:'bilingual',hebrewGroups:[...content.hebrewGroups,{sourceId:second.id,blockIds:[secondBlock.id]}],transliterationGroups:[...content.transliterationGroups,{sourceId:second.id,blockIds:[secondBlock.id]}]};
 await assert.rejects(service.operation('update_draft',{draftId:draft.id,expectedVersion:1,refreshSourceIds:[second.id],patch:{content:both}},'tester'),code('source_pin_mismatch'),'refreshing another source does not rebase the stale one');
 assert.deepEqual(await repo.getDraft(draft.id),before,'refused requests do not mutate the draft');
});

test('an explicit refresh rebases a stale-pinned draft onto the current source',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);const {draft,content,source}=staleDraft();await repo.insertDraft(draft);
 const rebased=await service.operation('update_draft',{draftId:draft.id,expectedVersion:1,refreshSourceIds:[source.id],patch:{content}},'tester') as DraftResult;
 assert.equal(rebased.draft.version,2);assert.doesNotThrow(()=>assertSourcePin(rebased.draft),'the rebased pin is self-consistent');
 assert.deepEqual(rebased.draft.content,content,'the selection is unchanged');
});

test('a stale-pinned draft can be repointed to a different current source',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);const {draft}=staleDraft();await repo.insertDraft(draft);
 const other='shma.am-i-awake@legacy-shabbat-morning';
 const switched=await service.operation('update_draft',{draftId:draft.id,expectedVersion:1,refreshSourceIds:[other],patch:{content:{mode:'original-en',englishGroups:[{sourceId:other,blockIds:[`${other}#block-0`]}]}}},'tester') as DraftResult;
 assert.deepEqual(switched.draft.sourceSnapshots!.map(item=>item.id),[other]);assert.doesNotThrow(()=>assertSourcePin(switched.draft));
});
