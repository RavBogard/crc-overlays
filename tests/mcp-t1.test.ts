import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler,workspaceIdentity} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring';
import {baselineCues,buildCue,editableFromBaseline,newDraftId,sourcePack,sourcePinFor,type BilingualContent,type Draft} from '../lib/authoring-model';
import {buildSharedLibraryPayload,type SharedLibraryPayload,type SharedLibrarySnapshot} from '../lib/shared-library';
import {PgAuthoringDefaultsRepository} from '../lib/authoring-defaults-store';
import {TEXT_SIZE_PRESETS} from '../lib/template-looks';

// Packet T1: house defaults and the batch copy, driven through the real MCP handler on a TBI
// configuration, into the real in-memory authoring service, with a stubbed shared-library snapshot.
const TBI='temple-bnai-israel-kalamazoo';
const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const KOL_NIDRE='library:crc-kol-nidre:erev-yk.kol-nidre@crc-kol-nidre';
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://tbi.example/api/mcp'),extra:{actor:'mcp:simone-agent'}} satisfies AuthInfo;
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output};

function tbiFixture(payload:SharedLibraryPayload){
 const repo=new MemoryAuthoringRepository(),snapshot:SharedLibrarySnapshot={available:true,configured:true,stale:false,refreshedAt:Date.now(),payload};
 const service=createAuthoringService(repo,undefined,{get:async()=>snapshot},async()=>undefined);
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
 return {repo,call};
}
const crcPublished=(overrides:Partial<Draft>={}):Draft=>{const editable=editableFromBaseline(BARECHU),now=Date.now();return {...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:1,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:'crc-editor',updatedBy:'crc-editor',...overrides}};
const bilingualBase=(draft:Draft)=>{const base=draft.content.mode==='local-variant'?draft.content.base:draft.content;return base.mode==='bilingual'?base as BilingualContent:null};
const TBI_DEFAULTS={textSize:'large',arrangement:'blocks',rowOrder:['he','en','tr'],latinLineBreaks:'paragraphs',layoutRule:{maxLowerThirds:2,sequenceLayout:'left'}};

// A CRC library of at least `count` graphics: every visible baseline, then one published left-panel
// graphic per bilingual source (some with CRC's own explicit sizes, which the house size replaces).
function crcLibrary(count:number){
 const template=baselineCues.find(cue=>cue.layout==='left'&&!cue.hidden)!;
 const extra=Math.max(0,count-baselineCues.filter(cue=>!cue.hidden).length);
 const published=sourcePack.sources.filter(source=>source.blocks.some(block=>block.kind==='bilingual')).slice(0,extra).map((source,index)=>{
  const block=source.blocks.find(item=>item.kind==='bilingual')!,groups=[{sourceId:source.id,blockIds:[block.id]}],content={mode:'bilingual' as const,hebrewGroups:groups,transliterationGroups:structuredClone(groups)};
  return buildCue(crcPublished({name:`CRC ${source.name} ${index+1}`.slice(0,80),title:source.name.slice(0,100),layout:'left',templateCueId:template.id,content,presentation:index%2?{hebrewFontSize:30}:{},sourcePin:sourcePinFor(content)}));
 });
 return buildSharedLibraryPayload({cues:[...baselineCues,...published],version:'crc-catalog'});
}

