// R7 / D17 - the server-side fit check.
//
// An MCP or API publish gets the same verdict the editor computes because it is computed the
// same way: a real Chromium opens /author/fit-stage on this deployment and calls the page's
// `window.__measureCue`, which runs the very functions the editor dock and /author/fit-check
// run (findFitErrors, findFitWarnings, panelFillRatio, the 6 px font-metric tolerance and the
// same-owner overlap skip). Nothing here renders a cue in Node; nothing here issues a command.
//
// On Linux (Vercel Fluid) the browser is @sparticuz/chromium's pack driven by playwright-core.
// Off Linux - a maintainer's Windows or macOS machine - there is no pack, so the same
// playwright-core launches a locally installed Chrome: PLAYWRIGHT_CHROMIUM_PATH if it is set,
// otherwise the `chrome` channel. `launch` is injectable so tests never start a browser.
//
// Every check runs its Chromium inside a scratch directory of its own, and removes it when the
// check ends. The pack passes --disable-dev-shm-usage, so Chromium's shared memory is ordinary
// files in its temp directory: measuring one 1920x1080 cue holds 20-36 MB of it, in the same
// /tmp that already holds the ~215 MB extracted pack. When that runs short the renderer dies
// mid-measure ("Target page, context or browser has been closed", phase `measure` - production,
// 2026-09-22, checks 11 and 12, with Chromium warning of 23 MB and then 15 MB free). Pointing the
// browser's TMPDIR and HOME at the scratch directory means nothing a check writes can outlive
// it, on the crash path as much as the clean one, and a check's own residue is measured and
// logged rather than guessed at. See docs/planning/2026-09-22-sitting-prep/RETURN-FIT-STABILITY.md.

import {mkdtemp,readdir,readFile,rm,stat,statfs} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Cue} from './player';
// The names every caller shares live in a dependency-free module, so importing one of them
// never drags playwright-core or the Chromium pack into another entrypoint's trace. This
// file is the only one allowed to reach either package - see lib/server-fit-contract.ts.
import {SERVER_RENDERER_PREFIX,type ServerFitArtwork,type ServerFitResult,type StageMeasurement} from './server-fit-contract';

export const SERVER_FIT_DEADLINE_MS=25_000;
export const STAGE_PATH='/author/fit-stage';

export {SERVER_RENDERER_PREFIX};
export type {ServerFitArtwork,ServerFitMeasured,ServerFitResult,ServerFitUnavailable,StageMeasurement} from './server-fit-contract';

/**
 * The slice of Playwright this module actually uses, named structurally so a test can hand in
 * a fake launcher without pulling a browser - or playwright's types - into the test process.
 */
export type StagePage={
 setViewportSize(size:{width:number;height:number}):Promise<void>;
 goto(url:string,options?:{waitUntil?:'load'|'domcontentloaded'|'networkidle'|'commit';timeout?:number}):Promise<unknown>;
 waitForFunction(expression:string,arg?:unknown,options?:{timeout?:number}):Promise<unknown>;
 evaluate<Result,Arg>(fn:(arg:Arg)=>Result|Promise<Result>,arg:Arg):Promise<Result>;
};
export type StageBrowser={newPage():Promise<StagePage>;close():Promise<unknown>};
/** `scratch` is this check's own directory: the browser's TMPDIR and HOME, removed afterwards. */
export type StageLauncher=(scratch:string)=>Promise<StageBrowser>;
/**
 * The filesystem and process operations the scratch lifecycle needs, injectable so a test can
 * watch them. `survivors` returns the pids still carrying this scratch directory in their
 * environment; `kill` ends one.
 */
export type ScratchHost={
 make():Promise<string>;
 remove(dir:string):Promise<void>;
 bytes(dir:string):Promise<number>;
 free():Promise<number|null>;
 survivors(dir:string):Promise<number[]>;
 kill(pid:number):void;
};

const requireFrom=createRequire(import.meta.url);

/** `server-chromium/<playwright version>` - the attestation `review_draft` checks for. */
export function serverRendererVersion(){
 let version='unknown';
 try{version=String((requireFrom('playwright-core/package.json') as {version?:unknown}).version??'unknown')}catch{/* resolved lazily; unknown is honest */}
 return `${SERVER_RENDERER_PREFIX}${version}`;
}

