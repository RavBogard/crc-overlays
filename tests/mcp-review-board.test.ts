import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import type {AccessMember} from '../lib/access';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {MemoryReviewBoardRepository,NOT_IN_SERVICE,NOT_ON_DECK,OTHER_GRAPHICS,deckLookupFromDeck,deckPlacements,defaultReviewBoardRepository,reviewBoardOperation,type ReviewBoardContext} from '../lib/review-board';
import {reviewBoardGet,reviewBoardPost,type PageBoard,type PageItem} from '../lib/review-board-http';
import {earlierLine,groupsOf,progressLine,tally} from '../app/author/review/review-model';

// Packet T4: the review board, through the real MCP handler into the real in-memory authoring
// service (the dispatch in lib/authoring.ts included) and through the board API the page calls.
// Rehearsal storage puts the boards in memory, which is how the dispatch finds them here.
process.env.CRC_AUTHORING_REHEARSAL='1';
const AGENT='mcp:0a1b2c:member:member-7';
const authInfo=(scopes=['crc.authoring'])=>({token:'test',clientId:'client',scopes,expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:AGENT}}) satisfies AuthInfo;
const FRAME=(label:string)=>({mimeType:'image/jpeg' as const,dataBase64:Buffer.from(`frame:${label}`).toString('base64'),width:1920,height:1080});
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output};
const SIMONE:AccessMember={id:'member-simone',email:'simone@example.org',name:'Rabbi Simone',role:'owner',enabled:true};

let frames=0;
const passing:ServerFitRunner=async(_cue,options)=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test',...(options?.includePreviewImage?{previewImage:FRAME(String(++frames))}:{})});

function wired(member:AccessMember|null=SIMONE){
 const repo=new MemoryAuthoringRepository();
 const service=createAuthoringService(repo,{rehearsal:true,storage:'memory',label:null},undefined,async()=>undefined,passing);
 const handler=createAuthoringMcpHandler((operation,input,who)=>service.operation(operation,input,who));
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={},workspace:string|null='crc',scopes?:string[]):Promise<Called>=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:workspace===null?args:{...args,workspace}}})}),{authInfo:authInfo(scopes)});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:{text?:string}[]};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{}};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output};
 };
 const deps={authorize:async()=>member,context:():ReviewBoardContext=>({authoring:repo,boards:defaultReviewBoardRepository()}),memberName:async(memberId:string)=>memberId===SIMONE.id?SIMONE.name:null};
 const page=async(boardId:string)=>{const response=await reviewBoardGet(new Request(`https://crc.example/api/review-boards?board=${boardId}`),deps);return {status:response.status,body:await response.json() as PageBoard}};
 const answer=async(boardId:string,item:PageItem,decision:'approve'|'needs-change'|null,note='')=>{const response=await reviewBoardPost(new Request('https://crc.example/api/review-boards',{method:'POST',headers:{'content-type':'application/json',origin:'https://crc.example'},body:JSON.stringify({board:boardId,item:item.key,decision,note,revision:item.revision})}),deps);return {status:response.status,body:await response.json() as {item:PageItem;error?:string}}};
 const ship=async(name:string,text:string)=>{const created=await call('create_draft',{name,title:name,layout:'bottom',content:{mode:'custom',text}});assert.equal(created.isError,false,created.text);const shipped=await call('ship_draft',{draftId:created.output.draft.id,expectedVersion:1});assert.equal(shipped.output.shipped,true,shipped.text);return created.output.draft.id as string};
 return {repo,service,call,deps,page,answer,ship};
}

