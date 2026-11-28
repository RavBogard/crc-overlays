import test from 'node:test';
import assert from 'node:assert/strict';
import type {Draft} from '../lib/authoring-model.ts';
import type {Cue} from '../lib/player.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import {hideArchived} from '../lib/server.ts';

// Nov 27: archived graphics clutter the Live tab. They stay published (a deck key may fire them)
// but the live catalog marks them hidden, which the Live tab and Companion's pick-lists skip.
const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';

test('an archived published graphic is hidden in the live catalog, and comes back when restored',async()=>{
 const repo=new MemoryAuthoringRepository();
 const api=createAuthoringService(repo);
 const {draft}=await api.operation('create_draft',{name:'Old card',title:'Old',layout:'corner',templateCueId:BARECHU,content:{mode:'custom',text:'Old words'},presentation:{}},'tester') as {draft:Draft};
 const preview=await api.operation('preview_draft',{draftId:draft.id,expectedVersion:draft.version},'tester') as {previewId:string};
 await api.operation('review_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId,browserMeasurement:{viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'test',measuredAt:Date.now()},humanApproved:true},'tester');
 await api.operation('publish_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId},'tester');
 assert.deepEqual(await api.archivedCueIds(),[]);
 const {draft:archived}=await api.operation('archive_draft',{draftId:draft.id,expectedVersion:draft.version},'tester') as {draft:Draft};
 assert.deepEqual(await api.archivedCueIds(),[draft.id]);
 const live=hideArchived(await api.publishedCues() as Cue[],new Set(await api.archivedCueIds()));
 assert.equal(live.find(cue=>cue.id===draft.id)?.hidden,true,'still in the catalog, so a deck key still fires it, but hidden from the lists');
 await api.operation('restore_draft',{draftId:draft.id,expectedVersion:archived.version},'tester');
 assert.deepEqual(await api.archivedCueIds(),[]);
});

test('hiding leaves every other graphic exactly as it was',()=>{
 const cues=[{id:'a',name:'A',layout:'left',texts:{},animations:[],duration:{}},{id:'b',name:'B',layout:'left',texts:{},animations:[],duration:{}}] as Cue[];
 const result=hideArchived(cues,new Set(['b']));
 assert.equal(result[0],cues[0]);
 assert.deepEqual(result[1],{...cues[1],hidden:true});
 assert.equal(cues[1].hidden,undefined,'the published cue itself is not changed');
});
