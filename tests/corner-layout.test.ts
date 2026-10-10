import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import baseline from '../lib/cues.json';
import {layoutLabel,templateLayoutFor} from '../lib/layout-label.ts';
import {Player,CORNER_FONT_FLOOR,type Cue} from '../lib/player.ts';
import {CORNER_CARD,cardStyle,cardTextAlign,layoutDefinition,registerLayout,unregisterLayout} from '../lib/layout-registry.ts';
import {findFitErrors,findFitWarnings,panelFillRatio} from '../app/author/preview.ts';
import {RESTING_LOGO_RECT} from '../lib/resting-logo.ts';
import {BUG_RESERVED_RECT} from '../lib/bug-layer.ts';
import {CUSTOM_TEMPLATES} from '../lib/custom-templates.ts';
import {templateLooks,type TemplateLookSummary} from '../lib/template-looks.ts';
import {exceedsOnePanel} from '../lib/panel-budget.ts';
import {buildCue,editableFromBaseline,parseEditable,sourcePinFor,AuthoringError,type BilingualContent,type Draft,type EditableDraft} from '../lib/authoring-model.ts';
import {planDraftStyle} from '../lib/authoring-style.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';

const cues=baseline as unknown as Cue[];
const bottomTemplate=cues.find(cue=>cue.layout==='bottom'&&!cue.hidden)!;
const leftTemplate=cues.find(cue=>cue.layout==='left'&&!cue.hidden)!;

/* ------------------------------------------------------------ geometry --- */

// The corner card is drawn from its definition (CORNER_CARD in lib/layout-registry.ts): the Player
// sets the custom properties cardStyle() derives, and the generic `.overlay[data-card]` block in
// app/overlay.css reads them. Geometry is asserted on those properties - the values the CSS
// actually receives - converted back to frame coordinates.
const card=layoutDefinition('corner')!.card!;
const style=cardStyle(card);
type Rect={left:number;right:number;top:number;bottom:number};
const px=(name:string)=>{const value=style[name];assert.ok(value!==undefined&&/^\d+px$/.test(value),`cardStyle sets ${name}`);return Number(value.slice(0,-2))};
const across=(part:string)=>{const width=px(`--card-${part}-width`),right=px(`--card-${part}-right`);return {left:1920-right-width,right:1920-right}};
const down=(part:string)=>{const height=px(`--card-${part}-height`),bottom=px(`--card-${part}-bottom`);return {top:1080-bottom-height,bottom:1080-bottom}};
/** A part placed on both axes, or a body channel (the body's x, the channel's y). */
const rect=(part:string,vertical=part):Rect=>({...across(part),...down(vertical)});
const inside=(inner:Rect,outer:Rect)=>inner.left>=outer.left&&inner.right<=outer.right&&inner.top>=outer.top&&inner.bottom<=outer.bottom;

test('the corner layout is a card anchored bottom-right, and only the corner is',()=>{
 assert.equal(card,CORNER_CARD);
 assert.equal(card.frame.anchor,'bottom-right');
 for(const layout of ['bottom','left','right'])assert.equal(layoutDefinition(layout)?.card,undefined,`${layout} stays built-in layered CSS (ruling 7)`);
});

test('the corner card sits flush in the bottom-right corner at the logo and scan-card inset',()=>{
 const base=rect('base');
 assert.deepEqual(base,{left:1232,right:1872,top:808,bottom:1032});
 assert.equal(base.right,RESTING_LOGO_RECT.right,'same right inset as the resting logo');
 assert.equal(base.bottom,RESTING_LOGO_RECT.bottom,'same bottom inset as the resting logo');
 assert.equal(base.right,BUG_RESERVED_RECT.right);
 assert.equal(base.bottom,BUG_RESERVED_RECT.bottom);
 assert.ok(inside(base,{left:0,top:0,right:1920,bottom:1080}),'inside the 1920x1080 frame');
});

