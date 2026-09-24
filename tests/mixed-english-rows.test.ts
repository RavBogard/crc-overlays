import assert from 'node:assert/strict';
import test from 'node:test';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {AuthoringError,buildCue,draftSetSelections,sourcePack,type AuthoringCue,type AuthoringSource} from '../lib/authoring-model';
import {MemoryBuildKeyRepository} from '../lib/build-keys';
import {MemoryLocalSourceRepository,localSourceUnit} from '../lib/local-sources';
import {panelRowChannels} from '../lib/player';
import {textParts} from '../lib/player-motion';
import {blockCharacters} from '../lib/panel-budget';

// Packet G9 (TBI redo): an English-only passage and a Hebrew/transliteration passage on one
// graphic, in block order. Every local text here is synthetic; none is a congregation's own.
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
const fit:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.5,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test'});

function wired(){
 const repo=new MemoryAuthoringRepository(),locals=new MemoryLocalSourceRepository(),buildKeys=new MemoryBuildKeyRepository();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,fit,locals,undefined,undefined,undefined,{buildKeys});
 const op=(operation:string,input:Record<string,unknown>)=>service.operation(operation,input,'tester') as Promise<Output>;
 return {repo,locals,buildKeys,op};
}
// An English reading, then its closing blessing with transliteration and English, then a closing English line.
const READING={name:'Synthetic Reading with Blessing',kind:'tbi text',blocks:[{en:'A synthetic reading, in English only.'},{he:'אבג דהו',tr:'Alef bet gimel',en:'The blessing, in English.'},{en:'A synthetic closing line.'}]};

async function reading(op:ReturnType<typeof wired>['op']){
 const source=(await op('add_local_source',READING)).source;
 const [english,hebrew,translation,closing]=source.blocks.map((block:Output)=>block.id);
 assert.deepEqual(source.blocks.map((block:Output)=>block.kind),['original-en','bilingual','translation-en','original-en'],'the stored kinds are what G3 made; G9 changes none');
 return {source,english,hebrew,translation,closing};
}
let made=0;
async function preview(op:ReturnType<typeof wired>['op'],layout:string,content:Record<string,unknown>){
 const created=await op('create_draft',{name:`Mixed ${++made}`,title:'Mixed',layout,applyDefaults:false,content});
 const previewed=await op('preview_draft',{draftId:created.draft.id,expectedVersion:created.draft.version});
 return {draft:created.draft,cue:previewed.cue as AuthoringCue,validation:previewed.validation};
}
const classes=(cue:AuthoringCue)=>cue.contentRows!.map(row=>panelRowChannels(row,cue.rowOrder).map(item=>item.classes));

test('an English reading and its Hebrew blessing are one panel: English rows and he/tr/en rows in block order, no empty row',async()=>{
 const {op}=wired();const {source,english,hebrew,closing}=await reading(op);
 const groups=[{sourceId:source.id,blockIds:[english,hebrew,closing]}];
 for(const layout of ['left','right']){
  const {cue,validation}=await preview(op,layout,{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true,arrangement:'together'});
  assert.equal(validation.valid,true,JSON.stringify(validation));
  assert.deepEqual(cue.contentRows,[{he:'',tr:'',en:'A synthetic reading, in English only.'},{he:'אבג דהו',tr:'Alef bet gimel',en:'The blessing, in English.'},{he:'',tr:'',en:'A synthetic closing line.'}]);
  assert.deepEqual(classes(cue),[['row-translation'],['row-hebrew','row-transliteration','row-translation'],['row-translation']]);
  assert.equal(cue.texts.textMainheb,'אבג דהו','only Hebrew reaches the Hebrew channel');assert.equal(cue.texts.textMainEng,'Alef bet gimel','only transliteration reaches that channel');
 }
 // The translation layer governs the blessing's translation only; the reading always shows.
 const plain=(await preview(op,'left',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,arrangement:'together'})).cue;
 assert.deepEqual(plain.contentRows,[{he:'',tr:'',en:'A synthetic reading, in English only.'},{he:'אבג דהו',tr:'Alef bet gimel',en:''},{he:'',tr:'',en:'A synthetic closing line.'}]);
 assert.deepEqual(classes(plain),[['row-translation'],['row-hebrew','row-transliteration'],['row-translation']]);
 // In blocks: the English passage stands where it falls; the Hebrew run is arranged in blocks.
 const blocks=(await preview(op,'right',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true,arrangement:'blocks'})).cue;
 assert.deepEqual(blocks.contentRows,[{he:'',tr:'',en:'A synthetic reading, in English only.'},{he:'אבג דהו',tr:'',en:''},{he:'',tr:'Alef bet gimel',en:''},{he:'',tr:'',en:'The blessing, in English.'},{he:'',tr:'',en:'A synthetic closing line.'}]);
 assert.ok(blocks.contentRows!.every(row=>row.he||row.tr||row.en),'no empty row');
});

