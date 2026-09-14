import assert from 'node:assert/strict';
import test from 'node:test';
import {composeAuthoringCatalog} from '../lib/server.ts';
import {isNamesCueId,namesPanelCues,namesPanelMotion,namesPages,panelName,parseNames,type NamesList} from '../lib/names-list.ts';
import {createRunGuard,namesSavedNotice,NAMES_REMOVED_NOTICE} from '../app/services/names-list-model.ts';
import {MemoryServicesRepository,ServicesConflictError,ServicesError,ServicesManager,servicesOperation,servicesPermission,type ServicesLoaders} from '../lib/service-collections.ts';
import type {Cue} from '../lib/player.ts';

// Rehearsal storage, set before anything in lib/authoring memoizes its repository, so this
// file never opens a database connection.
process.env.CRC_AUTHORING_REHEARSAL='1';
Object.assign(process.env,{NODE_ENV:'development'});
delete process.env.RELAY_URL;
delete process.env.VERCEL;
process.env.CONTROL_KEY='c'.repeat(43);
process.env.OUTPUT_KEY='o'.repeat(43);

// companion/src/panel.ts MULTIPART_NAME, copied rather than imported: the module is a
// separate package, and the point of this test is that the two conventions agree without
// either side sharing code. The module writes the three groups as named captures
// (?<name>…) (?<panel>…) (?<count>…); this repository's tsconfig targets ES2017, so the
// identical pattern is spelled with positional groups here.
const COMPANION_MULTIPART_NAME=/^(.+?) — (\d{1,4}) of (\d{1,4})$/;
// The regex lib/service-collections.ts:99 already uses to regroup a published numbered set.
const SERVICES_MULTIPART_NAME=/^(.*?)\s+[—-]\s+(\d{1,3}) of (\d{1,3})$/i;

const list=(overrides:Partial<NamesList>={}):NamesList=>({
 title:'Mi Shebeirach',
 perPanel:8,
 layout:'left',
 rows:Array.from({length:17},(_,index)=>({he:`עברית ${index+1}`,en:`English ${index+1}`})),
 updatedAt:1000,
 updatedBy:'editor',
 ...overrides,
});

function fixture(){
 const repository=new MemoryServicesRepository();let now=1000,id=0;
 const catalog:{cues:{id:string;name:string}[];version:string}={cues:[{id:'mah-tovu',name:'Mah Tovu'}],version:'v1'};
 // The live state is a read-only loader, so a test can put a graphic on air without any
 // relay and without a services write ever issuing a live command.
 const live={cue:null as string|null};
 const loaders:ServicesLoaders={catalog:async()=>structuredClone(catalog),sources:()=>[],now:()=>++now,id:()=>`id-${++id}`,liveCue:async()=>live.cue};
 return {repository,catalog,live,manager:new ServicesManager(repository,loaders)};
}

test('17 names at 8 per panel become three panels every parser of the numbered convention reads',()=>{
 const cues=namesPanelCues('collection-1',list());
 assert.equal(cues.length,3);
 assert.deepEqual(cues.map(cue=>cue.name),['Mi Shebeirach — 01 of 03','Mi Shebeirach — 02 of 03','Mi Shebeirach — 03 of 03']);
 assert.deepEqual(cues.map(cue=>cue.id),['names:collection-1:01','names:collection-1:02','names:collection-1:03']);
 for(const [index,cue] of cues.entries()){
  const companion=COMPANION_MULTIPART_NAME.exec(cue.name);
  assert.equal(companion?.[1],'Mi Shebeirach');
  assert.equal(companion?.[2],String(index+1).padStart(2,'0'));
  assert.equal(companion?.[3],'03');
  const services=SERVICES_MULTIPART_NAME.exec(cue.name);
  assert.equal(services?.[1],'Mi Shebeirach');
  assert.equal(Number(services?.[2]),index+1);
  assert.equal(Number(services?.[3]),3);
 }
 assert.deepEqual(cues.map(cue=>cue.contentRows!.length),[8,8,1]);
 assert.deepEqual(cues[2].contentRows,[{he:'עברית 17',tr:'',en:'English 17'}]);
 assert.equal(cues[0].layout,'left');
 assert.equal(cues[0].texts.textTitle,'Mi Shebeirach');
});

