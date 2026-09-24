import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,SOURCE_REVIEW_OPERATIONS,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {AuthoringError,assertSourcePin,type AuthoringCue,type Draft} from '../lib/authoring-model';
import {MemoryLocalSourceRepository,localBookSlug,localSourceOperation,localSourceUnit,localSourcesAt,findLocalSourcesAt,type LocalSourceDeps} from '../lib/local-sources';
import {MemorySourceReviewRepository,createSourceReviewService} from '../lib/source-review';
import {buildSharedLibraryPayload} from '../lib/shared-library';
import {liturgyForCue} from '../lib/liturgy-index';
import {matchSetlist,type LiveSetlist} from '../lib/live-setlists';
import type {Cue} from '../lib/player';

// Packet T2: a congregation's own readings, entered once as sources with book and page, merged into
// the corpus that workspace authors from and never shared upstream. Every acceptance step runs
// through the real MCP handler into the real in-memory authoring service.
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
type Content={type:string;text?:string};
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output};
const fit:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.5,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test'});

function wired(){
 const repo=new MemoryAuthoringRepository(),locals=new MemoryLocalSourceRepository();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,fit,locals);
 const reviews=createSourceReviewService(repo,new MemorySourceReviewRepository(repo),async()=>[],async()=>(await locals.list()).map(localSourceUnit));
 const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{const review=SOURCE_REVIEW_OPERATIONS[operation];return review?reviews.operation(review,input,actor):service.operation(operation,input,actor)});
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={},workspace:string|undefined='crc'):Promise<Called>=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:workspace===undefined?args:{...args,workspace}}})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Content[]};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{}};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output};
 };
 return {repo,locals,service,call};
}

const READING={name:'For the Gift of Shabbat',book:"Mishkan T'filah",page:176,section:'Kabbalat Shabbat',attribution:"Mishkan T'filah, © CCAR Press",licence:'Displayed under the congregation\'s CCAR licence.',blocks:[{en:'We give thanks for the gift of Shabbat, a sanctuary in time.'},{en:'May this day of rest renew our hearts and hands.'}]};
const BLESSING={name:'Shalom Rav (TBI)',book:"Mishkan T'filah",page:98,attribution:'Traditional',blocks:[{he:'שָׁלוֹם רָב עַל יִשְׂרָאֵל עַמְּךָ',tr:"Shalom rav al Yisrael amcha",en:'Grant abundant peace to Israel your people.'}]};

async function publish(call:(name:string,args?:Record<string,unknown>)=>Promise<Called>,draftId:string,version:number){
 const preview=await call('preview_draft',{draftId,expectedVersion:version});assert.equal(preview.isError,false,preview.text);
 const checked=await call('fit_check_draft',{draftId,expectedVersion:version,previewId:preview.output.previewId});assert.equal(checked.output.verdict,'pass',checked.text);
 const reviewed=await call('review_draft',{draftId,expectedVersion:version,previewId:preview.output.previewId,humanApproved:true});assert.equal(reviewed.isError,false,reviewed.text);
 const published=await call('publish_draft',{draftId,expectedVersion:version,previewId:preview.output.previewId});assert.equal(published.isError,false,published.text);
 return preview;
}

