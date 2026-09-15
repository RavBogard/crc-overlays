import assert from 'node:assert/strict';
import test from 'node:test';
import {GET} from '../app/api/now/route.ts';
import {publicNow,resetPublicNowMemo,PUBLIC_NOW_MEMO_MS} from '../lib/server.ts';
import {namesPanelCues} from '../lib/names-list.ts';
import {siddurLibrary} from '../lib/source-library.ts';
import {loadMoments} from '../lib/liturgy-index.ts';
import type {Cue} from '../lib/player.ts';

const prior={...process.env};
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);resetPublicNowMemo()});

const librarySource=siddurLibrary.sources[0];
// The producer's moments table is committed data that grows; whether this particular unit has a
// moment is the table's business, not this endpoint's. Read the answer from the same table the
// route reads so the assertion keeps testing the shape of the response, not the vocabulary.
const libraryMoment=loadMoments().find(entry=>entry.unitId===librarySource.authority.unitId)?.momentId??null;
const cue=(value:Record<string,unknown>)=>value as unknown as Cue;
const published=cue({id:'published',name:'Barechu',layout:'left',texts:{textTitle:'Barechu'},authoring:{draftId:'d',draftVersion:1,origin:'canonical',sourceIds:[librarySource.id],feedSha256:'f',unitSha256:{}}});
const namesPanel=namesPanelCues('col-1',{title:'Mi Shebeirach',perPanel:8,layout:'left',rows:[{he:'',en:'A name'}],updatedAt:1,updatedBy:'editor'})[0];
const deps=(live:string|null,cues:Cue[]=[published,namesPanel],updated=1_757_000_000_000)=>({snapshot:async()=>({cue:live,updated,revision:7,mode:'animate',cuePayload:{texts:{he:'a name'}},catalogVersion:'abc123'}),catalog:async()=>({cues})});

const NOW_URL='https://crc-overlays.example/api/now';
const request=(search='')=>new Request(`${NOW_URL}${search}`);

const walk=(value:unknown,seen:string[]=[]):string[]=>{
 if(Array.isArray(value))for(const item of value)walk(item,seen);
 else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){seen.push(key);walk(item,seen)}
 return seen;
};

test('the endpoint does not advertise itself when the flag is unset',async()=>{
 resetPublicNowMemo();delete process.env.OVERLAYS_PUBLIC_NOW;
 const response=await GET(request());
 assert.equal(response.status,404);
 assert.deepEqual(await response.json(),{error:'not_found'});
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 process.env.OVERLAYS_PUBLIC_NOW='0';
 assert.equal((await GET(request())).status,404,'only the exact value 1 turns it on');
});

test('a query string is refused so exactly one edge cache key can ever exist',async()=>{
 // `?x=<random>` would otherwise miss the edge cache on every request and put every one of
 // those misses on the relay. The endpoint takes no parameters, so any are a 404 `no-store`.
 resetPublicNowMemo();process.env.OVERLAYS_PUBLIC_NOW='1';
 for(const search of ['?x=1','?include=liturgy','?x=1&y=2']){
  const response=await GET(request(search));
  assert.equal(response.status,404,`${search||'(empty query)'} must not be answered`);
  assert.deepEqual(await response.json(),{error:'not_found'});
  assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
});

test('a library-backed cue answers its liturgical position and nothing else',async()=>{
 resetPublicNowMemo();
 const value=await publicNow(deps('published'));
 assert.deepEqual(value,{unitId:librarySource.authority.unitId,momentId:libraryMoment,book:librarySource.authority.id.split(':')[1],folio:(librarySource.metadata.folios as number[])[0],updatedAt:1_757_000_000_000,pollSeconds:5});
 assert.deepEqual(Object.keys(value),['unitId','momentId','book','folio','updatedAt','pollSeconds']);
});

test('a names panel and a cleared output are all nulls with a live updatedAt',async()=>{
 resetPublicNowMemo();
 const names=await publicNow(deps(namesPanel.id));
 assert.deepEqual(names,{unitId:null,momentId:null,book:null,folio:null,updatedAt:1_757_000_000_000,pollSeconds:5});
 resetPublicNowMemo();
 const cleared=await publicNow(deps(null));
 assert.deepEqual(cleared,{unitId:null,momentId:null,book:null,folio:null,updatedAt:1_757_000_000_000,pollSeconds:5});
 resetPublicNowMemo();
 const never=await publicNow(deps(null,[published,namesPanel],0),1_757_000_009_000);
 assert.equal(never.updatedAt,1_757_000_009_000,'an output that has never moved still answers a live timestamp');
});

test('the response can never carry a name, a title or anything else about the graphic',async()=>{
 resetPublicNowMemo();process.env.OVERLAYS_PUBLIC_NOW='1';
 await publicNow(deps(namesPanel.id));                       // primes the memo so the route reads no relay
 const response=await GET(request());
 assert.equal(response.status,200);
 const body=await response.json();
 const keys=walk(body);
 for(const forbidden of ['name','title','texts','cue','revision','renderers','controllers','catalogVersion'])assert.equal(keys.includes(forbidden),false,`/api/now must never carry ${forbidden}`);
 assert.deepEqual(keys,['unitId','momentId','book','folio','updatedAt','pollSeconds']);
 assert.equal(response.headers.get('Cache-Control'),'public, max-age=2, s-maxage=2, stale-while-revalidate=10');
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
 assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 assert.equal(response.headers.get('Content-Type'),'application/json');
});

test('a failed read is a 503 that is never cached, and is never memoized',async()=>{
 resetPublicNowMemo();process.env.OVERLAYS_PUBLIC_NOW='1';
 let reads=0;
 const failing={snapshot:async()=>{reads++;throw Error('Live relay unavailable')},catalog:async()=>({cues:[published]})};
 await assert.rejects(publicNow(failing));
 await assert.rejects(publicNow(failing));   // a failure is retried rather than served from the memo
 assert.equal(reads,2);
 const response=await GET(request());                                  // the default deps have no relay and no database here
 assert.equal(response.status,503);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
});

test('the two-second memo collapses a burst of requests into one relay read',async()=>{
 resetPublicNowMemo();
 let reads=0;
 const counting={snapshot:async()=>{reads++;return {cue:'published',updated:1_757_000_000_000}},catalog:async()=>({cues:[published]})};
 const at=1_757_000_100_000;
 const burst=await Promise.all(Array.from({length:10},()=>publicNow(counting,at)));
 assert.equal(reads,1,'ten concurrent requests make one snapshot read');
 assert.equal(new Set(burst.map(item=>JSON.stringify(item))).size,1);
 await publicNow(counting,at+PUBLIC_NOW_MEMO_MS-1);
 assert.equal(reads,1,'inside the memo window nothing reaches the relay');
 await publicNow(counting,at+PUBLIC_NOW_MEMO_MS);
 assert.equal(reads,2,'the memo expires after two seconds');
});
