import test from 'node:test';
import assert from 'node:assert/strict';
import type {Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import {draftPatchFromForm,formFromDraft} from '../app/author/editor-state.ts';

// Nov 20, "Copy of Modim Anachnu Lach": clearing the Hebrew title and saving brought it back,
// because a field the Save left out keeps its saved value.
const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';

test('a Hebrew title cleared in the editor stays cleared after Save',async()=>{
 const api=createAuthoringService(new MemoryAuthoringRepository());
 const {draft}=await api.operation('create_draft',{name:'Copy of Modim',title:'Modim',accentTitle:'מוֹדִים',layout:'corner',templateCueId:BARECHU,content:{mode:'custom',text:'Modim anachnu lach...'},presentation:{}},'tester') as {draft:Draft};
 const form={...formFromDraft(draft as never),accentTitle:'  '};
 const patch=draftPatchFromForm(form);
 assert.equal(patch.accentTitle,'','the Save says "clear it" rather than leaving the field out');
 const {draft:saved}=await api.operation('update_draft',{draftId:draft.id,expectedVersion:draft.version,patch:JSON.parse(JSON.stringify(patch))},'tester') as {draft:Draft};
 assert.equal(saved.accentTitle,undefined);
 // A patch that does not mention the Hebrew title still keeps it (MCP and other callers).
 const {draft:other}=await api.operation('create_draft',{name:'Other',title:'Other',accentTitle:'מוֹדִים',layout:'corner',templateCueId:BARECHU,content:{mode:'custom',text:'x'},presentation:{}},'tester') as {draft:Draft};
 const {draft:kept}=await api.operation('update_draft',{draftId:other.id,expectedVersion:other.version,patch:{title:'Other title'}},'tester') as {draft:Draft};
 assert.equal(kept.accentTitle,'מוֹדִים');
});
