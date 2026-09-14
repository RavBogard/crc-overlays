import assert from 'node:assert/strict';
import test from 'node:test';
import {POST} from '../app/api/source-review/route.ts';
import {accessStore,type AccessSessionMember} from '../lib/access.ts';

const prior={...process.env};
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)});

test('source review route is author scoped and bounded',async()=>{
 process.env.CRC_AUTHORING_REHEARSAL='1';Object.assign(process.env,{NODE_ENV:'development'});delete process.env.RELAY_URL;process.env.CONTROL_KEY='c'.repeat(43);process.env.OUTPUT_KEY='o'.repeat(43);
 const request=(credential:{authorization?:string;cookie?:string},body:string)=>new Request('http://localhost/api/source-review',{method:'POST',headers:{...(credential.authorization?{authorization:credential.authorization}:{}),...(credential.cookie?{cookie:credential.cookie}:{}),origin:'http://localhost','content-type':'application/json'},body});
 const editor:AccessSessionMember={id:'member-editor',email:'editor@rehearsal.invalid',name:'Ellie Editor',role:'editor',enabled:true,authMethod:'password',authenticatedAt:0};
 const savedSession=accessStore.memberForSession;accessStore.memberForSession=async()=>editor;
 const session={cookie:`crc_access=${'B'.repeat(43)}`};
 try{
  assert.equal((await POST(request({authorization:`Bearer ${process.env.OUTPUT_KEY}`},JSON.stringify({operation:'list',input:{}})))).status,401,'playback/output credentials cannot review sources');
  assert.equal((await POST(request({authorization:`Bearer ${process.env.CONTROL_KEY}`},JSON.stringify({operation:'list',input:{}})))).status,401,'the shared control key no longer authors (2026-09-14)');
  assert.equal((await POST(request(session,JSON.stringify({operation:'list',input:{}})))).status,200,'an Editor session reviews sources');
  assert.equal((await POST(request(session,'x'.repeat(131073)))).status,413);
  const malformed=await POST(request(session,'{'));assert.equal(malformed.status,400);assert.equal((await malformed.json()).code,'invalid_json');
 }finally{accessStore.memberForSession=savedSession}
});
