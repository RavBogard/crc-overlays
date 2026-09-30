import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,SOURCE_REVIEW_OPERATIONS,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {baselineCues,type Draft} from '../lib/authoring-model';
import {buildSharedLibraryPayload,type SharedLibrarySnapshot} from '../lib/shared-library';
import {MemorySourceReviewRepository,createSourceReviewService} from '../lib/source-review';
import {useSlotCueRegister} from '../lib/slot-catalog';
import {TEXT_SIZE_PRESETS,templateLooks} from '../lib/template-looks';
import {NEW_OVERLAY_PRESENTATION_DEFAULTS} from '../lib/authoring-defaults';

// Packet A1 (R-A4, R-A5, R-A6): every tool here runs through the real MCP handler into the real
// in-memory authoring service, so a schema and the operation it names cannot drift apart.
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
type Content={type:string;text?:string;data?:string;mimeType?:string};
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output;content:Content[]};

function wired(options:{shared?:{get():Promise<SharedLibrarySnapshot>};serverFit?:ServerFitRunner}={}){
 const repo=new MemoryAuthoringRepository();
 const service=createAuthoringService(repo,undefined,options.shared,async()=>undefined,options.serverFit);
 const reviews=createSourceReviewService(repo,new MemorySourceReviewRepository(repo));
 const calls:string[]=[];
 // The same split lib/authoring.ts authoringOperation makes: source review is its own service.
 const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{calls.push(operation);const review=SOURCE_REVIEW_OPERATIONS[operation];return review?reviews.operation(review,input,actor):service.operation(operation,input,actor)});
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={},workspace:string|undefined='crc'):Promise<Called>=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:workspace===undefined?args:{...args,workspace}}})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Content[]};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{},content:[]};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output,content:body.result!.content};
 };
 const tools=async()=>{const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/list',params:{}})}),{authInfo});const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);return (JSON.parse(data??'{}') as {result:{tools:Array<{name:string;inputSchema:{required?:string[];properties:Record<string,{default?:unknown}>}}>}}).result.tools};
 return {repo,service,calls,call,tools};
}
const lookFor=(layout:string,mode='bilingual')=>templateLooks(baselineCues.filter(cue=>!cue.hidden).map(cue=>({id:cue.id,layout:cue.layout,importable:true})),mode as 'bilingual').find(look=>look.layout===layout)!;

test('acceptance: a source-backed graphic is made with search_sources then create_draft alone',async()=>{
 const {call,calls}=wired();
 const found=await call('search_sources',{query:'barchu',includeBlocks:true,limit:5},undefined);
 assert.equal(found.isError,false,found.text);
 const source=found.output.sources.find((item:{blocks:Array<{kind:string}>})=>item.blocks.some(block=>block.kind==='bilingual'));
 assert.ok(source,'a search result carries selectable bilingual block ids');
 const block=source.blocks.find((item:{kind:string})=>item.kind==='bilingual');
 const groups=[{sourceId:source.id,blockIds:[block.id]}];
 const created=await call('create_draft',{name:'Barchu (agent)',title:'Barchu',layout:'bottom',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups}});
 assert.equal(created.isError,false,created.text);
 assert.equal(created.output.draft.templateCueId,lookFor('bottom').id,'the layout look supplies the template');
 assert.deepEqual(calls,['search_sources','create_draft'],'no get_source and no list_templates');
 const rendered=await call('get_draft',{draftId:created.output.draft.id,view:'rendered'},undefined);
 assert.equal(rendered.output.validation.valid,true);assert.ok(Object.values(rendered.output.rendered.texts).some(text=>typeof text==='string'&&text.length>0),'rendered view says what it reads');
 assert.doesNotMatch(rendered.text,/sourceSnapshots|blockSha256/);
});

