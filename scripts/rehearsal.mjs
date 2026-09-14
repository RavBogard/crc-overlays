// Agent-facing rehearsal orchestrator (docs/REHEARSAL-MODE.md). Runs under tsx:
//   npm run rehearsal            (this file as the entry)
//   import {startRehearsal} from './rehearsal.mjs'   (scripts/check-rehearsal.mjs)
//
// Boots the in-process relay stub (scripts/rehearsal-relay.ts) inside THIS process and
// spawns `next dev` as a child with a minimal, explicit environment. Never loads any
// .env* file and refuses to start if production-shaped credentials are inherited.
//
// `npm run rehearsal -- --pair` boots CRC and TBI together from this one process (two relay
// stubs, two `next dev` children, one shared library key) — see docs/REHEARSAL-MODE.md.
//
// Exit codes: 2 inherited credential, 3 port busy, 4 (reserved: .env file present when
// the runtime would honour it), 5 Next did not answer /api/workspace within 90 s,
// 6 the paired rehearsal could not give its two dev servers separate build directories,
// 7 --google was asked for and a Google sign-in variable is missing from this shell.
import {execFile,spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import net from 'node:net';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_REHEARSAL_RELAY_PORT,startRehearsalRelay} from './rehearsal-relay.ts';

export {DEFAULT_REHEARSAL_RELAY_PORT};
export const DEFAULT_REHEARSAL_PORT=5175;
export const DEFAULT_REHEARSAL_TBI_PORT=5176;
export const DEFAULT_REHEARSAL_TBI_RELAY_PORT=8789;
export const TBI_WORKSPACE_ID='temple-bnai-israel-kalamazoo';
export const FORBIDDEN_ENV=['DATABASE_URL','RELAY_SECRET','CONTROL_KEY','OUTPUT_KEY','ACCESS_BOOTSTRAP_KEY','VERCEL'];
// Google sign-in (lib/google-sign-in.ts) reads exactly these two. They are identity-provider
// credentials, not production data credentials, so they are not forbidden — but they only
// reach a child when `--google` asks for them, and are pinned empty otherwise.
export const GOOGLE_ENV=['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET'];
export const REHEARSAL_OWNER_EMAIL='rehearsal-owner@rehearsal.invalid';
export const REHEARSAL_OWNER_PASSWORD='rehearsal-owner-local-2026';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const NEXT_BIN=path.join(ROOT,'node_modules','next','dist','bin','next');
export const STATE_FILE=path.join(ROOT,'work','rehearsal','current.json');
export const STATE_FILE_TBI=path.join(ROOT,'work','rehearsal','current-tbi.json');
const READY_TIMEOUT_MS=90_000;
const POLL_MS=500;
// Variables the Next child may inherit. Everything else is dropped so a shell that
// happens to hold production credentials cannot leak them into the rehearsal.
const INHERITED_ENV=['PATH','SYSTEMROOT','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT','NODE_PATH'];

export class RehearsalStartError extends Error{constructor(code,message){super(message);this.exitCode=code}}
export class RehearsalAbortedError extends RehearsalStartError{constructor(){super(0,'rehearsal aborted by signal')}}

const key=()=>randomBytes(32).toString('base64url');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Signs in as the seeded rehearsal owner and returns the session cookie pair for later requests. */
export async function ownerSession(baseUrl){
 const response=await fetch(`${baseUrl}/api/access`,{method:'POST',headers:{'Content-Type':'application/json',Origin:baseUrl},body:JSON.stringify({action:'login',email:REHEARSAL_OWNER_EMAIL,password:REHEARSAL_OWNER_PASSWORD}),signal:AbortSignal.timeout(10_000)});
 if(!response.ok)throw new Error(`rehearsal owner sign-in failed (${response.status})`);
 const cookie=(response.headers.get('set-cookie')??'').split(';')[0];
 if(!cookie.startsWith('crc_access='))throw new Error('rehearsal owner sign-in returned no session cookie');
 return cookie;
}

/** Names the first forbidden variable present in `env`, or null. */
export function inheritedCredential(env=process.env){
 return FORBIDDEN_ENV.find(name=>env[name]!==undefined)??null;
}

