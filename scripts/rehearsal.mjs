// Agent-facing rehearsal orchestrator (docs/REHEARSAL-MODE.md). Runs under tsx:
//   npm run rehearsal            (this file as the entry)
//   import {startRehearsal} from './rehearsal.mjs'   (scripts/check-rehearsal.mjs)
//
// Boots the in-process relay stub (scripts/rehearsal-relay.ts) inside THIS process and
// spawns `next dev` as a child with a minimal, explicit environment. Never loads any
// .env* file and refuses to start if production-shaped credentials are inherited.
//
// Exit codes: 2 inherited credential, 3 port busy, 4 (reserved: .env file present when
// the runtime would honour it), 5 Next did not answer /api/workspace within 90 s.
import {execFile,spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_REHEARSAL_RELAY_PORT,startRehearsalRelay} from './rehearsal-relay.ts';

export const DEFAULT_REHEARSAL_PORT=5175;
export const FORBIDDEN_ENV=['DATABASE_URL','RELAY_SECRET','CONTROL_KEY','OUTPUT_KEY','ACCESS_BOOTSTRAP_KEY','VERCEL'];
export const REHEARSAL_OWNER_EMAIL='rehearsal-owner@rehearsal.invalid';
export const REHEARSAL_OWNER_PASSWORD='rehearsal-owner-local-2026';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const NEXT_BIN=path.join(ROOT,'node_modules','next','dist','bin','next');
export const STATE_FILE=path.join(ROOT,'work','rehearsal','current.json');
const READY_TIMEOUT_MS=90_000;
const POLL_MS=500;
// Variables the Next child may inherit. Everything else is dropped so a shell that
// happens to hold production credentials cannot leak them into the rehearsal.
const INHERITED_ENV=['PATH','SYSTEMROOT','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT','NODE_PATH'];

export class RehearsalStartError extends Error{constructor(code,message){super(message);this.exitCode=code}}

const key=()=>randomBytes(32).toString('base64url');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Names the first forbidden variable present in `env`, or null. */
export function inheritedCredential(env=process.env){
 return FORBIDDEN_ENV.find(name=>env[name]!==undefined)??null;
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

function childEnv({relayPort,relaySecret,controlKey,outputKey}){
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
  // @next/env only applies a .env* key whose initial value is undefined, so a defined
  // empty string blocks any file from injecting these.
  DATABASE_URL:'',
  ACCESS_BOOTSTRAP_KEY:'',
 });
 return env;
}

