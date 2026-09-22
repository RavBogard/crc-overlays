import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {RESTING_LOGO_RECT,renderRestingLogo,restingLogoEnabled,restingLogoStatus,restingLogoViewFor,type RestingLogoConfiguration} from '../lib/resting-logo.ts';
import {POST as commandRoute} from '../app/api/command/route.ts';
import {getPublicWorkspace} from '../lib/workspace.ts';
import {Player} from '../lib/player.ts';

const CRC_CONFIGURATION:RestingLogoConfiguration={enabled:true,src:'/assets/siona-floor.jpg',alt:'Central Reform Congregation artwork'};
const clear={cueOccupied:false,scanCardVisible:false};

/* ---------- the rule: a preference, and what is actually on screen ---------- */

test('the mark appears only when the output is genuinely clear',()=>{
 assert.deepEqual(restingLogoViewFor(CRC_CONFIGURATION,{on:true},clear),{src:'/assets/siona-floor.jpg',alt:'Central Reform Congregation artwork'});
 assert.equal(restingLogoViewFor(CRC_CONFIGURATION,{on:true},{cueOccupied:true,scanCardVisible:false}),null);
 assert.equal(restingLogoViewFor(CRC_CONFIGURATION,{on:true},{cueOccupied:false,scanCardVisible:true}),null);
 assert.equal(restingLogoViewFor(CRC_CONFIGURATION,{on:false},clear),null);
 assert.equal(restingLogoViewFor(CRC_CONFIGURATION,null,clear),null);
});

test('enabling the logo under a graphic keeps the preference and shows nothing',()=>{
 // The sitting's case: Michael turns it on mid-prayer. Nothing appears, and nothing is lost.
 const during={on:true};
 assert.equal(restingLogoViewFor(CRC_CONFIGURATION,during,{cueOccupied:true,scanCardVisible:false}),null);
 assert.equal(restingLogoEnabled(during),true);
 assert.equal(restingLogoStatus(CRC_CONFIGURATION,during,{cueOccupied:true,scanCardVisible:false}),'suppressed');
 // ...and the same preference, once the graphic has gone, is what puts the mark up.
 assert.notEqual(restingLogoViewFor(CRC_CONFIGURATION,during,clear),null);
 assert.equal(restingLogoStatus(CRC_CONFIGURATION,during,clear),'resting');
});

test('disabling the logo while it is suppressed prevents its return',()=>{
 const after={on:false};
 assert.equal(restingLogoViewFor(CRC_CONFIGURATION,after,{cueOccupied:true,scanCardVisible:false}),null);
 assert.equal(restingLogoViewFor(CRC_CONFIGURATION,after,clear),null,'the cue ending does not resurrect it');
 assert.equal(restingLogoStatus(CRC_CONFIGURATION,after,clear),'off');
});

test('a congregation without the capability never shows one, whatever the live state says',()=>{
 const tbi:RestingLogoConfiguration={enabled:false,src:null,alt:null};
 assert.equal(restingLogoViewFor(tbi,{on:true},clear),null);
 assert.equal(restingLogoStatus(tbi,{on:true},clear),'unavailable');
 // Enabled but with no artwork configured is also nothing, rather than a broken image.
 assert.equal(restingLogoViewFor({enabled:true,src:null,alt:null},{on:true},clear),null);
});

/* ---------- Player.occupied, which is what "clear" actually means ---------- */

class FakeRoot{
 children:unknown[]=[];
 get childElementCount(){return this.children.length}
 getAnimations(){return [] as {cancel:()=>void}[]}
 replaceChildren(...nodes:unknown[]){this.children=nodes}
}
const player=()=>{const root=new FakeRoot();return {root,player:new Player(root as unknown as HTMLElement,[])}};

