import test from 'node:test';
import assert from 'node:assert/strict';
import {planDraftStyle,type DraftStyleTemplate} from '../lib/authoring-style.ts';
import type {Draft, DraftContent} from '../lib/authoring-model.ts';

const templates:DraftStyleTemplate[]=[{id:'left-z',layout:'left'},{id:'bottom-b',layout:'bottom'},{id:'bottom-a',layout:'bottom'}];
const sourcePin={feedSha256:'feed',unitSha256:{source:'unit'},blockSha256:{block:'hash'}};
const bilingual:DraftContent={mode:'bilingual',hebrewGroups:[{sourceId:'source',blockIds:['block']}],transliterationGroups:[{sourceId:'source',blockIds:['block']} ]};
function draft(content:DraftContent=bilingual):Draft{return {id:'draft',version:4,name:'Name',title:'Title',layout:'left',templateCueId:'left-z',content,presentation:{hebrewFontSize:26,transliterationFontSize:22,titleFontSize:30,lineSpacing:'compact',imageAssetId:'asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',alignment:'center'},sourcePin,sourceSnapshots:[],activeRevision:null,activeDraftVersion:null,createdAt:1,updatedAt:1,createdBy:'test',updatedBy:'test'};}

test('style plan chooses a deterministic compatible template and retains a compatible current one',()=>{
 const original=draft();
 const changed=planDraftStyle(original,{layout:'bottom',arrangement:'together',comfortableTypography:false},templates);
 assert.deepEqual(changed.patch,{layout:'bottom',templateCueId:'bottom-a'});
 assert.equal(changed.after.layout,'bottom');
 assert.equal(changed.after.templateCueId,'bottom-a');
 const alreadyBottom={...original,layout:'bottom' as const,templateCueId:'bottom-b'};
 assert.deepEqual(planDraftStyle(alreadyBottom,{layout:'bottom',arrangement:'together',comfortableTypography:false},templates).patch,{});
 const mismatchedBottom={...original,layout:'bottom' as const};
 assert.deepEqual(planDraftStyle(mismatchedBottom,{layout:'bottom',arrangement:'together',comfortableTypography:false},templates).patch,{templateCueId:'bottom-a'});
});

test('style plan refuses an ambiguous empty template fallback',()=>{
 const plan=planDraftStyle(draft(),{layout:'right',arrangement:'together',comfortableTypography:false},templates);
 assert.deepEqual(plan.patch,{});
 assert.match(plan.warnings[0],/No compatible right template/);
 assert.equal(plan.after.layout,'left');
});

test('blocks arrangement changes bilingual selection only and leaves pins and source groups untouched',()=>{
 const original=draft();
 const before=structuredClone(original);
 const plan=planDraftStyle(original,{arrangement:'blocks'},templates);
 assert.deepEqual(plan.patch.content,{...bilingual,arrangement:'blocks'});
 assert.deepEqual(original,before,'input remains immutable');
 assert.strictEqual(original.sourcePin,sourcePin);
 assert.deepEqual(plan.patch.content?.mode==='bilingual'&&plan.patch.content.hebrewGroups,bilingual.hebrewGroups);
 assert.equal(plan.after.arrangement,'blocks');
});

test('variant base receives arrangement without changing the variant label, overrides, or pin',()=>{
 const variant:DraftContent={mode:'local-variant',label:'Interpretation',reason:'approved',base:bilingual,overrides:[{sourceId:'source',blockId:'block',channel:'tr',sourceText:'old',localText:'new'}]};
 const original=draft(variant),plan=planDraftStyle(original,{arrangement:'blocks'},templates);
 assert.equal(plan.patch.content?.mode,'local-variant');
 const content=plan.patch.content as Extract<DraftContent,{mode:'local-variant'}>;
 assert.equal(content.label,'Interpretation');assert.deepEqual(content.overrides,variant.overrides);assert.equal(content.base.mode==='bilingual'&&content.base.arrangement,'blocks');
 assert.strictEqual(original.sourcePin,sourcePin);
});

test('comfortable typography removes only density fields and preserves artwork and alignment',()=>{
 const plan=planDraftStyle(draft(),{comfortableTypography:true},templates);
 assert.deepEqual(plan.patch.presentation,{imageAssetId:'asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',alignment:'center'});
 assert.deepEqual(plan.after.presentation,plan.patch.presentation);
});

test('omitted style choices plan readable defaults while explicit false and together retain them',()=>{
 const original=draft();
 const defaults=planDraftStyle(original,{},templates);
 assert.equal(defaults.after.arrangement,'blocks');assert.deepEqual(defaults.after.presentation,{imageAssetId:'asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',alignment:'center'});
 const retained=planDraftStyle(original,{arrangement:'together',comfortableTypography:false},templates);
 assert.equal(retained.after.arrangement,'together');assert.deepEqual(retained.after.presentation,original.presentation);
});

test('non-bilingual arrangement and already-comfortable requests are explicit no-ops',()=>{
 const original=draft({mode:'original-en',englishGroups:[{sourceId:'source',blockIds:['block']}]});
 original.presentation={imageAssetId:'asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
 const plan=planDraftStyle(original,{arrangement:'blocks',comfortableTypography:true},templates);
 assert.deepEqual(plan.patch,{});assert.match(plan.warnings[0],/only to bilingual/);assert.deepEqual(plan.before,plan.after);
});
