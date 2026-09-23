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

import {createHash,randomBytes} from 'node:crypto';
import {lstat,mkdtemp,readdir,readFile,readlink,rm,stat,statfs} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Cue} from './player';
// The names every caller shares live in a dependency-free module, so importing one of them
// never drags playwright-core or the Chromium pack into another entrypoint's trace. This
// file is the only one allowed to reach either package - see lib/server-fit-contract.ts.
import {SERVER_RENDERER_PREFIX,type ServerFitArtwork,type ServerFitPreviewImage,type ServerFitPreviewImageUnavailable,type ServerFitResult,type StageMeasurement,type StageMeasureOptions} from './server-fit-contract';

export const SERVER_FIT_DEADLINE_MS=25_000;
export const STAGE_PATH='/author/fit-stage';
/** JPEG bytes before base64 expansion, keeping the returned base64 payload at about 1 MB. */
export const SERVER_FIT_PREVIEW_IMAGE_MAX_BYTES=750_000;

export {SERVER_RENDERER_PREFIX};
export type {ServerFitArtwork,ServerFitMeasured,ServerFitPreviewImage,ServerFitPreviewImageUnavailable,ServerFitResult,ServerFitUnavailable,StageMeasurement,StageMeasureOptions} from './server-fit-contract';

/**
 * The slice of Playwright this module actually uses, named structurally so a test can hand in
 * a fake launcher without pulling a browser - or playwright's types - into the test process.
 */
export type StagePage={
 setViewportSize(size:{width:number;height:number}):Promise<void>;
 goto(url:string,options?:{waitUntil?:'load'|'domcontentloaded'|'networkidle'|'commit';timeout?:number}):Promise<unknown>;
 waitForFunction(expression:string,arg?:unknown,options?:{timeout?:number}):Promise<unknown>;
 evaluate<Result,Arg>(fn:(arg:Arg)=>Result|Promise<Result>,arg:Arg):Promise<Result>;
 screenshot?(options:{type:'jpeg'|'png';quality?:number}):Promise<Uint8Array>;
};
export type StageBrowser={newPage():Promise<StagePage>;close():Promise<unknown>};
/** `scratch` is this check's own directory: the browser's TMPDIR and HOME, removed afterwards. */
export type StageLauncher=(scratch:string)=>Promise<StageBrowser>;
/**
 * A process this check started: its pid and its kernel start time, so a pid the system has since
 * handed to someone else - another check's Chromium, say - is never mistaken for it.
 */
export type OwnedProcess={pid:number;start:string};
/**
 * The filesystem and process operations the scratch lifecycle needs, injectable so a test can
 * watch them. `survivors` returns the processes carrying this check's profile on their command
 * line or its scratch directory in their environment; `alive` says whether one is still running (same pid, same start time, not a
 * zombie); `held` counts the bytes of deleted files it still holds open; `kill` ends one.
 */
export type ScratchHost={
 make():Promise<string>;
 remove(dir:string):Promise<void>;
 bytes(dir:string):Promise<number>;
 free():Promise<number|null>;
 survivors(dir:string):Promise<OwnedProcess[]>;
 alive(process:OwnedProcess):Promise<boolean>;
 held(process:OwnedProcess):Promise<number>;
 kill(process:OwnedProcess):Promise<void>;
 /** Where the shared temp directory's space is, by category. Optional: a host without it logs none. */
 census?():Promise<TmpCensus>;
};

