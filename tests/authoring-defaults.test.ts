import test from 'node:test';
import assert from 'node:assert/strict';
import {withCreateDefaultBilingualBlocks} from '../lib/authoring-defaults.ts';
import type {DraftContent} from '../lib/authoring-model.ts';

const groups=[{sourceId:'source',blockIds:['block-a','block-b']}];
const bilingual:DraftContent={mode:'bilingual',hebrewGroups:groups,transliterationGroups:structuredClone(groups)};

test('creation defaults an omitted canonical bilingual arrangement to blocks without changing selections',()=>{
 const before=structuredClone(bilingual),result=withCreateDefaultBilingualBlocks(bilingual);
 assert.notStrictEqual(result,bilingual);assert.deepEqual(bilingual,before);
 assert.equal(result.mode,'bilingual');
 if(result.mode==='bilingual'){assert.equal(result.arrangement,'blocks');assert.deepEqual(result.hebrewGroups,groups);assert.deepEqual(result.transliterationGroups,groups);}
});

test('explicit together remains explicit and is a no-op',()=>{
 const explicit:DraftContent={...bilingual,mode:'bilingual',arrangement:'together'};
 assert.strictEqual(withCreateDefaultBilingualBlocks(explicit),explicit);
 const variant:DraftContent={mode:'local-variant',label:'Local',base:explicit,overrides:[]};
 assert.strictEqual(withCreateDefaultBilingualBlocks(variant),variant);
});

test('a local variant gains blocks only in an omitted bilingual base and preserves overrides',()=>{
 const variant:DraftContent={mode:'local-variant',label:'Local wording',reason:'approved',base:bilingual,overrides:[{sourceId:'source',blockId:'block-a',channel:'tr',sourceText:'old',localText:'new'}]};
 const before=structuredClone(variant),result=withCreateDefaultBilingualBlocks(variant);
 assert.deepEqual(variant,before,'input and override text stay immutable');
 assert.equal(result.mode,'local-variant');
 if(result.mode==='local-variant'){assert.equal(result.base.mode,'bilingual');assert.equal(result.base.mode==='bilingual'&&result.base.arrangement,'blocks');assert.deepEqual(result.overrides,variant.overrides);}
});

test('English and custom creation content are unchanged',()=>{
 const english:DraftContent={mode:'source-en',englishGroups:groups};
 const custom:DraftContent={mode:'custom',text:'Welcome'};
 assert.strictEqual(withCreateDefaultBilingualBlocks(english),english);
 assert.strictEqual(withCreateDefaultBilingualBlocks(custom),custom);
});
