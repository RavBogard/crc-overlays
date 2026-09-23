import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import baseline from '../lib/cues.json';
import {layoutLabel,templateLayoutFor} from '../lib/layout-label.ts';
import {Player,CORNER_FONT_FLOOR,type Cue} from '../lib/player.ts';
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

const css=readFileSync(fileURLToPath(new URL('../app/overlay.css',import.meta.url)),'utf8');
/** The px declarations of the last rule whose selector list is exactly `selector`. */
const rule=(selector:string)=>{
 const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const body=[...css.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\{([^}]*)\\}`,'g'))].at(-1)?.[1];
 assert.ok(body,`app/overlay.css declares ${selector}`);
 return (name:string)=>{const value=body!.match(new RegExp(`(?:^|;)${name}:(-?\\d+)px`))?.[1];assert.ok(value!==undefined,`${selector} sets ${name}`);return Number(value)};
};
/** A right/bottom-anchored box as frame coordinates. */
const rect=(selector:string,height?:number)=>{const r=rule(selector);const h=height??r('height');return {left:1920-r('right')-r('width'),right:1920-r('right'),top:1080-r('bottom')-h,bottom:1080-r('bottom')}};
type Rect={left:number;right:number;top:number;bottom:number};
const inside=(inner:Rect,outer:Rect)=>inner.left>=outer.left&&inner.right<=outer.right&&inner.top>=outer.top&&inner.bottom<=outer.bottom;

test('the corner card sits flush in the bottom-right corner at the logo and scan-card inset',()=>{
 const card=rect('.corner .base');
 assert.deepEqual(card,{left:1232,right:1872,top:832,bottom:1032});
 assert.equal(card.right,RESTING_LOGO_RECT.right,'same right inset as the resting logo');
 assert.equal(card.bottom,RESTING_LOGO_RECT.bottom,'same bottom inset as the resting logo');
 assert.equal(card.right,BUG_RESERVED_RECT.right);
 assert.equal(card.bottom,BUG_RESERVED_RECT.bottom);
 assert.ok(inside(card,{left:0,top:0,right:1920,bottom:1080}),'inside the 1920x1080 frame');
});

test('every corner part and text box lies inside the card',()=>{
 const card=rect('.corner .base');
 const titlebar=rect('.corner .titlebar');
 for(const selector of ['.corner .titlebar','.corner .accent','.corner .logo','.corner .title']){
  assert.ok(inside(rect(selector),card),`${selector} is inside the card`);
 }
 // The body boxes take their width and right edge from `.corner .prayer`.
 const prayer=rule('.corner .prayer');
 const body=(selector:string)=>{const r=rule(selector);return {left:1920-prayer('right')-prayer('width'),right:1920-prayer('right'),top:1080-r('bottom')-r('height'),bottom:1080-r('bottom')}};
 const hebrew=body('.corner .hebrew'),english=body('.corner .english,.corner .translation'),single=body('.corner .single-channel');
 for(const [name,box] of [['hebrew',hebrew],['english',english],['single',single]] as const){
  assert.ok(inside(box,card),`${name} is inside the card`);
  assert.ok(box.top>=titlebar.bottom,`${name} is below the title strip`);
 }
 assert.ok(hebrew.bottom<=english.top,'Hebrew stacks above its transliteration without overlapping');
 assert.ok(inside(rect('.corner .logo'),titlebar),'the logo sits in the title strip');
 const title=rect('.corner .title');
 assert.ok(title.right<=rect('.corner .logo').left,'the title ends before the logo');
});

test('the corner card sets Hebrew RTL and right-aligned, its transliteration left-aligned',()=>{
 assert.match(css,/\.corner \.hebrew\{[^}]*direction:rtl;text-align:right\}/);
 assert.match(css,/\.corner \.english,\.corner \.translation\{[^}]*text-align:left\}/);
 assert.match(css,/\.corner \.single-channel\{[^}]*text-align:start\}/,'a lone channel aligns each line to its own direction');
 assert.match(css,/\.corner::before,\.corner::after\{display:none\}/,'no decorative circles');
 assert.match(css,/\.corner \.base\{[^}]*transform-origin:right center\}/,'the card scales in from its right edge');
});

/* ------------------------------------------------------------ renderer --- */

// Just enough DOM for Player.render and applyFit: class lists, text, style and a crude text
// metric (0.55em per character, wrapping at the box width) so the corner fit can be exercised.
const BOX:Record<string,{width:number;height:number}>={title:{width:532,height:48},hebrew:{width:584,height:58},english:{width:584,height:56},'single-channel':{width:584,height:120}};
class FakeElement{
 tagName:string;className='';dataset:Record<string,string>={};textContent='';children:FakeElement[]=[];src='';alt='';
 style:{fontSize:string;visibility?:string;properties:Record<string,string>;setProperty(name:string,value:string):void}={fontSize:'',properties:{},setProperty(name,value){this.properties[name]=value}};
 constructor(tag:string){this.tagName=tag}
 get classes(){return this.className.split(/\s+/).filter(Boolean)}
 get base(){return this.classes.includes('title')?28:this.classes.includes('hebrew')?40:this.classes.includes('single-channel')?36:32}
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
 assert.equal(box.dataset.fit,'fit');
 assert.equal(box.querySelector('.hebrew')!.style.fontSize,'','a short line keeps its designed size');
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
 assert.throws(()=>parseEditable(editable('middle',bottomTemplate.id)),/layout must be bottom, left, right, or corner/);
});

const draftOf=(value:EditableDraft):Draft=>({...value,id:'draft-corner',version:1,sourcePin:sourcePinFor(value.content),activeRevision:null,activeDraftVersion:null,createdAt:0,updatedAt:0,createdBy:'test',updatedBy:'test'});
const customDraft=(layout:'corner'|'bottom'):Draft=>draftOf(parseEditable(editable(layout,bottomTemplate.id)) as EditableDraft);

test('a corner draft publishes a corner cue with the lower third motion',()=>{
 const cue=buildCue(customDraft('corner'));
 assert.equal(cue.layout,'corner');
 assert.equal(cue.texts.textMain,'וְאִמְרוּ אָמֵן\nVaimru Amen');
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
 await assert.rejects(service.operation('list_drafts',{compact:true,layout:'middle'},'tester'),/layout must be left, bottom, right, or corner/);
 await assert.rejects(service.operation('create_source_draft_set',{sourceId:KOL_NIDRE,mode:'bilingual',layout:'corner',templateCueId:bottomTemplate.id},'tester'),(error:unknown)=>error instanceof AuthoringError&&error.code==='corner_set_unsupported');
 const dry=await service.operation('style_draft',{draftId:created.draft.id,expectedVersion:created.draft.version,layout:'corner'},'tester') as {dryRun:boolean};
 assert.equal(dry.dryRun,true,'style_draft accepts the corner layout');
});

const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
const request=(body:unknown)=>new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify(body)});
async function payload(response:Response){const text=await response.text();if(response.headers.get('content-type')?.includes('application/json'))return JSON.parse(text);const data=text.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);assert.ok(data,'SSE response has a data event');return JSON.parse(data)}

test('every MCP tool that takes a layout accepts corner',async()=>{
 const calls:{operation:string;input:unknown}[]=[];const handler=createAuthoringMcpHandler(async(operation,input)=>{calls.push({operation,input});return {ok:true}});
 const listed=await payload(await handler.fetch(request({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),{authInfo})) as {result:{tools:{name:string;inputSchema:{properties:Record<string,{enum?:string[]}>}}[]}};
 for(const name of ['create_draft','list_drafts','create_source_draft_set','style_draft']){
  const tool=listed.result.tools.find(item=>item.name===name);
  assert.deepEqual(tool?.inputSchema.properties.layout?.enum,['left','bottom','right','corner'],`${name} lists corner`);
 }
 const draft={...editable('corner','template-bottom'),content:{mode:'custom',text:'Thank you'}};
 const created=await payload(await handler.fetch(request({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'create_draft',arguments:draft}}),{authInfo})) as {result:{isError?:boolean}};
 assert.notEqual(created.result.isError,true);
 assert.deepEqual(calls.map(call=>call.operation),['create_draft']);
 assert.equal((calls[0].input as {layout:string}).layout,'corner');
});