test('search_sources is compact by default, filters by book and service, and lists block ids only on request',async()=>{
 const {call}=wired();
 const facets=await call('list_source_facets',{},undefined);
 assert.ok(facets.output.books.length>0&&facets.output.services.length>0);
 const book=facets.output.books[0].value;
 const compact=await call('search_sources',{book,limit:3},undefined);
 assert.equal(compact.isError,false,compact.text);
 assert.ok(compact.output.sources.length>0);assert.ok(compact.output.sources.every((item:{bookValue:string})=>item.bookValue===book));
 assert.doesNotMatch(compact.text,/"license"|"authority"|unitSha256|"blocks":\[/,'no licence blob, no pins, no blocks');
 assert.equal(typeof compact.output.feedSha256,'string');
 const full=await call('search_sources',{book,limit:3,compact:false},undefined);
 assert.match(full.text,/"authority"/,'compact:false keeps the legacy summaries');assert.ok(full.text.length>compact.text.length);
 const units=await call('list_book_units',{book},undefined);
 assert.equal(units.isError,false,units.text);assert.ok(units.output.sections.length>0);assert.equal(units.output.book.value,book);
 const unknown=await call('list_book_units',{book:'no-such-book'},undefined);
 assert.equal(unknown.isError,true);
});

test('list_templates returns a look per layout and the named text sizes; the sizes match the editor',async()=>{
 const {call}=wired();
 const listed=await call('list_templates',{},undefined);
 assert.ok(listed.output.templates.length>0,'existing callers keep templates');
 assert.deepEqual(listed.output.looks.map((look:{layout:string})=>look.layout),['bottom','left','right','corner']);
 assert.equal(listed.output.looks.find((look:{layout:string})=>look.layout==='corner').templateCueId,lookFor('corner').id);
 assert.deepEqual(listed.output.textSizes.map((size:{id:string})=>size.id),['comfortable','large','compact']);
 // The look drawer's own density buttons, read from its source so the two can never disagree.
 const drawer=readFileSync(new URL('../app/author/look-drawer.tsx',import.meta.url),'utf8');
 for(const id of Object.keys(TEXT_SIZE_PRESETS)){const line=drawer.split('\n').find(text=>text.includes(`id: "${id}"`))!;assert.ok(line,`${id} is an editor density`);assert.match(line,id==='comfortable'?/value: \{\}/:new RegExp(`TEXT_SIZE_PRESETS\\.${id}\\.sizes`))}
 const custom=await call('list_templates',{mode:'custom'},undefined);
 assert.match(custom.output.looks.find((look:{layout:string})=>look.layout==='corner').label,/one line/);
});

test('create_draft takes a text size under explicit sizes, and update_draft applies one to the kept presentation',async()=>{
 const {call}=wired();
 const created=await call('create_draft',{name:'Welcome',title:'Welcome',layout:'bottom',textSize:'large',presentation:{titleFontSize:30,alignment:'center'},content:{mode:'custom',text:'Welcome to Shabbat'}});
 assert.equal(created.isError,false,created.text);
 assert.deepEqual(created.output.draft.presentation,{...NEW_OVERLAY_PRESENTATION_DEFAULTS,alignment:'center',...TEXT_SIZE_PRESETS.large.sizes,largePrint:true});
 const updated=await call('update_draft',{draftId:created.output.draft.id,expectedVersion:1,textSize:'compact',patch:{}});
 assert.equal(updated.isError,false,updated.text);
 assert.deepEqual(updated.output.draft.presentation,{...NEW_OVERLAY_PRESENTATION_DEFAULTS,alignment:'center',...TEXT_SIZE_PRESETS.compact.sizes});
 const reset=await call('update_draft',{draftId:created.output.draft.id,expectedVersion:2,textSize:'comfortable',patch:{}});
 assert.deepEqual(reset.output.draft.presentation,{...NEW_OVERLAY_PRESENTATION_DEFAULTS,alignment:'center'});
 const refused=await call('create_draft',{name:'Welcome',title:'Welcome',layout:'bottom',textSize:'huge',content:{mode:'custom',text:'x'}});
 assert.equal(refused.isError,true);
});

test('create_source_draft_set and an explicit template still work; a workspace template id is accepted',async()=>{
 const {call}=wired();
 const found=await call('search_sources',{query:'barchu',limit:1},undefined);
 const set=await call('create_source_draft_set',{sourceId:found.output.sources[0].id,mode:'bilingual',layout:'left'});
 assert.equal(set.isError,false,set.text);assert.ok(set.output.drafts.every((draft:Draft)=>draft.templateCueId===lookFor('left').id));
 const explicit=await call('create_draft',{name:'Explicit',title:'Explicit',layout:'bottom',templateCueId:BARECHU,content:{mode:'custom',text:'Hello'}});
 assert.equal(explicit.output.draft.templateCueId,BARECHU);
});

test('list_drafts is compact by default: sorted by name then set order, with set, dirty, archived and an excerpt',async()=>{
 const {call}=wired();
 const found=await call('search_sources',{query:'barchu',limit:1},undefined);
 const set=await call('create_source_draft_set',{sourceId:found.output.sources[0].id,mode:'bilingual',layout:'bottom'});
 const ids:string[]=set.output.set.draftIds;assert.ok(ids.length>=2,'the fixture prayer spans at least two lower thirds');
 await call('reorder_draft_set',{setId:set.output.set.id,expectedDraftIds:ids,orderedDraftIds:[...ids].reverse()});
 const custom=await call('create_draft',{name:'Announcement',title:'Kiddush',layout:'bottom',content:{mode:'custom',text:'Kiddush follows in the social hall.'}});
 const listed=await call('list_drafts',{},undefined);
 assert.equal(listed.isError,false,listed.text);
 assert.doesNotMatch(listed.text,/sourceSnapshots/,'compact, not the full records');
 const rows=listed.output.drafts as Array<{id:string;set:{id:string;index:number;count:number}|null;dirty:boolean;published:boolean;archived:boolean;excerpt:string}>;
 assert.equal(rows[0].id,custom.output.draft.id,'Announcement sorts before the prayer');
 assert.equal(rows[0].excerpt,'Kiddush follows in the social hall.','custom text has an excerpt');
 assert.deepEqual(rows.slice(1).map(row=>row.id),[...ids].reverse(),'set members follow their current set order');
 assert.deepEqual(rows.slice(1).map(row=>row.set!.index),ids.map((_,index)=>index+1));
 assert.ok(rows.slice(1).every(row=>row.excerpt.length>0&&row.set!.count===ids.length&&!row.published&&!row.dirty&&!row.archived));
 await call('archive_draft',{draftId:custom.output.draft.id,expectedVersion:1});
 const hidden=await call('list_drafts',{},undefined);assert.ok(!hidden.output.drafts.some((row:{id:string})=>row.id===custom.output.draft.id));
 const all=await call('list_drafts',{includeArchived:true},undefined);assert.equal(all.output.drafts.find((row:{id:string})=>row.id===custom.output.draft.id).archived,true);
 const page=await call('list_drafts',{limit:1},undefined);const next=await call('list_drafts',{limit:1,cursor:page.output.nextCursor},undefined);
 assert.equal(next.output.drafts[0].id,rows[2].id,'the cursor continues in name order');
 const stale=await call('list_drafts',{cursor:'no-such-draft'},undefined);assert.equal(stale.isError,true);assert.match(stale.text,/List again without cursor/);
 const full=await call('list_drafts',{compact:false},undefined);assert.match(full.text,/sourceSnapshots/,'compact:false still returns every full record');
});

test('dirty says a published draft has changes the live graphic lacks',async()=>{
 const fit:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.5,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test'});
 const {call}=wired({serverFit:fit});
 const created=await call('create_draft',{name:'Welcome',title:'Welcome',layout:'bottom',content:{mode:'custom',text:'Shabbat shalom'}});const draftId=created.output.draft.id;
 const preview=await call('preview_draft',{draftId,expectedVersion:1});
 await call('fit_check_draft',{draftId,expectedVersion:1,previewId:preview.output.previewId});
 await call('review_draft',{draftId,expectedVersion:1,previewId:preview.output.previewId,humanApproved:true});
 const published=await call('publish_draft',{draftId,expectedVersion:1,previewId:preview.output.previewId});assert.equal(published.isError,false,published.text);
 const clean=await call('list_drafts',{},undefined);assert.deepEqual([clean.output.drafts[0].published,clean.output.drafts[0].dirty],[true,false]);
 await call('update_draft',{draftId,expectedVersion:1,patch:{title:'Good Shabbos'}});
 const dirty=await call('list_drafts',{},undefined);assert.equal(dirty.output.drafts[0].dirty,true);
 const rendered=await call('get_draft',{draftId,view:'rendered'},undefined);assert.equal(rendered.output.draft.dirty,true);assert.equal(rendered.output.rendered.texts.textTitle,'Good Shabbos');
});

test('list_catalog lists baseline graphics nobody has opened, filtered by query and layout',async()=>{
 const {call}=wired();
 const all=await call('list_catalog',{},undefined);
 assert.ok(all.output.cues.some((cue:{id:string;draftId:string|null})=>cue.id===BARECHU&&cue.draftId===null));
 const bottom=await call('list_catalog',{layout:'bottom'},undefined);
 assert.ok(bottom.output.cues.length>0&&bottom.output.cues.every((cue:{layout:string})=>cue.layout==='bottom'));
 const byName=await call('list_catalog',{query:'barechu'},undefined);assert.ok(byName.output.cues.some((cue:{id:string})=>cue.id===BARECHU));assert.ok(byName.output.cues.length<all.output.cues.length);
});

test('duplicate_draft copies a draft or a catalog cue and refuses a stale expectedVersion',async()=>{
 const {call}=wired();
 const created=await call('create_draft',{name:'Welcome',title:'Welcome',layout:'bottom',content:{mode:'custom',text:'Shabbat shalom'}});
 const copy=await call('duplicate_draft',{draftId:created.output.draft.id,expectedVersion:1});
 assert.equal(copy.isError,false,copy.text);assert.equal(copy.output.draft.name,'Copy of Welcome');assert.notEqual(copy.output.draft.id,created.output.draft.id);
 const stale=await call('duplicate_draft',{draftId:created.output.draft.id,expectedVersion:2});assert.equal(stale.isError,true);assert.match(stale.text,/reload/);
 const fromCue=await call('duplicate_draft',{cueId:BARECHU,name:'Barechu copy'});assert.equal(fromCue.output.draft.name,'Barechu copy');assert.deepEqual(fromCue.output.duplicatedFrom,{kind:'cue',id:BARECHU});
 const both=await call('duplicate_draft',{cueId:BARECHU,expectedVersion:1});assert.equal(both.isError,true);assert.match(both.text,/expectedVersion goes with draftId/);
});

test('preview_content shows content without a draft, and with includePreviewImage returns the server frame as an image',async()=>{
 let fits=0;const fit:ServerFitRunner=async(_cue,options)=>{fits++;return {verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test',...(options?.includePreviewImage?{previewImage:{mimeType:'image/jpeg' as const,dataBase64:'AQID',width:1920,height:1080}}:{})}};
 const {call,repo}=wired({serverFit:fit});
 const content={name:'Welcome',title:'Welcome',layout:'corner',content:{mode:'custom',text:'Vaimru Amen'}};
 const plain=await call('preview_content',content,undefined);
 assert.equal(plain.isError,false,plain.text);assert.equal(plain.output.ephemeral,true);assert.equal(plain.content.length,1);assert.equal(fits,0);
 const imaged=await call('preview_content',{...content,includePreviewImage:true},undefined);
 assert.equal(imaged.output.fitCheck.verdict,'pass');assert.equal(imaged.output.fitCheck.stored,false);
 assert.deepEqual(imaged.content[1],{type:'image',data:'AQID',mimeType:'image/jpeg'});assert.doesNotMatch(imaged.text,/AQID/);
 assert.equal((await repo.listDrafts()).length,0,'nothing is stored');
});

test('list_custom_templates and compose_custom_draft make a guided custom draft, and refuse bad values in sentences',async()=>{
 const {call}=wired();
 const listed=await call('list_custom_templates',{},undefined);
 assert.deepEqual(listed.output.templates.map((template:{id:string})=>template.id),['speaker','announcement','citation','service-begins','corner']);
 assert.ok(listed.output.templates[0].fields.every((field:{maxLength:number})=>field.maxLength>0));
 const speaker=await call('compose_custom_draft',{templateId:'speaker',values:{name:'Rabbi Miriam Cohen',role:'Guest speaker'},textSize:'large'});
 assert.equal(speaker.isError,false,speaker.text);
 assert.deepEqual([speaker.output.draft.name,speaker.output.draft.title,speaker.output.draft.layout,speaker.output.draft.content],['Speaker · Rabbi Miriam Cohen','Rabbi Miriam Cohen','bottom',{mode:'custom',text:'Guest speaker'}]);
 assert.equal(speaker.output.draft.templateCueId,lookFor('bottom').id);assert.equal(speaker.output.draft.presentation.hebrewFontSize,TEXT_SIZE_PRESETS.large.sizes.hebrewFontSize);
 const corner=await call('compose_custom_draft',{templateId:'corner',values:{hebrew:'וְאִמְרוּ אָמֵן',line:'Vaimru Amen'}});
 assert.equal(corner.output.draft.layout,'corner');assert.equal(corner.output.draft.content.text,'וְאִמְרוּ אָמֵן\nVaimru Amen');
 const unknownField=await call('compose_custom_draft',{templateId:'speaker',values:{title:'Dr'}});
 assert.equal(unknownField.isError,true);assert.match(unknownField.text,/Speaker has no field called title; its fields are name, role\./);
 const tooLong=await call('compose_custom_draft',{templateId:'citation',values:{page:'1234567890123'}});
 assert.equal(tooLong.isError,true);assert.match(tooLong.text,/Page \(page\) is 13 characters; shorten it to 12 or fewer\./);
});

test('the shared library five are registered and reach the shelf operations',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'catalog-v1'});
 const {call}=wired({shared:{get:async()=>({available:true,configured:true,stale:false,refreshedAt:456,payload})}});
 const list=await call('list_shared_library',{query:'Barechu'},undefined);
 assert.equal(list.output.cues[0].id,BARECHU);
 const preview=await call('preview_shared_cue',{cueId:BARECHU});assert.equal(preview.output.cueHash,list.output.cues[0].cueHash);
 const stale=await call('customize_shared_cue',{cueId:BARECHU,expectedCueHash:'0'.repeat(64)});assert.equal(stale.isError,true);assert.match(stale.text,/changed after you opened it/);
 const copied=await call('customize_shared_cue',{cueId:BARECHU,expectedCueHash:preview.output.cueHash,name:'Barechu here'});
 assert.equal(copied.isError,false,copied.text);assert.equal(copied.output.draft.name,'Barechu here');
 const compared=await call('compare_shared_cue',{cueId:BARECHU,draftId:copied.output.draft.id},undefined);assert.equal(compared.output.beforeAvailable,true);
 const noSet=await call('customize_shared_set',{setId:'no-such-set',expectedCueHashes:{a:'0'.repeat(64)}});assert.equal(noSet.isError,true);assert.match(noSet.text,/no longer available/);
});

