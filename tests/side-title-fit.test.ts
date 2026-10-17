import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDE_TITLE_FLOOR,WATERMARK_FLOOR,fitSideTitles} from '../lib/player.ts';

// A text box whose content is `natural` px wide at `base` px font size, in a `room` px lane.
function box(base:number,natural:number,room:number,height=60){
 const el={style:{fontSize:'',visibility:''} as {fontSize:string;visibility:string},get size(){return this.style.fontSize?parseFloat(this.style.fontSize):base},get scrollWidth(){return Math.ceil(natural*this.size/base)},clientWidth:room,scrollHeight:height,clientHeight:height};
 return el;
}
(globalThis as unknown as {getComputedStyle:(el:{size:number})=>{fontSize:string}}).getComputedStyle=el=>({fontSize:`${el.size}px`});
const panel=(watermark:ReturnType<typeof box>|null,titles:ReturnType<typeof box>[])=>({querySelector:(s:string)=>s==='.title-watermark'?watermark:null,querySelectorAll:()=>titles}) as unknown as HTMLElement;

test('a side panel watermark compacts to fit beside the logo instead of failing the fit check',()=>{
 const watermark=box(105,503,494);
 fitSideTitles(panel(watermark,[]),{layout:'left'});
 assert.ok(watermark.scrollWidth<=watermark.clientWidth+1,'it fits');
 assert.equal(watermark.style.fontSize,'103px','it steps down only as far as it must');
});

test('a long side title compacts to fit, a fitting one keeps its size, and neither goes below its floor',()=>{
 const long=box(42,660,430),short=box(42,300,430),huge=box(42,5000,430),mark=box(105,5000,494);
 fitSideTitles(panel(mark,[long,short,huge]),{layout:'right'});
 assert.ok(long.scrollWidth<=431&&parseFloat(long.style.fontSize)<42);
 assert.equal(short.style.fontSize,'','already fits: untouched');
 assert.equal(huge.style.fontSize,`${SIDE_TITLE_FLOOR}px`);
 assert.equal(mark.style.fontSize,`${WATERMARK_FLOOR}px`);
});

test('other layouts are left to their own fitting',()=>{
 const title=box(42,900,430);
 fitSideTitles(panel(null,[title]),{layout:'bottom'});
 assert.equal(title.style.fontSize,'');
});
