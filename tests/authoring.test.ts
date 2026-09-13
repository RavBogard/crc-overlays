import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,baselineCues,buildCue,editableFromBaseline,sourcePack,type Draft,type AuthoringCue,type AuthoringSource,type BilingualContent,type OriginalEnglishContent,type SourceEnglishContent,type LocalVariantContent,type DraftSetSelection} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,authoringRepositoryMode,createAuthoringService,type AuthoringWorkspace,type Revision} from '../lib/authoring.ts';
import {exceedsOnePanel} from '../lib/panel-budget.ts';
import type {BookUnitsResult} from '../app/author/types.ts';
import {newDraftId,sourcePinFor} from '../lib/authoring-model.ts';
import {buildSharedLibraryPayload,type SharedLibrarySnapshot} from '../lib/shared-library.ts';
import type {SharedCompareResult,SharedShelfList} from '../app/author/types.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const LEFT_PANEL='bbd7c98b-f1de-41ee-9719-2bb27a30d0db';
const RIGHT_PANEL='09f50803-3288-4b78-bcc7-560025668e1a';
const KOL_NIDRE='library:crc-kol-nidre:erev-yk.kol-nidre@crc-kol-nidre';
const OPENING_PRAYER='library:crc-kol-nidre:erev-yk.opening-prayer@crc-kol-nidre';
const measurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'test-renderer',measuredAt:Date.now()} as const;

type DraftResult={draft:Draft};
type ImportCueResult=DraftResult&{created:boolean};
type DuplicateDraftResult=DraftResult&{duplicatedFrom:{kind:string;id:string}};
type ListDraftsResult={drafts:Draft[]};
type DraftSetResult={set:{id:string;name?:string;count:number;draftIds:string[]};drafts:Draft[]};
type TemplateSummary={id:string;name:string;layout:string;importable:boolean};
type ListTemplatesResult={templates:TemplateSummary[]};
type PreviewDraftResult={previewId:string;draftVersion:number;cue:AuthoringCue;cueHash:string};
type PreviewContentResult={ephemeral:boolean;cue:AuthoringCue;validation:{valid:boolean}};
type PublishDraftResult={revision:Revision;cue:AuthoringCue};
type ListRevisionsResult={revisions:Revision[]};
type CatalogEntry={id:string;name:string;title:string;layout:string;hidden:boolean;origin:string;draftId:string|null;draftVersion:number|null;activeRevision:number|null;canEdit:boolean;editAction:string;canDuplicate:boolean};
type ListCatalogResult={cues:CatalogEntry[]};
type SourceSummary={id:string;name:string;book?:string;service?:string;coverage:{bilingual:number;originalEnglish:number;sourceEnglish:number;automaticSourceEnglish:number;noteLikeEnglish:number}};
type SearchSourcesResult={sources:SourceSummary[];truncated:boolean};
type GetSourceResult={source:AuthoringSource};
type ReviewDraftSetResult={status:string;expected?:DraftSetSelection[];current?:DraftSetSelection[];issues:Array<{kind:string;selections:unknown[]}>};
type GetWorkspaceResult={workspace:AuthoringWorkspace};

test('existing cue import seeds an immutable baseline and is idempotent',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const first=await service.operation('import_cue',{cueId:BARECHU},'tester') as ImportCueResult;
 const second=await service.operation('import_cue',{cueId:BARECHU},'tester') as ImportCueResult;
 assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(first.draft.id,BARECHU);
 const published=await service.publishedCues();assert.deepEqual(published[0],baselineCues.find(cue=>cue.id===BARECHU));
});

test('template discovery exposes stable IDs and importability',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());const result=await service.operation('list_templates',{},'tester') as ListTemplatesResult;
 assert.ok(result.templates.some(template=>template.id===BARECHU&&template.importable===true));
});