/** Which browser this host can offer, reported so a run can say what it measured with. */
export function launchPlan(){
 if(process.platform==='linux')return {kind:'sparticuz' as const,detail:'@sparticuz/chromium pack'};
 return process.env.PLAYWRIGHT_CHROMIUM_PATH
  ?{kind:'executable' as const,detail:'PLAYWRIGHT_CHROMIUM_PATH'}
  :{kind:'channel' as const,detail:'local Chrome (channel: chrome)'};
}

/**
 * One extraction for every check this instance runs. The pack's own `executablePath()` returns
 * /tmp/chromium as soon as that file exists - including while a first extraction is still
 * writing it. A cold check that loses its deadline mid-extraction leaves that write running, and
 * without a shared promise the next check spawns the half-written binary (reproduced on Linux:
 * `spawn ETXTBSY`, 14 checks in a row). A failed extraction is forgotten so the next check tries
 * again rather than inheriting the failure.
 */
export function sharedExtraction(extract:()=>Promise<string>){
 let pending:Promise<string>|undefined;
 return ()=>pending??=extract().catch(error=>{pending=undefined;throw error});
}
let packExecutable:(()=>Promise<string>)|undefined;

/**
 * The browser's environment: this host's own, with TMPDIR and HOME moved into the check's scratch
 * directory. Chromium reads its shared-memory and temp directory from TMPDIR, and writes caches and
 * databases under HOME. The font directories and the fontconfig cache are absolute paths in the
 * pack's fonts.conf, so moving HOME changes nothing about which fonts the stage sees.
 */
function browserEnv(scratch:string){
 return {...process.env,TMPDIR:scratch,HOME:scratch} as Record<string,string>;
}

/**
 * Launch options for the pack. The environment is read only after `load` has finished, because
 * the pack writes into process.env as it goes: importing it on Vercel adds /tmp/al2023/lib to
 * LD_LIBRARY_PATH, and extraction can set FONTCONFIG_PATH. Read any earlier and a cold
 * instance's first check launches without its libraries (`libnspr4.so: cannot open shared object
 * file`, reproduced on Linux) while every later check works.
 */
export async function packLaunchOptions(load:()=>Promise<{args:string[];executable:string}>,scratch:string){
 const {args,executable}=await load();
 return {args,executablePath:executable,headless:true,env:browserEnv(scratch)};
}

async function defaultLaunch(scratch:string):Promise<StageBrowser>{
 const {chromium}=await import('playwright-core');
 const plan=launchPlan();
 if(plan.kind==='sparticuz'){
  return await chromium.launch(await packLaunchOptions(async()=>{
   const loaded=await import('@sparticuz/chromium');
   const pack=((loaded as {default?:unknown}).default??loaded) as {args:string[];executablePath:()=>Promise<string>;setGraphicsMode:boolean};
   // The overlay renderer uses no WebGL, so the GL flags are dropped. (This does not stop the
   // pack extracting its SwiftShader libraries into /tmp: about 7 MB of the ~215 MB.)
   pack.setGraphicsMode=false;
   packExecutable??=sharedExtraction(()=>pack.executablePath());
   return {args:pack.args,executable:await packExecutable()};
  },scratch)) as unknown as StageBrowser;
 }
 const env=browserEnv(scratch);
 if(plan.kind==='executable')return await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,headless:true,env}) as unknown as StageBrowser;
 return await chromium.launch({channel:'chrome',headless:true,env}) as unknown as StageBrowser;
}

async function treeBytes(dir:string):Promise<number>{
 let total=0;
 for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){
  const path=join(dir,entry.name);
  if(entry.isDirectory())total+=await treeBytes(path);
  else total+=await stat(path).then(info=>info.size,()=>0);
 }
 return total;
}

/**
 * The real host. `survivors` reads /proc, so it answers only on Linux - which is where the
 * function runs, and where a Chromium that outlived `close()` would keep its deleted
 * shared-memory files, and their space, alive. Elsewhere it reports none.
 */
