import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from '../lib/cues.json';
import {AuthoringError,buildCue,cueHash,parseEditable,sourcePinFor,type Draft,type EditableDraft} from '../lib/authoring-model.ts';
import type {Cue} from '../lib/player.ts';
import {editableFromForm,formFromDraft} from '../app/author/editor-state.ts';

// Custom lines: the congregation's own Hebrew with its transliteration, for words no siddur holds.
const cues=baseline as unknown as Cue[];
const template=(layout:string)=>cues.find(cue=>cue.layout===layout&&!cue.hidden)!;
const lines=[
 {he:'בָּרוּךְ אַתָּה',tr:'Baruch atah',en:'Blessed are you'},
 {he:'שָׁלוֹם',tr:'Shalom',en:''},
];
const editable=(layout:string,content:unknown):EditableDraft=>parseEditable({name:'Our words',title:'Our words',layout,templateCueId:template(layout==='corner'||layout==='nameplate'?'bottom':layout).id,content,presentation:{}}) as EditableDraft;
const draftOf=(value:EditableDraft):Draft=>({...value,id:'draft-lines',version:1,sourcePin:sourcePinFor(value.content),activeRevision:null,activeDraftVersion:null,createdAt:0,updatedAt:0,createdBy:'test',updatedBy:'test'});
const build=(layout:string,content:unknown)=>buildCue(draftOf(editable(layout,content)));

test('a side panel shows one row per typed line, Hebrew in the Hebrew channel',()=>{
 const cue=build('left',{mode:'custom',rows:lines});
 assert.deepEqual(cue.contentRows,lines);
 assert.equal(cue.texts.textMainheb,'בָּרוּךְ אַתָּה\nשָׁלוֹם');
 assert.equal(cue.texts.textMainEng,'Baruch atah\nShalom');
 assert.equal(cue.texts.textMain,undefined,'never one plain block');
 assert.ok(cue.animations.some(track=>track.element==='textMainheb')&&cue.animations.some(track=>track.element==='textMainEng'),'the Hebrew and transliteration animate as a passage does');
});

test('a lower third shows the two columns and the translation line',()=>{
 const cue=build('bottom',{mode:'custom',rows:lines});
 assert.equal(cue.texts.textMainheb,'בָּרוּךְ אַתָּה\nשָׁלוֹם');
 assert.equal(cue.texts.textMainEng,'Baruch atah\nShalom');
 assert.equal(cue.texts.textTranslation,'Blessed are you');
});

test('a card shows Hebrew over transliteration and refuses a translation it has no room for',()=>{
 const cue=build('corner',{mode:'custom',rows:[{he:'שָׁלוֹם',tr:'Shalom'}]});
 assert.equal(cue.texts.textMainheb,'שָׁלוֹם');assert.equal(cue.texts.textMainEng,'Shalom');
 assert.throws(()=>build('corner',{mode:'custom',rows:lines}),(error:unknown)=>error instanceof AuthoringError&&error.code==='corner_translation_unsupported');
});

test('lines are trimmed, empty lines dropped, and the shape is checked in sentences',()=>{
 const parsed=editable('left',{mode:'custom',rows:[{he:'  שָׁלוֹם ',tr:' Shalom'},{he:'',tr:'',en:''}]});
 assert.deepEqual(parsed.content,{mode:'custom',text:'',rows:[{he:'שָׁלוֹם',tr:'Shalom',en:''}]});
 assert.throws(()=>editable('left',{mode:'custom',text:'Also this',rows:lines}),/either one block .* or lines/);
 assert.throws(()=>editable('left',{mode:'custom',rows:[{he:'x',fr:'y'}]}),AuthoringError);
 assert.throws(()=>editable('left',{mode:'custom',rows:Array.from({length:25},()=>({tr:'x'}))}),/at most 24 lines/);
 assert.throws(()=>editable('left',{mode:'custom',text:'x',rowOrder:['tr','he','en']}),/needs content.rows/);
 assert.deepEqual(build('left',{mode:'custom',rows:lines,rowOrder:['tr','he','en']}).rowOrder,['tr','he','en'],'lines take a row order like a passage');
});

test('plain custom text is unchanged: no rows key, the same cue',()=>{
 const plain=editable('left',{mode:'custom',text:'Welcome'});
 assert.deepEqual(plain.content,{mode:'custom',text:'Welcome'});
 const cue=buildCue(draftOf(plain));
 assert.equal(cue.texts.textMain,'Welcome');assert.equal(cue.contentRows,undefined);
 assert.equal(cueHash(cue),cueHash(buildCue(draftOf(editable('left',{mode:'custom',text:'Welcome'})))));
});

test('the editor form round-trips lines and keeps plain text as it was',()=>{
 const draft=draftOf(editable('left',{mode:'custom',rows:lines}));
 const form=formFromDraft(draft);
 assert.deepEqual(form.customRows,lines);
 assert.deepEqual(editableFromForm(form).content,{mode:'custom',text:'',rows:lines});
 const plain=formFromDraft(draftOf(editable('left',{mode:'custom',text:'Welcome'})));
 assert.equal(plain.customRows,null);
 assert.deepEqual(editableFromForm(plain).content,{mode:'custom',text:'Welcome'});
});
