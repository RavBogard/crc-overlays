import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GET,PUT} from '../app/api/setup-progress/route.ts';
import {accessStore,tokenHash,type AccessSessionMember,type AccessStore} from '../lib/access.ts';
import {
 MAX_SETUP_STEPS,
 MemorySetupProgressStore,
 SetupProgressError,
 mergeSetupSteps,
 parseSetupSteps,
 readStoredSteps,
 setupProgressStore,
 type SetupProgressStore,
} from '../lib/setup-progress.ts';

const validToken='a'.repeat(43);
const member:AccessSessionMember={id:'member-1',email:'installer@example.test',name:'Installer',role:'editor',enabled:true,authMethod:'password',authenticatedAt:Date.now()};

async function withSession<T>(session:AccessSessionMember|null,run:()=>Promise<T>){
 const saved=accessStore.memberForSession;
 (accessStore as AccessStore).memberForSession=async(hash:string)=>hash===tokenHash(validToken)?session:null;
 try{return await run()}finally{(accessStore as AccessStore).memberForSession=saved}
}

async function withStore<T>(store:SetupProgressStore,run:()=>Promise<T>){
 const saved={get:setupProgressStore.get,set:setupProgressStore.set};
 Object.assign(setupProgressStore,{get:store.get.bind(store),set:store.set.bind(store)});
 try{return await run()}finally{Object.assign(setupProgressStore,saved)}
}

const request=(method:'GET'|'PUT',body?:unknown,{cookie=true,origin='https://graphics.test',bearer=''}={})=>new Request('https://graphics.test/api/setup-progress',{
 method,
 headers:{
  ...(cookie?{Cookie:`crc_access=${validToken}`}:{}),
  ...(bearer?{Authorization:`Bearer ${bearer}`}:{}),
  ...(method==='PUT'?{Origin:origin,'Content-Type':'application/json'}:{}),
 },
 ...(body===undefined?{}:{body:JSON.stringify(body)}),
});

test('step records accept only bounded boolean steps under safe names',()=>{
 assert.deepEqual(parseSetupSteps({'output-url':true,'companion-module':false}),{'output-url':true,'companion-module':false});
 assert.deepEqual(parseSetupSteps({}),{});
 assert.throws(()=>parseSetupSteps(null),SetupProgressError);
 assert.throws(()=>parseSetupSteps([]),SetupProgressError);
 assert.throws(()=>parseSetupSteps({'Output-URL':true}),/not recognized/);
 assert.throws(()=>parseSetupSteps({'1step':true}),/not recognized/);
 assert.throws(()=>parseSetupSteps({['a'.repeat(42)]:true}),/not recognized/);
 assert.throws(()=>parseSetupSteps({step:'yes'}),/true or false/);
 assert.throws(()=>parseSetupSteps(Object.fromEntries(Array.from({length:MAX_SETUP_STEPS+1},(_,index)=>[`step-${index}`,true]))),/at most 32 steps/);
});

test('merging keeps earlier steps and refuses to grow past the bound',()=>{
 assert.deepEqual(mergeSetupSteps({'output-url':true},{'companion-module':true}),{'output-url':true,'companion-module':true});
 assert.deepEqual(mergeSetupSteps({'output-url':true},{'output-url':false}),{'output-url':false});
 const full=Object.fromEntries(Array.from({length:MAX_SETUP_STEPS},(_,index)=>[`step-${index}`,true]));
 assert.throws(()=>mergeSetupSteps(full,{'one-more':true}),/at most 32 steps/);
 assert.deepEqual(mergeSetupSteps(full,{'step-0':false})['step-0'],false);
});

test('stored records are read defensively rather than trusted',()=>{
 assert.deepEqual(readStoredSteps({'output-url':true,BAD:true,other:'yes'}),{'output-url':true});
 assert.deepEqual(readStoredSteps(null),{});
 assert.deepEqual(readStoredSteps('{}'),{});
});

