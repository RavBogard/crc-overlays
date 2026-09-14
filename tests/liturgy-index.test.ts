import assert from 'node:assert/strict';
import test from 'node:test';
import {liturgyForCue,liturgyIndex,loadMoments,NO_LITURGY,type MomentEntry} from '../lib/liturgy-index.ts';
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
 assert.equal(reference.momentId,null,'content/moments.json ships empty, so no moment is named yet');
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

test('a moments.json entry names the moment of the unit the cue is built from',()=>{
 const moments:MomentEntry[]=[{momentId:'welcome',unitId:librarySource.authority.unitId}];
 assert.equal(liturgyForCue(authored('published',[librarySource.id]),{moments}).momentId,'welcome');
 assert.equal(liturgyForCue(authored('published',[librarySource.id]),{moments:[{momentId:'welcome',unitId:'some.other.unit'}]}).momentId,null);
});

test('the committed moments file is an empty list and the loader tolerates it',()=>{
 assert.deepEqual(loadMoments(),[]);
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
