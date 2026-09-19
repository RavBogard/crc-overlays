import assert from 'node:assert/strict';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {boundedMcpRequest,hasTrustedOrigin} from '../lib/mcp-http';

const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
const request=(body:unknown)=>new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify(body)});
async function payload(response:Response){const text=await response.text();if(response.headers.get('content-type')?.includes('application/json'))return JSON.parse(text);const data=text.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);assert.ok(data,'SSE response has a data event');return JSON.parse(data)}

test('MCP initializes over Streamable HTTP and exposes authoring tools without web review',async()=>{
 const calls:{operation:string;input:unknown;actor:string}[]=[];const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{calls.push({operation,input,actor});return {ok:true}});
 const initialized=await handler.fetch(request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}}),{authInfo});
 assert.equal(initialized.status,200);const initBody=await payload(initialized) as {result?:{serverInfo?:{name?:string}}};assert.equal(initBody.result?.serverInfo?.name,'CRC Overlay Authoring');
 const listed=await handler.fetch(request({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}),{authInfo});
 assert.equal(listed.status,200);const listBody=await payload(listed) as {result?:{tools?:{name:string}[]}};const names=listBody.result?.tools?.map(tool=>tool.name)??[];
 assert.ok(names.includes('list_templates'));assert.ok(names.includes('import_cue'));assert.ok(names.includes('publish_draft'));assert.ok(names.includes('review_draft'));assert.ok(!names.some(name=>name.includes('control')));
 assert.deepEqual(calls,[]);
});

test('MCP supports template discovery followed by a source-reference draft creation',async()=>{
 const calls:{operation:string;input:unknown}[]=[];const handler=createAuthoringMcpHandler(async(operation,input)=>{calls.push({operation,input});return operation==='list_templates'?{templates:[{id:'template-bottom',name:'Bottom',layout:'bottom',importable:true}]}:{draft:{id:'draft-1'}}});
 const list=await payload(await handler.fetch(request({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'list_templates',arguments:{}}}),{authInfo})) as {result:{content:{text:string}[]}};assert.match(list.result.content[0].text,/template-bottom/);
 const draft={name:'Prayer',title:'Prayer',layout:'bottom',templateCueId:'template-bottom',content:{mode:'bilingual',hebrewGroups:[{sourceId:'source',blockIds:['block']}],transliterationGroups:[{sourceId:'source',blockIds:['block']}]}};
 const created=await payload(await handler.fetch(request({jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'create_draft',arguments:draft}}),{authInfo})) as {result:{content:{text:string}[]}};assert.match(created.result.content[0].text,/draft-1/);assert.deepEqual(calls.map(call=>call.operation),['list_templates','create_draft']);
});

test('preview response gives clients an absolute web-review URL without exposing review as a tool',async()=>{
 const handler=createAuthoringMcpHandler(async()=>({previewId:'preview-1',draftVersion:2,previewPath:'/author?draft=draft-1'}));const response=await handler.fetch(request({jsonrpc:'2.0',id:7,method:'tools/call',params:{name:'preview_draft',arguments:{draftId:'draft-1',expectedVersion:2}}}),{authInfo});const body=await payload(response) as {result:{content:{text:string}[]}};const output=JSON.parse(body.result.content[0].text);assert.equal(output.previewUrl,'https://overlays.centralreform.org/author?draft=draft-1');
});