test('optimistic updates, reviewed publish, immutable revisions, and rollback',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);const editable=editableFromBaseline(BARECHU);
 // A name of its own: a new graphic that reuses the baseline "Barechu" name is a R6 duplicate.
 const created=await service.operation('create_draft',{...editable,name:'Reviewed Barechu'},'tester') as DraftResult;const id=created.draft.id;
 await service.operation('update_draft',{draftId:id,expectedVersion:1,patch:{title:'Reviewed title'}},'tester');
 await assert.rejects(service.operation('update_draft',{draftId:id,expectedVersion:1,patch:{title:'stale'}},'tester'),(e)=>e instanceof AuthoringError&&e.code==='version_conflict');
 const preview=await service.operation('preview_draft',{draftId:id,expectedVersion:2},'tester') as PreviewDraftResult;
 await assert.rejects(service.operation('publish_draft',{draftId:id,expectedVersion:2,previewId:preview.previewId},'tester'),(e)=>(e as AuthoringError).code==='review_required');
 await service.operation('review_draft',{draftId:id,expectedVersion:2,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 const first=await service.operation('publish_draft',{draftId:id,expectedVersion:2,previewId:preview.previewId},'publisher') as PublishDraftResult;
 assert.equal(first.cue.id,id);assert.equal((await service.publishedCues())[0].texts.textTitle,'Reviewed title');
 await service.operation('update_draft',{draftId:id,expectedVersion:2,patch:{title:'Next title'}},'tester');
 assert.equal((await service.publishedCues())[0].texts.textTitle,'Reviewed title','editing does not mutate the published payload');
 const next=await service.operation('preview_draft',{draftId:id,expectedVersion:3},'tester') as PreviewDraftResult;
 await service.operation('review_draft',{draftId:id,expectedVersion:3,previewId:next.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 await service.operation('publish_draft',{draftId:id,expectedVersion:3,previewId:next.previewId},'publisher');
 assert.equal((await service.publishedCues())[0].texts.textTitle,'Next title');
 const revisions=await service.operation('list_revisions',{draftId:id},'tester') as ListRevisionsResult;assert.equal(revisions.revisions.length,2);assert.equal(revisions.revisions[0].cue.texts.textTitle,'Reviewed title');
 await service.operation('rollback_draft',{draftId:id,expectedVersion:3,revision:1},'publisher');
 assert.equal((await service.publishedCues())[0].texts.textTitle,'Reviewed title');
});

test('duplicate_draft creates an unpublished independent copy from drafts and catalog cues',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);const editable=editableFromBaseline(BARECHU);
 const original=(await service.operation('create_draft',editable,'tester') as DraftResult).draft;
 const copied=await service.operation('duplicate_draft',{draftId:original.id,name:'My Barechu'},'tester') as DuplicateDraftResult;
 assert.notEqual(copied.draft.id,original.id);assert.equal(copied.draft.name,'My Barechu');assert.equal(copied.draft.version,1);assert.equal(copied.draft.activeRevision,null);assert.deepEqual(copied.draft.content,original.content);
 assert.deepEqual(copied.duplicatedFrom,{kind:'draft',id:original.id});assert.equal((await service.operation('get_draft',{draftId:original.id},'tester') as DraftResult).draft.name,original.name);
 const local=await service.operation('duplicate_draft',{cueId:'09f50803-3288-4b78-bcc7-560025668e1a'},'tester') as DuplicateDraftResult;
 assert.equal(local.draft.content.mode,'custom');assert.match((local.draft.content as {text:string}).text,/Thank you for joining/);assert.equal(local.draft.activeRevision,null);
 await assert.rejects(service.operation('duplicate_draft',{},'tester'),(e)=>(e as AuthoringError).code==='invalid_input');
 await assert.rejects(service.operation('duplicate_draft',{draftId:original.id,cueId:BARECHU},'tester'),(e)=>(e as AuthoringError).code==='invalid_input');
});

test('preview_content is ephemeral and cannot satisfy stored review publication',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);const editable=editableFromBaseline(BARECHU);
 const before=(await service.operation('list_drafts',{},'tester') as ListDraftsResult).drafts.length;
 const preview=await service.operation('preview_content',{...editable,title:'Unsaved title'},'tester') as PreviewContentResult;
 assert.equal(preview.ephemeral,true);assert.equal(preview.cue.texts.textTitle,'Unsaved title');assert.equal(preview.validation.valid,true);assert.equal((await service.operation('list_drafts',{},'tester') as ListDraftsResult).drafts.length,before);
 const saved=(await service.operation('create_draft',{...editable,name:'Ephemeral Barechu'},'tester') as DraftResult).draft;
 await assert.rejects(service.operation('publish_draft',{draftId:saved.id,expectedVersion:1,previewId:preview.cue.id},'tester'),(e)=>(e as AuthoringError).code==='unknown_preview');
});

test('list_catalog exposes effective cues for edit or duplicate without mutating playback',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const baseline=await service.operation('list_catalog',{},'tester') as ListCatalogResult;const barechu=baseline.cues.find(cue=>cue.id===BARECHU)!;const thankYou=baseline.cues.find(cue=>cue.name==='Thank you')!;
 assert.equal(barechu.origin,'canonical');assert.equal(barechu.canEdit,true);assert.equal(barechu.editAction,'import');assert.equal(barechu.canDuplicate,true);assert.equal(thankYou.origin,'legacy');assert.equal(thankYou.editAction,'duplicate');
 const imported=await service.operation('import_cue',{cueId:BARECHU},'tester') as ImportCueResult;
 const after=await service.operation('list_catalog',{},'tester') as ListCatalogResult;const editable=after.cues.find(cue=>cue.id===BARECHU)!;
 assert.equal(editable.canEdit,true);assert.equal(editable.editAction,'open');assert.equal(editable.draftId,imported.draft.id);assert.equal(editable.activeRevision,1);
 assert.deepEqual((await service.publishedCues())[0],baselineCues.find(cue=>cue.id===BARECHU));
});

