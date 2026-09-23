import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const css=readFileSync(fileURLToPath(new URL('../app/overlay.css',import.meta.url)),'utf8');
const declarations=(selector:string)=>{
 const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const body=[...css.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\{([^}]*)\\}`,'g'))].at(-1)?.[1];
 assert.ok(body,`app/overlay.css declares ${selector}`);
 return (name:string)=>Number(body!.match(new RegExp(`(?:^|;)${name}:(-?\\d+)px`))?.[1]);
};

// A custom right panel ("Thank you", "Silent Prayer") renders its lone textMain through
// `.right .prayer:not(.content-row *)`, which outranks the later `.right .combined` rule. It kept
// the pre-redesign geometry (right 72, width 600), so the text began 16px outside the current
// 640px panel. It must sit inside the panel and mirror the left panel's lone-channel box.
test('a custom right panel keeps its text inside the panel',()=>{
 const panel=declarations('.right .base,.right .titlebar');
 const text=declarations('.right .prayer:not(.content-row *)');
 const left=declarations('.left .combined,.left .single-channel');
 assert.ok(text('right')>=panel('right'),'text ends inside the panel on the right');
 assert.ok(text('right')+text('width')<=panel('right')+panel('width'),'text starts inside the panel on the left');
 assert.equal(text('right')-panel('right'),left('left')-16,'same inset as the left panel');
 assert.equal(text('width'),left('width'));
 assert.equal(text('top'),left('top'));
});
