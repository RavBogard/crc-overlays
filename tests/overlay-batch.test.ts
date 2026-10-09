import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, heldTitles, BOTTOM_DEFAULT_SPLIT, bottomColumnWidths, bottomRows, type Cue } from '../lib/player.ts';
import { tracksFor, type AnimationTrack } from '../lib/player-motion.ts';
import { publishFitIssues } from '../app/author/preview.ts';
import { buildCue, editableFromBaseline, parseEditable, sourcePinFor, type Draft } from '../lib/authoring-model.ts';
import baseline from '../lib/cues.json';

test('Hebrew title inherits Latin title entrance and exit, preserving explicit Hebrew motion', () => {
  const tracks: AnimationTrack[] = ['In', 'Out'].map(direction => ({element:'textTitle',direction,effect:{effect:'fade'},keyframes:[0,.4]}));
  for (const direction of ['In','Out'] as const) assert.deepEqual(tracksFor('accentTextTitle',direction,tracks),tracks.filter(track=>track.direction===direction));
  const explicit:AnimationTrack={element:'accentTextTitle',direction:'Out',effect:{effect:'translate'}};
  assert.deepEqual(tracksFor('accentTextTitle','Out',[...tracks,explicit]),[explicit]);
});

test('bottom columns keep the original geometry and move only with an authored divider', () => {
  assert.deepEqual(bottomColumnWidths(),[730,850]);
  assert.equal(BOTTOM_DEFAULT_SPLIT,46);
  assert.deepEqual(bottomColumnWidths(60),[948,632]);
  assert.deepEqual(bottomColumnWidths(5),[316,1264],'clamped to 20%');
  assert.deepEqual(bottomColumnWidths(95),[1264,316],'clamped to 80%');
});

test('bottom rows: side by side keeps two columns with English above or below; stacked follows order', () => {
  const all=['he','tr','en'] as const;
  assert.deepEqual(bottomRows(undefined,false,all),{he:1,tr:1,en:2});
  assert.deepEqual(bottomRows(['en','he','tr'],false,all),{en:1,he:2,tr:2});
  assert.deepEqual(bottomRows(['he','en','tr'],false,all),{he:1,en:2,tr:1},'English between the two stays below the columns');
  assert.deepEqual(bottomRows(undefined,true,all),{he:1,tr:2,en:3},'stacking keeps the default order, Hebrew first');
  assert.deepEqual(bottomRows(['tr','en','he'],true,all),{tr:1,en:2,he:3});
  assert.deepEqual(bottomRows(['en','he','tr'],true,['he','tr']),{he:1,tr:2});
});

test('bottom divider is validated as a whole percentage from 20 to 80', () => {
  assert.deepEqual(parseEditable({presentation:{bottomSplit:62}},true).presentation,{bottomSplit:62});
  for(const bad of [19,81,50.5,'50'])assert.throws(()=>parseEditable({presentation:{bottomSplit:bad}},true));
});

test('publish confirmation covers overlaps while retaining actual fit failures', () => {
  assert.deepEqual(publishFitIssues(['textMainEng overlaps textMainheb.','textMainheb does not fit its box.']),{
    confirmations:['textMainEng overlaps textMainheb.'],blocking:['textMainheb does not fit its box.'],
  });
});

test('bottom arrangement is validated and saved language order reaches bottom and corner cues', () => {
  assert.deepEqual(parseEditable({presentation:{bottomLayout:'stacked'}},true).presentation,{bottomLayout:'stacked'});
  assert.throws(()=>parseEditable({presentation:{bottomLayout:'floating'}},true));
  const template=(baseline as unknown as Cue[]).find(cue=>cue.layout==='bottom'&&cue.texts.textMainheb&&cue.texts.textMainEng)!;
  for(const layout of ['bottom','corner'] as const){
    const editable=editableFromBaseline(template.id);
    assert.equal(editable.content.mode,'bilingual');
    if(editable.content.mode!=='bilingual')continue;
    editable.layout=layout;editable.content.rowOrder=['tr','he','en'];
    const draft:Draft={...editable,id:'ordered',version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:1,updatedAt:1,createdBy:'test',updatedBy:'test'};
    assert.deepEqual(buildCue(draft).rowOrder,['tr','he','en']);
  }
});

