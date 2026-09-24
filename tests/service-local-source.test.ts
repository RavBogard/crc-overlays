import assert from 'node:assert/strict';
import test from 'node:test';

// T2 follow-up: a service coverage row may name a workspace-owned (local:) source, as it names a corpus one.
test('a coverage row can name a local source; an unknown one is still refused',async()=>{
 Object.assign(process.env,{CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development'});for(const key of ['RELAY_URL','VERCEL','DATABASE_URL'])delete process.env[key];
 const [{MemoryAuthoringRepository,createAuthoringService,localSourceRepository},{MemoryServicesRepository,ServicesManager,defaultServiceSources}]=await Promise.all([import('../lib/authoring.ts'),import('../lib/service-collections.ts')]);
 const service=createAuthoringService(new MemoryAuthoringRepository(),undefined,undefined,undefined,undefined,localSourceRepository());
 const added=await service.operation('add_local_source',{name:'For the Gift of Shabbat',book:"Mishkan T'filah",page:176,attribution:"Mishkan T'filah, © CCAR Press",blocks:[{en:'We give thanks for the gift of Shabbat.'}]},'editor') as {source:{id:string}};
 const sourceId=added.source.id;assert.match(sourceId,/^local:/);
 assert.ok((await defaultServiceSources()).some(source=>source.id===sourceId),'local units are among the service sources');
 let id=0;const manager=new ServicesManager(new MemoryServicesRepository(),{catalog:async()=>({cues:[],version:'v1'}),sources:defaultServiceSources,now:()=>1,id:()=>`id-${++id}`,liveCue:async()=>null});
 const created=await manager.createCollection({name:'Friday',service:'Kabbalat Shabbat',entries:[],coverage:[{id:'c1',label:'Gift of Shabbat',status:'needs-cue',sourceId,owner:'Simone',reason:'No graphic yet'}]},'editor');
 assert.equal(created.coverage[0].sourceId,sourceId);
 await assert.rejects(()=>manager.createCollection({name:'Friday 2',service:'Kabbalat Shabbat',entries:[],coverage:[{id:'c2',label:'X',status:'needs-cue',sourceId:'local:nope',owner:'Simone',reason:'x'}]},'editor'),/Source is unavailable: local:nope/);
});
