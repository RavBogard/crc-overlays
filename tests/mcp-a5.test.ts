import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {isRetiredDraft} from '../lib/authoring-model';
import {hygieneOperation,nameBase,BATCH_SHIP_BUDGET_MS} from '../lib/catalog-hygiene';
import {isHygieneTool} from '../lib/catalog-hygiene-schemas';
import {MemoryServicesRepository,type ServicesLoaders} from '../lib/service-collections';
import {serviceToolOperation} from '../lib/service-tools';
import {MemoryCompanionDeckRepository} from '../lib/companion-deck/repository.ts';
import {PAGE_TEMPLATES,PALETTE,type CompanionDeck} from '../lib/companion-deck/model.ts';

// Packet A5 (R-H1-H3): catalog hygiene through the real MCP handler, into the real in-memory
// authoring service (stubbed server fit), an in-memory services store and an in-memory deck.
const AGENT='mcp:0a1b2c:member:member-7';
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:AGENT}} satisfies AuthInfo;
const THANK_YOU='09f50803-3288-4b78-bcc7-560025668e1a';// the built-in "Thank you" graphic
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;

function deckWith(buttons:CompanionDeck['pages'][number]['buttons']):CompanionDeck{
 return {schema:1,workspace:'crc',companion:{release:'5.0.3',build:'test',exportVersion:12},palette:{...PALETTE},switcher:{mergeDurationMs:500,presetWaitMs:900},grid:{rows:4,columns:8},chains:[[2]],connections:[],templates:PAGE_TEMPLATES.crc,pages:[{number:2,id:'friday',name:'Friday evening',template:'service',buttons}],fragments:{},triggers:{},customVariables:{}};
}

function wired(){
 const clock={now:1_000_000};
 // Each server fit "takes" 15 s on the fake clock, so batch_ship's 40 s budget is reached quickly.
 const fit:ServerFitRunner=async(_cue,options)=>{clock.now+=15_000;return {verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:clock.now,rendererVersion:'server-chromium/test',...(options?.includePreviewImage?{previewImage:{mimeType:'image/jpeg' as const,dataBase64:Buffer.from('frame').toString('base64'),width:1920,height:1080}}:{})}};
 const repo=new MemoryAuthoringRepository();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,fit);
 const services=new MemoryServicesRepository();let serviceIds=0;
 const loaders:ServicesLoaders={catalog:async()=>({cues:(await repo.published()).map(cue=>({id:cue.id,name:cue.name,title:cue.texts.textTitle})),version:'v1'}),sources:()=>[],now:()=>clock.now,id:()=>`00000000-0000-4000-8000-${String(++serviceIds).padStart(12,'0')}`,liveCue:async()=>null,retired:async()=>repo.retiredCues()};
 const deck=new MemoryCompanionDeckRepository();
 const context={repo,run:service.operation,services:{repository:services,loaders},deck:{repository:deck,workspace:'crc' as const},now:()=>clock.now};
 const calls:string[]=[];
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>{calls.push(operation);return isHygieneTool(operation)?hygieneOperation(operation,input,who,context):service.operation(operation,input,who)});
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:{workspace:'crc',...args}}})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))!.slice(6);
  const body=JSON.parse(data) as {result:{isError?:boolean;content:{type:string;text?:string}[]}};
  const text=body.result.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result.isError===true,text,output,content:body.result.content};
 };
 const ok=async(name:string,args:Record<string,unknown>={})=>{const result=await call(name,args);assert.equal(result.isError,false,`${name}: ${result.text}`);return result.output};
 const custom=async(name:string,text:string,title='Announcement')=>(await ok('create_draft',{name,title,layout:'bottom',content:{mode:'custom',text}})).draft as {id:string;version:number};
 const shipped=async(name:string,text:string,title?:string)=>{const draft=await custom(name,text,title);const result=await ok('ship_draft',{draftId:draft.id,expectedVersion:draft.version});assert.equal(result.shipped,true,result.message);return {id:draft.id,version:result.draftVersion as number}};
 const version=async(draftId:string)=>(await repo.getDraft(draftId))!.version;
 return {clock,repo,service,services,loaders,deck,context,calls,call,ok,custom,shipped,version};
}