async function waitForNext(baseUrl,child,stderrTail){
 const deadline=Date.now()+READY_TIMEOUT_MS;
 let exited=null;
 child.once('exit',code=>{exited=code??1});
 while(Date.now()<deadline){
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
async function baselineCatalog(){
 const [{mergePublishedCatalog},{baselineCatalogForWorkspace}]=await Promise.all([import('../lib/server.ts'),import('../lib/workspace-catalog.ts')]);
 const cues=mergePublishedCatalog(baselineCatalogForWorkspace(),[]);
 return {cues,version:createHash('sha256').update(JSON.stringify(cues)).digest('hex').slice(0,16)};
}

async function initializeRelay(relayUrl,secret){
 const catalog=await baselineCatalog();
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

/**
 * Boots a rehearsal: relay stub in this process, `next dev` as a child.
 * options: {port=5175, relayPort=8788, log=(line)=>void|null}
 * Resolves to {baseUrl, relayUrl, controlKey, outputKey, pid, startedAt, stop()}.
 */
export async function startRehearsal(options={}){
 const port=options.port??DEFAULT_REHEARSAL_PORT;
 const relayPort=options.relayPort??DEFAULT_REHEARSAL_RELAY_PORT;
 const log=options.log===undefined?line=>process.stdout.write(`${line}\n`):options.log;
 const forbidden=inheritedCredential();
 if(forbidden)throw new RehearsalStartError(2,`${forbidden} is set in this shell; rehearsal never holds production credentials; unset it or run from a clean shell`);
 for(const [label,candidate] of [['next dev',port],['relay stub',relayPort]]){
  if(!Number.isInteger(candidate)||candidate<1||candidate>65535)throw new RehearsalStartError(3,`${label} port ${candidate} is not a valid TCP port`);
  if(!await portFree(candidate))throw new RehearsalStartError(3,`port ${candidate} (${label}) is already in use; free it or kill a leftover rehearsal process`);
 }
 const relaySecret=key(),controlKey=key(),outputKey=key();
 const relay=await startRehearsalRelay({port:relayPort,secret:relaySecret});
 // Next dev reports request.url with hostname `localhost` whatever Host was sent, and
 // same-site writes compare Origin against it, so clients must use this exact origin.
 const baseUrl=`http://localhost:${port}`;
 const stderrLines=[];
 const remember=chunk=>{for(const line of String(chunk).split(/\r?\n/))if(line.trim()){stderrLines.push(line);if(stderrLines.length>40)stderrLines.shift()}};
 const child=spawn(process.execPath,[NEXT_BIN,'dev','--port',String(port)],{cwd:ROOT,env:childEnv({relayPort,relaySecret,controlKey,outputKey}),stdio:['ignore','pipe','pipe'],windowsHide:true});
 const forward=stream=>{let rest='';stream.setEncoding('utf8');stream.on('data',chunk=>{rest+=chunk;const lines=rest.split(/\r?\n/);rest=lines.pop()??'';for(const line of lines)if(line.trim()&&log)log(`[next] ${line}`)})};
 forward(child.stdout);
 child.stderr.on('data',remember);
 forward(child.stderr);
 let stopped=false;
 const stop=async()=>{
  if(stopped)return;stopped=true;
  await killTree(child);
  await relay.close();
  await rm(STATE_FILE,{force:true});
 };
 try{
  await waitForNext(baseUrl,child,()=>stderrLines.join('\n'));
  const initialized=await initializeRelay(relay.url,relaySecret);
  if(log)log(initialized.initialized?`relay stub initialized with the ${initialized.cues}-cue baseline catalog`:'relay stub was already initialized');
  // Turbopack and tsx serialize cues.json floats differently (0.21000000000000002 vs
  // 0.21), so the catalog version hashed here never matches Next's. Let Next push its own
  // authoring catalog so /health reports synchronization as current.
  const synced=await fetch(`${baseUrl}/api/live-catalog`,{method:'POST',headers:{Authorization:`Bearer ${controlKey}`},signal:AbortSignal.timeout(10_000)});
  if(!synced.ok)throw new Error(`live catalog synchronization failed (${synced.status})`);
  if(log)log(`live catalog synchronized from Next (version ${(await synced.json()).version})`);
  const startedAt=new Date().toISOString();
  await mkdir(path.dirname(STATE_FILE),{recursive:true});
  await writeFile(STATE_FILE,`${JSON.stringify({baseUrl,relayUrl:relay.url,controlKey,outputKey,pid:process.pid,nextPid:child.pid,startedAt},null,1)}\n`);
  return {baseUrl,relayUrl:relay.url,controlKey,outputKey,pid:process.pid,nextPid:child.pid,startedAt,child,stop};
 }catch(error){
  await stop();
  throw error;
 }
}

function parseArgs(argv){
 const options={port:DEFAULT_REHEARSAL_PORT,relayPort:DEFAULT_REHEARSAL_RELAY_PORT};
 for(let index=0;index<argv.length;index+=1){
  const [flag,inline]=argv[index].split('=');
  const value=inline??argv[++index];
  if(flag==='--port')options.port=Number(value);
  else if(flag==='--relay-port')options.relayPort=Number(value);
  else throw new RehearsalStartError(2,`unknown argument ${argv[index]}; supported: --port <n> --relay-port <n>`);
 }
 return options;
}

function banner(instance,port){
 const origin=`http://localhost:${port}`;
 return [
  '',
  'CRC overlays rehearsal is ready (memory stores, local relay stub, no production credentials).',
  `  console   ${origin}/`,
  `  output    ${origin}/output#key=${instance.outputKey}`,
  `  author    ${origin}/author`,
  `  access    ${origin}/access`,
  `  health    ${origin}/health`,
  `  relay     ${instance.relayUrl}`,
  `  CONTROL_KEY=${instance.controlKey}`,
  `  owner sign-in  ${REHEARSAL_OWNER_EMAIL} / ${REHEARSAL_OWNER_PASSWORD}`,
  `  state file     ${path.relative(ROOT,STATE_FILE)} (for npm run rehearsal:check --attach)`,
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
 let instance;
 try{instance=await startRehearsal(options)}
 catch(error){
  console.error(`rehearsal failed: ${error.message}`);
  process.exit(error instanceof RehearsalStartError?error.exitCode:1);
 }
 process.stdout.write(banner(instance,options.port));
 let exiting=false;
 const finish=async code=>{
  if(exiting)return;exiting=true;
  await instance.stop();
  process.exit(code);
 };
 for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,()=>{process.stdout.write(`\n${signal} received; stopping rehearsal\n`);void finish(0)});
 instance.child.on('exit',code=>{if(!exiting)process.stdout.write(`next dev exited (${code ?? 'signal'}); stopping rehearsal\n`);void finish(code??0)});
}

const entry=process.argv[1]?path.resolve(process.argv[1]):'';
if(entry===fileURLToPath(import.meta.url))await main();