test('acceptance: a Mishkan T\'filah reading is entered once, found by text and by page, and built into a graphic that carries its attribution',async()=>{
 const {call,repo,locals}=wired();
 const added=await call('add_local_source',READING);
 assert.equal(added.isError,false,added.text);
 const source=added.output.source;
 assert.match(source.id,/^local:[0-9a-f-]{36}$/);assert.equal(source.version,1);assert.equal(source.page,176);assert.equal(source.bookValue,'mishkan-tfilah');
 assert.equal(added.output.workspaceId,'crc','the result names the workspace');

 const byText=await call('search_sources',{query:'sanctuary in time',includeBlocks:true},undefined);
 assert.equal(byText.isError,false,byText.text);
 const hit=byText.output.sources.find((item:{id:string})=>item.id===source.id);
 assert.ok(hit,'found by its text');assert.equal(hit.local,true);assert.equal(hit.attribution,READING.attribution);assert.equal(hit.folio,'p. 176');assert.equal(hit.bookLabel,"Mishkan T'filah");
 assert.doesNotMatch(byText.text,/CCAR licence/,'compact search leaves the licence text out');

 const byPage=await call('search_sources',{book:'mishkan-tfilah',page:176},undefined);
 assert.deepEqual(byPage.output.sources.map((item:{id:string})=>item.id),[source.id],'found by book and page');
 const byTitle=await call('search_sources',{book:"Mishkan T'filah",page:176},undefined);
 assert.deepEqual(byTitle.output.sources.map((item:{id:string})=>item.id),[source.id],'the printed title names the book as well as its slug');
 assert.equal((await call('search_sources',{book:"Mishkan T'filah",page:177},undefined)).output.sources.length,0,'another page finds nothing');

 const outline=await call('list_book_units',{book:"Mishkan T'filah"},undefined);
 assert.equal(outline.isError,false,outline.text);assert.equal(outline.output.total,1);assert.equal(outline.output.sections[0].units[0].folio,'p. 176');
 const facets=await call('list_source_facets',{},undefined);
 assert.ok(facets.output.books.some((item:{value:string;count:number})=>item.value==='mishkan-tfilah'&&item.count===1),'the book is a facet');

 const got=await call('get_source',{sourceId:source.id},undefined);
 assert.equal(got.output.local.attribution,READING.attribution);assert.equal(got.output.local.licence,READING.licence);
 assert.equal(got.output.authority.license,READING.licence,'its own licence, never the corpus licence');
 assert.equal(got.output.display.folio,'p. 176');

 const blockIds=hit.blocks.map((block:{id:string})=>block.id);
 const created=await call('create_draft',{name:'Gift of Shabbat',title:'For the Gift of Shabbat',layout:'left',content:{mode:'original-en',englishGroups:[{sourceId:source.id,blockIds}]}});
 assert.equal(created.isError,false,created.text);
 assert.equal(created.output.provenance[0].attribution,READING.attribution);
 const draft=await repo.getDraft(created.output.draft.id) as Draft;
 assert.equal(draft.sourcePin.unitSha256[source.id],localSourceUnit((await locals.get(source.id))!).unitSha256,'pinned like a corpus draft');
 assert.equal(draft.sourceSnapshots?.[0].id,source.id,'a snapshot of the local source is kept');
 assert.doesNotThrow(()=>assertSourcePin(draft));

 const preview=await publish(call,draft.id,draft.version);
 assert.equal(preview.output.provenance[0].attribution,READING.attribution,'the preview names its attribution');
 assert.equal(preview.output.provenance[0].page,176);
 assert.match(preview.output.cue.texts.textMain,/sanctuary in time/);
 const [cue]=await repo.published() as AuthoringCue[];
 assert.equal(cue.authoring.origin,'canonical','source-backed, not custom text');
 assert.equal(cue.authoring.copySpec?.sourceSnapshots?.[0].metadata?.attribution,READING.attribution,'the published graphic carries its attribution');
 assert.deepEqual(liturgyForCue(cue),{unitId:source.id,momentId:null,book:'mishkan-tfilah',folio:176},'and its printed position');
});

test('a local source never appears in the shared-library payload, while a corpus graphic beside it does',async()=>{
 const {call,repo}=wired();
 const added=await call('add_local_source',READING);const source=added.output.source;
 const local=await call('create_draft',{name:'Gift of Shabbat',title:'Gift',layout:'left',content:{mode:'original-en',englishGroups:[{sourceId:source.id,blockIds:[source.blocks[0].id]}]}});
 await publish(call,local.output.draft.id,1);
 const found=await call('search_sources',{query:'barchu',includeBlocks:true,limit:5},undefined);
 const corpus=found.output.sources.find((item:{blocks:Array<{kind:string}>})=>item.blocks.some(block=>block.kind==='bilingual'));
 const block=corpus.blocks.find((item:{kind:string})=>item.kind==='bilingual');const groups=[{sourceId:corpus.id,blockIds:[block.id]}];
 const shared=await call('create_draft',{name:'Barchu (shared)',title:'Barchu',layout:'bottom',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups}});
 await publish(call,shared.output.draft.id,1);
 const published=await repo.published();assert.equal(published.length,2);
 const payload=buildSharedLibraryPayload({cues:published as Cue[],version:'v1'},await repo.listDrafts());
 assert.deepEqual(payload.cues.map(entry=>entry.id),[shared.output.draft.id],'only the corpus graphic is shared');
 const text=JSON.stringify(payload);
 assert.ok(!text.includes('local:'),'no local id anywhere in the payload');
 assert.ok(!text.includes('sanctuary in time'),'no local wording anywhere in the payload');
 assert.ok(!text.includes(READING.attribution),'no local attribution anywhere in the payload');
});