test('every corner part and text box lies inside the card',()=>{
 const base=rect('base'),strip=rect('strip'),logo=rect('logo'),title=rect('title');
 assert.deepEqual(strip,{left:1232,right:1872,top:808,bottom:888},'the title strip contains the enlarged logo');
 assert.deepEqual(rect('rule'),{left:1232,right:1872,top:1026,bottom:1032},'the accent rule is the bottom 6px');
 for(const [name,box] of [['strip',strip],['rule',rect('rule')],['logo',logo],['title',title]] as const)assert.ok(inside(box,base),`${name} is inside the card`);
 const hebrew=rect('body','hebrew'),latin=rect('body','latin'),single=rect('body','single');
 assert.deepEqual(single,{left:1264,right:1848,top:898,bottom:1018},'the body');
 for(const [name,box] of [['hebrew',hebrew],['latin',latin],['single',single]] as const){
  assert.ok(inside(box,base),`${name} is inside the card`);
  assert.ok(box.top>=strip.bottom,`${name} is below the title strip`);
 }
 assert.ok(hebrew.bottom<=latin.top,'Hebrew stacks above its transliteration without overlapping');
 assert.ok(inside(logo,strip),'the logo sits in the title strip');
 assert.ok(title.right<=logo.left,'the title ends before the logo');
 // With an accent title the accent takes the lane's far end and the title stops short of it.
 const accent={...across('accent'),...down('title')},shared={...across('title-shared'),...down('title')};
 assert.equal(accent.right,title.right);
 assert.equal(accent.left-shared.right,card.title.accentGap);
 assert.equal(shared.left,title.left);
});

test('the corner card sets Hebrew RTL and right-aligned, its transliteration left-aligned, a lone channel natural',()=>{
 assert.equal(style['--card-hebrew-direction'],'rtl');
 assert.equal(style['--card-hebrew-align'],'right');
 assert.equal(style['--card-latin-direction'],undefined,'the transliteration inherits the overlay direction');
 assert.equal(style['--card-latin-align'],'left');
 assert.equal(style['--card-single-align'],'start','a lone channel aligns each line to its own direction');
 assert.equal(style['--card-origin'],'right center','the card scales in from its right edge');
});

test('logical alignment resolves against the channel direction, never the line content',()=>{
 assert.equal(cardTextAlign({align:'start',direction:'rtl'}),'right');
 assert.equal(cardTextAlign({align:'end',direction:'rtl'}),'left');
 assert.equal(cardTextAlign({align:'start'}),'left');
 assert.equal(cardTextAlign({align:'end',direction:'ltr'}),'right');
 assert.equal(cardTextAlign({align:'natural',direction:'rtl'}),'start');
});

test('a card anchored top-left is placed from the left and top edges',()=>{
 const topLeft=cardStyle({...CORNER_CARD,frame:{...CORNER_CARD.frame,anchor:'top-left'}});
 assert.equal(topLeft['--card-base-left'],'48px');
 assert.equal(topLeft['--card-base-top'],'48px');
 assert.equal(topLeft['--card-logo-left'],`${48+CORNER_CARD.logo.x}px`);
 assert.equal(topLeft['--card-hebrew-top'],`${48+CORNER_CARD.body.hebrew.y}px`);
 assert.equal(topLeft['--card-origin'],'left center');
 assert.ok(!Object.keys(topLeft).some(name=>name.endsWith('-right')||name.endsWith('-bottom')),'the far edges stay auto');
});

