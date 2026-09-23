import test from 'node:test';
import assert from 'node:assert/strict';
import {baselineCues,buildCue,cueHash,editableFromBaseline,parseContent,parseRowOrder,sourcePinFor,textRowOrder,type BilingualContent,type Draft,type EditableDraft} from '../lib/authoring-model.ts';
import {planDraftStyle} from '../lib/authoring-style.ts';
import {panelRowChannels} from '../lib/player.ts';

/* Michael's per-graphic row order (Daniel, 2026-09-23): any order of the three layers, default
   Hebrew, transliteration, translation, and every existing graphic unchanged. */

const TRANSLATED='0135de3c-9a47-4fdc-91b9-99bacdf64970';

function draftOf(editable:EditableDraft,id:string):Draft{
 const now=1;
 return {...editable,id,version:1,sourcePin:sourcePinFor(editable.content,editable.content.mode==='custom'?[]:undefined),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
}
const layerOf=(row:{he:string;tr:string;en:string})=>row.he?'he':row.tr?'tr':'en';
function translated(){const editable=editableFromBaseline(TRANSLATED);return {editable,content:editable.content as BilingualContent}}

test('the default order is never stored and builds the identical cue and hash',()=>{
 const {editable,content}=translated();
 assert.ok(editable.layout==='left'||editable.layout==='right');
 assert.equal(content.rowOrder,undefined,'an existing graphic carries no row order');
 for(const arrangement of [undefined,'blocks'] as const){
  const plain=parseContent({...content,...(arrangement?{arrangement}:{})});
  const explicit=parseContent({...content,...(arrangement?{arrangement}:{}),rowOrder:['he','tr','en']}) as BilingualContent;
  assert.equal(explicit.rowOrder,undefined,'the default order normalizes to absent');
  assert.deepEqual(explicit,plain);
  const before=buildCue(draftOf({...editable,content:plain},TRANSLATED));
  const after=buildCue(draftOf({...editable,content:explicit},TRANSLATED));
  assert.equal('rowOrder' in before,false,'the built cue gains no field');
  assert.equal(cueHash(after),cueHash(before));
 }
 const together=buildCue(draftOf(editable,TRANSLATED));
 assert.deepEqual(panelRowChannels(together.contentRows![0],together.rowOrder).map(item=>item.classes),['row-hebrew','row-transliteration','row-translation']);
});

test('In blocks stacks one row per layer in the requested order',()=>{
 const {editable,content}=translated();
 const ordered=parseContent({...content,arrangement:'blocks',rowOrder:['tr','en','he']}) as BilingualContent;
 assert.deepEqual(ordered.rowOrder,['tr','en','he']);
 const cue=buildCue(draftOf({...editable,content:ordered},TRANSLATED));
 assert.deepEqual(cue.contentRows!.map(layerOf),['tr','en','he']);
 assert.deepEqual(cue.rowOrder,['tr','en','he']);
 const unlit=buildCue(draftOf({...editable,content:parseContent({...content,arrangement:'blocks',layers:['he','en'],rowOrder:['en','tr','he']})},TRANSLATED));
 assert.deepEqual(unlit.contentRows!.map(layerOf),['en','he'],'a dark layer is skipped');
});

test('Together keeps its rows and orders the layers inside each one',()=>{
 const {editable,content}=translated();
 const plain=buildCue(draftOf(editable,TRANSLATED));
 const cue=buildCue(draftOf({...editable,content:parseContent({...content,rowOrder:['en','he','tr']})},TRANSLATED));
 assert.deepEqual(cue.contentRows,plain.contentRows,'the same rows, the same words');
 assert.deepEqual(cue.rowOrder,['en','he','tr']);
 assert.deepEqual(panelRowChannels(cue.contentRows![0],cue.rowOrder).map(item=>item.classes),['row-translation','row-hebrew','row-transliteration']);
 assert.deepEqual(panelRowChannels({he:'a',tr:'',en:'c'},['tr','en','he']).map(item=>item.classes),['row-translation','row-hebrew']);
});

test('a lower third ignores the row order',()=>{
 const {editable,content}=translated();
 const bottom=baselineCues.find(cue=>cue.layout==='bottom'&&cue.texts.textMainheb)!;
 const withOrder=buildCue(draftOf({...editable,layout:'bottom',templateCueId:bottom.id,content:parseContent({...content,rowOrder:['tr','he','en']})},TRANSLATED));
 const without=buildCue(draftOf({...editable,layout:'bottom',templateCueId:bottom.id},TRANSLATED));
 assert.equal(withOrder.rowOrder,undefined);
 assert.deepEqual(withOrder.texts,without.texts,'the same two columns and translation line');
 assert.equal(withOrder.contentRows,undefined);
});

test('a row order names each of the three layers exactly once',()=>{
 const {content}=translated();
 for(const bad of [['he','tr'],['he','he','en'],['he','tr','xx'],['he','tr','en','en'],'he,tr,en',[]])
  assert.throws(()=>parseContent({...content,rowOrder:bad}),/he, tr and en exactly once/,JSON.stringify(bad));
 assert.equal(parseRowOrder(undefined),undefined);
 assert.deepEqual(parseRowOrder(['en','tr','he']),['en','tr','he']);
 assert.deepEqual(textRowOrder({}),['he','tr','en']);
});

test('style_draft sets, keeps and clears a row order without touching the text',()=>{
 const {editable,content}=translated();
 const draft=draftOf({...editable,content:{...content,arrangement:'blocks'}},TRANSLATED);
 const set=planDraftStyle(draft,{rowOrder:['tr','he','en']},[]);
 assert.deepEqual(set.patch.content,{...content,arrangement:'blocks',rowOrder:['tr','he','en']});
 assert.deepEqual(set.after.rowOrder,['tr','he','en']);assert.equal(set.before.rowOrder,undefined);
 const kept=planDraftStyle({...draft,content:set.patch.content!},{rowOrder:['tr','he','en']},[]);
 assert.equal(kept.patch.content,undefined,'an unchanged order is no patch');
 const cleared=planDraftStyle({...draft,content:set.patch.content!},{rowOrder:['he','tr','en']},[]);
 assert.deepEqual(cleared.patch.content,{...content,arrangement:'blocks'},'the default order is removed, not stored');
 assert.equal('rowOrder' in cleared.after,false);
});
