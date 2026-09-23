import test from 'node:test';
import assert from 'node:assert/strict';
import type {Draft} from '../lib/authoring-model.ts';
import {compactDraftCatalog} from '../lib/draft-catalog.ts';

const LEFT_PANEL='bbd7c98b-f1de-41ee-9719-2bb27a30d0db';
const make=(id:string,title:string,accentTitle?:string):Draft=>({id,name:id,title,...(accentTitle?{accentTitle}:{}),layout:'bottom',templateCueId:LEFT_PANEL,content:{mode:'custom',text:'Words'},presentation:{},sourcePin:{feedSha256:'local',unitSha256:{},blockSha256:{}},version:1,activeRevision:null,activeDraftVersion:null,createdAt:1,updatedAt:1,createdBy:'tester',updatedBy:'tester'});

test('compact catalog shows accent titles and flags one accent shared by differently titled graphics',()=>{
 // Gap F: Siyahamba inherited the Mi Chamocha accent from its template. The flag is a review
 // prompt across the whole catalog, not a rule about which Hebrew label is correct.
 const rows=new Map(compactDraftCatalog([make('mi-1','Mi Chamocha','מִי כָמֹכָה'),make('mi-2','Mi Chamocha','מי כמכה'),make('siyahamba','Siyahamba','מי כמכה'),make('plain','Welcome')],{}).drafts.map(row=>[row.id,row]));
 assert.equal(rows.get('mi-2')!.accentTitle,'מי כמכה');
 assert.deepEqual(rows.get('siyahamba')!.flags.accentTitleSharedWith,['Mi Chamocha'],'the same accent without niqqud counts as shared');
 assert.deepEqual(rows.get('mi-1')!.flags.accentTitleSharedWith,['Siyahamba']);
 assert.equal(rows.get('plain')!.accentTitle,null);
 assert.deepEqual(rows.get('plain')!.flags.accentTitleSharedWith,[]);
});

test('compact catalog treats curly and straight apostrophes in titles as the same title',()=>{
 const rows=new Map(compactDraftCatalog([make('a','Shiru La’Adonai','שִׁירוּ לַיהוָה'),make('b',"Shiru La'Adonai",'שירו ליהוה')],{}).drafts.map(row=>[row.id,row]));
 assert.deepEqual(rows.get('a')!.flags.accentTitleSharedWith,[]);
});
