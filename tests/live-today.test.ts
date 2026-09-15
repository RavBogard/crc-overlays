import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchTodayServices,nearestService,parseToday,todaySuggestion,TODAY_URL} from '../lib/live-today.ts';
import {liveSetlistDependencies,MemoryServicesRepository,servicesOperation} from '../lib/service-collections.ts';

/* R4-f — the suggestion is computed here from a fixed body and a fixed clock. Nothing in this
   file reaches the network: every read is driven through a stub `fetch`, and the one place the
   real URL appears is the assertion that the request goes to it with no Authorization header. */

/** The five Yom Kippur services as `today.json` published them on 2026-09-15, trimmed to the
    fields this read uses plus two it must ignore. */
const BODY={schemaVersion:1,generatedAt:'2026-09-15T19:00:37.800Z',services:[
 {setlistId:'kn-alt',name:'Kol Nidre Alternative Service — September 20',serviceType:'kol-nidre-alt',startsAt:'2026-09-20T22:00:00.000Z',book:'crc-machzor-2008',startFolio:98},
 {setlistId:'kn',name:'Kol Nidre — September 20',serviceType:'kol-nidre',startsAt:'2026-09-21T01:00:00.000Z',readerBook:'crc-kol-nidre'},
 {setlistId:'yk',name:'Yom Kippur Morning — September 21',serviceType:'yom-kippur-morning',startsAt:'2026-09-21T15:00:00.000Z'},
 {setlistId:'yizkor',name:'Yizkor — September 21',serviceType:'yizkor',startsAt:'2026-09-21T22:00:00.000Z'},
 {setlistId:'neilah',name:'Neilah — September 21',serviceType:'neilah',startsAt:'2026-09-21T23:00:00.000Z'},
]};

const at=(iso:string)=>Date.parse(iso);
const jsonResponse=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});

test('parseToday keeps the rows that carry an id and a start, and drops the rest',()=>{
 const parsed=parseToday({services:[
  ...BODY.services,
  {name:'no id',startsAt:'2026-09-21T23:00:00.000Z'},
  {setlistId:'no-start',name:'no start'},
  {setlistId:'bad-start',name:'unparseable',startsAt:'not a time'},
  'not an object',
 ]});
 assert.deepEqual(parsed.map(row=>row.setlistId),['kn-alt','kn','yk','yizkor','neilah']);
 assert.equal(parsed[0].startsAtMs,at('2026-09-20T22:00:00.000Z'));
 assert.equal(parsed[1].serviceType,'kol-nidre');
 // A body that is not the file we asked for is an empty list, never a throw.
 for(const junk of [null,undefined,[],'',{services:'no'},{}])assert.deepEqual(parseToday(junk),[]);
});

test('the suggestion is the nearest start in either direction, and a tie goes to the service still to come',()=>{
 const services=parseToday(BODY);
 // Before anything: the first service of the season.
 assert.equal(nearestService(services,at('2026-09-15T19:00:00.000Z'))?.setlistId,'kn-alt');
 // Twenty minutes before Kol Nidre, with the alternative service three hours behind.
 assert.equal(nearestService(services,at('2026-09-21T00:40:00.000Z'))?.setlistId,'kn');
 // During Yom Kippur morning, which began two hours ago: still the nearest.
 assert.equal(nearestService(services,at('2026-09-21T17:00:00.000Z'))?.setlistId,'yk');
 // Exactly between Yizkor (an hour behind) and Neilah (an hour ahead): the one about to start.
 assert.equal(nearestService(services,at('2026-09-21T22:30:00.000Z'))?.setlistId,'neilah');
 // After the last service, and with nothing at all.
 assert.equal(nearestService(services,at('2026-09-22T09:00:00.000Z'))?.setlistId,'neilah');
 assert.equal(nearestService([],at('2026-09-21T22:30:00.000Z')),null);
});

test('the read is a plain public GET, carries no credential, and falls back silently on 404, empty and unreachable',async()=>{
 const seen:{url:string;init:RequestInit}[]=[];
 const ok=(async(url:string|URL|Request,init?:RequestInit)=>{seen.push({url:String(url),init:init??{}});return jsonResponse(BODY)}) as unknown as typeof fetch;
 assert.equal((await todaySuggestion(at('2026-09-21T22:30:00.000Z'),ok))?.setlistId,'neilah');
 assert.equal(seen.length,1);
 assert.equal(seen[0].url,TODAY_URL);
 assert.equal(seen[0].init.method,'GET');
 assert.equal(seen[0].init.redirect,'error');
 assert.equal(seen[0].init.cache,'no-store');
 const headers=seen[0].init.headers as Record<string,string>;
 assert.deepEqual(Object.keys(headers),['Accept'],'no Authorization header on a public file');

 const notFound=(async()=>new Response('nope',{status:404})) as unknown as typeof fetch;
 const emptyServices=(async()=>jsonResponse({schemaVersion:1,services:[]})) as unknown as typeof fetch;
 const malformed=(async()=>new Response('{not json',{status:200})) as unknown as typeof fetch;
 const unreachable=(async()=>{throw new Error('getaddrinfo ENOTFOUND')}) as unknown as typeof fetch;
 for(const stub of [notFound,emptyServices,malformed,unreachable]){
  assert.deepEqual(await fetchTodayServices(stub),[]);
  assert.equal(await todaySuggestion(at('2026-09-21T22:30:00.000Z'),stub),null);
 }
});

/* ---------- the operation ---------- */

async function listWith(suggestion:Awaited<ReturnType<typeof todaySuggestion>>,setlistIds:string[]){
 const original={availability:liveSetlistDependencies.availability,createTransport:liveSetlistDependencies.createTransport,listRecentSetlists:liveSetlistDependencies.listRecentSetlists,todaySuggestion:liveSetlistDependencies.todaySuggestion};
 liveSetlistDependencies.availability=()=>({available:true,reason:'ok'});
 liveSetlistDependencies.createTransport=()=>(async()=>[]) as never;
 liveSetlistDependencies.listRecentSetlists=(async()=>setlistIds.map(id=>({id,name:id,date:null,eventDate:null,trackCount:0,publishedAt:null}))) as typeof liveSetlistDependencies.listRecentSetlists;
 liveSetlistDependencies.todaySuggestion=async()=>suggestion;
 try{return await servicesOperation('list_live_setlists',{},'member:test',new MemoryServicesRepository()) as {setlists:{id:string}[];suggestion:unknown}}
 finally{Object.assign(liveSetlistDependencies,original)}
}

test('list_live_setlists highlights the suggested service, keyed on setlistId, and nothing else',async()=>{
 const neilah=parseToday(BODY).find(row=>row.setlistId==='neilah')!;
 const listed=await listWith(neilah,['yizkor','neilah']);
 assert.deepEqual(listed.suggestion,{setlistId:'neilah',name:'Neilah — September 21',startsAt:'2026-09-21T23:00:00.000Z'});
 assert.deepEqual(listed.setlists.map(row=>row.id),['yizkor','neilah'],'the listing itself is unchanged');

 // A suggestion naming a service this congregation cannot import is no suggestion at all.
 assert.equal((await listWith(neilah,['yizkor'])).suggestion,null);
 // And no file, or a read that throws, leaves the listing intact with no highlight.
 assert.equal((await listWith(null,['yizkor','neilah'])).suggestion,null);
});
