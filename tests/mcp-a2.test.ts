import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,reviewApprover,type ServerFitRunner} from '../lib/authoring';
import {buildCue,cueHash,previewValidation} from '../lib/authoring-model';

// Packet A2 (R-A1, R-A2): one-call publish and the publications list, through the real MCP
// handler into the real in-memory authoring service with a stubbed server fit runner.
const AGENT='mcp:0a1b2c:member:member-7';
const authInfo=(actor=AGENT)=>({token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor}}) satisfies AuthInfo;
// A real 1x1 JPEG is not needed: the service stores the bytes it was given and hands them back.
const FRAME={mimeType:'image/jpeg' as const,dataBase64:Buffer.from('frame-the-agent-saw').toString('base64'),width:1920,height:1080};
type Content={type:string;text?:string;data?:string;mimeType?:string};
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output;content:Content[]};

const passing:ServerFitRunner=async(_cue,options)=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test',...(options?.includePreviewImage?{previewImage:FRAME}:{})});

function wired(serverFit:ServerFitRunner=passing,actor=AGENT){
 const repo=new MemoryAuthoringRepository();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,serverFit);
 const calls:string[]=[];
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>{calls.push(operation);return service.operation(operation,input,who)});
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={},workspace:string|undefined='crc',as=actor):Promise<Called>=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:workspace===undefined?args:{...args,workspace}}})}),{authInfo:authInfo(as)});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Content[]};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{},content:[]};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output,content:body.result!.content};
 };
 return {repo,service,calls,call};
}
const custom=(name:string,text='Kiddush follows in the social hall')=>({name,title:'Announcement',layout:'bottom',content:{mode:'custom',text}});

test('acceptance: nothing to a published custom graphic in two calls, create_draft then ship_draft',async()=>{
 const {call,calls,repo}=wired();
 const created=await call('create_draft',custom('Kiddush announcement'));
 assert.equal(created.isError,false,created.text);
 const shipped=await call('ship_draft',{draftId:created.output.draft.id,expectedVersion:1});
 assert.equal(shipped.isError,false,shipped.text);
 assert.deepEqual(calls,['create_draft','ship_draft'],'two calls, nothing else');
 assert.equal(shipped.output.shipped,true);assert.equal(shipped.output.verdict,'pass');assert.equal(shipped.output.revision,1);
 assert.equal(shipped.output.name,'Kiddush announcement');assert.equal(shipped.output.workspaceId,'crc');
 assert.equal(shipped.output.review.approvedBy,'agent');assert.equal(shipped.output.review.member,'member-7');assert.equal(shipped.output.review.humanApproved,undefined,'an agent receipt does not claim a human approved');
 assert.equal(shipped.output.imageStored,true);assert.match(shipped.output.message,/^Published "Kiddush announcement"\./);
 // The frame leaves as MCP image content, never as base64 inside the JSON.
 assert.deepEqual(shipped.content[1],{type:'image',data:FRAME.dataBase64,mimeType:'image/jpeg'});
 assert.doesNotMatch(shipped.content[0].text!,new RegExp(FRAME.dataBase64));
 assert.equal((await repo.published()).some(cue=>cue.id===created.output.draft.id),true,'the graphic is in the catalog');
 // The publications list is what a person reviews: the same picture the agent was shown.
 const listed=await call('list_recent_publications',{actor:'agent'},undefined);
 assert.equal(listed.isError,false,listed.text);
 const row=listed.output.publications[0];
 assert.deepEqual([row.name,row.publishedBy,row.approvedBy,row.member,row.current,row.rollbackTo,row.excerpt],['Kiddush announcement','agent','agent','member-7',true,null,'Kiddush follows in the social hall']);
 assert.deepEqual(row.image,{width:1920,height:1080,mimeType:'image/jpeg'});
 const stored=await repo.getFitImage(row.previewId);
 assert.equal(stored?.data.toString('base64'),FRAME.dataBase64,'the stored frame is byte for byte the one the agent received');
});