test('acceptance: 50 shared graphics copied into TBI in one call, house defaults applied, dry run first',async()=>{
 const payload=crcLibrary(50);
 assert.ok(payload.cues.length>=50,`the fixture library holds ${payload.cues.length} graphics`);
 const {repo,call}=tbiFixture(payload);

 const none=await call('get_authoring_defaults',{},null);
 assert.equal(none.isError,false,none.text);assert.equal(none.output.workspaceId,TBI);assert.equal(none.output.version,0);assert.deepEqual(none.output.defaults,{});
 const unnamed=await call('update_authoring_defaults',{expectedVersion:0,...TBI_DEFAULTS},null);
 assert.equal(unnamed.isError,true,'a write names its congregation');
 const set=await call('update_authoring_defaults',{expectedVersion:0,...TBI_DEFAULTS});
 assert.equal(set.isError,false,set.text);assert.equal(set.output.version,1);assert.deepEqual(set.output.defaults,TBI_DEFAULTS);
 const stale=await call('update_authoring_defaults',{expectedVersion:0,textSize:'compact'});
 assert.equal(stale.isError,true);assert.match(stale.text,/changed since you read them \(now version 1\)/);

 const shelf=await call('list_shared_library',{limit:50},null);
 const items=shelf.output.cues.map((cue:{id:string})=>({cueId:cue.id}));
 assert.equal(items.length,50);

 const dry=await call('customize_shared_batch',{items});
 assert.equal(dry.isError,false,dry.text);
 assert.equal(dry.output.dryRun,true,'a dry run is the default');assert.equal(dry.output.counts.wouldCreate,50);assert.equal(dry.output.counts.refused,0);
 assert.equal((await repo.listDrafts()).length,0,'a dry run writes nothing');
 assert.equal(dry.output.apply.items.length,50);assert.ok(dry.output.apply.items.every((item:{expectedCueHash?:string})=>/^[a-f0-9]{64}$/.test(item.expectedCueHash??'')),'the apply list pins every upstream version');
 assert.ok(dry.output.items.some((item:{houseDefaults?:{applied:string[]}})=>item.houseDefaults?.applied.includes('text size large')),'the dry run says what the defaults change');

 const applied=await call('customize_shared_batch',dry.output.apply);
 assert.equal(applied.isError,false,applied.text);
 assert.equal(applied.output.counts.created,50);assert.match(applied.output.message,/50 copied as unpublished drafts/);
 const drafts=await repo.listDrafts();assert.equal(drafts.length,50);
 const byCue=new Map(payload.cues.map(entry=>[entry.id,entry]));
 for(const draft of drafts){
  const entry=byCue.get(draft.sharedFrom!.cueId)!;
  assert.ok(entry,'every draft links its upstream graphic');assert.equal(draft.sharedFrom!.workspaceId,'crc');assert.equal(draft.sharedFrom!.cueHash,entry.cueHash);assert.ok(draft.sharedFrom!.upstream,'the upstream wording travels with the copy');
  assert.equal(draft.activeRevision,null,'nothing is published');
  assert.equal(draft.sourceSnapshots?.length??0,entry.sourceIds.length,'source snapshots (with their attribution) are kept');
  assert.equal(draft.presentation.hebrewFontSize,TEXT_SIZE_PRESETS.large.sizes.hebrewFontSize);assert.equal(draft.presentation.titleFontSize,TEXT_SIZE_PRESETS.large.sizes.titleFontSize);assert.equal(draft.presentation.latinLineBreaks,'paragraphs');
  const base=bilingualBase(draft);if(base){assert.equal(base.arrangement,'blocks');assert.deepEqual(base.rowOrder,['he','en','tr'])}
 }
 assert.ok(drafts.filter(bilingualBase).length>10,'the house content defaults reached the bilingual copies');

 const again=await call('customize_shared_batch',{...dry.output.apply});
 assert.equal(again.output.counts.created,0);assert.equal(again.output.counts.alreadyCopied,50,'a rerun skips what is already here');assert.equal((await repo.listDrafts()).length,50);

 const tooMany=await call('customize_shared_batch',{items:[...items,{cueId:'one-more'}]});
 assert.equal(tooMany.isError,true);assert.match(tooMany.text,/at most 50 items per call, and this one has 51\. Nothing was copied/);
});

test('an interrupted batch resumes: the same call copies only what the first one did not finish',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'crc-catalog'});const {repo,call}=tbiFixture(payload);
 const items=payload.cues.slice(0,20).map(entry=>({cueId:entry.id}));
 const insert=repo.insertDraft.bind(repo);let inserts=0;
 repo.insertDraft=async draft=>{if(++inserts>8)throw new Error('connection lost');return insert(draft)};
 const broken=await call('customize_shared_batch',{items,dryRun:false});
 assert.equal(broken.isError,true);assert.equal((await repo.listDrafts()).length,8,'finished items stay');
 repo.insertDraft=insert;
 const resumed=await call('customize_shared_batch',{items,dryRun:false});
 assert.equal(resumed.isError,false,resumed.text);assert.equal(resumed.output.counts.alreadyCopied,8);assert.equal(resumed.output.counts.created,12);
 assert.equal((await repo.listDrafts()).length,20);
});

