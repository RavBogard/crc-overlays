import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp.ts';
import {createLiveOperation,deckGuard,type LiveDeps} from '../lib/mcp/live.ts';
import {runMcpCommand,type LiveCommandAnswer,type LiveCommandBody} from '../lib/live-command.ts';
import {panelNeighbour,parsePanelName as webParse} from '../lib/panel-navigation.ts';
import {catalog,snapshot} from '../lib/server.ts';
import {deckGuardMinutes} from '../lib/workspace.ts';
import {startRehearsalRelay,type RehearsalRelay} from '../scripts/rehearsal-relay.ts';

// V3: the MCP live tools. Unit cases run against a stubbed command core and state; the last cases
// run the real core (runMcpCommand, snapshot, catalog) against the in-process rehearsal relay.
// Tool results are read as loose JSON; each assertion names the field it checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose=any;
const CONTROLLER='mcp-0123456789abcdef0123456789abcdef01234567';
const auth=(scopes:string[])=>({token:'test',clientId:'client',scopes,expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:0123:member:m',liveController:CONTROLLER}}) satisfies AuthInfo;
const LIVE=auth(['crc.live']);
const call=(name:string,args:Record<string,unknown>={})=>new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{workspace:'crc',target:'live',...args}}})});
async function payload(response:Response):Promise<unknown>{const text=await response.text();if(response.headers.get('content-type')?.includes('application/json'))return JSON.parse(text);const data=text.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);assert.ok(data,'SSE response has a data event');return JSON.parse(data)}
type Answer={isError:boolean;text:string;value:Record<string,Loose>};
async function tool(handler:ReturnType<typeof createAuthoringMcpHandler>,name:string,args:Record<string,unknown>={},info:AuthInfo=LIVE):Promise<Answer>{
 const body=await payload(await handler.fetch(call(name,args),{authInfo:info})) as {result?:{isError?:boolean;content:{text:string}[]};error?:{message:string}};
 if(!body.result)return {isError:true,text:body.error?.message??'',value:{}};
 const text=body.result.content[0].text;let value:Record<string,Loose>={};try{value=JSON.parse(text)}catch{/* a refusal sentence */}
 return {isError:body.result.isError===true,text,value};
}

const CUES=[{id:'barechu',name:'Barechu'},{id:'shema-1',name:'Shema — 01 of 03'},{id:'shema-2',name:'Shema — 02 of 03'},{id:'shema-3',name:'Shema — 03 of 03'},{id:'old-alias',name:'Old',hidden:true,aliasOf:'barechu'}];
type Fake={sent:Omit<LiveCommandBody,'clientId'|'sequence'>[];state:Record<string,Loose>;logs:string[];deps:LiveDeps};
function fake(overrides:Partial<LiveDeps>={},initial:Record<string,Loose>={}):Fake{
 let clock=10_000_000;
 const state:Record<string,Loose>={revision:4,cue:null,mode:'animate',updated:1,cuePayload:null,catalogVersion:'v1',renderers:[],controllers:[],serverTime:clock,lastPress:{control:null,companion:null,mcp:null},...initial};
 const sent:Fake['sent']=[],logs:string[]=[];
 const deps:LiveDeps={
  command:async body=>{sent.push(body);state.revision+=1;if(body.action==='in'){state.cue=body.cue;state.cuePayload=CUES.find(cue=>cue.id===body.cue)??null}else if(body.action==='clear'||body.action==='cut'||(body.action==='out'&&body.cue===state.cue)){state.cue=null;state.cuePayload=null}if(body.action==='cut'){delete state.bug;delete state.logo}if(body.action==='logo')state.logo=(body.logo as {on:boolean}).on?{on:true}:undefined;state.renderers=[];state.lastPress={...state.lastPress,mcp:clock};return {status:200,body:{commandId:body.commandId,...state},outcome:'applied',originalOutcome:null,lastPress:state.lastPress} satisfies LiveCommandAnswer},
  state:async()=>({...state,serverTime:clock}),
  catalog:async()=>({cues:CUES}),
  guardMinutes:()=>5,
  now:()=>clock,
  // A graphics browser that settles on whatever is requested at the first poll.
  sleep:async ms=>{clock+=ms;state.renderers=[{id:'output',revision:state.revision,cue:state.cue,phase:'settled',seen:clock}]},
  log:line=>logs.push(line),
  ...overrides,
 };
 return {sent,state,logs,deps};
}
const handlerFor=(deps:LiveDeps)=>createAuthoringMcpHandler(async()=>{throw Error('authoring must not run')},undefined,[],createLiveOperation(deps));

