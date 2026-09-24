import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {isRetiredDraft,type Draft} from '../lib/authoring-model';
import {hygieneOperation} from '../lib/catalog-hygiene';
import {BATCH_RETIRE_MAX,isHygieneTool} from '../lib/catalog-hygiene-schemas';
import {composeAuthoringCatalog,type AliasCatalogCue} from '../lib/server';
import {syncLiveCatalog} from '../lib/sync-live-catalog';
import {baselineCatalogForWorkspace} from '../lib/workspace-catalog';
import type {Cue} from '../lib/player';

// Packet G8 (TBI redo): batch_retire through the real MCP handler into the real in-memory
// authoring service (stubbed server fit), as tests/mcp-a5.test.ts wires the other hygiene tools.
const AGENT='mcp:0a1b2c:member:member-7';
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:AGENT}} satisfies AuthInfo;
const THANK_YOU='09f50803-3288-4b78-bcc7-560025668e1a';// the built-in "Thank you" graphic
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;

function wired(){
 const fit:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test'});
 const repo=new MemoryAuthoringRepository();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,fit);
 const context={repo,run:service.operation};
 const calls:string[]=[];
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>{calls.push(operation);return isHygieneTool(operation)?hygieneOperation(operation,input,who,context):service.operation(operation,input,who)});
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:{workspace:'crc',...args}}})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))!.slice(6);
  const body=JSON.parse(data) as {result:{isError?:boolean;content:{type:string;text?:string}[]}};
  const text=body.result.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result.isError===true,text,output};
 };
 const ok=async(name:string,args:Record<string,unknown>={})=>{const result=await call(name,args);assert.equal(result.isError,false,`${name}: ${result.text}`);return result.output};
 const custom=async(name:string,text:string)=>(await ok('create_draft',{name,title:'Announcement',layout:'bottom',content:{mode:'custom',text}})).draft as {id:string;version:number};
 const shipped=async(name:string,text:string)=>{const draft=await custom(name,text);const result=await ok('ship_draft',{draftId:draft.id,expectedVersion:draft.version});assert.equal(result.shipped,true,result.message);return {id:draft.id,version:result.draftVersion as number}};
 const version=async(draftId:string)=>(await repo.getDraft(draftId))!.version;
 const liveIds=async()=>new Set((await repo.published()).map(cue=>cue.id));
 return {repo,service,calls,call,ok,custom,shipped,version,liveIds};
}

test('batch_retire: dry run changes nothing, then an apply retires the rest past each refusal, with retire_cue\'s sentences',async()=>{
 const f=wired();
 const a=await f.shipped('Old welcome','Welcome'),b=await f.shipped('Old kiddush','Kiddush'),c=await f.shipped('Old oneg','Oneg'),stale=await f.shipped('Old notice','A notice');
 const gone=await f.shipped('Already gone','Gone');await f.ok('retire_cue',{cueId:gone.id,expectedVersion:gone.version});
 const archived=await f.shipped('Archived notice','Archived but live');await f.ok('archive_draft',{draftId:archived.id,expectedVersion:archived.version});
 const unpublished=await f.custom('Never shipped','Draft only');
 const items=[
  {draftId:a.id,expectedVersion:a.version},
  {draftId:unpublished.id,expectedVersion:unpublished.version},
  {draftId:b.id,expectedVersion:b.version},
  {draftId:'no-such-graphic',expectedVersion:1},
  {draftId:THANK_YOU,expectedVersion:1},
  {draftId:stale.id,expectedVersion:stale.version+3},
  {draftId:gone.id,expectedVersion:gone.version},
  {draftId:a.id,expectedVersion:a.version},
  {draftId:archived.id,expectedVersion:await f.version(archived.id)},
  {draftId:c.id,expectedVersion:c.version},
 ];
 // What retire_cue itself says for the same three refusals.
 const single=async(cueId:string,expectedVersion:number)=>(await f.call('retire_cue',{cueId,expectedVersion})).text;
 const sentences=[await single(unpublished.id,unpublished.version),await single('no-such-graphic',1),await single(THANK_YOU,1)];

 const before=JSON.stringify(await f.repo.listDrafts());
 const planned=await f.ok('batch_retire',{items});
 assert.equal(JSON.stringify(await f.repo.listDrafts()),before,'the dry run wrote nothing');
 assert.equal(planned.dryRun,true);assert.match(planned.message,/Nothing was changed/);
 const statuses=['would-retire','refused','would-retire','refused','refused','refused','already-retired','refused','would-retire','would-retire'];
 assert.deepEqual(planned.results.map((item:Output)=>item.status),statuses);
 assert.deepEqual([planned.wouldRetire,planned.alreadyRetired,planned.refused],[4,1,5]);
 assert.deepEqual(planned.results.filter((item:Output)=>item.status==='refused').map((item:Output)=>item.code),['not_published','unknown_cue','not_a_draft','version_conflict','duplicate_item']);
 for(const [index,sentence] of [[1,sentences[0]],[3,sentences[1]],[4,sentences[2]]] as const){assert.ok(sentence.length>20);assert.ok(planned.results[index].reason.startsWith(sentence),`${planned.results[index].reason} / ${sentence}`);assert.match(planned.results[index].reason,/Nothing was changed\.$/)}
 assert.match(planned.results[5].reason,/changed since you read it/);
 assert.match(planned.results[8].reason,/archived in the editor and stays archived/);

 const applied=await f.ok('batch_retire',{items,dryRun:false});
 assert.equal(applied.dryRun,false);
 assert.deepEqual(applied.results.map((item:Output)=>item.status),statuses.map(status=>status==='would-retire'?'retired':status));
 assert.deepEqual([applied.retired,applied.alreadyRetired,applied.refused,applied.liveCatalogChanged],[4,1,5,true]);
 for(const [index,sentence] of [[1,sentences[0]],[3,sentences[1]],[4,sentences[2]]] as const)assert.ok(applied.results[index].reason.startsWith(sentence));
 for(const id of [a.id,b.id,c.id,archived.id])assert.equal(isRetiredDraft((await f.repo.getDraft(id))!),true,id);
 assert.equal(isRetiredDraft((await f.repo.getDraft(stale.id))!),false,'the stale item was left as it was');
 const live=await f.liveIds();for(const id of [a.id,b.id,c.id,archived.id,gone.id])assert.equal(live.has(id),false);assert.ok(live.has(stale.id));
 assert.equal(applied.results[0].version,a.version+1);assert.equal(applied.results[0].revision,1);
 assert.equal(f.calls.filter(name=>name==='retire_cue').length,4,'three single refusals and the one setup retire; the batch ran through the service, not the MCP');

 // Repeating the apply with the versions first read is safe: nothing retires twice.
 const again=await f.ok('batch_retire',{items,dryRun:false});
 assert.deepEqual([again.retired,again.alreadyRetired,again.liveCatalogChanged],[0,5,false]);
});