test('batch items are refused one by one in words; whole sets copy as sets and follow the layout rule note',async()=>{
 const setId='crc-adon-olam-set';
 const members=[1,2,3].map(index=>crcPublished({name:`CRC Adon Olam — 0${index} of 03`,title:'Adon Olam',draftSetId:setId,setIndex:index,setCount:3}));
 const single=crcPublished({name:'CRC Barechu',title:'Barechu'});
 const payload=buildSharedLibraryPayload({cues:[...members,single].map(draft=>buildCue(draft)),version:'crc-set'},members);
 const {repo,call}=tbiFixture(payload);
 await call('update_authoring_defaults',{expectedVersion:0,...TBI_DEFAULTS});
 const items=[{setId},{cueId:single.id,expectedCueHash:'0'.repeat(64)},{cueId:'no-such-graphic'},{setId},{cueId:members[1].id}];
 const dry=await call('customize_shared_batch',{items});
 assert.equal(dry.isError,false,dry.text);
 const [set,stale,unknown,repeat,part]=dry.output.items;
 assert.equal(set.status,'would-create');assert.equal(set.parts,3);assert.match(set.notes.join(' '),/3 lower thirds, more than the house layout rule's 2; it is copied as it is/);
 assert.equal(stale.status,'refused');assert.match(stale.reason,/changed upstream since you read it/);
 assert.equal(unknown.status,'refused');assert.match(unknown.reason,/Call list_shared_library/);
 assert.equal(repeat.status,'refused');assert.match(repeat.reason,/repeats item 1/);
 assert.equal(part.status,'would-create');assert.match(part.notes.join(' '),/part 2 of 3 of "Adon Olam"; pass setId/);
 assert.equal(dry.output.apply.items.length,2);assert.deepEqual(Object.keys(dry.output.apply.items[0].expectedCueHashes).sort(),members.map(draft=>draft.id).sort());

 const applied=await call('customize_shared_batch',dry.output.apply);
 assert.equal(applied.output.counts.created,2);
 const drafts=await repo.listDrafts(),copiedSet=drafts.filter(draft=>draft.draftSetId===applied.output.items[0].setId).sort((a,b)=>a.setIndex!-b.setIndex!);
 assert.equal(copiedSet.length,3);assert.deepEqual(copiedSet.map(draft=>draft.sharedFrom!.cueId),members.map(draft=>draft.id));assert.ok(copiedSet.every(draft=>draft.draftSetManifest&&draft.layout==='bottom'),'CRC\'s shape is kept');
 const rerun=await call('customize_shared_batch',{items:[{setId},{cueId:members[1].id}]});
 assert.deepEqual(rerun.output.items.map((item:{status:string})=>item.status),['already-copied','already-copied']);
});

test('create_draft takes the house defaults unless the call names its own value or opts out',async()=>{
 const {call}=tbiFixture(buildSharedLibraryPayload({cues:[],version:'empty'}));
 await call('update_authoring_defaults',{expectedVersion:0,textSize:'large',lineSpacing:'spacious'});
 const custom={name:'Welcome',title:'Welcome',layout:'bottom',content:{mode:'custom',text:'Welcome to Shabbat'}};
 const housed=await call('create_draft',custom);
 assert.equal(housed.isError,false,housed.text);assert.deepEqual(housed.output.draft.presentation,{...TEXT_SIZE_PRESETS.large.sizes,largePrint:true,lineSpacing:'spacious'});assert.deepEqual(housed.output.houseDefaults.applied,['text size large','line spacing spacious']);
 assert.equal(housed.output.draft.houseDefaultsVersion,1,'the draft records which defaults shaped it');
 const own=await call('create_draft',{...custom,name:'Welcome 2',textSize:'compact'});
 assert.equal(own.output.draft.presentation.hebrewFontSize,TEXT_SIZE_PRESETS.compact.sizes.hebrewFontSize,'the call\'s own size wins');assert.equal(own.output.draft.presentation.lineSpacing,'spacious');
 const explicit=await call('create_draft',{...custom,name:'Welcome 3',presentation:{hebrewFontSize:30}});
 assert.deepEqual(explicit.output.draft.presentation,{hebrewFontSize:30,lineSpacing:'spacious'},'an explicit font size keeps the caller\'s typography');
 const plain=await call('create_draft',{...custom,name:'Welcome 4',applyDefaults:false});
 assert.deepEqual(plain.output.draft.presentation,{});assert.equal(plain.output.houseDefaults,undefined);assert.equal(plain.output.draft.houseDefaultsVersion,undefined);
 const cleared=await call('update_authoring_defaults',{expectedVersion:1,textSize:null,lineSpacing:null});
 assert.deepEqual(cleared.output.defaults,{});assert.deepEqual(cleared.output.changed,['textSize','lineSpacing']);
 const noop=await call('update_authoring_defaults',{expectedVersion:2,textSize:null});
 assert.equal(noop.output.version,2,'a write that changes nothing keeps the version');
});

test('a translation default the source cannot honour is skipped in words, not refused',async()=>{
 const {call}=tbiFixture(buildSharedLibraryPayload({cues:[],version:'empty'}));
 await call('update_authoring_defaults',{expectedVersion:0,translation:'include',rowOrder:['tr','he','en']});
 const source=sourcePack.sources.find(item=>item.blocks.some(block=>block.kind==='bilingual')&&!item.blocks.some(block=>block.kind==='translation-en'))!;
 const block=source.blocks.find(item=>item.kind==='bilingual')!,groups=[{sourceId:source.id,blockIds:[block.id]}];
 const created=await call('create_draft',{name:'No translation here',title:'No translation',layout:'left',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups}});
 assert.equal(created.isError,false,created.text);
 assert.equal(created.output.draft.content.includeTranslation,undefined);assert.deepEqual(created.output.draft.content.rowOrder,['tr','he','en']);
 assert.match(created.output.houseDefaults.skipped[0],/^translation included: /);
});

