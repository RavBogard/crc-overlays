import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateFor,editableOnly,summarizeT1,t1SummaryLine,verdict,type T1CandidateCue,type T1Row} from '../app/author/fit-check/t1-report.ts';
import type {Draft} from '../app/author/types.ts';

const panel=(value:Partial<T1CandidateCue>={}):T1CandidateCue=>({
 id:'cue_1',
 layout:'left',
 texts:{textTitle:'Barchu',textMainheb:'ברכו',textMainEng:'Barchu et'},
 ...value,
} as T1CandidateCue);

test('verdict maps the fit matrix to the three reported outcomes',()=>{
 assert.equal(verdict(true,true),'unchanged');
 assert.equal(verdict(true,false),'needs re-pagination');
 assert.equal(verdict(false,false),'needs re-pagination');
 assert.equal(verdict(false,true),'unchanged');
 assert.equal(verdict(true,{error:'unmanaged_content'}),'cannot rebuild automatically');
 assert.equal(verdict(false,{error:'unknown_cue'}),'cannot rebuild automatically');
});

test('candidateFor picks the baseline path for a cue with no draft',()=>{
 assert.deepEqual(candidateFor(panel()),{kind:'baseline',cueId:'cue_1'});
 assert.deepEqual(candidateFor(panel({layout:'right'})),{kind:'baseline',cueId:'cue_1'});
});

test('candidateFor picks the draft path when the cue came from a draft',()=>{
 assert.deepEqual(candidateFor(panel({authoring:{draftId:'draft_9'}})),{kind:'draft',draftId:'draft_9'});
 assert.deepEqual(candidateFor(panel({authoring:{draftId:null}})),{kind:'baseline',cueId:'cue_1'});
});

test('candidateFor skips lower thirds, paired panels and non-bilingual panels',()=>{
 assert.equal(candidateFor(panel({layout:'bottom'})),null);
 assert.equal(candidateFor(panel({contentRows:[{he:'ברכו',tr:'Barchu',en:''}]})),null);
 assert.equal(candidateFor(panel({texts:{textMainEng:'Barchu et'}})),null);
 assert.equal(candidateFor(panel({texts:{textMainheb:'ברכו'}})),null);
 assert.equal(candidateFor(panel({texts:{textMainheb:'ברכו',textMainEng:'   '}})),null);
 assert.equal(candidateFor(panel({texts:{}})),null);
});

const draft=():Draft=>({
 id:'draft_9',
 name:'Barchu',
 title:'Barchu',
 accentTitle:'Call to prayer',
 layout:'left',
 templateCueId:'panel-left',
 content:{mode:'custom',text:'Barchu et'},
 presentation:{hebrewFontSize:38},
 version:4,
 activeRevision:2,
 activeDraftVersion:3,
 sourceSnapshots:[],
 updatedAt:1700000000000,
} as unknown as Draft);

test('editableOnly keeps only the fields preview_content accepts',()=>{
 const stored={...draft(),sourcePin:{feedSha256:'abc'},createdAt:1,createdBy:'a',updatedBy:'b',draftSetId:'set_1',setIndex:1,setCount:2,draftSetManifest:{version:1,selections:[]},sharedFrom:{workspaceId:'w',cueId:'c',cueHash:'h'},archivedAt:9,archivedBy:'z'} as unknown as Draft;
 const editable=editableOnly(stored);
 assert.deepEqual(Object.keys(editable).sort(),['accentTitle','content','layout','name','presentation','templateCueId','title']);
 assert.deepEqual(editable,{name:'Barchu',title:'Barchu',layout:'left',templateCueId:'panel-left',content:{mode:'custom',text:'Barchu et'},presentation:{hebrewFontSize:38},accentTitle:'Call to prayer'});
 for(const stripped of ['id','version','sourcePin','sourceSnapshots','activeRevision','activeDraftVersion','createdAt','updatedAt','createdBy','updatedBy','draftSetId','setIndex','setCount','draftSetManifest','sharedFrom','archivedAt','archivedBy'])
  assert.equal(stripped in editable,false,`${stripped} must not be sent`);
});

test('editableOnly omits an absent accent title and clones nested values',()=>{
 const stored={...draft(),accentTitle:undefined} as Draft;
 const editable=editableOnly(stored);
 assert.equal('accentTitle' in editable,false);
 assert.notEqual(editable.content,stored.content);
 assert.notEqual(editable.presentation,stored.presentation);
});

test('summarizeT1 counts only the panels the candidate pass considered',()=>{
 const rows:T1Row[]=[
  {id:'a',name:'Barchu',verdict:'unchanged'},
  {id:'b',name:'Mi Chamocha',verdict:'needs re-pagination'},
  {id:'c',name:'Shalom Rav',verdict:'needs re-pagination'},
  {id:'d',name:'Archive copy',verdict:'cannot rebuild automatically',code:'unmanaged_content'},
  {id:'e',name:'Welcome',verdict:'not applicable'},
 ];
 const summary=summarizeT1(rows);
 assert.equal(summary.checked,4);
 assert.deepEqual(summary.needsRepagination,[{id:'b',name:'Mi Chamocha'},{id:'c',name:'Shalom Rav'}]);
 assert.deepEqual(summary.cannotRebuild,[{id:'d',name:'Archive copy',code:'unmanaged_content'}]);
 assert.equal(t1SummaryLine(summary),'T1: 2 of 4 bilingual panels would need re-pagination');
});

test('summarizeT1 reports nothing when no panel was in scope',()=>{
 const summary=summarizeT1([{id:'e',name:'Welcome',verdict:'not applicable'}]);
 assert.deepEqual(summary,{checked:0,needsRepagination:[],cannotRebuild:[]});
 assert.equal(t1SummaryLine(summary),'T1: 0 of 0 bilingual panels would need re-pagination');
});
