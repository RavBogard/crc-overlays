import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,baselineCues,buildCue,editableFromBaseline,sourcePack} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,authoringRepositoryMode,createAuthoringService,type AuthoringWorkspace} from '../lib/authoring.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const LEFT_PANEL='bbd7c98b-f1de-41ee-9719-2bb27a30d0db';
const RIGHT_PANEL='09f50803-3288-4b78-bcc7-560025668e1a';
const KOL_NIDRE='library:crc-kol-nidre:erev-yk.kol-nidre@crc-kol-nidre';
const OPENING_PRAYER='library:crc-kol-nidre:erev-yk.opening-prayer@crc-kol-nidre';
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

test('duplicate_draft creates an unpublished independent copy from drafts and catalog cues',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);const editable=editableFromBaseline(BARECHU);
 const original=(await service.operation('create_draft',editable,'tester') as any).draft;
 const copied=await service.operation('duplicate_draft',{draftId:original.id,name:'My Barechu'},'tester') as any;
 assert.notEqual(copied.draft.id,original.id);assert.equal(copied.draft.name,'My Barechu');assert.equal(copied.draft.version,1);assert.equal(copied.draft.activeRevision,null);assert.deepEqual(copied.draft.content,original.content);
 assert.deepEqual(copied.duplicatedFrom,{kind:'draft',id:original.id});assert.equal((await service.operation('get_draft',{draftId:original.id},'tester') as any).draft.name,original.name);
 const local=await service.operation('duplicate_draft',{cueId:'09f50803-3288-4b78-bcc7-560025668e1a'},'tester') as any;
 assert.equal(local.draft.content.mode,'custom');assert.match(local.draft.content.text,/Thank you for joining/);assert.equal(local.draft.activeRevision,null);
 await assert.rejects(service.operation('duplicate_draft',{},'tester'),(e:any)=>e.code==='invalid_input');
 await assert.rejects(service.operation('duplicate_draft',{draftId:original.id,cueId:BARECHU},'tester'),(e:any)=>e.code==='invalid_input');
});

test('preview_content is ephemeral and cannot satisfy stored review publication',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);const editable=editableFromBaseline(BARECHU);
 const before=(await service.operation('list_drafts',{},'tester') as any).drafts.length;
 const preview=await service.operation('preview_content',{...editable,title:'Unsaved title'},'tester') as any;
 assert.equal(preview.ephemeral,true);assert.equal(preview.cue.texts.textTitle,'Unsaved title');assert.equal(preview.validation.valid,true);assert.equal((await service.operation('list_drafts',{},'tester') as any).drafts.length,before);
 const saved=(await service.operation('create_draft',editable,'tester') as any).draft;
 await assert.rejects(service.operation('publish_draft',{draftId:saved.id,expectedVersion:1,previewId:preview.cue.id},'tester'),(e:any)=>e.code==='unknown_preview');
});

test('list_catalog exposes effective cues for edit or duplicate without mutating playback',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const baseline=await service.operation('list_catalog',{},'tester') as any;const barechu=baseline.cues.find((cue:any)=>cue.id===BARECHU);const thankYou=baseline.cues.find((cue:any)=>cue.name==='Thank you');
 assert.equal(barechu.origin,'canonical');assert.equal(barechu.canEdit,true);assert.equal(barechu.editAction,'import');assert.equal(barechu.canDuplicate,true);assert.equal(thankYou.origin,'legacy');assert.equal(thankYou.editAction,'duplicate');
 const imported=await service.operation('import_cue',{cueId:BARECHU},'tester') as any;
 const after=await service.operation('list_catalog',{},'tester') as any;const editable=after.cues.find((cue:any)=>cue.id===BARECHU);
 assert.equal(editable.canEdit,true);assert.equal(editable.editAction,'open');assert.equal(editable.draftId,imported.draft.id);assert.equal(editable.activeRevision,1);
 assert.deepEqual((await service.publishedCues())[0],baselineCues.find(cue=>cue.id===BARECHU));
});