test('ship_draft stops with the renderer\'s own sentences and the frame when the fit fails, publishing nothing',async()=>{
 const failing:ServerFitRunner=async()=>({verdict:'fail',fitErrors:['The Hebrew text overflows its box.','The title is too long for one line.'],warnings:[],fill:1.2,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test',previewImage:FRAME});
 const {call,repo}=wired(failing);
 const created=await call('create_draft',custom('Long notice'));
 const stopped=await call('ship_draft',{draftId:created.output.draft.id,expectedVersion:1});
 assert.equal(stopped.isError,false,stopped.text);
 assert.equal(stopped.output.shipped,false);assert.equal(stopped.output.stoppedAt,'fit_failed');
 assert.deepEqual(stopped.output.fitErrors,['The Hebrew text overflows its box.','The title is too long for one line.']);
 assert.equal(stopped.output.message,'The Hebrew text overflows its box. The title is too long for one line. Nothing was published.');
 assert.equal(stopped.content[1]?.type,'image','the agent sees what failed');
 assert.equal((await repo.revisions(created.output.draft.id)).length,0);
});

test('ship_draft stops with the unavailable sentence when the server cannot open a browser',async()=>{
 const {call,repo}=wired(async()=>({verdict:'unavailable',reason:'browser_unavailable'}));
 const created=await call('create_draft',custom('Notice'));
 const stopped=await call('ship_draft',{draftId:created.output.draft.id,expectedVersion:1});
 assert.deepEqual([stopped.output.shipped,stopped.output.stoppedAt,stopped.output.reason],[false,'fit_unavailable','browser_unavailable']);
 assert.equal(stopped.output.message,'The server could not open a browser to check this graphic. Open Fit check and review it yourself. Nothing was published.');
 assert.match(stopped.output.fitCheckUrl,/^\/author\/fit-check\?draft=/);
 assert.equal((await repo.revisions(created.output.draft.id)).length,0);
});

test('ship_draft stops on a name already published, before any fit; allowRename publishes under the suggestion',async()=>{
 let fits=0;const counting:ServerFitRunner=async(cue,options)=>{fits++;return passing(cue,options)};
 const {call,repo}=wired(counting);
 const first=await call('create_draft',custom('Welcome'));
 assert.equal((await call('ship_draft',{draftId:first.output.draft.id,expectedVersion:1})).output.shipped,true);
 const second=await call('create_draft',custom('Welcome','Welcome to Shabbat services'));
 const before=fits;
 const stopped=await call('ship_draft',{draftId:second.output.draft.id,expectedVersion:1});
 assert.deepEqual([stopped.output.shipped,stopped.output.stoppedAt,stopped.output.name],[false,'duplicate_name','Welcome']);
 assert.equal(typeof stopped.output.suggestedName,'string');assert.notEqual(stopped.output.suggestedName,'Welcome');
 assert.match(stopped.output.message,/allowRename:true/);
 assert.equal(fits,before,'no browser is opened for a publish that cannot happen yet');
 const renamed=await call('ship_draft',{draftId:second.output.draft.id,expectedVersion:1,allowRename:true});
 assert.equal(renamed.output.shipped,true,renamed.text);
 assert.deepEqual([renamed.output.name,renamed.output.renamedFrom,renamed.output.draftVersion],[stopped.output.suggestedName,'Welcome',2]);
 const row=(await call('list_recent_publications',{},undefined)).output.publications.find((item:{draftId:string})=>item.draftId===second.output.draft.id);
 assert.equal(row.name,stopped.output.suggestedName);assert.ok(row.image,'the frame follows the renamed preview');
 assert.equal((await repo.getPreview(row.previewId))?.fitCheck?.verdict,'pass','so does the measurement');
});

test('publish_draft takes confirmDuplicateName over MCP',async()=>{
 const {call}=wired();
 const first=await call('create_draft',custom('Mourners'));await call('ship_draft',{draftId:first.output.draft.id,expectedVersion:1});
 const second=await call('create_draft',custom('Mourners','We remember'));const draftId=second.output.draft.id;
 const preview=await call('preview_draft',{draftId,expectedVersion:1});const previewId=preview.output.previewId;
 await call('fit_check_draft',{draftId,expectedVersion:1,previewId});
 assert.equal((await call('review_draft',{draftId,expectedVersion:1,previewId})).isError,false,'humanApproved is optional');
 const refused=await call('publish_draft',{draftId,expectedVersion:1,previewId});
 assert.equal(refused.isError,true);assert.match(refused.text,/already named "Mourners"/);
 const confirmed=await call('publish_draft',{draftId,expectedVersion:1,previewId,confirmDuplicateName:true});
 assert.equal(confirmed.isError,false,confirmed.text);assert.equal(confirmed.output.renamedFrom,'Mourners');
});

test('receipts say who approved; humanApproved stays accepted, false is refused, and old receipts still publish',async()=>{
 assert.deepEqual(reviewApprover('mcp:0a1b2c:member:member-7'),{approvedBy:'agent',member:'member-7'});
 assert.deepEqual(reviewApprover('mcp:client'),{approvedBy:'agent',member:null});
 assert.deepEqual(reviewApprover('8d0f2f6e-web-member'),{approvedBy:'person',member:'8d0f2f6e-web-member'});
 const repo=new MemoryAuthoringRepository();const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,passing);
 const created=await service.operation('create_draft',custom('Legacy'),'person-1') as {draft:{id:string}};const draftId=created.draft.id;
 const preview=await service.operation('preview_draft',{draftId,expectedVersion:1},'person-1') as {previewId:string};
 const measurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'laptop/1',measuredAt:1};
 await assert.rejects(service.operation('review_draft',{draftId,expectedVersion:1,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:false},'person-1'),/humanApproved can only be true/);
 const person=await service.operation('review_draft',{draftId,expectedVersion:1,previewId:preview.previewId,browserMeasurement:measurement},'person-1') as {review:Record<string,unknown>};
 assert.deepEqual([person.review.approvedBy,person.review.member,person.review.humanApproved],['person','person-1',true]);
 // A receipt stored before R-A1: only the literal.
 const draft=(await repo.getDraft(draftId))!;const cue=buildCue(draft);
 const legacyId='legacy-preview';await repo.insertPreview({id:legacyId,draftId,draftVersion:1,cueHash:cueHash(cue),cue,validation:previewValidation(cue),review:{humanApproved:true,browserMeasurement:{...measurement,fontsReady:true,overflow:false},reviewedAt:1,reviewedBy:'someone'},createdAt:1,createdBy:'someone'});
 const published=await service.operation('publish_draft',{draftId,expectedVersion:1,previewId:legacyId},'person-1') as {revision:{revision:number}};
 assert.equal(published.revision.revision,1);
 const listed=await service.operation('list_recent_publications',{actor:'person'},'person-1') as {publications:Array<{approvedBy:string|null;member:string|null;image:unknown}>};
 assert.deepEqual([listed.publications[0].approvedBy,listed.publications[0].member,listed.publications[0].image],['person','someone',null]);
 assert.equal((await service.operation('list_recent_publications',{actor:'agent'},'person-1') as {publications:unknown[]}).publications.length,0);
});