const css=readFileSync(fileURLToPath(new URL('../app/overlay.css',import.meta.url)),'utf8');
test('the generic card block reads every property cardStyle sets, and each one it reads is set or edge-defaulted',()=>{
 const block=css.slice(css.indexOf('.overlay[data-card]::before'));
 const read=new Set([...block.matchAll(/var\((--card-[a-z-]+)/g)].map(match=>match[1]));
 // The name plate also sets its lead line's scale: every built-in card's properties together are what the block may read.
 const style={...cardStyle(card),...cardStyle(layoutDefinition('nameplate')!.card!)};
 for(const name of Object.keys(style))assert.ok(read.has(name),`app/overlay.css reads ${name}`);
 for(const name of read){
  const edge=/-(left|right|top|bottom)$/.test(name);
  assert.ok(name in style||edge||name==='--card-latin-direction',`${name} is set by cardStyle or falls back to auto`);
  if(edge)assert.match(block,new RegExp(`var\\(${name},auto\\)`),`${name} falls back to auto`);
 }
 assert.match(block,/^\.overlay\[data-card\]::before,\.overlay\[data-card\]::after\{display:none\}/,'no decorative circles');
 assert.doesNotMatch(css,/\.corner[ .:{]/,'no rule is keyed to the corner class any more');
 // A lone channel is also .hebrew or .english: its rule comes after theirs and sets no direction.
 const single=block.indexOf('.overlay[data-card] .single-channel{');
 assert.ok(single>block.indexOf('.overlay[data-card] .hebrew{')&&single>block.indexOf('.overlay[data-card] .english,'));
 assert.doesNotMatch(block.slice(single).split('}')[0],/direction/);
});

/* ------------------------------------------------------------ renderer --- */

// Just enough DOM for Player.render and applyFit: class lists, text, style and a crude text
// metric (0.55em per character, wrapping at the box width) so the corner fit can be exercised.
// The boxes and base sizes are the definition's: what the card CSS computes from cardStyle().
const {title:TITLE,body:BODY}=CORNER_CARD;
const BOX:Record<string,{width:number;height:number}>={title:{width:TITLE.width,height:TITLE.height},hebrew:{width:BODY.width,height:BODY.hebrew.height},english:{width:BODY.width,height:BODY.latin.height},'single-channel':{width:BODY.width,height:BODY.single.height}};
class FakeElement{
 tagName:string;className='';dataset:Record<string,string>={};textContent='';children:FakeElement[]=[];src='';alt='';
 style:{fontSize:string;visibility?:string;properties:Record<string,string>;setProperty(name:string,value:string):void}={fontSize:'',properties:{},setProperty(name,value){this.properties[name]=value}};
 constructor(tag:string){this.tagName=tag}
 get classes(){return this.className.split(/\s+/).filter(Boolean)}
 get classList(){return {contains:(name:string)=>this.classes.includes(name)}}
 get base(){return this.classes.includes('title')?TITLE.fontSize:this.classes.includes('single-channel')?BODY.single.fontSize:this.classes.includes('hebrew')?BODY.hebrew.fontSize:BODY.latin.fontSize}
 get font(){return this.style.fontSize?parseFloat(this.style.fontSize):this.base}
 get metrics(){const key=['single-channel','title','hebrew','english'].find(name=>this.classes.includes(name));return key?BOX[key]:{width:1920,height:1080}}
 get clientWidth(){return this.metrics.width}
 get clientHeight(){return this.metrics.height}
 get scrollWidth(){return this.clientWidth}
 get scrollHeight(){const lines=this.textContent.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length*this.font*.55/this.clientWidth)),0);return Math.ceil(lines*this.font*1.24)}
 appendChild(child:FakeElement){this.children.push(child);return child}
 replaceChildren(...children:FakeElement[]){this.children=children}
 get all():FakeElement[]{return this.children.flatMap(child=>[child,...child.all])}
 matches(selector:string){return selector.split(',').some(part=>{const [positive,negative]=part.trim().split(':not(');const wanted=positive.split('.').filter(Boolean);const excluded=negative?negative.replace(')','').split('.').filter(Boolean):[];return wanted.every(name=>this.classes.includes(name))&&!excluded.some(name=>this.classes.includes(name))})}
 querySelectorAll(selector:string){return this.all.filter(element=>element.matches(selector))}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null}
 getAnimations(){return []}
 get childElementCount(){return this.children.length}
}
class FakeImage extends FakeElement{}
const globals=globalThis as unknown as Record<string,unknown>;
globals.HTMLImageElement=FakeImage;
globals.document={createElement:(tag:string)=>tag==='img'?new FakeImage(tag):new FakeElement(tag)};
globals.getComputedStyle=(element:FakeElement)=>({fontSize:`${element.font}px`});

const cornerCue=(texts:Record<string,string>):Cue=>({id:'corner-test',name:'Vaimru Amen',layout:'corner',texts,animations:structuredClone(bottomTemplate.animations),duration:structuredClone(bottomTemplate.duration)});
const renderCorner=(texts:Record<string,string>)=>{const cue=cornerCue(texts);const root=new FakeElement('div');const player=new Player(root as unknown as HTMLElement,[cue]);const box=player.render(cue) as unknown as FakeElement;return {box,player,cue,root}};

