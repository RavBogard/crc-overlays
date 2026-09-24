/**
 * The cue log (2026-09-14 integration ruling 7). One bounded, operational history of what the
 * output actually did — and the whole point of these tests is the second half of the ruling:
 * "bounded operational history, not permanent personal surveillance". So the forbidden-key walk
 * runs over every row that crosses every boundary, the bound is measured rather than assumed,
 * and every credential that must NOT read the log is asserted as carefully as the one that must.
 *
 * The relay here is the rehearsal stub, which imports the worker's protocol verbatim, reached
 * over loopback exactly as production reaches Cloudflare.
 */

import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {HISTORY_WINDOW_MS,MAX_HISTORY_PAGE,MAX_HISTORY_ROWS,parseCommand,type Command} from '../relay/src/protocol.ts';
import {startRehearsalRelay,type RehearsalRelay} from '../scripts/rehearsal-relay.ts';
import {HISTORY_KEYS,HistoryError,historyQuery,readHistoryRow,readServiceHistoryBody,type ServiceHistoryRow} from '../lib/service-history.ts';
import {liturgyForCue} from '../lib/liturgy-index.ts';
import {siddurLibrary} from '../lib/source-library.ts';
import {authorizeRequest,accessStore,canAccess,type AccessSessionMember,type AccessStore} from '../lib/access.ts';
import {MemoryDeviceStore,clearVerifiedDeviceCache,deviceStore,type DeviceStore} from '../lib/devices.ts';
import {GET as historyGET,POST as historyPOST} from '../app/api/history/route.ts';

const SECRET=`history-${randomUUID()}`;
process.env.RELAY_SECRET=SECRET;
process.env.CONTROL_KEY='control-key-for-this-test';

const librarySource=siddurLibrary.sources[0];
const LIBRARY_CUE='cue-barechu';
const CUSTOM_CUE='cue-announcement';
const COLLECTION=randomUUID();
const NAMES_CUE=`names:${COLLECTION}:01`;
const CUES=[
 {id:LIBRARY_CUE,name:'Barechu',authoring:{sourceIds:[librarySource.id]}},
 {id:CUSTOM_CUE,name:'Announcement',authoring:{sourceIds:['custom:announcement']}},
 {id:NAMES_CUE,name:'Mi Shebeirach 1'},
];
/** What the library says about that graphic — the same answer /api/now and /api/catalog give. */
const EXPECTED=liturgyForCue(CUES[0] as {authoring?:{sourceIds?:string[]}});
const INITIALIZE={state:{revision:0,cue:null,mode:'animate',updated:1,cuePayload:null},catalogVersion:'history-v1',cues:CUES};

const running:RehearsalRelay[]=[];
after(async()=>{for(const relay of running.splice(0))await relay.close()});

async function relayWithHistory(now?:()=>number){
 const relay=await startRehearsalRelay({port:0,secret:SECRET,now,workspace:'crc'});
 running.push(relay);
 assert.equal((await request(relay,'/initialize',INITIALIZE)).status,201);
 return relay;
}
function request(relay:RehearsalRelay,path:string,body?:unknown){
 return fetch(`${relay.url}${path}`,{
  method:body===undefined?'GET':'POST',
  headers:{Authorization:`Bearer ${SECRET}`,...(body===undefined?{}:{'Content-Type':'application/json'})},
  body:body===undefined?undefined:JSON.stringify(body),
 });
}
type RelayHistory={workspace:string;rows:Record<string,unknown>[];nextAfter:number|null;window:{rows:number;days:number}};
const send=(relay:RehearsalRelay,body:Record<string,unknown>)=>request(relay,'/command',{commandId:randomUUID(),clientId:null,sequence:null,cue:null,...body});
const readHistory=async(relay:RehearsalRelay,search='')=>await (await request(relay,`/history${search}`)).json() as RelayHistory;
/** What `/api/history` would publish for that relay answer: the join, the rebuild and the walk. */
const published=(body:RelayHistory)=>readServiceHistoryBody(body).rows;

