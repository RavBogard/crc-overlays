import test from 'node:test';
import assert from 'node:assert/strict';
import {baselineCues,buildCue,editableFromBaseline,newDraftId,sourcePack,sourcePinFor,type AuthoringCue,type AuthoringError,type AuthoringSource,type BilingualContent,type Draft,type LocalVariantContent,type SourceBlock} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import {SHARED_LIBRARY_MAX_BYTES,SharedLibraryClient,TBI_WORKSPACE_ID,buildSharedLibraryPayload,type SharedLibrarySnapshot} from '../lib/shared-library.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const KEY='s'.repeat(43);
const env={WORKSPACE_ID:TBI_WORKSPACE_ID,CRC_SHARED_LIBRARY_URL:'https://crc.example.test/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:KEY};

// Real return shapes for authoringOperation('operation', ...), which is typed Promise<unknown> by design
// (its return value depends on the string `operation` name). These narrow just the fields these tests read.
type DraftResult={draft:Draft};
type SharedLibraryListEntry={id:string;name:string;title:string;layout:string;sourceIds:string[];cueHash:string;state:string;set?:{id:string;index:number;count:number;title:string};local:{starterCueId?:string;drafts:{id:string;name:string;activeRevision:number|null;cueHash:string}[]}};
type SharedLibraryListAvailable={available:true;configured:true;stale:boolean;refreshedAt:number;total:number;truncated:boolean;cues:SharedLibraryListEntry[]};
type SharedLibraryUnavailable=Extract<SharedLibrarySnapshot,{available:false}>;
type SharedCuePreview={available:true;configured:true;stale:boolean;refreshedAt:number;cueHash:string;cue:AuthoringCue};

test('CRC export contains every visible published baseline and only required source snapshots',()=>{
 const visible=baselineCues.filter(cue=>!cue.hidden);const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'},[],1234);
 assert.equal(payload.schemaVersion,1);assert.equal(payload.sourceWorkspace,'crc');assert.equal(payload.generatedAt,1234);assert.equal(payload.cues.length,visible.length);assert.ok(payload.sources.length>0);assert.ok(Buffer.byteLength(JSON.stringify(payload))<SHARED_LIBRARY_MAX_BYTES);
 const thankYou=payload.cues.find(entry=>entry.name==='Thank you')!;assert.equal(thankYou.copySpec.content.mode,'custom');assert.deepEqual(thankYou.sourceIds,[]);
 const sourceIds=new Set(payload.sources.map(source=>source.id));assert.ok(payload.cues.every(entry=>entry.sourceIds.every(id=>sourceIds.has(id))));
});

test('newly published cue definitions carry immutable copy specifications for future sharing',()=>{
 const editable=editableFromBaseline(BARECHU);const now=Date.now();const draft:Draft={...editable,id:newDraftId(),version:3,sourcePin:sourcePinFor(editable.content),activeRevision:2,activeDraftVersion:3,createdAt:now,updatedAt:now,createdBy:'crc',updatedBy:'crc'};const cue=buildCue(draft);
 const payload=buildSharedLibraryPayload({cues:[cue],version:'future'});assert.equal(payload.cues[0].copySpec.title,editable.title);assert.deepEqual(payload.cues[0].copySpec.content,editable.content);assert.deepEqual(payload.cues[0].copySpec.sourcePin,draft.sourcePin);
});

test('embedded source snapshots preserve an older feed through export, import, update, and duplicate',async()=>{
 const seed=sourcePack.sources.find(source=>source.blocks.some(block=>block.kind==='source-en'&&block.automatic!==false))!;
 const seedBlock=seed.blocks.find(block=>block.kind==='source-en'&&block.automatic!==false)!;
 const sourceId=`library:test-old-feed:${seed.id.replace(/^library:/,'')}`;
 const sourceSnapshot:AuthoringSource={...structuredClone(seed),id:sourceId};
 const oldFeed='1'.repeat(64);const content={mode:'source-en' as const,englishGroups:[{sourceId,blockIds:[seedBlock.id]}]};
 const editable={name:'Pinned old feed',title:'Pinned old feed',layout:'bottom' as const,templateCueId:BARECHU,content,presentation:{}};const now=Date.now();
 const sourcePin=sourcePinFor(content,[sourceSnapshot],oldFeed);const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin,sourceSnapshots:[sourceSnapshot],activeRevision:1,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:'crc',updatedBy:'crc'};
 const cue=buildCue(draft);assert.equal(cue.authoring.feedSha256,oldFeed);assert.equal(cue.texts.textMain,seedBlock.en);assert.equal(sourcePack.sources.some(source=>source.id===sourceId),false,'snapshot source is deliberately absent from the current corpus');
 const payload=buildSharedLibraryPayload({cues:[cue],version:'old-feed'});assert.equal(payload.sources[0].id,sourceId);assert.equal(payload.cues[0].copySpec.sourcePin.feedSha256,oldFeed);
 const snapshot:SharedLibrarySnapshot={available:true,configured:true,stale:false,refreshedAt:now,payload};const service=createAuthoringService(new MemoryAuthoringRepository(),undefined,{get:async()=>snapshot});
 const imported=await service.operation('customize_shared_cue',{cueId:draft.id,expectedCueHash:payload.cues[0].cueHash},'simone') as DraftResult;assert.equal(imported.draft.sourcePin.feedSha256,oldFeed);assert.equal(buildCue(imported.draft).texts.textMain,seedBlock.en);
 const updated=await service.operation('update_draft',{draftId:imported.draft.id,expectedVersion:1,patch:{title:'TBI title'}},'simone') as DraftResult;assert.equal(updated.draft.sourcePin.feedSha256,oldFeed);assert.equal(buildCue(updated.draft).texts.textMain,seedBlock.en);
 const duplicated=await service.operation('duplicate_draft',{draftId:updated.draft.id},'simone') as DraftResult;assert.equal(duplicated.draft.sourcePin.feedSha256,oldFeed);assert.equal(buildCue(duplicated.draft).texts.textMain,seedBlock.en);
});

