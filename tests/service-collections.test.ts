import assert from 'node:assert/strict';
import test from 'node:test';
import {collectionsContainingCueIds,feedbackCsv,MemoryServicesRepository,servicesPermission,ServicesConflictError,ServicesError,ServicesManager,type ServicesLoaders,type ServiceCollection,type BetaFeedback} from '../lib/service-collections.ts';

function fixture(){
 const repository=new MemoryServicesRepository();let now=1000,id=0;
 const catalog:{cues:{id:string;name:string;title?:string}[];version:string}={cues:[{id:'mah-tovu',name:'Mah Tovu',title:'Morning prayer'},{id:'kaddish',name:'Kaddish',title:'Mourner’s Kaddish'}],version:'v1'};
 const sources:{id:string;name:string;book?:string;service?:string;section?:string|number;blocks:unknown[]}[]=[{id:'source:mah',name:'Mah Tovu source',book:'Siddur',service:'Morning',blocks:[{}]}];
 const loaders:ServicesLoaders={catalog:async()=>structuredClone(catalog),sources:()=>structuredClone(sources),now:()=>++now,id:()=>`id-${++id}`};
 return {repository,catalog,sources,manager:new ServicesManager(repository,loaders)};
}

test('ordered collections preserve repeated service moments and group semantics',async()=>{
 const {manager}=fixture();
 const created=await manager.createCollection({name:'Shabbat morning',service:'Shabbat Morning',entries:[
  {id:'opening',type:'cue',label:'Opening Mah Tovu',cueIds:['mah-tovu']},
  {id:'repeat',type:'cue',label:'Return to Mah Tovu',cueIds:['mah-tovu']},
  {id:'closing',type:'alternates',label:'Closing alternatives',cueIds:['kaddish','mah-tovu']},
 ],coverage:[]},'editor-1');
 assert.deepEqual(created.entries.map(item=>item.id),['opening','repeat','closing']);
 assert.deepEqual(created.entries[2].cueIds,['kaddish','mah-tovu']);
 assert.equal(created.version,1);
});

test('optimistic updates, archive, and restore never delete a collection',async()=>{
 const {manager,repository}=fixture();
 const value=await manager.createCollection({name:'Friday',service:'Evening',entries:[],coverage:[]},'owner');
 const updated=await manager.updateCollection({id:value.id,expectedVersion:1,name:'Friday night'},'editor');
 assert.equal(updated.version,2);
 await assert.rejects(()=>manager.updateCollection({id:value.id,expectedVersion:1,name:'Stale'},'editor'),ServicesConflictError);
 const archived=await manager.setCollectionArchived({id:value.id,expectedVersion:2},'editor',true);
 assert.equal(archived.archived,true);assert.equal((await repository.listCollections()).length,0);
 const restored=await manager.setCollectionArchived({id:value.id,expectedVersion:3},'editor',false);
 assert.equal(restored.archived,false);assert.equal((await repository.listCollections()).length,1);
});

test('disappearing catalog evidence degrades in place and does not block unrelated edits',async()=>{
 const {manager,catalog}=fixture();
 const value=await manager.createCollection({name:'Morning',service:'Morning',entries:[{id:'one',type:'cue',label:'Mah Tovu',cueIds:['mah-tovu']}],coverage:[{id:'cover-one',label:'Opening',status:'covered',cueId:'mah-tovu'}]},'editor');
 catalog.cues.splice(0,1);
 const dashboard=await manager.dashboard({});
 assert.equal(dashboard.collections[0].entries[0].available,false);
 assert.equal(dashboard.collections[0].coverage[0].computedStatus,'needs-review');
 const renamed=await manager.updateCollection({id:value.id,expectedVersion:1,name:'Morning revised',entries:value.entries.map(({id,type,label,cueIds})=>({id,type,label,cueIds})),coverage:value.coverage.map(({id,label,status,cueId,sourceId,owner,reason})=>({id,label,status,cueId,sourceId,owner,reason}))},'editor');
 assert.equal(renamed.entries[0].cues[0].available,false);
 await assert.rejects(()=>manager.updateCollection({id:value.id,expectedVersion:2,entries:[{id:'new',type:'cue',label:'Gone',cueIds:['not-published']}]},'editor'),(error:unknown)=>error instanceof ServicesError&&error.code==='unknown_cue');
});