test('source search supports browsing, canonical text, and strict filters',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const facets=await service.operation('source_facets',{},'tester') as {books:Array<{value:string;label:string;count:number}>;services:Array<{value:string;label:string;count:number}>};assert.ok(facets.books.length>1);assert.ok(facets.services.length>1);assert.ok(facets.books.every(item=>item.value&&item.label&&item.count>0));assert.ok(Buffer.byteLength(JSON.stringify(facets))<16*1024);
 assert.equal(facets.books.reduce((sum,item)=>sum+item.count,0),677,'legacy/expanded equivalents are counted once and English-only units remain browsable');
 const browse=await service.operation('search_sources',{query:'',limit:3},'tester') as any;assert.equal(browse.sources.length,3);
 assert.ok(Buffer.byteLength(JSON.stringify(await service.operation('search_sources',{query:'',limit:50},'tester')))<=128*1024);
 const hebrew=await service.operation('search_sources',{query:'הריני'},'tester') as any;assert.ok(hebrew.sources.some((source:any)=>source.name==='Hareini'));
 const opening=await service.operation('search_sources',{query:'m’kabeil alai'},'tester') as any;assert.ok(opening.sources.some((source:any)=>source.name==='Hareini'));
 const ranked=await service.operation('search_sources',{query:'Hareini',limit:10},'tester') as any;assert.equal(ranked.sources[0].name,'Hareini');
 const legacyEquivalent=await service.operation('search_sources',{query:'Hareini',book:'legacy-shabbat-morning',limit:10},'tester') as any;assert.ok(legacyEquivalent.sources.some((source:any)=>source.id==='library:legacy-shabbat-morning:awakening.hareini@legacy-shabbat-morning'));assert.ok(!legacyEquivalent.sources.some((source:any)=>source.id==='awakening.hareini@legacy-shabbat-morning'));
 const modehAni=await service.operation('search_sources',{query:'Modeh Ani',book:'legacy-shabbat-morning',limit:10},'tester') as any;const richModehAni=modehAni.sources.find((source:any)=>source.name==='Modeh Ani');assert.ok(richModehAni.id.startsWith('library:legacy-shabbat-morning:'));assert.equal(richModehAni.coverage.sourceEnglish,1);
 const modehSource=await service.operation('get_source',{sourceId:richModehAni.id},'tester') as any;assert.ok(modehSource.source.blocks.some((block:any)=>block.kind==='source-en'&&block.en));const legacyModeh=await service.operation('get_source',{sourceId:'awakening.modeh-ani@legacy-shabbat-morning'},'tester') as any;assert.equal(legacyModeh.source.id,'awakening.modeh-ani@legacy-shabbat-morning','legacy source ID remains directly resolvable');
 const friendlyBook=facets.books.find(item=>item.label==='CRC Kabbalat Shabbat');if(friendlyBook){const byValue=await service.operation('search_sources',{book:friendlyBook.value,limit:2},'tester') as any;const byLabel=await service.operation('search_sources',{book:friendlyBook.label,limit:2},'tester') as any;assert.deepEqual(byValue.sources.map((source:any)=>source.id),byLabel.sources.map((source:any)=>source.id))}
 const filtered=await service.operation('search_sources',{book:'CRC Shabbat Morning Siddur',service:'Shabbat Morning',limit:50},'tester') as any;assert.ok(filtered.sources.length);assert.ok(filtered.sources.every((source:any)=>source.book==='CRC Shabbat Morning Siddur'&&source.service==='Shabbat Morning'));
 const sourceEnglish=await service.operation('search_sources',{query:'April 6, 2019',limit:10},'tester') as any;assert.ok(sourceEnglish.sources.some((source:any)=>source.coverage.sourceEnglish>0&&source.coverage.noteLikeEnglish>0));
 await assert.rejects(service.operation('search_sources',{query:'welcome',unknown:true},'tester'),(e:any)=>e.code==='invalid_input');
});

