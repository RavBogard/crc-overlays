import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler,workspaceIdentity} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {AuthoringError,baselineCues,buildCue,editableFromBaseline,newDraftId,sourcePack,sourcePinFor,type Draft} from '../lib/authoring-model';
import {MemoryBuildKeyRepository,type BuildKeyRecord} from '../lib/build-keys';
import {MemoryLocalSourceRepository} from '../lib/local-sources';
import {buildSharedLibraryPayload,type SharedLibraryPayload,type SharedLibrarySnapshot} from '../lib/shared-library';
import {hygieneToolSchemas} from '../lib/catalog-hygiene-schemas';
import {TEXT_SIZE_PRESETS} from '../lib/template-looks';

// Packet G4: batch_create_drafts through the real MCP handler into the real in-memory authoring
// service, with memory build keys and local sources and a stubbed shared library. Every text here
// is synthetic; none is a congregation's own.
const TBI='temple-bnai-israel-kalamazoo';
const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://tbi.example/api/mcp'),extra:{actor:'mcp:g4-agent'}} satisfies AuthInfo;
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output};
const fit:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.5,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test'});
const crcPublished=(overrides:Partial<Draft>={}):Draft=>{const editable=editableFromBaseline(BARECHU),now=Date.now();return {...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:1,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:'crc-editor',updatedBy:'crc-editor',...overrides}};