test('source search supports browsing, canonical text, and strict filters',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const facets=await service.operation('source_facets',{},'tester') as {books:Array<{value:string;label:string;count:number}>;services:Array<{value:string;label:string;count:number}>};assert.ok(facets.books.length>1);assert.ok(facets.services.length>1);assert.ok(facets.books.every(item=>item.value&&item.label&&item.count>0));assert.ok(Buffer.byteLength(JSON.stringify(facets))<16*1024);
 assert.equal(facets.books.reduce((sum,item)=>sum+item.count,0),677,'legacy/expanded equivalents are counted once and English-only units remain browsable');
 const browse=await service.operation('search_sources',{query:'',limit:3},'tester') as SearchSourcesResult;assert.equal(browse.sources.length,3);
 assert.ok(Buffer.byteLength(JSON.stringify(await service.operation('search_sources',{query:'',limit:50},'tester')))<=128*1024);
 const hebrew=await service.operation('search_sources',{query:'הריני'},'tester') as SearchSourcesResult;assert.ok(hebrew.sources.some(source=>source.name==='Hareini'));
 const opening=await service.operation('search_sources',{query:'m’kabeil alai'},'tester') as SearchSourcesResult;assert.ok(opening.sources.some(source=>source.name==='Hareini'));
 const ranked=await service.operation('search_sources',{query:'Hareini',limit:10},'tester') as SearchSourcesResult;assert.equal(ranked.sources[0].name,'Hareini');
 const legacyEquivalent=await service.operation('search_sources',{query:'Hareini',book:'legacy-shabbat-morning',limit:10},'tester') as SearchSourcesResult;assert.ok(legacyEquivalent.sources.some(source=>source.id==='library:legacy-shabbat-morning:awakening.hareini@legacy-shabbat-morning'));assert.ok(!legacyEquivalent.sources.some(source=>source.id==='awakening.hareini@legacy-shabbat-morning'));
 const modehAni=await service.operation('search_sources',{query:'Modeh Ani',book:'legacy-shabbat-morning',limit:10},'tester') as SearchSourcesResult;const richModehAni=modehAni.sources.find(source=>source.name==='Modeh Ani')!;assert.ok(richModehAni.id.startsWith('library:legacy-shabbat-morning:'));assert.equal(richModehAni.coverage.sourceEnglish,1);
 const modehSource=await service.operation('get_source',{sourceId:richModehAni.id},'tester') as GetSourceResult;assert.ok(modehSource.source.blocks.some(block=>block.kind==='source-en'&&block.en));const legacyModeh=await service.operation('get_source',{sourceId:'awakening.modeh-ani@legacy-shabbat-morning'},'tester') as GetSourceResult;assert.equal(legacyModeh.source.id,'awakening.modeh-ani@legacy-shabbat-morning','legacy source ID remains directly resolvable');
 const friendlyBook=facets.books.find(item=>item.label==='CRC Kabbalat Shabbat');if(friendlyBook){const byValue=await service.operation('search_sources',{book:friendlyBook.value,limit:2},'tester') as SearchSourcesResult;const byLabel=await service.operation('search_sources',{book:friendlyBook.label,limit:2},'tester') as SearchSourcesResult;assert.deepEqual(byValue.sources.map(source=>source.id),byLabel.sources.map(source=>source.id))}
 const filtered=await service.operation('search_sources',{book:'CRC Shabbat Morning Siddur',service:'Shabbat Morning',limit:50},'tester') as SearchSourcesResult;assert.ok(filtered.sources.length);assert.ok(filtered.sources.every(source=>source.book==='CRC Shabbat Morning Siddur'&&source.service==='Shabbat Morning'));
 const sourceEnglish=await service.operation('search_sources',{query:'April 6, 2019',limit:10},'tester') as SearchSourcesResult;assert.ok(sourceEnglish.sources.some(source=>source.coverage.sourceEnglish>0&&source.coverage.noteLikeEnglish>0));
 await assert.rejects(service.operation('search_sources',{query:'welcome',unknown:true},'tester'),(e)=>(e as AuthoringError).code==='invalid_input');
});

test('whole-prayer draft sets preserve source order, one block per row, and unpublished linkage',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const result=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'tester') as DraftSetResult;
 assert.equal(result.set.name,'Kol Nidre');assert.equal(result.set.count,7);assert.equal(result.drafts.length,7);assert.deepEqual(result.set.draftIds,result.drafts.map(draft=>draft.id));
 const selected:string[]=[];
 for(const [offset,draft] of result.drafts.entries()){
  assert.equal(draft.name,`Kol Nidre — ${String(offset+1).padStart(2,'0')} of 07`);assert.equal(draft.title,'Kol Nidre');assert.equal(draft.draftSetId,result.set.id);assert.equal(draft.setIndex,offset+1);assert.equal(draft.setCount,7);assert.equal(draft.activeRevision,null);
  const content=draft.content as BilingualContent;
  assert.ok(content.hebrewGroups.length<=3);assert.ok(content.hebrewGroups.every(group=>group.blockIds.length===1));assert.deepEqual(content.hebrewGroups,content.transliterationGroups);
  selected.push(...content.hebrewGroups.flatMap(group=>group.blockIds));
 }
 assert.equal(new Set(selected).size,20);assert.deepEqual(await service.publishedCues(),[]);
 const preview=await service.operation('preview_draft',{draftId:result.drafts[0].id,expectedVersion:1},'tester') as PreviewDraftResult;const canonical=sourcePack.sources.find(source=>source.id===KOL_NIDRE)!;const firstContent=result.drafts[0].content as BilingualContent;const firstIds=firstContent.hebrewGroups.map(group=>group.blockIds[0]);
 assert.equal(preview.cue.contentRows!.length,firstIds.length);assert.deepEqual(preview.cue.contentRows,firstIds.map((id:string)=>{const block=canonical.blocks.find(item=>item.id===id)!;return {he:block.he,tr:block.tr,en:''}}));
});