test('the renderer draws a corner cue as .overlay.corner with the shared parts',()=>{
 const {box,root}=renderCorner({textTitle:'Response',textMainheb:'וְאִמְרוּ אָמֵן',textMainEng:'Vaimru Amen'});
 assert.equal(root.children[0],box);
 assert.equal(box.className,'overlay corner');
 assert.deepEqual(box.children.map(child=>child.dataset.element),['baseMain','baseTitle','baseTitleGrad','accentLineBottom','textTitle','textMainEng','textMainheb','Image']);
 assert.equal(box.style.properties['--crc-blue'],box.style.properties['--crc-blue-deep'],'branding variables are set as for every layout');
 assert.equal(box.dataset.card,'corner','drawn by the generic card block');
 for(const [name,value] of Object.entries(cardStyle(CORNER_CARD)))assert.equal(box.style.properties[name],value,`the box carries ${name}`);
 assert.equal(box.dataset.fit,'fit');
 assert.equal(box.querySelector('.hebrew')!.style.fontSize,'','a short line keeps its designed size');
});

test('the renderer marks the layouts whose fit is held to their own card, and only those',()=>{
 // app/author/preview.ts finds the card through data-contain (lib/layout-registry.ts), not a list of layout classes.
 for(const layout of ['corner','left','right','bottom']){const cue={...cornerCue({textTitle:'Response',textMain:'Vaimru Amen'}),layout};const box=new Player(new FakeElement('div') as unknown as HTMLElement,[cue]).render(cue) as unknown as FakeElement;assert.equal('contain' in box.dataset,layout!=='bottom',layout);assert.equal('card' in box.dataset,layout==='corner',`${layout} card`)}
});

test('a corner line too long for its box shrinks to fit, and re-fits idempotently',()=>{
 const {box,player,cue}=renderCorner({textTitle:'Thank you',textMain:'Thank you for joining us this morning. Learn more about our community at centralreform.org'});
 const single=box.querySelector('.single-channel')!;
 const fitted=single.font;
 assert.ok(fitted<36,'the lone line shrank');
 assert.ok(fitted>=CORNER_FONT_FLOOR);
 assert.ok(single.scrollHeight<=single.clientHeight);
 assert.equal(box.dataset.fit,'fit');
 player.applyFit(box as unknown as HTMLElement,cue);
 assert.equal(single.font,fitted,'a second fit starts from the base size and lands in the same place');
});

test('text that cannot fit even at the floor is reported as overflow',()=>{
 const {box}=renderCorner({textTitle:'Too long',textMain:'word '.repeat(200)});
 assert.equal(box.querySelector('.single-channel')!.font,CORNER_FONT_FLOOR);
 assert.equal(box.dataset.fit,'overflow');
});

test('an explicit corner title size is never silently reduced by card fitting',()=>{
 const cue={...cornerCue({textTitle:'A deliberately long title that cannot fit inside the corner card header',textMain:'Amen'}),presentation:{titleFontSize:42}};
 const box=new Player(new FakeElement('div') as unknown as HTMLElement,[cue]).render(cue) as unknown as FakeElement;
 assert.equal(box.querySelector('.title')!.style.fontSize,'42px');
 assert.equal(box.dataset.fit,'overflow');
});

test('the fit is dispatched by the definition\'s strategy, with its own floor',()=>{
 assert.equal(CORNER_FONT_FLOOR,CORNER_CARD.fit.floor);
 const id='fixture-card';
 registerLayout({id,label:'Fixture card',templateLayout:'bottom',contained:true,capabilities:{sets:false,translation:false,oneBlockPerSlide:true},card:{...CORNER_CARD,fit:{...CORNER_CARD.fit,floor:30}}});
 try{
  const cue={...cornerCue({textTitle:'Too long',textMain:'word '.repeat(200)}),layout:id};
  const box=new Player(new FakeElement('div') as unknown as HTMLElement,[cue]).render(cue) as unknown as FakeElement;
  assert.equal(box.dataset.card,id);
  assert.equal(box.querySelector('.single-channel')!.font,30,'a registered card shrinks to its own floor');
  assert.equal(box.dataset.fit,'overflow');
 }finally{unregisterLayout(id)}
});

/* --------------------------------------------------------- fit contract --- */

