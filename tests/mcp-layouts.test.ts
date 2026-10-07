import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {MemoryLayoutDefinitionsRepository,PgLayoutDefinitionsRepository,withResolvedLayouts,ensurePublishedLayoutsRegistered,REGISTRY_REFRESH_MS} from '../lib/layout-definitions';
import {CORNER_CARD,layoutDefinition,unregisterLayout,type ResolvedLayouts} from '../lib/layout-registry';
import {validateLayoutDocument,mergePatch} from '../lib/layout-tools';
import {composeAuthoringCatalog} from '../lib/server';
import type {AuthoringCue} from '../lib/authoring-model';
import {RESPONSE_CARD} from './layout-fixtures';
import {measureCueOnServer,type StageLauncher} from '../lib/server-fit';
import type {Cue} from '../lib/player';

// Packet L3 (R-L4): the layout tools, end to end through the real MCP handler into the real
// in-memory authoring service and layout store, with a stubbed server fit that records what the
// stage would have been handed.
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:0a1b2c:member:member-7'}} satisfies AuthInfo;
const FRAME={mimeType:'image/jpeg' as const,dataBase64:Buffer.from('layout-frame').toString('base64'),width:1920,height:1080};
type Content={type:string;text?:string;data?:string;mimeType?:string};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Fitted={cue:AuthoringCue;layouts?:ResolvedLayouts;includePreviewImage?:boolean};

function wired(verdict:(cue:AuthoringCue)=>string[]=()=>[]){
 const repo=new MemoryAuthoringRepository(),layouts=new MemoryLayoutDefinitionsRepository(),fitted:Fitted[]=[];
 const runner:ServerFitRunner=async(cue,options)=>{fitted.push({cue,layouts:options?.layouts,includePreviewImage:options?.includePreviewImage});const fitErrors=verdict(cue);return {verdict:fitErrors.length?'fail':'pass',fitErrors,warnings:[],fill:null,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test',...(options?.includePreviewImage?{previewImage:FRAME}:{})}};
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,runner,undefined,undefined,undefined,layouts);
 const calls:string[]=[];
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>{calls.push(operation);return service.operation(operation,input,who)});
 let id=0;
 const rpc=async(method:string,params:Record<string,unknown>)=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  return JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Content[];tools?:{name:string;inputSchema:{properties:Record<string,{enum?:string[]}>}}[]};error?:{message:string}};
 };
 const call=async(name:string,args:Record<string,unknown>={},workspace:string|null='crc')=>{
  const body=await rpc('tools/call',{name,arguments:workspace===null?args:{...args,workspace}});
  if(body.error)return {isError:true,text:body.error.message,output:{} as Output,content:[] as Content[]};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{/* a refusal sentence */}
  return {isError:body.result!.isError===true,text,output,content:body.result!.content};
 };
 const draftLayouts=async()=>(await rpc('tools/list',{})).result!.tools!.find(tool=>tool.name==='create_draft')!.inputSchema.properties.layout.enum!;
 return {repo,layouts,service,calls,call,fitted,draftLayouts};
}
const vaimru={name:'Vaimru Amen response',title:'Response',layout:'response',content:{mode:'custom',text:'Vaimru Amen'}};

