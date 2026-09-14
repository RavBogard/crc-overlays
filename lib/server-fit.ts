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

import {createRequire} from 'node:module';
import type {Cue} from './player';

export const SERVER_FIT_DEADLINE_MS=25_000;
export const SERVER_RENDERER_PREFIX='server-chromium/';
export const STAGE_PATH='/author/fit-stage';

/** What the stage hands back; the shape of `window.__measureCue`'s resolution. */
export type StageMeasurement={fitErrors:string[];warnings:string[];fill:number|null};
export type ServerFitMeasured={verdict:'pass'|'fail';fitErrors:string[];warnings:string[];fill:number|null;measuredAt:number;rendererVersion:string};
export type ServerFitUnavailable={verdict:'unavailable';reason:string};
export type ServerFitResult=ServerFitMeasured|ServerFitUnavailable;

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
export type StageLauncher=()=>Promise<StageBrowser>;

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

async function defaultLaunch():Promise<StageBrowser>{
 const {chromium}=await import('playwright-core');
 const plan=launchPlan();
 if(plan.kind==='sparticuz'){
  const loaded=await import('@sparticuz/chromium');
  const pack=((loaded as {default?:unknown}).default??loaded) as {args:string[];executablePath:()=>Promise<string>};
  return await chromium.launch({args:pack.args,executablePath:await pack.executablePath(),headless:true}) as unknown as StageBrowser;
 }
 if(plan.kind==='executable')return await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,headless:true}) as unknown as StageBrowser;
 return await chromium.launch({channel:'chrome',headless:true}) as unknown as StageBrowser;
}

class DeadlineExpired extends Error{constructor(){super('deadline_exceeded')}}

function withDeadline<T>(deadlineMs:number,run:()=>Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 return Promise.race([
  run(),
  new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new DeadlineExpired()),deadlineMs)}),
 ]).finally(()=>{if(timer)clearTimeout(timer)});
}

function stageMeasurement(value:unknown):StageMeasurement|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as {fitErrors?:unknown;warnings?:unknown;fill?:unknown};
 const list=(entry:unknown)=>Array.isArray(entry)&&entry.every(item=>typeof item==='string')?entry as string[]:null;
 const fitErrors=list(raw.fitErrors),warnings=list(raw.warnings);
 if(!fitErrors||!warnings)return null;
 const fill=typeof raw.fill==='number'&&Number.isFinite(raw.fill)?raw.fill:null;
 return {fitErrors,warnings,fill};
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
export async function measureCueOnServer(cue:Cue,options:{origin:string;deadlineMs?:number;launch?:StageLauncher}):Promise<ServerFitResult>{
 const deadlineMs=options.deadlineMs??SERVER_FIT_DEADLINE_MS;
 const launch=options.launch??defaultLaunch;
 const started=Date.now();
 const remaining=()=>Math.max(1,deadlineMs-(Date.now()-started));
 let browser:StageBrowser|undefined;
 try{
  const measurement=await withDeadline(deadlineMs,async()=>{
   browser=await launch();
   const page=await browser.newPage();
   await page.setViewportSize({width:1920,height:1080});
   await page.goto(new URL(STAGE_PATH,options.origin).toString(),{waitUntil:'load',timeout:remaining()});
   await page.waitForFunction('typeof window.__measureCue === "function"',undefined,{timeout:remaining()});
   return await page.evaluate<unknown,Cue>(value=>(window as unknown as {__measureCue:(input:Cue)=>Promise<StageMeasurement>}).__measureCue(value),cue);
  });
  const measured=stageMeasurement(measurement);
  if(!measured)return {verdict:'unavailable',reason:'measurement_invalid'};
  return {verdict:measured.fitErrors.length?'fail':'pass',fitErrors:measured.fitErrors,warnings:measured.warnings,fill:measured.fill,measuredAt:Date.now(),rendererVersion:serverRendererVersion()};
 }catch(error){
  return {verdict:'unavailable',reason:error instanceof DeadlineExpired?'deadline_exceeded':'browser_unavailable'};
 }finally{
  // The browser is closed on every path, including the deadline: a leaked Chromium would
  // outlive the function invocation that started it.
  if(browser)await Promise.resolve(browser.close()).catch(()=>{});
 }
}