const walk=(value:unknown,seen:string[]=[]):string[]=>{
 if(Array.isArray(value))for(const item of value)walk(item,seen);
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){seen.push(key);walk(item,seen)}
 return seen;
};

test('an accepted command becomes one row, and the library is joined on the way out',async()=>{
 const relay=await relayWithHistory();
 await send(relay,{action:'in',cue:LIBRARY_CUE,source:'companion',commandId:'companion-press-0001'});
 await send(relay,{action:'out',cue:LIBRARY_CUE});
 await send(relay,{action:'in',cue:CUSTOM_CUE});
 await send(relay,{action:'cut'});
 await send(relay,{action:'clear'});
 const body=await readHistory(relay);
 assert.equal(body.workspace,'crc','a reader can tell the two congregations apart');
 assert.deepEqual(body.window,{rows:MAX_HISTORY_ROWS,days:14},'the answer states its own bound');
 assert.equal(body.nextAfter,null,'a short history is complete');
 const rows=published(body);
 assert.deepEqual(rows.map(row=>row.action),['in','out','in','cut','clear'],'in order, one row per accepted command');
 assert.ok(rows.every((row,index)=>index===0||row.seq>rows[index-1].seq),'sequence never regresses');
 assert.ok(EXPECTED.unitId&&EXPECTED.book,'the fixture graphic really is library-backed');
 assert.deepEqual(
  {...rows[0],seq:0,at:0},
  {seq:0,at:0,action:'in',cueId:LIBRARY_CUE,...EXPECTED,source:'companion',serviceRef:null,commandId:'companion-press-0001'},
  'the liturgical position is resolved from the pinned sources, and the source of the command is recorded',
 );
 assert.deepEqual(
  {...rows[2],seq:0,at:0,commandId:null},
  {seq:0,at:0,action:'in',cueId:CUSTOM_CUE,unitId:null,momentId:null,book:null,folio:null,source:'control',serviceRef:null,commandId:null},
  'a graphic with no library source is all nulls, and an unstated source is plain live control',
 );
 assert.equal(rows[3].cueId,null,'cut and clear name no graphic');
});

test('a names panel names the prepared service it belongs to',async()=>{
 const relay=await relayWithHistory();
 await send(relay,{action:'in',cue:NAMES_CUE});
 const [row]=published(await readHistory(relay));
 assert.equal(row.serviceRef,COLLECTION,'the collection is read out of the names-panel id');
 assert.deepEqual([row.unitId,row.momentId,row.book,row.folio],[null,null,null,null],'a names panel has no liturgical position');
 // And a caller may still name one explicitly.
 const explicit=await relayWithHistory();
 await send(explicit,{action:'in',cue:LIBRARY_CUE,serviceRef:COLLECTION});
 assert.equal(published(await readHistory(explicit))[0].serviceRef,COLLECTION);
 assert.equal((await send(explicit,{action:'in',cue:LIBRARY_CUE,serviceRef:'friday-night'})).status,400,'a service reference that is not a collection id is refused');
});

test('no row can carry a name, a title, text, a person or a source pin',async()=>{
 const relay=await relayWithHistory();
 await send(relay,{action:'in',cue:LIBRARY_CUE});
 await send(relay,{action:'bug',bug:{on:true,page:'146'}});
 const body=await readHistory(relay);
 const rows=published(body);
 assert.equal(rows.length,2,'the scan card is an accepted command like any other');
 assert.deepEqual({...rows[1],seq:0,at:0,commandId:null},{seq:0,at:0,action:'bug',cueId:null,unitId:null,momentId:null,book:null,folio:null,source:'control',serviceRef:null,commandId:null},'the scan card records that it happened, never the page it showed');
 for(const row of rows){
  assert.deepEqual([...new Set(walk(row))].sort(),[...HISTORY_KEYS].sort(),'exactly the permitted keys');
  const serialized=JSON.stringify(row);
  for(const forbidden of ['Barechu','Announcement','library:','"146"'])
   assert.ok(!serialized.includes(forbidden),`a row must not carry ${forbidden}`);
  for(const forbidden of ['name','title','text','operator','renderer','email','revision','phase'])
   assert.ok(!serialized.toLowerCase().includes(forbidden),`a row must not carry ${forbidden}`);
 }
 // The relay's own rows keep the source ids; they are consumed by the join and never published.
 assert.ok(JSON.stringify(body.rows).includes(librarySource.id),'the relay does keep the pinned sources');
});