test('list_slots reports slot text and versions; save_slots publishes and refuses a stale expectedVersions',async()=>{
 const {call}=wired();
 const student=await call('create_draft',{name:'Student name',title:'Central Reform Congregation',layout:'bottom',templateCueId:BARECHU,content:{mode:'custom',text:'Student'}});
 useSlotCueRegister(new Map([['student_name',student.output.draft.id]]));
 try{
  const listed=await call('list_slots',{serviceType:'bnei-mitzvah'},undefined);
  const slot=listed.output.slots.find((item:{key:string})=>item.key==='student_name');
  assert.deepEqual([slot.minted,slot.version,slot.cueId],[true,1,student.output.draft.id]);
  assert.ok(listed.output.slots.some((item:{minted:boolean})=>!item.minted),'an unminted slot says so');
  const saved=await call('save_slots',{serviceType:'bnei-mitzvah',values:{student_name:'Noa Bogard'},expectedVersions:{student_name:1}});
  assert.equal(saved.isError,false,saved.text);assert.equal(saved.output.published,1);
  const stale=await call('save_slots',{serviceType:'bnei-mitzvah',values:{student_name:'Ezra Bogard'},expectedVersions:{student_name:1}});
  assert.equal(stale.isError,true);assert.match(stale.text,/Student name changed since you read it .*Call list_slots and save again\. Nothing was published\./);
  const after=await call('list_slots',{serviceType:'bnei-mitzvah'},undefined);assert.equal(after.output.slots.find((item:{key:string})=>item.key==='student_name').text,'Noa Bogard');
  const unknownType=await call('list_slots',{serviceType:'no-such-type'},undefined);assert.equal(unknownType.isError,true);assert.match(unknownType.text,/they are /);
 }finally{useSlotCueRegister(null)}
});

