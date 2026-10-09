import test from 'node:test';
import assert from 'node:assert/strict';
import baseline from '../lib/cues.json';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {isLayoutId,layoutChoices,layoutIds,registerLayout,unregisterLayout} from '../lib/layout-registry.ts';
import {layoutLabel,templateLayoutFor} from '../lib/layout-label.ts';
import {templateLooks,type TemplateLookSummary} from '../lib/template-looks.ts';
import {parseEditable,type Draft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring.ts';
import {createAuthoringMcpHandler} from '../lib/mcp';
import type {Cue} from '../lib/player.ts';

const bottomTemplate=(baseline as unknown as Cue[]).find(cue=>cue.layout==='bottom'&&!cue.hidden)!;
const editable=(layout:string)=>({name:'Response',title:'Response',layout,templateCueId:bottomTemplate.id,content:{mode:'custom',text:'Amen'},presentation:{}});
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
const rpc=(body:unknown)=>new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify(body)});
async function payload(response:Response){const text=await response.text();return JSON.parse(response.headers.get('content-type')?.includes('application/json')?text:text.split(/\r?\n/).find(line=>line.startsWith('data: '))!.slice(6))}

test('the built-in layouts keep their order, names and borrowed templates',()=>{
 assert.deepEqual(layoutIds(),['bottom','left','right','corner','nameplate']);
 assert.equal(layoutChoices(),'bottom, left, right, corner, or nameplate');
 assert.deepEqual(layoutIds().map(layoutLabel),['Lower third','Left panel','Right panel','Corner','Name plate']);
 assert.deepEqual(layoutIds().map(templateLayoutFor),['bottom','left','right','bottom','bottom']);
 assert.equal(layoutLabel('middle'),'Overlay');assert.equal(isLayoutId('middle'),false);
 assert.throws(()=>unregisterLayout('corner'),/built in/);
});

test('registering a layout is the only step validation needs to accept it',async()=>{
 const id='fixture-top';
 assert.throws(()=>parseEditable(editable(id)),/layout must be bottom, left, right, corner, or nameplate/,'unknown before it is registered');
 registerLayout({id,label:'Top card',templateLayout:'bottom',contained:true,capabilities:{sets:false,translation:false,oneBlockPerSlide:true}});
 try{
  assert.equal(parseEditable(editable(id)).layout,id,'the draft model accepts it');
  assert.equal(layoutChoices(),'bottom, left, right, corner, nameplate, or fixture-top');
  const service=createAuthoringService(new MemoryAuthoringRepository());
  const created=await service.operation('create_draft',editable(id),'tester') as {draft:Draft};
  assert.equal(created.draft.layout,id,'the authoring service creates it');
  const listed=await service.operation('list_drafts',{compact:true,layout:id},'tester') as {drafts:{layout:string}[]};
  assert.deepEqual(listed.drafts.map(row=>row.layout),[id]);
  const summaries:TemplateLookSummary[]=[{id:bottomTemplate.id,layout:'bottom',importable:true}];
  assert.deepEqual(templateLooks(summaries,'custom').map(look=>look.layout),['bottom','corner','nameplate',id],'the editor offers a look tile for it');
  const calls:string[]=[];const handler=createAuthoringMcpHandler(async(operation,input)=>{calls.push(`${operation}:${(input as {layout?:string}).layout}`);return {draft:{id:'draft-1'}}});
  const listedTools=await payload(await handler.fetch(rpc({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}),{authInfo})) as {result:{tools:{name:string;inputSchema:{properties:{layout?:{enum?:string[]}}}}[]}};
  assert.deepEqual(listedTools.result.tools.find(tool=>tool.name==='create_draft')?.inputSchema.properties.layout?.enum,['left','bottom','right','corner','nameplate',id],'MCP offers it');
  const called=await payload(await handler.fetch(rpc({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'create_draft',arguments:{...editable(id),workspace:'crc'}}}),{authInfo})) as {result:{isError?:boolean}};
  assert.notEqual(called.result.isError,true);assert.deepEqual(calls,[`create_draft:${id}`]);
 }finally{unregisterLayout(id)}
 assert.equal(isLayoutId(id),false);
});