function transitionFixture(nextLayout='left'){
  const first:Cue={id:'a',name:'First',layout:'left',texts:{textMain:'First'},animations:[],duration:{}};
  const next:Cue={...first,id:'b',name:'Next',layout:nextLayout};
  const box={querySelectorAll:()=>[],style:{visibility:''}} as unknown as HTMLElement;
  let clears=0;
  const rootNode:{firstElementChild:HTMLElement|null;replaceChildren:()=>void}={firstElementChild:box,replaceChildren(){clears++;rootNode.firstElementChild=null;}};
  const root=rootNode as unknown as HTMLElement;
  const player=new Player(root,[first,next],undefined,{waitForAssets:async()=>{}});
  const modes:Array<[string,boolean]>=[];
  let retained:HTMLElement|undefined;
  player.current=first;player.desired={cue:'b',revision:1,mode:'animate'};
  player.animate=async(_box,_cue,direction,wordsOnly=false)=>{modes.push([direction,wordsOnly]);};
  player.applyFit=()=>{};
  player.render=(_cue,_url,previous)=>{retained=previous;return box;};
  return {player,box,modes,retained:()=>retained,clears:()=>clears};
}

test('left-to-left replacement retains its shell and animates only words; clearing uses full exit',async()=>{
  const fixture=transitionFixture();await fixture.player.drain();
  assert.deepEqual(fixture.modes,[['Out',true],['In',true]]);
  assert.equal(fixture.retained(),fixture.box);assert.equal(fixture.clears(),0);
  fixture.player.desired={cue:null,revision:2,mode:'animate'};await fixture.player.drain();
  assert.deepEqual(fixture.modes.at(-1),['Out',false]);assert.equal(fixture.clears(),1);
});

test('changing from left to a different layout animates the entire overlay',async()=>{
  const fixture=transitionFixture('bottom');await fixture.player.drain();
  assert.deepEqual(fixture.modes,[['Out',false],['In',false]]);
  assert.equal(fixture.retained(),undefined);assert.equal(fixture.clears(),1);
});

test('a hide command during artwork resolution cannot leave an abandoned panel on screen',async()=>{
  const fixture=transitionFixture();
  fixture.player.options.resolveAssetUrl=async()=>{fixture.player.desired={cue:null,revision:2,mode:'animate'};return undefined;};
  await fixture.player.drain();
  assert.equal(fixture.player.current,null);assert.equal(fixture.clears(),1);assert.equal(fixture.player.phase,'settled');
});

test('a words-only change starts the words at once, without the panel lead-in of the full graphic',async()=>{
  const delays:number[]=[];
  const el={dataset:{element:'textMainEng'},style:{visibility:''},classList:{contains:()=>false},matches:()=>true,animate:(_frames:unknown,options:{delay:number})=>{delays.push(options.delay);return {finished:Promise.resolve()}}};
  const box={querySelectorAll:()=>[el],style:{visibility:''}} as unknown as HTMLElement;
  const cue:Cue={id:'a',name:'A',layout:'left',texts:{textMainEng:'x'},duration:{In:1},animations:[
    {element:'textMainEng',direction:'In',effect:{effect:'fade'},keyframes:[.4,.9]},
    {element:'textMainEng',direction:'In',effect:{effect:'fade'},keyframes:[.6,.9]}]};
  const player=new Player({replaceChildren(){}} as unknown as HTMLElement,[cue]);
  await player.animate(box,cue,'In',true);
  assert.deepEqual(delays.map(d=>Math.round(d)),[0,200]);
  delays.length=0;await player.animate(box,cue,'In');
  assert.deepEqual(delays.map(d=>Math.round(d)),[400,600],'the full graphic keeps its timing');
});

// The left panel's own template (lib/cues.json): its words fade out by about .15s while their slide
// runs to about .39s, and fade in .2s after their slide in starts.
const leftTemplate=(baseline as unknown as Cue[]).find(cue=>cue.layout==='left'&&cue.animations.some(track=>track.element==='HebText'&&track.direction==='Out'))!;
function timedElement(element:string,classes:string,log:Array<{element:string;delay:number;end:number}>){
  return {dataset:{element},style:{visibility:''},classList:{contains:(name:string)=>classes.split(' ').includes(name)},matches:(selector:string)=>selector.split(',').some(part=>classes.split(' ').includes(part.trim().slice(1))),
    animate:(_frames:unknown,options:{delay:number;duration:number})=>{log.push({element,delay:options.delay,end:options.delay+options.duration});return {finished:Promise.resolve()}}};
}