test('the stage counts as occupied from the request until the exit has finished',()=>{
 const {root,player:p}=player();
 assert.equal(p.occupied,false,'a fresh stage is free');
 p.desired={cue:'cue-a',revision:1,mode:'animate'};
 assert.equal(p.occupied,true,'requested, before anything has painted: the mark goes first');
 root.children=[{}];
 p.current={id:'cue-a'} as never;
 assert.equal(p.occupied,true,'settled');
 p.desired={cue:'cue-b',revision:2,mode:'animate'};
 assert.equal(p.occupied,true,'and across a replacement, so nothing flashes between two cues');
 p.desired={cue:null,revision:3,mode:'animate'};
 assert.equal(p.occupied,true,'animating out: the box and the cue are still there');
 p.current=null;root.children=[];
 assert.equal(p.occupied,false,'only once the exit has emptied the stage');
});

test('a cut frees the stage immediately',()=>{
 const {root,player:p}=player();
 p.desired={cue:'cue-a',revision:1,mode:'animate'};p.current={id:'cue-a'} as never;root.children=[{}];
 p.set({cue:null,revision:2,mode:'cut'});
 assert.equal(p.occupied,false);
});

/* ---------- the layer itself ---------- */

class FakeElement{
 readonly tagName:string;
 readonly ownerDocument:FakeDocument;
 className='';
 parentNode:FakeElement|null=null;
 children:FakeElement[]=[];
 dataset:Record<string,string>={};
 private readonly attributes=new Map<string,string>();
 constructor(tagName:string,ownerDocument:FakeDocument){this.tagName=tagName;this.ownerDocument=ownerDocument}
 replaceChildren(...nodes:FakeElement[]){for(const child of this.children)child.parentNode=null;this.children=[];for(const node of nodes){node.parentNode=this;this.children.push(node)}}
 setAttribute(name:string,value:string){this.attributes.set(name,value)}
 getAttribute(name:string){return this.attributes.get(name)??null}
}
class FakeDocument{createElement(tagName:string){return new FakeElement(tagName,this)}}
const stage=()=>new FakeElement('div',new FakeDocument());
const asRoot=(element:FakeElement)=>element as unknown as HTMLElement;

test('the layer renders one image and reuses it, so the artwork is never re-requested',()=>{
 const root=stage();
 renderRestingLogo(asRoot(root),{src:'/assets/siona-floor.jpg',alt:'artwork'});
 assert.equal(root.children.length,1);
 const image=root.children[0]!;
 assert.equal(image.tagName,'img');
 assert.equal(image.className,'resting-logo');
 assert.equal(image.getAttribute('src'),'/assets/siona-floor.jpg');
 assert.equal(image.getAttribute('alt'),'artwork');
 assert.equal(root.dataset.restingLogo,'on');
 renderRestingLogo(asRoot(root),{src:'/assets/siona-floor.jpg',alt:'artwork'});
 assert.equal(root.children[0],image,'the same node: a replacement would re-fetch a 3 MB JPEG and flash');
});

test('a null view empties the layer',()=>{
 const root=stage();
 renderRestingLogo(asRoot(root),{src:'/assets/siona-floor.jpg',alt:''});
 renderRestingLogo(asRoot(root),null);
 assert.equal(root.children.length,0);
 assert.equal(root.dataset.restingLogo,'off');
});

test('the corner box is 132 square, inset 48 from the right and bottom, and the CSS agrees',()=>{
 assert.deepEqual(RESTING_LOGO_RECT,{left:1740,top:900,right:1872,bottom:1032});
 assert.equal(RESTING_LOGO_RECT.right-RESTING_LOGO_RECT.left,132);
 assert.equal(RESTING_LOGO_RECT.bottom-RESTING_LOGO_RECT.top,132);
 assert.equal(1920-RESTING_LOGO_RECT.right,48);
 assert.equal(1080-RESTING_LOGO_RECT.bottom,48);
 const css=readFileSync(fileURLToPath(new URL('../app/resting-logo.css',import.meta.url)),'utf8');
 const rule=css.slice(css.indexOf('#output-logo .resting-logo{'));
 assert.ok(rule.includes('right:48px'),'the same inset the rectangle claims');
 assert.ok(rule.includes('bottom:48px'));
 assert.ok(rule.includes('width:132px')&&rule.includes('height:132px'));
 // Cropped, never stretched: the artwork is 1500x1382 and the box is square.
 assert.ok(rule.includes('object-fit:cover'),'the artwork is cropped');
 assert.ok(!rule.includes('object-fit:fill'));
 assert.ok(css.includes("#output-logo[data-resting-logo='off']{display:none}"),'an off layer takes no space');
});

