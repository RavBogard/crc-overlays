import test from 'node:test';
import {accessStore,type AccessSessionMember} from '../lib/access.ts';
import assert from 'node:assert/strict';
import {POST} from '../app/api/authoring/route.ts';
import {AuthoringError,editableFromBaseline,normalizeGraphicName,publicErrorDetails,type Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService,suggestGraphicName,type DuplicateNameWarning,type Revision} from '../lib/authoring.ts';

const BARECHU='efa9fad4-f7d5-4091-a708-82103028861b';
const measurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'test-renderer',measuredAt:Date.now()} as const;
const MIDDOT='·';

type SaveResult={draft:Draft;warnings:DuplicateNameWarning[]};
type PreviewResult={previewId:string};
type PublishResult={revision:Revision;cue:{name:string};draft?:Draft;renamedFrom?:string};

function service(){return createAuthoringService(new MemoryAuthoringRepository())}

async function saved(api:ReturnType<typeof service>,name:string){
 return (await api.operation('create_draft',{...editableFromBaseline(BARECHU),name},'tester') as SaveResult).draft;
}
async function publish(api:ReturnType<typeof service>,draft:Draft,extra:Record<string,unknown>={}){
 const preview=await api.operation('preview_draft',{draftId:draft.id,expectedVersion:draft.version},'tester') as PreviewResult;
 await api.operation('review_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 return await api.operation('publish_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId,...extra},'publisher') as PublishResult;
}

test('names are compared as a person reads them, ignoring case, spacing, punctuation, and niqqud',()=>{
 assert.equal(normalizeGraphicName('  Modeh   Ani '),normalizeGraphicName('modeh ani'));
 assert.equal(normalizeGraphicName('Mi Chamocha'),normalizeGraphicName('mi-chamocha'));
 assert.equal(normalizeGraphicName('בָּרְכוּ'),normalizeGraphicName('ברכו'));
 assert.notEqual(normalizeGraphicName('Modeh Ani'),normalizeGraphicName('Modeh Ani 2'));
 assert.equal(normalizeGraphicName(undefined),'');
});

test('a suggested name appends the layout label and then a number, inside the stored name limit',()=>{
 assert.equal(suggestGraphicName('Modeh Ani','bottom',new Set()),`Modeh Ani ${MIDDOT} Lower third`);
 assert.equal(suggestGraphicName('Modeh Ani','left',new Set()),`Modeh Ani ${MIDDOT} Left panel`);
 const taken=new Set([normalizeGraphicName(`Modeh Ani ${MIDDOT} Right panel`)]);
 assert.equal(suggestGraphicName('Modeh Ani','right',taken),`Modeh Ani ${MIDDOT} Right panel ${MIDDOT} 2`);
 taken.add(normalizeGraphicName(`Modeh Ani ${MIDDOT} Right panel ${MIDDOT} 2`));
 assert.equal(suggestGraphicName('Modeh Ani','right',taken),`Modeh Ani ${MIDDOT} Right panel ${MIDDOT} 3`);
 const long=suggestGraphicName('N'.repeat(80),'bottom',new Set());
 assert.ok(long.length<=80,`suggested name stayed within the limit: ${long.length}`);
 assert.ok(long.endsWith(`${MIDDOT} Lower third`));
});

test('saving a second draft with an existing name warns with a suggestion and still saves',async()=>{
 const api=service();
 const first=await saved(api,'Modeh Ani');
 assert.deepEqual((await api.operation('get_draft',{draftId:first.id},'tester') as {draft:Draft}).draft.name,'Modeh Ani');
 const second=await api.operation('create_draft',{...editableFromBaseline(BARECHU),name:'  modeh   ani  '},'tester') as SaveResult;
 assert.equal(second.draft.name,'modeh   ani','the saved name is exactly what the author typed');
 assert.deepEqual(second.warnings,[{code:'duplicate-name',suggestedName:`modeh   ani ${MIDDOT} Lower third`}]);
 const unique=await api.operation('create_draft',{...editableFromBaseline(BARECHU),name:'Ahavah Rabbah'},'tester') as SaveResult;
 assert.deepEqual(unique.warnings,[]);
});