test('refusals are sentences that say what to do next',async()=>{
 const {call}=wired();
 const refused=async(args:Record<string,unknown>,pattern:RegExp)=>{const result=await call('add_local_source',{...READING,...args});assert.equal(result.isError,true,`expected a refusal for ${JSON.stringify(args)}`);assert.match(result.text,pattern)};
 await refused({blocks:[{he:'שָׁלוֹם'}]},/Block 1 has Hebrew but no transliteration\. Add tr/);
 await refused({blocks:[{tr:'shalom'}]},/Block 1 has a transliteration but no Hebrew/);
 await refused({blocks:[{he:'shalom',tr:'shalom'}]},/Block 1's he has no Hebrew letters/);
 await refused({blocks:Array.from({length:12},()=>({en:'x'.repeat(1900)}))},/holds at most 20000\. Enter the reading as two sources/);
 await refused({attribution:'   '},/attribution .* is empty/);
 await refused({page:0},/page must be the printed page number/);
 assert.equal((await call('add_local_source',READING)).isError,false);
 await refused({},/already has a local source named "For the Gift of Shabbat".*update_local_source/);
 // A rename onto a name already on that page is refused the same way; a different name on it is fine.
 const other=await call('add_local_source',{...READING,name:'Another reading'});assert.equal(other.isError,false,other.text);
 const renamed=await call('update_local_source',{sourceId:other.output.source.id,expectedVersion:other.output.source.version,name:'for the gift of shabbat'});
 assert.equal(renamed.isError,true);assert.match(renamed.text,/already has a local source named "For the Gift of Shabbat".*Nothing was changed/);
 assert.equal((await call('update_local_source',{sourceId:other.output.source.id,expectedVersion:other.output.source.version,name:'Another reading, revised'})).isError,false);
 const service=createAuthoringService(new MemoryAuthoringRepository());
 await assert.rejects(service.operation('add_local_source',{...READING,blocks:[]},'tester'),(error:unknown)=>error instanceof AuthoringError&&/at least one block of text/.test(error.message));
 await assert.rejects(service.operation('add_local_source',{...READING,colour:'red'},'tester'),(error:unknown)=>error instanceof AuthoringError&&/cannot take colour/.test(error.message));
});

test('an edit bumps the version, pinned drafts see the drift, and a refresh rebases them',async()=>{
 const {call,repo}=wired();
 const source=(await call('add_local_source',READING)).output.source;
 const created=await call('create_draft',{name:'Gift of Shabbat',title:'Gift',layout:'left',content:{mode:'original-en',englishGroups:[{sourceId:source.id,blockIds:[source.blocks[0].id]}]}});
 const draftId=created.output.draft.id;await publish(call,draftId,1);

 const unchanged=await call('update_local_source',{sourceId:source.id,expectedVersion:1,attribution:READING.attribution});
 assert.equal(unchanged.output.changed,false);assert.equal(unchanged.output.source.version,1,'a no-op write keeps the version');

 const edited=await call('update_local_source',{sourceId:source.id,expectedVersion:1,blocks:[{en:'We give thanks for Shabbat, a sanctuary in time.'},READING.blocks[1]]});
 assert.equal(edited.isError,false,edited.text);assert.equal(edited.output.source.version,2);assert.equal(edited.output.wordingChanged,true);
 assert.equal(edited.output.source.staleDrafts,1);assert.match(edited.output.next,/refreshSourceIds/);
 const stale=(await call('update_local_source',{sourceId:source.id,expectedVersion:1,name:'Other'}));
 assert.equal(stale.isError,true);assert.match(stale.text,/changed since you read it \(now version 2\)/);

 // The draft still reads its pinned wording until someone decides otherwise, exactly like a corpus draft.
 const kept=await repo.getDraft(draftId) as Draft;assert.doesNotThrow(()=>assertSourcePin(kept));
 assert.match(kept.sourceSnapshots![0].blocks[0].en!,/gift of Shabbat/);
 const listed=await call('list_local_sources',{book:"Mishkan T'filah"},undefined);
 assert.deepEqual(listed.output.sources[0].usedBy,[{draftId,name:'Gift of Shabbat',published:true,stale:true}]);

 const scan=await call('scan_source_changes',{});
 assert.equal(scan.isError,false,scan.text);assert.equal(scan.output.detected,1,'the source-change inbox sees the edit');
 const record=scan.output.records[0];assert.equal(record.sourceId,source.id);assert.equal(record.changeCount,1);assert.equal(record.blockedReason,undefined);

 const refreshed=await call('update_draft',{draftId,expectedVersion:kept.version,refreshSourceIds:[source.id],patch:{content:kept.content}});
 assert.equal(refreshed.isError,false,refreshed.text);
 const rebased=await repo.getDraft(draftId) as Draft;
 assert.match(rebased.sourceSnapshots![0].blocks[0].en!,/We give thanks for Shabbat/);assert.doesNotThrow(()=>assertSourcePin(rebased));
 assert.equal((await call('list_local_sources',{},undefined)).output.sources[0].usedBy[0].stale,false,'refreshed, no longer stale');
});

test('Hebrew with transliteration and English pairs as a translation, and a whole local source becomes a set',async()=>{
 const {call}=wired();
 const source=(await call('add_local_source',BLESSING)).output.source;
 assert.deepEqual(source.kinds,['bilingual','translation-en']);
 const [bilingual,translation]=source.blocks;assert.deepEqual(translation.translates,[bilingual.id]);
 const groups=[{sourceId:source.id,blockIds:[bilingual.id]}];
 const created=await call('create_draft',{name:'Shalom Rav',title:'Shalom Rav',layout:'bottom',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true}});
 assert.equal(created.isError,false,created.text);
 const rendered=await call('get_draft',{draftId:created.output.draft.id,view:'rendered'},undefined);
 assert.equal(rendered.output.rendered.texts.textTranslation,BLESSING.blocks[0].en);
 const set=await call('create_source_draft_set',{sourceId:source.id,mode:'bilingual',layout:'left'});
 assert.equal(set.isError,false,set.text);assert.equal(set.output.set.count,1);
 const previewed=await call('preview_content',{name:'Look',title:'Look',layout:'bottom',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups}},undefined);
 assert.equal(previewed.isError,false,previewed.text);assert.equal(previewed.output.validation.valid,true);
 const edited=await call('update_draft',{draftId:created.output.draft.id,expectedVersion:1,patch:{title:'Shalom Rav (evening)'}});
 assert.equal(edited.isError,false,edited.text);
});