test('acceptance: an agent creates a top-right Response card and publishes a graphic in it, with no code change and no release',async()=>{
 const {call,calls,fitted,draftLayouts,layouts,service}=wired();
 try{
  assert.equal(layoutDefinition('response'),undefined,'no such layout exists in code');
  const listed=await call('list_layouts',{},null);
  assert.equal(listed.isError,false,listed.text);
  assert.equal(listed.output.workspaceId,'crc');
  assert.deepEqual(listed.output.layouts.map((item:Output)=>[item.id,item.kind]),[['bottom','built-in'],['left','built-in'],['right','built-in'],['corner','built-in']]);
  assert.equal((await draftLayouts()).includes('response'),false);

  // Clone the corner card and pin it top-right.
  const created=await call('create_layout',{layoutId:'response',from:'corner',label:'Response card',card:{frame:{anchor:'top-right'}}});
  assert.equal(created.isError,false,created.text);
  assert.deepEqual([created.output.layout.version,created.output.layout.status,created.output.validation.valid],[1,'draft',true]);
  const stored=await call('get_layout',{layoutId:'response'},null);
  assert.deepEqual(stored.output.document,RESPONSE_CARD,'the clone is the corner card, anchored top-right');

  // A draft layout is not usable yet: create_draft refuses it in a sentence.
  const early=await call('create_draft',vaimru);
  assert.equal(early.isError,true);

  // Preview: the three standard samples, each fitted with the draft definition handed to the stage, frames back as images.
  const preview=await call('preview_layout',{layoutId:'response'},null);
  assert.equal(preview.isError,false,preview.text);
  assert.equal(preview.output.verdict,'pass');
  assert.equal(preview.output.samples.length,3);
  assert.deepEqual(preview.content.slice(1).map(item=>[item.type,item.data]),[['image',FRAME.dataBase64],['image',FRAME.dataBase64],['image',FRAME.dataBase64]]);
  assert.doesNotMatch(preview.content[0].text!,new RegExp(FRAME.dataBase64),'no base64 inside the JSON');
  assert.deepEqual(preview.output.samples.map((item:Output)=>item.previewImage.frame),[1,2,3]);
  for(const fit of fitted){
   assert.equal(fit.cue.layout,'response');
   assert.deepEqual(fit.cue.layoutRef,{id:'response',version:1,sha256:created.output.layout.sha256});
   assert.equal(fit.layouts?.['response@1']?.document.card.frame.anchor,'top-right','the stage is handed the definition it draws');
  }
  assert.deepEqual(fitted[0].cue.texts,{textTitle:'Response',textMainheb:'וְאִמְרוּ אָמֵן',textMainEng:'V\'imru amen'});
  assert.deepEqual(fitted[1].cue.texts,{textTitle:'Announcement',textMain:'Kiddush follows in the social hall'});

  // Publish: passes the sample set, then the registry knows the layout and create_draft offers it.
  fitted.length=0;
  const published=await call('publish_layout',{layoutId:'response',expectedVersion:1});
  assert.equal(published.isError,false,published.text);
  assert.equal(published.output.published,true);
  assert.equal(fitted.length,3,'the standard sample set was fitted before publishing');
  assert.equal(layoutDefinition('response')?.ref?.version,1);
  assert.ok((await draftLayouts()).includes('response'),'the next tools/list offers the new layout');

  // A graphic in it, in the same two calls as any other: create_draft then ship_draft.
  fitted.length=0;calls.length=0;
  const draft=await call('create_draft',vaimru);
  assert.equal(draft.isError,false,draft.text);
  const shipped=await call('ship_draft',{draftId:draft.output.draft.id,expectedVersion:draft.output.draft.version});
  assert.equal(shipped.isError,false,shipped.text);
  assert.equal(shipped.output.shipped,true,shipped.text);
  assert.deepEqual(calls,['create_draft','ship_draft']);
  assert.deepEqual(fitted[0].cue.layoutRef,{id:'response',version:1,sha256:created.output.layout.sha256});
  assert.equal(fitted[0].layouts?.['response@1']?.document.label,'Response card','the server fit of the draft is handed its pinned definition');
  const cue=(await service.publishedCues()).find(item=>item.id===draft.output.draft.id)!;
  assert.deepEqual(cue.layoutRef,{id:'response',version:1,sha256:created.output.layout.sha256});
  const envelope=await withResolvedLayouts(composeAuthoringCatalog([],await service.publishedCues()),layouts);
  assert.equal(envelope.layouts?.['response@1']?.document.card.frame.anchor,'top-right','the catalog carries the definition to the output');

  // Edit the layout: version 1 and the graphic stay; the rebase is a dry run until asked.
  const edited=await call('update_layout',{layoutId:'response',expectedVersion:1,card:{surface:{radius:4}}});
  assert.equal(edited.isError,false,edited.text);
  assert.deepEqual([edited.output.layout.version,edited.output.openedDraft],[2,true]);
  assert.equal((await call('publish_layout',{layoutId:'response',expectedVersion:2})).output.published,true);
  assert.equal((await service.publishedCues()).find(item=>item.id===cue.id)!.layoutRef!.version,1,'publishing a new version moves no published graphic');
  const counted=await call('get_layout',{layoutId:'response'},null);
  assert.deepEqual(counted.output.pinnedGraphics,{'1':1});
  const dry=await call('rebase_to_layout',{layoutId:'response',expectedVersion:2});
  assert.equal(dry.isError,false,dry.text);
  assert.deepEqual([dry.output.dryRun,dry.output.wouldRebase,dry.output.items[0].action],[true,1,'would-rebase']);
  assert.equal((await service.publishedCues()).find(item=>item.id===cue.id)!.layoutRef!.version,1,'a dry run changes nothing');
  const moved=await call('rebase_to_layout',{layoutId:'response',expectedVersion:2,dryRun:false});
  assert.equal(moved.output.rebased,1,moved.text);
  assert.equal((await service.publishedCues()).find(item=>item.id===cue.id)!.layoutRef!.version,2);
 }finally{if(layoutDefinition('response'))unregisterLayout('response')}
});

