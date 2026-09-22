// The server fit check's per-check scratch directory: the browser's TMPDIR and HOME, released
// only after the browser is closed, on every path - including the mid-measure crash production
// hit on 2026-09-22 (checks 11 and 12, phase `measure`, "Target page, context or browser has
// been closed" while Chromium reported 23 MB and then 15 MB of /tmp free).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultScratchHost,measureCueOnServer,sharedExtraction,type ScratchHost,type StageBrowser,type StageLauncher,type StageMeasurement,type StagePage} from '../lib/server-fit.ts';
import type {Cue} from '../lib/player.ts';

const ORIGIN='https://crc-overlays.example';
const CUE={id:'cue-1',name:'Barechu',title:'Barechu',layout:'bottom',texts:{}} as unknown as Cue;
const CLEAN:StageMeasurement={fitErrors:[],warnings:[],fill:0.6,artwork:'none'};

/** A host that records the order of every lifecycle event against the browser's own. */
function recordingHost(events:string[],overrides:Partial<ScratchHost>={}):ScratchHost{
 return {
  async make(){events.push('make');return '/scratch/check-1'},
  async remove(dir){events.push(`remove ${dir}`)},
  async bytes(){return 0},
  async free(){return 40*1024*1024},
  async survivors(){events.push('survivors');return []},
  kill(pid){events.push(`kill ${pid}`)},
  ...overrides,
 };
}

function stage(evaluate:()=>Promise<unknown>):StagePage{
 return {
  async setViewportSize(){},
  async goto(){return null},
  async waitForFunction(){return true},
  async evaluate<Result>(){return await evaluate() as Result},
 };
}

function launcher(events:string[],evaluate:()=>Promise<unknown>,seen:{scratch?:string}={}):StageLauncher{
 return async scratch=>{
  seen.scratch=scratch;
  events.push('launch');
  return {async newPage(){return stage(evaluate)},async close(){events.push('close');return null}} satisfies StageBrowser;
 };
}

/** Collects console output for the duration of `run`, so a test can read the log line. */
async function capture<T>(run:()=>Promise<T>){
 const errors:unknown[][]=[],warnings:unknown[][]=[];
 const {error,warn}=console;
 console.error=(...args:unknown[])=>{errors.push(args)};
 console.warn=(...args:unknown[])=>{warnings.push(args)};
 try{return {result:await run(),errors,warnings}}finally{console.error=error;console.warn=warn}
}

test('the launcher is handed this check\'s own scratch directory, released after the browser closes',async()=>{
 const events:string[]=[],seen:{scratch?:string}={};
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host:recordingHost(events),launch:launcher(events,async()=>CLEAN,seen)}));
 assert.equal(result.verdict,'pass');
 assert.equal(seen.scratch,'/scratch/check-1');
 assert.deepEqual(events,['make','launch','close','survivors','remove /scratch/check-1']);
 assert.equal(warnings.length,0,'a clean release is not worth a log line');
});

test('the mid-measure crash is unavailable, never a pass, and its scratch is still released',async()=>{
 // The production failure: the renderer dies under page.evaluate. It stays `stage_unavailable`
 // - the reason the caller already maps to "open Fit check" - and nothing is retried.
 const events:string[]=[];
 let evaluations=0;
 const crash=async()=>{evaluations++;throw Error('page.evaluate: Target page, context or browser has been closed')};
 const {result,errors}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host:recordingHost(events),launch:launcher(events,crash)}));
 assert.deepEqual(result,{verdict:'unavailable',reason:'stage_unavailable'});
 assert.equal(evaluations,1,'a crash is reported, not retried');
 assert.deepEqual(events,['make','launch','close','survivors','remove /scratch/check-1']);
 const logged=errors[0]?.[1] as {phase?:string;tmpFreeBefore?:number|null;tmpFreeNow?:number|null};
 assert.equal(errors[0]?.[0],'server-fit unavailable');
 assert.equal(logged.phase,'measure');
 assert.equal(logged.tmpFreeBefore,40*1024*1024,'the log says how much /tmp there was');
 assert.equal(logged.tmpFreeNow,40*1024*1024);
});

test('a process that outlived close() is killed and the residue is logged',async()=>{
 // A Chromium that survives close() keeps its deleted shared-memory files - and their /tmp
 // space - alive, where removing the directory cannot reach them.
 const events:string[]=[];
 const host=recordingHost(events,{async survivors(){events.push('survivors');return [4101,4102]},async bytes(){return 1234}});
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host,launch:launcher(events,async()=>CLEAN)}));
 assert.equal(result.verdict,'pass','cleanup never changes a verdict');
 assert.deepEqual(events,['make','launch','close','survivors','kill 4101','kill 4102','remove /scratch/check-1']);
 assert.equal(warnings[0]?.[0],'server-fit scratch residue');
 assert.deepEqual({...(warnings[0]?.[1] as object),tmpFreeAfter:undefined},{survivors:2,leftBytes:1234,tmpFreeAfter:undefined});
});

