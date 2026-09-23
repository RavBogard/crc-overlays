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
import {defaultScratchHost,launchStage,measureCueOnServer,packLaunchOptions,sharedExtraction,stageProfile,type OwnedProcess,type ScratchHost,type StageBrowser,type StageBrowserType,type StageLauncher,type StageMeasurement,type StagePage} from '../lib/server-fit.ts';
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
  async alive(){return false},
  async held(){return 0},
  async kill({pid}){events.push(`kill ${pid}`)},
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
 const errors:unknown[][]=[],warnings:unknown[][]=[],infos:unknown[][]=[];
 const {error,warn,info}=console;
 console.error=(...args:unknown[])=>{errors.push(args)};
 console.warn=(...args:unknown[])=>{warnings.push(args)};
 console.info=(...args:unknown[])=>{infos.push(args)};
 try{return {result:await run(),errors,warnings,infos}}finally{console.error=error;console.warn=warn;console.info=info}
}

/** A process that stays alive until it is killed - what the host sees of a Chromium that outlived close(). */
function survivorHost(events:string[],living:Set<number>,overrides:Partial<ScratchHost>={}){
 return recordingHost(events,{
  async alive({pid}){return living.has(pid)},
  async held({pid}){return living.has(pid)?28*1024*1024:0},
  async kill({pid}){events.push(`kill ${pid}`);living.delete(pid)},
  ...overrides,
 });
}

test('the launcher is handed this check\'s own scratch directory, released after the browser closes',async()=>{
 const events:string[]=[],seen:{scratch?:string}={};
 const {result,warnings,infos}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host:recordingHost(events),launch:launcher(events,async()=>CLEAN,seen)}));
 assert.equal(result.verdict,'pass');
 assert.equal(seen.scratch,'/scratch/check-1');
 // Its processes are recorded while the browser runs, and looked for again once it has closed.
 assert.deepEqual(events,['make','launch','survivors','close','survivors','remove /scratch/check-1']);
 assert.equal(warnings.length,0,'a clean release is not worth a warning');
 assert.equal(infos[0]?.[0],'server-fit released','but every release accounts for itself');
 assert.deepEqual(infos[0]?.[1],{owned:0,survivors:0,heldBytes:0,stillAlive:0,waitedMs:0,scratchBytes:0,tmpFreeBefore:40*1024*1024,tmpFreeAfter:40*1024*1024});
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
 assert.deepEqual(events,['make','launch','survivors','close','survivors','remove /scratch/check-1']);
 const logged=errors[0]?.[1] as {phase?:string;tmpFreeBefore?:number|null;tmpFreeNow?:number|null};
 assert.equal(errors[0]?.[0],'server-fit unavailable');
 assert.equal(logged.phase,'measure');
 assert.equal(logged.tmpFreeBefore,40*1024*1024,'the log says how much /tmp there was');
 assert.equal(logged.tmpFreeNow,40*1024*1024);
});

test('a process that outlived close() is killed, waited for and logged',async()=>{
 // A Chromium that survives close() keeps its deleted shared-memory files - and their /tmp
 // space - alive, where removing the directory cannot reach them.
 const events:string[]=[];
 const pair:OwnedProcess[]=[{pid:4101,start:'900'},{pid:4102,start:'901'}];
 const host=survivorHost(events,new Set([4101,4102]),{async survivors(){events.push('survivors');return pair},async bytes(){return 1234}});
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host,launch:launcher(events,async()=>CLEAN)}));
 assert.equal(result.verdict,'pass','cleanup never changes a verdict');
 assert.deepEqual(events,['make','launch','survivors','close','survivors','kill 4101','kill 4102','remove /scratch/check-1']);
 assert.equal(warnings[0]?.[0],'server-fit scratch residue');
 const logged=warnings[0]?.[1] as {owned:number;survivors:number;heldBytes:number;stillAlive:number;scratchBytes:number};
 assert.deepEqual([logged.owned,logged.survivors,logged.heldBytes,logged.stillAlive,logged.scratchBytes],[2,2,2*28*1024*1024,0,1234]);
});