// Just the DOM surface findFitErrors / panelFillRatio read: a card's base and one lone body box
// whose text spans `textHeight` px, rendered with data-card set to `layout`.
function cardRoot(layout:string,textHeight:number){
 const base={getBoundingClientRect:()=>({left:1232,top:832,right:1872,bottom:1032,width:640,height:200})};
 const box={left:1264,top:898,right:1848,bottom:1018,width:584,height:120};
 const element={dataset:{element:'textMain'},textContent:'Thank you',classList:{contains:(name:string)=>name==='single-channel'},scrollWidth:584,clientWidth:584,scrollHeight:120,clientHeight:120,getBoundingClientRect:()=>box};
 const overlay={dataset:{card:layout},classList:{contains:(name:string)=>name===layout}};
 const createRange=()=>({selectNodeContents(){},getClientRects:()=>[{left:1264,top:930,right:1500,bottom:930+textHeight}]});
 const previous=globals.document;globals.document={...(previous as object),createRange};
 const root={ownerDocument:{createRange:()=>({selectNodeContents(){},getClientRects:()=>[]})},getBoundingClientRect:()=>({left:0,top:0,right:1920,bottom:1080,width:1920,height:1080}),
  querySelector:(selector:string)=>selector==='.overlay'||selector==='.overlay[data-card]'?overlay:selector==='.overlay[data-contain] .base'||selector==='.overlay .base'?base:null,
  querySelectorAll:(selector:string)=>selector==='.overlay .part, .overlay .content-row, .overlay .prayer'||selector==='.overlay .prayer'?[element]:[]} as unknown as HTMLElement;
 return {root,restore:()=>{globals.document=previous}};
}

test('a corner card reports no fill ratio and is never warned sparse, as before',()=>{
 assert.equal(CORNER_CARD.fit.fill,null);
 assert.equal(CORNER_CARD.fit.heightCeiling,null);
 const {root,restore}=cardRoot('corner',30);
 try{
  assert.equal(panelFillRatio(root),null);
  assert.deepEqual(findFitWarnings(root),[]);
  assert.deepEqual(findFitErrors(root),[]);
 }finally{restore()}
});

test('a card that defines a fill and a height ceiling is measured against its own',()=>{
 const id='fixture-sparse-card';
 registerLayout({id,label:'Fixture',templateLayout:'bottom',contained:true,capabilities:{sets:false,translation:false,oneBlockPerSlide:true},card:{...CORNER_CARD,fit:{...CORNER_CARD.fit,fill:{denominator:120,sparseBelow:0.5},heightCeiling:180}}});
 const {root,restore}=cardRoot(id,30);
 try{
  assert.equal(panelFillRatio(root),0.25);
  assert.deepEqual(findFitWarnings(root),['Sparse — consider Lower third']);
  assert.deepEqual(findFitErrors(root),['The card is 200px tall; limit is 180px.']);
 }finally{restore();unregisterLayout(id)}
});

/* ----------------------------------------------------- authoring model --- */

test('the corner layout is labelled "Corner" and borrows a lower-third template',()=>{
 assert.equal(layoutLabel('corner'),'Corner');
 assert.equal(templateLayoutFor('corner'),'bottom');
 for(const layout of ['bottom','left','right'])assert.equal(templateLayoutFor(layout),layout,'the three baseline layouts keep their own templates');
});

const editable=(layout:string,templateCueId:string,content:unknown={mode:'custom',text:'וְאִמְרוּ אָמֵן\nVaimru Amen'})=>({name:'Vaimru Amen',title:'Response',layout,templateCueId,content,presentation:{}});

test('a corner draft validates against a lower-third template and nothing else',()=>{
 assert.equal(parseEditable(editable('corner',bottomTemplate.id)).layout,'corner');
 assert.throws(()=>parseEditable(editable('corner',leftTemplate.id)),(error:unknown)=>error instanceof AuthoringError&&error.code==='template_layout_mismatch');
 assert.throws(()=>parseEditable(editable('middle',bottomTemplate.id)),/layout must be bottom, left, right, corner, or nameplate/);
});

const draftOf=(value:EditableDraft):Draft=>({...value,id:'draft-corner',version:1,sourcePin:sourcePinFor(value.content),activeRevision:null,activeDraftVersion:null,createdAt:0,updatedAt:0,createdBy:'test',updatedBy:'test'});
const customDraft=(layout:'corner'|'bottom'):Draft=>draftOf(parseEditable(editable(layout,bottomTemplate.id)) as EditableDraft);

