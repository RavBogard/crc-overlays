import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {BATCH_REFIT_PER_CALL,hygieneOperation} from '../lib/catalog-hygiene';
import {isHygieneTool} from '../lib/catalog-hygiene-schemas';

// Packet G10 (TBI redo): batch_refit re-checks published graphics after a branding change, through
// the real MCP handler into the real in-memory authoring service with a stubbed server fit.
const AGENT='mcp:0a1b2c:member:member-7';
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:AGENT}} satisfies AuthInfo;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
const THANK_YOU='09f50803-3288-4b78-bcc7-560025668e1a';// the built-in "Thank you" graphic
const FRAME={mimeType:'image/jpeg' as const,dataBase64:Buffer.from('frame').toString('base64'),width:1920,height:1080};

function wired(options:{clock?:{t:number};fitMs?:number}={}){
 // verdicts: what the next fits answer, in order; empty means pass.
 const verdicts:Array<'pass'|'fail'|'unavailable'>=[];let fits=0;
 const fit:ServerFitRunner=async()=>{fits++;if(options.clock)options.clock.t+=options.fitMs??0;const verdict=verdicts.shift()??'pass';
  if(verdict==='unavailable')return {verdict:'unavailable',reason:'stage_unavailable'} as Awaited<ReturnType<ServerFitRunner>>;
  return {verdict,fitErrors:verdict==='fail'?['accentTextTitle does not fit its box.']:[],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test',previewImage:FRAME}};
 const repo=new MemoryAuthoringRepository();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,fit);
 const clock=options.clock,context={repo,run:service.operation,...(clock?{now:()=>clock.t}:{})};
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>isHygieneTool(operation)?hygieneOperation(operation,input,who,context):service.operation(operation,input,who));
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:{workspace:'crc',...args}}})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))!.slice(6);
  const body=JSON.parse(data) as {result:{isError?:boolean;content:{type:string;text?:string}[]}};
  const text=body.result.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result.isError===true,text,output};
 };
 const ok=async(name:string,args:Record<string,unknown>={})=>{const result=await call(name,args);assert.equal(result.isError,false,`${name}: ${result.text}`);return result.output};
 const custom=async(name:string,text:string,accentTitle?:string)=>(await ok('create_draft',{name,title:'Announcement',...(accentTitle?{accentTitle}:{}),layout:'left',content:{mode:'custom',text}})).draft as {id:string;version:number};
 const shipped=async(name:string,text:string,accentTitle?:string)=>{const draft=await custom(name,text,accentTitle);const result=await ok('ship_draft',{draftId:draft.id,expectedVersion:draft.version});assert.equal(result.shipped,true,result.message);return {id:draft.id,version:result.draftVersion as number,revision:result.revision as number,cueHash:result.cueHash as string}};
 return {repo,verdicts,fits:()=>fits,call,ok,custom,shipped};
}

test('batch_refit: the dry run counts what would be measured and why the rest are skipped, and opens no browser',async()=>{
 const f=wired();
 const a=await f.shipped('G10 Aleinu','Aleinu','עָלֵינוּ'),b=await f.shipped('G10 Welcome','G10 Welcome');
 const edited=await f.shipped('G10 Oseh','Oseh','עֹשֶׂה שָׁלוֹם');
 await f.ok('update_draft',{draftId:edited.id,expectedVersion:edited.version,patch:{title:'Oseh Shalom (Sykes)'}});
 const draftOnly=await f.custom('G10 Never shipped','Draft');
 // A built-in graphic imported as it is: live, but not built from its draft, so its verdict would not be the live one's.
 const imported=(await f.ok('import_cue',{cueId:THANK_YOU})).draft as {id:string};
 const fitsBefore=f.fits(),before=JSON.stringify(await f.repo.listDrafts());
 const all=await f.ok('batch_refit');
 const builtIn=all.results.find((row:Output)=>row.draftId===imported.id);
 assert.deepEqual([builtIn.status,builtIn.code],['skipped','differs_from_live']);assert.match(builtIn.message,/Fit check/);
 all.results=all.results.filter((row:Output)=>row!==builtIn);
 assert.equal(all.dryRun,true);
 assert.deepEqual(all.results.map((row:Output)=>row.draftId).sort(),[a.id,b.id].sort(),'every graphic live at its draft version, and no other');
 assert.equal(all.wouldRefit,2);assert.equal(all.skipped,1);assert.equal(all.perCall,BATCH_REFIT_PER_CALL);
 assert.match(all.message,/Dry run: 2 of 3 would be measured again, 1 skipped\. Nothing was changed\./);
 const accent=await f.ok('batch_refit',{accentTitleOnly:true});
 assert.deepEqual(accent.results.map((row:Output)=>row.draftId),[a.id]);
 const named=await f.ok('batch_refit',{items:[{draftId:a.id,expectedVersion:a.version},{draftId:edited.id},{draftId:draftOnly.id},{draftId:b.id,expectedVersion:b.version+1},{draftId:'no-such-graphic'}]});
 assert.deepEqual(named.results.map((row:Output)=>[row.status,row.code??null]),[['would_refit',null],['skipped','unpublished_changes'],['skipped','not_published'],['failed','version_conflict'],['failed','unknown_draft']]);
 assert.match(named.results[1].message,/Ship it with batch_ship/);
 assert.deepEqual([named.wouldRefit,named.skipped,named.failed],[1,2,2]);
 assert.equal(f.fits(),fitsBefore,'no server fit ran');
 assert.equal(JSON.stringify(await f.repo.listDrafts()),before,'nothing was written');
});