test('the window is bounded at fourteen days and two thousand rows, and drops rather than archives',async()=>{
 let clock=1_800_000_000_000;
 const relay=await relayWithHistory(()=>clock);
 await send(relay,{action:'in',cue:LIBRARY_CUE});
 assert.equal((await readHistory(relay)).rows.length,1);
 clock+=HISTORY_WINDOW_MS+1;
 await send(relay,{action:'clear'});
 assert.deepEqual(published(await readHistory(relay)).map(row=>row.action),['clear'],'a row past fourteen days is gone, not archived');

 const command=parseCommand({action:'in',cue:LIBRARY_CUE,commandId:'command_12345678',clientId:null,sequence:null}) as Command;
 for(let index=0;index<MAX_HISTORY_ROWS+120;index+=1)relay.room.appendHistory(command,null,clock);
 assert.equal(relay.room.history.length,MAX_HISTORY_ROWS,'the row bound holds');
 // The read is paged, so reaching every retained row takes several requests and never one
 // unbounded answer.
 let seen=0,pages=0;
 let cursor:number|null=0;
 while(cursor!==null){
  const page=await readHistory(relay,`?after=${cursor}`);
  assert.ok(page.rows.length<=MAX_HISTORY_PAGE,'no page exceeds the page size');
  seen+=page.rows.length;cursor=page.nextAfter;pages+=1;
 }
 assert.equal(seen,MAX_HISTORY_ROWS,'paging reaches every retained row exactly once');
 assert.ok(pages>=4,'and a full history really is several pages');
});

test('since, until and after select a window, and a malformed range refuses',async()=>{
 const relay=await relayWithHistory();
 await send(relay,{action:'in',cue:LIBRARY_CUE});
 await send(relay,{action:'clear'});
 const all=published(await readHistory(relay));
 const [first,second]=all;
 assert.deepEqual(published(await readHistory(relay,`?after=${first.seq}`)).map(row=>row.seq),[second.seq],'after is a cursor, not a time');
 assert.deepEqual(published(await readHistory(relay,`?since=${second.at}`)).map(row=>row.seq),all.filter(row=>row.at>=second.at).map(row=>row.seq));
 assert.deepEqual(published(await readHistory(relay,`?until=${first.at}`)).map(row=>row.seq),all.filter(row=>row.at<=first.at).map(row=>row.seq));
 assert.equal((await readHistory(relay,'?limit=1')).rows.length,1,'a caller may ask for less');
 assert.equal((await request(relay,'/history?since=yesterday')).status,400,'a range that cannot be read is refused, never reinterpreted');
});

test('clearing the history leaves the clearing itself as the only row',async()=>{
 const relay=await relayWithHistory();
 await send(relay,{action:'in',cue:LIBRARY_CUE});
 await send(relay,{action:'clear'});
 const cleared=await request(relay,'/history/clear',{});
 assert.equal(cleared.status,200);
 const outcome=await cleared.json() as {ok:boolean;cleared:number;seq:number};
 assert.equal(outcome.ok,true);
 assert.equal(outcome.cleared,2);
 assert.deepEqual(published(await readHistory(relay)).map(row=>row.action),['history_cleared'],'the clear is logged as its own row');
});

