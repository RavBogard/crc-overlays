import assert from 'node:assert/strict';
import test from 'node:test';
import {AuthoringError,editableFromBaseline,isRetiredDraft,type Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,PUBLISHED_SIGNATURE_SQL,RETIRED_CUES_SQL,createAuthoringService} from '../lib/authoring.ts';
import {compactDraftCatalog} from '../lib/draft-catalog.ts';
import {composeAuthoringCatalog,mergePublishedCatalog,type AliasCatalogCue} from '../lib/server.ts';
import {syncLiveCatalog} from '../lib/sync-live-catalog.ts';
import {baselineCatalogForWorkspace} from '../lib/workspace-catalog.ts';
import {MemoryServicesRepository,ServicesManager,retiredBindings,type ServicesLoaders} from '../lib/service-collections.ts';
import type {Cue} from '../lib/player.ts';

/**
 * MCP plan A3 (R-A3, STATE decision 6): retire removes a graphic from every live surface and
 * restore brings the same revision back. Archive is unchanged: it still leaves published output.
 */

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
type Retired={draft:Draft;cue:{id:string;name:string;retired:boolean;revision:number|null};changed:boolean;message:string};
const code=(expected:string)=>(error:unknown)=>error instanceof AuthoringError&&error.code===expected;

async function imported(){
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);
 const {draft}=await service.operation('import_cue',{cueId:BARECHU},'tester') as {draft:Draft};
 return {repo,service,draft};
}
const liveCatalog=async(service:ReturnType<typeof createAuthoringService>)=>composeAuthoringCatalog(baselineCatalogForWorkspace() as AliasCatalogCue[],await service.publishedCues(),[],new Set((await service.retiredCues()).map(cue=>cue.id)));

test('retire takes a published graphic out of the live catalog, even one that overrides a built-in cue',async()=>{
 const {service,draft}=await imported();
 assert.ok((await liveCatalog(service)).cues.some(cue=>cue.id===BARECHU));
 const retired=await service.operation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version},'editor') as Retired;
 assert.equal(retired.changed,true);
 assert.deepEqual(retired.cue,{id:BARECHU,name:draft.name,retired:true,revision:1});
 assert.match(retired.message,/out of the live library, Companion's picker and the relay catalog/);
 assert.equal(retired.draft.activeRevision,null);
 assert.deepEqual(retired.draft.retired&&{revision:retired.draft.retired.revision,draftVersion:retired.draft.retired.draftVersion,by:retired.draft.retired.retiredBy},{revision:1,draftVersion:1,by:'editor'});
 assert.equal((await service.publishedCues()).some(cue=>cue.id===BARECHU),false,'published() honours retirement');
 assert.deepEqual((await service.retiredCues()).map(cue=>cue.id),[BARECHU]);
 const live=await liveCatalog(service);
 assert.equal(live.cues.some(cue=>cue.id===BARECHU),false,'the built-in copy does not come back in its place');
 // Everything else is untouched.
 assert.equal(live.cues.length,(await liveCatalog(createAuthoringService(new MemoryAuthoringRepository()))).cues.length-1);
});

test('restore brings back the same revision with no new review, and is idempotent',async()=>{
 const {service,draft}=await imported();
 const before=(await liveCatalog(service)).cues.find(cue=>cue.id===BARECHU);
 const retired=await service.operation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version},'editor') as Retired;
 const again=await service.operation('retire_cue',{cueId:BARECHU,expectedVersion:retired.draft.version},'editor') as Retired;
 assert.equal(again.changed,false,'retiring a retired graphic changes nothing');
 const restored=await service.operation('restore_cue',{cueId:BARECHU,expectedVersion:retired.draft.version},'editor') as Retired;
 assert.equal(restored.changed,true);
 assert.equal(restored.draft.activeRevision,1);
 assert.equal(restored.draft.activeDraftVersion,1);
 assert.equal('retired' in restored.draft,false);
 assert.match(restored.message,/back in the live library at revision 1/);
 assert.deepEqual((await liveCatalog(service)).cues.find(cue=>cue.id===BARECHU),before);
 assert.deepEqual(await service.retiredCues(),[]);
 const noop=await service.operation('restore_cue',{cueId:BARECHU,expectedVersion:restored.draft.version},'editor') as Retired;
 assert.equal(noop.changed,false);
});