test('create_source_draft_set applies the layout rule unless a lower-third template is named',async()=>{
 const {call}=tbiFixture(buildSharedLibraryPayload({cues:[],version:'empty'}));
 const plain=await call('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'bottom'});
 assert.equal(plain.isError,false,plain.text);const lowerThirds=plain.output.set.count;assert.ok(lowerThirds>2,`Kol Nidre needs ${lowerThirds} lower thirds`);
 await call('update_authoring_defaults',{expectedVersion:0,layoutRule:{maxLowerThirds:2},textSize:'compact'});
 const ruled=await call('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'bottom'});
 assert.equal(ruled.isError,false,ruled.text);
 assert.match(ruled.output.houseDefaults.applied[0],new RegExp(`layout rule: ${lowerThirds} lower thirds became a left sequence of ${ruled.output.set.count}`));
 assert.ok(ruled.output.drafts.every((draft:{layout:string;presentation:{hebrewFontSize?:number}})=>draft.layout==='left'&&draft.presentation.hebrewFontSize===TEXT_SIZE_PRESETS.compact.sizes.hebrewFontSize));
 const pinned=await call('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'bottom',templateCueId:BARECHU});
 assert.equal(pinned.output.set.count,lowerThirds);assert.match(pinned.output.houseDefaults.skipped[0],/kept \d+ lower thirds because templateCueId names a lower-third template/);
 const optOut=await call('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'bottom',applyDefaults:false});
 assert.equal(optOut.output.set.count,lowerThirds);assert.equal(optOut.output.houseDefaults,undefined);
});

test('customize_shared_cue takes the defaults; applyDefaults:false is the exact upstream copy as before',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'crc-catalog'});const {call}=tbiFixture(payload);
 const entry=payload.cues.find(item=>item.id===BARECHU)!;
 const exact=await call('customize_shared_cue',{cueId:BARECHU,expectedCueHash:entry.cueHash});
 assert.equal(exact.output.houseDefaults,undefined,'with no defaults stored nothing changes');assert.equal(exact.output.draft.houseDefaultsVersion,undefined);
 await call('update_authoring_defaults',{expectedVersion:0,textSize:'large'});
 const housed=await call('customize_shared_cue',{cueId:BARECHU,expectedCueHash:entry.cueHash,name:'TBI Barechu'});
 assert.equal(housed.output.draft.presentation.hebrewFontSize,TEXT_SIZE_PRESETS.large.sizes.hebrewFontSize);assert.deepEqual(housed.output.houseDefaults.applied,['text size large']);assert.equal(housed.output.sharedFrom.cueHash,entry.cueHash);assert.equal(housed.output.draft.houseDefaultsVersion,1);
 const optOut=await call('customize_shared_cue',{cueId:BARECHU,expectedCueHash:entry.cueHash,applyDefaults:false});
 assert.deepEqual(optOut.output.draft.presentation,exact.output.draft.presentation);
});

test('Postgres defaults read as none until the table exists, and a write says what is missing',async()=>{
 const missing={query:async()=>{throw Object.assign(new Error('relation "authoring_defaults" does not exist'),{code:'42P01'})}};
 const repo=new PgAuthoringDefaultsRepository(TBI,missing);
 assert.equal(await repo.get(),null);
 await assert.rejects(repo.put({textSize:'large'},0,'simone',1),/no authoring_defaults table \(db\/authoring-defaults\.sql\)\. Nothing was changed/);
 const rows:unknown[][]=[];const stored={query:async(text:string,values?:unknown[])=>{rows.push(values??[]);return text.startsWith('INSERT')?{rows:[{version:1,document:{textSize:'large',bogus:true},updated_at:1,updated_by:'simone'}]}:{rows:[]}}};
 const saved=await new PgAuthoringDefaultsRepository(TBI,stored).put({textSize:'large'},0,'simone',1);
 assert.deepEqual(saved,{version:1,defaults:{textSize:'large'},updatedAt:1,updatedBy:'simone'},'a stored row is re-validated on read');assert.equal(rows[0][0],TBI);
});
