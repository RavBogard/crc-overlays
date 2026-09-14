import assert from 'node:assert/strict';
import test from 'node:test';
import {accessStore,type AccessMember,type AccessSessionMember} from '../lib/access';
import {db} from '../lib/database';
import {hashOpaque} from '../lib/oauth-core';
import {authorizeGet,authorizePost} from '../lib/oauth-http';
import {exchangeRefreshToken,oauthStore,tokenVerifier} from '../lib/oauth-store';

const ORIGIN='http://localhost:5175';
const RESOURCE=`${ORIGIN}/api/mcp`;
const HANDLE=`crc_req_${'A'.repeat(43)}`;
const SESSION=`${'B'.repeat(43)}`;
const CLIENT_HASH=`0123456789abcdef${'0'.repeat(48)}`;
const REDIRECT='http://127.0.0.1:49152/callback';
const pending={client_id_hash:CLIENT_HASH,redirect_uri:REDIRECT,code_challenge:'challenge',scope:'crc.authoring',resource:RESOURCE,state:'isolated',client_name:'Claude'};
const editor:AccessSessionMember={id:'member-editor',email:'editor@rehearsal.invalid',name:'Ellie Editor',role:'editor',enabled:true,authMethod:'google',authenticatedAt:0};
const operator:AccessSessionMember={...editor,id:'member-operator',email:'op@rehearsal.invalid',name:'Ozzy Operator',role:'operator'};

type StorePatch=Partial<typeof oauthStore>;
/** The `withStoreMethods` precedent from tests/access.test.ts: no Postgres, no network. */
async function withStubs(patch:StorePatch,session:AccessSessionMember|null,run:()=>Promise<void>){
 const savedStore={...oauthStore},savedSession=accessStore.memberForSession;
 Object.assign(oauthStore,{rateLimit:async()=>true,peekAuthorizationRequest:async()=>pending,consumeAuthorizationRequest:async()=>pending,issueAuthorizationCode:async()=>'crc_code_value',...patch});
 accessStore.memberForSession=async()=>session;
 try{await run()}finally{Object.assign(oauthStore,savedStore);accessStore.memberForSession=savedSession}
}
const approve=(cookie?:string)=>new Request(`${ORIGIN}/oauth/authorize`,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/x-www-form-urlencoded',...(cookie?{Cookie:cookie}:{})},body:new URLSearchParams({request:HANDLE,decision:'approve'}).toString()});
const resume=(cookie:string)=>new Request(`${ORIGIN}/oauth/authorize`,{headers:{Cookie:cookie}});

test('approving without a workspace session parks the request and asks for sign-in',async()=>{
 await withStubs({},null,async()=>{
  const response=await authorizePost(approve());
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/access?next=%2Foauth%2Fauthorize');
  const cookie=response.headers.get('set-cookie')??'';
  assert.match(cookie,new RegExp(`^crc_oauth_request=${HANDLE}; HttpOnly; SameSite=Lax; Path=/oauth/authorize; Max-Age=600$`));
 });
});

test('an operator cannot author graphics and is told what to ask for',async()=>{
 await withStubs({},operator,async()=>{
  const response=await authorizePost(approve(`crc_access=${SESSION}`));
  assert.equal(response.status,403);
  const html=await response.text();
  assert.match(html,/Your role here can’t author graphics\. Ask an administrator for Editor access\./);
  assert.match(html,/Approving as <strong>Ozzy Operator<\/strong> \(op@rehearsal\.invalid\)/);
  assert.doesNotMatch(html,/bootstrap_key/);
 });
});

test('an editor approves and the code carries the client and the member',async()=>{
 let actor='';
 await withStubs({issueAuthorizationCode:async(_request,minted)=>{actor=minted;return 'crc_code_value'}},editor,async()=>{
  const response=await authorizePost(approve(`crc_access=${SESSION}`));
  assert.equal(response.status,303);
  const location=new URL(response.headers.get('location')!);
  assert.equal(location.searchParams.get('code'),'crc_code_value');
  assert.equal(location.searchParams.get('state'),'isolated');
  assert.equal(actor,'mcp:0123456789abcdef:member:member-editor');
  assert.ok(actor.length<=80);
  assert.match(response.headers.get('set-cookie')??'',/crc_oauth_request=; .*Max-Age=0/);
 });
});

test('returning from sign-in resumes the parked request and names the member',async()=>{
 await withStubs({},editor,async()=>{
  const response=await authorizeGet(resume(`crc_oauth_request=${HANDLE}; crc_access=${SESSION}`));
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/<h1>Connect Claude<\/h1>/);
  assert.match(html,/Approving as <strong>Ellie Editor<\/strong> \(editor@rehearsal\.invalid\)/);
  assert.match(html,new RegExp(`name="request" value="${HANDLE}"`));
  assert.match(response.headers.get('set-cookie')??'',/crc_oauth_request=; .*Max-Age=0/);
 });
});