test('nameBase reads copies as the same name',()=>{
 for(const name of ['Copy of Thank you','Copy of Copy of Thank you','Thank you (2)','Thank you copy','Thank you copy 3','thank  YOU!'])assert.equal(nameBase(name),'thank you',name);
 assert.notEqual(nameBase('Lecha Dodi (Carlebach)'),nameBase('Lecha Dodi (Sulzer)'),'a real alternate is not a copy');
});

test('acceptance: find_catalog_issues finds the known cases, read only',async()=>{
 const f=wired();
 // Four "Copy of Thank you"-style copies of the built-in Thank you graphic.
 const copies:Output[]=[];
 for(let i=0;i<2;i++)copies.push((await f.ok('duplicate_draft',{cueId:THANK_YOU})).draft);
 copies.push((await f.ok('duplicate_draft',{draftId:copies[0].id})).draft);
 copies.push((await f.ok('duplicate_draft',{cueId:THANK_YOU,name:'Thank you (2)'})).draft);
 assert.deepEqual(copies.map(draft=>draft.name),['Copy of Thank you','Copy of Thank you','Copy of Copy of Thank you','Thank you (2)']);
 // Zochreinu, copied from Mi Chamocha, kept "Mi Chamocha" as its on-screen title.
 const miChamocha=await f.shipped('Mi Chamocha (Shabbat evening)','Mi chamocha ba-eilim Adonai','Mi Chamocha');
 const zochreinu=(await f.ok('duplicate_draft',{draftId:miChamocha.id,name:'Zochreinu'})).draft;
 await f.ok('update_draft',{draftId:zochreinu.id,expectedVersion:zochreinu.version,patch:{content:{mode:'custom',text:'Zochreinu l’chayim, melech chafeitz bachayim'}}});
 // Archived but still published.
 const sukkot=await f.shipped('Sukkot notice','The sukkah is open after services');
 await f.ok('archive_draft',{draftId:sukkot.id,expectedVersion:sukkot.version});
 // Retired, yet still in a service and on a deck key.
 const blessing=await f.shipped('Old blessing','Baruch atah');
 const service=await serviceToolOperation('create_service',{name:'Friday night',service:'Shabbat Evening',rows:[{cueIds:[blessing.id]}]},AGENT,{repository:f.services,loaders:f.loaders}) as {serviceId:string};
 await f.deck.create('crc',deckWith([{row:1,col:1,spec:{kind:'cue',cueId:blessing.id,label:'Blessing',role:'single'}}]),'seed',1);
 await f.ok('retire_cue',{cueId:blessing.id,expectedVersion:blessing.version});
 // A restored graphic sharing its name with one published while it was retired.
 const havdalahA=await f.shipped('Havdalah','Havdalah blessings, first setting');
 await f.ok('retire_cue',{cueId:havdalahA.id,expectedVersion:havdalahA.version});
 const havdalahB=await f.shipped('Havdalah','Havdalah blessings, second setting');
 await f.ok('restore_cue',{cueId:havdalahA.id,expectedVersion:await f.version(havdalahA.id)});
 // Changed since it was published.
 const shalom=await f.shipped('Shalom notice','Shabbat shalom');
 await f.ok('update_draft',{draftId:shalom.id,expectedVersion:shalom.version,patch:{content:{mode:'custom',text:'Shabbat shalom to all'}}});

 const before=JSON.stringify(await f.repo.listDrafts());
 const found=await f.ok('find_catalog_issues');
 assert.equal(JSON.stringify(await f.repo.listDrafts()),before,'read only');
 assert.equal(found.workspaceId,'crc');assert.match(found.message,/Nothing was changed/);
 const of=(kind:string)=>(found.issues as Output[]).filter(issue=>issue.kind===kind);
 const idsOf=(issue:Output)=>issue.graphics.map((graphic:{id:string})=>graphic.id);
 for(const issue of found.issues as Output[]){assert.ok(issue.message.length>20,issue.kind);assert.ok(issue.suggestedFix.tool,issue.kind);for(const graphic of issue.graphics){assert.equal(typeof graphic.id,'string');assert.equal(typeof graphic.name,'string')}}

 const thankYou=of('near_duplicate_name').find(issue=>idsOf(issue).includes(THANK_YOU));
 assert.ok(thankYou,'the Thank you copies are one issue');
 for(const copy of copies)assert.ok(idsOf(thankYou!).includes(copy.id),copy.name);
 assert.equal(thankYou!.graphics.length,5,'the built-in and its four copies');assert.equal(thankYou!.suggestedFix.tool,'batch_update');
 const sameContent=of('duplicate_content').find(issue=>idsOf(issue).includes(copies[0].id));
 assert.deepEqual(new Set(idsOf(sameContent!)),new Set(copies.map(copy=>copy.id)),'the four copies read the same on screen');

 const inherited=of('inherited_title');
 assert.equal(inherited.length,1,JSON.stringify(inherited));
 assert.equal(inherited[0].graphics[0].id,zochreinu.id);assert.ok(idsOf(inherited[0]).includes(miChamocha.id));
 assert.match(inherited[0].message,/"Zochreinu" shows the title "Mi Chamocha"/);

 assert.deepEqual(of('archived_but_published').map(idsOf),[[sukkot.id]]);assert.equal(of('archived_but_published')[0].suggestedFix.tool,'retire_cue');
 assert.deepEqual(of('retired_in_service').map(issue=>[idsOf(issue),issue.services.map((item:{serviceId:string})=>item.serviceId)]),[[[blessing.id],[service.serviceId]]]);
 assert.deepEqual(of('retired_on_deck').map(issue=>[idsOf(issue),issue.buttons]),[[[blessing.id],[{page:2,pageName:'Friday evening',row:1,col:1,label:'Blessing'}]]]);
 assert.equal(of('retired_on_deck')[0].suggestedFix.tool,'supersede_cue');
 const clash=of('restored_name_clash');
 assert.deepEqual(clash.map(idsOf),[[havdalahA.id,havdalahB.id]],'the one published first comes first');
 assert.deepEqual(of('unpublished_changes').map(idsOf),[[shalom.id]]);assert.equal(of('unpublished_changes')[0].suggestedFix.tool,'batch_ship');
 assert.deepEqual(found.checked.services,{checked:true,count:1});assert.deepEqual(found.checked.deck,{checked:true,version:1});

 const narrowed=await f.ok('find_catalog_issues',{kinds:['inherited_title'],limit:1});
 assert.deepEqual(Object.keys(narrowed.counts),['inherited_title']);assert.equal(narrowed.issues.length,1);
});