test('coverage requires evidence, ownership, and reasons for intentional omissions',async()=>{
 const {manager}=fixture();
 await assert.rejects(()=>manager.createCollection({name:'Test',service:'Test',entries:[],coverage:[{label:'Silent prayer',status:'not-needed'}]},'editor'),/require a reason/);
 await assert.rejects(()=>manager.createCollection({name:'Test',service:'Test',entries:[],coverage:[{label:'Opening',status:'covered'}]},'editor'),/published cue/);
 const value=await manager.createCollection({name:'Test',service:'Test',entries:[],coverage:[{label:'Opening',status:'needs-cue',sourceId:'source:mah',owner:'Michael',reason:'Create a side panel'}]},'editor');
 assert.equal(value.coverage[0].sourceAvailable,true);
});

test('feedback records fallbacks and CSV neutralizes formulas after whitespace',async()=>{
 const {manager,repository}=fixture();
 const first=await manager.recordFeedback({kind:'fallback',context:'Before Torah',reason:'\t=HYPERLINK("bad")',impact:'service-affecting',productGap:true},'operator');
 assert.equal(first.kind,'fallback');
 await repository.insertFeedback({...first,id:'unsafe-import',reason:'\t=HYPERLINK("bad")'});
 const csv=await feedbackCsv(repository);
 assert.match(csv,/"'\t=HYPERLINK\(""bad""\)"/);
 assert.match(csv,/"service-affecting"/);
});

test('source search is bounded, ignores Hebrew niqqud, and accepts numeric metadata',async()=>{
 const {manager,sources}=fixture();sources.push({id:'source:he',name:'מַה טוֹבוּ',book:'סידור',section:42,blocks:[{}]},{id:'frontmatter.how-to-use',name:'How to Use',book:'Siddur',blocks:[{}]},{id:'rubric',name:'Opening Rubric',book:'Siddur',blocks:[{}]},{id:'duplicate',name:'Mah Tovu source',book:'duplicate',service:'CRC Morning',blocks:[{}]});
 const result=await manager.searchSources({query:'מה טובו',limit:10});
 assert.equal(result[0].id,'source:he');
 const all=await manager.searchSources({query:'',limit:20});assert.equal(all.some(source=>/Rubric|How to Use/.test(source.name)),false);assert.equal(all.filter(source=>source.name==='Mah Tovu source').length,1);
 await assert.rejects(()=>manager.searchSources({query:'',limit:101}),/at most 100/);
});

test('memory repository returns defensive copies',async()=>{
 const repository=new MemoryServicesRepository();const collection={id:'c',name:'Name',service:'Service',version:1,archived:false,entries:[],coverage:[],createdAt:1,updatedAt:1,createdBy:'a',updatedBy:'a'} satisfies ServiceCollection;await repository.insertCollection(collection);const listed=await repository.listCollections();listed[0].name='Changed';assert.equal((await repository.listCollections())[0].name,'Name');
 const feedback={id:'f',version:1,kind:'issue',context:'Context',reason:'Reason',impact:'minor',productGap:false,archived:false,createdAt:1,updatedAt:1,createdBy:'a',updatedBy:'a'} satisfies BetaFeedback;await repository.insertFeedback(feedback);const feedbackList=await repository.listFeedback();feedbackList[0].reason='Changed';assert.equal((await repository.listFeedback())[0].reason,'Reason');
});

test('operation permissions keep planning edits with authors and feedback with operators',()=>{
 assert.equal(servicesPermission('get_dashboard'),'read');
 assert.equal(servicesPermission('record_feedback'),'control');
 assert.equal(servicesPermission('update_collection'),'author');
 assert.equal(servicesPermission('update_feedback'),'author');
});