test('whole-prayer draft sets preserve source order, one block per row, and unpublished linkage',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const result=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'tester') as any;
 assert.equal(result.set.name,'Kol Nidre');assert.equal(result.set.count,7);assert.equal(result.drafts.length,7);assert.deepEqual(result.set.draftIds,result.drafts.map((draft:any)=>draft.id));
 const selected:string[]=[];
 for(const [offset,draft] of result.drafts.entries()){
  assert.equal(draft.name,`Kol Nidre — ${String(offset+1).padStart(2,'0')} of 07`);assert.equal(draft.title,'Kol Nidre');assert.equal(draft.draftSetId,result.set.id);assert.equal(draft.setIndex,offset+1);assert.equal(draft.setCount,7);assert.equal(draft.activeRevision,null);
  assert.ok(draft.content.hebrewGroups.length<=3);assert.ok(draft.content.hebrewGroups.every((group:any)=>group.blockIds.length===1));assert.deepEqual(draft.content.hebrewGroups,draft.content.transliterationGroups);
  selected.push(...draft.content.hebrewGroups.flatMap((group:any)=>group.blockIds));
 }
 assert.equal(new Set(selected).size,20);assert.deepEqual(await service.publishedCues(),[]);
 const preview=await service.operation('preview_draft',{draftId:result.drafts[0].id,expectedVersion:1},'tester') as any;const canonical=sourcePack.sources.find(source=>source.id===KOL_NIDRE)!;const firstIds=result.drafts[0].content.hebrewGroups.map((group:any)=>group.blockIds[0]);
 assert.equal(preview.cue.contentRows.length,firstIds.length);assert.deepEqual(preview.cue.contentRows,firstIds.map((id:string)=>{const block=canonical.blocks.find(item=>item.id===id)!;return {he:block.he,tr:block.tr,en:''}}));
});

test('bottom sets use one canonical block per draft and mode availability is strict',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const bottom=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'bottom',templateCueId:BARECHU},'tester') as any;
 assert.equal(bottom.set.count,20);assert.ok(bottom.drafts.every((draft:any)=>draft.content.hebrewGroups.length===1));
 const english=await service.operation('create_source_draft_set',{sourceId:OPENING_PRAYER,mode:'original-en',layout:'right',templateCueId:RIGHT_PANEL},'tester') as any;
 assert.ok(english.set.count>1);assert.ok(english.drafts.flatMap((draft:any)=>draft.content.englishGroups).every((group:any)=>group.blockIds.length===1));
 await assert.rejects(service.operation('create_source_draft_set',{sourceId:OPENING_PRAYER,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'tester'),(error:any)=>error.code==='source_mode_unavailable');
 await assert.rejects(service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',includeTranslation:true,layout:'bottom',templateCueId:BARECHU},'tester'),(error:any)=>error.code==='translation_layout');
});

test('source English sets include automatic text while note-like English remains manually selectable',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const source=sourcePack.sources.find(item=>item.blocks.some(block=>block.kind==='source-en'&&block.automatic===true)&&item.blocks.some(block=>block.kind==='source-en'&&block.automatic===false))!;
 const expected=source.blocks.filter(block=>block.kind==='source-en'&&block.automatic!==false).map(block=>block.id);
 const generated=await service.operation('create_source_draft_set',{sourceId:source.id,mode:'source-en',layout:'bottom',templateCueId:BARECHU},'tester') as any;
 assert.deepEqual(generated.drafts.flatMap((draft:any)=>draft.content.englishGroups.flatMap((group:any)=>group.blockIds)),expected);
 const note=source.blocks.find(block=>block.kind==='source-en'&&block.automatic===false)!;
 const manual=await service.operation('create_draft',{name:'Manual source note',title:source.name,layout:'bottom',templateCueId:BARECHU,content:{mode:'source-en',englishGroups:[{sourceId:source.id,blockIds:[note.id]}]},presentation:{}},'tester') as any;
 assert.equal(buildCue(manual.draft).texts.textMain,note.en);assert.equal(manual.draft.sourcePin.blockSha256[JSON.stringify([source.id,note.id])],note.sourceBlockSha256);
});