test('publishing or rolling back a retired draft puts it back in the live library',async()=>{
 const {service,draft}=await imported();
 const retired=await service.operation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version},'editor') as Retired;
 const rolled=await service.operation('rollback_draft',{draftId:BARECHU,expectedVersion:retired.draft.version,revision:1},'publisher') as {draft:Draft};
 assert.equal(isRetiredDraft(rolled.draft),false);
 assert.ok((await service.publishedCues()).some(cue=>cue.id===BARECHU));
 assert.deepEqual(await service.retiredCues(),[]);
});

test('retire and restore refuse in plain sentences that say what to do next',async()=>{
 const {service,draft}=await imported();
 await assert.rejects(service.operation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version+1},'editor'),code('version_conflict'));
 await assert.rejects(service.operation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version,extra:true},'editor'),code('invalid_input'));
 await assert.rejects(service.operation('retire_cue',{cueId:'no-such-graphic',expectedVersion:1},'editor'),(error:unknown)=>code('unknown_cue')(error)&&/list_catalog/.test((error as Error).message));
 const builtIn=baselineCatalogForWorkspace().find(cue=>!cue.hidden&&cue.id!==BARECHU)!;
 await assert.rejects(service.operation('retire_cue',{cueId:builtIn.id,expectedVersion:1},'editor'),(error:unknown)=>code('not_a_draft')(error)&&/import_cue/.test((error as Error).message));
 const {draft:unpublished}=await service.operation('create_draft',{...editableFromBaseline(BARECHU),name:'Never published'},'tester') as {draft:Draft};
 await assert.rejects(service.operation('retire_cue',{cueId:unpublished.id,expectedVersion:unpublished.version},'editor'),(error:unknown)=>code('not_published')(error)&&/archive_draft/.test((error as Error).message));
 await assert.rejects(service.operation('restore_cue',{cueId:unpublished.id,expectedVersion:unpublished.version},'editor'),code('not_retired'));
});

test('archive is not retire: an archived graphic keeps playing',async()=>{
 const {service,draft}=await imported();
 await service.operation('archive_draft',{draftId:BARECHU,expectedVersion:draft.version},'editor');
 assert.ok((await liveCatalog(service)).cues.some(cue=>cue.id===BARECHU));
 assert.deepEqual(await service.retiredCues(),[]);
});

test('the editor library lists a retired graphic once, labelled, and draft rows say retired',async()=>{
 const {service,draft}=await imported();
 await service.operation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version},'editor');
 const {cues}=await service.operation('list_catalog',{},'editor') as {cues:Array<{id:string;retired?:boolean;retiredRevision?:number;activeRevision:number|null}>};
 const rows=cues.filter(cue=>cue.id===BARECHU);
 assert.equal(rows.length,1);
 assert.deepEqual({retired:rows[0].retired,retiredRevision:rows[0].retiredRevision,activeRevision:rows[0].activeRevision},{retired:true,retiredRevision:1,activeRevision:null});
 const summary=compactDraftCatalog([(await service.operation('get_draft',{draftId:BARECHU},'editor') as {draft:Draft}).draft],{});
 assert.equal(summary.drafts[0].retired,true);
 assert.equal(summary.drafts[0].published,false);
});

test('a hidden alias that resolves to a retired graphic leaves the catalog with it',()=>{
 const cue=(value:Record<string,unknown>)=>value as unknown as AliasCatalogCue;
 const baseline=[
  cue({id:'target',name:'Target',layout:'left',texts:{he:'t'}}),
  cue({id:'alias',name:'Old name',layout:'left',texts:{he:'a'},hidden:true,aliasOf:'target'}),
  cue({id:'chain',name:'Older name',layout:'left',texts:{he:'c'},hidden:true,aliasOf:'alias'}),
  cue({id:'other',name:'Other',layout:'left',texts:{he:'o'}}),
  cue({id:'cycle-a',name:'A',texts:{},hidden:true,aliasOf:'cycle-b'}),
  cue({id:'cycle-b',name:'B',texts:{},hidden:true,aliasOf:'cycle-a'}),
 ];
 assert.deepEqual(mergePublishedCatalog(baseline,[],new Set(['target'])).map(item=>item.id),['other','cycle-a','cycle-b']);
 assert.equal(mergePublishedCatalog(baseline,[]).length,6,'no retired set, no change');
});