test('find_catalog_issues says so when there is no stored deck, and it runs through the real dispatch',async()=>{
 const repo=new MemoryAuthoringRepository(),service=createAuthoringService(repo);
 await service.operation('duplicate_draft',{cueId:THANK_YOU},'editor');await service.operation('duplicate_draft',{cueId:THANK_YOU},'editor');
 const found=await service.operation('find_catalog_issues',{kinds:['duplicate_name','near_duplicate_name','retired_on_deck']},'editor') as Output;
 assert.equal(found.issues.filter((issue:Output)=>issue.graphics.some((graphic:{id:string})=>graphic.id===THANK_YOU)).length,1);
 assert.match(found.checked.deck.message,/No Companion deck is stored/);
});

test('acceptance: batch_update dry run, then apply with a failure mid-list that does not stop the rest',async()=>{
 const f=wired();
 const a=await f.custom('Copy of Welcome','Welcome to services'),b=await f.custom('Copy of Welcome 2','Welcome'),c=await f.custom('Copy of Welcome 3','Welcome all'),d=await f.custom('Readable notice','A long notice');
 const items=[
  {action:'rename',draftId:a.id,expectedVersion:a.version,name:'Welcome (lobby)',title:'Welcome'},
  {action:'rename',draftId:b.id,expectedVersion:b.version+5,name:'Never applied'},
  {action:'archive',draftId:c.id,expectedVersion:c.version},
  {action:'style',draftId:d.id,expectedVersion:d.version,comfortableTypography:true},
 ];
 const planned=await f.ok('batch_update',{items});
 assert.equal(planned.dryRun,true);assert.match(planned.message,/Nothing was changed/);
 assert.deepEqual(planned.results.map((item:Output)=>item.status),['planned','failed','planned',planned.results[3].status]);
 assert.equal(planned.results[1].error.code,'version_conflict');
 assert.deepEqual(planned.results[0].change,{name:{from:'Copy of Welcome',to:'Welcome (lobby)'},title:{from:'Announcement',to:'Welcome'}});
 assert.equal(await f.version(a.id),a.version,'the dry run changed nothing');assert.equal((await f.repo.getDraft(c.id))!.archivedAt,undefined);

 const applied=await f.ok('batch_update',{items,dryRun:false});
 assert.equal(applied.dryRun,false);
 assert.deepEqual(applied.results.map((item:Output)=>[item.index,item.ok]),[[0,true],[1,false],[2,true],[3,true]],'the failure in the middle did not stop items 2 and 3');
 assert.equal(applied.results[1].error.code,'version_conflict');assert.match(applied.results[1].error.message,/changed since you read it/);
 assert.equal(applied.failed,1);assert.equal(applied.applied>=2,true);
 const renamed=(await f.repo.getDraft(a.id))!;assert.deepEqual([renamed.name,renamed.title],['Welcome (lobby)','Welcome']);
 assert.equal((await f.repo.getDraft(b.id))!.name,'Copy of Welcome 2','the failed item is untouched');
 assert.ok((await f.repo.getDraft(c.id))!.archivedAt,'the item after the failure ran');
 assert.equal(applied.results[0].version,renamed.version);
 assert.ok(!f.calls.includes('ship_draft')&&!f.calls.includes('publish_draft'),'nothing was published');
});