test('a page numbers past nine widen both numbers together, as the authoring emitter does',()=>{
 const cues=namesPanelCues('c',list({perPanel:4,rows:Array.from({length:41},(_,index)=>({he:'',en:`Name ${index+1}`}))}));
 assert.equal(cues.length,11);
 assert.equal(cues[0].name,'Mi Shebeirach — 01 of 11');
 const wide=namesPanelCues('c',list({perPanel:4,rows:Array.from({length:120},(_,index)=>({he:'',en:`Name ${index+1}`}))}));
 assert.equal(wide.length,30);
 assert.equal(wide[0].name,'Mi Shebeirach — 01 of 30');
 assert.equal(namesPages(list()).length,3);
});

test('an empty channel renders nothing for that channel and still pairs a row',()=>{
 const cues=namesPanelCues('c',list({rows:[{he:'רבקה',en:''},{he:'',en:'Rebecca'}]}));
 assert.deepEqual(cues[0].contentRows,[{he:'רבקה',tr:'',en:''},{he:'',tr:'',en:'Rebecca'}]);
});

test('a names panel inherits only motion from the baseline panel of its layout',()=>{
 const baseline=[
  {id:'hidden-left',name:'Hidden',layout:'left',hidden:true,texts:{},animations:[{element:'textMain'}],duration:{}},
  {id:'left',name:'Left',layout:'left',texts:{},animations:[{element:'textMainheb'},{element:'textMainEng'}],duration:{in:1}},
  {id:'right',name:'Right',layout:'right',texts:{},animations:[{element:'textMain'},{element:'baseMain'}],duration:{in:2}},
 ] as unknown as Cue[];
 const left=namesPanelMotion(baseline,'left');
 assert.deepEqual(left.animations.map(track=>track.element),['textMainheb','textMainEng']);
 assert.deepEqual(left.duration,{in:1});
 // buildCue's rule: a template still addressing the single textMain element is split into
 // the two paired-row elements, never left addressing an element the panel does not render.
 const right=namesPanelMotion(baseline,'right');
 assert.deepEqual(right.animations.map(track=>track.element),['baseMain','textMainheb','textMainEng']);
 const cue=namesPanelCues('c',list({layout:'right'}),right)[0];
 assert.deepEqual(cue.duration,{in:2});
 assert.notEqual(cue.animations,right.animations);
});

test('parseNames refuses in plain language and keeps the ServicesError contract',()=>{
 const refusal=(names:unknown)=>{try{parseNames(names);return null}catch(error){assert.ok(error instanceof ServicesError);assert.equal((error as ServicesError).code,'invalid_names');assert.equal((error as ServicesError).status,400);return (error as ServicesError).message}};
 const rows=[{he:'',en:'Ada'}];
 assert.equal(refusal({title:'x'.repeat(61),perPanel:8,layout:'left',rows}),'Name this list, using 60 characters or fewer.');
 assert.equal(refusal({title:'',perPanel:8,layout:'left',rows}),'Name this list, using 60 characters or fewer.');
 assert.equal(refusal({title:'List',perPanel:8,layout:'bottom',rows}),'Choose the left panel or the right panel.');
 assert.equal(refusal({title:'List',perPanel:3,layout:'left',rows}),'Names per panel must be a whole number from 4 to 12.');
 assert.equal(refusal({title:'List',perPanel:13,layout:'left',rows}),'Names per panel must be a whole number from 4 to 12.');
 assert.equal(refusal({title:'List',perPanel:8,layout:'left',rows:[]}),'Add at least one name.');
 assert.equal(refusal({title:'List',perPanel:8,layout:'left',rows:Array.from({length:121},()=>({he:'',en:'A'}))}),'A names list holds at most 120 names.');
 assert.equal(refusal({title:'List',perPanel:8,layout:'left',rows:[{he:'',en:'x'.repeat(61)}]}),'Each name must be 60 characters or fewer.');
 assert.equal(refusal({title:'List',perPanel:8,layout:'left',rows:[{he:'',en:''}]}),'Row 1 needs a Hebrew name or an English name.');
 assert.equal(refusal({title:'List',perPanel:8,layout:'left',rows:[{he:'Ada',en:'Ada',tr:'Ada'}]}),'Row 1 contains unsupported fields: tr');
 assert.equal(refusal('Mi Shebeirach'),'Enter a list title and at least one name.');
 const parsed=parseNames({title:'  Mi Shebeirach ',layout:'right',rows:[{he:' רבקה ',en:''}]},5,'editor-1');
 assert.deepEqual(parsed,{title:'Mi Shebeirach',perPanel:8,layout:'right',rows:[{he:'רבקה',en:''}],updatedAt:5,updatedBy:'editor-1'});
});