test('acceptance: a reviewer marks 20 graphics on the page and the agent reads every answer back',async()=>{
 const {call,page,answer,ship}=wired();
 const ids:string[]=[];for(let index=1;index<=20;index++)ids.push(await ship(`Prayer ${index}`,`Text of prayer ${index}`));
 const created=await call('create_review_board',{title:'TBI graphics for Rabbi Schicker',draftIds:ids,grouping:'none',references:{[ids[0]]:{origin:'singular',app:'kab',comp:'Barchu 1',text:'Barchu et Adonai ham\'vorach'}}});
 assert.equal(created.isError,false,created.text);
 const boardId=created.output.boardId as string;
 assert.match(created.output.url,new RegExp(`/author/review/${boardId}$`));
 assert.deepEqual(created.output.counts,{items:20,approved:0,needsChange:0,undecided:20,updatedSinceAnswered:0,withoutPicture:0});
 assert.equal(created.output.workspaceId,'crc');assert.match(created.output.message,/signed in/);

 const shown=await page(boardId);
 assert.equal(shown.status,200);assert.equal(shown.body.title,'TBI graphics for Rabbi Schicker');
 assert.deepEqual(shown.body.items.map(item=>item.name),ids.map((_,index)=>`Prayer ${index+1}`),'the order the agent gave');
 assert.ok(shown.body.items.every(item=>item.image&&item.image.url.startsWith(`/api/review-boards?board=${boardId}&image=`)),'every graphic shows its kept frame');
 assert.deepEqual(shown.body.items[0].reference,{text:'Barchu et Adonai ham\'vorach',imageUrl:null});
 // The page carries no draft ids: a reviewer never sees one.
 assert.doesNotMatch(JSON.stringify(shown.body),new RegExp(ids[3]));

 for(const [index,item] of shown.body.items.entries()){
  const saved=await answer(boardId,item,index%4===3?'needs-change':'approve',index%4===3?`Fix number ${index+1}`:'');
  assert.equal(saved.status,200,saved.body.error);assert.equal(saved.body.item.answeredBy,'Rabbi Simone');
 }
 const read=await call('get_review_board',{boardId},null);
 assert.equal(read.isError,false,read.text);
 assert.deepEqual(read.output.counts,{items:20,approved:15,needsChange:5,undecided:0,updatedSinceAnswered:0,withoutPicture:0});
 assert.deepEqual(read.output.items.filter((item:Output)=>item.decision==='needs-change').map((item:Output)=>[item.draftId,item.note]),[3,7,11,15,19].map(index=>[ids[index],`Fix number ${index+1}`]));
 assert.ok(read.output.items.every((item:Output)=>item.decidedBy===SIMONE.id&&item.decidedRevision===1&&item.currentRevision===1));
 const flagged=await call('get_review_board',{boardId,filter:'needs-change'},null);
 assert.equal(flagged.output.items.length,5);
 assert.equal(progressLine(tally((await page(boardId)).body.items)),'20 of 20 answered · 5 need a change');
});

test('a republished fix shows as updated: undecided again, the earlier answer kept beside it',async()=>{
 const {call,page,answer,ship}=wired();
 const ids=[await ship('Shalom Rav','Shalom rav al Yisrael'),await ship('Aleinu','Aleinu l\'shabeiach')];
 const boardId=(await call('create_review_board',{title:'Friday',draftIds:ids})).output.boardId as string;
 const [first,second]=(await page(boardId)).body.items;
 await answer(boardId,first,'needs-change','Make the Hebrew bigger');
 await answer(boardId,second,'approve');
 const before=(await page(boardId)).body.items[0].image!.url;

 // The agent fixes it and republishes; nothing on the board is touched.
 const current=(await call('get_draft',{draftId:ids[0]},null)).output.draft.version as number;
 const edited=await call('update_draft',{draftId:ids[0],expectedVersion:current,patch:{content:{mode:'custom',text:'Shalom rav al Yisrael amcha'}}});
 assert.equal(edited.isError,false,edited.text);
 const reshipped=await call('ship_draft',{draftId:ids[0],expectedVersion:edited.output.draft.version});
 assert.equal(reshipped.output.shipped,true,reshipped.text);

 const read=await call('get_review_board',{boardId},null);
 const fixed=read.output.items.find((item:Output)=>item.draftId===ids[0]);
 assert.deepEqual([fixed.decision,fixed.updated,fixed.currentRevision,fixed.earlier.decision,fixed.earlier.note,fixed.earlier.revision],[null,true,2,'needs-change','Make the Hebrew bigger',1]);
 assert.equal(read.output.items.find((item:Output)=>item.draftId===ids[1]).updated,undefined,'the other graphic is untouched');
 assert.deepEqual([read.output.counts.updatedSinceAnswered,read.output.counts.undecided,read.output.counts.approved],[1,1,1]);
 assert.equal((await call('get_review_board',{boardId,filter:'updated'},null)).output.items.length,1);

 const shown=(await page(boardId)).body.items[0];
 assert.deepEqual([shown.updated,shown.decision,shown.revision],[true,null,2]);
 assert.notEqual(shown.image!.url,before,'the board shows the new frame');
 assert.equal(earlierLine(shown.earlier!),'Earlier answer from Rabbi Simone: Needs change. “Make the Hebrew bigger”');

 // The reviewer looks again and approves: no longer updated, the earlier answer stays on record.
 const again=await answer(boardId,shown,'approve');
 assert.deepEqual([again.body.item.updated,again.body.item.decision],[false,'approve']);
 const settled=(await call('get_review_board',{boardId},null)).output.items[0];
 assert.deepEqual([settled.decision,settled.decidedRevision,settled.updated],['approve',2,undefined]);
});

