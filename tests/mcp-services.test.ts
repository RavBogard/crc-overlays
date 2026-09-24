import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp.ts';
import {liveSetlistDependencies,MemoryServicesRepository,type ServicesLoaders} from '../lib/service-collections.ts';
import {matchSetlist,type LiveSetlist} from '../lib/live-setlists.ts';
import {serviceToolOperation} from '../lib/service-tools.ts';
import {SERVICE_TOOL_NAMES} from '../lib/service-tool-schemas.ts';
import type {Cue} from '../lib/player.ts';

/* S2 (R-S2) - every prepared-services tool, driven through the MCP handler against an in-memory
   services store. Nothing here reaches a database, the relay or centralreform.live. */

const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
const CUES=([{id:'mah-tovu',name:'Mah Tovu',title:'Mah Tovu'},{id:'kaddish',name:'Kaddish',title:'Kaddish'},{id:'aleinu-1',name:'Aleinu — 1 of 2',title:'Aleinu'},{id:'aleinu-2',name:'Aleinu — 2 of 2',title:'Aleinu'},{id:'lecha-a',name:'Lecha Dodi (Carlebach)',title:'Lecha Dodi'},{id:'lecha-b',name:'Lecha Dodi (Sulzer)',title:'Lecha Dodi'}]).map(cue=>({...cue,texts:{}}));

