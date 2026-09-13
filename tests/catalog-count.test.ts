import assert from 'node:assert/strict';
import test from 'node:test';
import {publishedVisibleCount} from '../lib/catalog-count.ts';
import {mergePublishedCatalog,type AliasCatalogCue} from '../lib/server.ts';
import {baselineCatalogForWorkspace} from '../lib/workspace-catalog.ts';
import type {Cue} from '../lib/player.ts';

const cue=(value:Record<string,unknown>)=>value as unknown as AliasCatalogCue;

test('the one count includes published visible graphics and excludes hidden entries and aliases',()=>{
 assert.equal(publishedVisibleCount([{},{},{}]),3);
 assert.equal(publishedVisibleCount([{hidden:true},{}]),1);
 assert.equal(publishedVisibleCount([{aliasOf:'target'},{}]),1);
 assert.equal(publishedVisibleCount([{hidden:true,aliasOf:'target'},{}]),1);
 assert.equal(publishedVisibleCount([{alias:'target'},{}]),1);
 assert.equal(publishedVisibleCount([]),0);
 assert.equal(publishedVisibleCount(undefined),0);
 assert.equal(publishedVisibleCount(null),0);
});

test('an alias resolved by the live catalog merge is still never counted as its own graphic',()=>{
 const baseline=[
  cue({id:'target',name:'Target',layout:'left',texts:{he:'current'}}),
  cue({id:'retired',name:'Retired name',layout:'right',texts:{he:'old'},hidden:true,aliasOf:'target'}),
 ];
 const merged=mergePublishedCatalog(baseline,[cue({id:'target',name:'Target',layout:'left',texts:{he:'new'}}) as Cue]);
 assert.equal(merged.length,2,'the alias remains addressable for existing Companion buttons');
 assert.equal(publishedVisibleCount(merged),1);
});

test('the helper reads the real catalog shape returned by /api/catalog',()=>{
 const catalog=baselineCatalogForWorkspace('crc');
 const visible=catalog.filter(item=>!item.hidden&&!item.aliasOf);
 assert.ok(visible.length>0);
 assert.equal(publishedVisibleCount(catalog),visible.length);
 assert.ok(publishedVisibleCount(catalog)<catalog.length,'the CRC baseline carries at least one hidden or alias entry');
});
