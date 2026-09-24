import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {POST as command} from '../app/api/command/route.ts';
import {clockSequence,mcpController,readCommandAnswer,runLiveCommand,runMcpCommand} from '../lib/live-command.ts';

// V2: the route body moved into lib/live-command.ts. These pin what the console and Companion see:
// the exact relay request an existing caller produces, and the relay's answer passed back unchanged.
type Captured={path:string;body:string};
async function withRelay(reply:(body:Record<string,unknown>)=>Response,run:(sent:Captured[])=>Promise<void>){
 const saved={fetch:globalThis.fetch,env:{...process.env}};const sent:Captured[]=[];
 Object.assign(process.env,{RELAY_URL:'https://relay.example.test',RELAY_SECRET:'relay-secret',CONTROL_KEY:'control'});
 globalThis.fetch=async(input,init)=>{const path=new URL(String(input)).pathname,body=String(init?.body??'');sent.push({path,body});return reply(body?JSON.parse(body):{})};
 try{await run(sent)}finally{globalThis.fetch=saved.fetch;for(const k of ['RELAY_URL','RELAY_SECRET','CONTROL_KEY']){if(saved.env[k]===undefined)delete process.env[k];else process.env[k]=saved.env[k]}}
}
const post=(body:unknown,headers:Record<string,string>={Authorization:'Bearer control'})=>command(new Request('https://site.test/api/command',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)}));
const RELAY_ANSWER={commandId:'command-124',revision:13,cue:'prayer-123',mode:'animate',cuePayload:null,renderers:[],serverTime:1000,lastPress:{control:999,companion:null,mcp:null},outcome:'applied'};

test('a console command reaches the relay byte for byte as before, and its answer comes back untouched',async()=>{
 await withRelay(()=>Response.json(RELAY_ANSWER),async sent=>{
  const response=await post({commandId:'command-124',clientId:'client-123',sequence:2,action:'in',cue:'prayer-123'});
  assert.equal(response.status,200);
  assert.equal(await response.text(),JSON.stringify(RELAY_ANSWER));
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(sent.map(call=>call.path),['/command']);
  // The key order and every value of the pre-V2 route: nothing added for a caller that sends nothing new.
  assert.equal(sent[0].body,'{"action":"in","cue":"prayer-123","bug":null,"logo":null,"commandId":"command-124","clientId":"client-123","sequence":2,"source":"control","serviceRef":null}');
 });
});

test('a Companion-shaped clear and a refusal from the relay pass through with their status',async()=>{
 const refusal={error:'A different graphic is live now than the one this command expected. Nothing was changed; read the live state and decide again.',commandId:'command-200',precondition:'ifCue',revision:4,cue:'other'};
 await withRelay(body=>body.ifCue!==undefined?Response.json(refusal,{status:409}):Response.json({...RELAY_ANSWER,cue:null}),async sent=>{
  const clear=await post({commandId:'command-199',clientId:null,sequence:null,action:'clear',cue:null});
  assert.equal(clear.status,200);
  assert.equal(sent[0].body,'{"action":"clear","cue":null,"bug":null,"logo":null,"commandId":"command-199","clientId":null,"sequence":null,"source":"control","serviceRef":null}');
  const conditional=await post({commandId:'command-200',action:'out',cue:'prayer-123',ifCue:'prayer-123',ifRevision:3});
  assert.equal(conditional.status,409);
  assert.equal(await conditional.text(),JSON.stringify(refusal));
  // Preconditions travel only when given, after every existing key.
  assert.equal(sent[1].body,'{"action":"out","cue":"prayer-123","bug":null,"logo":null,"commandId":"command-200","clientId":null,"sequence":null,"source":"control","serviceRef":null,"ifRevision":3,"ifCue":"prayer-123"}');
 });
});

test('the route keeps every refusal it had, in the same words',async()=>{
 await withRelay(()=>Response.json(RELAY_ANSWER),async sent=>{
  assert.equal((await post({action:'in'},{})).status,401);
  const cases:[unknown,number,string][]=[
   ['{not json',400,'{"error":"Invalid JSON"}'],
   ['null',400,'{"error":"Invalid command"}'],
   [{action:'dance'},400,'{"error":"Unknown action or cue"}'],
   [{action:'in',cue:'x'.repeat(161)},400,'{"error":"Unknown action or cue"}'],
   [{action:'cut',commandId:'short'},400,'{"error":"Invalid command ID"}'],
   [{action:'cut',clientId:'client-123'},400,'{"error":"Invalid controller sequence"}'],
   [{action:'cut',serviceRef:'friday'},400,'{"error":"Invalid service reference"}'],
   [{action:'cut',ifRevision:-1},400,'{"error":"Invalid command precondition"}'],
   [{action:'cut',ifCue:''},400,'{"error":"Invalid command precondition"}'],
   ['x'.repeat(4097),413,'{"error":"Request too large"}'],
  ];
  for(const [body,status,text] of cases){const response=await post(body);assert.equal(response.status,status,String(body).slice(0,40));assert.equal(await response.text(),text)}
  assert.deepEqual(sent,[],'nothing refused reached the relay');
 });
 // A relay that cannot be read is the one generic sentence, never a stack.
 await withRelay(()=>new Response('<html>',{status:502}),async()=>{
  const response=await post({action:'cut'});
  assert.equal(response.status,503);
  assert.equal(await response.text(),'{"error":"Command could not be confirmed. Check state before retrying with the same command ID."}');
 });
});