test('a live-only token reaches the live tools and an authoring-only token does not',async()=>{
 const {deps,sent}=fake();const handler=handlerFor(deps);
 const refused=await tool(handler,'show_graphic',{cueId:'barechu'},auth(['crc.authoring']));
 assert.equal(refused.isError,true);assert.match(refused.text,/wasn’t granted live control, so show_graphic can’t run\..*insufficient_scope: needs crc\.live/);
 assert.equal((await tool(handler,'get_live_state',{},auth(['crc.authoring']))).isError,true);
 assert.deepEqual(sent,[]);
 const shown=await tool(handler,'show_graphic',{cueId:'barechu'});
 assert.equal(shown.isError,false,shown.text);assert.equal(shown.value.ok,true);assert.equal(shown.value.workspaceId,'crc');
 assert.equal(sent.length,1);
 // The same live-only token still can't author.
 assert.match((await tool(handler,'list_templates',{},LIVE)).text,/insufficient_scope: needs crc\.authoring/);
});

test('target is required, and rehearsal is refused in words with nothing sent',async()=>{
 const {deps,sent}=fake();const handler=handlerFor(deps);
 const rehearsal=await tool(handler,'show_graphic',{cueId:'barechu',target:'rehearsal'});
 assert.equal(rehearsal.isError,true);
 assert.match(rehearsal.value.refused,/^There is no rehearsal output to send to: this connection controls the live CRC output only, and a separate rehearsal output is a later plan\. Nothing was sent\. Pass target:'live'/);
 assert.match((await tool(handler,'get_live_state',{target:'rehearsal'})).value.refused,/no rehearsal output to read.*Nothing was read/);
 const missing=await payload(await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'animate_out',arguments:{workspace:'crc'}}})}),{authInfo:LIVE})) as {error?:unknown;result?:{isError?:boolean}};
 assert.ok(missing.error||missing.result?.isError,'no target is refused by the schema');
 assert.equal((await tool(handler,'animate_out',{workspace:'tbi'})).isError,true,'the workspace is checked on live tools too');
 assert.deepEqual(sent,[]);
});

test('the deck guard refuses during a service, allows with override and a reason, and records the reason',async()=>{
 const {deps,sent,logs,state}=fake();const handler=handlerFor(deps);
 state.lastPress={control:null,companion:state.serverTime-60_000,mcp:null};// the deck pressed a minute ago
 const refused=await tool(handler,'show_graphic',{cueId:'barechu'});
 assert.equal(refused.isError,true);
 assert.match(refused.value.refused,/^A CRC Companion deck pressed a button 60 seconds ago, inside the 5-minute deck guard, so show_graphic was not sent: the person at the deck has the output\. Nothing was changed\. Ask them, or pass override:true with a reason/);
 assert.equal(refused.value.deckGuard.active,true);
 assert.match((await tool(handler,'clear_now',{immediate:true,override:true})).value.refused,/override:true needs a reason/);
 assert.deepEqual(sent,[],'nothing refused reached the command core');
 const state0=await tool(handler,'get_live_state');
 assert.equal(state0.value.deckGuard.active,true);assert.equal(state0.value.deckGuard.windowMinutes,5);assert.ok(state0.value.lastPress.companion);
 const allowed=await tool(handler,'show_graphic',{cueId:'barechu',override:true,reason:'Michael asked me to put Barechu up',commandId:'agent-override-0001'});
 assert.equal(allowed.isError,false,allowed.text);
 assert.equal(allowed.value.override.reason,'Michael asked me to put Barechu up');
 assert.match(allowed.value.override.recordedIn,/server log.*cue log has no note field/);
 assert.equal(logs.length,1);assert.deepEqual(JSON.parse(logs[0]),{event:'mcp_live_override',workspace:'crc',tool:'show_graphic',commandId:'agent-override-0001',reason:'Michael asked me to put Barechu up',guardActive:true,lastCompanionPressAt:new Date(state.lastPress.companion).toISOString()});
 // Past the window the guard lifts by itself.
 state.lastPress.companion=state.serverTime-5*60_000;
 assert.equal((await tool(handler,'animate_out')).isError,false);
 // A service that does not report presses cannot be judged: refused unless overridden.
 delete state.lastPress;
 assert.match((await tool(handler,'animate_out')).value.refused,/does not report when a Companion deck last pressed.*override:true with a reason/);
 assert.equal(deckGuard({lastPress:null,serverTime:0},5,0).active,null);
});