test('a resume with nothing pending explains that the connection must be restarted',async()=>{
 // The store's row types do not admit null, though a missing row is exactly what it returns.
 await withStubs({peekAuthorizationRequest:(async()=>null) as unknown as typeof oauthStore.peekAuthorizationRequest},editor,async()=>{
  const response=await authorizeGet(resume(`crc_oauth_request=${HANDLE}`));
  assert.equal(response.status,400);
  assert.match(await response.text(),/Sign-in didn’t complete\. Start the connection again from your MCP client\./);
 });
});

test('the first consent page asks for no key and no password',async()=>{
 await withStubs({getClient:async()=>({client_id_hash:CLIENT_HASH,redirect_uris:[REDIRECT],client_name:'Claude'}),createAuthorizationRequest:async()=>HANDLE},null,async()=>{
  const query=new URLSearchParams({client_id:'crc_client_x',redirect_uri:REDIRECT,response_type:'code',scope:'crc.authoring',resource:RESOURCE,state:'isolated',code_challenge_method:'S256',code_challenge:'A'.repeat(43)});
  const response=await authorizeGet(new Request(`${ORIGIN}/oauth/authorize?${query}`));
  assert.equal(response.status,200);
  const html=await response.text();
  assert.doesNotMatch(html,/bootstrap_key|type="password"/);
  assert.match(html,/Approve to connect as the member you’re signed in to this workspace as\./);
 });
});

type QueryStub=(sql:string)=>{rows:unknown[]};
async function withDatabase(query:QueryStub,member:AccessMember|null,run:()=>Promise<void>){
 const savedQuery=db.query,savedConnect=db.connect,savedMember=accessStore.memberById;
 Object.assign(db,{
  query:async(sql:string)=>query(sql),
  connect:async()=>({query:async(sql:string)=>query(sql),release(){}}),
 });
 accessStore.memberById=async()=>member;
 try{await run()}finally{Object.assign(db,{query:savedQuery,connect:savedConnect});accessStore.memberById=savedMember}
}
const tokenRow=(actor:string)=>({client_id_hash:CLIENT_HASH,scope:'crc.authoring',resource:RESOURCE,actor,expires:Date.now()+60_000});
const accessQuery=(actor:string):QueryStub=>()=>({rows:[tokenRow(actor)]});
const refreshQuery=(actor:string):QueryStub=>sql=>({rows:sql.startsWith('SELECT family_hash')?[{family_hash:'family',client_id_hash:hashOpaque('client'),scope:'crc.authoring',resource:RESOURCE,actor}]:[]});

test('an access token is only as good as the member who approved it',async()=>{
 const actor='mcp:0123456789abcdef:member:member-editor';
 // A token minted by the retired shared key names no member at all.
 await withDatabase(accessQuery('mcp:0123456789abcdef'),{...editor},async()=>{
  await assert.rejects(()=>tokenVerifier.verifyAccessToken('crc_at_legacy'),/Invalid or expired token/);
 });
 await withDatabase(accessQuery(actor),{...editor,enabled:false},async()=>{
  await assert.rejects(()=>tokenVerifier.verifyAccessToken('crc_at_disabled'),/Invalid or expired token/);
 });
 await withDatabase(accessQuery(actor),null,async()=>{
  await assert.rejects(()=>tokenVerifier.verifyAccessToken('crc_at_removed'),/Invalid or expired token/);
 });
 await withDatabase(accessQuery(actor),{...operator,role:'operator'},async()=>{
  await assert.rejects(()=>tokenVerifier.verifyAccessToken('crc_at_operator'),/Invalid or expired token/);
 });
 await withDatabase(accessQuery(actor),{...editor},async()=>{
  const info=await tokenVerifier.verifyAccessToken('crc_at_editor');
  assert.deepEqual(info.scopes,['crc.authoring']);
  assert.equal((info.extra as {actor:string}).actor,actor);
 });
});

test('a refresh exchange stops when the member is gone, disabled or demoted',async()=>{
 const actor='mcp:0123456789abcdef:member:member-editor';
 const exchange=()=>exchangeRefreshToken({refreshToken:'crc_rt_value',clientId:'client',resource:RESOURCE});
 await withDatabase(refreshQuery('mcp:0123456789abcdef'),{...editor},async()=>{await assert.rejects(exchange,/invalid_grant/)});
 await withDatabase(refreshQuery(actor),null,async()=>{await assert.rejects(exchange,/invalid_grant/)});
 await withDatabase(refreshQuery(actor),{...editor,enabled:false},async()=>{await assert.rejects(exchange,/invalid_grant/)});
 await withDatabase(refreshQuery(actor),{...operator,role:'operator'},async()=>{await assert.rejects(exchange,/invalid_grant/)});
});