/**
 * What one look at the shared temp directory finds, in bytes allocated on disk (the unit statfs
 * counts in), so a fall in free space can be put against what caused it:
 * - `files`: what is visible under the temp directory, by category. `pack` is @sparticuz/chromium's
 *   extraction (about 220 MB, once per instance); `scratch` is server-fit-* directories, which
 *   outside a check means another check's or a leftover; `playwright` is Playwright's own
 *   directories; `other` is anything else.
 * - `held`: deleted files under the temp directory that some process still holds open - this
 *   process (`self`) or others - and, as `mapped`, those only a memory mapping keeps (an upper
 *   bound: the mapped extent), with the number of processes holding any. Each file counts once.
 * - `unattributed`: space the filesystem counts as used that neither of those explains. On a
 *   filesystem of its own that is metadata, roughly constant; a growing figure means the space went
 *   somewhere this process cannot see (another mount on the same device, or a process it cannot read).
 * - `instance`: which process on which machine looked, so two log lines are compared only when they
 *   come from the same place. `boot` is a short hash of the kernel's boot id, `id` is chosen when this
 *   module loads, `check` counts this module's censuses.
 * - `largestOther`: the three largest `other` entries, as name shapes (digits and random suffixes
 *   masked) with their bytes - enough to name a kind of file, not to read anyone's.
 * Names, sizes and counts only: no file contents, no environment. The walk is capped at
 * CENSUS_ENTRY_LIMIT entries (`truncated` when it stops early). The real host takes one only on
 * Vercel (VERCEL=1).
 */
export type TmpCensus={
 instance:{id:string;boot:string|null;pid:number;uptimeS:number;check:number};
 free:number|null;used:number|null;
 files:Record<TmpCategory,{entries:number;bytes:number}>;
 held:{self:number;others:number;mapped:number;processes:number};
 unattributed:number|null;
 largestOther:string[];
 truncated?:true;
 ms:number;
};
export type TmpCategory='pack'|'scratch'|'playwright'|'other';
export const CENSUS_ENTRY_LIMIT=20_000;

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

/**
 * Chromium's profile for this check: inside the scratch directory, so it goes when the scratch
 * directory goes. Left to itself, Playwright makes the profile with the Node process's own
 * os.tmpdir() - /tmp/playwright_chromiumdev_profile-*, beside the scratch directory rather than
 * in it (production, 2026-09-23: `--user-data-dir=/tmp/playwright_chromiumdev_profile-aTkYmm`) -
 * where no measurement of ours could see it and only Playwright's own close could remove it.
 * Chromium sizes its disk caches there from the free space it finds. Passing the profile
 * explicitly, through the supported `launchPersistentContext`, keeps it this check's own
 * without touching process.env, which a concurrent request in the same process also reads.
 */
export function stageProfile(scratch:string){
 return join(scratch,'profile');
}

/** The one Playwright call the launch makes, named structurally so a test can record it. */
export type StageBrowserType={launchPersistentContext(userDataDir:string,options:Record<string,unknown>):Promise<unknown>};
type PackLoader=()=>Promise<{args:string[];executable:string}>;

/**
 * Starts this check's browser: a persistent context whose profile is `stageProfile(scratch)`.
 * A persistent context is a browser with one context; `newPage()` and `close()` are all the
 * stage uses, and `close()` ends the browser process exactly as Browser.close() does.
 */
export async function launchStage(browserType:StageBrowserType,plan:ReturnType<typeof launchPlan>,scratch:string,loadPack:PackLoader):Promise<StageBrowser>{
 const profile=stageProfile(scratch);
 if(plan.kind==='sparticuz')return await browserType.launchPersistentContext(profile,await packLaunchOptions(loadPack,scratch)) as StageBrowser;
 const env=browserEnv(scratch);
 if(plan.kind==='executable')return await browserType.launchPersistentContext(profile,{executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,headless:true,env}) as StageBrowser;
 return await browserType.launchPersistentContext(profile,{channel:'chrome',headless:true,env}) as StageBrowser;
}

async function loadPack(){
 const loaded=await import('@sparticuz/chromium');
 const pack=((loaded as {default?:unknown}).default??loaded) as {args:string[];executablePath:()=>Promise<string>;setGraphicsMode:boolean};
 // The overlay renderer uses no WebGL, so the GL flags are dropped. (This does not stop the
 // pack extracting its SwiftShader libraries into /tmp: about 7 MB of the ~215 MB.)
 pack.setGraphicsMode=false;
 packExecutable??=sharedExtraction(()=>pack.executablePath());
 return {args:pack.args,executable:await packExecutable()};
}

