import assert from 'node:assert/strict';
import test from 'node:test';
import {GET as sharedLibraryGET} from '../app/api/shared-library/route.ts';
import {baselineCues} from '../lib/authoring-model.ts';
import {SHARED_LIBRARY_MAX_BYTES,SharedLibraryClient,TBI_WORKSPACE_ID,buildSharedLibraryPayload} from '../lib/shared-library.ts';

const EXPORT_KEY='export_'.padEnd(43,'e');
const IMPORT_KEY='import_'.padEnd(43,'i');
const envNames=['WORKSPACE_ID','SHARED_LIBRARY_EXPORT_KEY','SHARED_LIBRARY_IMPORT_KEY','CRC_SHARED_LIBRARY_URL','CONTROL_KEY','OUTPUT_KEY','ACCESS_BOOTSTRAP_KEY','CRC_AUTHORING_REHEARSAL','NODE_ENV','RELAY_URL','VERCEL'] as const;

async function withEnvironment(values:Partial<Record<(typeof envNames)[number],string|undefined>>,run:()=>Promise<void>){
 const before=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
 try{for(const name of envNames){const value=values[name];if(value===undefined)Reflect.deleteProperty(process.env,name);else Reflect.set(process.env,name,value)}await run()}
 finally{for(const name of envNames){const value=before[name];if(value===undefined)Reflect.deleteProperty(process.env,name);else Reflect.set(process.env,name,value)}}
}

test('shared export denies every non-CRC workspace before loading catalog data',async()=>{
 await withEnvironment({WORKSPACE_ID:TBI_WORKSPACE_ID,SHARED_LIBRARY_EXPORT_KEY:EXPORT_KEY},async()=>{
  const response=await sharedLibraryGET(new Request('https://tbi.example.test/api/shared-library',{headers:{Authorization:`Bearer ${EXPORT_KEY}`}}));assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'Not found'});
 });
});

test('shared export rejects playback, output, and bootstrap secrets and accepts only its dedicated key',async()=>{
 await withEnvironment({WORKSPACE_ID:'crc',SHARED_LIBRARY_EXPORT_KEY:EXPORT_KEY,CONTROL_KEY:'control_'.padEnd(43,'c'),OUTPUT_KEY:'output_'.padEnd(43,'o'),ACCESS_BOOTSTRAP_KEY:'bootstrap_'.padEnd(43,'b'),CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development'},async()=>{
  for(const key of [process.env.CONTROL_KEY!,process.env.OUTPUT_KEY!,process.env.ACCESS_BOOTSTRAP_KEY!])assert.equal((await sharedLibraryGET(new Request('https://crc.example.test/api/shared-library',{headers:{Authorization:`Bearer ${key}`}}))).status,401);
  const accepted=await sharedLibraryGET(new Request('https://crc.example.test/api/shared-library',{headers:{Authorization:`Bearer ${EXPORT_KEY}`}}));assert.equal(accepted.status,200);const text=await accepted.text();assert.match(text,/"sourceWorkspace":"crc"/);assert.doesNotMatch(text,new RegExp(EXPORT_KEY));
 });
 await withEnvironment({WORKSPACE_ID:'crc',SHARED_LIBRARY_EXPORT_KEY:EXPORT_KEY,CONTROL_KEY:EXPORT_KEY},async()=>{assert.equal((await sharedLibraryGET(new Request('https://crc.example.test/api/shared-library',{headers:{Authorization:`Bearer ${EXPORT_KEY}`}}))).status,503)});
});

test('shared import is TBI-only and refuses a key reused from another privilege',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:500})};
 const wrongWorkspace=new SharedLibraryClient({WORKSPACE_ID:'crc',CRC_SHARED_LIBRARY_URL:'https://crc.example.test/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:IMPORT_KEY},fetcher as typeof fetch);assert.equal((await wrongWorkspace.get()).configured,false);
 const reused=new SharedLibraryClient({WORKSPACE_ID:TBI_WORKSPACE_ID,CRC_SHARED_LIBRARY_URL:'https://crc.example.test/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:IMPORT_KEY,CONTROL_KEY:IMPORT_KEY},fetcher as typeof fetch);assert.equal((await reused.get()).configured,false);assert.equal(calls,0);
});

test('shared import enforces its byte limit before parsing an oversized response',async()=>{
 const fetcher=async()=>new Response('{}',{status:200,headers:{'content-length':String(SHARED_LIBRARY_MAX_BYTES+1)}});
 const client=new SharedLibraryClient({WORKSPACE_ID:TBI_WORKSPACE_ID,CRC_SHARED_LIBRARY_URL:'https://crc.example.test/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:IMPORT_KEY},fetcher as typeof fetch);const result=await client.get();assert.equal(result.available,false);assert.equal(result.configured,true);if(!result.available)assert.equal(result.error,'CRC library is temporarily unavailable.');
});

test('redirects and failures never move the import secret and fall back only to last-good data',async()=>{
 const payload=buildSharedLibraryPayload({cues:baselineCues,version:'security-review'});let calls=0;const observations:Array<{url:string;authorization:string|null;redirect:RequestRedirect|undefined}>=[];
 const fetcher=async(input:URL|RequestInfo,init?:RequestInit)=>{calls++;observations.push({url:String(input),authorization:new Headers(init?.headers).get('authorization'),redirect:init?.redirect});return calls===1?Response.json(payload):new Response(null,{status:302,headers:{location:'https://attacker.example.test/collect'}})};
 const client=new SharedLibraryClient({WORKSPACE_ID:TBI_WORKSPACE_ID,CRC_SHARED_LIBRARY_URL:'https://crc.example.test/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:IMPORT_KEY},fetcher as typeof fetch);const fresh=await client.get();assert.equal(fresh.available,true);const stale=await client.get(true);assert.equal(stale.available,true);if(stale.available)assert.equal(stale.stale,true);assert.deepEqual(observations.map(item=>item.url),['https://crc.example.test/api/shared-library','https://crc.example.test/api/shared-library']);assert.ok(observations.every(item=>item.authorization===`Bearer ${IMPORT_KEY}`&&item.redirect==='error'));
 const coldFailure=new SharedLibraryClient({WORKSPACE_ID:TBI_WORKSPACE_ID,CRC_SHARED_LIBRARY_URL:'https://crc.example.test/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:IMPORT_KEY},(async()=>new Response(null,{status:503})) as typeof fetch);assert.equal((await coldFailure.get()).available,false);
});