test('source-change scans return bounded read-only collection matches',async()=>{
 const {manager,repository}=fixture();
 await manager.createCollection({name:'Morning',service:'Morning',entries:[{id:'one',type:'cue',label:'Opening',cueIds:['mah-tovu']},{id:'two',type:'multipart',label:'Conclusion',cueIds:['kaddish','mah-tovu']}],coverage:[]},'editor');
 const matches=await collectionsContainingCueIds(['mah-tovu'],repository);
 assert.equal(matches.length,1);assert.deepEqual(matches[0].matches.map(match=>match.entryId),['one','two']);
 await assert.rejects(()=>collectionsContainingCueIds(Array.from({length:501},(_,index)=>`cue-${index}`),repository),/at most 500/);
});

test('current-library starter groups only complete numbered sets and marks known partial cues for review',async()=>{
 const {manager,catalog}=fixture();
 catalog.cues.splice(0,catalog.cues.length,
  {id:'part-1',name:'Avot — 01 of 02'},
  {id:'part-2',name:'Avot — 02 of 02'},
  {id:'incomplete',name:'Gevarot (Partial)'},
  {id:'single',name:'Kaddish'},
 );
 const value=await manager.createFromLibrary({name:'Starter',service:'Shabbat Morning'},'editor');
 assert.equal(value.entries[0].type,'multipart');assert.deepEqual(value.entries[0].cueIds,['part-1','part-2']);
 assert.equal(value.entries.find(entry=>entry.cueIds.includes('incomplete'))?.type,'cue');
 assert.equal(value.coverage.filter(row=>row.status==='covered').length,3);
 const partial=value.coverage.find(row=>row.cueId==='incomplete');assert.equal(partial?.label,'Gevarot (Partial)');assert.equal(partial?.status,'needs-review');assert.equal(partial?.owner,'Unassigned');
});

test('a graphic still published with the spelled-out incomplete marker is labeled and reviewed as partial',async()=>{
 const {manager,catalog}=fixture();
 catalog.cues.splice(0,catalog.cues.length,{id:'legacy-partial',name:'Gevarot (incomplete)'},{id:'single',name:'Kaddish'});
 const value=await manager.createFromLibrary({name:'Starter',service:'Shabbat Morning'},'editor');
 const partial=value.coverage.find(row=>row.cueId==='legacy-partial');
 assert.equal(partial?.label,'Gevarot (Partial)');assert.equal(partial?.status,'needs-review');
 assert.equal(value.coverage.find(row=>row.cueId==='single')?.status,'covered');
});
test('a names list lives on the collection document, survives unrelated edits, and is purged by archiving',async()=>{
 const {manager,repository}=fixture();
 const created=await manager.createCollection({name:'Friday',service:'Evening',entries:[],coverage:[]},'editor');
 const named=await manager.setNames({id:created.id,expectedVersion:1,names:{title:'Mi Shebeirach',perPanel:4,layout:'left',rows:[{he:'רבקה',en:'Rebecca'},{he:'',en:'Ada'}]}},'editor');
 assert.equal(named.names?.rows.length,2);
 assert.equal(named.names?.updatedBy,'editor');
 // An ordinary edit does not carry a names payload and must not disturb one.
 const renamed=await manager.updateCollection({id:created.id,expectedVersion:named.version,name:'Friday night'},'editor');
 assert.equal(renamed.names?.title,'Mi Shebeirach');
 await assert.rejects(()=>manager.updateCollection({id:created.id,expectedVersion:renamed.version,names:{title:'Sneak'}},'editor'),/unsupported fields: names/);
 const archived=await manager.setCollectionArchived({id:created.id,expectedVersion:renamed.version},'editor',true);
 assert.equal(archived.names,null);
 const restored=await manager.setCollectionArchived({id:created.id,expectedVersion:archived.version},'editor',false);
 assert.equal(restored.names,null,'restoring a service does not resurrect the names that were purged with it');
 assert.equal((await repository.listCollections())[0].names,null);
});

test('names operations are author scoped alongside the other planning edits',()=>{
 assert.equal(servicesPermission('set_names'),'author');
 assert.equal(servicesPermission('clear_names'),'author');
});

test('a version conflict is reported with the code the client refreshes on',()=>{const error=new ServicesConflictError();assert.equal(error.code,'version_conflict');assert.equal(error.status,409)});