test('list_recent_publications offers the rollback the page performs, and says when a publication is no longer live',async()=>{
 const {call}=wired();
 const created=await call('create_draft',custom('Yahrzeit'));const draftId=created.output.draft.id;
 await call('ship_draft',{draftId,expectedVersion:1});
 await call('update_draft',{draftId,expectedVersion:1,patch:{content:{mode:'custom',text:'This week we remember'}}});
 assert.equal((await call('ship_draft',{draftId,expectedVersion:2})).output.revision,2);
 const listed=(await call('list_recent_publications',{},undefined)).output.publications.filter((row:{draftId:string})=>row.draftId===draftId);
 assert.deepEqual(listed.map((row:{revision:number;current:boolean;rollbackTo:number|null})=>[row.revision,row.current,row.rollbackTo]),[[2,true,1],[1,false,null]]);
 const rolled=await call('rollback_draft',{draftId,expectedVersion:listed[0].draftVersion,revision:listed[0].rollbackTo});
 assert.equal(rolled.isError,false,rolled.text);
 const after=(await call('list_recent_publications',{},undefined)).output.publications.filter((row:{draftId:string})=>row.draftId===draftId);
 assert.deepEqual(after.map((row:{current:boolean})=>row.current),[false,true]);
 const since=(await call('list_recent_publications',{since:Date.now()+60_000},undefined)).output.publications;assert.deepEqual(since,[]);
 assert.equal((await call('list_recent_publications',{actor:'someone'},undefined)).isError,true);
});

test('a frame over the size bound is not kept, and the check still passes',async()=>{
 const huge:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test',previewImage:{...FRAME,dataBase64:Buffer.alloc(750_001).toString('base64')}});
 const {call}=wired(huge);
 const created=await call('create_draft',custom('Big frame'));
 const shipped=await call('ship_draft',{draftId:created.output.draft.id,expectedVersion:1});
 assert.deepEqual([shipped.output.shipped,shipped.output.imageStored],[true,false]);
 assert.equal((await call('list_recent_publications',{},undefined)).output.publications[0].image,null);
});
