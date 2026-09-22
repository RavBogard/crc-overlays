import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {acceptsRevision,effectFrames,incomingStillDesired,measuredBottomTextHeight,textParts,tracksFor,type AnimationTrack} from '../lib/player-motion.ts';
import {Player,panelRowChannels,panelRowGap,panelStackGeometry,presentationTextStyles,usesPanelRows,type ContentRow,type Cue} from '../lib/player.ts';
import {OVERLAY_ASSET_TIMEOUT_MS,waitForRenderedOverlayAssets} from '../lib/overlay-assets.ts';
import {branding} from '../lib/branding.ts';

test('scale y and translate tracks keep their actual transform axis',()=>{
 assert.deepEqual(effectFrames({effect:'scale',property:'y'},'In'),[{transform:'scaleY(0)'},{transform:'scale(1)'}]);
 assert.deepEqual(effectFrames({effect:'translate',property:'up'},'Out',40),[{transform:'translate(0, 0)'},{transform:'translateY(40px)'}]);
});

test('panel bilingual stack places the transliteration immediately after measured Hebrew',()=>{
 assert.deepEqual(panelStackGeometry(337.2,431.1),{englishTop:660,englishHeight:338,gap:19,hebrewTop:209,hebrewHeight:432});
 assert.deepEqual(panelStackGeometry(120,180),{englishTop:678,englishHeight:120,gap:88,hebrewTop:410,hebrewHeight:180});
});

// The two channels are rarely the same height, and the taller one is usually the Hebrew. What
// must hold whatever the heights are: Hebrew is on top, the gap between them is the published
// gap, and the stack is centred in the 184..1024 body with equal space above and below.
test('Hebrew leads the stack at every ratio of channel heights',()=>{
 for(const [english,hebrew] of [[337.2,431.1],[120,180],[500,120],[431,431],[0,300],[300,0],[600,240],[600,600]]){
  const stack=panelStackGeometry(english,hebrew);
  assert.ok(stack.hebrewTop<=stack.englishTop,`Hebrew must lead for ${english}/${hebrew}`);
  assert.equal(stack.englishTop-(stack.hebrewTop+stack.hebrewHeight),stack.gap,'the gap sits between the two blocks');
  assert.equal(stack.hebrewHeight,Math.ceil(hebrew));
  assert.equal(stack.englishHeight,Math.ceil(english));
  if(Math.ceil(english)+Math.ceil(hebrew)>840)continue; // overfull: it starts at the top and runs over
  const above=stack.hebrewTop-184,below=184+840-(stack.englishTop+stack.englishHeight);
  assert.ok(Math.abs(above-below)<=1,`the stack stays centred for ${english}/${hebrew}`);
 }
});

// A panel whose text only just fits gets the minimum gap and no centring slack; it must still
// stack Hebrew first and must not push the transliteration past the bottom of the body.
test('a stack with no room to spare still reads Hebrew first and stays inside the body',()=>{
 const tight=panelStackGeometry(400,422);
 assert.deepEqual(tight,{englishTop:624,englishHeight:400,gap:18,hebrewTop:184,hebrewHeight:422});
 assert.equal(tight.englishTop+tight.englishHeight,1024);
 const overfull=panelStackGeometry(600,600);
 assert.equal(overfull.hebrewTop,184,'an overfull stack starts at the top of the body rather than above it');
 assert.equal(overfull.gap,0);
 assert.equal(overfull.englishTop,784);
});

const overlayCss=()=>readFileSync(fileURLToPath(new URL('../app/overlay.css',import.meta.url)),'utf8');

// The four resting values in app/overlay.css and the four fitPanelCopy publishes describe the
// same stack. Edit one without the other and a panel lays out transliteration-first until the
// fit runs, then jumps. This reads the defaults out of the stylesheet and checks them against
// the geometry function that overrides them.
test('the stylesheet resting panel stack agrees with the fitted one',()=>{
 const rule=overlayCss().match(/\.left,\.right\{--panel-[^}]*\}/g)?.at(-1);
 assert.ok(rule,'app/overlay.css declares the panel stack variables');
 const value=(name:string)=>Number(rule!.match(new RegExp(`--panel-${name}:(\\d+)px`))?.[1]);
 assert.ok(value('hebrew-top')<value('english-top'),'Hebrew rests above the transliteration');
 assert.equal(value('hebrew-top'),184,'the stack starts at the top of the body');
 assert.equal(value('hebrew-top')+value('hebrew-height')+18,value('english-top'),'separated by the minimum gap');
 assert.equal(value('english-top')+value('english-height'),1024,'and ends at the bottom of the body');
 const fitted=panelStackGeometry(value('english-height'),value('hebrew-height'));
 assert.ok(fitted.hebrewTop<fitted.englishTop,'which is the order the fit publishes');
});