/** The Google variable NAMES `--google` needs and this shell does not supply. Never values. */
export function missingGoogleCredentials(env=process.env){
 return GOOGLE_ENV.filter(name=>!env[name]);
}

function tryListen(port,host){
 return new Promise(resolve=>{
  const server=net.createServer();
  server.unref();
  server.once('error',error=>resolve(error.code==='EADDRINUSE'||error.code==='EACCES'?'busy':'skip'));
  server.listen(port,host,()=>server.close(()=>resolve('free')));
 });
}
function tryConnect(port,host){
 return new Promise(resolve=>{
  const socket=net.connect({port,host});
  socket.setTimeout(750);
  const done=value=>{socket.destroy();resolve(value)};
  socket.once('connect',()=>done('busy'));
  socket.once('timeout',()=>done('free'));
  socket.once('error',()=>done('free'));
 });
}
/** True when nothing listens on `port` for loopback or wildcard addresses. */
export async function portFree(port){
 for(const host of ['127.0.0.1','::1'])if(await tryConnect(port,host)==='busy')return false;
 for(const host of ['127.0.0.1','::1','0.0.0.0','::'])if(await tryListen(port,host)==='busy')return false;
 return true;
}

/**
 * The Next child's whole environment: an allowlist, never `process.env`.
 * Paired rehearsal adds `workspaceId`, the two shared-library keys and the TBI feed URL,
 * and `standaloneConfig` (see isolatedBuildConfig).
 * @param {{relayPort:number,relaySecret:string,controlKey:string,outputKey:string,
 *  bookFaces?:boolean,google?:boolean,workspaceId?:string,sharedLibraryExportKey?:string,
 *  sharedLibraryUrl?:string,sharedLibraryImportKey?:string,standaloneConfig?:string}} options
 * @returns {Record<string,string>}
 */
export function childEnv(options){
 const {relayPort,relaySecret,controlKey,outputKey,bookFaces,google,workspaceId,sharedLibraryExportKey,sharedLibraryUrl,sharedLibraryImportKey,standaloneConfig}=options;
 /** @type {Record<string,string>} */
 const env={};
 for(const name of INHERITED_ENV)if(process.env[name]!==undefined)env[name]=process.env[name];
 Object.assign(env,{
  CRC_AUTHORING_REHEARSAL:'1',
  NODE_ENV:'development',
  RELAY_URL:'memory',
  CRC_REHEARSAL_RELAY_PORT:String(relayPort),
  RELAY_SECRET:relaySecret,
  CONTROL_KEY:controlKey,
  OUTPUT_KEY:outputKey,
  NEXT_TELEMETRY_DISABLED:'1',
  // @next/env only applies a .env* key whose initial value is undefined, so a defined
  // empty string blocks any file from injecting these.
  DATABASE_URL:'',
  ACCESS_BOOTSTRAP_KEY:'',
  // Same reason: pinned empty so no .env* file can configure Google sign-in behind the
  // flag's back. lib/google-sign-in.ts treats empty as unconfigured, so the button is absent.
  GOOGLE_OAUTH_CLIENT_ID:'',
  GOOGLE_OAUTH_CLIENT_SECRET:'',
 });
 // --google forwards exactly these two from the invoking shell (values are never printed,
 // logged or written to a state file). Registered origins make this useful only for the solo
 // CRC rehearsal on 5175; the paired TBI child on 5176 shows Google sign-in as unavailable.
 if(google)for(const name of GOOGLE_ENV)env[name]=process.env[name]??'';
 // --book-faces trials the David Libre / Frank Ruhl Libre overlay typography (lib/workspace.ts
 // WORKSPACE_BOOK_FACES); default off, so this key is only set when explicitly requested.
 if(bookFaces)env.WORKSPACE_BOOK_FACES='1';
 // Paired rehearsal only: TBI runs the same code under a second workspace identity and reads
 // CRC's shared library over loopback with the one key both children were given.
 if(workspaceId)env.WORKSPACE_ID=workspaceId;
 if(sharedLibraryExportKey)env.SHARED_LIBRARY_EXPORT_KEY=sharedLibraryExportKey;
 if(sharedLibraryUrl)env.CRC_SHARED_LIBRARY_URL=sharedLibraryUrl;
 if(sharedLibraryImportKey)env.SHARED_LIBRARY_IMPORT_KEY=sharedLibraryImportKey;
 // Next 16 takes an exclusive lock on <distDir>/lock per checkout, so two dev servers in one
 // repository need separate build directories. distDir can only come from the resolved Next
 // config, and this private variable is the one env-shaped way to supply one without editing
 // next.config.ts (isolatedBuildConfig builds the JSON from Next's own resolved config).
 if(standaloneConfig)env.__NEXT_PRIVATE_STANDALONE_CONFIG=standaloneConfig;
 return env;
}