test('acceptance: batch_ship ships one item per ship_draft and resumes from its cursor',async()=>{
 const f=wired();
 const drafts:{id:string;version:number}[]=[];for(const name of ['Notice one','Notice two','Notice three','Notice four','Notice five'])drafts.push(await f.custom(name,`${name} text`));
 const items=drafts.map(draft=>({draftId:draft.id,expectedVersion:draft.version}));
 const planned=await f.ok('batch_ship',{items});
 assert.equal(planned.dryRun,true);assert.equal(planned.wouldShip,5);assert.equal((await f.repo.published()).length,0,'a dry run publishes nothing');

 const first=await f.ok('batch_ship',{items,dryRun:false});
 // 15 s per fit: two items take 30 s, and a third would pass the 40 s budget.
 assert.equal(BATCH_SHIP_BUDGET_MS,40_000);
 assert.deepEqual(first.results.map((item:Output)=>[item.index,item.status]),[[0,'shipped'],[1,'shipped']]);
 assert.equal(first.done,false);assert.equal(first.remaining,3);assert.match(first.nextCursor,/^2\./);assert.equal(first.liveCatalogChanged,true);
 const firstCall=await f.call('batch_ship',{items,dryRun:false,cursor:first.nextCursor});
 assert.equal(firstCall.content.length,1,'no frames in a batch answer');
 const second=firstCall.output;
 assert.deepEqual(second.results.map((item:Output)=>[item.index,item.status]),[[2,'shipped'],[3,'shipped']]);
 const third=await f.ok('batch_ship',{items,dryRun:false,cursor:second.nextCursor});
 assert.deepEqual(third.results.map((item:Output)=>[item.index,item.status]),[[4,'shipped']]);
 assert.equal(third.done,true);assert.equal(third.nextCursor,null);
 assert.equal(f.calls.filter(name=>name==='batch_ship').length,4,'nothing but batch_ship crossed the MCP');
 assert.deepEqual(new Set((await f.repo.published()).map(cue=>cue.id)),new Set(drafts.map(draft=>draft.id)));
 // Repeating a chunk is safe: what is already live at that version is skipped, not republished.
 const repeat=await f.ok('batch_ship',{items,dryRun:false,cursor:first.nextCursor});
 assert.ok(repeat.results.every((item:Output)=>item.status==='already_published'));
 for(const draft of drafts)assert.equal((await f.repo.revisions(draft.id)).length,1);
 // A cursor only resumes the list it came from.
 const wrong=await f.call('batch_ship',{items:items.slice(1),dryRun:false,cursor:first.nextCursor});
 assert.equal(wrong.isError,true);assert.match(wrong.text,/different list of items/);
});

test('batch_ship reports a stop or a failure per item and carries on',async()=>{
 const f=wired();
 const taken=await f.shipped('Kiddush notice','Kiddush in the hall');void taken;
 const dup=await f.custom('Kiddush notice','Another kiddush');const good=await f.custom('Oneg notice','Oneg after services');
 const result=await f.ok('batch_ship',{items:[{draftId:dup.id,expectedVersion:dup.version},{draftId:'no-such-draft',expectedVersion:1},{draftId:good.id,expectedVersion:good.version}],dryRun:false});
 assert.deepEqual(result.results.map((item:Output)=>item.status),['stopped','failed','shipped']);
 assert.equal(result.results[0].stoppedAt,'duplicate_name');assert.ok(result.results[0].suggestedName);
 assert.equal(result.results[1].error.code,'unknown_draft');
});

