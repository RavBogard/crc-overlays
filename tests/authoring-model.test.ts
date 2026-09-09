import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,buildCue,editableFromBaseline,parseContent,sourcePack,sourcePinFor,type Draft} from '../lib/authoring-model.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';

test('source selections reject unknown fields, IDs, repeats, and reordered bilingual coverage',()=>{
 const source=sourcePack.sources.find(item=>item.blocks.filter(block=>block.kind==='bilingual').length>=2)!;
 const ids=source.blocks.filter(block=>block.kind==='bilingual').slice(0,2).map(block=>block.id);
 assert.throws(()=>parseContent({mode:'bilingual',hebrewGroups:[{sourceId:'missing',blockIds:ids}],transliterationGroups:[],text:'free'}),AuthoringError);
 assert.throws(()=>parseContent({mode:'bilingual',hebrewGroups:[{sourceId:source.id,blockIds:ids}],transliterationGroups:[{sourceId:source.id,blockIds:[...ids].reverse()}]}),/same ordered source blocks/);
 assert.throws(()=>parseContent({mode:'bilingual',hebrewGroups:[{sourceId:source.id,blockIds:[ids[0],ids[0]]}],transliterationGroups:[{sourceId:source.id,blockIds:[ids[0],ids[0]]}]}),/only once/);
});

test('original English accepts only explicitly original source blocks',()=>{
 const original=sourcePack.sources.flatMap(source=>source.blocks.map(block=>({source,block}))).find(item=>item.block.kind==='original-en')!;
 assert.equal(parseContent({mode:'original-en',englishGroups:[{sourceId:original.source.id,blockIds:[original.block.id]}]}).mode,'original-en');
 const bilingual=sourcePack.sources.flatMap(source=>source.blocks.map(block=>({source,block}))).find(item=>item.block.kind==='bilingual')!;
 assert.throws(()=>parseContent({mode:'original-en',englishGroups:[{sourceId:bilingual.source.id,blockIds:[bilingual.block.id]}]}),/not original-en/);
});

test('imported source draft renders from an exact authority pin',()=>{
 const editable=editableFromBaseline(BARECHU);const now=Date.now();const draft:Draft={...editable,id:BARECHU,version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);assert.equal(cue.id,BARECHU);assert.ok(cue.texts.textMainheb);assert.ok(cue.texts.textMainEng);
 assert.equal(JSON.stringify(draft.sourcePin).includes('\\u0000'),false,'persisted JSONB source pins contain no PostgreSQL-forbidden NUL escape');
 draft.sourcePin.feedSha256='changed';assert.throws(()=>buildCue(draft),/explicit source rebase/);
});

test('combined legacy templates animate both split source channels after editing',()=>{
 const id='e1bd7775-ddf1-468b-b3f7-ac98f11df958';const editable=editableFromBaseline(id);const now=Date.now();const draft:Draft={...editable,id,version:2,sourcePin:sourcePinFor(editable.content),activeRevision:1,activeDraftVersion:1,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);assert.ok(cue.texts.textMainheb);assert.ok(cue.texts.textMainEng);assert.ok(cue.animations.some(track=>track.element==='textMainheb'));assert.ok(cue.animations.some(track=>track.element==='textMainEng'));
});


test('translated blessings require complete canonical pairs and pin English too',()=>{
 const source=sourcePack.sources.find(s=>s.blocks.some(b=>b.kind==='translation-en'))!;
 assert.ok(source,'authorized blessing translations available');
 const translation=source.blocks.find(b=>b.kind==='translation-en')!;
 const ids=translation.pairedBlockIds!;
 const groups=[{sourceId:source.id,blockIds:ids}];
 const content=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true});
 const pin=sourcePinFor(content);
 assert.equal(pin.blockSha256[JSON.stringify([source.id,translation.id])],translation.sourceBlockSha256);
 const partial=[{sourceId:source.id,blockIds:ids.slice(0,1)}];
 assert.throws(()=>parseContent({mode:'bilingual',hebrewGroups:partial,transliterationGroups:partial,includeTranslation:true}),/complete|ordered/);
 assert.throws(()=>parseContent({mode:'original-en',englishGroups:[{sourceId:source.id,blockIds:[translation.id]}]}),/not original-en/);
 const existing=editableFromBaseline(BARECHU);
 assert.throws(()=>parseContent({...existing.content,includeTranslation:true}),/complete|authorized/);
});


test('translated baseline import retains all three source channels',()=>{
 const id='0135de3c-9a47-4fdc-91b9-99bacdf64970';
 const editable=editableFromBaseline(id),now=Date.now();
 const draft:Draft={...editable,id,version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);
 assert.equal(cue.contentRows?.length,3);
 assert.ok(cue.contentRows?.every(row=>row.he&&row.tr&&row.en));
 const english=sourcePack.sources.flatMap(s=>s.blocks).find(b=>b.kind==='translation-en')!;
 const prior=english.sourceBlockSha256;
 try{english.sourceBlockSha256='changed';assert.throws(()=>buildCue(draft),/source rebase/)}finally{english.sourceBlockSha256=prior}
});