test('the guard window is workspace configuration, default 5 minutes, and cannot be switched off',()=>{
 assert.equal(deckGuardMinutes({}),5);
 assert.equal(deckGuardMinutes({WORKSPACE_DECK_GUARD_MINUTES:'2'}),2);
 for(const bad of ['0','off','-1','241','1.5'])assert.throws(()=>deckGuardMinutes({WORKSPACE_DECK_GUARD_MINUTES:bad}),/1 to 240/,bad);
 assert.equal(deckGuard({lastPress:{control:null,companion:1000,mcp:null},serverTime:1000+2*60_000},2,0).active,false);
});

test('each tool sends the command it names and says what it did',async()=>{
 const {deps,sent,state}=fake({},{bug:{on:true,page:'12'},logo:{on:true}});const handler=handlerFor(deps);
 const shown=await tool(handler,'show_graphic',{cueId:'shema-1',serviceId:'0f8fad5b-d9cb-469f-a165-70867728950e',ifRevision:4,commandId:'agent-show-00001'});
 assert.deepEqual(sent[0],{action:'in',cue:'shema-1',commandId:'agent-show-00001',serviceRef:'0f8fad5b-d9cb-469f-a165-70867728950e',ifRevision:4});
 assert.equal(shown.value.commandId,'agent-show-00001');assert.equal(shown.value.outcome,'applied');
 assert.equal(shown.value.renderer.acknowledged,true);assert.match(shown.value.renderer.sentence,/confirmed revision 5/);
 const next=await tool(handler,'next_panel');
 assert.deepEqual({action:sent[1].action,cue:sent[1].cue,ifCue:sent[1].ifCue},{action:'in',cue:'shema-2',ifCue:'shema-1'},'relative to what was read');
 assert.equal(next.value.did,"Stepped from 'Shema — 01 of 03' to 'Shema — 02 of 03'.");
 await tool(handler,'previous_panel');await tool(handler,'previous_panel');
 assert.equal(sent[3].cue,'shema-3','previous from 01 wraps to the last panel');
 assert.match((await tool(handler,'take_out',{cueId:'barechu'})).value.refused,/'barechu' is not the graphic on screen now \(that is 'Shema — 03 of 03'\), so there is nothing to take out\. Nothing was sent\./);
 await tool(handler,'take_out',{cueId:'shema-3'});
 assert.deepEqual({action:sent[4].action,cue:sent[4].cue,ifCue:sent[4].ifCue},{action:'out',cue:'shema-3',ifCue:'shema-3'});
 assert.match((await tool(handler,'next_panel')).value.refused,/Nothing is on screen, so there is no panel to step from/);
 await tool(handler,'show_graphic',{cueId:'barechu'});
 assert.match((await tool(handler,'next_panel')).value.refused,/'Barechu' is not part of a multipart set/);
 assert.match((await tool(handler,'show_graphic',{cueId:'nope'})).value.refused,/No graphic with id 'nope' is in the CRC live catalog/);
 assert.match((await tool(handler,'show_graphic',{cueId:'old-alias'})).value.refused,/hidden from operators; it stands in for 'barechu'/);
 const out=await tool(handler,'animate_out');
 assert.equal(sent.at(-1)!.action,'clear');assert.match(out.value.did,/scan card and the resting-logo preference are unchanged/);
 const scan=await tool(handler,'set_scan_card',{on:true});
 assert.deepEqual(sent.at(-1)!.bug,{on:true,page:'12'},'on without a page keeps the page');
 assert.match(scan.value.did,/page '12'/);
 await tool(handler,'set_scan_card',{on:false,page:'99'});assert.deepEqual(sent.at(-1)!.bug,{on:false,page:null});
 assert.equal(state.logo?.on,true);
});

test('clear_now needs immediate:true and says it also clears the scan card and the resting-logo preference',async()=>{
 const {deps,sent}=fake({},{cue:'barechu',cuePayload:CUES[0],bug:{on:true,page:null},logo:{on:true}});const handler=handlerFor(deps);
 const unconfirmed=await tool(handler,'clear_now',{});
 assert.equal(unconfirmed.isError,true);assert.match(unconfirmed.text,/immediate/);
 assert.equal((await tool(handler,'clear_now',{immediate:false})).isError,true);
 assert.equal(sent.length,0);
 const cleared=await tool(handler,'clear_now',{immediate:true});
 assert.equal(sent[0].action,'cut');
 assert.equal(cleared.value.did,'Cleared the output at once, with no animation. This also removed the scan card and turned the resting-logo preference off; the logo stays off until someone turns it on again.');
 assert.deepEqual(cleared.value.alsoCleared,{scanCard:true,restingLogoPreference:'off'});
 assert.deepEqual(cleared.value.live,{cue:null,scanCard:{on:false,page:null},restingLogoPreference:'off'});
});