test('acceptance: supersede_cue repoints a service and a deck key, then retires the old graphic',async()=>{
 const f=wired();
 const oldCue=await f.shipped('Kiddush (old)','Kiddush, the old wording'),newCue=await f.shipped('Kiddush (new)','Kiddush, the new wording'),other=await f.shipped('Motzi','Hamotzi');
 const created=await serviceToolOperation('create_service',{name:'Friday night',service:'Shabbat Evening',rows:[{cueIds:[oldCue.id],status:'covered',cueId:oldCue.id},{label:'Blessing over bread',status:'needs-review',reason:'Two could fit.',candidateCueIds:[oldCue.id,other.id]},{cueIds:[other.id]}]},AGENT,{repository:f.services,loaders:f.loaders}) as {serviceId:string;version:number};
 await f.deck.create('crc',deckWith([{row:1,col:1,spec:{kind:'cue',cueId:oldCue.id,label:'Kiddush',role:'single'}},{row:1,col:2,spec:{kind:'cue',cueId:other.id,label:'Motzi',role:'single'}}]),'seed',1);

 const planned=await f.ok('supersede_cue',{old:oldCue.id,new:newCue.id,expectedVersion:oldCue.version});
 assert.equal(planned.dryRun,true);assert.match(planned.message,/Nothing was changed/);
 assert.equal(planned.services.length,1);assert.equal(planned.services[0].serviceId,created.serviceId);
 assert.equal(planned.services[0].entries.length,1);assert.equal(planned.services[0].coverage.length,1);assert.equal(planned.services[0].candidates.length,1);
 assert.deepEqual(planned.deck.buttons,[{page:2,pageName:'Friday evening',row:1,col:1,label:'Kiddush'}]);
 assert.equal((await f.deck.get('crc'))!.version,1,'the dry run changed nothing');assert.equal(isRetiredDraft((await f.repo.getDraft(oldCue.id))!),false);

 const applied=await f.ok('supersede_cue',{old:oldCue.id,new:newCue.id,expectedVersion:oldCue.version,dryRun:false});
 assert.equal(applied.complete,true,applied.message);assert.equal(applied.retire.ok,true);assert.equal(applied.liveCatalogChanged,true);
 const stored=(await f.services.listCollections(true)).find(item=>item.id===created.serviceId)!;
 const ids=JSON.stringify(stored);
 assert.equal(ids.includes(oldCue.id),false,'no entry, coverage decision or candidate points at the old graphic');
 assert.ok(stored.entries.some(entry=>entry.cueIds.includes(newCue.id)));assert.ok(stored.coverage.some(item=>item.cueId===newCue.id));
 assert.ok(stored.rows?.some(row=>row.candidateCueIds.includes(newCue.id)&&row.candidateCueIds.includes(other.id)));
 const deck=(await f.deck.get('crc'))!;assert.equal(deck.version,2);
 const keys=deck.deck.pages[0].buttons.map(button=>button.spec.kind==='cue'?[button.spec.cueId,button.spec.label]:null);
 assert.deepEqual(keys,[[newCue.id,'Kiddush'],[other.id,'Motzi']],'the key fires the new graphic and keeps its label');
 assert.equal(isRetiredDraft((await f.repo.getDraft(oldCue.id))!),true);
 const after=await f.ok('find_catalog_issues',{kinds:['retired_in_service','retired_on_deck']});
 assert.equal(after.total,0,JSON.stringify(after.issues));
});

test('supersede_cue refuses in a sentence, changing nothing',async()=>{
 const f=wired();
 const oldCue=await f.shipped('Aleinu (old)','Aleinu');const draft=await f.custom('Aleinu (new)','Aleinu, new');
 const unpublished=await f.call('supersede_cue',{old:oldCue.id,new:draft.id,expectedVersion:oldCue.version,dryRun:false});
 assert.equal(unpublished.isError,true);assert.match(unpublished.text,/is not a published graphic/);
 const stale=await f.call('supersede_cue',{old:oldCue.id,new:draft.id,expectedVersion:oldCue.version+1});
 assert.equal(stale.isError,true);assert.match(stale.text,/changed since you read it/);
 const same=await f.call('supersede_cue',{old:oldCue.id,new:oldCue.id,expectedVersion:oldCue.version});
 assert.equal(same.isError,true);assert.match(same.text,/the same graphic/);
 assert.equal(isRetiredDraft((await f.repo.getDraft(oldCue.id))!),false);
});