test('renaming a draft onto an existing name warns, and a draft never warns about itself',async()=>{
 const api=service();
 await saved(api,'Modeh Ani');
 const other=await saved(api,'Barechu');
 const renamed=await api.operation('update_draft',{draftId:other.id,expectedVersion:other.version,patch:{name:'Modeh Ani'}},'tester') as SaveResult;
 assert.deepEqual(renamed.warnings,[{code:'duplicate-name',suggestedName:`Modeh Ani ${MIDDOT} Lower third`}]);
 const untouched=await api.operation('update_draft',{draftId:renamed.draft.id,expectedVersion:renamed.draft.version,patch:{title:'New title'}},'tester') as SaveResult;
 assert.deepEqual(untouched.warnings,[{code:'duplicate-name',suggestedName:`Modeh Ani ${MIDDOT} Lower third`}],'the collision with the other draft persists');
});

test('an archived draft releases its name',async()=>{
 const api=service();
 const first=await saved(api,'Modeh Ani');
 await api.operation('archive_draft',{draftId:first.id,expectedVersion:first.version},'tester');
 const second=await api.operation('create_draft',{...editableFromBaseline(BARECHU),name:'Modeh Ani'},'tester') as SaveResult;
 assert.deepEqual(second.warnings,[]);
});

test('publishing over a published name is refused until it is confirmed, then publishes renamed',async()=>{
 const api=service();
 const first=await saved(api,'Modeh Ani');
 await publish(api,first);
 const second=await saved(api,'modeh ani');
 await assert.rejects(publish(api,second),(error)=>{
  const failure=error as AuthoringError;
  assert.equal(failure.code,'duplicate_name');
  assert.equal(failure.status,409);
  assert.equal(failure.message,`Another published graphic is already named "modeh ani". Publish anyway as "modeh ani ${MIDDOT} Lower third"?`);
  assert.deepEqual(failure.details,{suggestedName:`modeh ani ${MIDDOT} Lower third`});
  return true;
 });
 const confirmed=await publish(api,second,{confirmDuplicateName:true});
 assert.equal(confirmed.cue.name,`modeh ani ${MIDDOT} Lower third`);
 assert.equal(confirmed.draft?.name,`modeh ani ${MIDDOT} Lower third`,'the draft keeps the name it published under');
 assert.equal(confirmed.renamedFrom,'modeh ani');
 const published=await api.publishedCues();
 assert.deepEqual(published.map(cue=>cue.name).sort(),['Modeh Ani',`modeh ani ${MIDDOT} Lower third`].sort());
 assert.equal(new Set(published.map(cue=>normalizeGraphicName(cue.name))).size,2,'published names are now distinct');
});

test('a confirmed rename keeps the exact-version review evidence and still refuses an unreviewed publish',async()=>{
 const api=service();
 await publish(api,await saved(api,'Modeh Ani'));
 const unreviewed=await saved(api,'Modeh Ani');
 const preview=await api.operation('preview_draft',{draftId:unreviewed.id,expectedVersion:unreviewed.version},'tester') as PreviewResult;
 await assert.rejects(
  api.operation('publish_draft',{draftId:unreviewed.id,expectedVersion:unreviewed.version,previewId:preview.previewId,confirmDuplicateName:true},'publisher'),
  (error)=>(error as AuthoringError).code==='review_required',
 );
 assert.equal((await api.operation('get_draft',{draftId:unreviewed.id},'tester') as {draft:Draft}).draft.name,'Modeh Ani','a refused publish never renames the draft');
 const reviewed=await publish(api,unreviewed,{confirmDuplicateName:true});
 assert.equal(reviewed.revision.review?.humanApproved,true);
 assert.equal(reviewed.revision.review?.browserMeasurement.viewportWidth,1920);
 assert.match(reviewed.revision.cueHash,/^[a-f0-9]{64}$/);
});