test('a draft may add a local source to its selection, and rollback checks a local revision against its current unit',async()=>{
 const {call,repo}=wired();
 const first=(await call('add_local_source',READING)).output.source;
 const second=(await call('add_local_source',{...READING,name:'Second reading',page:177,blocks:[{en:'A second reading.'}]})).output.source;
 const created=await call('create_draft',{name:'Readings',title:'Readings',layout:'left',content:{mode:'original-en',englishGroups:[{sourceId:first.id,blockIds:[first.blocks[0].id]}]}});
 const draftId=created.output.draft.id;await publish(call,draftId,1);
 const widened=await call('update_draft',{draftId,expectedVersion:1,patch:{content:{mode:'original-en',englishGroups:[{sourceId:first.id,blockIds:[first.blocks[0].id]},{sourceId:second.id,blockIds:[second.blocks[0].id]}]}}});
 assert.equal(widened.isError,false,widened.text);
 const draft=await repo.getDraft(draftId) as Draft;
 assert.deepEqual(draft.sourceSnapshots!.map(item=>item.id).sort(),[first.id,second.id].sort(),'the new local source is snapshotted');
 assert.doesNotThrow(()=>assertSourcePin(draft));
 const rolled=await call('rollback_draft',{draftId,expectedVersion:draft.version,revision:1});
 assert.equal(rolled.isError,false,rolled.text);
 await call('update_local_source',{sourceId:first.id,expectedVersion:1,blocks:[{en:'Changed.'}]});
 const current=await repo.getDraft(draftId) as Draft;
 const refused=await call('rollback_draft',{draftId,expectedVersion:current.version,revision:1});
 assert.equal(refused.isError,true,'a revision whose local source moved on is refused, as a corpus one is');
});