test('a words-only change leaves no blank panel: words go once faded and appear at once',async()=>{
  const log:Array<{element:string;delay:number;end:number}>=[];
  const els=[timedElement('textTitle','part title',log),timedElement('textMainheb','part prayer hebrew',log),timedElement('textMainEng','part prayer english',log)];
  const box={querySelectorAll:()=>els,style:{visibility:''}} as unknown as HTMLElement;
  const player=new Player({replaceChildren(){}} as unknown as HTMLElement,[leftTemplate]);
  await player.animate(box,leftTemplate,'Out',true);
  assert.ok(Math.max(...log.map(item=>item.end))<=160,`the words are gone by their fade's end, not the slide's (${Math.max(...log.map(item=>item.end))}ms)`);
  log.length=0;await player.animate(box,leftTemplate,'In',true);
  const fadeIns=log.filter(item=>item.element!=='textTitle');
  assert.ok(fadeIns.some(item=>Math.round(item.delay)===0),'the words start becoming visible at once');
  assert.ok(log.every(item=>item.end>0));
  log.length=0;await player.animate(box,leftTemplate,'Out');
  assert.ok(Math.max(...log.map(item=>item.end))>=380,'the full exit keeps its slide');
});

test('a title both panels share is held: only what changes animates',async()=>{
  const log:Array<{element:string;delay:number;end:number}>=[];
  const els=[timedElement('textTitle','part title',log),timedElement('accentTextTitle','part title title-accent',log),timedElement('textMainEng','part prayer english',log)];
  const box={querySelectorAll:()=>els,style:{visibility:''}} as unknown as HTMLElement;
  const player=new Player({replaceChildren(){}} as unknown as HTMLElement,[leftTemplate]);
  await player.animate(box,leftTemplate,'Out',true,new Set(['textTitle','accentTextTitle']));
  assert.deepEqual([...new Set(log.map(item=>item.element))],['textMainEng']);
  log.length=0;await player.animate(box,leftTemplate,'In',true,new Set(['textTitle']));
  assert.deepEqual([...new Set(log.map(item=>item.element))],['accentTextTitle','textMainEng']);
});

test('heldTitles holds a title only when its text and its drawing are the same',()=>{
  const cue=(texts:Record<string,string>,presentation:Cue['presentation']={}):Cue=>({id:'x',name:'x',layout:'left',texts,animations:[],duration:{},presentation});
  const shema={textTitle:'Shema',accentTextTitle:'שְׁמַע'};
  assert.deepEqual([...heldTitles(cue({...shema,textMainEng:'a'}),cue({...shema,textMainEng:'b'}))],['textTitle','accentTextTitle']);
  assert.deepEqual([...heldTitles(cue({...shema}),cue({textTitle:'Shema',accentTextTitle:'וְאָהַבְתָּ'}))],['textTitle']);
  assert.deepEqual([...heldTitles(cue({...shema}),cue({textTitle:'V\'ahavta',accentTextTitle:'שְׁמַע'}))],['accentTextTitle']);
  assert.deepEqual([...heldTitles(cue({...shema}),cue({textTitle:'Shema'}))],[],'losing the Hebrew title moves the English one');
  assert.deepEqual([...heldTitles(cue({...shema}),cue({...shema},{legacyTitleWatermark:true}))],[],'a watermark is drawn differently');
  assert.deepEqual([...heldTitles(cue({...shema}),cue({...shema},{titleLetterSpacing:2}))],[]);
  assert.deepEqual([...heldTitles(cue({...shema}),cue({...shema},{hebrewFontFamily:'david-libre'}))],['textTitle']);
});

test('a left-to-left change hands the shared title to render and both animations',async()=>{
  const first:Cue={id:'a',name:'First',layout:'left',texts:{textTitle:'Shema',textMainEng:'one'},animations:[],duration:{}};
  const next:Cue={...first,id:'b',texts:{textTitle:'Shema',textMainEng:'two'}};
  const box={querySelectorAll:()=>[],style:{visibility:''}} as unknown as HTMLElement;
  const root={firstElementChild:box,replaceChildren(){}} as unknown as HTMLElement;
  const player=new Player(root,[first,next],undefined,{waitForAssets:async()=>{}});
  const helds:string[][]=[];let rendered:string[]=[];
  player.current=first;player.desired={cue:'b',revision:1,mode:'animate'};
  player.animate=async(...args)=>{helds.push([...(args[4]??[])]);};
  player.applyFit=()=>{};
  player.render=(_cue,_url,_previous,held=new Set())=>{rendered=[...held];return box;};
  await player.drain();
  assert.deepEqual(helds,[['textTitle'],['textTitle']]);assert.deepEqual(rendered,['textTitle']);
});