test('TBI client deduplicates refreshes, serves a sixty-second cache, and falls back to last good data',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'});let calls=0;let fail=false;
 const fetcher=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return fail?new Response('down',{status:503}):Response.json(payload)};
 const client=new SharedLibraryClient(env,fetcher as typeof fetch);const [first,second]=await Promise.all([client.get(),client.get()]);assert.equal(calls,1);assert.equal(first.available,true);assert.equal(second.available,true);
 await client.get();assert.equal(calls,1);fail=true;const stale=await client.get(true);assert.equal(calls,2);assert.equal(stale.available,true);if(stale.available)assert.equal(stale.stale,true);
});

test('shared library operations preview exact CRC cues and create independent unpublished TBI drafts',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'});const snapshot:SharedLibrarySnapshot={available:true,configured:true,stale:false,refreshedAt:456,payload};const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo,undefined,{get:async()=>snapshot});
 const list=await service.operation('list_shared_library',{query:'Barechu',limit:1000},'simone') as SharedLibraryListAvailable;assert.equal(list.available,true);assert.equal(list.cues.length,1);assert.equal(list.total,1);assert.equal(list.truncated,false);assert.equal(list.cues[0].id,BARECHU);assert.equal(list.refreshedAt,456);
 const preview=await service.operation('preview_shared_cue',{cueId:BARECHU},'simone') as SharedCuePreview;assert.deepEqual(preview.cue,payload.cues.find(entry=>entry.id===BARECHU)!.cue);assert.equal(preview.cueHash,list.cues[0].cueHash);
 await assert.rejects(service.operation('customize_shared_cue',{cueId:BARECHU,expectedCueHash:'0'.repeat(64)},'simone'),(error)=>(error as AuthoringError).code==='shared_cue_changed');
 const customized=await service.operation('customize_shared_cue',{cueId:BARECHU,expectedCueHash:preview.cueHash},'simone') as DraftResult;assert.notEqual(customized.draft.id,BARECHU);assert.equal(customized.draft.activeRevision,null);assert.equal(customized.draft.sharedFrom!.cueId,BARECHU);assert.ok(customized.draft.sourceSnapshots!.length>0);assert.deepEqual(buildCue(customized.draft).texts,preview.cue.texts);assert.deepEqual(await service.publishedCues(),[]);
 const updated=await service.operation('update_draft',{draftId:customized.draft.id,expectedVersion:1,patch:{title:'TBI wording'}},'simone') as DraftResult;assert.equal(updated.draft.title,'TBI wording');assert.equal(updated.draft.sharedFrom!.cueId,BARECHU);
});

test('published local variants share as pinned variants without becoming custom text',async()=>{
 const crcRepo=new MemoryAuthoringRepository(),crc=createAuthoringService(crcRepo);const imported=await crc.operation('import_cue',{cueId:BARECHU},'crc-editor') as DraftResult;const base=imported.draft,group=(base.content as BilingualContent).hebrewGroups[0],source=base.sourceSnapshots!.find((item:AuthoringSource)=>item.id===group.sourceId)!,block=source.blocks.find((item:SourceBlock)=>item.id===group.blockIds[0])!;const variant=await crc.operation('create_local_variant',{draftId:base.id,label:'CRC local wording',overrides:[{sourceId:group.sourceId,blockId:block.id,channel:'he',localText:`${block.he}׃`}]},'crc-editor') as DraftResult;const cue=buildCue(variant.draft),payload=buildSharedLibraryPayload({cues:[cue],version:'variant'});assert.equal(payload.cues[0].copySpec.content.mode,'local-variant');assert.equal((payload.cues[0].cue as unknown as {authoring:{origin:string}}).authoring.origin,'variant');
 const snapshot:SharedLibrarySnapshot={available:true,configured:true,stale:false,refreshedAt:Date.now(),payload},tbi=createAuthoringService(new MemoryAuthoringRepository(),undefined,{get:async()=>snapshot});const copied=await tbi.operation('customize_shared_cue',{cueId:cue.id,expectedCueHash:payload.cues[0].cueHash},'simone') as DraftResult;assert.equal(copied.draft.content.mode,'local-variant');assert.equal((copied.draft.content as LocalVariantContent).overrides[0].sourceText,block.he);assert.equal((buildCue(copied.draft) as unknown as {authoring:{origin:string}}).authoring.origin,'variant');assert.equal(copied.draft.activeRevision,null);
});

