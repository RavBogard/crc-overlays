import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import type {AccessMember} from '../lib/access';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {defaultReviewBoardRepository,type ReviewBoardContext} from '../lib/review-board';
import {reviewBoardGet,type PageBoard} from '../lib/review-board-http';

// Track T3: a draft made from a conversion row keeps the row's reference (what the old Singular slide
// said), and T4's review board shows it beside the graphic without the agent passing it again.
process.env.CRC_AUTHORING_REHEARSAL='1';
const AGENT='mcp:0a1b2c:member:member-7';
const authInfo=()=>({token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:AGENT}}) satisfies AuthInfo;
const SIMONE:AccessMember={id:'member-simone',email:'simone@example.org',name:'Rabbi Simone',role:'owner',enabled:true};
const passing:ServerFitRunner=async(_cue,options)=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test',...(options?.includePreviewImage?{previewImage:{mimeType:'image/jpeg' as const,dataBase64:Buffer.from('frame').toString('base64'),width:1920,height:1080}}:{})});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;

function wired(){
 const repo=new MemoryAuthoringRepository();
 const service=createAuthoringService(repo,{rehearsal:true,storage:'memory',label:null},undefined,async()=>undefined,passing);
 const handler=createAuthoringMcpHandler((operation,input,who)=>service.operation(operation,input,who));
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={})=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:{...args,workspace:'crc'}}})}),{authInfo:authInfo()});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:{text?:string}[]};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{} as Output};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output};
 };
 const deps={authorize:async()=>SIMONE,context:():ReviewBoardContext=>({authoring:repo,boards:defaultReviewBoardRepository()}),memberName:async()=>SIMONE.name};
 const page=async(boardId:string)=>(await (await reviewBoardGet(new Request(`https://crc.example/api/review-boards?board=${boardId}`),deps)).json()) as PageBoard;
 return {repo,call,page};
}

const REFERENCE={origin:'singular',app:'kab',comp:'Shalom Aleicheim 3',text:'Shalom Aleichem\nשָׁלוֹם עֲלֵיכֶם'};

test('a draft created with a conversion row\'s reference keeps it through edits, and the review board shows it beside the graphic',async()=>{
 const {repo,call,page}=wired();
 const created=await call('create_draft',{name:'Shalom Aleichem 3',title:'Shalom Aleichem',layout:'bottom',content:{mode:'custom',text:'Shalom aleichem malachei hashareit'},reference:REFERENCE});
 assert.equal(created.isError,false,created.text);
 const draftId=created.output.draft.id as string;
 assert.deepEqual((await repo.getDraft(draftId))!.reference,REFERENCE);
 const edited=await call('update_draft',{draftId,expectedVersion:1,patch:{title:'Shalom Aleichem (3)'}});
 assert.equal(edited.isError,false,edited.text);
 assert.deepEqual((await repo.getDraft(draftId))!.reference,REFERENCE,'an edit keeps the reference');
 const shipped=await call('ship_draft',{draftId,expectedVersion:2});
 assert.equal(shipped.output.shipped,true,shipped.text);
 const board=await call('create_review_board',{title:'TBI graphics',draftIds:[draftId],grouping:'none'});
 assert.equal(board.isError,false,board.text);
 const shown=await page(board.output.boardId);
 assert.deepEqual(shown.items[0].reference,{text:REFERENCE.text,imageUrl:null});
});

test('create_draft refuses a malformed or credential-carrying reference in a sentence, creating nothing',async()=>{
 const {repo,call}=wired();
 const noText=await call('create_draft',{name:'X',title:'X',layout:'bottom',content:{mode:'custom',text:'x'},reference:{origin:'singular'}});
 assert.equal(noText.isError,true);
 const link=await call('create_draft',{name:'Y',title:'Y',layout:'bottom',content:{mode:'custom',text:'y'},reference:{origin:'singular',text:'see https://app.singular.live/apiv1/control/abc'}});
 assert.equal(link.isError,true);
 assert.match(link.text,/reference looks like it carries a credential/);
 assert.equal((await repo.listDrafts()).length,0);
});