test('the image route serves only frames on that board; signed-out people, devices and keys are refused',async()=>{
 const {call,page,deps,ship,repo}=wired();
 const onBoard=await ship('Kiddush','Kiddush follows'),offBoard=await ship('Private','Not on the board');
 const boardId=(await call('create_review_board',{title:'One',draftIds:[onBoard]})).output.boardId as string;
 const url=(await page(boardId)).body.items[0].image!.url;
 const served=await reviewBoardGet(new Request(`https://crc.example${url}`),deps);
 assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/jpeg');
 assert.match(Buffer.from(await served.arrayBuffer()).toString(),/^frame:/);
 const otherPreview=(await repo.revisions(offBoard))[0].previewId!;
 assert.equal((await reviewBoardGet(new Request(`https://crc.example/api/review-boards?board=${boardId}&image=${otherPreview}`),deps)).status,404,'a preview that is not on the board is not served');
 assert.equal((await reviewBoardGet(new Request('https://crc.example/api/review-boards?board=board_AAAAAAAAAAAAAAAA'),deps)).status,404);
 for(const member of [null,{...SIMONE,id:'device:abc'},{...SIMONE,id:'legacy-control'}]){
  const refused={...deps,authorize:async()=>member};
  assert.equal((await reviewBoardGet(new Request(`https://crc.example/api/review-boards?board=${boardId}`),refused)).status,401);
  assert.equal((await reviewBoardPost(new Request('https://crc.example/api/review-boards',{method:'POST',body:'{}'}),refused)).status,401);
 }
 const bad=await reviewBoardPost(new Request('https://crc.example/api/review-boards',{method:'POST',body:JSON.stringify({board:boardId,item:'nope',decision:'approve',note:'',revision:1})}),deps);
 assert.equal(bad.status,404);assert.match((await bad.json() as {error:string}).error,/no longer on this board/);
 const item=(await page(boardId)).body.items[0];
 const long=await reviewBoardPost(new Request('https://crc.example/api/review-boards',{method:'POST',body:JSON.stringify({board:boardId,item:item.key,decision:'maybe',note:'',revision:1})}),deps);
 assert.equal(long.status,400);
});

test('an unpublished draft is shown without a picture and the agent is warned',async()=>{
 const {call,page}=wired();
 const draft=await call('create_draft',{name:'Draft only',title:'Draft only',layout:'bottom',content:{mode:'custom',text:'Not yet'}});
 const created=await call('create_review_board',{title:'Drafts',draftIds:[draft.output.draft.id]});
 assert.equal(created.isError,false,created.text);assert.match(created.output.warnings[0],/not published yet/);
 const [item]=(await page(created.output.boardId)).body.items;
 assert.deepEqual([item.image,item.available],[null,false]);
 assert.equal((await call('create_review_board',{title:'Bad',draftIds:['draft_missing']})).isError,true);
});

test('grouping by deck page: refused until a deck is stored, groupLabels meanwhile, the stored deck once C3 provides it',async()=>{
 const {call,repo,ship}=wired();
 const ids=[await ship('Barchu','Barchu'),await ship('Shema','Shema'),await ship('Kaddish','Kaddish')];
 const refused=await call('create_review_board',{title:'Deck',draftIds:ids,grouping:'deck-page'});
 assert.equal(refused.isError,true);assert.match(refused.text,/No Companion deck is stored.*groupLabels/);

 const labelled=await call('create_review_board',{title:'Deck',draftIds:ids,grouping:'deck-page',groupLabels:{[ids[2]]:'Page 3: Shabbat morning',[ids[0]]:'Page 1: Friday evening'}});
 assert.equal(labelled.isError,false,labelled.text);
 const read=await call('get_review_board',{boardId:labelled.output.boardId},null);
 assert.deepEqual(read.output.items.map((item:Output)=>[item.name,item.group]),[['Barchu','Page 1: Friday evening'],['Kaddish','Page 3: Shabbat morning'],['Shema',OTHER_GRAPHICS]]);

 const deck={pages:[
  {number:4,id:'p4',name:'Shabbat morning',template:'service',buttons:[{row:1,col:2,spec:{kind:'cue' as const,cueId:ids[1],label:'Shema',role:'single' as const}}]},
  {number:2,id:'p2',name:'Friday evening',template:'service',buttons:[{row:2,col:1,spec:{kind:'cue' as const,cueId:ids[1],label:'Shema',role:'single' as const}},{row:0,col:3,spec:{kind:'cue' as const,cueId:ids[0],label:'Barchu',role:'single' as const}},{row:0,col:0,spec:{kind:'builtin' as const,control:'pageup' as const}}]},
 ]};
 assert.deepEqual([...deckPlacements(deck)].map(([cue,spot])=>[cue,spot.page,spot.row,spot.col]),[[ids[0],2,0,3],[ids[1],2,2,1]],'lowest page first, then row and column');
 const boards=new MemoryReviewBoardRepository(),ctx:ReviewBoardContext={authoring:repo,boards,deck:deckLookupFromDeck(deck),origin:'https://tbi.example'};
 const board=await reviewBoardOperation('create_review_board',{title:'Deck',draftIds:[ids[2],ids[1],ids[0]],grouping:'deck-page'},AGENT,ctx) as Output;
 const grouped=await reviewBoardOperation('get_review_board',{boardId:board.boardId},AGENT,ctx) as Output;
 assert.deepEqual(grouped.items.map((item:Output)=>[item.name,item.group]),[['Barchu','Page 2: Friday evening'],['Shema','Page 2: Friday evening'],['Kaddish',NOT_ON_DECK]]);
 assert.equal(board.url,`https://tbi.example/author/review/${board.boardId}`);
});