test('set_resting_logo reports the preference and never claims the mark is visible',async()=>{
 const {deps,sent}=fake();const handler=handlerFor(deps);
 const on=await tool(handler,'set_resting_logo',{on:true});
 assert.deepEqual(sent[0].logo,{on:true});
 assert.equal(on.value.restingLogoPreference,'on');assert.equal(on.value.visibility,'not reported');
 assert.match(on.value.did,/^Set the resting-logo preference on\. This is the preference only/);
 assert.doesNotMatch(on.text,/(mark|logo) (is|now) (visible|showing|on screen)/i);
 const read=await tool(handler,'get_live_state');
 assert.equal(read.value.restingLogo.preference,'on');assert.match(read.value.restingLogo.note,/nothing reports whether it is on screen/);
});

test('the renderer ack is reported honestly: confirmed, not yet, or overtaken',async()=>{
 // No graphics browser: after ~3 s the press is accepted but unconfirmed.
 let clock=0;
 const quiet=fake({now:()=>clock,sleep:async ms=>{clock+=ms}});
 const waited=await tool(handlerFor(quiet.deps),'show_graphic',{cueId:'barechu'});
 assert.equal(waited.value.renderer.acknowledged,false);assert.equal(waited.value.renderer.status,'not yet');
 assert.ok(waited.value.renderer.waitedMs>=3000&&waited.value.renderer.waitedMs<3500);
 assert.match(waited.value.renderer.sentence,/No graphics browser confirmed revision 5 within 3 seconds\. The press was accepted/);
 // Someone else moved the output before any browser confirmed this press.
 const raced=fake();raced.deps.sleep=async()=>{raced.state.revision+=1};
 const overtaken=await tool(handlerFor(raced.deps),'show_graphic',{cueId:'barechu'});
 assert.equal(overtaken.value.renderer.status,'overtaken');
 // What get_live_state says is on screen follows the acks, not the request.
 const live=fake({},{cue:'barechu',cuePayload:CUES[0],renderers:[{id:'o',revision:4,cue:'barechu',phase:'transition',seen:1}]});
 const read=await tool(handlerFor(live.deps),'get_live_state');
 assert.deepEqual(read.value.requested,{cueId:'barechu',name:'Barechu',layout:null});
 assert.deepEqual(read.value.rendered,{status:'in transition',renderers:1});
 assert.match(read.value.onScreen,/animating to 'Barechu'/);
});

test('a relay refusal comes back as the relay said it, with nothing claimed',async()=>{
 const {deps}=fake({command:async()=>({status:409,body:{error:'The live state has moved on since the revision this command expected. Nothing was changed; read the live state and decide again.',precondition:'ifRevision'},outcome:null,originalOutcome:null,lastPress:null})});
 const refused=await tool(handlerFor(deps),'show_graphic',{cueId:'barechu',ifRevision:1});
 assert.equal(refused.isError,true);assert.equal(refused.value.precondition,'ifRevision');
 assert.match(refused.value.refused,/^The live state has moved on.*Read get_live_state and decide again\. \(show_graphic was not applied\.\)$/);
});

test('server-side panel stepping matches the Companion module on the same cases',async()=>{
 // Loaded at run time: the module targets a newer ECMAScript than the web's tsconfig, so tsc must not follow it.
 const modulePanel=new URL('../companion/src/panel.ts',import.meta.url).href;
 const {panelTarget,parsePanelName:moduleParse}=await import(modulePanel) as {panelTarget:(cues:readonly {id:string;name:string}[],live:string|null,step:1|-1)=>string|null;parsePanelName:(value:unknown)=>unknown};
 const cues=[...CUES,{id:'names:0f8fad5b:01',name:'Shema — 01 of 02'},{id:'names:0f8fad5b:02',name:'Shema — 02 of 02'},{id:'gap-1',name:'Gap — 01 of 03'},{id:'gap-3',name:'Gap — 03 of 03'}];
 for(const name of ['Mah Tovu — 01 of 03','Barechu — 007 of 012','Modeh Ani — Bottom — 02 of 04','Mah Tovu - 01 of 03','Mah Tovu — 04 of 03','Mah Tovu — 00 of 03',' — 01 of 03','Mah Tovu'])assert.deepEqual(webParse(name),moduleParse(name),name);
 const visible=cues.filter(cue=>!cue.hidden);
 for(const live of ['shema-1','shema-3','names:0f8fad5b:02','gap-1','gap-3','barechu','missing'])for(const step of [1,-1] as const)assert.equal(panelNeighbour(cues,live,step)?.to.id??null,panelTarget(visible,live,step),`${live} ${step}`);
});