test('a history that cannot be written never costs the congregation a graphic',async()=>{
 const relay=await relayWithHistory();
 Object.defineProperty(relay.room,'history',{get(){throw Error('storage is gone')}});
 const response=await send(relay,{action:'in',cue:LIBRARY_CUE});
 assert.equal(response.status,200,'the command is still accepted');
 assert.equal((await response.json()).cue,LIBRARY_CUE,'and it is still on screen');
});

test('a row is rebuilt key by key on the way out of the relay',()=>{
 const relayRow={seq:4,at:1_800_000_000_000,action:'in',cueId:'cue-a',source:'control',serviceRef:null,sourceIds:[]};
 const expected={seq:4,at:1_800_000_000_000,action:'in',cueId:'cue-a',unitId:null,momentId:null,book:null,folio:null,source:'control',serviceRef:null,commandId:null};
 assert.deepEqual(readHistoryRow({...relayRow,operator:'daniel@example.test',name:'Barechu'}),expected,'anything the relay should not have said is dropped');
 assert.deepEqual(readHistoryRow({...relayRow,sourceIds:[librarySource.id]}),{...expected,...EXPECTED},'and the join is the only way a position appears');
 // Ruling 10: the command's correlation id is published; anything not shaped like one is not.
 assert.equal(readHistoryRow({...relayRow,commandId:'mcp-retry_0001'})?.commandId,'mcp-retry_0001');
 for(const commandId of ['short','daniel@example.test','x'.repeat(81),42])assert.equal(readHistoryRow({...relayRow,commandId})?.commandId,null);
 assert.equal(readHistoryRow({...relayRow,action:'delete'}),null,'an action outside the vocabulary is not passed through');
 assert.equal(readHistoryRow({...relayRow,source:'stage'}),null);
 assert.equal(readHistoryRow({...relayRow,seq:-1}),null);
 assert.deepEqual(readServiceHistoryBody({workspace:'crc',rows:[relayRow,{bogus:true}],nextAfter:null}).rows,[expected],'an unreadable row is dropped, not fatal');
 assert.throws(()=>historyQuery({since:'last week'}),(error:unknown)=>error instanceof HistoryError&&error.status===400);
 assert.equal(historyQuery({since:'10',until:null,after:'',limit:5}),'?since=10&limit=5');
});

/* --- who may read it ------------------------------------------------------------------ */

const owner:AccessSessionMember={id:'owner-1',email:'owner@example.test',name:'Owner',role:'owner',enabled:true,authMethod:'password',authenticatedAt:0};
const editor:AccessSessionMember={...owner,id:'editor-1',name:'Editor',role:'editor'};
const operator:AccessSessionMember={...owner,id:'operator-1',name:'Operator',role:'operator'};
const sessionToken='a'.repeat(43);
const cookie=`crc_access=${sessionToken}`;

async function withStores<T>(member:AccessSessionMember|null,run:(store:MemoryDeviceStore)=>Promise<T>){
 const store=new MemoryDeviceStore();
 const savedDevices:DeviceStore={createPairingCode:deviceStore.createPairingCode,redeemPairingCode:deviceStore.redeemPairingCode,issue:deviceStore.issue,verify:deviceStore.verify,list:deviceStore.list,revoke:deviceStore.revoke,sealedOutputs:deviceStore.sealedOutputs};
 const savedAccess=accessStore.memberForSession;
 Object.assign(deviceStore,{verify:(token:string,now:number)=>store.verify(token,now),issue:(input:Parameters<DeviceStore['issue']>[0])=>store.issue(input)} as Partial<DeviceStore>);
 Object.assign(accessStore,{memberForSession:async()=>member} as Partial<AccessStore>);
 clearVerifiedDeviceCache();
 try{return await run(store)}finally{Object.assign(deviceStore,savedDevices);Object.assign(accessStore,{memberForSession:savedAccess});clearVerifiedDeviceCache()}
}