test('batch_refit: an apply stores a new verdict and frame against the live revision, retries an unavailable stage once, and publishes nothing',async()=>{
 const f=wired();
 const a=await f.shipped('G10 Aleinu','Aleinu','עָלֵינוּ'),b=await f.shipped('G10 Place','Place','תֵּן לָנוּ'),c=await f.shipped('G10 Adon','Adon','אֲדוֹן עוֹלָם');
 const published=JSON.stringify(await f.repo.published()),drafts=JSON.stringify(await f.repo.listDrafts());
 f.verdicts.push('unavailable','pass','fail','unavailable','unavailable');
 const applied=await f.ok('batch_refit',{items:[a,b,c].map(item=>({draftId:item.id,expectedVersion:item.version})),dryRun:false});
 assert.deepEqual(applied.results.map((row:Output)=>[row.draftId,row.status,row.retried]),[[a.id,'pass',true],[b.id,'fail',false],[c.id,'unavailable',true]]);
 assert.deepEqual([applied.measured,applied.pass,applied.fail,applied.unavailable,applied.retried,applied.done,applied.liveCatalogChanged],[3,1,1,1,2,true,false]);
 assert.deepEqual(applied.results[1].fitErrors,['accentTextTitle does not fit its box.']);
 for(const [row,item] of [[applied.results[0],a],[applied.results[1],b]] as const){
  assert.equal(row.revision,item.revision);assert.equal(row.cueHash,item.cueHash,'measured the graphic the live revision holds');
  const preview=await f.repo.getPreview(row.previewId);
  assert.equal(preview!.cueHash,item.cueHash);assert.equal(preview!.fitCheck!.verdict,row.status);
  assert.ok(await f.repo.getFitImage(row.previewId),'the frame is kept with the new preview');
  assert.equal(row.imageStored,true);
 }
 assert.equal(JSON.stringify(await f.repo.published()),published,'nothing was published');
 assert.equal(JSON.stringify(await f.repo.listDrafts()),drafts,'no draft changed');
 assert.match(applied.message,/3 measured in this call: 1 pass, 1 fail, 1 could not be measured\. Nothing was published/);
});

test(`batch_refit: a call measures at most ${BATCH_REFIT_PER_CALL} graphics, or fewer when checks are slow, and hands back a cursor`,async()=>{
 const f=wired({clock:{t:0}});
 const made=[];for(let index=0;index<BATCH_REFIT_PER_CALL+3;index++)made.push(await f.shipped(`Graphic ${index}`,`Text ${index}`));
 const first=await f.ok('batch_refit',{dryRun:false});
 assert.deepEqual([first.measured,first.remaining,first.done],[BATCH_REFIT_PER_CALL,3,false]);
 const second=await f.ok('batch_refit',{dryRun:false,cursor:first.nextCursor});
 assert.deepEqual([second.from,second.measured,second.remaining,second.done,second.nextCursor],[BATCH_REFIT_PER_CALL,3,0,true,null]);
 const wrong=await f.call('batch_refit',{dryRun:false,items:[{draftId:made[0].id}],cursor:first.nextCursor});
 assert.equal(wrong.isError,true);assert.match(wrong.text,/different list/);
 // Slow checks: every item takes 15 s on the clock, so the 40 s budget stops the call after three.
 const slow=wired({clock:{t:0},fitMs:15_000});
 for(let index=0;index<5;index++)await slow.shipped(`Slow ${index}`,`Slow ${index}`);
 const answered=await slow.ok('batch_refit',{dryRun:false});
 // 15 s, then 30 s: a third (projected 45 s) would pass 40 s, so the call stops after two.
 assert.deepEqual([answered.measured,answered.remaining,answered.done],[2,3,false]);
});

test('batch_refit (G11): a graphic read back from Postgres, keys reordered and a float off in its last bit, is still its draft',async()=>{
 const f=wired();
 const a=await f.shipped('G11 Aleinu','Aleinu','עָלֵינוּ'),b=await f.shipped('G11 Place','Place','תֵּן לָנוּ');
 const bLive=await f.shipped('G11 Changed live','Changed live','שָׁלוֹם');
 // jsonb stores object keys shortest first, then by bytes, and a production bundle's JSON import can
 // land a keyframe one float step away (0.9500000000000004 for 0.9500000000000003).
 const jsonbOrder=(value:unknown):unknown=>Array.isArray(value)?value.map(jsonbOrder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort((x,y)=>x.length-y.length||(x<y?-1:x>y?1:0)).map(key=>[key,jsonbOrder((value as Record<string,unknown>)[key])])):value;
 const nudge=(value:unknown):unknown=>typeof value==='number'&&value>0&&value<1&&!Number.isInteger(value*100)?value+Number.EPSILON/2:Array.isArray(value)?value.map(nudge):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,nudge(item)])):value;
 const stored=await f.repo.published();
 const readBack=stored.map(cue=>{const copy=jsonbOrder(structuredClone(cue)) as Output;copy.animations=nudge(copy.animations);if(cue.id===bLive.id)copy.texts={...copy.texts,textMain:'Something else'};return copy});
 assert.notEqual(JSON.stringify(readBack[0]),JSON.stringify(stored[0]),'the read-back differs as text');
 f.repo.published=async()=>structuredClone(readBack) as never;
 const dry=await f.ok('batch_refit');
 const status=Object.fromEntries(dry.results.map((row:Output)=>[row.draftId,[row.status,row.code??null]]));
 assert.deepEqual(status[a.id],['would_refit',null]);assert.deepEqual(status[b.id],['would_refit',null]);
 assert.deepEqual(status[bLive.id],['skipped','differs_from_live'],'a live graphic whose words differ from its draft is still skipped');
});