/** `count` distinct keys, each 32+ characters, for one rehearsal. */
export function distinctKeys(count){
 const keys=[];
 while(keys.length<count){const candidate=key();if(!keys.includes(candidate))keys.push(candidate)}
 return keys;
}

/** Where a paired TBI child reads CRC's shared library: loopback, explicit port. */
export const sharedLibraryUrlFor=port=>`http://127.0.0.1:${port}/api/shared-library`;

async function waitForNext(baseUrl,getExited,stderrTail,signal){
 const deadline=Date.now()+READY_TIMEOUT_MS;
 while(Date.now()<deadline){
  if(signal?.aborted)throw new RehearsalAbortedError();
  const exited=getExited();
  if(exited!==null)throw new RehearsalStartError(5,`next dev exited with code ${exited} before it was ready\n${stderrTail()}`);
  try{
   const response=await fetch(`${baseUrl}/api/workspace`,{cache:'no-store',signal:AbortSignal.timeout(2000)});
   if(response.status===200)return;
  }catch{}
  await sleep(POLL_MS);
 }
 throw new RehearsalStartError(5,`next dev did not answer ${baseUrl}/api/workspace within ${READY_TIMEOUT_MS/1000} s\n${stderrTail()}`);
}

/** Baseline catalog exactly as Next's `authoringCatalog()` computes it with no publications. */
async function baselineCatalog(workspaceId){
 const [{mergePublishedCatalog},{baselineCatalogForWorkspace}]=await Promise.all([import('../lib/server.ts'),import('../lib/workspace-catalog.ts')]);
 const cues=mergePublishedCatalog(baselineCatalogForWorkspace(workspaceId),[]);
 return {cues,version:createHash('sha256').update(JSON.stringify(cues)).digest('hex').slice(0,16)};
}