function wired(payload:SharedLibraryPayload=buildSharedLibraryPayload({cues:baselineCues,version:'crc-catalog'})){
 const repo=new MemoryAuthoringRepository(),locals=new MemoryLocalSourceRepository(),keys=new MemoryBuildKeyRepository();
 const snapshot:SharedLibrarySnapshot={available:true,configured:true,stale:false,refreshedAt:Date.now(),payload};
 const service=createAuthoringService(repo,undefined,{get:async()=>snapshot},async()=>undefined,fit,locals,undefined,undefined,undefined,keys);
 const handler=createAuthoringMcpHandler((operation,input,actor)=>service.operation(operation,input,actor),()=>workspaceIdentity({WORKSPACE_ID:TBI}));
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={},workspace:string|null=TBI):Promise<Called>=>{
  const response=await handler.fetch(new Request('https://tbi.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:workspace===null?args:{...args,workspace}}})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Array<{text?:string}>};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{}};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output};
 };
 return {repo,locals,keys,service,call,payload};
}

// A synthetic local source: an English reading, two paired Hebrew lines (one with English), and a closing English line.
const LOCAL={name:'Synthetic Evening Reading',book:'Test Prayer Book',page:12,attribution:'Test Press',blocks:[{en:'A synthetic opening line for the test.'},{he:'אבג דהו',tr:'Alef bet gimel',en:'First letters.'},{he:'זחט יכל',tr:'Zayin chet tet'},{en:'A synthetic closing line.'}]};
async function localSource(call:(name:string,args?:Record<string,unknown>)=>Promise<Called>,keys:MemoryBuildKeyRepository,key='test-evening-reading'){
 const added=await call('add_local_source',LOCAL);assert.equal(added.isError,false,added.text);
 const now=Date.now();await keys.put({workspaceId:TBI,kind:'local-source',key,targetId:added.output.source.id,createdBy:'g3',createdAt:now,updatedAt:now});
 return added.output.source.id as string;
}
const corpus=sourcePack.sources.find(source=>source.id.startsWith('library:')&&source.blocks.filter(block=>block.kind==='bilingual').length>=4)!;
const corpusBlocks=corpus.blocks.filter(block=>block.kind==='bilingual').map(block=>block.id);

function plan(localId:string){
 return [
  {type:'source',key:'corpus-one',sourceId:corpus.id,blockIds:corpusBlocks.slice(0,2),title:'Corpus Piece',layout:'left'},
  {type:'set',key:'corpus-set',sourceId:corpus.id,panels:[{blockIds:corpusBlocks.slice(0,2)},{blockIds:corpusBlocks.slice(2,4)}],title:'Corpus Piece in Parts',accentTitle:'אבג',layout:'left'},
  {type:'source',key:'local-english',sourceKey:'test-evening-reading',blocks:[0,3],title:'Evening Reading',layout:'left'},
  {type:'set',key:'local-set',sourceId:localId,panels:[{blocks:[0]},{blocks:[1,2]},{blocks:[3]}],title:'Evening Reading in Parts',layout:'left'},
  {type:'slide',key:'slide-welcome',title:'Welcome',text:'Welcome, everyone.\nPlease silence your phones.',layout:'bottom'},
  {type:'customize_shared',key:'crc-barechu',cueId:BARECHU},
 ];
}

test('acceptance: every item type is created in one call, keys recorded, a second run is all exists, and batchShip is a batch_ship input',async()=>{
 const {repo,keys,call}=wired();const localId=await localSource(call,keys);
 const made=await call('batch_create_drafts',{items:plan(localId),dryRun:false});
 assert.equal(made.isError,false,made.text);assert.equal(made.output.workspaceId,TBI);
 assert.deepEqual(made.output.items.map((item:Output)=>[item.key,item.status]),[['corpus-one','created'],['corpus-set','created'],['local-english','created'],['local-set','created'],['slide-welcome','created'],['crc-barechu','created']],JSON.stringify(made.output.items));
 assert.deepEqual(made.output.counts,{created:6,exists:0,refused:0});assert.match(made.output.message,/6 created as unpublished drafts.*Nothing was published/);
 const [one,set,english,localSet,slide,copy]=made.output.items;
 const drafts=await repo.listDrafts();assert.equal(drafts.length,1+2+1+3+1+1);assert.ok(drafts.every(draft=>draft.activeRevision===null),'nothing is published');
 const byId=new Map(drafts.map(draft=>[draft.id,draft]));
 assert.equal(byId.get(one.draftId)!.content.mode,'bilingual');assert.equal(one.version,1);
 const corpusSet=drafts.filter(draft=>draft.draftSetId===set.setId).sort((a,b)=>a.setIndex!-b.setIndex!);
 assert.deepEqual(corpusSet.map(draft=>draft.id),set.drafts.map((member:Output)=>member.draftId),'members come back in set order');
 assert.deepEqual(corpusSet.map(draft=>[draft.name,draft.title,draft.accentTitle,draft.setCount]),[['Corpus Piece in Parts — 01 of 02','Corpus Piece in Parts','אבג',2],['Corpus Piece in Parts — 02 of 02','Corpus Piece in Parts','אבג',2]]);
 assert.ok(corpusSet.every(draft=>draft.draftSetManifest?.selections.length===4),'one manifest covers the whole set');
 const englishDraft=byId.get(english.draftId)!;assert.equal(englishDraft.content.mode,'original-en');
 assert.deepEqual(englishDraft.content.mode==='original-en'&&englishDraft.content.englishGroups.map(group=>group.blockIds[0]),[`${localId}#block-0`,`${localId}#block-3`],'block positions resolve to the local source\'s own block ids');
 const localMembers=drafts.filter(draft=>draft.draftSetId===localSet.setId).sort((a,b)=>a.setIndex!-b.setIndex!);
 assert.deepEqual(localMembers.map(draft=>draft.content.mode),['original-en','bilingual','original-en'],'each panel takes the kind its blocks are');
 const paired=localMembers[1].content;assert.ok(paired.mode==='bilingual'&&paired.hebrewGroups[0].blockIds.join()===`${localId}#block-1,${localId}#block-2`);
 const slideDraft=byId.get(slide.draftId)!;assert.equal(slideDraft.content.mode,'custom');assert.equal(slideDraft.layout,'bottom');
 assert.equal(byId.get(copy.draftId)!.sharedFrom?.cueId,BARECHU,'the copy keeps its upstream link');
 const recorded=await keys.list();
 assert.deepEqual(recorded.filter(row=>row.kind!=='local-source').map(row=>[row.kind,row.key,row.targetId]).sort(),[['draft','corpus-one',one.draftId],['draft','crc-barechu',copy.draftId],['draft','local-english',english.draftId],['draft','slide-welcome',slide.draftId],['draft-set','corpus-set',set.setId],['draft-set','local-set',localSet.setId]].sort());
 // batchShip names every draft made, members included, and batch_ship takes it as it is.
 assert.equal(made.output.batchShip.items.length,drafts.length);assert.equal(made.output.batchShip.dryRun,false);
 assert.doesNotThrow(()=>hygieneToolSchemas().batch_ship.parse(made.output.batchShip));
 const shipCheck=await call('batch_ship',{...made.output.batchShip,dryRun:true});
 assert.equal(shipCheck.isError,false,shipCheck.text);assert.equal(shipCheck.output.results.length,drafts.length);assert.ok(shipCheck.output.results.every((row:Output)=>row.status!=='failed'),JSON.stringify(shipCheck.output.results.filter((row:Output)=>row.status==='failed')));
 // The same plan again makes nothing and names the same drafts.
 const again=await call('batch_create_drafts',{items:plan(localId),dryRun:false});
 assert.equal(again.isError,false,again.text);
 assert.ok(again.output.items.every((item:Output)=>item.status==='exists'),JSON.stringify(again.output.items));assert.deepEqual(again.output.counts,{created:0,exists:6,refused:0});
 assert.equal((await repo.listDrafts()).length,drafts.length);assert.deepEqual(again.output.batchShip,made.output.batchShip);
 assert.equal(again.output.items[1].setId,set.setId);
});

test('a dry run is the default, checks every item and writes nothing',async()=>{
 const {repo,keys,call}=wired();const localId=await localSource(call,keys);
 const before=(await keys.list()).length;
 const dry=await call('batch_create_drafts',{items:plan(localId)});
 assert.equal(dry.isError,false,dry.text);assert.equal(dry.output.dryRun,true);
 assert.deepEqual(dry.output.items.map((item:Output)=>item.status),Array(6).fill('would-create'),JSON.stringify(dry.output.items));
 assert.match(dry.output.message,/Dry run: 6 would be created.*Nothing was changed/);
 assert.equal((await repo.listDrafts()).length,0,'no draft is stored');assert.equal((await keys.list()).length,before,'no key is recorded');
 assert.equal(dry.output.batchShip,undefined,'nothing exists yet to ship');
 const invalid=await call('batch_create_drafts',{items:[{type:'source',key:'bad-block',sourceId:corpus.id,blockIds:['not-a-block'],title:'Bad',layout:'left'}]});
 assert.equal(invalid.output.items[0].status,'refused','a dry run still runs create_draft\'s own validation');assert.match(invalid.output.items[0].reason,/does not belong to/);
});

test('one refused item never stops the rest, and each refusal says what to do',async()=>{
 const {repo,keys,call}=wired();const localId=await localSource(call,keys);
 const items=[
  {type:'source',key:'no-such-source',sourceId:'library:nowhere',blockIds:['x'],title:'Nowhere',layout:'left'},
  {type:'source',key:'missing-source-key',sourceKey:'never-imported',blocks:[0],title:'Missing',layout:'left'},
  {type:'source',key:'out-of-range',sourceId:localId,blocks:[9],title:'Too far',layout:'left'},
  {type:'source',key:'mixed',sourceId:localId,blocks:[0,1],title:'Mixed',layout:'left'},
  {type:'source',key:'corpus-positions',sourceId:corpus.id,blocks:[0],title:'Positions',layout:'left'},
  {type:'customize_shared',key:'unknown-copy',cueId:'no-such-graphic'},
  {type:'customize_shared',key:'both-ids',cueId:BARECHU,setId:'some-set'},
  {type:'slide',key:'good-slide',title:'Good',text:'This one is made.',layout:'bottom'},
  {type:'slide',key:'good-slide',title:'Repeat',text:'Same key.',layout:'bottom'},
 ];
 const made=await call('batch_create_drafts',{items,dryRun:false});
 assert.equal(made.isError,false,made.text);
 const reasons=Object.fromEntries(made.output.items.map((item:Output)=>[`${item.item}`,item]));
 assert.match(reasons[1].reason,/There is no source library:nowhere here\. search_sources/);
 assert.match(reasons[2].reason,/No local source has the key "never-imported" here\. Import it with import_local_sources first/);
 assert.match(reasons[3].reason,/names block 9, but "Synthetic Evening Reading" has blocks 0 to 3/);
 assert.match(reasons[4].reason,/mixes English-only and paired Hebrew and transliteration blocks, and one graphic shows one kind\. Split them into separate panels/);
 assert.match(reasons[5].reason,/works for a local source only/);
 assert.match(reasons[6].reason,/No shared-library graphic has the id no-such-graphic/);
 assert.match(reasons[7].reason,/needs exactly one of cueId \(one graphic\) or setId/);
 assert.equal(reasons[8].status,'created');
 assert.match(reasons[9].reason,/repeats item 8's key "good-slide"/);
 assert.ok(made.output.items.filter((item:Output)=>item.status==='refused').every((item:Output)=>/Nothing was (created|changed)/.test(item.reason)),'every refusal says nothing was made');
 assert.deepEqual(made.output.counts,{created:1,exists:0,refused:8});assert.equal((await repo.listDrafts()).length,1);
});

test('a block id may name the next unit by its own prefix, and the draft takes one group per source',async()=>{
 const {repo,call}=wired();
 const next=sourcePack.sources.find(source=>source.id.startsWith('library:')&&source.id!==corpus.id&&source.blocks.some(block=>block.kind==='bilingual'))!;
 const chatimah=next.blocks.find(block=>block.kind==='bilingual')!.id;
 assert.ok(chatimah.startsWith(`${next.id}#`),'library block ids carry their source id');
 const made=await call('batch_create_drafts',{items:[{type:'source',key:'two-units',sourceId:corpus.id,blockIds:[corpusBlocks[0],chatimah],title:'Two Units',layout:'left'}],dryRun:false});
 assert.equal(made.output.items[0].status,'created',JSON.stringify(made.output.items[0]));
 const draft=(await repo.listDrafts())[0];
 assert.ok(draft.content.mode==='bilingual');assert.deepEqual(draft.content.hebrewGroups,[{sourceId:corpus.id,blockIds:[corpusBlocks[0]]},{sourceId:next.id,blockIds:[chatimah]}]);
 assert.deepEqual(draft.sourceSnapshots?.map(source=>source.id).sort(),[corpus.id,next.id].sort(),'both units are pinned');
});

test('by another path (/api/authoring) a malformed item is refused on its own line',async()=>{
 const {repo,service}=wired();
 const made=await service.operation('batch_create_drafts',{items:[{type:'slide',key:'no-text',title:'No text',layout:'bottom'},{type:'poster',key:'odd'},{type:'slide',key:'fine',title:'Fine',text:'Made.',layout:'bottom'}],dryRun:false},'mcp:g4-agent') as Output;
 assert.match(made.items[0].reason,/Item 1 is not a draft this tool can make \(text: /);assert.equal(made.items[1].status,'refused');assert.equal(made.items[2].status,'created');
 assert.equal((await repo.listDrafts()).length,1);
 await assert.rejects(service.operation('batch_create_drafts',{items:[],dryRun:false},'mcp:g4-agent'),/items must list 1 to 50 drafts/);
});

test('house defaults apply exactly as on create_draft, and applyDefaults:false skips them',async()=>{
 const {repo,keys,call}=wired();const localId=await localSource(call,keys);
 await call('update_authoring_defaults',{expectedVersion:0,textSize:'large',lineSpacing:'spacious'});
 const items=plan(localId).slice(0,5);
 const made=await call('batch_create_drafts',{items,dryRun:false});
 assert.equal(made.isError,false,made.text);
 const drafts=await repo.listDrafts();
 assert.ok(drafts.every(draft=>draft.presentation.hebrewFontSize===TEXT_SIZE_PRESETS.large.sizes.hebrewFontSize&&draft.presentation.lineSpacing==='spacious'&&draft.houseDefaultsVersion===1),'every draft, set members included, took the house look');
 assert.deepEqual(made.output.items[0].houseDefaults.applied,['text size large','line spacing spacious']);
 const plain=await call('batch_create_drafts',{items:[{type:'slide',key:'plain-slide',title:'Plain',text:'No house look.',layout:'bottom'},{type:'slide',key:'own-size',title:'Own',text:'Its own size.',layout:'bottom',textSize:'compact',applyDefaults:true}],applyDefaults:false,dryRun:false});
 assert.equal(plain.isError,false,plain.text);const [bare,own]=plain.output.items;
 const stored=new Map((await repo.listDrafts()).map(draft=>[draft.id,draft]));
 assert.deepEqual(stored.get(bare.draftId)!.presentation,{},'the call-wide opt-out skips them');assert.equal(bare.houseDefaults,undefined);
 assert.equal(stored.get(own.draftId)!.presentation.hebrewFontSize,TEXT_SIZE_PRESETS.compact.sizes.hebrewFontSize,'an item\'s own value wins');assert.equal(stored.get(own.draftId)!.presentation.lineSpacing,'spacious','and an item can opt back in');
});

test('at most 50 items per call, refused in words before anything is made',async()=>{
 const {repo,call}=wired();
 const items=Array.from({length:51},(_,index)=>({type:'slide',key:`slide-${index}`,title:`Slide ${index}`,text:'Synthetic.',layout:'bottom'}));
 const tooMany=await call('batch_create_drafts',{items,dryRun:false});
 assert.equal(tooMany.isError,true);assert.match(tooMany.text,/at most 50 items per call, and this one has 51\. Nothing was changed/);
 assert.equal((await repo.listDrafts()).length,0);
 const fifty=await call('batch_create_drafts',{items:items.slice(0,50),dryRun:false});
 assert.equal(fifty.isError,false,fifty.text);assert.equal(fifty.output.counts.created,50);assert.equal(fifty.output.batchShip.items.length,50);
});

test('an archived target is made again under its key; a key naming the other kind is refused; a set copy records its set',async()=>{
 const setId='crc-adon-olam-set';
 const members=[1,2,3].map(index=>crcPublished({name:`CRC Adon Olam — 0${index} of 03`,title:'Adon Olam',draftSetId:setId,setIndex:index,setCount:3}));
 const payload=buildSharedLibraryPayload({cues:members.map(draft=>buildCue(draft)),version:'crc-set'},members);
 const {repo,keys,call}=wired(payload);
 const first=await call('batch_create_drafts',{items:[{type:'slide',key:'notice',title:'Notice',text:'First.',layout:'bottom'},{type:'customize_shared',key:'adon-olam',setId}],dryRun:false});
 assert.equal(first.isError,false,first.text);const [notice,copied]=first.output.items;
 assert.equal(copied.status,'created');assert.equal(copied.drafts.length,3);assert.equal((await keys.get('draft-set','adon-olam'))?.targetId,copied.setId);
 await call('archive_draft',{draftId:notice.draftId,expectedVersion:1});
 const crossed=await call('batch_create_drafts',{items:[{type:'slide',key:'notice',title:'Notice',text:'Again.',layout:'bottom'},{type:'set',key:'adon-olam',sourceId:corpus.id,panels:[{blockIds:corpusBlocks.slice(0,1)}],title:'Other',layout:'left'}],dryRun:false});
 assert.equal(crossed.output.items[0].status,'created','an archived draft no longer holds its key');assert.notEqual(crossed.output.items[0].draftId,notice.draftId);
 assert.equal((await keys.get('draft','notice'))?.targetId,crossed.output.items[0].draftId,'the key moves to the new draft');
 assert.equal(crossed.output.items[1].status,'exists','the same key and kind is the copied set');
 const wrongKind=await call('batch_create_drafts',{items:[{type:'slide',key:'adon-olam',title:'Clash',text:'Clash.',layout:'bottom'}],dryRun:false});
 assert.match(wrongKind.output.items[0].reason,/The key "adon-olam" already names a set here/);
 // A copy already made outside this tool is found, not duplicated, and its key recorded.
 const byContent=await call('batch_create_drafts',{items:[{type:'customize_shared',key:'adon-olam-again',setId}],dryRun:false});
 assert.equal(byContent.output.items[0].status,'exists');assert.equal(byContent.output.items[0].setId,copied.setId);
 assert.equal((await repo.listDrafts()).filter(draft=>draft.draftSetId===copied.setId).length,3);
});

test('a key store that cannot write stops the batch after the first draft, so none is made without its key',async()=>{
 const {repo,keys,call}=wired();
 keys.put=async(record:BuildKeyRecord)=>{void record;throw new AuthoringError('build_keys_unavailable','Build keys are not set up in this workspace\'s database yet (db/build-keys.sql). Nothing was saved; ask whoever runs the database to apply it.',503)};
 const items=[1,2,3].map(index=>({type:'slide',key:`slide-${index}`,title:`Slide ${index}`,text:'Synthetic.',layout:'bottom'}));
 const made=await call('batch_create_drafts',{items,dryRun:false});
 assert.equal(made.isError,false,made.text);
 assert.equal(made.output.items[0].status,'created');assert.match(made.output.items[0].reason,/Made, but its key was not recorded: Build keys are not set up/);
 assert.deepEqual(made.output.items.slice(1).map((item:Output)=>item.status),['refused','refused']);assert.match(made.output.items[1].reason,/Items after the first failure were not attempted/);
 assert.equal((await repo.listDrafts()).length,1);
});