test('a setlist row with {book, folio} matches a published graphic built on a local source',async()=>{
 const {call,repo}=wired();
 const source=(await call('add_local_source',READING)).output.source;
 const created=await call('create_draft',{name:'Gift of Shabbat',title:'Gift',layout:'left',content:{mode:'original-en',englishGroups:[{sourceId:source.id,blockIds:[source.blocks[0].id]}]}});
 await publish(call,created.output.draft.id,1);
 const cues=await repo.published() as unknown as Cue[];
 const setlist:LiveSetlist={id:'s',name:'Friday',tracks:[{id:'t1',title:'Reading',type:'reading',liturgyRef:{book:"Mishkan T'filah",folio:176}},{id:'t2',title:'Reading',type:'reading',liturgyRef:{book:'mishkan-tfilah',folio:176}}]} as LiveSetlist;
 const matched=matchSetlist(setlist,{cues,liturgyFor:cue=>liturgyForCue(cue as {authoring?:{sourceIds?:string[]}})});
 assert.deepEqual(matched.coverage.map(row=>[row.status,row.cueId]),[['covered',created.output.draft.id],['covered',created.output.draft.id]],'the printed title and the slug both match');
});

test('the deck-conversion lookup finds local units by book and page, and the slug is stable',async()=>{
 const locals=new MemoryLocalSourceRepository();
 const deps:LocalSourceDeps={sources:locals,drafts:async()=>[],workspaceId:'temple-bnai-israel-kalamazoo'};
 const added=await localSourceOperation('add_local_source',{...READING},'tester',deps) as {source:{id:string}};
 assert.equal(localBookSlug("Mishkan T'filah"),'mishkan-tfilah');assert.equal(localBookSlug('Mishkan HaNefesh'),'mishkan-hanefesh');
 const units=(await locals.list()).map(localSourceUnit);
 assert.deepEqual(localSourcesAt(units,'MISHKAN TFILAH',176).map(unit=>unit.id),[added.source.id]);
 assert.deepEqual(localSourcesAt(units,"Mishkan T'filah",175),[]);
 assert.deepEqual((await findLocalSourcesAt(locals,'mishkan-tfilah',176)).map(unit=>unit.id),[added.source.id]);
 assert.equal(units[0].origin,'local:temple-bnai-israel-kalamazoo');
});

test('a draft built from a local source takes the house defaults and still carries its attribution (T1 with T2)',async()=>{
 const {call}=wired();
 const set=await call('update_authoring_defaults',{expectedVersion:0,textSize:'large',lineSpacing:'spacious'});
 assert.equal(set.isError,false,set.text);
 const added=await call('add_local_source',READING);assert.equal(added.isError,false,added.text);
 const source=added.output.source;
 const created=await call('create_draft',{name:'Gift of Shabbat',title:'For the Gift of Shabbat',layout:'left',content:{mode:'original-en',englishGroups:[{sourceId:source.id,blockIds:[source.blocks[0].id]}]}});
 assert.equal(created.isError,false,created.text);
 assert.equal(created.output.provenance[0].attribution,READING.attribution,'the local source is still credited');
 assert.ok(created.output.houseDefaults?.applied.length,'the house defaults were applied');
 assert.equal(created.output.draft.presentation.lineSpacing,'spacious');
});