test('bottom sets use one canonical block per draft and mode availability is strict',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const bottom=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'bottom',templateCueId:BARECHU},'tester') as DraftSetResult;
 assert.equal(bottom.set.count,20);assert.ok(bottom.drafts.every(draft=>(draft.content as BilingualContent).hebrewGroups.length===1));
 const english=await service.operation('create_source_draft_set',{sourceId:OPENING_PRAYER,mode:'original-en',layout:'right',templateCueId:RIGHT_PANEL},'tester') as DraftSetResult;
 assert.ok(english.set.count>1);assert.ok(english.drafts.flatMap(draft=>(draft.content as OriginalEnglishContent).englishGroups).every(group=>group.blockIds.length===1));
 await assert.rejects(service.operation('create_source_draft_set',{sourceId:OPENING_PRAYER,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'tester'),(error)=>(error as AuthoringError).code==='source_mode_unavailable');
 await assert.rejects(service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',includeTranslation:true,layout:'bottom',templateCueId:BARECHU},'tester'),(error)=>(error as AuthoringError).code==='translation_layout');
});

test('source English sets include automatic text while note-like English remains manually selectable',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const source=sourcePack.sources.find(item=>item.blocks.some(block=>block.kind==='source-en'&&block.automatic===true)&&item.blocks.some(block=>block.kind==='source-en'&&block.automatic===false))!;
 const expected=source.blocks.filter(block=>block.kind==='source-en'&&block.automatic!==false).map(block=>block.id);
 const generated=await service.operation('create_source_draft_set',{sourceId:source.id,mode:'source-en',layout:'bottom',templateCueId:BARECHU},'tester') as DraftSetResult;
 assert.deepEqual(generated.drafts.flatMap(draft=>(draft.content as SourceEnglishContent).englishGroups.flatMap(group=>group.blockIds)),expected);
 const note=source.blocks.find(block=>block.kind==='source-en'&&block.automatic===false)!;
 const manual=await service.operation('create_draft',{name:'Manual source note',title:source.name,layout:'bottom',templateCueId:BARECHU,content:{mode:'source-en',englishGroups:[{sourceId:source.id,blockIds:[note.id]}]},presentation:{}},'tester') as DraftResult;
 assert.equal(buildCue(manual.draft).texts.textMain,note.en);assert.equal(manual.draft.sourcePin.blockSha256[JSON.stringify([source.id,note.id])],note.sourceBlockSha256);
});

test('local liturgical variants retain exact canonical text and machine-readable deviations',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);const imported=await service.operation('import_cue',{cueId:BARECHU},'editor') as ImportCueResult;const base=imported.draft;
 const bilingualContent=base.content as BilingualContent;const group=bilingualContent.hebrewGroups[0];
 const snapshots=base.sourceSnapshots??[];const sourceForGroup=snapshots.find(source=>source.id===group.sourceId)!;const block=sourceForGroup.blocks.find(item=>item.id===group.blockIds[0])!;
 const result=await service.operation('create_local_variant',{draftId:base.id,label:'TBI customary wording',reason:'Local minhag',overrides:[{sourceId:group.sourceId,blockId:block.id,channel:'he',localText:`${block.he}׃`}]},'editor') as DraftResult;
 const variantContent=result.draft.content as LocalVariantContent;
 assert.equal(variantContent.mode,'local-variant');assert.equal(variantContent.overrides[0].sourceText,block.he);assert.equal(variantContent.overrides[0].localText,`${block.he}׃`);assert.equal(result.draft.activeRevision,null);assert.equal(buildCue(result.draft).authoring.origin,'variant');assert.ok(buildCue(result.draft).texts.textMainheb?.includes(`${block.he}׃`));assert.equal((await repo.getDraft(base.id))!.content.mode,'bilingual');
 await assert.rejects(service.operation('create_local_variant',{draftId:base.id,label:'Bad target',overrides:[{sourceId:group.sourceId,blockId:'missing',channel:'he',localText:'text'}]},'editor'),(error)=>(error as AuthoringError).code==='invalid_variant_target');
});

test('archive and restore hide editor records without changing published output',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);const imported=await service.operation('import_cue',{cueId:BARECHU},'editor') as ImportCueResult;assert.equal((await service.publishedCues()).some(cue=>cue.id===BARECHU),true);
 const archived=await service.operation('archive_draft',{draftId:BARECHU,expectedVersion:imported.draft.version},'editor') as DraftResult;assert.ok(archived.draft.archivedAt);assert.equal((await service.operation('list_drafts',{},'editor') as ListDraftsResult).drafts.some(draft=>draft.id===BARECHU),false);assert.equal((await service.operation('list_archived_drafts',{},'editor') as ListDraftsResult).drafts.some(draft=>draft.id===BARECHU),true);assert.equal((await service.operation('list_catalog',{},'editor') as ListCatalogResult).cues.some(cue=>cue.id===BARECHU),false);assert.equal((await service.publishedCues()).some(cue=>cue.id===BARECHU),true,'archive never removes the published output');
 const restored=await service.operation('restore_draft',{draftId:BARECHU,expectedVersion:archived.draft.version},'editor') as DraftResult;assert.equal(restored.draft.archivedAt,undefined);assert.equal(restored.draft.id,BARECHU);assert.equal(restored.draft.version,archived.draft.version+1);
});