test('setting a list puts its panels in the authoring catalog and clearing removes them and moves the version',()=>{
 const baseline=[{id:'left',name:'Left',layout:'left',texts:{},animations:[],duration:{}}] as unknown as Cue[];
 const cues=namesPanelCues('collection-1',list());
 const withNames=composeAuthoringCatalog(baseline,[],cues);
 const cleared=composeAuthoringCatalog(baseline,[],[]);
 assert.equal(withNames.cues.length,4);
 assert.equal(withNames.cues.filter(cue=>isNamesCueId(cue.id)).length,3);
 assert.equal(cleared.cues.filter(cue=>isNamesCueId(cue.id)).length,0);
 assert.notEqual(withNames.version,cleared.version);
 assert.deepEqual(cleared.cues,baseline);
});

test('names operations are author scoped and write only the service collection',async()=>{
 assert.equal(servicesPermission('set_names'),'author');
 assert.equal(servicesPermission('clear_names'),'author');
 const {manager,repository}=fixture();
 const created=await manager.createCollection({name:'Friday',service:'Evening',entries:[],coverage:[]},'editor');
 const saved=await manager.setNames({id:created.id,expectedVersion:created.version,names:{title:'Mi Shebeirach',perPanel:8,layout:'left',rows:[{he:'רבקה',en:'Rebecca'}]}},'editor');
 assert.equal(saved.names?.title,'Mi Shebeirach');
 assert.equal(saved.version,created.version+1);
 // Nothing reached the authoring tables: not the published library, and not the drafts,
 // previews or revisions behind it. The rehearsal store is in memory, so this is the whole
 // authoring side of the database, asserted empty rather than merely free of names rows.
 const {publishedCues,authoringRepository,MemoryAuthoringRepository}=await import('../lib/authoring.ts');
 assert.deepEqual((await publishedCues()).filter(cue=>isNamesCueId(cue.id)),[]);
 const store=authoringRepository();
 assert.ok(store instanceof MemoryAuthoringRepository);
 assert.equal((store as InstanceType<typeof MemoryAuthoringRepository>).drafts.size,0);
 assert.equal((store as InstanceType<typeof MemoryAuthoringRepository>).previews.size,0);
 assert.equal((store as InstanceType<typeof MemoryAuthoringRepository>).revisionRows.size,0);
 await assert.rejects(()=>manager.setNames({id:created.id,expectedVersion:created.version,names:{title:'Stale',perPanel:8,layout:'left',rows:[{he:'',en:'A'}]}},'editor'),ServicesConflictError);
 const removed=await manager.clearNames({id:created.id,expectedVersion:saved.version},'editor');
 assert.equal(removed.names,null);
 assert.equal((await repository.listCollections())[0].names,null);
});

test('archiving a service nulls its names in the same optimistic write and a stale version conflicts',async()=>{
 const {manager,repository}=fixture();
 const created=await manager.createCollection({name:'Friday',service:'Evening',entries:[],coverage:[]},'editor');
 const saved=await manager.setNames({id:created.id,expectedVersion:created.version,names:{title:'Yahrzeit',perPanel:8,layout:'left',rows:[{he:'',en:'Ada'}]}},'editor');
 await assert.rejects(()=>manager.setCollectionArchived({id:created.id,expectedVersion:created.version},'editor',true),ServicesConflictError);
 assert.equal((await repository.listCollections(true))[0].names?.title,'Yahrzeit');
 const archived=await manager.setCollectionArchived({id:created.id,expectedVersion:saved.version},'editor',true);
 assert.equal(archived.archived,true);
 assert.equal(archived.names,null);
 assert.equal((await repository.listCollections(true))[0].names,null);
 await assert.rejects(()=>manager.setNames({id:created.id,expectedVersion:archived.version,names:{title:'Again',perPanel:8,layout:'left',rows:[{he:'',en:'A'}]}},'editor'),(error:unknown)=>error instanceof ServicesError&&error.code==='collection_archived');
});