test('the console WebMCP tag marks a command as mcp; nothing else can relabel a command',async()=>{
 await withRelay(()=>Response.json(RELAY_ANSWER),async sent=>{
  await post({commandId:'command-300',action:'cut',source:'mcp'});
  await post({commandId:'command-301',action:'cut',source:'companion'});
  await post({commandId:'command-302',action:'cut',source:42});
  assert.deepEqual(sent.map(call=>JSON.parse(call.body).source),['mcp','control','control']);
 });
});

test('conditional commands refuse on the legacy path instead of being silently ignored',async()=>{
 const saved={...process.env};delete process.env.RELAY_URL;delete process.env.RELAY_SECRET;
 try{
  const answer=await runLiveCommand({action:'cut',ifRevision:3},'mcp');
  assert.equal(answer.status,503);
  assert.deepEqual(answer.body,{error:'Conditional commands need the live connection.'});
 }finally{for(const k of ['RELAY_URL','RELAY_SECRET'])if(saved[k]!==undefined)process.env[k]=saved[k]}
});

test('an MCP command is source mcp, one controller per connection, clock-ordered, and keeps its commandId',async()=>{
 await withRelay(body=>Response.json({...RELAY_ANSWER,commandId:body.commandId,outcome:'replayed',originalOutcome:'applied',lastPress:{control:null,companion:1_800_000_000_000,mcp:5}}),async sent=>{
  const extra={actor:'mcp:0123:member:m',liveController:'mcp-0123456789abcdef0123456789abcdef01234567'};
  const first=await runMcpCommand({action:'in',cue:'prayer-123',commandId:'agent-retry-0001'},extra);
  const second=await runMcpCommand({action:'in',cue:'prayer-123',commandId:'agent-retry-0001'},extra);
  const [a,b]=sent.map(call=>JSON.parse(call.body));
  assert.equal(a.source,'mcp');assert.equal(a.clientId,extra.liveController);assert.equal(b.clientId,a.clientId);
  assert.equal(a.commandId,'agent-retry-0001');assert.equal(b.commandId,'agent-retry-0001','a retried tool call replays rather than pressing twice');
  assert.ok(b.sequence>a.sequence&&Number.isSafeInteger(b.sequence));
  assert.ok(a.sequence>=Date.now()*1000-5_000_000,'the sequence is the clock');
  assert.equal(first.outcome,'replayed');assert.equal(first.originalOutcome,'applied');
  assert.deepEqual(second.lastPress,{control:null,companion:1_800_000_000_000,mcp:5});
  const orphan=await runMcpCommand({action:'cut'},{actor:'mcp:x'});
  assert.equal(orphan.status,401);assert.equal(sent.length,2,'a connection with no controller id never reaches the relay');
 });
});

test('V1 answer fields are read defensively and a pre-V1 relay answers nulls',()=>{
 assert.deepEqual(readCommandAnswer(200,{revision:1}),{status:200,body:{revision:1},outcome:null,originalOutcome:null,lastPress:null});
 const read=readCommandAnswer(200,{outcome:'applied',originalOutcome:'applied',lastPress:{control:-1,companion:'soon',mcp:10}});
 assert.equal(read.outcome,'applied');assert.equal(read.originalOutcome,null,'originalOutcome belongs to a replay only');
 assert.deepEqual(read.lastPress,{control:null,companion:null,mcp:10});
 assert.equal(readCommandAnswer(200,null).outcome,null);
 assert.equal(mcpController({liveController:'short'}),null);
 const one=clockSequence(1000),two=clockSequence(1000);assert.ok(two>one,'two presses in one millisecond still order');
});

test('the console WebMCP tool sends its commands as mcp, and the page buttons do not',()=>{
 const page=readFileSync(fileURLToPath(new URL('../app/console.tsx',import.meta.url)),'utf8');
 assert.match(page,/name:'set_overlay_cue'[\s\S]*?return command\(value\.action,typeof value\.cue==='string'\?value\.cue:undefined,undefined,undefined,'mcp'\)/);
 assert.match(page,/\.\.\.\(source\?\{source\}:\{\}\)/,'the tag is added only when given, so a person\'s press sends the body it always did');
 assert.equal(page.match(/undefined,undefined,'mcp'\)/g)?.length,1,'one call site tags, the WebMCP one');
});