test('draft-set reorder and in-set duplicate are atomic and preserve source content',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);const created=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'editor') as DraftSetResult;const expected=created.set.draftIds;const reversed=[...expected].reverse();
 const complete=await service.operation('review_draft_set',{setId:created.set.id},'editor') as ReviewDraftSetResult;assert.equal(complete.status,'complete');assert.equal(complete.expected!.length,complete.current!.length);
 const reordered=await service.operation('reorder_draft_set',{setId:created.set.id,expectedDraftIds:expected,orderedDraftIds:reversed},'editor') as DraftSetResult;assert.deepEqual(reordered.set.draftIds,reversed);assert.deepEqual(reordered.drafts.map(draft=>draft.setIndex),reversed.map((_,index)=>index+1));const orderReview=await service.operation('review_draft_set',{setId:created.set.id},'editor') as ReviewDraftSetResult;assert.equal(orderReview.status,'needs-review');assert.ok(orderReview.issues.some(issue=>issue.kind==='out-of-order'));
 await assert.rejects(service.operation('reorder_draft_set',{setId:created.set.id,expectedDraftIds:expected,orderedDraftIds:reversed},'editor'),(error)=>(error as AuthoringError).code==='version_conflict');
 const source=reordered.drafts[0];const duplicated=await service.operation('duplicate_draft_in_set',{draftId:source.id,expectedVersion:source.version,expectedDraftIds:reversed},'editor') as DraftSetResult;assert.equal(duplicated.set.count,reversed.length+1);assert.equal(duplicated.set.draftIds[1],duplicated.drafts[1].id);assert.notEqual(duplicated.drafts[1].id,source.id);assert.deepEqual(duplicated.drafts[1].content,source.content);assert.equal(duplicated.drafts[1].activeRevision,null);assert.deepEqual(duplicated.drafts.map(draft=>draft.setIndex),duplicated.drafts.map((_,index)=>index+1));const duplicateReview=await service.operation('review_draft_set',{setId:created.set.id},'editor') as ReviewDraftSetResult;assert.equal(duplicateReview.status,'needs-review');assert.ok(duplicateReview.issues.some(issue=>issue.kind==='duplicated'));
 const archived=await service.operation('archive_draft_set',{setId:created.set.id,expectedDraftIds:duplicated.set.draftIds},'editor') as DraftSetResult;assert.ok(archived.drafts.every(draft=>draft.archivedAt));assert.equal((await service.operation('list_drafts',{},'editor') as ListDraftsResult).drafts.some(draft=>draft.draftSetId===created.set.id),false);const restored=await service.operation('restore_draft_set',{setId:created.set.id,expectedDraftIds:duplicated.set.draftIds},'editor') as DraftSetResult;assert.ok(restored.drafts.every(draft=>!draft.archivedAt));assert.deepEqual(restored.drafts.map(draft=>draft.setIndex),restored.drafts.map((_,index)=>index+1));
});

test('long source English uses a conservative side-panel page budget without splitting canonical blocks',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());const sourceId='library:crc-neilah:neilah.neila-sim-shalom@crc-neilah';
 const source=sourcePack.sources.find(item=>item.id===sourceId)!;const automatic=source.blocks.filter(block=>block.kind==='source-en'&&block.automatic!==false);
 const result=await service.operation('create_source_draft_set',{sourceId,mode:'source-en',layout:'left',templateCueId:LEFT_PANEL},'tester') as DraftSetResult;
 assert.equal(result.drafts.length,2);assert.deepEqual(result.drafts.map(draft=>(draft.content as SourceEnglishContent).englishGroups.length),[1,2]);
 assert.deepEqual(result.drafts.flatMap(draft=>(draft.content as SourceEnglishContent).englishGroups.flatMap(group=>group.blockIds)),automatic.map(block=>block.id),'canonical blocks remain intact and ordered');
 for(const draft of result.drafts){const length=(draft.content as SourceEnglishContent).englishGroups.flatMap(group=>group.blockIds).reduce((sum,id)=>sum+(source.blocks.find(block=>block.id===id)?.en?.length??0),0);assert.ok(length<=400||(draft.content as SourceEnglishContent).englishGroups.length===1,'only an indivisible canonical block may exceed the conservative budget')}
});

test('memory draft-set insertion preflights the complete batch',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const result=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'tester') as DraftSetResult;const draft=result.drafts[0];
 await assert.rejects(repo.insertDraftSet([{...draft,id:'duplicate-in-batch'},{...draft,id:'duplicate-in-batch'}]),(error)=>(error as AuthoringError).code==='draft_exists');
 assert.equal(await repo.getDraft('duplicate-in-batch'),null);
});