test('an unavailable CRC library does not disrupt local TBI authoring',async()=>{
 const unavailable:SharedLibrarySnapshot={available:false,configured:true,stale:false,error:'CRC library is temporarily unavailable.'};const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo,undefined,{get:async()=>unavailable});
 const list=await service.operation('list_shared_library',{},'simone') as SharedLibraryUnavailable;assert.equal(list.available,false);
 await assert.rejects(service.operation('customize_shared_cue',{cueId:BARECHU,expectedCueHash:'0'.repeat(64)},'simone'),(error)=>(error as AuthoringError).code==='shared_library_unavailable');
 const editable=editableFromBaseline(BARECHU);const local=await service.operation('create_draft',editable,'simone') as DraftResult;assert.ok(local.draft.id);
});

// A CRC whole prayer is one graphic to the person who made it. It has to arrive at TBI as one
// thing too, so the export carries the set each published member belongs to.
test('a published CRC set exports its members with their set, and single graphics carry none',()=>{
 const editable=editableFromBaseline(BARECHU);const setId='2f2b6a9c-set';const now=Date.now();
 const members:Draft[]=[1,2,3].map(index=>({...editable,name:`Adon Olam — 0${index} of 03`,title:'Adon Olam',id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:1,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:'crc',updatedBy:'crc',draftSetId:setId,setIndex:index,setCount:3}));
 const cues=members.map(draft=>buildCue(draft));
 // Reversed on purpose: the set a cue belongs to is looked up by id, never by position.
 const payload=buildSharedLibraryPayload({cues,version:'set-export'},[...members].reverse());
 assert.deepEqual(payload.cues.map(entry=>entry.set!.index),[1,2,3]);
 assert.ok(payload.cues.every(entry=>entry.set!.id===setId&&entry.set!.count===3&&entry.set!.title==='Adon Olam'));
 const baseline=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'});
 assert.ok(baseline.cues.every(entry=>entry.set===undefined),'baseline graphics belong to no set');
 assert.ok(baseline.cues.length>0);
});

test('an unpublished draft set never leaks into the export through its set fields',()=>{
 const editable=editableFromBaseline(BARECHU);const now=Date.now();
 const unpublished:Draft={...editable,name:'Never published',id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'crc',updatedBy:'crc',draftSetId:'unpublished-set',setIndex:1,setCount:1};
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'},[unpublished]);
 assert.equal(payload.cues.some(entry=>entry.id===unpublished.id),false);
 assert.ok(payload.cues.every(entry=>entry.set===undefined));
});

test('the TBI client accepts CRC payloads both with and without set information',async()=>{
 const editable=editableFromBaseline(BARECHU);const now=Date.now();
 const member:Draft={...editable,name:'Adon Olam — 01 of 01',title:'Adon Olam',id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:1,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:'crc',updatedBy:'crc',draftSetId:'compat-set',setIndex:1,setCount:1};
 const withSet=buildSharedLibraryPayload({cues:[buildCue(member)],version:'with-set'},[member]);
 assert.ok(withSet.cues[0].set);
 const withoutSet=buildSharedLibraryPayload({cues:[buildCue(member)],version:'without-set'});
 assert.equal(withoutSet.cues[0].set,undefined);
 for(const payload of [withSet,withoutSet]){
  const client=new SharedLibraryClient(env,(async()=>Response.json(payload)) as typeof fetch);
  const snapshot=await client.get();assert.equal(snapshot.available,true);
  if(snapshot.available)assert.equal(snapshot.payload.cues[0].set?.id,payload.cues[0].set?.id);
 }
});

test('a set title edited after publishing does not reach the export until it is published again',()=>{
 const cue=baselineCues.find(item=>item.id===BARECHU)!;
 const base={id:cue.id,draftSetId:'set-title',setIndex:1,setCount:1};
 const published=buildSharedLibraryPayload({cues:[cue],version:'v'},[{...base,title:'Published title',version:3,activeDraftVersion:3}]);
 assert.equal(published.cues[0].set!.title,'Published title');
 const edited=buildSharedLibraryPayload({cues:[cue],version:'v'},[{...base,title:'Renamed mid-edit',version:4,activeDraftVersion:3}]);
 assert.equal(edited.cues[0].set!.title,cue.texts.textTitle??cue.name);
 assert.notEqual(edited.cues[0].set!.title,'Renamed mid-edit');
});