test('a unique published name publishes without confirmation and rejects a non-boolean confirmation',async()=>{
 const api=service();
 const draft=await saved(api,'Modeh Ani');
 const result=await publish(api,draft);
 assert.equal(result.cue.name,'Modeh Ani');
 assert.equal(result.renamedFrom,undefined);
 const other=await saved(api,'Barechu');
 const preview=await api.operation('preview_draft',{draftId:other.id,expectedVersion:other.version},'tester') as PreviewResult;
 await assert.rejects(
  api.operation('publish_draft',{draftId:other.id,expectedVersion:other.version,previewId:preview.previewId,confirmDuplicateName:'yes'},'publisher'),
  (error)=>(error as AuthoringError).code==='invalid_input',
 );
});

test('the authoring route carries error details into the body without adding fields to ordinary errors',async()=>{
 // Authoring is a member's act: an Editor session, never the shared control key.
 const editor:AccessSessionMember={id:'member-editor',email:'editor@rehearsal.invalid',name:'Ellie Editor',role:'editor',enabled:true,authMethod:'password',authenticatedAt:0};
 const savedSession=accessStore.memberForSession;accessStore.memberForSession=async()=>editor;
 try{
  const response=await POST(new Request('https://graphics.test/api/authoring',{
   method:'POST',
   headers:{Origin:'https://graphics.test','Content-Type':'application/json',Cookie:`crc_access=${'B'.repeat(43)}`},
   body:JSON.stringify({operation:'unknown_operation_for_shape_check',input:{}}),
  }));
  assert.equal(response.status,404);
  const body=await response.json();
  assert.equal(body.code,'unknown_operation');
  assert.equal(Object.hasOwn(body,'suggestedName'),false,'details are only present when an error carries them');
 }finally{accessStore.memberForSession=savedSession}
});

test('a baseline catalog name is already taken: saving warns and publishing needs confirmation',async()=>{
 const api=service();
 const draft=await api.operation('create_draft',{...editableFromBaseline(BARECHU),name:'Barechu'},'tester') as SaveResult;
 assert.deepEqual(draft.warnings,[{code:'duplicate-name',suggestedName:`Barechu ${MIDDOT} Lower third`}],'the shipped catalog already shows a Barechu');
 await assert.rejects(publish(api,draft.draft),(error)=>{
  const failure=error as AuthoringError;
  assert.equal(failure.code,'duplicate_name');
  assert.equal(failure.status,409);
  assert.deepEqual(failure.details,{suggestedName:`Barechu ${MIDDOT} Lower third`});
  return true;
 });
 const confirmed=await publish(api,draft.draft,{confirmDuplicateName:true});
 assert.equal(confirmed.cue.name,`Barechu ${MIDDOT} Lower third`);
 assert.equal(confirmed.renamedFrom,'Barechu');
});

test('publishing over a baseline cue under its own id keeps the baseline name free',async()=>{
 const api=service();
 const imported=(await api.operation('import_cue',{cueId:BARECHU},'tester') as {draft:Draft}).draft;
 assert.equal(imported.name,'Barechu');
 const republished=await publish(api,imported);
 assert.equal(republished.cue.name,'Barechu','a baseline cue publishes under its own name without a rename');
});

test('republishing a graphic under its own unchanged name is not a duplicate',async()=>{
 const api=service();
 const first=await saved(api,'Modeh Ani');
 assert.equal((await publish(api,first)).cue.name,'Modeh Ani');
 const edited=(await api.operation('update_draft',{draftId:first.id,expectedVersion:first.version,patch:{title:'Second thoughts'}},'tester') as SaveResult).draft;
 const again=await publish(api,edited);
 assert.equal(again.cue.name,'Modeh Ani','the draft never collides with its own publication');
 assert.equal(again.renamedFrom,undefined);
 assert.equal(again.revision.revision,2);
});

test('only allowlisted error details reach the HTTP body',()=>{
 assert.deepEqual(publicErrorDetails({suggestedName:`Modeh Ani ${MIDDOT} Lower third`}),{suggestedName:`Modeh Ani ${MIDDOT} Lower third`});
 assert.deepEqual(publicErrorDetails({}),{});
 assert.deepEqual(publicErrorDetails({connectionString:'postgres://secret',suggestedName:'Modeh Ani'}),{suggestedName:'Modeh Ani'},'an unknown detail key is dropped');
});