test('batch_retire: a version change between read and apply fails that item only',async()=>{
 const f=wired();
 const a=await f.shipped('First','One'),b=await f.shipped('Second','Two');
 await f.ok('update_draft',{draftId:a.id,expectedVersion:a.version,patch:{name:'First (edited)'}});
 const applied=await f.ok('batch_retire',{items:[{draftId:a.id,expectedVersion:a.version},{draftId:b.id,expectedVersion:b.version}],dryRun:false});
 assert.deepEqual(applied.results.map((item:Output)=>[item.status,item.code??null]),[['refused','version_conflict'],['retired',null]]);
 assert.match(applied.results[0].reason,/"First \(edited\)" is at version \d+, not \d+: it changed since you read it\. .*Nothing was changed\./);
 assert.equal(isRetiredDraft((await f.repo.getDraft(a.id))!),false);
});

test(`batch_retire takes up to ${BATCH_RETIRE_MAX} items and refuses more`,async()=>{
 const f=wired();
 assert.ok(BATCH_RETIRE_MAX>=100);
 const items=(count:number)=>Array.from({length:count},(_,index)=>({draftId:`missing-${index}`,expectedVersion:1}));
 const full=await f.ok('batch_retire',{items:items(BATCH_RETIRE_MAX)});
 assert.equal(full.total,BATCH_RETIRE_MAX);assert.equal(full.refused,BATCH_RETIRE_MAX);
 const over=await f.call('batch_retire',{items:items(BATCH_RETIRE_MAX+1)});
 assert.equal(over.isError,true);
 assert.equal((await f.call('batch_retire',{items:[]})).isError,true);
});

test('batch_retire follows retire_cue for a set: parts retire one at a time, and a part named alone warns about the rest',async()=>{
 const f=wired();
 const setId=randomUUID(),parts:Draft[]=[];
 for(const index of [1,2,3]){const made=await f.custom(`Psalm — 0${index} of 03`,`Verse ${index}`);const draft=(await f.repo.getDraft(made.id))!;parts.push({...draft,id:randomUUID(),draftSetId:setId,setIndex:index,setCount:3})}
 await f.repo.insertDraftSet(parts);
 const members:{id:string;version:number}[]=[];
 for(const part of parts){const result=await f.ok('ship_draft',{draftId:part.id,expectedVersion:part.version});assert.equal(result.shipped,true,result.message);members.push({id:part.id,version:result.draftVersion})}
 const one=await f.ok('batch_retire',{items:[{draftId:members[0].id,expectedVersion:members[0].version}]});
 assert.equal(one.results[0].status,'would-retire');
 assert.match(one.results[0].setWarning,/part 1 of a 3-part set.*2 other published parts are not in this call/);
 const whole=await f.ok('batch_retire',{items:members.map(member=>({draftId:member.id,expectedVersion:member.version})),dryRun:false});
 assert.deepEqual(whole.results.map((item:Output)=>[item.status,'setWarning' in item]),[['retired',false],['retired',false],['retired',false]]);
 const live=await f.liveIds();for(const member of members)assert.equal(live.has(member.id),false);
});