test('a survivor the environment scan can no longer see is still found by the pid recorded at launch',async()=>{
 // Chromium crashes on shutdown, and a crashing process's /proc/<pid>/environ reads as empty:
 // the scan after close() finds nothing (reproduced on Linux). The pid and start time recorded
 // while the browser ran still name it.
 const events:string[]=[];
 let scans=0;
 const host=survivorHost(events,new Set([4101]),{async survivors(){events.push('survivors');return scans++===0?[{pid:4101,start:'77'}]:[]}});
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host,launch:launcher(events,async()=>CLEAN)}));
 assert.equal(result.verdict,'pass');
 assert.deepEqual(events,['make','launch','survivors','close','survivors','kill 4101','remove /scratch/check-1']);
 assert.equal((warnings[0]?.[1] as {survivors:number}).survivors,1);
});

test('a pid that no longer names the process this check started is left alone',async()=>{
 // After close() the pid can be handed to another process - another check's Chromium. The
 // host's `alive` compares start times, so a recycled pid reads as gone and is never killed.
 const events:string[]=[];
 const host=recordingHost(events,{async survivors(){events.push('survivors');return events.includes('close')?[]:[{pid:4101,start:'77'}]},async alive(){return false}});
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host,launch:launcher(events,async()=>CLEAN)}));
 assert.equal(result.verdict,'pass');
 assert.ok(!events.some(event=>event.startsWith('kill')),'nothing is killed');
 assert.equal(warnings.length,0);
});

test('a survivor that will not die is reported after a bounded wait, and the verdict stands',async()=>{
 const events:string[]=[];
 const host=recordingHost(events,{async survivors(){events.push('survivors');return [{pid:4101,start:'77'}]},async alive(){return true}});
 const started=Date.now();
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host,lingerMs:80,launch:launcher(events,async()=>CLEAN)}));
 const elapsed=Date.now()-started;
 assert.equal(result.verdict,'pass');
 const logged=warnings[0]?.[1] as {stillAlive:number;waitedMs:number};
 assert.equal(logged.stillAlive,1);
 assert.ok(logged.waitedMs>=80,`waited ${logged.waitedMs} ms`);
 assert.ok(elapsed<1000,`the wait is bounded (took ${elapsed} ms)`);
 assert.equal(events.at(-1),'remove /scratch/check-1','the scratch directory is still released');
});

test('a close that fails is logged, and the scratch directory is still released',async()=>{
 const events:string[]=[];
 const launch:StageLauncher=async()=>{events.push('launch');return {async newPage(){return stage(async()=>CLEAN)},async close(){events.push('close');throw Error('browser.close: Target closed')}}};
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host:recordingHost(events),launch}));
 assert.equal(result.verdict,'pass');
 assert.equal((warnings[0]?.[1] as {closeError?:string}).closeError,'browser.close: Target closed');
 assert.equal(events.at(-1),'remove /scratch/check-1');
});