test('review_draft is exposed to MCP and accepts no measurement of its own',async()=>{
 // D18 - the tool exists so the attested path can be reached at all (without it publish_draft
 // answers 409 review_required forever), and its schema is strict with no `browserMeasurement`
 // field, so an MCP client can approve a preview but can never assert what a browser saw.
 const calls:{operation:string;input:unknown;actor:string}[]=[];const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{calls.push({operation,input,actor});return {review:{humanApproved:true}}});
 const listed=await payload(await handler.fetch(request({jsonrpc:'2.0',id:20,method:'tools/list',params:{}}),{authInfo})) as {result:{tools:{name:string;inputSchema:{properties:Record<string,unknown>}}[]}};
 const tool=listed.result.tools.find(entry=>entry.name==='review_draft');
 assert.ok(tool,'review_draft is registered');
 assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(),['draftId','expectedVersion','humanApproved','previewId']);
 const ok=await payload(await handler.fetch(request({jsonrpc:'2.0',id:21,method:'tools/call',params:{name:'review_draft',arguments:{draftId:'draft-1',expectedVersion:2,previewId:'preview-1',humanApproved:true}}}),{authInfo})) as {result:{content:{text:string}[]}};
 assert.match(ok.result.content[0].text,/humanApproved/);
 assert.deepEqual(calls,[{operation:'review_draft',input:{draftId:'draft-1',expectedVersion:2,previewId:'preview-1',humanApproved:true},actor:'mcp:test-actor'}]);
 await handler.fetch(request({jsonrpc:'2.0',id:22,method:'tools/call',params:{name:'review_draft',arguments:{draftId:'draft-1',expectedVersion:2,previewId:'preview-1',humanApproved:true,browserMeasurement:{viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'laptop/1',measuredAt:1}}}}),{authInfo});
 // A measurement a client tries to assert anyway is dropped against the published schema and
 // never reaches the authoring service - and even if it did, `isMcpActor` routes an `mcp:`
 // actor to the stored server fit check and ignores what was sent.
 assert.deepEqual(Object.keys(calls[1].input as object).sort(),['draftId','expectedVersion','humanApproved','previewId']);
});

test('MCP passes validated import input and authenticated actor to authoring service',async()=>{
 const calls:{operation:string;input:unknown;actor:string}[]=[];const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{calls.push({operation,input,actor});return {draftId:'cue-1'}});
 const response=await handler.fetch(request({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'import_cue',arguments:{cueId:'cue-1'}}}),{authInfo});
 assert.equal(response.status,200);const body=await payload(response) as {result?:{content?:{text:string}[]}};assert.match(body.result?.content?.[0]?.text??'',/cue-1/);assert.deepEqual(calls,[{operation:'import_cue',input:{cueId:'cue-1'},actor:'mcp:test-actor'}]);
});

test('MCP rejects plaintext and mismatched bilingual source coverage before backend call',async()=>{
 let calls=0;const handler=createAuthoringMcpHandler(async()=>{calls++;return {}});const base={name:'Prayer',title:'Title',layout:'bottom',templateCueId:'template',content:{mode:'bilingual',hebrewGroups:[{sourceId:'source',blockIds:['a']}],transliterationGroups:[{sourceId:'source',blockIds:['b']}]}};
 const response=await handler.fetch(request({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'create_draft',arguments:{...base,text:'forbidden'}}}),{authInfo});
 const body=await payload(response) as {error?:unknown,result?:{isError?:boolean}};assert.ok(body.error||body.result?.isError);assert.equal(calls,0);
});

test('MCP HTTP guard rejects foreign browser origins and bounds chunked bodies',async()=>{
 assert.equal(hasTrustedOrigin(new Request('http://localhost:5175/api/mcp',{headers:{origin:'http://localhost:5175'}})),true);
 assert.equal(hasTrustedOrigin(new Request('http://localhost:5175/api/mcp',{headers:{origin:'https://attacker.example'}})),false);
 const oversized=new Request('http://localhost:5175/api/mcp',{method:'POST',body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1024*1024+1));controller.close()}}),duplex:'half'} as RequestInit&{duplex:'half'});
 await assert.rejects(()=>boundedMcpRequest(oversized),/request_too_large/);
});