test('custom publishing preserves exact-version review invariants and selected published payload',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const created=await service.operation('create_draft',{name:'Welcome',title:'CRC',layout:'right',templateCueId:'09f50803-3288-4b78-bcc7-560025668e1a',content:{mode:'custom',text:'Welcome!'},presentation:{}},'tester') as DraftResult;
 const preview=await service.operation('preview_draft',{draftId:created.draft.id,expectedVersion:1},'tester') as PreviewDraftResult;
 await service.operation('review_draft',{draftId:created.draft.id,expectedVersion:1,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 await service.operation('update_draft',{draftId:created.draft.id,expectedVersion:1,patch:{content:{mode:'custom',text:'Changed after review'}}},'tester');
 await assert.rejects(service.operation('publish_draft',{draftId:created.draft.id,expectedVersion:2,previewId:preview.previewId},'tester'),(e)=>(e as AuthoringError).code==='stale_preview');
 assert.equal((await service.publishedCues()).length,0);
});

test('in-memory authoring is development-only, relay-free, and visibly labeled',async()=>{
 const memory=authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development'});assert.deepEqual(memory,{rehearsal:true,storage:'memory',label:'Local rehearsal — changes are temporary'});
 assert.throws(()=>authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'production'}),(e)=>(e as AuthoringError).code==='unsafe_rehearsal_config');
 assert.throws(()=>authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development',RELAY_URL:'https://relay.example'}),(e)=>(e as AuthoringError).code==='unsafe_rehearsal_config');
 assert.throws(()=>authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'production',RELAY_URL:'memory'}),(e)=>(e as AuthoringError).code==='unsafe_rehearsal_config');
 assert.throws(()=>authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development',VERCEL:'1'}),(e)=>(e as AuthoringError).code==='unsafe_rehearsal_config');
 // RELAY_URL=memory is the in-process rehearsal stub, not a live relay.
 assert.deepEqual(authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development',RELAY_URL:'memory'}),{rehearsal:true,storage:'memory',label:'Local rehearsal — changes are temporary'});
 assert.deepEqual(authoringRepositoryMode({NODE_ENV:'production'}),{rehearsal:false,storage:'postgres',label:null});
 const service=createAuthoringService(new MemoryAuthoringRepository(),memory);const result=await service.operation('get_workspace',{},'tester') as GetWorkspaceResult;assert.deepEqual(result.workspace,memory);
});

test('list_book_units prints a book outline in printed order without shipping the corpus',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const shacharit=await service.operation('list_book_units',{book:'shabbat-shacharit'},'tester') as BookUnitsResult;
 assert.deepEqual(shacharit.book,{value:'shabbat-shacharit',label:'Shirei Shabbat · Shabbat Morning'});assert.equal(shacharit.service,'Shirei Shabbat · Shabbat Morning');
 assert.equal(shacharit.sections.length,9);assert.equal(shacharit.total,94);
 assert.deepEqual(shacharit.sections.map(section=>section.index),[0,1,2,3,4,5,6,7,8],'sections are printed in section order');
 assert.deepEqual(shacharit.sections[0].title,'Awakening');
 assert.equal(shacharit.sections.reduce((sum,section)=>sum+section.units.length,0),shacharit.total);
 const first=shacharit.sections[0].units[0];assert.equal(first.id,'library:shabbat-shacharit:awakening.modeh-ani@shabbat-shacharit');assert.equal(first.name,'Modah / Modeh Ani');assert.equal(first.folio,'p. 2');assert.equal(first.blockCount,2);assert.ok(first.kinds.includes('bilingual'));assert.equal(first.noteLikeOnly,false);
 // The outline names units; reading one still goes through get_source.
 assert.ok(!JSON.stringify(shacharit).includes('"he"'));
 const facets=await service.operation('source_facets',{},'tester') as {books:Array<{value:string;count:number}>};
 const books=await Promise.all(facets.books.map(book=>service.operation('list_book_units',{book:book.value},'tester') as Promise<BookUnitsResult>));
 assert.deepEqual(books.map(book=>book.total),facets.books.map(book=>book.count),'every browsable unit appears in exactly one book outline');
 assert.equal(books.reduce((sum,book)=>sum+book.noteLikeOnly,0),13,'note-only units are countable before a person opens them');
 for(const book of books)for(const section of book.sections)for(const unit of section.units)if(unit.noteLikeOnly)assert.deepEqual(unit.kinds,['source-en']);
 const largest=books.reduce((widest,book)=>Buffer.byteLength(JSON.stringify(book))>Buffer.byteLength(JSON.stringify(widest))?book:widest);
 assert.equal(largest.book.value,'shirei-tshuvah');assert.ok(Buffer.byteLength(JSON.stringify(largest))<128*1024,'the largest book outline stays inside the browser response budget');
 const byLabel=await service.operation('list_book_units',{book:'Shirei Tshuvah'},'tester') as BookUnitsResult;assert.equal(byLabel.total,largest.total);
 await assert.rejects(service.operation('list_book_units',{book:'no-such-book'},'tester'),(error)=>(error as AuthoringError).code==='unknown_source');
 await assert.rejects(service.operation('list_book_units',{book:'shabbat-shacharit',limit:5},'tester'),(error)=>(error as AuthoringError).code==='invalid_input');
});

