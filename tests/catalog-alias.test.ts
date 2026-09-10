import assert from 'node:assert/strict';
import test from 'node:test';
import {mergePublishedCatalog,type AliasCatalogCue} from '../lib/server';
import type {Cue} from '../lib/player';

const cue=(value:Record<string,unknown>)=>value as unknown as AliasCatalogCue;

test('baseline hidden aliases override stale publications after targets are published',()=>{
 const target=cue({id:'target',name:'Current target',layout:'left',texts:{he:'new Hebrew',en:'new English'}});
 const baseline=[
  cue({id:'target',name:'Target',layout:'left',texts:{he:'old target'}}),
  cue({id:'retired',name:'Retired name',layout:'right',texts:{he:'old alias'},hidden:true,aliasOf:'target'}),
 ];
 const staleAlias=cue({id:'retired',name:'Stale publication',layout:'bottom',texts:{he:'stale published alias'}});
 const result=mergePublishedCatalog(baseline,[target as Cue,staleAlias as Cue]);
 assert.deepEqual(result.find(item=>item.id==='target'),target);
 assert.deepEqual(result.find(item=>item.id==='retired'),{
  ...target,
  id:'retired',
  name:'Retired name',
  hidden:true,
  aliasOf:'target',
 });
 assert.equal(staleAlias.hidden,undefined);
});

test('alias chains resolve while unknown targets and cycles remain hidden and finite',()=>{
 const baseline=[
  cue({id:'target',name:'Target',texts:{value:'current'}}),
  cue({id:'middle',name:'Middle',texts:{value:'middle'},hidden:true,aliasOf:'target'}),
  cue({id:'chain',name:'Chain',texts:{value:'chain'},hidden:true,aliasOf:'middle'}),
  cue({id:'unknown',name:'Unknown',texts:{value:'fallback'},hidden:true,aliasOf:'missing'}),
  cue({id:'cycle-a',name:'Cycle A',texts:{value:'a'},hidden:true,aliasOf:'cycle-b'}),
  cue({id:'cycle-b',name:'Cycle B',texts:{value:'b'},hidden:true,aliasOf:'cycle-a'}),
 ];
 const result=mergePublishedCatalog(baseline,[]);
 assert.deepEqual(result.find(item=>item.id==='chain')?.texts,{value:'current'});
 assert.deepEqual(result.find(item=>item.id==='unknown')?.texts,{value:'fallback'});
 assert.equal(result.find(item=>item.id==='cycle-a')?.hidden,true);
 assert.equal(result.find(item=>item.id==='cycle-b')?.hidden,true);
});
