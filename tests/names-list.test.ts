import assert from 'node:assert/strict';
import test from 'node:test';
import {composeAuthoringCatalog} from '../lib/server.ts';
import {isNamesCueId,namesPanelCues,namesPanelMotion,namesPages,parseNames,type NamesList} from '../lib/names-list.ts';
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
 const loaders:ServicesLoaders={catalog:async()=>structuredClone(catalog),sources:()=>[],now:()=>++now,id:()=>`id-${++id}`};
 return {repository,manager:new ServicesManager(repository,loaders)};
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
 // Nothing reached the authoring tables: the published library is still empty.
 const {publishedCues}=await import('../lib/authoring.ts');
 assert.deepEqual((await publishedCues()).filter(cue=>isNamesCueId(cue.id)),[]);
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
