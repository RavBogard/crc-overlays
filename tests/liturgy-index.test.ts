import assert from 'node:assert/strict';
import test from 'node:test';
import {liturgyForCue,liturgyForSourceIds,liturgyIndex,loadMoments,NO_LITURGY,type MomentEntry} from '../lib/liturgy-index.ts';
import {namesPanelCues} from '../lib/names-list.ts';
import {siddurLibrary} from '../lib/source-library.ts';
import type {Cue} from '../lib/player.ts';

const librarySource=siddurLibrary.sources[0];
const cue=(value:Record<string,unknown>)=>value as unknown as Cue;
const authored=(id:string,sourceIds:string[])=>cue({id,name:id,layout:'left',texts:{},authoring:{draftId:'d',draftVersion:1,origin:'canonical',sourceIds,feedSha256:'f',unitSha256:{}}}) as Cue&{authoring:{sourceIds:string[]}};

test('a library-backed cue reports the unit, the feed slug and the first folio it was built from',()=>{
 const reference=liturgyForCue(authored('published',[librarySource.id]));
 assert.equal(reference.unitId,librarySource.authority.unitId);
 assert.equal(reference.book,librarySource.authority.id.split(':')[1]);
 assert.equal(reference.folio,(librarySource.metadata.folios as number[])[0]);
 assert.ok(reference.momentId===null||typeof reference.momentId==='string','a moment is named once the producer publishes its table, and null until then');
 assert.deepEqual(Object.keys(reference),['unitId','momentId','book','folio']);
});

test('baseline, custom, template and names cues resolve to all nulls',()=>{
 const names=namesPanelCues('col-1',{title:'Mi Shebeirach',perPanel:8,layout:'left',rows:[{he:'',en:'A name'}],updatedAt:1,updatedBy:'editor'});
 for(const value of [
  cue({id:'baseline',name:'Barechu',layout:'left',texts:{}}),                    // baseline catalog cue: no authoring at all
  authored('custom',[]),                                                          // a custom graphic pins no source
  authored('template',['s-legacy-unit']),                                         // a legacy/template source carries no shireishabbat unit
  names[0],
 ])assert.deepEqual(liturgyForCue(value as {authoring?:{sourceIds?:string[]}}),NO_LITURGY);
 assert.deepEqual(liturgyForCue(null),NO_LITURGY);
});

/* The Barechu case. A published revision may pin the bare unit id
   (`shma.barchu@legacy-shabbat-morning`) rather than the library key that contains it. Until
   2026-09-19 that id was filtered out in the relay, filtered again on the way out of the cue
   log, and would have failed the key lookup here even if it had survived both — so every real
   liturgical cue logged a null position for four days and it looked exactly like a cue that
   simply has no liturgy. It resolves by unit id now, and a genuine miss says so out loud. */
test('a cue that pinned a bare unit id resolves to the same position as the library key',()=>{
 const key=librarySource.id;
 const unitId=librarySource.authority.unitId;
 assert.notEqual(key,unitId,'the fixture is only meaningful if the two spellings differ');
 assert.deepEqual(liturgyForSourceIds([unitId]),liturgyForSourceIds([key]));
 assert.equal(liturgyForSourceIds([unitId]).unitId,unitId);
 // The library key still wins when both are present, and a custom source never blocks the unit.
 assert.deepEqual(liturgyForSourceIds(['custom:notes',unitId]),liturgyForSourceIds([key]));
});

test('a pinned id that names no unit we hold is reported, not silently nulled',()=>{
 const warnings:string[]=[];
 const warn=console.warn;
 console.warn=(...args:unknown[])=>{warnings.push(String(args[0]))};
 try{
  assert.deepEqual(liturgyForSourceIds(['shma.barchu@a-feed-we-do-not-have']),NO_LITURGY);
  // A custom or uploaded source names no unit, so its absence is not a miss and stays quiet.
  assert.deepEqual(liturgyForSourceIds(['custom:announcement']),NO_LITURGY);
 }finally{console.warn=warn}
 assert.equal(warnings.length,1,'the unit-shaped id is reported and the custom one is not');
 assert.match(warnings[0],/shma\.barchu@a-feed-we-do-not-have/);
});

test('a moments.json entry names the moment of the unit the cue is built from',()=>{
 const moments:MomentEntry[]=[{momentId:'welcome',unitId:librarySource.authority.unitId}];
 assert.equal(liturgyForCue(authored('published',[librarySource.id]),{moments}).momentId,'welcome');
 assert.equal(liturgyForCue(authored('published',[librarySource.id]),{moments:[{momentId:'welcome',unitId:'some.other.unit'}]}).momentId,null);
});

/* The committed table starts empty and gains rows from the producer through the Monday
   workflow, so this asserts its shape rather than its size: a data PR must never fail tests. */
test('the committed moments file is a list of {momentId,unitId} pairs',()=>{
 const moments=loadMoments();
 assert.ok(Array.isArray(moments));
 for(const entry of moments){
  assert.equal(typeof entry.momentId,'string');
  assert.equal(typeof entry.unitId,'string');
 }
});

/* The cue log keeps the source ids of the graphic that was pinned and resolves them on the way
   out, so the two entry points must agree exactly. */
test('resolving from source ids alone is the same answer as resolving from the cue',()=>{
 const cueValue=authored('published',[librarySource.id]);
 assert.deepEqual(liturgyForSourceIds(cueValue.authoring.sourceIds),liturgyForCue(cueValue));
 assert.deepEqual(liturgyForSourceIds(['library:not-in-this-library']),NO_LITURGY);
 assert.deepEqual(liturgyForSourceIds([]),NO_LITURGY);
 assert.deepEqual(liturgyForSourceIds(null),NO_LITURGY);
 const moments:MomentEntry[]=[{momentId:'welcome',unitId:librarySource.authority.unitId}];
 assert.equal(liturgyForSourceIds([librarySource.id],{moments}).momentId,'welcome','a moment table that lands later answers for history already recorded');
});

test('a moments.json that cannot be read is an empty table, not a 503',()=>{
 // Invalid JSON committed by the shireishabbat producer would otherwise throw out of the
 // require and take `/api/catalog?include=liturgy` and `/api/now` down at runtime.
 const moments=loadMoments(()=>{throw Error('Unexpected token } in JSON')});
 assert.deepEqual(moments,[]);
 const index=liturgyIndex([authored('published',[librarySource.id])],{moments});
 assert.equal(index.published.momentId,null);
 assert.equal(index.published.unitId,librarySource.authority.unitId,'the rest of the reference still resolves');
 assert.equal(liturgyForCue(authored('published',[librarySource.id]),{moments}).momentId,null);
});

test('liturgyIndex keys every cue in the catalog, referenced or not',()=>{
 const cues=[authored('published',[librarySource.id]),cue({id:'baseline',name:'Barechu',layout:'left',texts:{}})];
 const index=liturgyIndex(cues,{moments:[{momentId:'welcome',unitId:librarySource.authority.unitId}]});
 assert.deepEqual(Object.keys(index),['published','baseline']);
 assert.equal(index.published.momentId,'welcome');
 assert.deepEqual(index.baseline,NO_LITURGY);
});