async function defaultLaunch(scratch:string):Promise<StageBrowser>{
 const {chromium}=await import('playwright-core');
 return await launchStage(chromium as unknown as StageBrowserType,launchPlan(),scratch,loadPack);
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

/** Field 3 of /proc/<pid>/stat, the state, and field 22, the start time. */
async function procStat(pid:number){
 const text=await readFile(`/proc/${pid}/stat`,'latin1');
 // The command name (field 2) is in parentheses and may itself contain spaces or ')'.
 const fields=text.slice(text.lastIndexOf(')')+2).split(' ');
 return {state:fields[0],start:fields[19]};
}

/** Top-level names @sparticuz/chromium extracts into the temp directory (SwiftShader's go loose). */
const PACK_NAMES=new Set(['chromium','al2023','fonts','fonts-cache','libEGL.so','libGLESv2.so','libvk_swiftshader.so','libvulkan.so.1','vk_swiftshader_icd.json']);
export function tmpCategory(name:string):TmpCategory{
 if(PACK_NAMES.has(name))return 'pack';
 if(name.startsWith('server-fit-'))return 'scratch';
 if(name.startsWith('playwright'))return 'playwright';
 return 'other';
}
/** A name's shape: a random suffix and every run of digits masked, so it names a kind of file and no more. */
export function nameShape(name:string){
 return name.replace(/([-_.])[A-Za-z0-9]{6,}$/,'$1*').replace(/\d+/g,'#').slice(0,40);
}
const INSTANCE_ID=randomBytes(4).toString('hex');
let censusCount=0;

/**
 * Takes a census of `root` (the shared temp directory by default). Reads only - lstat, readdir,
 * statfs and /proc/<pid>/fd links - and never follows a symlink out of `root`.
 */
export async function tmpCensus(root:string=tmpdir(),limit=CENSUS_ENTRY_LIMIT):Promise<TmpCensus>{
 const began=Date.now();
 const files:TmpCensus['files']={pack:{entries:0,bytes:0},scratch:{entries:0,bytes:0},playwright:{entries:0,bytes:0},other:{entries:0,bytes:0}};
 const others:{shape:string;bytes:number}[]=[];
 let seen=0,truncated=false;
 // Windows reports no blocks; there the apparent size stands in.
 const allocated=(info:{blocks:number;size:number})=>process.platform==='win32'?Number(info.size):Number(info.blocks)*512;
 const walk=async(path:string):Promise<number>=>{
  if(++seen>limit){truncated=true;return 0}
  const info=await lstat(path).catch(()=>null);
  if(!info)return 0;
  let total=allocated(info);
  if(info.isDirectory())for(const name of await readdir(path).catch(()=>[] as string[])){if(truncated)break;total+=await walk(join(path,name))}
  return total;
 };
 for(const name of await readdir(root).catch(()=>[] as string[])){
  if(truncated)break;
  const bytes=await walk(join(root,name)),category=tmpCategory(name);
  files[category].entries++;files[category].bytes+=bytes;
  if(category==='other')others.push({shape:nameShape(name),bytes});
 }
 const held={self:0,others:0,mapped:0,processes:0};
 if(process.platform==='linux'){
  const prefix=root.endsWith('/')?root:`${root}/`;
  // Each deleted file once, however many processes or descriptors hold it: by inode.
  const counted=new Set<string>(),mappings=new Map<string,number>();
  for(const name of await readdir('/proc').catch(()=>[] as string[])){
   const pid=Number(name);
   if(!Number.isInteger(pid)||truncated)continue;
   let bytes=0,holds=false;
   for(const fd of await readdir(`/proc/${pid}/fd`).catch(()=>[] as string[])){
    if(++seen>limit){truncated=true;break}
    const target=await readlink(`/proc/${pid}/fd/${fd}`).catch(()=>'');
    if(!target.startsWith(prefix)||!target.endsWith(' (deleted)'))continue;
    const info=await stat(`/proc/${pid}/fd/${fd}`).catch(()=>null);
    if(!info)continue;
    holds=true;
    const inode=String(info.ino);
    if(counted.has(inode))continue;
    counted.add(inode);bytes+=allocated(info);
   }
   // A deleted file can also be kept alive by a mapping alone, its descriptor long closed -
   // how Chromium keeps much of its shared memory. /proc/<pid>/maps names it and its inode but
   // not its size, so the mapped extent stands in: an upper bound.
   for(const line of (await readFile(`/proc/${pid}/maps`,'latin1').catch(()=>'')).split('\n')){
    if(!line.endsWith(' (deleted)'))continue;
    const match=/^([0-9a-f]+)-([0-9a-f]+) \S+ \S+ \S+ (\d+)\s+(.*) \(deleted\)$/.exec(line);
    if(!match||!match[4]!.startsWith(prefix))continue;
    holds=true;
    const extent=parseInt(match[2]!,16)-parseInt(match[1]!,16);
    mappings.set(match[3]!,(mappings.get(match[3]!)??0)+extent);
   }
   if(holds)held.processes++;
   if(pid===process.pid)held.self+=bytes;else held.others+=bytes;
  }
  for(const [inode,extent] of mappings)if(!counted.has(inode))held.mapped+=extent;
 }
 const fs=await statfs(root).catch(()=>null);
 const free=fs?Number(fs.bavail)*Number(fs.bsize):null;
 const used=fs?(Number(fs.blocks)-Number(fs.bfree))*Number(fs.bsize):null;
 const visible=Object.values(files).reduce((sum,entry)=>sum+entry.bytes,0);
 const boot=await readFile('/proc/sys/kernel/random/boot_id','utf8').then(text=>createHash('sha256').update(text.trim()).digest('hex').slice(0,8),()=>null);
 return {
  instance:{id:INSTANCE_ID,boot,pid:process.pid,uptimeS:Math.round(process.uptime()),check:++censusCount},
  free,used,files,held,
  unattributed:used===null?null:used-visible-held.self-held.others-held.mapped,
  largestOther:others.sort((a,b)=>b.bytes-a.bytes).slice(0,3).map(entry=>`${entry.shape}~${entry.bytes}`),
  ...(truncated?{truncated:true as const}:{}),
  ms:Date.now()-began,
 };
}

/**
 * The real host. The process operations read /proc, so they answer only on Linux - which is
 * where the function runs, and where a Chromium that outlived `close()` would keep its deleted
 * shared-memory files, and their space, alive. Elsewhere they report none.
 *
 * `survivors` recognises a process by its command line carrying this check's profile
 * (`--user-data-dir=<scratch>/profile`), or by its environment carrying this check's TMPDIR. The
 * command line is what finds Chromium: it rewrites its own process title over the memory its
 * environment was in, so /proc/<pid>/environ of a running Chromium no longer holds the TMPDIR it
 * was launched with (reproduced on Linux, 2026-09-23: the environment scan alone found none of a
 * check's processes even while its browser was open). Both read as empty for a process that is
 * crashing, so `alive` and `held` work from a pid and start time taken while the browser was
 * still running, and from /proc/<pid>/stat, which stays readable until the process is gone.
 */
export const defaultScratchHost:ScratchHost={
 make:()=>mkdtemp(join(tmpdir(),'server-fit-')),
 remove:dir=>rm(dir,{recursive:true,force:true,maxRetries:3}),
 bytes:treeBytes,
 free:()=>statfs(tmpdir()).then(info=>Number(info.bavail)*Number(info.bsize),()=>null),
 async survivors(dir){
  if(process.platform!=='linux')return [];
  const marker=`TMPDIR=${dir}`,profile=`--user-data-dir=${stageProfile(dir)}`,found:OwnedProcess[]=[];
  // A whole entry, delimited by NUL - or, in a command line Chromium has rewritten as its title,
  // by a space - so /scratch/a never matches /scratch/ab.
  const carries=async(pid:number,file:string,entry:string)=>(await readFile(`/proc/${pid}/${file}`,'latin1').catch(()=>'')).split(/[\0 ]/).includes(entry);
  for(const name of await readdir('/proc').catch(()=>[] as string[])){
   const pid=Number(name);
   if(!Number.isInteger(pid)||pid===process.pid)continue;
   if(!await carries(pid,'cmdline',profile)&&!await carries(pid,'environ',marker))continue;
   const start=await procStat(pid).then(info=>info.start,()=>undefined);
   if(start)found.push({pid,start});
  }
  return found;
 },
 async alive({pid,start}){
  if(process.platform!=='linux')return false;
  const info=await procStat(pid).catch(()=>undefined);
  return !!info&&info.start===start&&info.state!=='Z'&&info.state!=='X';
 },
 async held({pid}){
  if(process.platform!=='linux')return 0;
  let total=0;
  for(const fd of await readdir(`/proc/${pid}/fd`).catch(()=>[] as string[])){
   const target=await readlink(`/proc/${pid}/fd/${fd}`).catch(()=>'');
   if(target.endsWith(' (deleted)'))total+=await stat(`/proc/${pid}/fd/${fd}`).then(info=>info.size,()=>0);
  }
  return total;
 },
 async kill(owned){
  // Checked again at the last moment: a pid is killed only while it is still the process
  // this check started.
  if(await defaultScratchHost.alive(owned)){try{process.kill(owned.pid,'SIGKILL')}catch{/* already gone */}}
 },
 // Only on Vercel, where the shared /tmp is the one whose space is in question: a maintainer's
 // or CI machine's temp directory can be large enough that walking it would only add latency.
 ...(process.env.VERCEL==='1'?{census:()=>tmpCensus()}:{}),
};

/** The most one census may take; one that runs longer is logged as `census_timeout`. */
export const CENSUS_BUDGET_MS=250;

/** How long a release waits for a killed survivor to be gone before reporting it. */
export const SERVER_FIT_LINGER_MS=2_000;

/**
 * After the browser is closed: end anything of this check's that is still running, wait (for a
 * bounded time) until it is gone - its open files hold their /tmp space until then - and remove
 * the scratch directory, profile included. `owned` are the processes identified while the
 * browser was running; a fresh environment scan adds any it started later. Returns what it found,
 * for the log - including a scan or a removal that failed, so nothing left behind is silent.
 * Never throws: cleanup must not turn a verdict into an error.
 */
async function releaseScratch(host:ScratchHost,dir:string,owned:OwnedProcess[],lingerMs:number){
 const problem=(error:unknown)=>error instanceof Error?error.message:String(error);
 let survivorsError:string|undefined,removeError:string|undefined;
 const scanned=await host.survivors(dir).catch(error=>{survivorsError=problem(error);return [] as OwnedProcess[]});
 const candidates=[...owned,...scanned.filter(late=>!owned.some(known=>known.pid===late.pid&&known.start===late.start))];
 const lingering:OwnedProcess[]=[];
 for(const candidate of candidates)if(await host.alive(candidate).catch(()=>false))lingering.push(candidate);
 let heldBytes=0;
 for(const survivor of lingering){
  heldBytes+=await host.held(survivor).catch(()=>0);
  await host.kill(survivor).catch(()=>{});
 }
 const waitStarted=Date.now();
 let stillAlive=lingering;
 while(stillAlive.length&&Date.now()-waitStarted<lingerMs){
  await new Promise(resolve=>setTimeout(resolve,25));
  const next:OwnedProcess[]=[];
  for(const survivor of stillAlive)if(await host.alive(survivor).catch(()=>false))next.push(survivor);
  stillAlive=next;
 }
 const scratchBytes=await host.bytes(dir).catch(()=>0);
 await host.remove(dir).catch(error=>{removeError=problem(error)});
 return {
  owned:owned.length,survivors:lingering.length,heldBytes,stillAlive:stillAlive.length,
  waitedMs:lingering.length?Date.now()-waitStarted:0,scratchBytes,
  ...(survivorsError?{survivorsError}:{}),...(removeError?{removeError}:{}),
 };
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
 *
 * What the deadline covers: everything from entry until the verdict is known - the free-space
 * reading, the scratch directory, launch, navigation, readiness and the measurement. What it
 * does not: closing a browser that did launch and releasing its scratch directory, which run
 * after the verdict and before this returns (a launch still in flight at the deadline is closed
 * without holding the caller). Those are bounded by the route's own maxDuration, not by this
 * deadline; the one wait inside the release, for a killed survivor to be gone, is bounded by
 * SERVER_FIT_LINGER_MS. The free-space reading and mkdtemp are local filesystem calls and are
 * awaited without a timer of their own.
 *
 * Every release logs one `server-fit released` line: the processes this check owned, any that
 * outlived close() and what they held, the bytes its scratch directory (profile included) held
 * when it was removed, and free /tmp before and after. So a run whose free space still falls
 * says whether this check's own files account for it. With the real host it also carries a census
 * of /tmp before and after (TmpCensus): which instance looked, and where the space is - the pack,
 * a directory, a deleted file still held open, or nowhere this process can see.
 */
export async function measureCueOnServer(cue:Cue,options:{origin:string;deadlineMs?:number;launch?:StageLauncher;host?:ScratchHost;lingerMs?:number;includePreviewImage?:boolean}):Promise<ServerFitResult>{
 const deadlineMs=options.deadlineMs??SERVER_FIT_DEADLINE_MS;
 const launch=options.launch??defaultLaunch;
 const host=options.host??defaultScratchHost;
 const lingerMs=options.lingerMs??SERVER_FIT_LINGER_MS;
 // This check's own processes, recorded while the browser is whole. After close() - or a crash -
 // an environment scan can no longer be trusted to find them.
 let owned:OwnedProcess[]=[];
 let ownedError:string|undefined;
 const own=async(dir:string)=>{owned=await host.survivors(dir).catch(error=>{ownedError=error instanceof Error?error.message:String(error);return []})};
 // Where /tmp's space is before this check touches it, and again once it is released. Taken
 // before the deadline clock starts and bounded by CENSUS_BUDGET_MS, so accounting never costs a
 // verdict; a census that fails or runs long is logged as such.
 const census=()=>host.census?withDeadline(CENSUS_BUDGET_MS,()=>host.census!()).catch((error:unknown)=>({error:error instanceof DeadlineExpired?'census_timeout':error instanceof Error?error.message:String(error)})):Promise.resolve(undefined);
 const censusBefore=await census();
 const started=Date.now();
 // Free space in the shared temp directory before this check starts. Logged with a failure, so
 // a run that is short of /tmp says so instead of leaving it to Chromium's own stderr.
 const tmpFreeBefore=await host.free().catch(()=>null);
 let scratch:string|undefined;
 const remaining=()=>Math.max(1,deadlineMs-(Date.now()-started));
 let browser:StageBrowser|undefined;
 let page:StagePage|undefined;
 const wantsPreviewImage=options.includePreviewImage===true;
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
  // The race gets what is left of the budget, not a fresh one: the free-space reading and the
  // scratch directory above count against the same deadline as the launch and the measurement.
  const stageRun=await withDeadline(remaining(),async()=>{
   launching=Promise.resolve(launch(dir));
   browser=await launching;
   // A launch that lands after the deadline is recorded by the late-release path instead.
   if(!deadlineHit)await own(dir);
   phase='new_page';
   page=await browser.newPage();
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
   const measurement=await page.evaluate<unknown,{cue:Cue;options:StageMeasureOptions}>(value=>(window as unknown as {__measureCue:(input:Cue,options?:StageMeasureOptions)=>Promise<StageMeasurement>}).__measureCue(value.cue,value.options),{cue,options:wantsPreviewImage?{retainRenderedCue:true}:{}});
   if(!wantsPreviewImage)return {measurement};
   phase='screenshot';
   try{
    if(!page.screenshot)throw Error('stage_screenshot_unavailable');
    const bytes=await page.screenshot({type:'jpeg',quality:65});
    if(bytes.byteLength>SERVER_FIT_PREVIEW_IMAGE_MAX_BYTES)return {measurement,previewImage:null as ServerFitPreviewImage|null,previewImageUnavailable:'image_too_large' as ServerFitPreviewImageUnavailable};
    return {measurement,previewImage:{mimeType:'image/jpeg' as const,dataBase64:Buffer.from(bytes).toString('base64'),width:1920,height:1080}};
   }catch{return {measurement,previewImage:null as ServerFitPreviewImage|null,previewImageUnavailable:'screenshot_failed' as ServerFitPreviewImageUnavailable};}
  });
  const measured=stageMeasurement(stageRun.measurement);
  if(!measured)return {verdict:'unavailable',reason:'measurement_invalid'};
  return {verdict:measured.fitErrors.length?'fail':'pass',fitErrors:measured.fitErrors,warnings:measured.warnings,fill:measured.fill,artwork:measured.artwork,measuredAt:Date.now(),rendererVersion:serverRendererVersion(),...(wantsPreviewImage?{previewImage:stageRun.previewImage??null,...(stageRun.previewImageUnavailable?{previewImageUnavailable:stageRun.previewImageUnavailable}:{})}:{})};
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
  // Capture mode retains the exact fitted DOM only through screenshot(), then releases it
  // before Chromium closes. A failed image remains an explicit non-proof, never a fake pass.
  if(wantsPreviewImage&&page)await page.evaluate<void,undefined>(()=>{(window as unknown as {__disposeMeasuredCue?:()=>void}).__disposeMeasuredCue?.()},undefined).catch(()=>{});
  // The browser is closed on every path, including the deadline: a leaked Chromium would
  // outlive the function invocation that started it. A launch that has already resolved is
  // closed before this function returns; one still in flight when the deadline fired is
  // closed whenever it lands, without holding the caller behind it.
  //
  // Only once the browser is closed is its scratch directory released: a Chromium still
  // running must not have its temp directory removed from under it. A late launch releases its
  // scratch when it lands and has been closed, without holding the caller behind it.
  let closeError:string|undefined;
  const close=(open:StageBrowser)=>Promise.resolve(open.close()).then(()=>{},error=>{closeError=error instanceof Error?error.message:String(error)});
  const finish=async(dir:string|undefined)=>{
   if(!dir)return;
   const released=await releaseScratch(host,dir,owned,lingerMs);
   const tmpFreeAfter=await host.free().catch(()=>null),censusAfter=await census();
   const accounting={...released,...(ownedError?{ownedError}:{}),...(closeError?{closeError}:{}),tmpFreeBefore,tmpFreeAfter,...(censusBefore||censusAfter?{census:{before:censusBefore,after:censusAfter}}:{})};
   // As JSON: the platform's console formats an object only two levels deep, which would log the
   // census's instance, categories and held files as [Object].
   const line=JSON.stringify(accounting);
   console.info('server-fit released',line);
   // A warning only for what should not happen: a process that outlived close(), a close,
   // scan or removal that failed. Scratch bytes are expected - the profile lives there.
   if(released.survivors||released.stillAlive||ownedError||closeError||'survivorsError' in released||'removeError' in released)console.warn('server-fit scratch residue',line);
  };
  if(browser){await close(browser);await finish(scratch)}
  else if(launching){
   const dir=scratch,release=launching.then(async late=>{if(dir)await own(dir);await close(late)}).catch(()=>{}).then(()=>finish(dir));
   // A launch that already failed has settled, so its scratch is released before returning;
   // only one still in flight when the deadline fired is left to land on its own.
   if(deadlineHit)void release;else await release;
  }
  else await finish(scratch);
 }
}