test('publish_layout publishes nothing when a sample does not fit, and says which',async()=>{
 const {call}=wired(cue=>cue.texts.textMain?['textMain does not fit its box.']:[]);
 try{
  await call('create_layout',{layoutId:'tight',from:'corner'});
  const stopped=await call('publish_layout',{layoutId:'tight',expectedVersion:1});
  assert.equal(stopped.isError,false,stopped.text);
  assert.deepEqual([stopped.output.published,stopped.output.stoppedAt],[false,'fit_failed']);
  assert.match(stopped.output.message,/^One English line: textMain does not fit its box\. Nothing was published/);
  assert.equal(layoutDefinition('tight'),undefined);
  assert.equal((await call('get_layout',{layoutId:'tight'},null)).output.status,'draft');
 }finally{if(layoutDefinition('tight'))unregisterLayout('tight')}
});

test('validate_layout names overlapping channels and a floor above a font size, and publish refuses them',async()=>{
 const {call}=wired();
 const created=await call('create_layout',{layoutId:'crowded',from:'corner',card:{body:{latin:{y:100}},fit:{floor:30}}});
 assert.equal(created.isError,false,created.text);
 const checked=await call('validate_layout',{layoutId:'crowded'},null);
 assert.equal(checked.output.valid,false);
 assert.deepEqual(checked.output.checks.filter((item:Output)=>!item.ok).map((item:Output)=>item.check),['no-overlap','floor']);
 assert.match(checked.output.errors[0],/^The Hebrew channel \(x 32-616, y 90-148\) overlaps the transliteration channel/);
 assert.match(checked.output.errors.join(' '),/title\.fontSize is 28, below fit\.floor 30/);
 const refused=await call('publish_layout',{layoutId:'crowded',expectedVersion:1});
 assert.deepEqual([refused.output.published,refused.output.stoppedAt],[false,'validation']);
});