test('MCP accepts the canonical presentation fields and still rejects values outside them',async()=>{
 const calls:{operation:string;input:unknown}[]=[];const handler=createAuthoringMcpHandler(async(operation,input)=>{calls.push({operation,input});return {draft:{id:'draft-1'}}});
 const presentation={hebrewFontSize:40,transliterationFontSize:32,titleFontSize:30,alignment:'center',lineSpacing:'spacious',imageAssetId:`asset_${'a'.repeat(64)}`};
 const draft={name:'Prayer',title:'Prayer',layout:'bottom',templateCueId:'template-bottom',content:{mode:'bilingual',hebrewGroups:[{sourceId:'source',blockIds:['block']}],transliterationGroups:[{sourceId:'source',blockIds:['block']}]},presentation};
 const created=await payload(await handler.fetch(request({jsonrpc:'2.0',id:20,method:'tools/call',params:{name:'create_draft',arguments:draft}}),{authInfo})) as {result:{content:{text:string}[]}};
 assert.match(created.result.content[0].text,/draft-1/);
 assert.deepEqual((calls[0].input as {presentation:unknown}).presentation,presentation);
 const patched=await payload(await handler.fetch(request({jsonrpc:'2.0',id:21,method:'tools/call',params:{name:'update_draft',arguments:{draftId:'draft-1',expectedVersion:1,patch:{presentation}}}}),{authInfo})) as {result:{content:{text:string}[]}};
 assert.match(patched.result.content[0].text,/draft-1/);
 assert.deepEqual(calls.map(call=>call.operation),['create_draft','update_draft']);
 for(const invalid of [{alignment:'right'},{lineSpacing:'roomy'},{imageAssetId:'not-an-asset'},{imageAssetUrl:'https://example.test/image.png'}]){
  const rejected=await payload(await handler.fetch(request({jsonrpc:'2.0',id:22,method:'tools/call',params:{name:'create_draft',arguments:{...draft,presentation:invalid}}}),{authInfo})) as {error?:unknown;result?:{isError?:boolean}};
  assert.ok(rejected.error||rejected.result?.isError,`${JSON.stringify(invalid)} is refused before the backend call`);
 }
 assert.equal(calls.length,2);
});

test('MCP exposes fit_check_draft as a writing tool and passes its exact input through',async()=>{
 const calls:{operation:string;input:unknown;actor:string}[]=[];const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{calls.push({operation,input,actor});return {verdict:'pass',fitErrors:[],warnings:[],fill:0.5,measuredAt:1,rendererVersion:'server-chromium/1.63.0',message:'Checked in a browser on the server — no fit problems found.'}});
 const listed=await payload(await handler.fetch(request({jsonrpc:'2.0',id:30,method:'tools/list',params:{}}),{authInfo})) as {result?:{tools?:{name:string;annotations?:{readOnlyHint?:boolean}}[]}};
 const tool=listed.result?.tools?.find(entry=>entry.name==='fit_check_draft');
 assert.ok(tool,'fit_check_draft is offered to MCP clients');
 assert.equal(tool?.annotations?.readOnlyHint,false,'it writes the measurement onto the preview');
 const called=await payload(await handler.fetch(request({jsonrpc:'2.0',id:31,method:'tools/call',params:{name:'fit_check_draft',arguments:{draftId:'draft-1',expectedVersion:2,previewId:'preview-1'}}}),{authInfo})) as {result:{content:{text:string}[]}};
 assert.match(called.result.content[0].text,/server-chromium/);
 assert.deepEqual(calls,[{operation:'fit_check_draft',input:{draftId:'draft-1',expectedVersion:2,previewId:'preview-1'},actor:'mcp:test-actor'}]);
 // The tool takes only the three identifiers: there is no place for a caller to assert a
 // measurement here, and none in `review_draft` either.
 assert.deepEqual(Object.keys((calls[0].input as object)).sort(),['draftId','expectedVersion','previewId']);
});