test('preview_baseline_cue renders a baseline graphic without importing it',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const preview=await service.operation('preview_baseline_cue',{cueId:BARECHU},'tester') as PreviewContentResult;
 assert.equal(preview.ephemeral,true);assert.equal(preview.validation.valid,true);
 assert.equal(preview.cue.texts.textTitle,baselineCues.find(cue=>cue.id===BARECHU)!.texts.textTitle);
 assert.equal((await service.operation('list_drafts',{},'tester') as ListDraftsResult).drafts.length,0,'looking at a baseline stores nothing');
 assert.deepEqual(await service.publishedCues(),[]);
 // The non-liturgical archive copy refuses here exactly as it refuses import.
 await assert.rejects(service.operation('preview_baseline_cue',{cueId:RIGHT_PANEL},'tester'),(error)=>(error as AuthoringError).code==='unmanaged_content');
 await assert.rejects(service.operation('preview_baseline_cue',{cueId:'missing'},'tester'),(error)=>(error as AuthoringError).code==='unknown_cue');
});

test('the editor panel budget agrees with the server prayer split',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const canonical=sourcePack.sources.find(source=>source.id===KOL_NIDRE)!;
 const blocksOf=(draft:Draft)=>(draft.content as BilingualContent).hebrewGroups.flatMap(group=>group.blockIds).map(id=>canonical.blocks.find(block=>block.id===id)!);
 const panels=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'tester') as DraftSetResult;
 for(const draft of panels.drafts)assert.equal(exceedsOnePanel(blocksOf(draft),'bilingual','left'),false,'every page the server produced fits one panel');
 const all=panels.drafts.flatMap(blocksOf);
 assert.equal(exceedsOnePanel(all,'bilingual','left'),true,'the whole prayer needs more than one panel');
 assert.equal(exceedsOnePanel(all.slice(0,1),'bilingual','left'),false);
 assert.equal(exceedsOnePanel(all.slice(0,4),'bilingual','left'),true);
 assert.equal(exceedsOnePanel(all.slice(0,2),'bilingual','bottom'),true);
 const bottom=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'bottom',templateCueId:BARECHU},'tester') as DraftSetResult;
 for(const draft of bottom.drafts)assert.equal(exceedsOnePanel(blocksOf(draft),'bilingual','bottom'),false);
});

// The CRC shelf, end to end against the real service: a synthetic CRC graphic, a fake feed,
// and the three things a person needs the shelf to say.
const crcPublished=(overrides:Partial<Draft>={}):Draft=>{
 const editable=editableFromBaseline(BARECHU);const now=Date.now();
 return {...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:1,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:'crc-editor',updatedBy:'crc-editor',...overrides};
};

test('the CRC shelf says what is new, what TBI already has, and what CRC changed since',async()=>{
 const crcDraft=crcPublished({name:'CRC Barechu',title:'Barechu'});const cue=buildCue(crcDraft);
 let payload=buildSharedLibraryPayload({cues:[cue],version:'crc-v1'});
 const repo=new MemoryAuthoringRepository();const tbi=createAuthoringService(repo,undefined,{get:async()=>({available:true,configured:true,stale:false,refreshedAt:1,payload}) as SharedLibrarySnapshot});
 const first=await tbi.operation('list_shared_library',{},'simone') as SharedShelfList;
 assert.equal(first.cues.length,1);assert.equal(first.cues[0].state,'new');assert.deepEqual(first.cues[0].local.drafts,[]);assert.equal(first.cues[0].set,undefined);

 const copied=await tbi.operation('customize_shared_cue',{cueId:cue.id,expectedCueHash:payload.cues[0].cueHash,name:'TBI Barechu'},'simone') as DraftResult;
 assert.equal(copied.draft.name,'TBI Barechu');assert.equal(copied.draft.activeRevision,null);
 assert.ok(copied.draft.sharedFrom!.importedAt);assert.equal(copied.draft.sharedFrom!.upstream!.texts.textTitle,cue.texts.textTitle);
 const afterCopy=await tbi.operation('list_shared_library',{},'simone') as SharedShelfList;
 assert.equal(afterCopy.cues[0].state,'customized');assert.deepEqual(afterCopy.cues[0].local.drafts.map(draft=>draft.id),[copied.draft.id]);

 const edited=await tbi.operation('update_draft',{draftId:copied.draft.id,expectedVersion:1,patch:{title:'TBI wording'}},'simone') as DraftResult;
 assert.equal(edited.draft.title,'TBI wording');const settled=structuredClone(edited.draft);

 // CRC republishes the same graphic with different Hebrew. Nothing local may move.
 const republished=structuredClone(cue);republished.texts.textMainheb=`${republished.texts.textMainheb} ׃`;
 payload=buildSharedLibraryPayload({cues:[republished],version:'crc-v2'});
 assert.notEqual(payload.cues[0].cueHash,copied.draft.sharedFrom!.cueHash);
 const stale=await tbi.operation('list_shared_library',{},'simone') as SharedShelfList;
 assert.equal(stale.cues[0].state,'updated');assert.equal(stale.cues[0].local.drafts[0].cueHash,copied.draft.sharedFrom!.cueHash);
 assert.deepEqual(await repo.getDraft(copied.draft.id),settled,'a CRC change never rewrites the local graphic');

 const comparison=await tbi.operation('compare_shared_cue',{cueId:cue.id,draftId:copied.draft.id},'simone') as SharedCompareResult;
 assert.equal(comparison.beforeAvailable,true);assert.deepEqual(comparison.changed,{wording:true,layout:false,presentation:false});
 assert.ok(comparison.lines.some(line=>line.changed));assert.equal(comparison.after.texts.textMainheb,republished.texts.textMainheb);

 const second=await tbi.operation('customize_shared_cue',{cueId:cue.id,expectedCueHash:payload.cues[0].cueHash},'simone') as DraftResult;
 assert.notEqual(second.draft.id,copied.draft.id);
 const both=await tbi.operation('list_shared_library',{},'simone') as SharedShelfList;
 assert.equal(both.cues[0].state,'customized');assert.equal(both.cues[0].local.drafts.length,2);
 await assert.rejects(tbi.operation('customize_shared_cue',{cueId:cue.id,expectedCueHash:copied.draft.sharedFrom!.cueHash},'simone'),(error)=>(error as AuthoringError).code==='shared_cue_changed');
});