test('long source English uses a conservative side-panel page budget without splitting canonical blocks',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());const sourceId='library:crc-neilah:neilah.neila-sim-shalom@crc-neilah';
 const source=sourcePack.sources.find(item=>item.id===sourceId)!;const automatic=source.blocks.filter(block=>block.kind==='source-en'&&block.automatic!==false);
 const result=await service.operation('create_source_draft_set',{sourceId,mode:'source-en',layout:'left',templateCueId:LEFT_PANEL},'tester') as any;
 assert.equal(result.drafts.length,2);assert.deepEqual(result.drafts.map((draft:any)=>draft.content.englishGroups.length),[1,2]);
 assert.deepEqual(result.drafts.flatMap((draft:any)=>draft.content.englishGroups.flatMap((group:any)=>group.blockIds)),automatic.map(block=>block.id),'canonical blocks remain intact and ordered');
 for(const draft of result.drafts){const length=draft.content.englishGroups.flatMap((group:any)=>group.blockIds).reduce((sum:number,id:string)=>sum+(source.blocks.find(block=>block.id===id)?.en?.length??0),0);assert.ok(length<=400||draft.content.englishGroups.length===1,'only an indivisible canonical block may exceed the conservative budget')}
});

test('memory draft-set insertion preflights the complete batch',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const result=await service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'left',templateCueId:LEFT_PANEL},'tester') as any;const draft=result.drafts[0];
 await assert.rejects(repo.insertDraftSet([{...draft,id:'duplicate-in-batch'},{...draft,id:'duplicate-in-batch'}]),(error:any)=>error.code==='draft_exists');
 assert.equal(await repo.getDraft('duplicate-in-batch'),null);
});

test('custom publishing preserves exact-version review invariants and selected published payload',async()=>{
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo);
 const created=await service.operation('create_draft',{name:'Welcome',title:'CRC',layout:'right',templateCueId:'09f50803-3288-4b78-bcc7-560025668e1a',content:{mode:'custom',text:'Welcome!'},presentation:{}},'tester') as any;
 const preview=await service.operation('preview_draft',{draftId:created.draft.id,expectedVersion:1},'tester') as any;
 await service.operation('review_draft',{draftId:created.draft.id,expectedVersion:1,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 await service.operation('update_draft',{draftId:created.draft.id,expectedVersion:1,patch:{content:{mode:'custom',text:'Changed after review'}}},'tester');
 await assert.rejects(service.operation('publish_draft',{draftId:created.draft.id,expectedVersion:2,previewId:preview.previewId},'tester'),(e:any)=>e.code==='stale_preview');
 assert.equal((await service.publishedCues()).length,0);
});

test('in-memory authoring is development-only, relay-free, and visibly labeled',async()=>{
 const memory=authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development'});assert.deepEqual(memory,{rehearsal:true,storage:'memory',label:'Local rehearsal — changes are temporary'});
 assert.throws(()=>authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'production'}),(e:any)=>e.code==='unsafe_rehearsal_config');
 assert.throws(()=>authoringRepositoryMode({CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development',RELAY_URL:'https://relay.example'}),(e:any)=>e.code==='unsafe_rehearsal_config');
 assert.deepEqual(authoringRepositoryMode({NODE_ENV:'production'}),{rehearsal:false,storage:'postgres',label:null});
 const service=createAuthoringService(new MemoryAuthoringRepository(),memory);const result=await service.operation('get_workspace',{},'tester') as {workspace:AuthoringWorkspace};assert.deepEqual(result.workspace,memory);
});