test('the browser\'s profile is an explicit directory inside this check\'s scratch, never Playwright\'s own in /tmp',async()=>{
 // Left to itself Playwright makes /tmp/playwright_chromiumdev_profile-* from the Node
 // process's os.tmpdir(), outside the scratch directory (production log, 2026-09-23).
 const calls:{dir:string;options:Record<string,unknown>}[]=[];
 const browserType:StageBrowserType={async launchPersistentContext(dir,options){calls.push({dir,options});return {async newPage(){return stage(async()=>CLEAN)},async close(){return null}}}};
 const saved=process.env.LD_LIBRARY_PATH;
 try{
  delete process.env.LD_LIBRARY_PATH;
  await launchStage(browserType,{kind:'sparticuz',detail:'pack'},'/scratch/check-1',async()=>{process.env.LD_LIBRARY_PATH='/tmp/al2023/lib';return {args:['--single-process'],executable:'/tmp/chromium'}});
  await launchStage(browserType,{kind:'channel',detail:'chrome'},'/scratch/check-2',async()=>{throw Error('the pack is only loaded on Linux')});
 }finally{if(saved===undefined)delete process.env.LD_LIBRARY_PATH;else process.env.LD_LIBRARY_PATH=saved}
 assert.equal(stageProfile('/scratch/check-1'),join('/scratch/check-1','profile'));
 assert.deepEqual(calls.map(call=>call.dir),[stageProfile('/scratch/check-1'),stageProfile('/scratch/check-2')]);
 const pack=calls[0].options as {executablePath:string;args:string[];env:Record<string,string>};
 assert.equal(pack.executablePath,'/tmp/chromium');
 assert.deepEqual(pack.args,['--single-process']);
 assert.equal(pack.env.TMPDIR,'/scratch/check-1');
 assert.equal(pack.env.LD_LIBRARY_PATH,'/tmp/al2023/lib','the environment is still read after the pack has loaded');
 assert.equal(process.env.TMPDIR===undefined||process.env.TMPDIR!=='/scratch/check-1',true,'the server process environment is never changed');
 assert.equal((calls[1].options as {channel?:string}).channel,'chrome');
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
 assert.deepEqual(events,['make','launch','survivors','close','survivors','remove /scratch/check-1']);
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
 const {result,warnings,infos}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,launch}));
 assert.equal(result.verdict,'pass');
 assert.ok(written&&written.startsWith(join(tmpdir(),'server-fit-')),'scratch lives under the temp directory');
 assert.equal(existsSync(written!),false,'the scratch directory is gone');
 assert.equal(warnings.length,0,'files in the scratch directory are expected, not a residue');
 assert.equal(infos[0]?.[0],'server-fit released');
 assert.equal((infos[0]?.[1] as {scratchBytes:number}).scratchBytes,64*1024,'what the check wrote is counted as it is removed');
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
  const found=await defaultScratchHost.survivors(dir);
  assert.deepEqual(found.map(owned=>owned.pid),[mine.pid]);
  assert.equal(await defaultScratchHost.alive(found[0]),true);
  assert.equal(await defaultScratchHost.alive({pid:found[0].pid,start:`${found[0].start}0`}),false,'a different start time is a different process');
  await defaultScratchHost.kill({pid:found[0].pid,start:`${found[0].start}0`});
  assert.equal(await defaultScratchHost.alive(found[0]),true,'and is never killed');
  await defaultScratchHost.kill(found[0]);
  await new Promise(resolve=>mine.once('exit',resolve));
  assert.equal(await defaultScratchHost.alive(found[0]),false);
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

test('the pack launch environment is read after the pack has loaded, so a cold first check gets its libraries',async()=>{
 const saved={LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH,FONTCONFIG_PATH:process.env.FONTCONFIG_PATH};
 try{
  delete process.env.LD_LIBRARY_PATH;delete process.env.FONTCONFIG_PATH;
  const options=await packLaunchOptions(async()=>{
   // What the real pack does on a cold Vercel instance: importing it and extracting it both
   // write into process.env.
   process.env.LD_LIBRARY_PATH='/tmp/al2023/lib';
   process.env.FONTCONFIG_PATH='/tmp/fonts';
   return {args:['--headless'],executable:'/tmp/chromium'};
  },'/scratch/check-1');
  assert.equal(options.env.LD_LIBRARY_PATH,'/tmp/al2023/lib');
  assert.equal(options.env.FONTCONFIG_PATH,'/tmp/fonts');
  assert.equal(options.env.TMPDIR,'/scratch/check-1');
  assert.equal(options.env.HOME,'/scratch/check-1');
  assert.equal(options.executablePath,'/tmp/chromium');
  assert.deepEqual(options.args,['--headless']);
 }finally{
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value}
 }
});