export const defaultScratchHost:ScratchHost={
 make:()=>mkdtemp(join(tmpdir(),'server-fit-')),
 remove:dir=>rm(dir,{recursive:true,force:true,maxRetries:3}),
 bytes:treeBytes,
 free:()=>statfs(tmpdir()).then(info=>Number(info.bavail)*Number(info.bsize),()=>null),
 async survivors(dir){
  if(process.platform!=='linux')return [];
  const marker=`TMPDIR=${dir}`,found:number[]=[];
  for(const name of await readdir('/proc').catch(()=>[] as string[])){
   const pid=Number(name);
   if(!Number.isInteger(pid)||pid===process.pid)continue;
   const environ=await readFile(`/proc/${pid}/environ`,'latin1').catch(()=>'');
   if(environ.split('\0').includes(marker))found.push(pid);
  }
  return found;
 },
 kill:pid=>{try{process.kill(pid,'SIGKILL')}catch{/* already gone */}},
};

/**
 * After the browser is closed: end anything of this check's that is still running, then
 * remove its scratch directory. Returns what it found, for the log. Never throws - cleanup
 * must not turn a verdict into an error.
 */
async function releaseScratch(host:ScratchHost,dir:string){
 const survivors=await host.survivors(dir).catch(()=>[] as number[]);
 for(const pid of survivors)host.kill(pid);
 const leftBytes=await host.bytes(dir).catch(()=>0);
 await host.remove(dir).catch(()=>{});
 return {survivors:survivors.length,leftBytes};
}

class DeadlineExpired extends Error{constructor(){super('deadline_exceeded')}}

function withDeadline<T>(deadlineMs:number,run:()=>Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 return Promise.race([
  run(),
  new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new DeadlineExpired()),deadlineMs)}),
 ]).finally(()=>{if(timer)clearTimeout(timer)});
}

const ARTWORK:readonly ServerFitArtwork[]=['none','loaded','not-loaded'];

function stageMeasurement(value:unknown):StageMeasurement|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as {fitErrors?:unknown;warnings?:unknown;fill?:unknown;artwork?:unknown};
 const list=(entry:unknown)=>Array.isArray(entry)&&entry.every(item=>typeof item==='string')?entry as string[]:null;
 const fitErrors=list(raw.fitErrors),warnings=list(raw.warnings);
 if(!fitErrors||!warnings)return null;
 const fill=typeof raw.fill==='number'&&Number.isFinite(raw.fill)?raw.fill:null;
 // A stage that says nothing about artwork is read as `none` rather than rejected: the
 // stage is a page of this same deployment, and the label is never a gate.
 const artwork=ARTWORK.find(item=>item===raw.artwork)??'none';
 return {fitErrors,warnings,fill,artwork};
}

/**
 * Measure one cue in a real browser on the server.
 *
 * `origin` is the canonical public origin of this deployment (PUBLIC_BASE_URL via
 * canonicalOrigin), never a request host: the stage must be the page this deployment serves.
 * Launch failure, a stage that never exposes `__measureCue`, a malformed measurement and the
 * hard deadline all resolve to `unavailable` rather than throwing - the caller's fallback is
 * to send a human to /author/fit-check.
 */
