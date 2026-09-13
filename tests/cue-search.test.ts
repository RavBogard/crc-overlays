import assert from 'node:assert/strict';import test from 'node:test';import {friendlyCueName,searchCues} from '../lib/cue-search.ts';import type {Cue} from '../lib/player.ts';
const cue=(id:string,name:string,text=''):Cue=>({id,name,layout:'bottom',texts:{textMainEng:text},animations:[],duration:{}});
const cues=[cue('1','Barchu','Bless the Eternal'),cue('2','Ahava Rabbah Ahavtanu (ncomplete)','With abundant love'),cue('3','Mi Chamocha','Who is like You')];
test('friendly labels repair broken incomplete syntax while keeping Partial explicit',()=>assert.equal(friendlyCueName(cues[1].name),'Ahava Rabbah Ahavtanu (Partial)'));
test('friendly labels strip a correctly spelled incomplete marker',()=>{assert.equal(friendlyCueName('Mi Chamocha (incomplete)'),'Mi Chamocha (Partial)');assert.equal(friendlyCueName('Mi Chamocha (Incomplete)'),'Mi Chamocha (Partial)')});
test('search accepts common aliases and mild spelling mistakes',()=>{assert.equal(searchCues(cues,'barechu')[0].id,'1');assert.equal(searchCues(cues,'chamoha')[0].id,'3')});
test('search includes cue ids and content without changing cue objects',()=>{assert.equal(searchCues(cues,'Bless Eternal')[0].id,'1');assert.equal(searchCues(cues,'2')[0],cues[1]);assert.equal(cues[1].name,'Ahava Rabbah Ahavtanu (ncomplete)')});
