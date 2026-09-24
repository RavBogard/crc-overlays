import assert from 'node:assert/strict';
import test from 'node:test';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring';
import {starterSourceMap} from '../lib/workspace-catalog';

// A1 follow-up: update_draft maps a workspace template id to the CRC baseline it copies, as create_draft does.
type Result={draft:{id:string;version:number;templateCueId:string}};
test('update_draft takes a TBI template id, like create_draft',async()=>{
 const previous=process.env.WORKSPACE_ID;process.env.WORKSPACE_ID='temple-bnai-israel-kalamazoo';
 try{
  const [[baseline,tbiTemplate]]=[...starterSourceMap()];
  assert.ok(tbiTemplate&&baseline!==tbiTemplate,'TBI has starter templates');
  const service=createAuthoringService(new MemoryAuthoringRepository());
  const created=await service.operation('create_draft',{name:'Welcome',title:'Welcome',layout:'bottom',content:{mode:'custom',text:'Hello'}},'tester') as Result;
  const updated=await service.operation('update_draft',{draftId:created.draft.id,expectedVersion:created.draft.version,patch:{templateCueId:tbiTemplate}},'tester') as Result;
  assert.equal(updated.draft.templateCueId,baseline,'stored as the baseline the TBI template copies');
 }finally{if(previous===undefined)delete process.env.WORKSPACE_ID;else process.env.WORKSPACE_ID=previous}
});
