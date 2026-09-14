import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCue,editableFromBaseline,parseContent,sourcePack,sourcePinFor,textArrangement,textLayers,type BilingualContent,type Draft,type EditableDraft} from '../lib/authoring-model.ts';
import {panelRowChannels} from '../lib/player.ts';

/* C6 (handoff #2): which text layers a graphic shows, and how they sit on the slide. */

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const TRANSLATED='0135de3c-9a47-4fdc-91b9-99bacdf64970';

function draftOf(editable:EditableDraft,id:string):Draft{
 const now=Date.now();
 return {...editable,id,version:1,sourcePin:sourcePinFor(editable.content,editable.content.mode==='custom'?[]:undefined),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
}
function bilingual(editable:EditableDraft){return editable.content as BilingualContent}

test('a graphic authored before C6 reads back as Hebrew and transliteration, together',()=>{
 const editable=editableFromBaseline(BARECHU);
 const content=bilingual(editable);
 assert.deepEqual(textLayers(content),['he','tr']);
 assert.equal(textArrangement(content),'together');
 assert.equal(content.layers,undefined,'and gains no stored field, so its pin and hash are unchanged');
 assert.equal(content.arrangement,undefined);
 const translated=bilingual(editableFromBaseline(TRANSLATED));
 assert.deepEqual(textLayers(translated),['he','tr','en'],'one that carried English keeps all three');
});

test('layers are stored only when they differ from what the graphic already said',()=>{
 const editable=editableFromBaseline(BARECHU);
 const groups=bilingual(editable).hebrewGroups;
 const pair=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,layers:['tr','he']}) as BilingualContent;
 assert.equal(pair.layers,undefined,'the default pair stays implicit, whatever order it arrives in');
 const hebrewOnly=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,layers:['he']}) as BilingualContent;
 assert.deepEqual(hebrewOnly.layers,['he']);
 assert.equal(hebrewOnly.includeTranslation,undefined);
 const blocks=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,arrangement:'blocks'}) as BilingualContent;
 assert.equal(blocks.arrangement,'blocks');
 assert.equal(blocks.layers,undefined);
});

test('a graphic shows at least one layer, and only the three that exist',()=>{
 const editable=editableFromBaseline(BARECHU);
 const groups=bilingual(editable).hebrewGroups;
 assert.throws(()=>parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,layers:[]}),/at least one text layer/);
 assert.throws(()=>parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,layers:['he','xx']}),/he, tr or en/);
 assert.throws(()=>parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,arrangement:'stacked'}),/together or blocks/);
});

test('one lit layer renders that layer alone, and is no longer a fit error',()=>{
 const editable=editableFromBaseline(BARECHU);
 const content=bilingual(editable);
 const draft=draftOf({...editable,layout:'left',templateCueId:editable.templateCueId,content:{...content,layers:['he']}},BARECHU);
 draft.templateCueId=editable.templateCueId;
 const cue=buildCue({...draft,layout:editable.layout});
 assert.ok(cue.texts.textMainheb,'Hebrew is on screen');
 assert.equal(cue.texts.textMainEng,undefined,'transliteration is not');
});

test('Together gives each passage a row; In blocks gives each slide one row per layer',()=>{
 const editable=editableFromBaseline(TRANSLATED);
 const content=bilingual(editable);
 assert.ok(editable.layout==='left'||editable.layout==='right','the translated baseline is a panel');
 const together=buildCue(draftOf(editable,TRANSLATED));
 assert.ok(together.contentRows!.length>1);
 assert.ok(together.contentRows!.every(row=>row.he&&row.tr&&row.en),'every row carries every lit layer');

 const blocks=buildCue(draftOf({...editable,content:{...content,arrangement:'blocks'}},TRANSLATED));
 const slides=content.hebrewGroups.length;
 assert.equal(blocks.contentRows!.length,slides*3,'three blocks per slide, and a block never spans slides');
 assert.deepEqual(blocks.contentRows!.slice(0,3).map(row=>row.he?'he':row.tr?'tr':'en'),['he','tr','en'],'in fixed order');
 assert.ok(blocks.contentRows!.every(row=>[row.he,row.tr,row.en].filter(Boolean).length===1),'each block is one layer');
});

test('a block holds the whole slide, so nothing is lost between the arrangements',()=>{
 const editable=editableFromBaseline(TRANSLATED);
 const content=bilingual(editable);
 const together=buildCue(draftOf(editable,TRANSLATED));
 const blocks=buildCue(draftOf({...editable,content:{...content,arrangement:'blocks'}},TRANSLATED));
 const words=(text:string)=>text.split(/\s+/).filter(Boolean).length;
 const count=(rows:typeof together.contentRows,channel:'he'|'tr')=>rows!.reduce((sum,row)=>sum+words(row[channel]),0);
 assert.equal(count(blocks.contentRows,'he'),count(together.contentRows,'he'));
 assert.equal(count(blocks.contentRows,'tr'),count(together.contentRows,'tr'));
});

test('a layer the author did not light leaves no empty box in the row',()=>{
 assert.deepEqual(panelRowChannels({he:'a',tr:'b',en:'c'}).map(item=>item.classes),['row-hebrew','row-transliteration','row-translation']);
 assert.deepEqual(panelRowChannels({he:'a',tr:'',en:''}).map(item=>item.classes),['row-hebrew']);
 assert.deepEqual(panelRowChannels({he:'',tr:'',en:''}),[]);
});

test('translation still needs the room of a panel',()=>{
 const editable=editableFromBaseline(TRANSLATED);
 const bottom=sourcePack.sources.length>0;
 assert.ok(bottom);
 assert.throws(()=>buildCue(draftOf({...editable,layout:'bottom'},TRANSLATED)),/left or right panel|layout/);
});