function fixture(){
 const repository=new MemoryServicesRepository();let now=1000,id=0;
 const catalog={cues:structuredClone(CUES),version:'v1'};
 const live={cue:null as string|null};
 const loaders:ServicesLoaders={catalog:async()=>structuredClone(catalog),sources:()=>[{id:'source:mah',name:'Mah Tovu source',blocks:[{}]}],now:()=>++now,id:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`,liveCue:async()=>live.cue};
 const handler=createAuthoringMcpHandler((operation,input,actor)=>serviceToolOperation(operation,input,actor,{repository,loaders}));
 let rpc=0;
 async function call(name:string,args:Record<string,unknown>={}){
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++rpc,method:'tools/call',params:{name,arguments:{workspace:'crc',...args}}})}),{authInfo});
  const text=await response.text(),body=JSON.parse(response.headers.get('content-type')?.includes('application/json')?text:text.split(/\r?\n/).find(line=>line.startsWith('data: '))!.slice(6)) as {result:{isError?:boolean;content:{text:string}[]}};
  return {error:body.result.isError===true,text:body.result.content[0].text,data:body.result.isError?null:JSON.parse(body.result.content[0].text) as Record<string,any>};// eslint-disable-line @typescript-eslint/no-explicit-any
 }
 const ok=async(name:string,args:Record<string,unknown>={})=>{const result=await call(name,args);assert.equal(result.error,false,`${name}: ${result.text}`);return result.data!};
 const refused=async(name:string,args:Record<string,unknown>,pattern:RegExp)=>{const result=await call(name,args);assert.equal(result.error,true,`${name} should be refused`);assert.match(result.text,pattern);return result.text};
 return {repository,catalog,live,call,ok,refused};
}
async function seeded(f:ReturnType<typeof fixture>){
 const created=await f.ok('create_service',{name:'Friday night',service:'Shabbat Evening',rows:[
  {cueIds:['mah-tovu']},
  {label:'Lecha Dodi',type:'alternates',cueIds:['lecha-a','lecha-b'],status:'needs-review',reason:'Two settings match.',candidateCueIds:['lecha-a','lecha-b']},
  {label:'Sermon slide',status:'needs-cue',reason:'No graphic yet.'},
  {cueIds:['kaddish'],status:'covered',buttonLabel:'Kaddish'},
 ]});
 return created;
}

test('every services tool is registered, and writes require the workspace',async()=>{
 const f=fixture();
 for(const name of SERVICE_TOOL_NAMES){const result=await f.call(name,{});assert.doesNotMatch(result.text,/Tool .* not found/i,name)}
 const handler=createAuthoringMcpHandler(async()=>({}));
 const listed=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}),{authInfo});
 const raw=await listed.text(),listedBody=listed.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))!.slice(6);
 const tools=(JSON.parse(listedBody) as {result:{tools:{name:string;annotations?:{readOnlyHint?:boolean};inputSchema:{required?:string[];properties:Record<string,unknown>}}[]}}).result.tools;
 for(const name of SERVICE_TOOL_NAMES){const tool=tools.find(item=>item.name===name);assert.ok(tool,name);const writes=tool.annotations?.readOnlyHint===false;assert.equal(tool.inputSchema.required?.includes('workspace')??false,writes,name);if(writes&&!['create_service'].includes(name))assert.ok(tool.inputSchema.required?.includes('expectedVersion'),`${name} takes expectedVersion`)}
});

test('create_service builds rows in order; get_service is compact by default and full on request',async()=>{
 const f=fixture();const created=await seeded(f);
 assert.equal(created.version,1);assert.equal(created.rowCount,4);assert.equal(created.workspaceId,'crc');
 const compact=await f.ok('get_service',{serviceId:created.serviceId});
 assert.deepEqual(compact.rows.map((row:{label:string;readiness:string})=>[row.label,row.readiness]),[['Mah Tovu','covered'],['Lecha Dodi','needs-review'],['Sermon slide','needs-a-graphic'],['Kaddish','covered']]);
 assert.equal(compact.serviceRef,created.serviceId,'a UUID service id is the serviceRef deck buttons send');
 assert.equal(compact.rows[3].buttonLabel,'Kaddish');
 assert.deepEqual(compact.rows[1].candidates.map((cue:{cueId:string})=>cue.cueId),['lecha-a','lecha-b']);
 assert.equal(compact.rows[2].coverage.owner,'Unassigned');
 assert.deepEqual(compact.counts,{rows:4,covered:2,needsReview:1,needsAGraphic:1,notNeeded:0});
 const full=await f.ok('get_service',{serviceId:created.serviceId,view:'full'});
 assert.equal(full.service.entries.length,3);assert.equal(full.service.coverage.length,3);assert.equal(full.service.rows.length,4);
 assert.ok(full.service.entries[0].cues,'the full record is the web-enriched one');
 const library=await f.ok('create_service',{name:'Library',service:'Any',from:'library'});
 assert.ok(library.rowCount>0);
 await f.refused('create_service',{name:'X',service:'Y',rows:[{label:'Nothing'}]},/needs cueIds, a status, or both/);
 await f.refused('create_service',{name:'X',service:'Y',rows:[{cueIds:['not-published']}]},/unavailable: not-published/);
});

test('list_services and service_readiness summarise with next steps',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);
 const listed=await f.ok('list_services',{});
 assert.equal(listed.total,1);assert.equal(listed.services[0].serviceId,serviceId);assert.equal(listed.services[0].counts.needsAGraphic,1);
 assert.equal((await f.ok('list_services',{query:'nothing like it'})).total,0);
 const readiness=await f.ok('service_readiness',{serviceId});
 assert.equal(readiness.ready,false);
 assert.match(readiness.rows[1].next,/resolve_coverage_row/);assert.match(readiness.rows[2].next,/create_draft/);
 assert.equal(readiness.rows[0].next,undefined);
 await f.refused('get_service',{serviceId:'missing'},/No prepared service has the id missing\. Call list_services/);
});

test('add_entry inserts at a position or attaches to a row without graphics',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);
 const before=await f.ok('get_service',{serviceId});
 const added=await f.ok('add_entry',{serviceId,expectedVersion:1,cueIds:['aleinu-1','aleinu-2'],type:'multipart',label:'Aleinu',position:{afterRowId:before.rows[0].rowId}});
 assert.equal(added.version,2);assert.equal(added.row.index,1);assert.equal(added.row.entry.type,'multipart');
 const attached=await f.ok('add_entry',{serviceId,expectedVersion:2,cueIds:['mah-tovu'],rowId:before.rows[2].rowId,note:'Reuse the opening graphic'});
 assert.equal(attached.row.label,'Sermon slide');assert.equal(attached.row.note,'Reuse the opening graphic');
 const after=await f.ok('get_service',{serviceId,view:'full'});
 assert.deepEqual(after.service.entries.map((entry:{label:string})=>entry.label),['Mah Tovu','Aleinu','Lecha Dodi','Sermon slide','Kaddish'],'entries follow the row order on /services');
 await f.refused('add_entry',{serviceId,expectedVersion:3,cueIds:['kaddish'],rowId:before.rows[2].rowId},/already has graphics/);
 await f.refused('add_entry',{serviceId,expectedVersion:1,cueIds:['kaddish']},/at version 3, not 1.*Nothing was changed.*get_service/);
 await f.refused('add_entry',{serviceId,expectedVersion:3,cueIds:['kaddish','mah-tovu'],type:'cue'},/exactly one cueId/);
 await f.refused('add_entry',{serviceId,expectedVersion:3,cueIds:['kaddish'],position:{beforeRowId:'nope'}},/no row nope/);
});

test('remove_entry keeps a row with a coverage decision and drops a row without one',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);const {rows}=await f.ok('get_service',{serviceId});
 const kept=await f.ok('remove_entry',{serviceId,expectedVersion:1,rowId:rows[3].rowId});
 assert.match(kept.change,/keeps its coverage decision/);assert.equal(kept.row.entry,undefined);assert.equal(kept.counts.rows,4);
 const dropped=await f.ok('remove_entry',{serviceId,expectedVersion:2,entryId:rows[0].entry.entryId});
 assert.equal(dropped.counts.rows,3);
 await f.refused('remove_entry',{serviceId,expectedVersion:3,rowId:rows[2].rowId},/no graphics to remove/);
 await f.refused('remove_entry',{serviceId,expectedVersion:3},/exactly one of rowId or entryId/);
});

test('reorder_entries moves rows, and entries follow',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);const {rows}=await f.ok('get_service',{serviceId});
 const moved=await f.ok('reorder_entries',{serviceId,expectedVersion:1,rowId:rows[3].rowId,toIndex:0});
 assert.equal(moved.row.index,0);
 const ids=rows.map((row:{rowId:string})=>row.rowId);
 await f.ok('reorder_entries',{serviceId,expectedVersion:2,orderedRowIds:[...ids].reverse()});
 const after=await f.ok('get_service',{serviceId,view:'full'});
 assert.deepEqual(after.service.rows.map((row:{id:string})=>row.id),[...ids].reverse());
 assert.deepEqual(after.service.entries.map((entry:{label:string})=>entry.label),['Kaddish','Lecha Dodi','Mah Tovu']);
 await f.refused('reorder_entries',{serviceId,expectedVersion:3,orderedRowIds:ids.slice(1)},/each of this service's 4 row ids exactly once/);
 await f.refused('reorder_entries',{serviceId,expectedVersion:3,orderedRowIds:ids,rowId:ids[0],toIndex:1},/not both/);
});

test('swap_graphic replaces one graphic and the matching coverage graphic',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);const {rows}=await f.ok('get_service',{serviceId});
 const swapped=await f.ok('swap_graphic',{serviceId,expectedVersion:1,rowId:rows[3].rowId,cueId:'mah-tovu'});
 assert.deepEqual(swapped.row.entry.graphics.map((cue:{cueId:string})=>cue.cueId),['mah-tovu']);assert.equal(swapped.row.coverage.cueId,'mah-tovu');
 await f.refused('swap_graphic',{serviceId,expectedVersion:2,rowId:rows[1].rowId,cueId:'kaddish'},/say which graphic to replace with replaceCueId/);
 const alternate=await f.ok('swap_graphic',{serviceId,expectedVersion:2,rowId:rows[1].rowId,cueId:'kaddish',replaceCueId:'lecha-b'});
 assert.deepEqual(alternate.row.entry.graphics.map((cue:{cueId:string})=>cue.cueId),['lecha-a','kaddish']);
 await f.refused('swap_graphic',{serviceId,expectedVersion:3,rowId:rows[2].rowId,cueId:'kaddish'},/has no graphic yet/);
});

test('resolve_coverage_row settles a row and rewrites its linked entry',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);const {rows}=await f.ok('get_service',{serviceId});
 const resolved=await f.ok('resolve_coverage_row',{serviceId,expectedVersion:1,rowId:rows[1].rowId,cueId:'lecha-b'});
 assert.match(resolved.change,/one of its candidates/);
 assert.equal(resolved.row.readiness,'covered');assert.equal(resolved.row.entry.type,'cue');assert.deepEqual(resolved.row.entry.graphics.map((cue:{cueId:string})=>cue.cueId),['lecha-b']);assert.equal(resolved.row.candidates,undefined);
 const created=await f.ok('resolve_coverage_row',{serviceId,expectedVersion:2,rowId:rows[2].rowId,cueId:'kaddish',reason:'Use Kaddish for now.'});
 assert.equal(created.row.entry.graphics[0].cueId,'kaddish');assert.equal(created.row.coverage.reason,'Use Kaddish for now.');
 assert.equal(created.counts.needsReview+created.counts.needsAGraphic,0);
 await f.refused('resolve_coverage_row',{serviceId,expectedVersion:3,rowId:rows[2].rowId,cueId:'unknown'},/unavailable: unknown/);
});

test('set_coverage_row adds, edits and clears coverage decisions',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);const {rows}=await f.ok('get_service',{serviceId});
 const added=await f.ok('set_coverage_row',{serviceId,expectedVersion:1,label:'Silent prayer',status:'not-needed',reason:'Silent.',position:{index:0}});
 assert.equal(added.row.index,0);assert.equal(added.row.readiness,'not-needed');
 const edited=await f.ok('set_coverage_row',{serviceId,expectedVersion:2,rowId:rows[2].rowId,owner:'Michael',camera:'Cam 2'});
 assert.equal(edited.row.coverage.owner,'Michael');assert.equal(edited.row.coverage.status,'needs-cue');assert.equal(edited.row.camera,'Cam 2');
 const onEntry=await f.ok('set_coverage_row',{serviceId,expectedVersion:3,rowId:rows[0].rowId,status:'covered'});
 assert.equal(onEntry.row.coverage.cueId,'mah-tovu','covered defaults to the row\'s single graphic');
 await f.refused('set_coverage_row',{serviceId,expectedVersion:4,label:'Thing',status:'not-needed'},/Say why no graphic is needed/);
 await f.refused('set_coverage_row',{serviceId,expectedVersion:4,rowId:rows[2].rowId,status:'covered'},/needs the published graphic/);
 await f.refused('set_coverage_row',{serviceId,expectedVersion:4,rowId:rows[2].rowId,clear:true,owner:'x'},/takes only rowId/);
 const cleared=await f.ok('set_coverage_row',{serviceId,expectedVersion:4,rowId:rows[3].rowId,clear:true});
 assert.match(cleared.change,/keeps its graphics/);assert.equal(cleared.row.coverage,undefined);
 const gone=await f.ok('set_coverage_row',{serviceId,expectedVersion:5,rowId:rows[2].rowId,clear:true});
 assert.equal(gone.counts.rows,4);
});

test('rename_service, archive_service and restore_service',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);
 const renamed=await f.ok('rename_service',{serviceId,expectedVersion:1,name:'Kabbalat Shabbat'});
 assert.equal(renamed.name,'Kabbalat Shabbat');assert.equal(renamed.service,'Shabbat Evening');
 await f.refused('rename_service',{serviceId,expectedVersion:2},/new name, a new service, or both/);
 const archived=await f.ok('archive_service',{serviceId,expectedVersion:2});
 assert.equal(archived.archived,true);assert.equal((await f.ok('list_services',{})).total,0);assert.equal((await f.ok('list_services',{includeArchived:true})).total,1);
 assert.match((await f.ok('archive_service',{serviceId,expectedVersion:3})).change,/already archived/);
 const restored=await f.ok('restore_service',{serviceId,expectedVersion:3});
 assert.equal(restored.archived,false);assert.equal(restored.version,4);
});

test('set_names and clear_names keep the web\'s on-air refusal',async()=>{
 const f=fixture();const {serviceId}=await seeded(f);
 const names={title:'Yahrzeits',layout:'left',rows:[{en:'Sarah Cohen'},{he:'דוד',en:'David'}]};
 const saved=await f.ok('set_names',{serviceId,expectedVersion:1,names});
 assert.equal(saved.names.count,2);assert.equal(saved.version,2);
 f.live.cue=`names:${serviceId}:1`;
 await f.refused('clear_names',{serviceId,expectedVersion:2},/Take Yahrzeits.*off air first/);
 await f.refused('archive_service',{serviceId,expectedVersion:2},/off air first/);
 assert.equal((await f.ok('get_service',{serviceId})).version,2,'a refused names change writes nothing');
 f.live.cue=null;
 const cleared=await f.ok('clear_names',{serviceId,expectedVersion:2});
 assert.equal(cleared.names,null);
 assert.match((await f.ok('clear_names',{serviceId,expectedVersion:3})).change,/no names list/);
 await f.refused('set_names',{serviceId,expectedVersion:3,names:{title:'Empty',layout:'left',rows:[{}]}},/needs a Hebrew name or an English name/);
});

test('list_live_setlists answers in words when unconfigured and lists when configured',async()=>{
 const f=fixture();const original={...liveSetlistDependencies};
 try{
  liveSetlistDependencies.availability=()=>({available:false,reason:'unconfigured'});
  const off=await f.ok('list_live_setlists');assert.equal(off.available,false);assert.match(off.message,/not set up/);
  liveSetlistDependencies.availability=()=>({available:true,reason:'ok'});
  liveSetlistDependencies.createTransport=()=>async()=>({setlists:[{id:'s1',name:'Friday',date:'2026-09-25',eventDate:'2026-09-25',trackCount:3}]});
  liveSetlistDependencies.todaySuggestion=async()=>null;
  const on=await f.ok('list_live_setlists');assert.equal(on.available,true);assert.equal(on.setlists[0].id,'s1');assert.match(on.next,/prepare_service_from_setlist/);
 }finally{Object.assign(liveSetlistDependencies,original)}
});

test('refresh_from_setlist is a dry run by default, keeps decisions, takes new matches and inserts new rows',async()=>{
 const f=fixture();const original={...liveSetlistDependencies};
 let setlist:LiveSetlist={id:'set-1',name:'Friday',eventDate:'2026-09-25',tracks:[{id:'t1',title:'Mah Tovu'},{id:'t2',title:'Lecha Dodi'},{id:'t3',title:'Announcements'}]};
 try{
  liveSetlistDependencies.availability=()=>({available:true,reason:'ok'});
  liveSetlistDependencies.createTransport=()=>async()=>({});
  liveSetlistDependencies.liturgyFor=()=>({unitId:null,momentId:null,book:null,folio:null});
  liveSetlistDependencies.importSetlist=async(id,deps)=>({setlist:{id,name:'Friday',date:null,eventDate:'2026-09-25'},...matchSetlist(setlist,{...deps,cues:CUES as unknown as Cue[]})});
  const {repository}=f;
  // Import through the same path the web uses, then make one human decision on a waiting row.
  const {servicesOperation}=await import('../lib/service-collections.ts');
  const loaders:ServicesLoaders={catalog:async()=>({cues:structuredClone(CUES),version:'v1'}),sources:()=>[],now:()=>2000,id:(()=>{let n=0;return ()=>`00000000-0000-4000-9000-${String(++n).padStart(12,'0')}`})(),liveCue:async()=>null};
  const imported=await servicesOperation('import_setlist',{setlistId:'set-1'},'editor',repository,loaders) as {collection:{id:string}};
  const serviceId=imported.collection.id;
  const tools=(name:string,args:Record<string,unknown>)=>serviceToolOperation(name,args,'mcp:agent',{repository,loaders}) as Promise<Record<string,any>>;// eslint-disable-line @typescript-eslint/no-explicit-any
  const start=await tools('get_service',{serviceId});
  assert.deepEqual(start.rows.map((row:{label:string;readiness:string})=>[row.label,row.readiness]),[['Mah Tovu','covered'],['Lecha Dodi','needs-review'],['Announcements','not-needed']]);
  await tools('add_entry',{serviceId,expectedVersion:1,cueIds:['kaddish'],label:'Hand-added Kaddish',position:{afterRowId:start.rows[0].rowId}});
  await tools('set_coverage_row',{serviceId,expectedVersion:2,rowId:start.rows[2].rowId,status:'intentional-fallback',reason:'Rabbi speaks; no slide.'});
  // The setlist changes: Lecha Dodi now names one setting, a new row arrives, Announcements is gone.
  setlist={...setlist,tracks:[{id:'t1',title:'Mah Tovu'},{id:'t4',title:'Kaddish'},{id:'t2',title:'Lecha Dodi (Sulzer)'}]};
  const dry=await tools('refresh_from_setlist',{serviceId,expectedVersion:3});
  assert.equal(dry.dryRun,true);assert.equal(dry.version,3);
  assert.deepEqual(dry.summary,{added:1,updated:1,kept:0,missing:1,removed:0,unchanged:1});
  assert.equal((await tools('get_service',{serviceId})).version,3,'a dry run writes nothing');
  const applied=await tools('refresh_from_setlist',{serviceId,expectedVersion:3,dryRun:false});
  assert.equal(applied.version,4);
  const after=await tools('get_service',{serviceId});
  assert.deepEqual(after.rows.map((row:{label:string;readiness:string})=>[row.label,row.readiness]),[['Mah Tovu','covered'],['Hand-added Kaddish','covered'],['Kaddish','covered'],['Lecha Dodi (Sulzer)','covered'],['Announcements','not-needed']]);
  assert.equal(after.rows[3].rowId,start.rows[1].rowId,'the waiting row kept its id and took the new match');
  assert.equal(after.rows[4].coverage.status,'intentional-fallback','the human decision stands');
  assert.equal(after.origin.importedAt,2000);assert.deepEqual(after.origin.trackIds,['t1','t4','t2']);
  const removed=await tools('refresh_from_setlist',{serviceId,expectedVersion:4,dryRun:false,removeMissing:true});
  assert.equal(removed.summary.removed,1);assert.equal(removed.counts.rows,4);
  await assert.rejects(()=>tools('refresh_from_setlist',{serviceId,expectedVersion:1}),/at version 5, not 1/);
  const manual=await tools('create_service',{name:'Manual',service:'Any'});
  await assert.rejects(()=>tools('refresh_from_setlist',{serviceId:manual.serviceId,expectedVersion:1}),/not imported from centralreform.live/);
 }finally{Object.assign(liveSetlistDependencies,original)}
});

test('serviceToolOperation re-validates input that did not come through MCP',async()=>{
 const repository=new MemoryServicesRepository();
 await assert.rejects(()=>serviceToolOperation('add_entry',{serviceId:'x',expectedVersion:1,cueIds:['a'],extra:true},'a',{repository}),/add_entry input is not valid/);
 await assert.rejects(()=>serviceToolOperation('not_a_tool',{},'a',{repository}),/Unknown services operation/);
});

test('the authoring dispatch routes services tools and turns a services refusal into an authoring one',async()=>{
 const {createAuthoringService,MemoryAuthoringRepository}=await import('../lib/authoring.ts');
 const service=createAuthoringService(new MemoryAuthoringRepository());
 await assert.rejects(()=>service.operation('add_entry',{serviceId:'x'},'mcp:agent'),(error:unknown)=>error instanceof Error&&error.constructor.name==='AuthoringError'&&(error as {code?:string}).code==='invalid_input'&&/add_entry input is not valid/.test(error.message));
});

test('updateCollection takes rows only from the services tools, strictly, and orders entries and coverage by them',async()=>{
 const {ServicesManager}=await import('../lib/service-collections.ts');
 const repository=new MemoryServicesRepository();let id=0;
 const manager=new ServicesManager(repository,{catalog:async()=>({cues:structuredClone(CUES),version:'v1'}),sources:()=>[],now:()=>1,id:()=>`id-${++id}`,liveCue:async()=>null});
 const created=await manager.createCollection({name:'A',service:'B',entries:[{id:'e1',type:'cue',label:'One',cueIds:['mah-tovu']},{id:'e2',type:'cue',label:'Two',cueIds:['kaddish']}],coverage:[{id:'c1',label:'Two',status:'covered',cueId:'kaddish'}]},'editor');
 const entries=created.entries.map(({id,type,label,cueIds})=>({id,type,label,cueIds})),coverage=[{id:'c1',label:'Two',status:'covered',cueId:'kaddish'}];
 const updated=await manager.updateCollection({id:created.id,expectedVersion:1,entries,coverage},'editor',{rows:[{id:'r2',entryId:'e2',coverageId:'c1',buttonLabel:'Two'},{id:'r1',entryId:'e1',camera:'Cam 1'}]});
 assert.deepEqual(updated.entries.map(entry=>entry.id),['e2','e1']);
 assert.deepEqual(updated.rows.map(row=>[row.id,row.label,row.buttonLabel??row.camera]),[['r2','Two','Two'],['r1','One','Cam 1']]);
 await assert.rejects(()=>manager.updateCollection({id:created.id,expectedVersion:2},'editor',{rows:[{id:'r1',entryId:'e1'},{id:'r1',entryId:'e2'}]}),/Row ID appears more than once/);
 await assert.rejects(()=>manager.updateCollection({id:created.id,expectedVersion:2},'editor',{rows:[{id:'r1',entryId:'nope'}]}),/links an entry this service does not have/);
 await assert.rejects(()=>manager.updateCollection({id:created.id,expectedVersion:2},'editor',{rows:[{id:'r1',entryId:'e1',candidateCueIds:['gone']}]}),/unavailable: gone/);
 await assert.rejects(()=>manager.updateCollection({id:created.id,expectedVersion:2},'editor',{rows:[{id:'r1',entryId:'e1',color:'red'}]}),/unsupported fields: color/);
 await assert.rejects(()=>manager.updateCollection({id:created.id,expectedVersion:2,rows:[]},'editor'),/unsupported fields: rows/,'the web request surface is unchanged');
});
