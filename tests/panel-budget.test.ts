import test from 'node:test';
import assert from 'node:assert/strict';
import {PANEL_BLOCK_LIMIT,PANEL_CHAR_BUDGET,PANEL_ENGLISH_CHAR_BUDGET,exceedsOnePanel} from '../lib/panel-budget.ts';

const hebrew=(length:number)=>({he:'א'.repeat(length),tr:''});
const english=(length:number)=>({en:'e'.repeat(length)});

test('one panel holds at most three blocks and a bounded number of characters',()=>{
 assert.equal(PANEL_BLOCK_LIMIT,3);
 assert.equal(PANEL_CHAR_BUDGET,600);
 assert.equal(PANEL_ENGLISH_CHAR_BUDGET,400);
});

test('exceedsOnePanel follows the same rule the server splits prayers by',()=>{
 // A single canonical block is never split, however long it is.
 assert.equal(exceedsOnePanel([hebrew(40)],'bilingual','left'),false);
 assert.equal(exceedsOnePanel([hebrew(PANEL_CHAR_BUDGET+50)],'bilingual','left'),false);
 assert.equal(exceedsOnePanel([],'bilingual','left'),false);
 // Four blocks exceed the block limit whatever they contain.
 assert.equal(exceedsOnePanel([hebrew(10),hebrew(10),hebrew(10),hebrew(10)],'bilingual','right'),true);
 // Three short blocks still fit.
 assert.equal(exceedsOnePanel([hebrew(10),hebrew(10),hebrew(10)],'bilingual','left'),false);
 // The character budget bites before the block limit does.
 assert.equal(exceedsOnePanel([hebrew(400),hebrew(300)],'bilingual','left'),true);
 // Source English gets the smaller conservative budget.
 assert.equal(exceedsOnePanel([english(250),english(100)],'source-en','left'),false);
 assert.equal(exceedsOnePanel([english(250),english(200)],'source-en','left'),true);
 assert.equal(exceedsOnePanel([english(250),english(200)],'original-en','left'),false);
 // A bottom row carries exactly one block.
 assert.equal(exceedsOnePanel([hebrew(10)],'bilingual','bottom'),false);
 assert.equal(exceedsOnePanel([hebrew(10),hebrew(10)],'bilingual','bottom'),true);
});