test('the live library sync pushes a catalog without the retired graphic',async()=>{
 const {service,draft}=await imported();
 await service.operation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version},'editor');
 let pushed:{cues:Cue[]}|undefined;
 await syncLiveCatalog({readRelay:async()=>({version:'old',cues:[]}),readAuthoring:()=>liveCatalog(service),writeRelay:(async(_path:string,body:unknown)=>{pushed=body as {cues:Cue[]};return new Response('{}')}) as never});
 assert.ok(pushed);
 assert.equal(pushed.cues.some(cue=>cue.id===BARECHU),false);
});

test('services flag entries and coverage rows bound to a retired graphic',async()=>{
 const catalog={cues:[{id:'kiddush',name:'Kiddush'},{id:'kaddish',name:'Kaddish'}],version:'v1'};
 let retired:Array<{id:string;name:string}>=[];let id=0;
 const loaders:ServicesLoaders={catalog:async()=>structuredClone(catalog),sources:()=>[],now:()=>1000,id:()=>`id-${++id}`,liveCue:async()=>null,retired:async()=>retired};
 const manager=new ServicesManager(new MemoryServicesRepository(),loaders);
 const created=await manager.createCollection({name:'Friday',service:'Evening',entries:[{id:'e1',type:'cue',label:'Kiddush',cueIds:['kiddush']},{id:'e2',type:'cue',label:'Kaddish',cueIds:['kaddish']}],coverage:[{id:'c1',label:'Kiddush',status:'covered',cueId:'kiddush'}]},'editor');
 assert.equal('retired' in created.entries[0],false,'nothing retired, nothing flagged');
 // Retire Kiddush: it leaves the catalog and the retired list names it.
 catalog.cues=catalog.cues.filter(cue=>cue.id!=='kiddush');retired=[{id:'kiddush',name:'Kiddush'}];
 const {collections}=await manager.dashboard();
 const service=collections.find(item=>item.id===created.id)!;
 assert.deepEqual(service.entries[0].cues,[{id:'kiddush',name:'Kiddush',available:false,retired:true}]);
 assert.equal((service.entries[0] as {retired?:boolean}).retired,true);
 assert.equal('retired' in service.entries[1],false);
 assert.equal(service.coverage[0].computedStatus,'needs-review');
 assert.equal((service.coverage[0] as {cueRetired?:boolean}).cueRetired,true);
 assert.equal(service.coverage[0].cueName,'Kiddush');
 assert.deepEqual(retiredBindings(created,new Set(['kiddush'])),{entries:[{entryId:'e1',label:'Kiddush',cueIds:['kiddush']}],coverage:[{coverageId:'c1',label:'Kiddush',cueId:'kiddush'}]});
});

test('end to end: /api/catalog drops a retired graphic and restore brings it back',async()=>{
 const prior={...process.env};
 try{
  process.env.CRC_AUTHORING_REHEARSAL='1';Object.assign(process.env,{NODE_ENV:'development'});delete process.env.RELAY_URL;process.env.OUTPUT_KEY='o'.repeat(43);
  const [{GET},{authoringOperation,isRetired}]=await Promise.all([import('../app/api/catalog/route.ts'),import('../lib/authoring.ts')]);
  const ids=async()=>((await (await GET(new Request('http://localhost/api/catalog',{headers:{authorization:`Bearer ${process.env.OUTPUT_KEY}`}}))).json()) as Cue[]).map(cue=>cue.id);
  const {draft}=await authoringOperation('import_cue',{cueId:BARECHU},'tester') as {draft:Draft};
  assert.ok((await ids()).includes(BARECHU));
  const retired=await authoringOperation('retire_cue',{cueId:BARECHU,expectedVersion:draft.version},'editor') as Retired;
  assert.equal((await ids()).includes(BARECHU),false,'Companion\'s picker no longer offers it');
  assert.equal(await isRetired(BARECHU),true);
  await authoringOperation('restore_cue',{cueId:BARECHU,expectedVersion:retired.draft.version},'editor');
  assert.ok((await ids()).includes(BARECHU));
  assert.equal(await isRetired(BARECHU),false);
 }finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)}
});


test('Postgres: retirement needs no migration and keeps the per-request signature off the documents',()=>{
 // A retired row has no active revision, so the unchanged signature already moves when a graphic
 // is retired or restored; the retired list is read only on that reload.
 assert.doesNotMatch(PUBLISHED_SIGNATURE_SQL,/document|retired/i);
 assert.match(RETIRED_CUES_SQL,/active_revision IS NULL/);
 assert.match(RETIRED_CUES_SQL,/document \? 'retired'/);
});