test('the memory store isolates members and returns copies',async()=>{
 const store=new MemorySetupProgressStore();
 assert.deepEqual(await store.get('member-1'),{});
 await store.set('member-1',{'output-url':true},1000);
 await store.set('member-2',{'companion-module':true},1000);
 assert.deepEqual(await store.get('member-1'),{'output-url':true});
 assert.deepEqual(await store.get('member-2'),{'companion-module':true});
 const read=await store.get('member-1');read['output-url']=false;
 assert.deepEqual(await store.get('member-1'),{'output-url':true});
});

test('an unauthenticated caller is asked to sign in rather than shown a shared checklist',async()=>{
 await withSession(null,async()=>{
  const read=await GET(request('GET'));assert.equal(read.status,401);
  const write=await PUT(request('PUT',{steps:{'output-url':true}}));assert.equal(write.status,401);
 });
});

test('setup progress round-trips for the signed-in member and merges later saves',async()=>{
 const store=new MemorySetupProgressStore();
 await withStore(store,()=>withSession(member,async()=>{
  assert.deepEqual(await (await GET(request('GET'))).json(),{steps:{},persisted:true});
  const first=await PUT(request('PUT',{steps:{'output-url':true}}));
  assert.equal(first.status,200);
  assert.deepEqual(await first.json(),{steps:{'output-url':true},persisted:true});
  const second=await PUT(request('PUT',{steps:{'companion-module':true}}));
  assert.deepEqual(await second.json(),{steps:{'output-url':true,'companion-module':true},persisted:true});
  assert.deepEqual(await (await GET(request('GET'))).json(),{steps:{'output-url':true,'companion-module':true},persisted:true});
  assert.deepEqual(await store.get('member-1'),{'output-url':true,'companion-module':true});
 }));
});

test('progress is per member, never shared between two installers',async()=>{
 const store=new MemorySetupProgressStore();
 const other:AccessSessionMember={...member,id:'member-2',email:'other@example.test',name:'Other'};
 await withStore(store,async()=>{
  await withSession(member,async()=>{await PUT(request('PUT',{steps:{'output-url':true}}))});
  await withSession(other,async()=>{assert.deepEqual(await (await GET(request('GET'))).json(),{steps:{},persisted:true})});
 });
});

test('a legacy device key is told its progress is not persisted instead of borrowing a member row',async()=>{
 const store=new MemorySetupProgressStore();
 const key='c'.repeat(43);const saved=process.env.CONTROL_KEY;process.env.CONTROL_KEY=key;
 try{
  await withStore(store,()=>withSession(null,async()=>{
   const read=await GET(request('GET',undefined,{cookie:false,bearer:key}));
   assert.deepEqual(await read.json(),{steps:{},persisted:false});
   const write=await PUT(request('PUT',{steps:{'output-url':true}},{cookie:false,bearer:key}));
   assert.deepEqual(await write.json(),{steps:{'output-url':true},persisted:false});
   assert.equal(store.rows.size,0);
  }));
 }finally{if(saved===undefined)delete process.env.CONTROL_KEY;else process.env.CONTROL_KEY=saved}
});

test('writes are same-site only and reject malformed or unsupported bodies',async()=>{
 await withStore(new MemorySetupProgressStore(),()=>withSession(member,async()=>{
  assert.equal((await PUT(request('PUT',{steps:{}},{origin:'https://elsewhere.test'}))).status,403);
  assert.equal((await PUT(request('PUT',{steps:{'Output-URL':true}}))).status,400);
  assert.equal((await PUT(request('PUT',{steps:{}, extra:1}))).status,400);
  assert.equal((await PUT(request('PUT',['steps']))).status,400);
  assert.equal((await PUT(new Request('https://graphics.test/api/setup-progress',{method:'PUT',headers:{Cookie:`crc_access=${validToken}`,Origin:'https://graphics.test','Content-Type':'application/json'},body:'not json'}))).status,400);
 }));
});

test('a storage failure reports unavailability instead of claiming an empty checklist',async()=>{
 const failing:SetupProgressStore={async get(){throw new Error('database unavailable')},async set(){throw new Error('database unavailable')}};
 await withStore(failing,()=>withSession(member,async()=>{
  const read=await GET(request('GET'));assert.equal(read.status,503);
  assert.equal(Object.hasOwn(await read.json(),'steps'),false);
  assert.equal((await PUT(request('PUT',{steps:{'output-url':true}}))).status,503);
 }));
});