test('a lower third carries the English passage on its English line, in block order; a corner card refuses it',async()=>{
 const {op}=wired();const {source,english,hebrew}=await reading(op);
 const groups=[{sourceId:source.id,blockIds:[english,hebrew]}];
 const {cue,validation}=await preview(op,'bottom',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true});
 assert.equal(validation.valid,true,JSON.stringify(validation));
 assert.equal(cue.contentRows,undefined);
 assert.deepEqual(textParts(cue.texts).map(part=>[part.element,part.text]),[['textMainEng','Alef bet gimel'],['textMainheb','אבג דהו'],['textTranslation','A synthetic reading, in English only. The blessing, in English.']]);
 const untranslated=(await preview(op,'bottom',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups})).cue;
 assert.equal(untranslated.texts.textTranslation,'A synthetic reading, in English only.','the passage shows without the translation layer');
 assert.ok(untranslated.animations.some(track=>track.element==='textTranslation'),'the English line animates in');
 await assert.rejects(preview(op,'corner',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups}),(error:unknown)=>error instanceof AuthoringError&&error.code==='english_passage_unsupported'&&/side panel or a lower third/.test(error.message));
});

test('English alone is still an English graphic, and a translation block is still never a row of its own',async()=>{
 const {op}=wired();const {source,english,translation,closing}=await reading(op);
 const only=[{sourceId:source.id,blockIds:[english,closing]}];
 await assert.rejects(op('create_draft',{name:'English only',title:'E',layout:'left',content:{mode:'bilingual',hebrewGroups:only,transliterationGroups:only}}),(error:unknown)=>error instanceof AuthoringError&&error.code==='english_only_selection'&&/original-en/.test(error.message));
 const withTranslation=[{sourceId:source.id,blockIds:[english,translation]}];
 await assert.rejects(op('create_draft',{name:'Translation block',title:'T',layout:'left',content:{mode:'bilingual',hebrewGroups:withTranslation,transliterationGroups:withTranslation}}),(error:unknown)=>error instanceof AuthoringError&&error.code==='invalid_channel');
});

test('the pin, the set manifest and the panel budget name the English passage by its English',async()=>{
 const {op}=wired();const {source,english,hebrew,translation}=await reading(op);
 const groups=[{sourceId:source.id,blockIds:[english,hebrew]}];
 const {draft}=await preview(op,'left',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true});
 assert.equal(Object.keys(draft.sourcePin.blockSha256).length,3,'the reading, the blessing and its translation are all pinned');
 assert.deepEqual(draftSetSelections(draft.content,draft.sourceSnapshots),[{sourceId:source.id,blockId:english,channels:['en']},{sourceId:source.id,blockId:hebrew,channels:['he','tr']},{sourceId:source.id,blockId:translation,channels:['en']}]);
 assert.equal(blockCharacters({en:'Twelve chars'},'bilingual'),12,'an English passage counts its English in a bilingual panel');
 assert.equal(blockCharacters({he:'אב',tr:'ab',en:'ignored'},'bilingual'),4,'a bilingual block still counts Hebrew and transliteration only');
});

