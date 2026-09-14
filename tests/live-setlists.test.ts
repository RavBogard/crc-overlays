import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createLiveTransport,importSetlist,liveSetlistsAvailability,matchSetlist,type LiveSetlist,type MatchDeps} from '../lib/live-setlists.ts';
import {liveSetlistDependencies,MemoryServicesRepository,ServicesError,servicesOperation} from '../lib/service-collections.ts';
import type {LiturgyRef} from '../lib/liturgy-index.ts';
import type {Cue} from '../lib/player.ts';

/* D19 — G1's matcher is pure and every case here is driven from `tests/fixtures/setlists/`.
   Nothing in this file reaches the network: the only transport that could is built against a
   stubbed `fetch` and a `https://live.example` base, and centralreform.live is never called
   from this repo's tests, scripts or preview deployments. */

const fixture=<T,>(name:string):T=>JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/setlists/${name}`,import.meta.url)),'utf8')) as T;
const library=fixture<{cues:Cue[];liturgy:Record<string,LiturgyRef>}>('catalog.json');
const NO_LITURGY:LiturgyRef={unitId:null,momentId:null,book:null,folio:null};

function deps():MatchDeps{
 let n=0;
 return {cues:library.cues,liturgyFor:cue=>library.liturgy[cue.id]??NO_LITURGY,id:()=>`id-${++n}`};
}
const nameOf=(id:string)=>library.cues.find(cue=>cue.id===id)?.name;

/* ---------- the matcher, from fixtures ---------- */

test('a fully covered setlist becomes one entry per performance row and no unmatched rows',()=>{
 const setlist=fixture<LiveSetlist>('covered.json');
 const {entries,coverage,unmatched}=matchSetlist(setlist,deps());
 // The section header is neither an entry nor a coverage row: it carries no words for the screen.
 assert.equal(entries.length,2);
 assert.equal(coverage.length,2);
 assert.deepEqual(unmatched,[]);
 assert.deepEqual(entries.map(entry=>entry.label),['Barechu','Oseh Shalom']);
 assert.ok(entries.every(entry=>entry.type==='cue'));
 assert.deepEqual(coverage.map(row=>row.status),['covered','covered']);
 // The liturgy row matched on {book,folio}; the song row matched on the graphic's name.
 assert.equal(coverage[0].cueId,'cue-barechu');
 assert.equal(coverage[1].cueId,'cue-oseh-shalom');
});

test('a song with no matching graphic is not-needed, named in unmatched, and creates no entry',()=>{
 const setlist=fixture<LiveSetlist>('song-unmatched.json');
 const {entries,coverage,unmatched}=matchSetlist(setlist,deps());
 assert.deepEqual(entries.map(entry=>entry.cueIds),[['cue-shma']]);
 const song=coverage.find(row=>row.label==='Zog Nit Keyn Mol');
 assert.ok(song,'the song still gets a coverage row');
 assert.equal(song?.status,'not-needed');
 assert.equal(song?.reason,'Song without a matching graphic; add one if the words should be on screen.');
 assert.deepEqual(unmatched,[{trackId:'t-zog-nit',title:'Zog Nit Keyn Mol',kind:'song',reason:'Song without a matching graphic; add one if the words should be on screen.'}]);
});

test('a folio two published graphics share is never picked silently: needs-review, both named, alternates',()=>{
 const setlist=fixture<LiveSetlist>('ambiguous-folio.json');
 const {entries,coverage,unmatched}=matchSetlist(setlist,deps());
 // The note row is skipped; the one prayer row is left for a person to settle.
 assert.equal(coverage.length,1);
 assert.equal(coverage[0].status,'needs-review');
 assert.equal(coverage[0].owner,'Unassigned');
 assert.equal(coverage[0].cueId,undefined,'no candidate is recorded as the covering graphic');
 for(const id of ['cue-mi-chamocha-klepper','cue-mi-chamocha-friedman'])assert.ok(coverage[0].reason?.includes(nameOf(id)!),`${id} is named in the reason`);
 assert.equal(entries.length,1);
 assert.equal(entries[0].type,'alternates');
 assert.deepEqual(entries[0].cueIds.sort(),['cue-mi-chamocha-friedman','cue-mi-chamocha-klepper']);
 assert.deepEqual(unmatched.map(row=>({trackId:row.trackId,kind:row.kind})),[{trackId:'t-mi-chamocha',kind:'liturgy'}]);
});

test('every label and reason the matcher writes fits what createCollection accepts',()=>{
 for(const name of ['covered.json','song-unmatched.json','ambiguous-folio.json']){
  const {entries,coverage}=matchSetlist(fixture<LiveSetlist>(name),deps());
  for(const entry of entries)assert.ok(entry.label.length>0&&entry.label.length<=160,`${name} entry label is 1-160 chars`);
  for(const row of coverage){
   assert.ok(row.label.length>0&&row.label.length<=160,`${name} coverage label is 1-160 chars`);
   assert.ok((row.reason??'').length<=500,`${name} coverage reason is at most 500 chars`);
   if(row.status!=='covered'&&row.status!=='not-needed')assert.ok(row.owner&&row.reason,'unresolved rows carry an owner and a reason');
  }
 }
});

/* ---------- availability ---------- */

test('an empty environment is unconfigured, and so is a base URL that is not an https origin',()=>{
 assert.deepEqual(liveSetlistsAvailability({}),{available:false,reason:'unconfigured'});
 assert.deepEqual(liveSetlistsAvailability({CRC_LIVE_BASE_URL:'https://live.example'}),{available:false,reason:'unconfigured'});
 assert.deepEqual(liveSetlistsAvailability({CRC_LIVE_BASE_URL:'https://live.example',CRC_LIVE_READ_TOKEN:'   '}),{available:false,reason:'unconfigured'});
 assert.deepEqual(liveSetlistsAvailability({CRC_LIVE_BASE_URL:'http://live.example',CRC_LIVE_READ_TOKEN:'t'}),{available:false,reason:'unconfigured'});
 assert.deepEqual(liveSetlistsAvailability({CRC_LIVE_BASE_URL:'not a url',CRC_LIVE_READ_TOKEN:'t'}),{available:false,reason:'unconfigured'});
 assert.deepEqual(liveSetlistsAvailability({CRC_LIVE_BASE_URL:'https://live.example',CRC_LIVE_READ_TOKEN:'t'}),{available:true,reason:'ok'});
});

/* ---------- the operation, unconfigured ---------- */

test('import_setlist refuses with 409 on an unconfigured congregation and never builds a transport',async()=>{
 const original={availability:liveSetlistDependencies.availability,createTransport:liveSetlistDependencies.createTransport};
 let constructed=0;
 liveSetlistDependencies.availability=()=>({available:false,reason:'unconfigured'});
 liveSetlistDependencies.createTransport=()=>{constructed++;throw new Error('a transport must never be constructed here')};
 try{
  const repository=new MemoryServicesRepository();
  await assert.rejects(
   ()=>servicesOperation('import_setlist',{setlistId:'setlist-covered'},'member:test',repository),
   (error:unknown)=>{
    assert.ok(error instanceof ServicesError);
    assert.equal(error.code,'unconfigured');
    assert.equal(error.status,409);
    assert.equal(error.message,'Importing from centralreform.live is not set up for this congregation.');
    return true;
   },
  );
  assert.deepEqual(await servicesOperation('list_live_setlists',{},'member:test',repository),{available:false});
  assert.equal(constructed,0,'the transport factory was never called');
  assert.equal(repository.collections.size,0,'nothing was written');
 }finally{Object.assign(liveSetlistDependencies,original)}
});

/* ---------- the default transport, against a stubbed fetch only ---------- */

const TOKEN='setlist-reader-secret-000';
const ENV={CRC_LIVE_BASE_URL:'https://live.example',CRC_LIVE_READ_TOKEN:TOKEN};

test('a reply larger than the 256 KB cap is refused instead of read',async()=>{
 const oversized='x'.repeat(300*1024);
 const transport=createLiveTransport(ENV,async()=>new Response(oversized,{status:200,headers:{'content-type':'application/json'}}));
 await assert.rejects(()=>transport('get_setlist',{id:'setlist-covered'}),(error:unknown)=>{
  assert.equal((error as {code?:string}).code,'response_too_large');
  return true;
 });
});

test('the default transport posts JSON-RPC tools/call to /api/mcp and never echoes the bearer',async()=>{
 const seen:{url:string;init:RequestInit}[]=[];
 const transport=createLiveTransport(ENV,async(url,init)=>{seen.push({url:String(url),init:init??{}});return new Response('nope',{status:503})});
 await assert.rejects(()=>transport('list_setlists',{limit:20,sort:'recent_event'}),(error:unknown)=>{
  // The token lives in exactly one place — the header — and never in a message an operator reads.
  assert.ok(!String((error as Error).message).includes(TOKEN),'the refusal does not echo the bearer');
  return true;
 });
 assert.equal(seen.length,1,'no retry');
 const {url,init}=seen[0];
 assert.equal(new URL(url).pathname,'/api/mcp');
 assert.equal(new URL(url).origin,'https://live.example');
 assert.equal(init.method,'POST');
 assert.equal(init.redirect,'error');
 const headers=init.headers as Record<string,string>;
 assert.equal(headers.Authorization,`Bearer ${TOKEN}`);
 assert.equal(headers['Content-Type'],'application/json');
 assert.equal(headers.Accept,'application/json, text/event-stream');
 assert.ok(init.signal,'the request carries a timeout signal');
 assert.deepEqual(JSON.parse(String(init.body)),{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'list_setlists',arguments:{limit:20,sort:'recent_event'}}});
});

test('a tool result is unwrapped from an SSE reply, and a refusal envelope is an error',async()=>{
 const setlist=fixture<LiveSetlist>('covered.json');
 const sse=(payload:unknown)=>`event: message\ndata: ${JSON.stringify(payload)}\n\n`;
 const ok=createLiveTransport(ENV,async()=>new Response(sse({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify(setlist)}]}}),{status:200,headers:{'content-type':'text/event-stream'}}));
 const imported=await importSetlist('setlist-covered',{transport:ok,...deps()});
 assert.equal(imported.setlist.name,'Shabbat Evening — fully covered');
 assert.deepEqual(imported.unmatched,[]);
 const refused=createLiveTransport(ENV,async()=>new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{isError:true,content:[{type:'text',text:JSON.stringify({ok:false,error:{code:'forbidden',message:'not allowed'}})}]}}),{status:200,headers:{'content-type':'application/json'}}));
 await assert.rejects(()=>refused('get_setlist',{id:'x'}),(error:unknown)=>{
  assert.equal((error as {code?:string}).code,'tool_error');
  assert.ok(!String((error as Error).message).includes(TOKEN));
  return true;
 });
});