test('the time spent making the scratch directory counts against the deadline',async()=>{
 const events:string[]=[];
 const host=recordingHost(events,{async make(){events.push('make');await new Promise(resolve=>setTimeout(resolve,150));return '/scratch/check-1'}});
 const never:StageLauncher=async()=>({async newPage(){return stage(()=>new Promise(()=>{}))},async close(){events.push('close');return null}});
 const started=Date.now();
 const {result}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,deadlineMs:200,host,launch:never}));
 assert.deepEqual(result,{verdict:'unavailable',reason:'deadline_exceeded'});
 const elapsed=Date.now()-started;
 assert.ok(elapsed<320,`one budget from entry, not a fresh one after the preflight (took ${elapsed} ms)`);
});

test('a scratch directory that cannot be removed, or a survivor scan that fails, is logged and never changes the verdict',async()=>{
 const events:string[]=[];
 const host=recordingHost(events,{
  async survivors(){throw Error('EACCES: /proc')},
  async remove(){throw Error('EBUSY: resource busy or locked')},
 });
 const {result,warnings}=await capture(()=>measureCueOnServer(CUE,{origin:ORIGIN,host,launch:launcher(events,async()=>CLEAN)}));
 assert.equal(result.verdict,'pass');
 assert.equal(warnings[0]?.[0],'server-fit scratch residue');
 const logged=warnings[0]?.[1] as {survivorsError?:string;removeError?:string};
 assert.equal(logged.survivorsError,'EACCES: /proc');
 assert.equal(logged.removeError,'EBUSY: resource busy or locked');
});

test('the real host counts the deleted files a process still holds open',{skip:process.platform!=='linux'&&'reads /proc, so Linux only'},async()=>{
 // What a surviving Chromium's shared memory looks like: unlinked, still open, still using /tmp.
 const dir=mkdtempSync(join(tmpdir(),'server-fit-'));
 const script="const fs=require('fs');const p=process.argv[1];const fd=fs.openSync(p,'w');fs.writeSync(fd,Buffer.alloc(256*1024));fs.unlinkSync(p);process.stdout.write('ready');setTimeout(()=>{},30000)";
 const holder=spawn(process.execPath,['-e',script,join(dir,'.org.chromium.Chromium.held')],{env:{...process.env,TMPDIR:dir}});
 try{
  await new Promise(resolve=>holder.stdout.once('data',resolve));
  const [owned]=await defaultScratchHost.survivors(dir);
  assert.equal(owned?.pid,holder.pid);
  assert.equal(await defaultScratchHost.held(owned),256*1024);
 }finally{
  holder.kill('SIGKILL');
  await defaultScratchHost.remove(dir);
 }
});

test('the real host finds a browser by the profile on its command line, even one that rewrote its title over its environment',{skip:process.platform!=='linux'&&'reads /proc, so Linux only'},async()=>{
 // Chromium overwrites the memory its environment was in with its process title, so its TMPDIR
 // cannot be read back. Setting process.title does the same to a node process's command line.
 const dir=mkdtempSync(join(tmpdir(),'server-fit-'));
 const ready=(child:ReturnType<typeof spawn>)=>new Promise(resolve=>child.stdout!.once('data',resolve));
 const titled=(profile:string)=>spawn(process.execPath,['-e',`process.title='/tmp/chromium --headless --user-data-dir=${profile} --remote-debugging-pipe';process.stdout.write('ready');setTimeout(()=>{},30000)`]);
 const mine=titled(stageProfile(dir)),lookalike=titled(`${stageProfile(dir)}-other`);
 try{
  await Promise.all([ready(mine),ready(lookalike)]);
  assert.deepEqual((await defaultScratchHost.survivors(dir)).map(owned=>owned.pid),[mine.pid]);
 }finally{
  mine.kill('SIGKILL');lookalike.kill('SIGKILL');
  await defaultScratchHost.remove(dir);
 }
});
