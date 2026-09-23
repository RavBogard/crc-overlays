import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoringError,baselineCues,buildCue,editableFromBaseline,parseContent,parseEditable,sourcePack,sourcePinFor,type Draft,type EditableDraft} from '../lib/authoring-model.ts';

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

test('a supported non-liturgical baseline imports exact custom English without source provenance',()=>{
 const id='09f50803-3288-4b78-bcc7-560025668e1a';const baseline=baselineCues.find(cue=>cue.id===id)!;
 const editable=editableFromBaseline(id);const now=Date.now();
 assert.deepEqual(editable.content,{mode:'custom',text:baseline.texts.textMain});
 assert.equal(editable.title,baseline.texts.textTitle);assert.equal(editable.layout,baseline.layout);assert.equal(editable.templateCueId,id);
 const cue=buildCue({...editable,id,version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'});
 assert.equal(cue.texts.textMain,baseline.texts.textMain);assert.equal(cue.texts.textTitle,baseline.texts.textTitle);
 assert.deepEqual(cue.authoring.sourceIds,[]);assert.equal(cue.authoring.feedSha256,'local');
 const originalTexts=baseline.texts;try{baseline.texts={...originalTexts,textMainEng:'unsupported'};assert.throws(()=>editableFromBaseline(id),(error:unknown)=>(error as AuthoringError).code==='unmanaged_content')}finally{baseline.texts=originalTexts}
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
 assert.equal(cue.contentRows?.length,4);
 assert.ok(cue.contentRows?.every(row=>row.he&&row.tr&&row.en));
 const english=sourcePack.sources.flatMap(s=>s.blocks).find(b=>b.kind==='translation-en')!;
 const prior=english.sourceBlockSha256;
 try{english.sourceBlockSha256='changed';assert.throws(()=>buildCue(draft),/source rebase/)}finally{english.sourceBlockSha256=prior}
});

test('source English renders exact neutral text without claiming it is original',()=>{
 const selected=sourcePack.sources.flatMap(source=>source.blocks.map(block=>({source,block}))).find(item=>item.block.kind==='source-en'&&item.block.englishRole==='unclassified')!;
 const content=parseContent({mode:'source-en',englishGroups:[{sourceId:selected.source.id,blockIds:[selected.block.id]}]});const now=Date.now();
 const editable=parseEditable({name:'Source English',title:selected.source.name,layout:'bottom',templateCueId:BARECHU,content,presentation:{}}) as EditableDraft;
 const draft:Draft={...editable,id:'source-en-test',version:1,sourcePin:sourcePinFor(content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);assert.equal(cue.texts.textMain,selected.block.en);assert.equal(cue.authoring.origin,'canonical');assert.equal(cue.authoring.copySpec?.content.mode,'source-en');
 assert.throws(()=>parseContent({mode:'original-en',englishGroups:[{sourceId:selected.source.id,blockIds:[selected.block.id]}]}),/not original-en/);
});

test('custom announcements are local, strictly validated, and render without source claims',()=>{
 const content=parseContent({mode:'custom',text:'  Welcome to tonight’s gathering.  '});
 assert.deepEqual(content,{mode:'custom',text:'Welcome to tonight’s gathering.'});
 assert.deepEqual(sourcePinFor(content),{feedSha256:'local',unitSha256:{},blockSha256:{}});
 assert.throws(()=>parseContent({mode:'custom',text:'Hello',sourceId:'not-allowed'}),/unsupported fields/);
 assert.throws(()=>parseContent({mode:'custom',text:'   '}),/1-4000 characters/);
 assert.throws(()=>parseContent({mode:'custom',text:'x'.repeat(4001)}),/1-4000 characters/);
 const editable=parseEditable({name:'Welcome',title:'Central Reform Congregation',layout:'right',templateCueId:'09f50803-3288-4b78-bcc7-560025668e1a',content,presentation:{}}) as EditableDraft;
 const now=Date.now();const draft:Draft={...editable,id:'local-test',version:1,sourcePin:sourcePinFor(content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);
 assert.equal(cue.texts.textMain,'Welcome to tonight’s gathering.');
 assert.deepEqual(cue.authoring.sourceIds,[]);
 assert.equal(cue.authoring.origin,'local');
 assert.equal(cue.authoring.feedSha256,'local');
 const split=baselineCues.find(item=>item.animations.some(track=>track.element==='textMainEng')&&!item.animations.some(track=>track.element==='textMain'))!;
 const splitEditable=parseEditable({name:'Welcome',title:'CRC',layout:split.layout,templateCueId:split.id,content,presentation:{}}) as EditableDraft;
 const splitCue=buildCue({...draft,...splitEditable});assert.ok(splitCue.animations.some(track=>track.element==='textMain'),'custom text receives a usable body animation from split-language templates');
});

test('bilingual left draft without a draft set still emits one content row per block',()=>{
 const LEFT='bbd7c98b-f1de-41ee-9719-2bb27a30d0db';
 const source=sourcePack.sources.find(item=>item.blocks.filter(block=>block.kind==='bilingual').length>=2)!;
 const blocks=source.blocks.filter(block=>block.kind==='bilingual');
 const groups=[{sourceId:source.id,blockIds:[blocks[0].id]}];
 const content=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups});
 const editable=parseEditable({name:'Left single',title:'Left single',layout:'left',templateCueId:LEFT,content,presentation:{}}) as EditableDraft;
 const now=Date.now();
 const draft:Draft={...editable,id:'left-single-test',version:1,sourcePin:sourcePinFor(content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 assert.equal(draft.draftSetId,undefined,'no draft set is attached to this draft');
 const cue=buildCue(draft);
 assert.equal(cue.contentRows?.length,1);
 assert.equal(cue.contentRows?.[0].he,blocks[0].he);
 assert.equal(cue.contentRows?.[0].tr,blocks[0].tr);
 assert.equal(cue.contentRows?.[0].en,'');
});

test('bilingual left draft with multiple blocks emits one content row per block in order',()=>{
 const LEFT='bbd7c98b-f1de-41ee-9719-2bb27a30d0db';
 const source=sourcePack.sources.find(item=>item.blocks.filter(block=>block.kind==='bilingual').length>=2)!;
 const blocks=source.blocks.filter(block=>block.kind==='bilingual').slice(0,2);
 const groups=[{sourceId:source.id,blockIds:[blocks[0].id]},{sourceId:source.id,blockIds:[blocks[1].id]}];
 const content=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups});
 const editable=parseEditable({name:'Left multi',title:'Left multi',layout:'left',templateCueId:LEFT,content,presentation:{}}) as EditableDraft;
 const now=Date.now();
 const draft:Draft={...editable,id:'left-multi-test',version:1,sourcePin:sourcePinFor(content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);
 assert.equal(cue.contentRows?.length,2);
 assert.deepEqual(cue.contentRows?.map(row=>row.he),[blocks[0].he,blocks[1].he]);
 assert.deepEqual(cue.contentRows?.map(row=>row.tr),[blocks[0].tr,blocks[1].tr]);
 assert.ok(cue.contentRows?.every(row=>row.en===''));
});

test('bilingual bottom draft never emits content rows',()=>{
 const source=sourcePack.sources.find(item=>item.blocks.some(block=>block.kind==='bilingual'))!;
 const block=source.blocks.find(block=>block.kind==='bilingual')!;
 const groups=[{sourceId:source.id,blockIds:[block.id]}];
 const content=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups});
 const editable=parseEditable({name:'Bottom',title:'Bottom',layout:'bottom',templateCueId:BARECHU,content,presentation:{}}) as EditableDraft;
 const now=Date.now();
 const draft:Draft={...editable,id:'bottom-test',version:1,sourcePin:sourcePinFor(content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);
 assert.equal(cue.contentRows,undefined);
});

test('expanded siddur selections retain their own feed and unit authority pins',()=>{
 const selected=sourcePack.sources.find(source=>source.id.startsWith('library:')&&source.blocks.some(block=>block.kind==='bilingual'))!;
 const block=selected.blocks.find(item=>item.kind==='bilingual')!;const groups=[{sourceId:selected.id,blockIds:[block.id]}];
 const content=parseContent({mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups});const pin=sourcePinFor(content);
 assert.equal(pin.feedSha256,sourcePack.authority.feedSha256,'legacy top-level pin remains backward compatible');
 assert.deepEqual(pin.sourceAuthority?.[selected.id],{id:selected.authority!.id,feedSha256:selected.authority!.feedSha256,unitSha256:selected.authority!.unitSha256,sourceSha256:selected.sourceSha256});
 const base=editableFromBaseline(BARECHU);const now=Date.now();const draft:Draft={...base,content,id:'expanded-test',version:1,sourcePin:pin,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:'test',updatedBy:'test'};
 const cue=buildCue(draft);assert.deepEqual(cue.authoring.sourceAuthority,pin.sourceAuthority);assert.ok(cue.texts.textMainheb);assert.ok(cue.texts.textMainEng);
});


test('presentation stores only the explicit Latin line-break policy',()=>{
 const base={name:'Latin display',title:'Latin display',layout:'bottom',templateCueId:BARECHU,content:{mode:'custom',text:'A\nB'}};
 const legacy=parseEditable({...base,presentation:{}}) as EditableDraft;
 const paragraphs=parseEditable({...base,presentation:{latinLineBreaks:'paragraphs'}}) as EditableDraft;
 assert.equal(legacy.presentation.latinLineBreaks,undefined);
 assert.equal(paragraphs.presentation.latinLineBreaks,'paragraphs');
 assert.throws(()=>parseEditable({...base,presentation:{latinLineBreaks:'collapse'}}),/latinLineBreaks must be preserve or paragraphs/);
});
