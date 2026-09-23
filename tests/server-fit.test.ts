import test from 'node:test';
import assert from 'node:assert/strict';
import {measureCueOnServer,serverRendererVersion,SERVER_FIT_PREVIEW_IMAGE_MAX_BYTES,SERVER_RENDERER_PREFIX,STAGE_PATH,type StageBrowser,type StageLauncher,type StageMeasurement} from '../lib/server-fit.ts';
import {SERVER_RENDERER_PREFIX as CONTRACT_PREFIX} from '../lib/server-fit-contract.ts';
import type {Cue} from '../lib/player.ts';

const ORIGIN='https://crc-overlays.example';
const CUE={id:'cue-1',name:'Barechu',title:'Barechu',layout:'bottom',texts:{}} as unknown as Cue;

type Visited={viewport:{width:number;height:number}|null;url:string|null;gotoWaitUntil:string|null;waited:string|null;evaluated:Cue|null;closed:number;screenshots:number;screenshotOptions:{type:'jpeg'|'png';quality?:number}|null;retainRequested:boolean;cleanups:number};

/** A fake Playwright: no browser, no network. `page.evaluate` returns whatever the stage would. */
function fakeLauncher(measure:(cue:Cue)=>Promise<StageMeasurement>|StageMeasurement,visited:Visited,screenshot?:()=>Promise<Uint8Array>):StageLauncher{
 return async()=>({
  async newPage(){
   return {
    async setViewportSize(size){visited.viewport=size},
    async goto(url,options){visited.url=url;visited.gotoWaitUntil=options?.waitUntil??null;return null},
    async waitForFunction(expression){visited.waited=expression;return true},
    async evaluate<Result,Arg>(_fn:(arg:Arg)=>Result|Promise<Result>,arg:Arg){
     const input=arg as unknown as {cue?:Cue;options?:{retainRenderedCue?:boolean}}|undefined;
     if(input?.cue){visited.evaluated=input.cue;visited.retainRequested=input.options?.retainRenderedCue===true;return await measure(input.cue) as unknown as Result}
     visited.cleanups++;return undefined as Result;
    },
    ...(screenshot?{async screenshot(options:{type:'jpeg'|'png';quality?:number}){visited.screenshots++;visited.screenshotOptions=options;return await screenshot();}}:{}),
   };
  },
  async close(){visited.closed++;return null},
 } satisfies StageBrowser);
}
const fresh=():Visited=>({viewport:null,url:null,gotoWaitUntil:null,waited:null,evaluated:null,closed:0,screenshots:0,screenshotOptions:null,retainRequested:false,cleanups:0});

test('a clean cue measured on the server passes and reports the server renderer',async()=>{
 const visited=fresh();
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.62,artwork:'loaded'}),visited)});
 assert.equal(result.verdict,'pass');
 assert.deepEqual(visited.viewport,{width:1920,height:1080});
 assert.equal(visited.url,`${ORIGIN}${STAGE_PATH}`);
 assert.equal(visited.gotoWaitUntil,'domcontentloaded');
 assert.match(visited.waited??'',/__measureCue/);
 assert.equal(visited.evaluated?.id,'cue-1');
 assert.equal(visited.closed,1);
 assert.ok(result.rendererVersion.startsWith(SERVER_RENDERER_PREFIX));
 assert.equal(SERVER_RENDERER_PREFIX,CONTRACT_PREFIX,'the prefix comes from the contract module, re-exported');
 assert.equal(result.fill,0.62);
 assert.equal(result.artwork,'loaded');
 assert.equal(visited.screenshots,0,'a normal fit never captures an image');
 assert.equal(visited.cleanups,0,'the ordinary stage path disposes itself');
});

test('an opt-in image captures the exact retained 1920 by 1080 stage and explicitly cleans it up',async()=>{
 const visited=fresh(),bytes=new Uint8Array([1,2,3,4]);
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,includePreviewImage:true,launch:fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.62,artwork:'not-loaded'}),visited,async()=>bytes)});
 assert.equal(result.verdict,'pass');
 assert.deepEqual(result.previewImage,{mimeType:'image/jpeg',dataBase64:Buffer.from(bytes).toString('base64'),width:1920,height:1080});
 assert.equal(result.artwork,'not-loaded','private artwork remains an explicit caveat');
 assert.equal(visited.retainRequested,true);assert.deepEqual(visited.screenshotOptions,{type:'jpeg',quality:65});
 assert.equal(visited.screenshots,1);assert.equal(visited.cleanups,1);assert.equal(visited.closed,1);
});

test('a screenshot failure is explicit and does not fabricate visual proof for a passing fit',async()=>{
 const visited=fresh();
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,includePreviewImage:true,launch:fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.5,artwork:'none'}),visited,async()=>{throw Error('screenshot failed')})});
 assert.equal(result.verdict,'pass');assert.equal(result.previewImage,null);assert.equal(result.previewImageUnavailable,'screenshot_failed');
 assert.equal(visited.cleanups,1);assert.equal(visited.closed,1);
});