test('a late launch releases its scratch only once it has landed and been closed',async()=>{
 const events:string[]=[];
 let released:()=>void;
 const wasReleased=new Promise<void>(resolve=>{released=resolve});
 const host=recordingHost(events,{async remove(dir){events.push(`remove ${dir}`);released()}});
 const inner=launcher(events,async()=>CLEAN);
 const launch:StageLauncher=scratch=>new Promise<StageBrowser>(resolve=>{setTimeout(()=>resolve(inner(scratch)),60)});
 const started=Date.now();
 const {result}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,deadlineMs:10,host,launch}));
 assert.deepEqual(result,{verdict:'unavailable',reason:'deadline_exceeded'});
 assert.ok(Date.now()-started<50,'the deadline still returns without waiting for the late launch');
 assert.deepEqual(events,['make'],'the directory is not removed while a browser may still be arriving');
 await wasReleased;
 assert.deepEqual(events,['make','launch','close','survivors','remove /scratch/check-1']);
});

test('a scratch directory that cannot be made is unavailable, and nothing launches',async()=>{
 const events:string[]=[];
 const host=recordingHost(events,{async make(){throw Error('ENOSPC: no space left on device')}});
 const {result}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host,launch:launcher(events,async()=>CLEAN)}));
 assert.deepEqual(result,{verdict:'unavailable',reason:'browser_unavailable'});
 assert.deepEqual(events,[]);
});

test('the real host removes everything the browser wrote into its scratch directory',async()=>{
 let written:string|undefined;
 const launch:StageLauncher=async scratch=>{
  // What Chromium leaves there: a shared-memory file, a cache under HOME.
  writeFileSync(join(scratch,'.org.chromium.Chromium.abc123'),Buffer.alloc(64*1024));
  written=scratch;
  return {async newPage(){return stage(async()=>CLEAN)},async close(){return null}} satisfies StageBrowser;
 };
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,launch}));
 assert.equal(result.verdict,'pass');
 assert.ok(written&&written.startsWith(join(tmpdir(),'server-fit-')),'scratch lives under the temp directory');
 assert.equal(existsSync(written!),false,'the scratch directory is gone');
 assert.equal(warnings[0]?.[0],'server-fit scratch residue','what was left behind is logged');
 assert.equal((warnings[0]?.[1] as {leftBytes:number}).leftBytes,64*1024);
});

test('the real host reports free space in the temp directory',async()=>{
 const free=await defaultScratchHost.free();
 assert.ok(free===null||(Number.isFinite(free)&&free>0));
});

test('the real host finds a process carrying this scratch directory, and only that one',{skip:process.platform!=='linux'&&'reads /proc, so Linux only'},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'server-fit-'));
 const other=mkdtempSync(join(tmpdir(),'server-fit-'));
 const mine=spawn('sleep',['30'],{env:{...process.env,TMPDIR:dir}});
 const theirs=spawn('sleep',['30'],{env:{...process.env,TMPDIR:other}});
 try{
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.deepEqual(await defaultScratchHost.survivors(dir),[mine.pid]);
  defaultScratchHost.kill(mine.pid!);
  await new Promise(resolve=>mine.once('exit',resolve));
  assert.deepEqual(await defaultScratchHost.survivors(dir),[]);
 }finally{
  mine.kill('SIGKILL');theirs.kill('SIGKILL');
  await defaultScratchHost.remove(dir);await defaultScratchHost.remove(other);
 }
});

test('a launch that failed outright releases its scratch before returning',async()=>{
 // Not left to the late-launch path: that one is only for a launch still in flight when the
 // deadline fired. Back-to-back checks must not pile up directories behind each other.
 const events:string[]=[];
 const launch:StageLauncher=async()=>{events.push('launch');throw Error('browserType.launch: spawn ETXTBSY')};
 const {result}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host:recordingHost(events),launch}));
 assert.deepEqual(result,{verdict:'unavailable',reason:'browser_unavailable'});
 assert.deepEqual(events,['make','launch','survivors','remove /scratch/check-1'],'released before the call returned');
});

test('every check shares one pack extraction, and a failed one is tried again',async()=>{
 // The ETXTBSY race: a second check must wait for the first extraction, never spawn the file
 // it is still writing.
 let calls=0,finish:(path:string)=>void=()=>{};
 const extract=sharedExtraction(()=>{calls++;return new Promise<string>(resolve=>{finish=resolve})});
 const first=extract(),second=extract();
 assert.equal(calls,1,'the second caller waits on the same extraction');
 finish('/tmp/chromium');
 assert.deepEqual(await Promise.all([first,second]),['/tmp/chromium','/tmp/chromium']);
 assert.equal(await extract(),'/tmp/chromium');
 assert.equal(calls,1);

 let attempts=0;
 const flaky=sharedExtraction(async()=>{attempts++;if(attempts===1)throw Error('ENOSPC');return '/tmp/chromium'});
 await assert.rejects(flaky(),/ENOSPC/);
 assert.equal(await flaky(),'/tmp/chromium','a failure is not remembered');
 assert.equal(attempts,2);
});