test('MCP offers prepare_service_from_setlist as a writing tool and routes its parsed input to authoring',async()=>{
 const calls:{operation:string;input:unknown;actor:string}[]=[];
 const handler=createAuthoringMcpHandler(async(operation,input,actor)=>{calls.push({operation,input,actor});return {collection:{id:'collection-1',name:'Shabbat Evening'},unmatched:[]}});
 const listed=await payload(await handler.fetch(request({jsonrpc:'2.0',id:40,method:'tools/list',params:{}}),{authInfo})) as {result?:{tools?:{name:string;description?:string;annotations?:{readOnlyHint?:boolean}}[]}};
 const tool=listed.result?.tools?.find(entry=>entry.name==='prepare_service_from_setlist');
 assert.ok(tool,'prepare_service_from_setlist is offered to MCP clients');
 assert.equal(tool?.annotations?.readOnlyHint,false,'it writes a prepared service');
 assert.match(tool?.description??'',/never publishes/,'the description says it never publishes');
 assert.match(tool?.description??'',/centralreform\.live/);
 const called=await payload(await handler.fetch(request({jsonrpc:'2.0',id:41,method:'tools/call',params:{name:'prepare_service_from_setlist',arguments:{setlistId:'setlist-covered',name:'Friday night'}}}),{authInfo})) as {result:{content:{text:string}[]}};
 assert.match(called.result.content[0].text,/collection-1/);
 assert.deepEqual(calls,[{operation:'prepare_service_from_setlist',input:{setlistId:'setlist-covered',name:'Friday night'},actor:'mcp:test-actor'}]);
 // A missing setlistId is refused before the backend is reached, and no `publish`-shaped field
 // exists for a caller to set: the tool takes one id and two optional labels.
 const rejected=await payload(await handler.fetch(request({jsonrpc:'2.0',id:42,method:'tools/call',params:{name:'prepare_service_from_setlist',arguments:{name:'Friday night'}}}),{authInfo})) as {error?:unknown;result?:{isError?:boolean}};
 assert.ok(rejected.error||rejected.result?.isError);
 assert.equal(calls.length,1);
});

test('MCP offers get_service_history as a read-only tool bounded to graphics and positions',async()=>{
 const calls:{operation:string;input:unknown}[]=[];
 const rows=[{seq:1,at:1_800_000_000_000,action:'in',cueId:'cue-a',unitId:'barechu.evening',momentId:'barechu',book:'mishkan-tfilah',folio:146,source:'control',serviceRef:null}];
 const handler=createAuthoringMcpHandler(async(operation,input)=>{calls.push({operation,input});return {workspace:'crc',rows,nextAfter:null}});
 const listed=await payload(await handler.fetch(request({jsonrpc:'2.0',id:50,method:'tools/list',params:{}}),{authInfo})) as {result?:{tools?:{name:string;description?:string;annotations?:{readOnlyHint?:boolean}}[]}};
 const tool=listed.result?.tools?.find(entry=>entry.name==='get_service_history');
 assert.ok(tool,'get_service_history is offered to MCP clients');
 assert.equal(tool?.annotations?.readOnlyHint,true,'reading the log changes nothing');
 assert.match(tool?.description??'',/never puts anything on screen/);
 assert.match(tool?.description??'',/nobody's identity/);
 const called=await payload(await handler.fetch(request({jsonrpc:'2.0',id:51,method:'tools/call',params:{name:'get_service_history',arguments:{since:1_800_000_000_000}}}),{authInfo})) as {result:{content:{text:string}[]}};
 assert.match(called.result.content[0].text,/barechu\.evening/);
 assert.deepEqual(calls,[{operation:'get_service_history',input:{since:1_800_000_000_000}}]);
 const rejected=await payload(await handler.fetch(request({jsonrpc:'2.0',id:52,method:'tools/call',params:{name:'get_service_history',arguments:{since:-1}}}),{authInfo})) as {error?:unknown;result?:{isError?:boolean}};
 assert.ok(rejected.error||rejected.result?.isError,'a time before the epoch is refused');
 assert.equal(calls.length,1);
});