test('batch_create_drafts builds a panel that mixes an English reading and its blessing as one bilingual graphic',async()=>{
 const {op,repo}=wired();const {source}=await reading(op);
 const result=await op('batch_create_drafts',{dryRun:false,items:[
  {type:'source',key:'mixed-one',sourceId:source.id,blocks:[0,1],includeTranslation:true,title:'Reading',layout:'left'},
  {type:'set',key:'mixed-set',sourceId:source.id,panels:[{blocks:[0,1]},{blocks:[2]}],title:'Reading in parts',layout:'left'},
 ]});
 assert.deepEqual(result.items.map((item:Output)=>item.status),['created','created'],JSON.stringify(result.items));
 const drafts=await repo.listDrafts(),one=drafts.find(draft=>draft.id===result.items[0].draftId)!;
 assert.equal(one.content.mode,'bilingual');
 // A new panel is arranged in blocks by default (create_draft): the reading stands first, then the blessing's rows.
 assert.deepEqual(buildCue(one).contentRows,[{he:'',tr:'',en:'A synthetic reading, in English only.'},{he:'אבג דהו',tr:'',en:''},{he:'',tr:'Alef bet gimel',en:''},{he:'',tr:'',en:'The blessing, in English.'}]);
 // The set's last panel is the closing English line alone: an English graphic, as before.
 const set=drafts.filter(draft=>draft.draftSetId===result.items[1].setId).sort((a,b)=>a.setIndex!-b.setIndex!);
 assert.deepEqual(set.map(draft=>draft.content.mode),['bilingual','original-en']);
});

test('a corpus blessing with its source English: the English stands as its own row; includeTranslation still needs an authorized translation',async()=>{
 // A library unit whose first bilingual block is followed (not necessarily at once) by source English.
 const unit=sourcePack.sources.find(source=>source.id.startsWith('library:')&&source.blocks.some(block=>block.kind==='bilingual')&&source.blocks.some(block=>block.kind==='source-en'&&block.automatic===true))! as AuthoringSource;
 const bilingual=unit.blocks.find(block=>block.kind==='bilingual')!,sourceEnglish=unit.blocks.find(block=>block.kind==='source-en'&&block.automatic===true)!;
 const {op}=wired();const groups=[{sourceId:unit.id,blockIds:[bilingual.id,sourceEnglish.id]}];
 const {cue}=await preview(op,'left',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,arrangement:'together'});
 assert.deepEqual(cue.contentRows,[{he:bilingual.he,tr:bilingual.tr,en:''},{he:'',tr:'',en:sourceEnglish.en}]);
 await assert.rejects(op('create_draft',{name:'Translated',title:'T',layout:'left',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true}}),(error:unknown)=>error instanceof AuthoringError&&error.code==='missing_translation');
});

test('G9 changes no local unit: the stored record, its unit hash and every block hash are what G3 made',async()=>{
 // lib/local-sources.ts is untouched by G9, so a mixed record still derives original-en English blocks with G3's hashes.
 const {locals,op}=wired();await reading(op);
 const [record]=await locals.list();const unit=localSourceUnit(record);
 assert.deepEqual(unit.blocks.map(block=>block.kind),['original-en','bilingual','translation-en','original-en']);
 assert.equal(unit.unitSha256,record.unitSha256);
});

test('a lower third split into a set keeps each English passage as its own English graphic',async()=>{
 const {op,repo}=wired();const {source,english,hebrew,closing}=await reading(op);
 const groups=[{sourceId:source.id,blockIds:[english,hebrew,closing]}];
 const {draft}=await preview(op,'bottom',{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups,includeTranslation:true});
 const split=await op('split_draft_into_set',{draftId:draft.id,expectedVersion:draft.version});
 const members=(await repo.listDrafts()).filter(item=>split.set.draftIds.includes(item.id)).sort((a,b)=>a.setIndex!-b.setIndex!);
 assert.deepEqual(members.map(item=>item.content.mode),['original-en','bilingual','original-en']);
 assert.deepEqual(members.map(item=>{const cue=buildCue(item);return cue.texts.textMain??cue.texts.textTranslation}),['A synthetic reading, in English only.','The blessing, in English.','A synthetic closing line.']);
});