test('an over-budget capture is withheld with an explicit reason',async()=>{
 const visited=fresh(),bytes=new Uint8Array(SERVER_FIT_PREVIEW_IMAGE_MAX_BYTES+1);
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,includePreviewImage:true,launch:fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.5,artwork:'none'}),visited,async()=>bytes)});
 assert.equal(result.verdict,'pass');assert.equal(result.previewImage,null);assert.equal(result.previewImageUnavailable,'image_too_large');
 assert.equal(visited.cleanups,1);
});

test('the server verdict carries the same error strings findFitErrors produces',async()=>{
 // Exactly the sentences app/author/preview.ts emits, passed through unaltered so the MCP
 // verdict and the editor verdict read identically.
 const errors=['Graphic does not fit its box.','Prayer overlaps Workspace logo.'];
 const visited=fresh();
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:fakeLauncher(()=>({fitErrors:errors,warnings:['Sparse — consider Lower third'],fill:0.2,artwork:'none'}),visited)});
 assert.equal(result.verdict,'fail');
 assert.deepEqual(result.fitErrors,errors);
 assert.deepEqual(result.warnings,['Sparse — consider Lower third']);
 assert.equal(visited.closed,1);
});

test('a launch failure is unavailable, not an exception',async()=>{
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:async()=>{throw Error('spawn ENOENT')}});
 assert.deepEqual(result,{verdict:'unavailable',reason:'browser_unavailable'});
});

test('a browser that launched but a stage that never answered says so',async()=>{
 // The two failures wear one word to the caller, so the reason is the only place they part:
 // `browser_unavailable` is "this function has no Chromium" (the tar-fs trace gap of
 // 2026-09-16), `stage_unavailable` is "Chromium ran and /author/fit-stage did not answer".
 let closed=0;
 const launch:StageLauncher=async()=>({
  async newPage(){return {async setViewportSize(){},async goto(){throw Error('net::ERR_ABORTED')},async waitForFunction(){return true},async evaluate<Result>(){return null as unknown as Result}}},
  async close(){closed++;return null},
 } satisfies StageBrowser);
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch});
 assert.deepEqual(result,{verdict:'unavailable',reason:'stage_unavailable'});
 assert.equal(closed,1);
});

test('the hard deadline is unavailable and still closes the browser',async()=>{
 const visited=fresh();
 const launch=fakeLauncher(()=>new Promise<StageMeasurement>(()=>{}),visited);
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,deadlineMs:25,launch});
 assert.deepEqual(result,{verdict:'unavailable',reason:'deadline_exceeded'});
 assert.equal(visited.closed,1);
});

test('a malformed measurement from the stage is unavailable rather than a false pass',async()=>{
 const visited=fresh();
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:fakeLauncher(()=>({fitErrors:'none'} as unknown as StageMeasurement),visited)});
 assert.deepEqual(result,{verdict:'unavailable',reason:'measurement_invalid'});
});

test('the artwork label the stage reports is carried through unaltered',async()=>{
 // A4 - labelling only. `findFitErrors` never evaluates artwork, so every one of these is
 // still a pass; the result simply says what the server could and could not see.
 for(const artwork of ['none','loaded','not-loaded'] as const){
  const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.5,artwork}),fresh())});
  assert.equal(result.verdict,'pass');
  assert.equal(result.verdict==='pass'?result.artwork:null,artwork);
 }
 // A stage that says nothing is read as `none` rather than rejected as malformed.
 const silent=await measureCueOnServer(CUE,{origin:ORIGIN,launch:fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.5} as unknown as StageMeasurement),fresh())});
 assert.equal(silent.verdict==='pass'?silent.artwork:null,'none');
});

test('a launch that outruns the deadline is closed when it finally lands',async()=>{
 // A3 - `browser` is still undefined in `finally` when the launch itself loses the race, so
 // without holding the launch promise the late Chromium would leak for the rest of the
 // invocation. The call must still return promptly: it does not wait for the late browser.
 const visited=fresh();
 let closed:()=>void;
 const wasClosed=new Promise<void>(resolve=>{closed=resolve});
 const slow=fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.5,artwork:'none'}),visited);
 const launch:StageLauncher=()=>new Promise<StageBrowser>(resolve=>{
  setTimeout(async()=>{const browser=await slow('');resolve({...browser,async close(){visited.closed++;closed();return null}})},60);
 });
 const started=Date.now();
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,deadlineMs:10,launch});
 assert.deepEqual(result,{verdict:'unavailable',reason:'deadline_exceeded'});
 assert.ok(Date.now()-started<50,'the deadline returns without waiting for the late launch');
 assert.equal(visited.closed,0,'nothing to close yet - the browser has not arrived');
 await wasClosed;
 assert.equal(visited.closed,1,'the late browser is closed rather than leaked');
});

test('the renderer version names the playwright build that measured',async()=>{
 assert.match(serverRendererVersion(),/^server-chromium\/\d+\.\d+\.\d+$/);
});
