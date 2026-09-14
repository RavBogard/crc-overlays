import assert from 'node:assert/strict';
import test from 'node:test';
import {GET} from '../app/api/catalog/route.ts';
import {catalog} from '../lib/server.ts';
import {liturgyIndex} from '../lib/liturgy-index.ts';

const prior={...process.env};
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)});

function rehearsal(){
 process.env.CRC_AUTHORING_REHEARSAL='1';Object.assign(process.env,{NODE_ENV:'development'});delete process.env.RELAY_URL;
 process.env.CONTROL_KEY='c'.repeat(43);process.env.OUTPUT_KEY='o'.repeat(43);
}
const request=(url:string)=>new Request(url,{headers:{authorization:`Bearer ${process.env.OUTPUT_KEY}`}});
const headerMap=(response:Response)=>Object.fromEntries([...response.headers].map(([key,value])=>[key.toLowerCase(),value]));

/**
 * D14 — the default response is the byte-identical bare `Cue[]` it has always been. The
 * expected headers below are the pre-change set, written out literally so a future edit to
 * the route cannot quietly change what `/output`, the console and Companion receive.
 */
const expectedHeaders=(version:string)=>({'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-crc-catalog-version':version});

test('the catalog still needs a read credential',async()=>{
 rehearsal();
 assert.equal((await GET(new Request('http://localhost/api/catalog'))).status,401);
 assert.equal((await GET(new Request('http://localhost/api/catalog?include=liturgy'))).status,401,'the liturgy envelope is not a way around the credential');
});

test('the default response is byte-identical to the pre-change catalog response',async()=>{
 rehearsal();
 const current=await catalog();
 const response=await GET(request('http://localhost/api/catalog'));
 assert.equal(response.status,200);
 assert.equal(await response.text(),JSON.stringify(current.cues));
 assert.deepEqual(headerMap(response),expectedHeaders(current.version));
 const ignored=await GET(request('http://localhost/api/catalog?include=names&other=1'));
 assert.equal(await ignored.text(),JSON.stringify(current.cues),'an unrecognised include is the default response');
 assert.deepEqual(headerMap(ignored),expectedHeaders(current.version));
});

test('include=liturgy adds the index and keeps the catalog version header',async()=>{
 rehearsal();
 const current=await catalog();
 const response=await GET(request('http://localhost/api/catalog?include=liturgy'));
 assert.equal(response.status,200);
 assert.deepEqual(headerMap(response),expectedHeaders(current.version),'the version header is unchanged in both shapes');
 const body=await response.json();
 assert.deepEqual(Object.keys(body),['version','cues','liturgy']);
 assert.equal(body.version,current.version);
 assert.equal(JSON.stringify(body.cues),JSON.stringify(current.cues),'the cues are the same cues, in the same order');
 assert.deepEqual(body.liturgy,liturgyIndex(current.cues));
 assert.deepEqual(Object.keys(body.liturgy),current.cues.map(cue=>cue.id));
 for(const reference of Object.values(body.liturgy) as Record<string,unknown>[])assert.deepEqual(Object.keys(reference),['unitId','momentId','book','folio']);
});
