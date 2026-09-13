// End-to-end check of rehearsal mode (docs/REHEARSAL-MODE.md): opens a fake output
// renderer, publishes a throwaway graphic, shows it, asserts the renderer acknowledged
// it, then animates it out. Runs under tsx:
//   npm run rehearsal:check              attach to work/rehearsal/current.json if it answers, else boot
//   npm run rehearsal:check -- --attach  attach only; fail if nothing is running
//   npm run rehearsal:check -- --boot    always boot a private instance on the default ports
//   npm run rehearsal:check -- --pair    run the CRC -> TBI shared library scenario across a
//                                        paired rehearsal (both state files, or boot a pair)
// Prints `ok <step>` per step, `FAIL <step>: <detail>` and exit 1 on the first failure,
// `REHEARSAL CHECK PASSED` and exit 0 at the end. Keys are never printed.
import {deepStrictEqual} from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PROTOCOL} from '../relay/src/protocol.ts';
import {STATE_FILE,STATE_FILE_TBI,TBI_WORKSPACE_ID,startRehearsal,startRehearsalPair} from './rehearsal.mjs';

const REQUEST_TIMEOUT_MS=5000;
const CONDITION_TIMEOUT_MS=5000;
const SOCKET_TIMEOUT_MS=5000;

class CheckFailure extends Error{}
const fail=message=>{throw new CheckFailure(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function parseArgs(argv){
 let mode='auto',pair=false;
 for(const argument of argv){
  if(argument==='--attach')mode='attach';
  else if(argument==='--boot')mode='boot';
  else if(argument==='--pair')pair=true;
  else fail(`unknown argument ${argument}; supported: --attach, --boot, --pair`);
 }
 return {mode,pair};
}

async function readState(file=STATE_FILE){
 try{return JSON.parse(await readFile(file,'utf8'))}
 catch(error){if(error.code==='ENOENT')return null;throw error}
}
async function answers(baseUrl){
 try{return (await fetch(`${baseUrl}/api/workspace`,{cache:'no-store',signal:AbortSignal.timeout(2000)})).status===200}
 catch{return false}
}

/** Returns {instance, booted}. */
async function resolveInstance(mode){
 if(mode!=='boot'){
  const state=await readState();
  if(state&&await answers(state.baseUrl))return {instance:{...state,stop:async()=>{}},booted:false};
  if(mode==='attach')fail(state?`${state.baseUrl} does not answer; the recorded rehearsal is gone`:`no running rehearsal (${STATE_FILE} is absent); start one with npm run rehearsal`);
 }
 return {instance:await startRehearsal({log:null}),booted:true};
}

function client(instance){
 const request=async(path,{method='GET',body,key=instance.controlKey}={})=>{
  const response=await fetch(`${instance.baseUrl}${path}`,{method,headers:{Authorization:`Bearer ${key}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
  let payload=null;
  try{payload=await response.json()}catch{}
  return {status:response.status,headers:response.headers,body:payload};
 };
 const expect=async(path,options,expected=200)=>{
  const result=await request(path,options);
  assert(result.status===expected,`${options?.method??'GET'} ${path} returned ${result.status}${result.body?.error?` (${result.body.error})`:''}`);
  return result.body;
 };
 const authoring=(operation,input)=>expect('/api/authoring',{method:'POST',body:{operation,input}});
 const until=async(describe,predicate)=>{
  const deadline=Date.now()+CONDITION_TIMEOUT_MS;
  let last=null;
  while(Date.now()<deadline){
   last=await expect('/api/state');
   if(predicate(last))return last;
   await sleep(100);
  }
  fail(`${describe} not observed within ${CONDITION_TIMEOUT_MS/1000} s (cue=${last?.cue??'?'} revision=${last?.revision??'?'} renderers=${last?.renderers?.length??'?'})`);
 };
 return {request,expect,authoring,until};
}

/** Minimal output renderer: hello, then a settled ack for every snapshot it receives. */
class FakeRenderer{
 constructor({url,ticket,heartbeatMs}){
  this.id=randomUUID();
  this.url=url;this.ticket=ticket;this.heartbeatMs=heartbeatMs;
  this.snapshot=null;this.acked=0;this.closeCode=null;this.socket=null;this.timer=null;
 }
 async open(){
  const socket=new WebSocket(this.url,[PROTOCOL,`ticket.${this.ticket}`]);
  this.socket=socket;
  let firstSnapshot;
  const gotSnapshot=new Promise(resolve=>{firstSnapshot=resolve});
  socket.addEventListener('message',event=>{
   let frame;try{frame=JSON.parse(String(event.data))}catch{return}
   if(frame.type!=='snapshot'||!frame.snapshot)return;
   this.snapshot=frame.snapshot;
   this.ack();
   firstSnapshot(frame.snapshot);
  });
  socket.addEventListener('close',event=>{this.closeCode=event.code});
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new CheckFailure('output socket did not open within 5 s')),SOCKET_TIMEOUT_MS);
   socket.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
   socket.addEventListener('error',()=>{clearTimeout(timer);reject(new CheckFailure('output socket was refused'))},{once:true});
  });
  assert(socket.protocol===PROTOCOL,`relay selected subprotocol "${socket.protocol}" instead of ${PROTOCOL}`);
  this.send({type:'hello',id:this.id});
  const snapshot=await Promise.race([gotSnapshot,sleep(SOCKET_TIMEOUT_MS).then(()=>null)]);
  assert(snapshot,`no snapshot within 5 s${this.closeCode?` (socket closed ${this.closeCode})`:''}`);
  this.timer=setInterval(()=>this.send({type:'heartbeat'}),this.heartbeatMs);
  this.timer.unref();
  return snapshot;
 }
 send(message){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message))}
 ack(){
  if(!this.snapshot)return;
  this.send({type:'ack',id:this.id,revision:this.snapshot.revision,cue:this.snapshot.cue,phase:'settled'});
  this.acked+=1;
 }
 close(){
  if(this.timer)clearInterval(this.timer);
  if(this.socket&&(this.socket.readyState===WebSocket.OPEN||this.socket.readyState===WebSocket.CONNECTING))this.socket.close(1000,'check complete');
 }
}

const rendererFor=(state,id)=>Array.isArray(state?.renderers)?state.renderers.find(renderer=>renderer.id===id)??null:null;

async function run(instance,booted){
 const api=client(instance);
 let renderer=null;
 const steps=[];
 const step=async(name,work)=>{
  try{const detail=await work();console.log(`ok ${name}${detail?` (${detail})`:''}`);steps.push(name)}
  catch(error){console.log(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`);throw error}
 };
 try{
  await step('health',async()=>{
   const health=await api.expect('/api/health');
   assert(health.authoring?.databaseBytes===0,`authoring.databaseBytes is ${health.authoring?.databaseBytes} (expected 0: rehearsal must not touch Postgres)`);
   assert(health.playback?.relay?.status==='available',`relay probe is ${health.playback?.relay?.status}`);
   assert(health.synchronization?.status==='current',`synchronization is ${health.synchronization?.status}`);
   return `overall ${health.overall}`;
  });
  await step('output renderer',async()=>{
   const connection=await api.expect('/api/realtime?role=output',{key:instance.outputKey});
   assert(typeof connection.url==='string'&&typeof connection.ticket==='string',`/api/realtime did not return url and ticket`);
   renderer=new FakeRenderer(connection);
   const snapshot=await renderer.open();
   return `snapshot revision ${snapshot.revision}, heartbeat ${connection.heartbeatMs} ms`;
  });
  await step('renderer presence',async()=>{
   const state=await api.until('acknowledged renderer in /api/state',current=>rendererFor(current,renderer.id)!==null);
   if(booted)assert(state.renderers.length===1,`expected exactly 1 renderer on a fresh instance, saw ${state.renderers.length}`);
   return `${state.renderers.length} renderer${state.renderers.length===1?'':'s'}`;
  });
  let cueId=null;
  await step('publish graphic',async()=>{
   const catalog=await api.expect('/api/catalog');
   assert(Array.isArray(catalog)&&catalog.length,'catalog is empty');
   const template=catalog.find(cue=>cue.layout==='bottom'&&!cue.hidden&&!cue.authoring);
   assert(template,'no baseline graphic with layout bottom in the live catalog');
   const stamp=new Date().toISOString().slice(11,19).replace(/:/g,'');
   const name=`Rehearsal check ${stamp}`;
   const {draft}=await api.authoring('create_draft',{name,title:'Rehearsal check',layout:'bottom',templateCueId:template.id,content:{mode:'custom',text:`Rehearsal check ${stamp} — this graphic was published by npm run rehearsal:check.`},presentation:{}});
   assert(typeof draft?.id==='string'&&Number.isInteger(draft.version),'create_draft returned no draft');
   const preview=await api.authoring('preview_draft',{draftId:draft.id,expectedVersion:draft.version});
   assert(typeof preview.previewId==='string','preview_draft returned no previewId');
   assert(preview.validation?.valid!==false,`preview validation failed: ${JSON.stringify(preview.validation?.errors??preview.validation)}`);
   await api.authoring('review_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId,humanApproved:true,browserMeasurement:{viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'rehearsal-check',measuredAt:Date.now()}});
   const published=await api.authoring('publish_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId});
   assert(published.cue?.id===draft.id,'publish_draft did not return the published graphic');
   assert(!published.liveRefreshPending,'publication did not reach the relay catalog (liveRefreshPending)');
   const live=await api.expect('/api/catalog');
   assert(live.some(cue=>cue.id===draft.id),'published graphic is missing from the live catalog');
   cueId=draft.id;
   return `${name} as ${cueId}`;
  });
  await step('show graphic',async()=>{
   const response=await api.expect('/api/command',{method:'POST',body:{commandId:randomUUID(),clientId:null,sequence:null,action:'in',cue:cueId}});
   assert(response.cue===cueId,`command in returned graphic ${response.cue}`);
   const state=await api.until('graphic on air with renderer ack',current=>current.cue===cueId&&rendererFor(current,renderer.id)?.revision===current.revision);
   return `revision ${state.revision} acknowledged`;
  });
  await step('animate out graphic',async()=>{
   const response=await api.expect('/api/command',{method:'POST',body:{commandId:randomUUID(),clientId:null,sequence:null,action:'out',cue:cueId}});
   assert(response.cue===null,`command out left graphic ${response.cue}`);
   const state=await api.until('output animated out with renderer ack',current=>current.cue===null&&rendererFor(current,renderer.id)?.revision===current.revision);
   return `revision ${state.revision} acknowledged`;
  });
  console.log('REHEARSAL CHECK PASSED');
  return 0;
 }catch(error){
  if(!(error instanceof CheckFailure)&&!steps.length&&error?.exitCode===undefined)console.log(error?.stack??error);
  return 1;
 }finally{
  renderer?.close();
 }
}

/** Returns {pair, booted}. Attaching needs both state files to answer. */
async function resolvePair(mode){
 if(mode!=='boot'){
  const [crc,tbi]=await Promise.all([readState(STATE_FILE),readState(STATE_FILE_TBI)]);
  if(crc&&tbi&&await answers(crc.baseUrl)&&await answers(tbi.baseUrl))
   return {pair:{crc:{...crc,stop:async()=>{}},tbi:{...tbi,stop:async()=>{}},stop:async()=>{}},booted:false};
  if(mode==='attach')fail(crc&&tbi?'the recorded paired rehearsal does not answer any more':`no running paired rehearsal (${STATE_FILE_TBI} is absent); start one with npm run rehearsal -- --pair`);
 }
 return {pair:await startRehearsalPair({log:null}),booted:true};
}

const sameDocument=(actual,expected,message)=>{try{deepStrictEqual(actual,expected)}catch{fail(message)}};

/** create -> preview -> review -> publish, the way docs/REHEARSAL-MODE.md documents it. */
async function publishDraft(api,draft){
 const preview=await api.authoring('preview_draft',{draftId:draft.id,expectedVersion:draft.version});
 assert(typeof preview.previewId==='string','preview_draft returned no previewId');
 assert(preview.validation?.valid!==false,`preview validation failed: ${JSON.stringify(preview.validation?.errors??preview.validation)}`);
 await api.authoring('review_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId,humanApproved:true,browserMeasurement:{viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'rehearsal-check',measuredAt:Date.now()}});
 const published=await api.authoring('publish_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId});
 assert(published.cue?.id===draft.id,'publish_draft did not return the published graphic');
 assert(!published.liveRefreshPending,'publication did not reach the relay catalog (liveRefreshPending)');
 return published;
}

/**
 * The paired scenario: CRC publishes, TBI sees it, copies it, edits its copy; CRC changes the
 * wording and republishes; TBI is told the source moved on and its own copy is left alone.
 * Never hashes a cue here: cueHash always comes from what TBI actually read.
 */
async function runPair(pair){
 const crc=client(pair.crc),tbi=client(pair.tbi);
 const steps=[];
 const step=async(name,work)=>{
  try{const detail=await work();console.log(`ok ${name}${detail?` (${detail})`:''}`);steps.push(name)}
  catch(error){console.log(`FAIL ${name}: ${error instanceof Error?error.message:String(error)}`);throw error}
 };
 const sharedEntry=async cueId=>{
  const library=await tbi.authoring('list_shared_library',{refresh:true});
  assert(library.available,`TBI cannot read the CRC library (${library.error??'unavailable'})`);
  const entry=library.cues.find(cue=>cue.id===cueId);
  assert(entry,`${cueId} is not among the ${library.cues.length} graphics TBI can see`);
  return entry;
 };
 const stamp=new Date().toISOString().slice(11,19).replace(/:/g,'');
 let cueId=null,cueHash=null,crcDraft=null,tbiDraftId=null,tbiDocument=null;
 try{
  await step('paired workspaces',async()=>{
   const [here,there]=await Promise.all([crc.expect('/api/workspace'),tbi.expect('/api/workspace')]);
   assert(here.id&&there.id&&here.id!==there.id,`both instances report workspace ${here.id}`);
   assert(there.id===TBI_WORKSPACE_ID,`the second instance is ${there.id}, not ${TBI_WORKSPACE_ID}`);
   return `${here.id} + ${there.id}`;
  });
  await step('crc publishes a graphic',async()=>{
   const catalog=await crc.expect('/api/catalog');
   assert(Array.isArray(catalog)&&catalog.length,'CRC catalog is empty');
   const template=catalog.find(cue=>cue.layout==='bottom'&&!cue.hidden&&!cue.authoring);
   assert(template,'no baseline graphic with layout bottom in the CRC live catalog');
   const {draft}=await crc.authoring('create_draft',{name:`Shared library check ${stamp}`,title:'Shared library check',layout:'bottom',templateCueId:template.id,content:{mode:'custom',text:`Shared library check ${stamp} — published by npm run rehearsal:check -- --pair.`},presentation:{}});
   assert(typeof draft?.id==='string'&&Number.isInteger(draft.version),'create_draft returned no draft');
   await publishDraft(crc,draft);
   crcDraft=draft;cueId=draft.id;
   return cueId;
  });
  await step('tbi lists it as new',async()=>{
   const entry=await sharedEntry(cueId);
   assert(entry.state==='new',`TBI reports state ${entry.state} for a graphic it has never copied`);
   assert(typeof entry.cueHash==='string'&&/^[a-f0-9]{64}$/.test(entry.cueHash),`TBI reported cueHash ${entry.cueHash}`);
   cueHash=entry.cueHash;
   return `state ${entry.state}`;
  });
  await step('tbi customizes it',async()=>{
   const {draft}=await tbi.authoring('customize_shared_cue',{cueId,expectedCueHash:cueHash});
   assert(typeof draft?.id==='string','customize_shared_cue returned no draft');
   const {draft:renamed}=await tbi.authoring('update_draft',{draftId:draft.id,expectedVersion:draft.version,patch:{title:`TBI wording ${stamp}`}});
   assert(renamed.title===`TBI wording ${stamp}`,`TBI draft title is ${renamed.title}`);
   tbiDraftId=draft.id;
   tbiDocument=(await tbi.authoring('get_draft',{draftId:tbiDraftId})).draft;
   return `draft ${tbiDraftId} v${renamed.version}`;
  });
  await step('crc changes the wording and republishes',async()=>{
   const {draft}=await crc.authoring('update_draft',{draftId:cueId,expectedVersion:crcDraft.version,patch:{content:{mode:'custom',text:`Shared library check ${stamp} — CRC rewrote this line after TBI copied it.`}}});
   await publishDraft(crc,draft);
   crcDraft=draft;
   return `v${draft.version}`;
  });
  await step('tbi sees the update without losing its copy',async()=>{
   const entry=await sharedEntry(cueId);
   assert(entry.state==='updated',`TBI reports state ${entry.state} after CRC republished`);
   assert(entry.cueHash!==cueHash,'the CRC library still reports the pre-update cueHash');
   cueHash=entry.cueHash;
   const current=(await tbi.authoring('get_draft',{draftId:tbiDraftId})).draft;
   sameDocument(current,tbiDocument,`the TBI draft changed when CRC republished (version ${current?.version} was ${tbiDocument?.version})`);
   return `state ${entry.state}, TBI draft untouched`;
  });
  await step('tbi compares its copy with crc',async()=>{
   const comparison=await tbi.authoring('compare_shared_cue',{cueId,draftId:tbiDraftId});
   assert(comparison.beforeAvailable===true,'compare_shared_cue has no record of the wording TBI copied');
   assert(comparison.changed?.wording===true,`compare_shared_cue reports changed ${JSON.stringify(comparison.changed)}`);
   return 'wording changed';
  });
  await step('a second copy is a second draft',async()=>{
   const {draft}=await tbi.authoring('customize_shared_cue',{cueId,expectedCueHash:cueHash});
   assert(typeof draft?.id==='string','the second customize_shared_cue returned no draft');
   assert(draft.id!==tbiDraftId,'the second copy reused the first draft');
   return `${draft.id} alongside ${tbiDraftId}`;
  });
  console.log('PAIRED REHEARSAL CHECK PASSED');
  return 0;
 }catch(error){
  if(!(error instanceof CheckFailure)&&!steps.length&&error?.exitCode===undefined)console.log(error?.stack??error);
  return 1;
 }
}

async function main(){
 let mode,pair;
 try{({mode,pair}=parseArgs(process.argv.slice(2)))}catch(error){console.log(`FAIL arguments: ${error.message}`);return 1}
 if(pair){
  let resolvedPair;
  try{resolvedPair=await resolvePair(mode)}
  catch(error){console.log(`FAIL ${mode==='attach'?'attach':'boot'}: ${error instanceof Error?error.message:String(error)}`);return 1}
  const {crc,tbi}=resolvedPair.pair;
  console.log(resolvedPair.booted?`booted a private paired rehearsal at ${crc.baseUrl} (CRC) and ${tbi.baseUrl} (TBI)`:`attached to the paired rehearsal at ${crc.baseUrl} (CRC) and ${tbi.baseUrl} (TBI)`);
  try{return await runPair(resolvedPair.pair)}
  finally{if(resolvedPair.booted)await resolvedPair.pair.stop()}
 }
 let resolved;
 try{resolved=await resolveInstance(mode)}
 catch(error){console.log(`FAIL ${mode==='attach'?'attach':'boot'}: ${error instanceof Error?error.message:String(error)}`);return 1}
 console.log(resolved.booted?`booted a private rehearsal at ${resolved.instance.baseUrl}`:`attached to the rehearsal at ${resolved.instance.baseUrl}`);
 try{return await run(resolved.instance,resolved.booted)}
 finally{if(resolved.booted)await resolved.instance.stop()}
}

process.exitCode=await main();