test('a corner draft publishes a corner cue with the lower third motion',()=>{
 const cue=buildCue(customDraft('corner'));
 assert.equal(cue.layout,'corner');
 assert.equal(cue.texts.textMain,'וְאִמְרוּ אָמֵן Vaimru Amen','a typed break travels as U+2028, so reflow keeps it');
 assert.deepEqual(cue.duration,bottomTemplate.duration);
 assert.ok(cue.animations.some(track=>track.element==='baseMain'),'the bars keep their motion');
 assert.equal(cue.contentRows,undefined,'a corner card never carries panel rows');
});

test('a siddur corner draft shows Hebrew over transliteration and refuses a lit translation',()=>{
 const barechu=editableFromBaseline(bottomTemplate.id);
 assert.equal(barechu.content.mode,'bilingual','fixture: the first lower third is a siddur graphic');
 const cue=buildCue(draftOf({...barechu,layout:'corner'}));
 assert.equal(cue.layout,'corner');
 assert.ok(cue.texts.textMainheb&&cue.texts.textMainEng);
 assert.equal(cue.texts.textTranslation,undefined);
 const content=barechu.content as BilingualContent;
 assert.throws(()=>buildCue(draftOf({...barechu,layout:'corner',content:{...content,layers:['he','tr','en']}})),(error:unknown)=>error instanceof AuthoringError&&error.code==='corner_translation_unsupported');
});

test('style_draft can move a draft to the corner using a lower-third template',()=>{
 const templates=cues.filter(cue=>!cue.hidden).map(cue=>({id:cue.id,layout:cue.layout as 'bottom'|'left'|'right'}));
 const draft={...customDraft('bottom'),layout:'left',templateCueId:leftTemplate.id} as Draft;
 const plan=planDraftStyle(draft,{layout:'corner'},templates);
 assert.equal(plan.patch.layout,'corner');
 assert.equal(templates.find(template=>template.id===plan.patch.templateCueId)?.layout,'bottom');
});

/* --------------------------------------------------------------- editor --- */

test('the editor offers a corner tile, a corner starter, and treats a corner like one lower-third row',()=>{
 const summaries:TemplateLookSummary[]=cues.filter(cue=>!cue.hidden).map(cue=>({id:cue.id,layout:cue.layout as TemplateLookSummary['layout'],importable:true}));
 const looks=templateLooks(summaries,'custom');
 const corner=looks.find(look=>look.layout==='corner');
 assert.equal(corner?.label,'Corner · one line');
 assert.equal(summaries.find(item=>item.id===corner?.id)?.layout,'bottom','the tile points at a lower-third baseline');
 const starter=CUSTOM_TEMPLATES.find(item=>item.layout==='corner');
 assert.ok(starter,'the custom editor has a corner starter');
 assert.deepEqual(starter!.compose({heading:'Response',hebrew:'אֵל נָא רְפָא נָא לָהּ',line:'El Na Refa Na La'}),{name:'Corner card · El Na Refa Na La',title:'Response',text:'אֵל נָא רְפָא נָא לָהּ\nEl Na Refa Na La'});
 assert.equal(exceedsOnePanel([{he:'א'},{he:'ב'}],'bilingual','corner'),true);
 assert.equal(exceedsOnePanel([{he:'א'}],'bilingual','corner'),false);
});

/* ------------------------------------------------ service and MCP tools --- */

const KOL_NIDRE='library:crc-kol-nidre:erev-yk.kol-nidre@crc-kol-nidre';

test('the authoring service creates and lists corner drafts, and refuses to cut a set into corners',async()=>{
 const service=createAuthoringService(new MemoryAuthoringRepository());
 const created=await service.operation('create_draft',editable('corner',bottomTemplate.id),'tester') as {draft:Draft};
 assert.equal(created.draft.layout,'corner');
 const listed=await service.operation('list_drafts',{compact:true,layout:'corner'},'tester') as {drafts:Array<{id:string;layout:string}>};
 assert.deepEqual(listed.drafts.map(row=>row.layout),['corner']);
 await assert.rejects(service.operation('list_drafts',{compact:true,layout:'middle'},'tester'),/layout must be bottom, left, right, corner, or nameplate/);
 await assert.rejects(service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'corner',templateCueId:bottomTemplate.id},'tester'),(error:unknown)=>error instanceof AuthoringError&&error.code==='corner_set_unsupported');
 const dry=await service.operation('style_draft',{draftId:created.draft.id,expectedVersion:created.draft.version,layout:'corner'},'tester') as {dryRun:boolean};
 assert.equal(dry.dryRun,true,'style_draft accepts the corner layout');
});