test('a graphic copied before origin wording was recorded compares without a before',async()=>{
 const crcDraft=crcPublished({name:'CRC Barechu',title:'Barechu'});const cue=buildCue(crcDraft);
 const payload=buildSharedLibraryPayload({cues:[cue],version:'crc-v1'});
 const repo=new MemoryAuthoringRepository();const tbi=createAuthoringService(repo,undefined,{get:async()=>({available:true,configured:true,stale:false,refreshedAt:1,payload}) as SharedLibrarySnapshot});
 // Copies made before the shelf recorded origin wording carry no upstream snapshot.
 const legacy=crcPublished({name:'TBI Barechu (historical copy)',activeRevision:null,activeDraftVersion:null,sharedFrom:{workspaceId:'crc',cueId:cue.id,cueHash:payload.cues[0].cueHash}});
 await repo.insertDraft(legacy);
 const comparison=await tbi.operation('compare_shared_cue',{cueId:cue.id,draftId:legacy.id},'simone') as SharedCompareResult;
 assert.equal(comparison.beforeAvailable,false);assert.equal(comparison.before,null);assert.deepEqual(comparison.lines,[]);
 assert.deepEqual(comparison.changed,{wording:false,layout:false,presentation:false});
 assert.equal(comparison.after.texts.textTitle,cue.texts.textTitle);
 assert.equal((await tbi.operation('list_shared_library',{},'simone') as SharedShelfList).cues[0].state,'customized');
});

test('a CRC whole prayer copies into TBI as one multipart graphic, all of it or none',async()=>{
 const setId='crc-whole-prayer-set';
 const members=[1,2].map(index=>crcPublished({name:`CRC Adon Olam — 0${index} of 02`,title:'Adon Olam',draftSetId:setId,setIndex:index,setCount:2}));
 const payload=buildSharedLibraryPayload({cues:members.map(draft=>buildCue(draft)),version:'crc-set'},members);
 const snapshot={available:true,configured:true,stale:false,refreshedAt:1,payload} as SharedLibrarySnapshot;
 const tbi=createAuthoringService(new MemoryAuthoringRepository(),undefined,{get:async()=>snapshot});
 const expectedCueHashes=Object.fromEntries(payload.cues.map(entry=>[entry.id,entry.cueHash]));
 await assert.rejects(tbi.operation('customize_shared_set',{setId,expectedCueHashes:{...expectedCueHashes,[payload.cues[0].id]:'0'.repeat(64)}},'simone'),(error)=>(error as AuthoringError).code==='shared_cue_changed');
 assert.deepEqual((await tbi.operation('list_drafts',{},'simone') as ListDraftsResult).drafts,[],'a refused copy writes nothing');
 const result=await tbi.operation('customize_shared_set',{setId,expectedCueHashes},'simone') as DraftSetResult;
 assert.equal(result.drafts.length,2);assert.equal(result.set.count,2);assert.equal(result.set.name,'Adon Olam');
 assert.equal(new Set(result.drafts.map(draft=>draft.draftSetId)).size,1);
 assert.notEqual(result.drafts[0].draftSetId,setId,'TBI owns its own set id');
 assert.deepEqual(result.drafts.map(draft=>draft.setIndex),[1,2]);
 assert.deepEqual(result.drafts.map(draft=>draft.sharedFrom!.cueId),payload.cues.map(entry=>entry.id));
 assert.ok(result.drafts.every(draft=>draft.setCount===2&&draft.draftSetManifest&&draft.activeRevision===null));
 const list=await tbi.operation('list_shared_library',{},'simone') as SharedShelfList;
 assert.ok(list.cues.every(entry=>entry.state==='customized'&&entry.set!.id===setId&&entry.set!.count===2));
 assert.deepEqual(list.cues.map(entry=>entry.set!.index),[1,2]);
});

test('an unavailable CRC library leaves the shelf empty and local authoring untouched',async()=>{
 const unavailable={available:false,configured:true,stale:false,error:'CRC library is temporarily unavailable.'} as SharedLibrarySnapshot;
 const tbi=createAuthoringService(new MemoryAuthoringRepository(),undefined,{get:async()=>unavailable});
 const list=await tbi.operation('list_shared_library',{},'simone') as {available:boolean};
 assert.equal(list.available,false);
 await assert.rejects(tbi.operation('customize_shared_set',{setId:'anything',expectedCueHashes:{a:'0'.repeat(64)}},'simone'),(error)=>(error as AuthoringError).code==='shared_library_unavailable');
 const local=await tbi.operation('create_draft',editableFromBaseline(BARECHU),'simone') as DraftResult;
 assert.ok(local.draft.id);
});