test('the cue log answers authoring members and one read-only credential, and nobody else',async()=>{
 assert.equal(canAccess('owner','history'),true);
 assert.equal(canAccess('editor','history'),true);
 assert.equal(canAccess('operator','history'),false,'an operator runs the service; the log is not theirs to read');

 await withStores(editor,async store=>{
  const reader=await store.issue({name:'centralreform.live',kind:'history_reader',memberId:owner.id,now:1});
  const companion=await store.issue({name:'Booth Companion',kind:'companion',memberId:owner.id,now:1});
  const output=await store.issue({name:'Sanctuary PC',kind:'output',memberId:owner.id,now:1});
  const ask=(headers:Record<string,string>)=>authorizeRequest(new Request('https://graphics.test/api/history',{headers}),'history');
  assert.ok(await ask({cookie}),'a signed-in editor reads it');
  assert.ok(await ask({authorization:`Bearer ${reader.token}`}),'so does the service-history credential');
  assert.equal(await ask({authorization:`Bearer ${companion.token}`}),null,'a Companion credential does not');
  assert.equal(await ask({authorization:`Bearer ${output.token}`}),null,'nor a graphics output');
  assert.equal(await ask({authorization:`Bearer ${process.env.CONTROL_KEY}`}),null,'nor the transitional shared key');
  assert.equal(await ask({}),null,'nor an anonymous caller');
  // And the new credential reaches nothing else.
  for(const permission of ['read','control','author','owner'] as const)
   assert.equal(await authorizeRequest(new Request('https://graphics.test/api/state',{headers:{authorization:`Bearer ${reader.token}`}}),permission),null,`a service-history credential must not satisfy ${permission}`);
 });
});

test('the route reads the relay for a permitted caller and refuses everyone else',async()=>{
 const relay=await relayWithHistory();
 process.env.RELAY_URL=relay.url;
 await send(relay,{action:'in',cue:LIBRARY_CUE});
 const url='https://graphics.test/api/history';
 await withStores(editor,async()=>{
  const response=await historyGET(new Request(url,{headers:{cookie}}));
  assert.equal(response.status,200);
  const body=await response.json() as {rows:ServiceHistoryRow[];workspace:string;window:{rows:number;days:number}};
  assert.equal(body.workspace,'crc');
  assert.deepEqual(body.window,{rows:MAX_HISTORY_ROWS,days:14});
  assert.deepEqual(body.rows.map(row=>row.cueId),[LIBRARY_CUE]);
  assert.equal(body.rows[0].unitId,EXPECTED.unitId,'the route publishes the joined position');
  assert.deepEqual([...new Set(walk(body.rows))].sort(),[...HISTORY_KEYS].sort(),'and exactly the permitted keys');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),null,'no browser on another site reads this');
  assert.equal((await historyGET(new Request(`${url}?since=soon`,{headers:{cookie}}))).status,400);
  const clear=(headers:Record<string,string>)=>historyPOST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://graphics.test',...headers},body:JSON.stringify({action:'clear'})}));
  assert.equal((await clear({cookie})).status,401,'an editor cannot clear it');
 });
 await withStores(operator,async()=>assert.equal((await historyGET(new Request(url,{headers:{cookie}}))).status,401));
 await withStores(owner,async()=>{
  const cleared=await historyPOST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://graphics.test',cookie},body:JSON.stringify({action:'clear'})}));
  assert.equal(cleared.status,200);
  assert.deepEqual(published(await readHistory(relay)).map(row=>row.action),['history_cleared']);
  const crossSite=await historyPOST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://elsewhere.test',cookie},body:JSON.stringify({action:'clear'})}));
  assert.equal(crossSite.status,403,'and never from another website');
  const unknown=await historyPOST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://graphics.test',cookie},body:JSON.stringify({action:'erase'})}));
  assert.equal(unknown.status,400,'no other history operation exists');
 });
 delete process.env.RELAY_URL;
});
