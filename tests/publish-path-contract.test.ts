import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=(path:string)=>readFileSync(fileURLToPath(new URL(`../${path}`,import.meta.url)),'utf8');
const routeConfig=(source:string)=>({
 runtime:source.match(/export const runtime\s*=\s*'([^']+)'/)?.[1]??null,
 maxDuration:source.match(/export const maxDuration\s*=\s*(\d+)/)?.[1]??null,
});

// R7 - a fit check launches headless Chromium, and an MCP client reaches it through /api/mcp
// while the editor reaches it through /api/authoring. A platform default on either one cuts a
// cold Chromium start off mid-launch, so the two routes must carry the same function config.
test('the two routes that can launch a browser carry the same function config',()=>{
 const authoring=routeConfig(read('app/api/authoring/route.ts'));
 const mcp=routeConfig(read('app/api/mcp/route.ts'));
 assert.equal(authoring.runtime,'nodejs');
 assert.deepEqual(mcp,authoring);
});

// The legacy right-panel block predates structured content rows. `.right .prayer` set a fixed
// 600x560 box and a 33px size, and a row channel's class list is `prayer row-hebrew|...`, so on
// a right panel every channel was forced to 560 px tall and one font size - three stacked
// channels measuring past the 842 px budget however far spacing was compacted. The left panel
// has no counterpart rule, which is why only right-panel rows overflowed. Whatever a rule like
// this does to a panel that has no rows, it must not reach a row channel.
test('no panel rule reaches into structured row channels',()=>{
 const css=read('app/globals.css');
 const offenders:string[]=[];
 for(const [,selector] of css.matchAll(/([^{}]+)\{[^{}]*\}/g)){
  for(const part of selector.split(',')){
   const one=part.trim();
   if(!/^\.(left|right)\s+\.prayer\b/.test(one))continue;
   if(!one.includes(':not(.content-row *)'))offenders.push(one);
  }
 }
 assert.deepEqual(offenders,[],`these rules still reach row channels: ${offenders.join(', ')}`);
});