test('the names operations run through the one envelope and do not report a live-library warning without a relay',async()=>{
 const repository=new MemoryServicesRepository();
 const created=await servicesOperation('create_collection',{name:'Friday',service:'Evening',entries:[],coverage:[]},'editor',repository) as {collection:{id:string;version:number}};
 const saved=await servicesOperation('set_names',{id:created.collection.id,expectedVersion:created.collection.version,names:{title:'Mi Shebeirach',perPanel:8,layout:'left',rows:[{he:'',en:'Ada'}]}},'editor',repository) as Record<string,unknown>;
 assert.equal(Object.keys(saved).join(','),'collection');
 assert.equal((saved.collection as {names:{title:string}}).names.title,'Mi Shebeirach');
 await assert.rejects(()=>servicesOperation('set_names',{id:'missing',expectedVersion:1,names:{title:'x',perPanel:8,layout:'left',rows:[{he:'',en:'A'}]}},'editor',repository),(error:unknown)=>error instanceof ServicesError&&error.status===404);
});

test('an operator credential cannot set names on a service',async()=>{
 const {POST}=await import('../app/api/services/route.ts');
 const request=(key:string)=>new Request('http://localhost/api/services',{method:'POST',headers:{authorization:`Bearer ${key}`,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({operation:'set_names',input:{id:'nope',expectedVersion:1,names:{title:'List',perPanel:8,layout:'left',rows:[{he:'',en:'Ada'}]}}})});
 assert.equal((await POST(request(process.env.OUTPUT_KEY!))).status,401);
});

test('a names list never reaches another service: not by Create from library, not as an entry, not as coverage',async()=>{
 const {manager,catalog}=fixture();
 // Service A's list is live in the catalog, exactly as lib/server.ts composes it.
 const namesCues=namesPanelCues('service-a',list({rows:[{he:'',en:'Ada'}]}));
 catalog.cues.push(...namesCues.map(cue=>({id:cue.id,name:cue.name})));
 const imported=await manager.createFromLibrary({name:'Service B',service:'Evening'},'editor');
 assert.deepEqual(imported.entries.flatMap(entry=>entry.cueIds).filter(isNamesCueId),[]);
 assert.deepEqual(imported.coverage.filter(row=>row.cueId&&isNamesCueId(row.cueId)),[]);
 assert.deepEqual(imported.coverage.filter(row=>row.label==='Mi Shebeirach'),[]);
 assert.deepEqual(imported.entries.map(entry=>entry.label),['Mah Tovu']);
 const refusal=async(run:()=>Promise<unknown>)=>{try{await run();return null}catch(error){assert.ok(error instanceof ServicesError);return error as ServicesError}};
 const asEntry=await refusal(()=>manager.updateCollection({id:imported.id,expectedVersion:imported.version,entries:[{type:'cue',label:'Names',cueIds:[namesCues[0].id]}]},'editor'));
 assert.equal(asEntry?.code,'unknown_cue');
 assert.equal(asEntry?.status,404);
 assert.equal(asEntry?.message,`Published cue is unavailable: ${namesCues[0].id}`);
 const asCoverage=await refusal(()=>manager.updateCollection({id:imported.id,expectedVersion:imported.version,coverage:[{label:'Names',status:'covered',cueId:namesCues[0].id}]},'editor'));
 assert.equal(asCoverage?.code,'unknown_cue');
 assert.equal(asCoverage?.status,404);
 const atCreation=await refusal(()=>manager.createCollection({name:'Service C',service:'Evening',entries:[{type:'cue',label:'Names',cueIds:[namesCues[0].id]}],coverage:[]},'editor'));
 assert.equal(atCreation?.status,404);
});

test('a names cue id cannot be authored or imported through any authoring operation',async()=>{
 const {authoringOperation}=await import('../lib/authoring.ts');
 const cueId='names:service-a:01';
 const refusal=async(operation:string,input:unknown)=>{try{await authoringOperation(operation,input,'editor');return null}catch(error){return error as {status?:number;code?:string}}};
 for(const [operation,input] of [
  ['import_cue',{cueId}],
  ['preview_baseline_cue',{cueId}],
  ['duplicate_draft',{cueId,name:'Copy'}],
 ] as Array<[string,unknown]>){
  const error=await refusal(operation,input);
  assert.ok(error,`${operation} accepted a names cue id`);
  assert.equal(error?.status,404,`${operation} refused with ${error?.status}`);
 }
});

test('removing or archiving a names list is refused while one of its panels is on air',async()=>{
 const {manager,live}=fixture();
 const created=await manager.createCollection({name:'Friday',service:'Evening',entries:[],coverage:[]},'editor');
 const saved=await manager.setNames({id:created.id,expectedVersion:created.version,names:{title:'Mi Shebeirach',perPanel:4,layout:'left',rows:[{he:'',en:'Ada'},{he:'',en:'Ben'},{he:'',en:'Cara'},{he:'',en:'Dov'},{he:'',en:'Esti'}]}},'editor');
 assert.equal(namesPages(saved.names!).length,2);
 live.cue=`names:${created.id}:02`;
 const onAir=async(run:()=>Promise<unknown>)=>{try{await run();return null}catch(error){assert.ok(error instanceof ServicesError);return error as ServicesError}};
 const cleared=await onAir(()=>manager.clearNames({id:created.id,expectedVersion:saved.version},'editor'));
 assert.equal(cleared?.code,'names_on_air');
 assert.equal(cleared?.status,409);
 assert.equal(cleared?.message,`Take ${panelName('Mi Shebeirach',1,2)} off air first — Clear on Live control — then remove the names.`);
 const archived=await onAir(()=>manager.setCollectionArchived({id:created.id,expectedVersion:saved.version},'editor',true));
 assert.equal(archived?.code,'names_on_air');
 assert.equal(archived?.status,409);
 // The write really did not happen, and nothing was sent to the live output.
 assert.equal((await manager.dashboard({includeArchived:true})).collections[0].names?.title,'Mi Shebeirach');
 // Another service's list is not this service's panel.
 live.cue='names:another-service:01';
 assert.equal((await manager.clearNames({id:created.id,expectedVersion:saved.version},'editor')).names,null);
});

test('a published graphic on air never blocks removing a names list',async()=>{
 const {manager,live}=fixture();
 const created=await manager.createCollection({name:'Friday',service:'Evening',entries:[],coverage:[]},'editor');
 const saved=await manager.setNames({id:created.id,expectedVersion:created.version,names:{title:'Yahrzeit',perPanel:8,layout:'left',rows:[{he:'',en:'Ada'}]}},'editor');
 live.cue='mah-tovu';
 const archived=await manager.setCollectionArchived({id:created.id,expectedVersion:saved.version},'editor',true);
 assert.equal(archived.names,null);
});

test('the names editor says what the server said about the live library, and what it removed',()=>{
 const first='Mi Shebeirach — 01 of 03';
 const success=`These names are now in the library as ${first}. Show them from Live control or from Companion.`;
 assert.equal(namesSavedNotice({collection:{}},first),success);
 assert.equal(namesSavedNotice({collection:{},warning:''},first),success);
 assert.equal(namesSavedNotice(null,first),success);
 const warning='Saved successfully, but the live library has not received this update. Use Sync live library in the editor after the connection recovers. Live playback continues using the last synchronized version.';
 assert.equal(namesSavedNotice({collection:{},liveRefreshPending:true,warning},first),warning);
 assert.equal(NAMES_REMOVED_NOTICE,'Names removed. Nothing else changed.');
});

test('only the newest measurement pass may publish a verdict, and a further edit re-measures',()=>{
 const guard=createRunGuard();
 const first=guard.begin();
 assert.equal(guard.isCurrent(first),true);
 const second=guard.begin();
 assert.equal(guard.isCurrent(first),false,'a superseded pass must publish nothing');
 assert.equal(guard.isCurrent(second),true);
 guard.supersede();
 assert.equal(guard.isCurrent(second),false,'an edit with nothing to measure supersedes too');
 const third=guard.begin();
 assert.equal(guard.isCurrent(third),true,'a further edit always re-measures');
 assert.equal(guard.isCurrent(first),false);
});