export async function measureCueOnServer(cue:Cue,options:{origin:string;deadlineMs?:number;launch?:StageLauncher;host?:ScratchHost}):Promise<ServerFitResult>{
 const deadlineMs=options.deadlineMs??SERVER_FIT_DEADLINE_MS;
 const launch=options.launch??defaultLaunch;
 const host=options.host??defaultScratchHost;
 const started=Date.now();
 // Free space in the shared temp directory before this check starts. Logged with a failure, so
 // a run that is short of /tmp says so instead of leaving it to Chromium's own stderr.
 const tmpFreeBefore=await host.free().catch(()=>null);
 let scratch:string|undefined;
 const remaining=()=>Math.max(1,deadlineMs-(Date.now()-started));
 let browser:StageBrowser|undefined;
 // Keep this separate from the public unavailable reason.  A browser assigned before
 // `newPage()` can still fail before it ever makes a request, so `stage_unavailable` alone
 // cannot establish that the public-origin request was the problem.
 let phase='launch';
 // The launch promise is held separately from the browser it resolves to: if `launch()`
 // itself outruns the deadline, `browser` is still undefined when the race rejects, and
 // without this handle the Chromium that arrives a moment later would never be closed.
 let launching:Promise<StageBrowser>|undefined;
 let deadlineHit=false;
 try{
  // Made before the deadline race, so a deadline can never land between the directory
  // existing and this function knowing its name.
  const dir=scratch=await host.make();
  const measurement=await withDeadline(deadlineMs,async()=>{
   launching=Promise.resolve(launch(dir));
   browser=await launching;
   phase='new_page';
   const page=await browser.newPage();
   await page.setViewportSize({width:1920,height:1080});
   // `load` waits for every subresource on the page, while this stage needs only its
   // hydrated `__measureCue` function.  Waiting for DOM readiness first gives that explicit
   // readiness check the remainder of the one hard budget; it does not accept an unhydrated
   // or partially loaded stage.
   phase='navigate';
   await page.goto(new URL(STAGE_PATH,options.origin).toString(),{waitUntil:'domcontentloaded',timeout:remaining()});
   phase='stage_ready';
   await page.waitForFunction('typeof window.__measureCue === "function"',undefined,{timeout:remaining()});
   phase='measure';
   return await page.evaluate<unknown,Cue>(value=>(window as unknown as {__measureCue:(input:Cue)=>Promise<StageMeasurement>}).__measureCue(value),cue);
  });
  const measured=stageMeasurement(measurement);
  if(!measured)return {verdict:'unavailable',reason:'measurement_invalid'};
  return {verdict:measured.fitErrors.length?'fail':'pass',fitErrors:measured.fitErrors,warnings:measured.warnings,fill:measured.fill,artwork:measured.artwork,measuredAt:Date.now(),rendererVersion:serverRendererVersion()};
 }catch(error){
  deadlineHit=error instanceof DeadlineExpired;
  // `unavailable` is one word for several very different failures - no Chromium binary in the
  // function, a launch the kernel killed, a stage this deployment does not serve. None of that
  // reaches the caller (an MCP client learns only that a human must look), so the only place it
  // can be read is the function log. Log it there, with what was attempted.
  console.error('server-fit unavailable',{plan:launchPlan(),origin:options.origin,phase,elapsedMs:Date.now()-started,tmpFreeBefore,tmpFreeNow:await host.free().catch(()=>null),reason:error instanceof DeadlineExpired?'deadline_exceeded':'stage_error',error:error instanceof DeadlineExpired?undefined:(error instanceof Error?(error.stack??error.message):String(error))});
  // `browser` is assigned only once launch() resolved, so it separates "this function has no
  // Chromium" from "Chromium ran and the stage did not answer" - the one distinction the log
  // line alone could not make - without leaking any error text to the caller.
  return {verdict:'unavailable',reason:error instanceof DeadlineExpired?'deadline_exceeded':browser?'stage_unavailable':'browser_unavailable'};
 }finally{
  // The browser is closed on every path, including the deadline: a leaked Chromium would
  // outlive the function invocation that started it. A launch that has already resolved is
  // closed before this function returns; one still in flight when the deadline fired is
  // closed whenever it lands, without holding the caller behind it.
  //
  // Only once the browser is closed is its scratch directory released: a Chromium still
  // running must not have its temp directory removed from under it. A late launch releases its
  // scratch when it lands and has been closed, without holding the caller behind it.
  const finish=async(dir:string|undefined)=>{
   if(!dir)return;
   const released=await releaseScratch(host,dir);
   // Only a residue is worth a log line; a clean release is the expected case, every time.
   if(released.survivors||released.leftBytes)console.warn('server-fit scratch residue',{...released,tmpFreeAfter:await host.free().catch(()=>null)});
  };
  if(browser){await Promise.resolve(browser.close()).catch(()=>{});await finish(scratch)}
  else if(launching){
   const dir=scratch,release=launching.then(late=>late.close()).catch(()=>{}).then(()=>finish(dir));
   // A launch that already failed has settled, so its scratch is released before returning;
   // only one still in flight when the deadline fired is left to land on its own.
   if(deadlineHit)void release;else await release;
  }
  else await finish(scratch);
 }
}
