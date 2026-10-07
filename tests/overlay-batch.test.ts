import test from 'node:test';
import assert from 'node:assert/strict';
import { Player, bottomColumnWidths, type Cue } from '../lib/player.ts';
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

test('bottom columns hug short content and allocate limited space without favouring Hebrew', () => {
  assert.deepEqual(bottomColumnWidths(510,220),[510,220]);
  const widths=bottomColumnWidths(2000,800);
  assert.equal(widths[0]+widths[1],1578);
  assert.ok(widths[0]>widths[1]);
  assert.deepEqual(bottomColumnWidths(0,0),[80,80]);
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