test('the built-in layouts are read only, and writes name the congregation and the version',async()=>{
 const {call}=wired();
 const corner=await call('get_layout',{layoutId:'corner'},null);
 assert.deepEqual([corner.output.kind,corner.output.cloneable],['built-in',true]);
 assert.deepEqual(corner.output.card,CORNER_CARD);
 assert.equal((await call('get_layout',{layoutId:'bottom'},null)).output.card,null);
 const bottom=await call('create_layout',{layoutId:'lower',from:'bottom'});
 assert.equal(bottom.isError,true);assert.match(bottom.text,/bottom is drawn by built-in layered CSS, not as a card, so it can't be cloned/);
 const builtIn=await call('update_layout',{layoutId:'corner',expectedVersion:1,label:'Mine'});
 assert.equal(builtIn.isError,true);assert.match(builtIn.text,/corner is built in and cannot be changed here/);
 const missing=await call('create_layout',{layoutId:'noted',from:'corner'},null);
 assert.equal(missing.isError,true,missing.text);assert.match(missing.text,/Name the congregation/);
 await call('create_layout',{layoutId:'noted',from:'corner'});
 const stale=await call('update_layout',{layoutId:'noted',expectedVersion:3,label:'Notes'});
 assert.equal(stale.isError,true);assert.match(stale.text,/noted is at version 1 \(draft\), not 3\. Call get_layout and retry with expectedVersion 1/);
 const twice=await call('create_layout',{layoutId:'noted',from:'corner'});
 assert.equal(twice.isError,true);assert.match(twice.text,/A layout called noted already exists/);
 const unknown=await call('get_layout',{layoutId:'nowhere'},null);
 assert.equal(unknown.isError,true);assert.match(unknown.text,/There is no layout called nowhere here\. list_layouts/);
});

test('preview_layout draws named drafts in the layout, and says why one cannot be',async()=>{
 const {call,fitted}=wired();
 await call('create_layout',{layoutId:'side',from:'corner',card:{frame:{anchor:'top-left'}}});
 const english=await call('create_draft',{name:'Welcome',title:'Welcome',layout:'bottom',content:{mode:'custom',text:'Welcome to Shabbat'}});
 const preview=await call('preview_layout',{layoutId:'side',draftIds:[english.output.draft.id,'no-such-draft'],includePreviewImages:false},null);
 assert.equal(preview.isError,false,preview.text);
 assert.deepEqual(preview.output.samples.map((item:Output)=>[item.label,item.verdict]),[['Welcome','pass'],['no-such-draft','not-rendered']]);
 assert.equal(preview.content.length,1,'no frames when includePreviewImages is false');
 assert.deepEqual([fitted[0].cue.layout,fitted[0].cue.texts.textMain,fitted[0].includePreviewImage],['side','Welcome to Shabbat',false]);
 assert.equal(preview.output.verdict,'fail');
});

test('startup registration: a published layout another instance wrote is registered once the refresh is due',async()=>{
 const repository=new MemoryLayoutDefinitionsRepository();
 try{
  await ensurePublishedLayoutsRegistered(repository,0);
  // Written straight to the store, as another serverless instance would.
  const draft=await repository.saveDraft('elsewhere',RESPONSE_CARD,null,'editor',1);
  (repository as unknown as {rows:Map<string,{status:string}[]>}).rows.get('elsewhere')![0].status='published';
  await ensurePublishedLayoutsRegistered(repository,1);
  assert.equal(layoutDefinition('elsewhere'),undefined,'within the refresh window nothing is re-read');
  await ensurePublishedLayoutsRegistered(repository,REGISTRY_REFRESH_MS+1);
  assert.deepEqual(layoutDefinition('elsewhere')?.ref,{id:'elsewhere',version:1,sha256:draft.sha256});
 }finally{if(layoutDefinition('elsewhere'))unregisterLayout('elsewhere')}
});

test('mergePatch merges objects and replaces everything else; the corner card passes the static check',()=>{
 assert.deepEqual(mergePatch({a:{b:1,c:2},d:[1]},{a:{c:3},d:[2]}),{a:{b:1,c:3},d:[2]});
 assert.deepEqual(mergePatch({fill:{denominator:1}},{fill:null}),{fill:null});
 assert.deepEqual(validateLayoutDocument('response',RESPONSE_CARD).errors,[]);
 assert.match(validateLayoutDocument('Response',RESPONSE_CARD).errors[0],/must start with a letter/);
 assert.match(validateLayoutDocument('corner',RESPONSE_CARD).errors[0],/corner is a built-in layout/);
});

test('the Postgres store: reads answer "none" and writes refuse in a sentence until db/layout-definitions.sql is applied',async()=>{
 const missing=Object.assign(new Error('relation "layout_definitions" does not exist'),{code:'42P01'});
 const unmigrated=new PgLayoutDefinitionsRepository(async()=>({query:async()=>{throw missing},connect:async()=>({query:async(sql:string)=>{if(sql==='BEGIN'||sql==='ROLLBACK')return {rows:[]};throw missing},release(){}})}));
 assert.deepEqual(await unmigrated.list(),[]);
 assert.equal(await unmigrated.get('response',1),null);
 await assert.rejects(unmigrated.saveDraft('response',RESPONSE_CARD,null,'editor',1),/Layouts as data are not set up in this workspace's database yet/);
 await assert.rejects(unmigrated.publish('response',1,'editor',1),/Nothing was saved; ask whoever runs the database to apply it/);
});

test('the Postgres store writes version 1, rewrites a draft in place, opens N+1 above a published version, and publishes only the newest draft',async()=>{
 type Row={id:string;version:number;status:string;document:unknown;sha256:string;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string};
 const rows:Row[]=[],sql:string[]=[];
 const run=async(text:string,values:unknown[]=[])=>{
  sql.push(text.split(' ').slice(0,2).join(' '));
  if(text==='BEGIN'||text==='COMMIT'||text==='ROLLBACK')return {rows:[]};
  if(text.startsWith('SELECT version,status')){const newest=rows.filter(row=>row.id===values[0]).sort((a,b)=>b.version-a.version)[0];return {rows:newest?[{version:String(newest.version),status:newest.status}]:[]}}
  if(text.startsWith('INSERT')){const row:Row={id:values[0] as string,version:values[1] as number,status:'draft',document:values[2],sha256:values[3] as string,createdAt:values[4] as number,updatedAt:values[4] as number,createdBy:values[5] as string,updatedBy:values[5] as string};rows.push(row);return {rows:[row]}}
  if(text.startsWith('UPDATE layout_definitions SET document')){const row=rows.find(item=>item.id===values[0]&&item.version===values[1]&&item.status==='draft');if(row)Object.assign(row,{document:values[2],sha256:values[3],updatedAt:values[4],updatedBy:values[5]});return {rows:row?[row]:[]}}
  if(text.startsWith('UPDATE layout_definitions SET status')){const max=Math.max(...rows.filter(item=>item.id===values[0]).map(item=>item.version));const row=rows.find(item=>item.id===values[0]&&item.version===values[1]&&item.status==='draft'&&item.version===max);if(row)Object.assign(row,{status:'published',updatedAt:values[2],updatedBy:values[3]});return {rows:row?[row]:[]}}
  if(text.startsWith('SELECT id')){return {rows:values.length?rows.filter(row=>row.id===values[0]&&row.version===values[1]):rows}}
  throw new Error(`unexpected ${text}`);
 };
 const repository=new PgLayoutDefinitionsRepository(async()=>({query:run,connect:async()=>({query:run,release(){}})}));
 try{
  const first=await repository.saveDraft('pgcard',RESPONSE_CARD,null,'editor',1);
  assert.deepEqual([first.version,first.status],[1,'draft']);
  await assert.rejects(repository.saveDraft('pgcard',RESPONSE_CARD,null,'editor',2),/changed in another session/);
  const again=await repository.saveDraft('pgcard',{...RESPONSE_CARD,label:'Renamed'},1,'editor',3);
  assert.deepEqual([again.version,rows.length],[1,1],'a draft is rewritten in place');
  const published=await repository.publish('pgcard',1,'editor',4);
  assert.equal(published.status,'published');
  assert.equal(layoutDefinition('pgcard')?.ref?.sha256,published.sha256,'publishing registers it');
  const next=await repository.saveDraft('pgcard',RESPONSE_CARD,1,'editor',5);
  assert.deepEqual([next.version,next.status,rows[0].status],[2,'draft','published'],'a published version is never rewritten');
  await assert.rejects(repository.publish('pgcard',1,'editor',6),/changed in another session/);
  assert.deepEqual((await repository.list()).map(row=>[row.version,row.status]),[[1,'published'],[2,'draft']]);
  assert.ok(sql.includes('COMMIT'));
 }finally{if(layoutDefinition('pgcard'))unregisterLayout('pgcard')}
});

test('measureCueOnServer hands the stage the pinned definitions in the evaluate argument',async()=>{
 const seen:{options?:unknown}={};
 const launch:StageLauncher=async()=>({
  async newPage(){return {async setViewportSize(){},async goto(){return null},async waitForFunction(){return true},async evaluate<Result,Arg>(_fn:(arg:Arg)=>Result|Promise<Result>,arg:Arg){const input=arg as unknown as {cue?:unknown;options?:unknown};if(input?.cue)seen.options=input.options;return {fitErrors:[],warnings:[],fill:null,artwork:'none'} as unknown as Result}}},
  async close(){return null},
 });
 const host={make:async()=>'scratch',remove:async()=>{},bytes:async()=>0,free:async()=>null,survivors:async()=>[],alive:async()=>false,held:async()=>0,kill:async()=>{}};
 const pinned:ResolvedLayouts={'response@1':{id:'response',version:1,sha256:'a'.repeat(64),document:RESPONSE_CARD}};
 const cue={id:'c',name:'c',layout:'response',layoutRef:{id:'response',version:1,sha256:'a'.repeat(64)},texts:{}} as unknown as Cue;
 assert.equal((await measureCueOnServer(cue,{origin:'https://crc.example',launch,host,layouts:pinned})).verdict,'pass');
 assert.deepEqual(seen.options,{layouts:pinned});
 await measureCueOnServer(cue,{origin:'https://crc.example',launch,host,layouts:{}});
 assert.deepEqual(seen.options,{},'an empty set is not sent');
});