// End to end through the real command core and the in-process rehearsal relay.
const SECRET=`rehearsal-${randomUUID()}`;
const running:RehearsalRelay[]=[];
after(async()=>{for(const relay of running.splice(0))await relay.close()});
test('through the rehearsal relay: cue log rows show mcp and the commandId, and a Companion press turns the guard on',async()=>{
 const relay=await startRehearsalRelay({port:0,secret:SECRET});running.push(relay);
 const saved={url:process.env.RELAY_URL,secret:process.env.RELAY_SECRET};
 Object.assign(process.env,{RELAY_URL:relay.url,RELAY_SECRET:SECRET});
 const relayFetch=(path:string,body?:unknown)=>fetch(`${relay.url}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${SECRET}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  assert.equal((await relayFetch('/initialize',{state:{revision:0,cue:null,mode:'animate',updated:1,cuePayload:null},catalogVersion:'rehearsal-v1',cues:CUES.filter(cue=>!cue.hidden)})).status,201);
  const output=randomUUID();
  // A graphics browser: it acknowledges whatever the relay holds each time the tool polls.
  const deps:LiveDeps={command:runMcpCommand,state:snapshot,catalog,guardMinutes:()=>deckGuardMinutes({}),pollMs:1,sleep:async()=>{const state=await (await relayFetch('/state')).json() as {revision:number;cue:string|null};await relayFetch('/ack',{id:output,revision:state.revision,cue:state.cue,phase:'settled'})}};
  const handler=handlerFor(deps);
  const shown=await tool(handler,'show_graphic',{cueId:'shema-1',commandId:'agent-e2e-000001'});
  assert.equal(shown.isError,false,shown.text);
  assert.equal(shown.value.outcome,'applied');assert.equal(shown.value.renderer.acknowledged,true,JSON.stringify(shown.value.renderer));
  assert.deepEqual(shown.value.live.cue,{id:'shema-1',name:'Shema — 01 of 03'});
  const retried=await tool(handler,'show_graphic',{cueId:'shema-1',commandId:'agent-e2e-000001'});
  assert.equal(retried.value.outcome,'replayed');assert.match(retried.value.did,/replayed and nothing was pressed again/);
  await tool(handler,'next_panel',{commandId:'agent-e2e-000002'});
  const rows=((await (await relayFetch('/history')).json()) as {rows:{action:string;cueId:string|null;source:string;commandId:string|null}[]}).rows;
  assert.deepEqual(rows.map(row=>({action:row.action,cueId:row.cueId,source:row.source,commandId:row.commandId})),[
   {action:'in',cueId:'shema-1',source:'mcp',commandId:'agent-e2e-000001'},
   {action:'in',cueId:'shema-2',source:'mcp',commandId:'agent-e2e-000002'},
  ],'one row per press, a replay adds none');
  // Michael presses on the deck: the next agent call yields to him.
  assert.equal((await relayFetch('/command',{action:'in',cue:'barechu',bug:null,logo:null,commandId:randomUUID(),clientId:'companion-deck-1',sequence:1,source:'companion',serviceRef:null})).status,200);
  const state=await tool(handler,'get_live_state');
  assert.equal(state.value.deckGuard.active,true);assert.ok(state.value.lastPress.companion);assert.ok(state.value.lastPress.agent);
  const refused=await tool(handler,'animate_out');
  assert.equal(refused.isError,true);assert.match(refused.value.refused,/Companion deck pressed a button \d+ seconds? ago/);
  const overridden=await tool(handler,'animate_out',{override:true,reason:'Rehearsal: testing the override',commandId:'agent-e2e-000003'});
  assert.equal(overridden.isError,false,overridden.text);
  const last=((await (await relayFetch('/history')).json()) as {rows:{action:string;source:string;commandId:string|null}[]}).rows.at(-1);
  assert.deepEqual(last,{...last,action:'clear',source:'mcp',commandId:'agent-e2e-000003'});
 }finally{for(const [key,value] of [['RELAY_URL',saved.url],['RELAY_SECRET',saved.secret]] as const){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