async function initializeRelay(relayUrl,secret,workspaceId){
 const catalog=await baselineCatalog(workspaceId);
 const body={state:{revision:0,cue:null,mode:'animate',updated:0,cuePayload:null},catalogVersion:catalog.version,cues:catalog.cues};
 const response=await fetch(`${relayUrl}/initialize`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
 if(response.status===409)return {initialized:false,cues:catalog.cues.length};
 if(response.status!==201)throw new Error(`relay stub refused initialization (${response.status})`);
 return {initialized:true,cues:catalog.cues.length};
}

function killTree(child){
 return new Promise(resolve=>{
  if(child.exitCode!==null||child.signalCode!==null)return resolve();
  const timer=setTimeout(resolve,10_000);
  child.once('exit',()=>{clearTimeout(timer);resolve()});
  if(process.platform==='win32')execFile('taskkill',['/pid',String(child.pid),'/T','/F'],()=>{});
  else child.kill('SIGTERM');
 });
}

const PHASE_DEVELOPMENT_SERVER='phase-development-server';
const PAIR_ISOLATION_HELP='paired rehearsal needs a private Next build directory for each dev server';

function refuseInheritedCredential(){
 const forbidden=inheritedCredential();
 if(forbidden)throw new RehearsalStartError(2,`${forbidden} is set in this shell; rehearsal never holds production credentials; unset it or run from a clean shell`);
}

/** `--google` names what it needs and refuses before anything is spawned. Names only. */
function requireGoogleCredentials(google){
 if(!google)return;
 const missing=missingGoogleCredentials();
 if(missing.length)throw new RehearsalStartError(7,`--google needs ${missing.join(' and ')} in this shell; set ${missing.length>1?'them':'it'} or run without --google`);
}

/** Every port must be a real TCP port, distinct from the others, and free. */
async function requireFreePorts(entries){
 const seen=new Map();
 for(const [label,candidate] of entries){
  if(!Number.isInteger(candidate)||candidate<1||candidate>65535)throw new RehearsalStartError(3,`${label} port ${candidate} is not a valid TCP port`);
  if(seen.has(candidate))throw new RehearsalStartError(3,`port ${candidate} cannot serve both ${seen.get(candidate)} and ${label}`);
  seen.set(candidate,label);
 }
 for(const [label,candidate] of entries)if(!await portFree(candidate))throw new RehearsalStartError(3,`port ${candidate} (${label}) is already in use; free it or kill a leftover rehearsal process`);
}

/**
 * A Next config JSON for one paired child, with its own build directory.
 *
 * Next 16 holds an exclusive lock on `<distDir>/lock` for the checkout, so the pair's two
 * `next dev` children cannot share `.next/dev`. `distDir` can only come from the resolved
 * Next config, so this asks Next for its own resolved development config (next.config.ts
 * included, untouched), repoints distDir at `.next/rehearsal/<label>` — inside the ignored
 * `.next`, so nothing new appears in git or lint — and hands it back through the private
 * standalone-config variable. The TypeScript pointer moves to a generated copy under `work/`
 * too, because Next appends its own `types` globs to whichever tsconfig the config names and
 * the repository's tsconfig.json must not grow entries for a rehearsal build directory.
 */
async function isolatedBuildConfig(label){
 // Forward slashes deliberately: Turbopack resolves the tsconfig's `paths` against the
 // directory it parses out of this value, and a Windows-separated path reads as a root-level
 // file, which would send `@/*` to the wrong place.
 const relativeTsconfig=`work/rehearsal/tsconfig.pair-${label}.json`;
 let config;
 try{
  const source=JSON.parse(await readFile(path.join(ROOT,'tsconfig.json'),'utf8'));
  // Turbopack resolves `@/*` through that same tsconfig, so the copy re-points the alias at
  // the repository root it now sits two directories below.
  const generated={...source,compilerOptions:{...source.compilerOptions,paths:{'@/*':['../../*']}},include:['../../next-env.d.ts'],exclude:['../../node_modules']};
  await mkdir(path.join(ROOT,'work','rehearsal'),{recursive:true});
  await writeFile(path.join(ROOT,relativeTsconfig),`${JSON.stringify(generated,null,1)}\n`);
  const loadConfig=createRequire(import.meta.url)('next/dist/server/config.js').default;
  if(typeof loadConfig!=='function')throw new Error('next/dist/server/config.js exports no config loader');
  config=await loadConfig(PHASE_DEVELOPMENT_SERVER,ROOT);
  if(typeof config?.distDir!=='string')throw new Error('the resolved Next config has no distDir');
 }catch(error){throw new RehearsalStartError(6,`${PAIR_ISOLATION_HELP}, and this Next build does not offer one (${error.message}); run npm run rehearsal without --pair`)}
 config.distDirRoot=path.join('.next','rehearsal',label);
 config.distDir=path.join('.next','rehearsal',label,'dev');
 config.typescript={...config.typescript,tsconfigPath:relativeTsconfig};
 return JSON.stringify(config);
}

/**
 * One rehearsal instance: relay stub in this process, `next dev` as a child, one state file.
 * Callers check credentials and ports first (a pair checks all four ports together).
 */
async function spawnInstance({port,relayPort,stateFile,workspaceId,keys,childOptions={},log,signal}){
 const throwIfAborted=()=>{if(signal?.aborted)throw new RehearsalAbortedError()};
 const [relaySecret,controlKey,outputKey]=keys??distinctKeys(3);
 const prefix=workspaceId?`${workspaceId}: `:'';
 // relay/child/stop are wired up before anything is spawned so a signal that lands
 // mid-boot (see main()) always has something concrete to tear down.
 let relay=null,child=null,stopped=false;
 const stop=async()=>{
  if(stopped)return;stopped=true;
  if(child)await killTree(child);
  if(relay)await relay.close();
  await rm(stateFile,{force:true});
 };
 try{
  relay=await startRehearsalRelay({port:relayPort,secret:relaySecret});
  throwIfAborted();
  // Next dev reports request.url with hostname `localhost` whatever Host was sent, and
  // same-site writes compare Origin against it, so clients must use this exact origin.
  const baseUrl=`http://localhost:${port}`;
  const stderrLines=[];
  const remember=chunk=>{for(const line of String(chunk).split(/\r?\n/))if(line.trim()){stderrLines.push(line);if(stderrLines.length>40)stderrLines.shift()}};
  child=spawn(process.execPath,[NEXT_BIN,'dev','--port',String(port)],{cwd:ROOT,env:childEnv({relayPort,relaySecret,controlKey,outputKey,workspaceId,...childOptions}),stdio:['ignore','pipe','pipe'],windowsHide:true});
  // Observed from the instant the child exists, not only once main() attaches its own
  // listener after this function returns.
  let childExited=null;
  child.once('exit',code=>{childExited=code??1});
  const tag=workspaceId?`[next ${workspaceId}]`:'[next]';
  const forward=stream=>{let rest='';stream.setEncoding('utf8');stream.on('data',chunk=>{rest+=chunk;const lines=rest.split(/\r?\n/);rest=lines.pop()??'';for(const line of lines)if(line.trim()&&log)log(`${tag} ${line}`)})};
  forward(child.stdout);
  child.stderr.on('data',remember);
  forward(child.stderr);
  try{await waitForNext(baseUrl,()=>childExited,()=>stderrLines.join('\n'),signal)}
  catch(error){
   if(stderrLines.some(line=>line.includes('Another next dev server is already running')))throw new RehearsalStartError(6,`${PAIR_ISOLATION_HELP}: another next dev server already holds this checkout, and this one was refused before it could serve ${baseUrl}`);
   throw error;
  }
  throwIfAborted();
  const initialized=await initializeRelay(relay.url,relaySecret,workspaceId);
  if(log)log(initialized.initialized?`${prefix}relay stub initialized with the ${initialized.cues}-graphic baseline catalog`:`${prefix}relay stub was already initialized`);
  throwIfAborted();
  // Turbopack and tsx serialize cues.json floats differently (0.21000000000000002 vs
  // 0.21), so the catalog version hashed here never matches Next's. Let Next push its own
  // authoring catalog so /health reports synchronization as current. Pushing the catalog is
  // an authoring act, and since 2026-09-14 the shared control key no longer authors
  // (lib/access.ts), so this signs in as the seeded rehearsal owner exactly as a person would.
  const session=await ownerSession(baseUrl);
  const synced=await fetch(`${baseUrl}/api/live-catalog`,{method:'POST',headers:{Cookie:session,Origin:baseUrl},signal:AbortSignal.timeout(10_000)});
  if(!synced.ok)throw new Error(`live catalog synchronization failed (${synced.status})`);
  if(log)log(`${prefix}live catalog synchronized from Next (version ${(await synced.json()).version})`);
  throwIfAborted();
  const startedAt=new Date().toISOString();
  // `google` is a boolean mode marker only; neither Google value is ever written here.
  const record={baseUrl,relayUrl:relay.url,controlKey,outputKey,workspaceId:workspaceId??'crc',google:Boolean(childOptions.google),pid:process.pid,nextPid:child.pid,startedAt};
  await mkdir(path.dirname(stateFile),{recursive:true});
  await writeFile(stateFile,`${JSON.stringify(record,null,1)}\n`);
  throwIfAborted();
  return {...record,child,stop};
 }catch(error){
  await stop();
  throw error;
 }
}

/**
 * Boots a rehearsal: relay stub in this process, `next dev` as a child.
 * options: {port=5175, relayPort=8788, log=(line)=>void|null}
 * Resolves to {baseUrl, relayUrl, controlKey, outputKey, pid, startedAt, stop()}.
 */
export async function startRehearsal(options={}){
 const port=options.port??DEFAULT_REHEARSAL_PORT;
 const relayPort=options.relayPort??DEFAULT_REHEARSAL_RELAY_PORT;
 const log=options.log===undefined?line=>process.stdout.write(`${line}\n`):options.log;
 const signal=options.signal;
 refuseInheritedCredential();
 requireGoogleCredentials(options.google);
 if(signal?.aborted)throw new RehearsalAbortedError();
 await requireFreePorts([['next dev',port],['relay stub',relayPort]]);
 if(signal?.aborted)throw new RehearsalAbortedError();
 return spawnInstance({port,relayPort,stateFile:STATE_FILE,childOptions:{bookFaces:options.bookFaces,google:options.google},log,signal});
}

/**
 * Boots CRC and TBI together from this one process: two relay stubs, two `next dev` children,
 * one generated shared-library key (CRC exports with it, TBI imports with it). CRC comes up
 * first because TBI's library feed points back at it.
 * options: {port=5175, relayPort=8788, tbiPort=5176, tbiRelayPort=8789, log, signal}
 * Resolves to {crc, tbi, sharedLibraryUrl, stop()}.
 */
export async function startRehearsalPair(options={}){
 const port=options.port??DEFAULT_REHEARSAL_PORT;
 const relayPort=options.relayPort??DEFAULT_REHEARSAL_RELAY_PORT;
 const tbiPort=options.tbiPort??DEFAULT_REHEARSAL_TBI_PORT;
 const tbiRelayPort=options.tbiRelayPort??DEFAULT_REHEARSAL_TBI_RELAY_PORT;
 const log=options.log===undefined?line=>process.stdout.write(`${line}\n`):options.log;
 const signal=options.signal;
 const throwIfAborted=()=>{if(signal?.aborted)throw new RehearsalAbortedError()};
 refuseInheritedCredential();
 requireGoogleCredentials(options.google);
 throwIfAborted();
 await requireFreePorts([['CRC next dev',port],['CRC relay stub',relayPort],['TBI next dev',tbiPort],['TBI relay stub',tbiRelayPort]]);
 throwIfAborted();
 // Seven keys from one draw: the shared library key can never equal either child's control
 // key, output key, or relay secret.
 const [sharedLibraryKey,...instanceKeys]=distinctKeys(7);
 const sharedLibraryUrl=sharedLibraryUrlFor(port);
 const crcConfig=await isolatedBuildConfig('crc'),tbiConfig=await isolatedBuildConfig('tbi');
 let crc=null,tbi=null,stopped=false;
 const stop=async()=>{
  if(stopped)return;stopped=true;
  if(tbi)await tbi.stop();
  if(crc)await crc.stop();
 };
 try{
  crc=await spawnInstance({port,relayPort,stateFile:STATE_FILE,keys:instanceKeys.slice(0,3),childOptions:{bookFaces:options.bookFaces,google:options.google,sharedLibraryExportKey:sharedLibraryKey,standaloneConfig:crcConfig},log,signal});
  throwIfAborted();
  tbi=await spawnInstance({port:tbiPort,relayPort:tbiRelayPort,stateFile:STATE_FILE_TBI,workspaceId:TBI_WORKSPACE_ID,keys:instanceKeys.slice(3,6),childOptions:{bookFaces:options.bookFaces,google:options.google,sharedLibraryUrl,sharedLibraryImportKey:sharedLibraryKey,standaloneConfig:tbiConfig},log,signal});
  throwIfAborted();
  return {crc,tbi,sharedLibraryUrl,stop};
 }catch(error){
  await stop();
  throw error;
 }
}

export function parseArgs(argv){
 const options={port:DEFAULT_REHEARSAL_PORT,relayPort:DEFAULT_REHEARSAL_RELAY_PORT,tbiPort:DEFAULT_REHEARSAL_TBI_PORT,tbiRelayPort:DEFAULT_REHEARSAL_TBI_RELAY_PORT,pair:false,bookFaces:false,google:false};
 for(let index=0;index<argv.length;index+=1){
  const [flag,inline]=argv[index].split('=');
  if(flag==='--book-faces'){options.bookFaces=true;continue}
  if(flag==='--pair'){options.pair=true;continue}
  if(flag==='--google'){options.google=true;continue}
  const value=inline??argv[++index];
  if(flag==='--port')options.port=Number(value);
  else if(flag==='--relay-port')options.relayPort=Number(value);
  else if(flag==='--tbi-port')options.tbiPort=Number(value);
  else if(flag==='--tbi-relay-port')options.tbiRelayPort=Number(value);
  else throw new RehearsalStartError(2,`unknown argument ${flag}; supported: --port <n> --relay-port <n> --pair --tbi-port <n> --tbi-relay-port <n> --book-faces --google`);
 }
 return options;
}

function instanceLines(instance,port,stateFile){
 const origin=`http://localhost:${port}`;
 return [
  `  console   ${origin}/`,
  `  output    ${origin}/output#key=${instance.outputKey}`,
  `  author    ${origin}/author`,
  `  access    ${origin}/access`,
  `  health    ${origin}/health`,
  `  relay     ${instance.relayUrl}`,
  `  CONTROL_KEY=${instance.controlKey}`,
  `  owner sign-in  ${REHEARSAL_OWNER_EMAIL} / ${REHEARSAL_OWNER_PASSWORD}`,
  `  state file     ${path.relative(ROOT,stateFile)}`,
 ];
}

function banner(instance,port){
 return [
  '',
  'CRC overlays rehearsal is ready (memory stores, local relay stub, no production credentials).',
  ...instanceLines(instance,port,STATE_FILE).slice(0,-1),
  `  state file     ${path.relative(ROOT,STATE_FILE)} (for npm run rehearsal:check --attach)`,
  '  Ctrl+C stops everything.',
  '',
 ].join('\n');
}

export function pairBanner(pair,{port,tbiPort}){
 return [
  '',
  'CRC + TBI paired rehearsal is ready (memory stores, two local relay stubs, no production credentials).',
  '',
  'CRC (Central Reform Congregation)',
  ...instanceLines(pair.crc,port,STATE_FILE),
  '',
  "TBI (Temple B'nai Israel)",
  ...instanceLines(pair.tbi,tbiPort,STATE_FILE_TBI),
  '',
  `  TBI reads CRC's shared library at ${pair.sharedLibraryUrl} with one generated key held`,
  '  only by these two children; loopback http is accepted there only in rehearsal mode.',
  '  npm run rehearsal:check -- --pair attaches to both state files.',
  '  Ctrl+C stops everything.',
  '',
 ].join('\n');
}

async function main(){
 const forbidden=inheritedCredential();
 if(forbidden){
  console.error(`rehearsal refused: ${forbidden} is set in this shell; rehearsal never holds production credentials; unset it or run from a clean shell`);
  process.exit(2);
 }
 let options;
 try{options=parseArgs(process.argv.slice(2))}catch(error){console.error(`rehearsal refused: ${error.message}`);process.exit(error.exitCode??2)}
 try{requireGoogleCredentials(options.google)}catch(error){console.error(`rehearsal refused: ${error.message}`);process.exit(error.exitCode)}
 const controller=new AbortController();
 let running=null,exiting=false;
 const finish=async code=>{
  if(exiting)return;exiting=true;
  if(running)await running.stop();
  process.exit(code);
 };
 // Registered before anything is spawned (exit codes unchanged: 2 credential, 3 port,
 // 5 not ready, 6 no private build directory, 7 missing --google variable, 0 on signal), so
 // a signal during the up-to-90 s boot still stops every dev server tree and relay stub
 // instead of orphaning them.
 for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{
  process.stdout.write(`\n${signal} received; stopping rehearsal\n`);
  controller.abort();
  if(running)void finish(0);
 });
 let started;
 try{started=await (options.pair?startRehearsalPair:startRehearsal)({...options,signal:controller.signal})}
 catch(error){
  if(error instanceof RehearsalAbortedError)process.exit(0);
  console.error(`rehearsal failed: ${error.message}`);
  process.exit(error instanceof RehearsalStartError?error.exitCode:1);
 }
 running=started;
 if(exiting)return;
 const children=options.pair?[['CRC',started.crc.child],['TBI',started.tbi.child]]:[['',started.child]];
 process.stdout.write(options.pair?pairBanner(started,options):banner(started,options.port));
 for(const [name,child] of children)child.on('exit',code=>{
  if(!exiting)process.stdout.write(`${name?`${name} `:''}next dev exited (${code??'signal'}); stopping rehearsal\n`);
  void finish(code??0);
 });
}

const entry=process.argv[1]?path.resolve(process.argv[1]):'';
if(entry===fileURLToPath(import.meta.url))await main();