test('grouping by prepared service follows each service\'s row order',async()=>{
 const {repo,ship}=wired();
 const ids=[await ship('Lecha Dodi','Lecha dodi'),await ship('Mourners','We remember'),await ship('Notice','Kiddush')];
 const services=async()=>new Map([[ids[1],{serviceName:'Friday evening',serviceOrder:0,row:5}],[ids[0],{serviceName:'Friday evening',serviceOrder:0,row:2}]]);
 const ctx:ReviewBoardContext={authoring:repo,boards:new MemoryReviewBoardRepository(),services};
 const board=await reviewBoardOperation('create_review_board',{title:'By service',draftIds:ids,grouping:'service'},AGENT,ctx) as Output;
 assert.deepEqual(board.groups,[{group:'Friday evening',count:2},{group:NOT_IN_SERVICE,count:1}]);
 const read=await reviewBoardOperation('get_review_board',{boardId:board.boardId},AGENT,ctx) as Output;
 assert.deepEqual(read.items.map((item:Output)=>item.name),['Lecha Dodi','Mourners','Notice']);
 assert.deepEqual(groupsOf([{group:'A'},{group:'A'},{group:'B'}] as PageItem[]).map(group=>[group.heading,group.items.length]),[['A',2],['B',1]]);
});

test('update_review_board adds and removes with the version, and keeps a reviewer\'s answer unless told to drop it',async()=>{
 const {call,page,answer,ship}=wired();
 const ids=[await ship('One','One'),await ship('Two','Two'),await ship('Three','Three')];
 const boardId=(await call('create_review_board',{title:'Set',draftIds:ids.slice(0,2)})).output.boardId as string;
 await answer(boardId,(await page(boardId)).body.items[0],'needs-change','Wrong prayer');
 const unnamed=await call('update_review_board',{boardId,expectedVersion:1,add:[ids[2]]},null);
 assert.equal(unnamed.isError,true,`a change names its congregation: ${unnamed.text}`);
 const added=await call('update_review_board',{boardId,expectedVersion:1,add:[ids[2]],title:'Set, round two'});
 assert.equal(added.isError,false,added.text);assert.deepEqual([added.output.version,added.output.added,added.output.counts.items,added.output.title],[2,1,3,'Set, round two']);
 const stale=await call('update_review_board',{boardId,expectedVersion:1,remove:[ids[1]]});
 assert.equal(stale.isError,true);assert.match(stale.text,/version 2, not 1/);
 const held=await call('update_review_board',{boardId,expectedVersion:2,remove:[ids[0],ids[1]]});
 assert.deepEqual([held.isError,held.output.changed,held.output.answeredItems],[false,false,[{draftId:ids[0],decision:'needs-change',note:'Wrong prayer'}]]);
 assert.equal((await call('get_review_board',{boardId},null)).output.counts.items,3,'nothing was removed');
 const dropped=await call('update_review_board',{boardId,expectedVersion:2,remove:[ids[0],ids[1]],dropAnswers:true});
 assert.deepEqual([dropped.output.changed,dropped.output.removed,dropped.output.version],[true,2,3]);
 const left=await call('get_review_board',{boardId},null);
 assert.deepEqual(left.output.items.map((item:Output)=>item.name),['Three']);
 assert.equal((await call('update_review_board',{boardId,expectedVersion:3,add:[ids[2]]})).isError,true,'already on the board');
 // Re-adding a removed graphic starts fresh: its old answer went with it.
 await call('update_review_board',{boardId,expectedVersion:3,add:[ids[0]]});
 assert.equal((await call('get_review_board',{boardId},null)).output.items.find((item:Output)=>item.draftId===ids[0]).decision,null);
});

test('review tools need the authoring scope',async()=>{
 const {call}=wired();
 const refused=await call('get_review_board',{boardId:'board_AAAAAAAAAAAAAAAA'},null,['crc.live']);
 assert.equal(refused.isError,true);assert.match(refused.text,/insufficient_scope/);
 const missing=await call('get_review_board',{boardId:'board_AAAAAAAAAAAAAAAA'},null);
 assert.equal(missing.isError,true);assert.match(missing.text,/no review board/);
});
