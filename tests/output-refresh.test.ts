import assert from 'node:assert/strict';
import test from 'node:test';
import {outputReloadUrl,shouldReloadForStaleRenderer,unrenderableCueIds} from '../lib/output-refresh.ts';

const cue=(id:string,layout:string)=>({id,layout});

test('only cues whose layout this code cannot resolve are unrenderable',()=>{
  const ids=unrenderableCueIds([cue('a','left'),cue('b','corner'),cue('c','nameplate'),cue('d','from-a-later-release')]);
  assert.deepEqual([...ids],['d']);
});

test('a page whose catalog it can draw never reloads',()=>{
  assert.equal(shouldReloadForStaleRenderer({unrenderable:new Set(),catalogVersion:'v2',desiredCue:null,occupied:false,reloadedFor:null}),false);
});

test('a stale page waits for an empty stage, unless the broken cue is the one asked for',()=>{
  const base={unrenderable:new Set(['new']),catalogVersion:'v2',reloadedFor:null};
  assert.equal(shouldReloadForStaleRenderer({...base,desiredCue:'prayer',occupied:true}),false,'never cuts a graphic on air');
  assert.equal(shouldReloadForStaleRenderer({...base,desiredCue:null,occupied:false}),true,'reloads once the stage is clear');
  assert.equal(shouldReloadForStaleRenderer({...base,desiredCue:'new',occupied:true}),true,'what it would draw is broken anyway');
});

test('it reloads at most once per catalog version, so no loop',()=>{
  const base={unrenderable:new Set(['new']),desiredCue:'new',occupied:true};
  assert.equal(shouldReloadForStaleRenderer({...base,catalogVersion:'v2',reloadedFor:'v2'}),false);
  assert.equal(shouldReloadForStaleRenderer({...base,catalogVersion:'v3',reloadedFor:'v2'}),true,'a later catalog may try again');
  assert.equal(shouldReloadForStaleRenderer({...base,catalogVersion:'',reloadedFor:null}),false,'no version, no mark: never');
});

test('the reload keeps the output credential when browser storage did not',()=>{
  const at={pathname:'/output',search:'',credential:'cd_abc',source:'fragment-device'};
  assert.equal(outputReloadUrl({...at,credentialSurvivesReload:true}),'/output');
  assert.equal(outputReloadUrl({...at,credentialSurvivesReload:false}),'/output#device=cd_abc');
  assert.equal(outputReloadUrl({...at,source:'fragment-key',credential:'k 1',credentialSurvivesReload:false}),'/output#key=k%201');
  assert.equal(outputReloadUrl({pathname:'/output',search:'?preview',credential:'session',source:'preview',credentialSurvivesReload:true}),'/output?preview');
});