const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
// Every change names its congregation (lib/mcp.ts). These tests are about the tools, so a call
// names CRC unless it says otherwise; a test that wants the argument absent sets it undefined.
const withWorkspace=(body:unknown)=>{const call=body as {method?:string;params?:{arguments?:Record<string,unknown>}};return call.method==='tools/call'&&call.params?.arguments&&!('workspace' in call.params.arguments)?{...call,params:{...call.params,arguments:{...call.params.arguments,workspace:'crc'}}}:body};
const request=(body:unknown)=>new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify(withWorkspace(body))});
async function payload(response:Response){const text=await response.text();if(response.headers.get('content-type')?.includes('application/json'))return JSON.parse(text);const data=text.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);assert.ok(data,'SSE response has a data event');return JSON.parse(data)}

test('every MCP tool that takes a layout accepts corner',async()=>{
 const calls:{operation:string;input:unknown}[]=[];const handler=createAuthoringMcpHandler(async(operation,input)=>{calls.push({operation,input});return {ok:true}});
 const listed=await payload(await handler.fetch(request({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),{authInfo})) as {result:{tools:{name:string;inputSchema:{properties:Record<string,{enum?:string[]}>}}[]}};
 for(const name of ['create_draft','list_drafts','create_source_draft_set','style_draft']){
  const tool=listed.result.tools.find(item=>item.name===name);
  assert.deepEqual(tool?.inputSchema.properties.layout?.enum,['left','bottom','right','corner','nameplate'],`${name} lists corner`);
 }
 const draft={...editable('corner','template-bottom'),content:{mode:'custom',text:'Thank you'}};
 const created=await payload(await handler.fetch(request({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'create_draft',arguments:draft}}),{authInfo})) as {result:{isError?:boolean}};
 assert.notEqual(created.result.isError,true);
 assert.deepEqual(calls.map(call=>call.operation),['create_draft']);
 assert.equal((calls[0].input as {layout:string}).layout,'corner');
});

test('a name plate sets its name as a larger lead line over left-to-right detail lines',()=>{
 const cue={...cornerCue({textTitle:'Bar Mitzvah of',textMain:'Gavin Stein\nבֶּנְיָה פְּרֶעֵל | Benyah P\'re-eil'}),layout:'nameplate'};
 const box=new Player(new FakeElement('div') as unknown as HTMLElement,[cue]).render(cue) as unknown as FakeElement;
 assert.equal(box.dataset.card,'nameplate');
 const nameplate=layoutDefinition('nameplate')!.card!;
 assert.equal(nameplate.frame.insetX*2+nameplate.frame.width,1920,'centred along the bottom of the frame');
 assert.equal(box.style.properties['--card-lead-scale'],String(nameplate.body.lead!.fontSize/nameplate.body.single.fontSize));
 const single=box.querySelector('.single-channel')!;
 assert.ok('lead' in single.dataset);
 assert.deepEqual(single.children.map(line=>[line.className,line.textContent]),[['card-line card-line-lead','Gavin Stein'],['card-line','בֶּנְיָה פְּרֶעֵל | Benyah P\'re-eil']]);
 // The corner card has no lead: its lone channel stays one block.
 const corner=renderCorner({textTitle:'Response',textMain:'וְאִמְרוּ אָמֵן\nVaimru Amen'}).box.querySelector('.single-channel')!;
 assert.equal(corner.children.length,0);assert.ok(!('lead' in corner.dataset));
});

test('only the name plate centres its heading with centred text',()=>{
 const css=readFileSync(fileURLToPath(new URL('../app/overlay.css',import.meta.url)),'utf8');
 const rules=css.split('\n').filter(line=>line.includes('[data-alignment="center"]'));
 assert.equal(rules.length,1);
 assert.match(rules[0],/^\.overlay\[data-card="nameplate"\]\[data-alignment="center"\]/,'no other layout is keyed to it');
 const cue={...cornerCue({textTitle:'Bar Mitzvah of',textMain:'Gavin Stein'}),layout:'nameplate',presentation:{alignment:'center' as const}};
 const box=new Player(new FakeElement('div') as unknown as HTMLElement,[cue]).render(cue) as unknown as FakeElement;
 assert.equal(box.dataset.alignment,'center');
});