test('a retired graphic\'s name no longer stops batch_ship at duplicate_name',async()=>{
 const f=wired();
 const old=await f.shipped('Thank you for joining','Old words');
 const copy=await f.custom('Thank you for joining','New words');
 const blocked=await f.ok('batch_ship',{items:[{draftId:copy.id,expectedVersion:copy.version}]});
 assert.equal(blocked.results[0].stoppedAt,'duplicate_name','the live first pass blocks the name');
 await f.ok('batch_retire',{items:[{draftId:old.id,expectedVersion:old.version}],dryRun:false});
 const planned=await f.ok('batch_ship',{items:[{draftId:copy.id,expectedVersion:copy.version}]});
 assert.equal(planned.results[0].status,'would_ship',planned.results[0].message);
 const shipped=await f.ok('batch_ship',{items:[{draftId:copy.id,expectedVersion:copy.version}],dryRun:false});
 assert.deepEqual([shipped.results[0].status,shipped.results[0].name],['shipped','Thank you for joining'],'published under its own name, not renamed');
});

test('find_catalog_issues hands archived-but-published graphics to batch_retire as they are',async()=>{
 const f=wired();
 const a=await f.shipped('Sukkot notice','Sukkah open'),b=await f.shipped('Purim notice','Megillah at 7');
 for(const item of [a,b])await f.ok('archive_draft',{draftId:item.id,expectedVersion:item.version});
 const found=await f.ok('find_catalog_issues',{kinds:['archived_but_published'],limit:1});
 assert.equal(found.issues.length,1,'limit cuts the issues shown');
 assert.equal(found.batchRetire.items.length,2,'but not the batch_retire input');
 const applied=await f.ok('batch_retire',{...found.batchRetire,dryRun:false});
 assert.equal(applied.retired,2);
 const after=await f.ok('find_catalog_issues',{kinds:['archived_but_published']});
 assert.equal(after.total,0);assert.equal('batchRetire' in after,false);
});

test('the live library sync pushes a catalog without the graphics batch_retire retired',async()=>{
 const f=wired();
 const a=await f.shipped('First pass one','One'),b=await f.shipped('First pass two','Two'),kept=await f.shipped('Kept','Stays');
 await f.ok('batch_retire',{items:[a,b].map(item=>({draftId:item.id,expectedVersion:item.version})),dryRun:false});
 const readAuthoring=async()=>composeAuthoringCatalog(baselineCatalogForWorkspace() as AliasCatalogCue[],await f.service.publishedCues(),[],new Set((await f.service.retiredCues()).map(cue=>cue.id)));
 let pushed:{cues:Cue[]}|undefined;
 await syncLiveCatalog({readRelay:async()=>({version:'old',cues:[]}),readAuthoring,writeRelay:(async(_path:string,body:unknown)=>{pushed=body as {cues:Cue[]};return new Response('{}')}) as never});
 const ids=new Set(pushed!.cues.map(cue=>cue.id));
 assert.equal(ids.has(a.id)||ids.has(b.id),false);assert.ok(ids.has(kept.id));
});

test('end to end: /api/catalog drops what batch_retire retired, through the real dispatch',async()=>{
 const prior={...process.env};
 try{
  process.env.CRC_AUTHORING_REHEARSAL='1';Object.assign(process.env,{NODE_ENV:'development'});delete process.env.RELAY_URL;process.env.OUTPUT_KEY='o'.repeat(43);
  const [{GET},{authoringOperation}]=await Promise.all([import('../app/api/catalog/route.ts'),import('../lib/authoring.ts')]);
  const ids=async()=>new Set(((await (await GET(new Request('http://localhost/api/catalog',{headers:{authorization:`Bearer ${process.env.OUTPUT_KEY}`}}))).json()) as Cue[]).map(cue=>cue.id));
  const made:{id:string;version:number}[]=[];
  // import_cue publishes a built-in graphic as this library's own draft, as tests/retire-cue.test.ts does.
  for(const cue of baselineCatalogForWorkspace().filter(item=>!item.hidden&&!item.aliasOf).slice(0,2)){const {draft}=await authoringOperation('import_cue',{cueId:cue.id},'tester') as {draft:Draft};made.push({id:draft.id,version:draft.version})}
  const published=[...await ids()].filter(id=>made.some(item=>item.id===id));
  assert.equal(published.length,made.length,'both are in the catalog before the retire');
  const result=await authoringOperation('batch_retire',{items:made.map(item=>({draftId:item.id,expectedVersion:item.version})),dryRun:false},'editor') as Output;
  assert.equal(result.retired,2,JSON.stringify(result));
  const after=await ids();for(const item of made)assert.equal(after.has(item.id),false);
 }finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)}
});