// The sitting asked for space between a lower third's title and the decorative circle. The gap
// is named once so it can be tuned in one place; what must not regress is that the title starts
// clear of the circle, which ends at 240px, and still ends inside the bar.
test('the lower third title clears the decorative circle',()=>{
 const css=overlayCss();
 const clearance=Number(css.match(/--bottom-title-clearance:(\d+)px/)?.[1]);
 assert.ok(clearance>=32,`the lower third gives its title only ${clearance}px of clearance`);
 assert.match(css,/\.bottom \.title\{left:calc\(240px \+ var\(--bottom-title-clearance\)\);width:calc\(1850px - 240px - var\(--bottom-title-clearance\)\)\}/);
 assert.match(css,/\.bottom::before\{left:20px;bottom:60px;width:220px/,'measured from a circle that still ends at 240px');
 // The title moved; the praised English-left / Hebrew-right pair beneath it did not.
 const prayerLefts=[...css.matchAll(/\.bottom \.prayer\{([^}]*)\}/g)].flatMap(rule=>[...rule[1].matchAll(/left:(\d+)px/g)].map(match=>match[1]));
 assert.equal(prayerLefts.at(-1),'250','the lower third body block keeps its left edge');
 assert.match(css,/\.bottom \.english\{width:730px/,'the English column keeps its width');
 assert.match(css,/\.bottom \.hebrew\{left:1010px;width:850px/,'and the Hebrew column keeps its place');
});

test('structured rows use bounded inter-row spacing that preserves four-row fit',()=>{
 assert.equal(panelRowGap([190,190,190,190]),16);
 assert.equal(panelRowGap([205,205,205,205],844,4,24),4);
 assert.equal(panelRowGap([207,207,207,207],842,4,24),4);
 assert.equal(panelRowGap([100,100]),56);
 assert.equal(panelRowGap([420,420]),4);
});

test('bounded presentation choices map to measured text styles',()=>{
 assert.deepEqual(presentationTextStyles(undefined),{textAlign:undefined,lineHeight:undefined});
 assert.deepEqual(presentationTextStyles({alignment:'start',lineSpacing:'compact'}),{textAlign:'start',lineHeight:'1.12'});
 assert.deepEqual(presentationTextStyles({alignment:'center',lineSpacing:'spacious'}),{textAlign:'center',lineHeight:'1.42'});
});

test('transition state rejects stale and duplicate revisions',()=>{
 const current={cue:'a',revision:8,mode:'animate'};
 assert.equal(acceptsRevision({cue:'b',revision:7,mode:'animate'},current),false);
 assert.equal(acceptsRevision({cue:'b',revision:8,mode:'cut'},current),false);
 assert.equal(acceptsRevision({cue:'b',revision:9,mode:'animate'},current),true);
});

test('cut and rapid replacement decisions converge on the newest cue',()=>{
 const cut={cue:null,revision:11,mode:'cut'};
 assert.equal(acceptsRevision(cut,{cue:'a',revision:10,mode:'animate'}),true);
 assert.equal(incomingStillDesired('a',{cue:'b',revision:12,mode:'animate'}),false);
 assert.equal(incomingStillDesired('b',{cue:'b',revision:12,mode:'animate'}),true);
});

test('an element receives both its direct track and its archived group track',()=>{
 const tracks:AnimationTrack[]=[
  {element:'Image',direction:'In',effect:{effect:'fade'}},
  {element:'logoGroup',direction:'In',effect:{effect:'scale',property:'xAndY'}},
  {element:'logoGroup',direction:'Out',effect:{effect:'none'}},
 ];
 assert.deepEqual(tracksFor('Image','In',tracks),tracks.slice(0,2));
 assert.deepEqual(tracksFor('Image','Out',tracks),[]);
});

test('combined and lone language cues receive full-width single-channel treatment',()=>{
 assert.deepEqual(textParts({textMain:'English only'}),[
  {classes:'prayer combined single-channel',text:'English only',element:'textMain'},
 ]);
 assert.deepEqual(textParts({textMainEng:'Transliteration only'}),[
  {classes:'prayer english single-channel',text:'Transliteration only',element:'textMainEng'},
 ]);
 assert.equal(textParts({textMainEng:'Transliteration',textMainheb:'Hebrew'}).some(part=>part.classes.includes('single-channel')),false);
});

test('bottom height follows unscaled measured content with a crest-safe minimum',()=>{
 assert.equal(measuredBottomTextHeight([128,167.2]),168);
 assert.equal(measuredBottomTextHeight([0,44]),84);
 assert.equal(measuredBottomTextHeight([]),84);
});

test('structured source rows replace aggregate panel text without changing lower thirds',()=>{
 const contentRows:ContentRow[]=[{he:'עברית',tr:'Transliteration',en:'Translation'}];
 assert.equal(usesPanelRows({layout:'left',contentRows}),true);
 assert.equal(usesPanelRows({layout:'right',contentRows}),true);
 assert.equal(usesPanelRows({layout:'bottom',contentRows}),false);
 assert.equal(usesPanelRows({layout:'left'}),false);
 assert.deepEqual(panelRowChannels(contentRows[0]).map(({element,animationElement,text})=>({element,animationElement,text})),[
  {element:'textMainheb',animationElement:'textMainheb',text:'עברית'},
  {element:'textMainEng',animationElement:'textMainEng',text:'Transliteration'},
  {element:'textTranslation',animationElement:'textMainEng',text:'Translation'},
 ]);
});

/* ---------------------------------------------------------------------------
 * Asset-aware auto-fit: fonts and artwork must settle before text is measured.
 * ------------------------------------------------------------------------ */

type FitStyle={fontSize:string;height:string;properties:Record<string,string>;setProperty(name:string,value:string):void};
type FitNode={classes:string[];base:number;style:FitStyle;dataset:Record<string,string>;readonly scrollHeight:number;readonly offsetHeight:number};

const fitStyle=():FitStyle=>{const properties:Record<string,string>={};return {fontSize:'',height:'',properties,setProperty(name:string,value:string){properties[name]=value}}};
const fontOf=(node:FitNode)=>node.style.fontSize?parseFloat(node.style.fontSize):node.base;
const matchesSelector=(node:FitNode,selector:string)=>selector.split(',').some(part=>node.classes.includes(part.trim().replace(/^\./,'')));

/** Four structured rows whose measured height tracks the live font sizes times `metrics.factor`. */
function panelRowsFixture(metrics:{factor:number}){
 const channels:FitNode[]=[],rows:FitNode[]=[];
 for(let index=0;index<4;index++){
  const members:FitNode[]=[];
  for(const [className,base] of [['row-hebrew',44],['row-transliteration',36],['row-translation',28]] as const){
   const channel:FitNode={classes:['prayer',className],base,style:fitStyle(),dataset:{},scrollHeight:0,offsetHeight:0};
   members.push(channel);channels.push(channel);
  }
  const height=()=>Math.ceil(members.reduce((sum,member)=>sum+fontOf(member),0)*metrics.factor);
  rows.push({classes:['content-row'],base:0,style:fitStyle(),dataset:{},get scrollHeight(){return height()},get offsetHeight(){return height()}});
 }
 const container={classes:['panel-rows'],base:0,style:fitStyle(),dataset:{} as Record<string,string>,scrollHeight:0,offsetHeight:0,querySelectorAll:(selector:string)=>[...rows,...channels].filter(node=>matchesSelector(node,selector))};
 const all=[container as unknown as FitNode,...rows,...channels];
 const box={classes:['overlay','left'],base:0,style:fitStyle(),dataset:{} as Record<string,string>,scrollHeight:0,offsetHeight:0,
  querySelector:(selector:string)=>selector==='.panel-rows'?container:null,
  querySelectorAll:(selector:string)=>all.filter(node=>matchesSelector(node,selector))};
 return {box:box as unknown as HTMLElement,fonts:()=>channels.slice(0,3).map(fontOf),fit:()=>box.dataset.fit,gap:()=>container.style.properties['--panel-row-gap']};
}

(globalThis as unknown as {getComputedStyle:(element:unknown)=>{fontSize:string}}).getComputedStyle=element=>({fontSize:(element as FitNode).style.fontSize||`${(element as FitNode).base}px`});

const rowsCue:Cue={id:'rows',name:'Structured rows',layout:'left',texts:{},animations:[],duration:{},contentRows:[
 {he:'א',tr:'a',en:'A'},{he:'ב',tr:'b',en:'B'},{he:'ג',tr:'c',en:'C'},{he:'ד',tr:'d',en:'D'},
]};

test('applyFit is idempotent and always re-fits from the template base sizes',()=>{
 const player=new Player({} as unknown as HTMLElement,[rowsCue]);
 const settled=panelRowsFixture({factor:2});
 player.applyFit(settled.box,rowsCue);
 const expected=settled.fonts();
 assert.deepEqual(expected,[42,34,26],'fitting shrinks the fixture, so the test exercises the loop');
 player.applyFit(settled.box,rowsCue);
 assert.deepEqual(settled.fonts(),expected,'a repeated fit against the same metrics changes nothing');

 // Fallback metrics measure larger; once the real fonts and artwork land the second fit
 // must reach the settled sizes, not shrink cumulatively from the provisional ones.
 const metrics={factor:2.2},provisional=panelRowsFixture(metrics);
 player.applyFit(provisional.box,rowsCue);
 assert.deepEqual(provisional.fonts(),[39,31,23],'fallback metrics force a deeper provisional shrink');
 metrics.factor=2;
 player.applyFit(provisional.box,rowsCue);
 assert.deepEqual(provisional.fonts(),expected);
 assert.equal(provisional.fit(),settled.fit());
 assert.equal(provisional.gap(),settled.gap());
});

function displayFixture(logo:{src:string;complete:boolean;naturalWidth:number}):HTMLDivElement{
 const box={querySelector:(selector:string)=>selector==='img.logo'?logo:null,querySelectorAll:()=>[],style:{visibility:'hidden'}};
 return box as unknown as HTMLDivElement;
}

function stubbedPlayer(cue:Cue,options:{waitForAssets:(root:HTMLElement)=>Promise<void>;box:HTMLDivElement}){
 const order:string[]=[];
 const player=new Player({} as unknown as HTMLElement,[cue],branding,{
  resolveAssetUrl:()=>'/api/assets/artwork/content',
  waitForAssets:async root=>{order.push('wait');await options.waitForAssets(root)},
 });
 player.render=()=>{order.push('render');return options.box};
 player.applyFit=()=>{order.push('fit')};
 player.animate=async()=>{order.push('animate')};
 return {player,order};
}

test('the display path fits only after the asset wait resolves and before animate-in',async()=>{
 const logo={src:'/api/assets/artwork/content',complete:true,naturalWidth:120};
 const {player,order}=stubbedPlayer(rowsCue,{box:displayFixture(logo),waitForAssets:async()=>{}});
 player.desired={cue:'rows',revision:1,mode:'animate'};
 await player.drain();
 assert.deepEqual(order,['render','wait','fit','animate']);
 assert.equal(player.phase,'settled');
 assert.equal(player.current?.id,'rows');
});

test('an incoming graphic stays invisible until its In animations exist',async()=>{
 const logo={src:'/api/assets/artwork/content',complete:true,naturalWidth:120};
 const box=displayFixture(logo);
 const seen:string[]=[];
 const player=new Player({} as unknown as HTMLElement,[rowsCue],branding,{
  resolveAssetUrl:()=>'/api/assets/artwork/content',
  waitForAssets:async root=>{seen.push(`wait:${(root as unknown as {style:{visibility:string}}).style.visibility}`)},
 });
 // render() leaves a still visible; it is drain() that hides an incoming graphic.
 player.render=()=>{box.style.visibility='';return box};
 player.applyFit=()=>{seen.push(`fit:${box.style.visibility}`)};
 const reveal=player.animate.bind(player);
 player.animate=async(target,cue,direction)=>{seen.push(`animate-start:${(target as unknown as {style:{visibility:string}}).style.visibility}`);await reveal(target,cue,direction);seen.push(`animate-end:${(target as unknown as {style:{visibility:string}}).style.visibility}`)};
 player.desired={cue:'rows',revision:1,mode:'animate'};
 await player.drain();
 assert.deepEqual(seen,['wait:hidden','fit:hidden','animate-start:hidden','animate-end:'],'nothing is painted at rest before the In animations exist');
});

/* The hide belongs to drain(), never to render(): the console's Preview, the editor, the fit
   stage and the names-list preview all call render() on its own and never animate, so a box
   hidden by render() would never be revealed and every one of those previews would be blank. */
test('render() alone leaves a still visible',()=>{
 const source=readFileSync(fileURLToPath(new URL('../lib/player.ts',import.meta.url)),'utf8');
 const render=source.slice(source.indexOf(' render(c:Cue'),source.indexOf(' applyFit(box:HTMLElement'));
 assert.ok(!render.includes("visibility='hidden'"),'render() never hides the box it returns');
 assert.ok(source.slice(source.indexOf(' async drain()')).includes("box.style.visibility='hidden'"),'drain() hides the incoming graphic instead');
});

test('unusable artwork falls back to the branding logo and still shows the text cue',async()=>{
 const logo={src:'/api/assets/artwork/content',complete:false,naturalWidth:0};
 const {player,order}=stubbedPlayer(rowsCue,{box:displayFixture(logo),waitForAssets:async root=>{
  const rendered=(root as unknown as {querySelector:(selector:string)=>{src:string}}).querySelector('img.logo');
  if(rendered.src!==branding.logo)throw Error('Workspace artwork unavailable');
 }});
 player.desired={cue:'rows',revision:1,mode:'animate'};
 await player.drain();
 assert.equal(logo.src,branding.logo);
 assert.deepEqual(order,['render','wait','wait','fit','animate']);
 assert.equal(player.phase,'settled');
 assert.equal(player.current?.id,'rows');
});

test('a font or layout failure on a loaded logo is not disguised as an artwork fallback',async()=>{
 const logo={src:'/api/assets/artwork/content',complete:true,naturalWidth:120};
 const {player,order}=stubbedPlayer(rowsCue,{box:displayFixture(logo),waitForAssets:async()=>{throw Error('The Hebrew overlay font is not ready.')}});
 player.desired={cue:'rows',revision:1,mode:'animate'};
 await player.drain();
 assert.equal(player.phase,'error');
 assert.equal(logo.src,'/api/assets/artwork/content');
 assert.deepEqual(order,['render','wait']);
});

/* ---------------------------------------------------------------------------
 * Overlay asset waiting: one shared deadline, cleanup on every exit path.
 * ------------------------------------------------------------------------ */

type StubbedListener={type:string;handler:()=>void};

function stubDocument(fonts:{load?:()=>Promise<unknown>;ready?:Promise<void>}){
 (globalThis as unknown as {document:unknown}).document={fonts:{
  load:fonts.load??(async()=>[]),
  ready:fonts.ready??Promise.resolve(),
  check:()=>true,
 }};
}
(globalThis as unknown as {requestAnimationFrame:(callback:()=>void)=>number}).requestAnimationFrame=callback=>{queueMicrotask(callback);return 0};

function stubLogo(){
 const listeners:StubbedListener[]=[];let peak=0;
 const logo={complete:false,naturalWidth:0,decode:async()=>{},
  addEventListener(type:string,handler:()=>void){listeners.push({type,handler});peak=Math.max(peak,listeners.length)},
  removeEventListener(type:string,handler:()=>void){const index=listeners.findIndex(item=>item.type===type&&item.handler===handler);if(index>=0)listeners.splice(index,1)}};
 return {logo,listeners,peak:()=>peak,root:{querySelector:()=>logo} as unknown as HTMLElement};
}

test('a timed-out overlay asset wait removes every listener it attached',async()=>{
 stubDocument({});
 const target=stubLogo();
 await assert.rejects(waitForRenderedOverlayAssets(target.root,AbortSignal.timeout(40)),/timed out/);
 assert.equal(target.peak(),2,'the logo load stage attaches a load and an error listener');
 assert.deepEqual(target.listeners,[],'the timeout path runs the same cleanup as load and error');
});

test('one shared deadline bounds the whole overlay asset wait instead of each stage',async()=>{
 assert.equal(OVERLAY_ASSET_TIMEOUT_MS,8000);
 const slow=()=>new Promise<void>(resolve=>setTimeout(resolve,200));
 stubDocument({load:slow,ready:slow()});
 const target=stubLogo();
 const started=Date.now();
 await assert.rejects(waitForRenderedOverlayAssets(target.root,AbortSignal.timeout(300)),/timed out/);
 const elapsed=Date.now()-started;
 // Per-stage budgets would have spent 200 + 200 + 300 ms here.
 assert.ok(elapsed<500,`the shared deadline bounded the wait (${elapsed}ms)`);
 assert.deepEqual(target.listeners,[]);
});
