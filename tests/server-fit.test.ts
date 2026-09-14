import test from 'node:test';
import assert from 'node:assert/strict';
import {measureCueOnServer,serverRendererVersion,SERVER_RENDERER_PREFIX,STAGE_PATH,type StageBrowser,type StageLauncher,type StageMeasurement} from '../lib/server-fit.ts';
import type {Cue} from '../lib/player.ts';

const ORIGIN='https://crc-overlays.example';
const CUE={id:'cue-1',name:'Barechu',title:'Barechu',layout:'bottom',texts:{}} as unknown as Cue;

type Visited={viewport:{width:number;height:number}|null;url:string|null;waited:string|null;evaluated:Cue|null;closed:number};

/** A fake Playwright: no browser, no network. `page.evaluate` returns whatever the stage would. */
function fakeLauncher(measure:(cue:Cue)=>Promise<StageMeasurement>|StageMeasurement,visited:Visited):StageLauncher{
 return async()=>({
  async newPage(){
   return {
    async setViewportSize(size){visited.viewport=size},
    async goto(url){visited.url=url;return null},
    async waitForFunction(expression){visited.waited=expression;return true},
    async evaluate<Result,Arg>(_fn:(arg:Arg)=>Result|Promise<Result>,arg:Arg){visited.evaluated=arg as unknown as Cue;return await measure(arg as unknown as Cue) as unknown as Result},
   };
  },
  async close(){visited.closed++;return null},
 } satisfies StageBrowser);
}
const fresh=():Visited=>({viewport:null,url:null,waited:null,evaluated:null,closed:0});

test('a clean cue measured on the server passes and reports the server renderer',async()=>{
 const visited=fresh();
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:fakeLauncher(()=>({fitErrors:[],warnings:[],fill:0.62}),visited)});
 assert.equal(result.verdict,'pass');
 assert.deepEqual(visited.viewport,{width:1920,height:1080});
 assert.equal(visited.url,`${ORIGIN}${STAGE_PATH}`);
 assert.match(visited.waited??'',/__measureCue/);
 assert.equal(visited.evaluated?.id,'cue-1');
 assert.equal(visited.closed,1);
 assert.ok(result.rendererVersion.startsWith(SERVER_RENDERER_PREFIX));
 assert.equal(result.fill,0.62);
});

test('the server verdict carries the same error strings findFitErrors produces',async()=>{
 // Exactly the sentences app/author/preview.ts emits, passed through unaltered so the MCP
 // verdict and the editor verdict read identically.
 const errors=['Graphic does not fit its box.','Prayer overlaps Workspace logo.'];
 const visited=fresh();
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:fakeLauncher(()=>({fitErrors:errors,warnings:['Sparse — consider Lower third'],fill:0.2}),visited)});
 assert.equal(result.verdict,'fail');
 assert.deepEqual(result.fitErrors,errors);
 assert.deepEqual(result.warnings,['Sparse — consider Lower third']);
 assert.equal(visited.closed,1);
});

test('a launch failure is unavailable, not an exception',async()=>{
 const result=await measureCueOnServer(CUE,{origin:ORIGIN,launch:async()=>{throw Error('spawn ENOENT')}});
 assert.deepEqual(result,{verdict:'unavailable',reason:'browser_unavailable'});
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

test('the renderer version names the playwright build that measured',async()=>{
 assert.match(serverRendererVersion(),/^server-chromium\/\d+\.\d+\.\d+$/);
});