/* ---------- configuration: capability is per congregation ---------- */

test('CRC is configured for the resting logo and TBI deliberately is not',()=>{
 const crc=getPublicWorkspace({WORKSPACE_ID:'crc'});
 assert.deepEqual(crc.restingLogo,{enabled:true,src:'/assets/siona-floor.jpg',alt:'Central Reform Congregation artwork'});
 assert.equal(crc.restingLogo.src,crc.logo.src,'it is the congregation\'s own artwork, never a constant');
 const tbi=getPublicWorkspace({WORKSPACE_ID:'temple-bnai-israel-kalamazoo'});
 assert.deepEqual(tbi.restingLogo,{enabled:false,src:null,alt:null});
});

test('a congregation that turns it on gets its own artwork, not CRC\'s',()=>{
 const other=getPublicWorkspace({
  WORKSPACE_ID:'temple-bnai-israel-kalamazoo',
  WORKSPACE_RESTING_LOGO:'1',
 });
 assert.equal(other.restingLogo.enabled,true);
 assert.equal(other.restingLogo.src,'/workspaces/temple-bnai-israel/official-footer.png');
});

/* ---------- the command surface ---------- */

const logoCommand=(body:Record<string,unknown>)=>commandRoute(new Request('https://graphics.example/api/command',{
 method:'POST',
 headers:{Authorization:'Bearer control-secret','Content-Type':'application/json'},
 body:JSON.stringify({commandId:'22222222-2222-4222-8222-222222222222',clientId:null,sequence:null,cue:null,...body}),
}));

test('the command route refuses the resting logo for a congregation that has none',async()=>{
 process.env.CONTROL_KEY='control-secret';
 process.env.WORKSPACE_ID='temple-bnai-israel-kalamazoo';
 delete process.env.RELAY_URL;delete process.env.RELAY_SECRET;
 const response=await logoCommand({action:'logo',logo:{on:true}});
 assert.equal(response.status,400);
 assert.deepEqual(await response.json(),{error:'The resting logo is not set up for this congregation.'});
});

test('the resting logo needs the live connection, and says so',async()=>{
 process.env.CONTROL_KEY='control-secret';
 process.env.WORKSPACE_ID='crc';
 delete process.env.RELAY_URL;delete process.env.RELAY_SECRET;
 const response=await logoCommand({action:'logo',logo:{on:true}});
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'The resting logo needs the live connection.'});
});

test('a logo command may not carry a cue, and a malformed one is refused',async()=>{
 process.env.CONTROL_KEY='control-secret';
 process.env.WORKSPACE_ID='crc';
 delete process.env.RELAY_URL;delete process.env.RELAY_SECRET;
 assert.equal((await logoCommand({action:'logo',cue:'cue-a',logo:{on:true}})).status,400);
 assert.equal((await logoCommand({action:'logo'})).status,400);
 assert.equal((await logoCommand({action:'logo',logo:{on:'yes'}})).status,400);
});

/* ---------- the two features stay apart ---------- */

test('the output stage keeps the scan card and the resting logo as separate layers',()=>{
 const page=readFileSync(fileURLToPath(new URL('../app/output/page.tsx',import.meta.url)),'utf8');
 assert.ok(page.includes('id="output-logo"')&&page.includes('id="output-bug"'),'two sibling stages, not one');
 assert.ok(page.includes('cueOccupied:Boolean(player?.occupied)'),'visibility is decided from the renderer, not from the command');
 assert.ok(page.includes('scanCardVisible'),'and the scan card suppresses the mark rather than sharing its node');
 const css=readFileSync(fileURLToPath(new URL('../app/resting-logo.css',import.meta.url)),'utf8');
 assert.ok(!css.includes('bug-card')&&!css.includes('qr'),'no card, no QR: this is a plain mark');
});