test('the source-change inbox is reachable: scan, list, get and decide',async()=>{
 const {call,calls}=wired();
 const scanned=await call('scan_source_changes',{});assert.equal(scanned.isError,false,scanned.text);assert.equal(typeof scanned.output.detected,'number');
 const listed=await call('list_source_changes',{},undefined);assert.ok(Array.isArray(listed.output.records));
 const missing=await call('get_source_change',{id:'no-such-change'},undefined);assert.equal(missing.isError,true);assert.match(missing.text,/Source change not found/);
 const decided=await call('decide_source_change',{id:'no-such-change',expectedVersion:1,decision:'defer',reason:'later'});assert.equal(decided.isError,true);assert.match(decided.text,/Refresh and try again/);
 assert.deepEqual(calls,['scan_source_changes','list_source_changes','get_source_change','decide_source_change']);
 assert.deepEqual(Object.values(SOURCE_REVIEW_OPERATIONS).sort(),['decide','get','list','scan']);
});

test('existing tools keep their required arguments; the new writes require workspace and the reads do not',async()=>{
 const {tools}=wired();const listed=await tools();const byName=new Map(listed.map(tool=>[tool.name,tool]));
 const required=(name:string)=>[...(byName.get(name)?.inputSchema.required??[])].sort();
 assert.deepEqual(required('create_draft'),['content','layout','name','title','workspace'],'templateCueId became optional; nothing became required');
 assert.deepEqual(required('create_source_draft_set'),['layout','mode','sourceId','workspace']);
 assert.deepEqual(required('search_sources'),[],'query became optional');
 assert.deepEqual(required('get_draft'),['draftId']);
 for(const name of ['duplicate_draft','compose_custom_draft','save_slots','customize_shared_cue','customize_shared_set','preview_shared_cue','scan_source_changes','decide_source_change'])assert.ok(required(name).includes('workspace'),`${name} names its congregation`);
 for(const name of ['list_catalog','preview_content','list_book_units','list_source_facets','list_custom_templates','list_slots','list_shared_library','compare_shared_cue','list_source_changes','get_source_change'])assert.ok(!required(name).includes('workspace'),`${name} is a read`);
 assert.equal(byName.get('list_drafts')!.inputSchema.properties.compact.default,true);
});
