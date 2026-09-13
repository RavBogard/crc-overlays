import assert from 'node:assert/strict';
import test from 'node:test';
import {POST} from '../app/api/source-review/route.ts';

const prior={...process.env};
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)});

test('source review route is author scoped and bounded',async()=>{
 process.env.CRC_AUTHORING_REHEARSAL='1';Object.assign(process.env,{NODE_ENV:'development'});delete process.env.RELAY_URL;process.env.CONTROL_KEY='c'.repeat(43);process.env.OUTPUT_KEY='o'.repeat(43);
 const request=(authorization:string,body:string)=>new Request('http://localhost/api/source-review',{method:'POST',headers:{authorization,origin:'http://localhost','content-type':'application/json'},body});
 assert.equal((await POST(request(`Bearer ${process.env.OUTPUT_KEY}`,JSON.stringify({operation:'list',input:{}})))).status,401,'playback/output credentials cannot review sources');
 assert.equal((await POST(request(`Bearer ${process.env.CONTROL_KEY}`,JSON.stringify({operation:'list',input:{}})))).status,200,'transitional author credential remains scoped to authoring');
 assert.equal((await POST(request(`Bearer ${process.env.CONTROL_KEY}`,'x'.repeat(131073)))).status,413);
 const malformed=await POST(request(`Bearer ${process.env.CONTROL_KEY}`,'{'));assert.equal(malformed.status,400);assert.equal((await malformed.json()).code,'invalid_json');
});
