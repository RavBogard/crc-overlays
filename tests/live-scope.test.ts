import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod/v4';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {accessStore,canAccess,type AccessMember,type AccessRole,type AccessSessionMember} from '../lib/access';
import {db} from '../lib/database';
import {createAuthoringMcpHandler,type ScopedArea} from '../lib/mcp';
import {hashOpaque} from '../lib/oauth-core';
import {authorizeGet,authorizePost,consentedScope} from '../lib/oauth-http';
import {LIVE_ROLES,effectiveScope,exchangeRefreshToken,oauthStore,roleAllowsScope,tokenVerifier} from '../lib/oauth-store';
import {POST as mcpRoute} from '../app/api/mcp/route';

// V2: crc.live, a separate opt-in scope. Same stubbing precedent as tests/oauth-consent.test.ts.
const ORIGIN='http://localhost:5175';
const RESOURCE=`${ORIGIN}/api/mcp`;
const HANDLE=`crc_req_${'A'.repeat(43)}`;
const SESSION=`${'B'.repeat(43)}`;
const CLIENT_HASH=`0123456789abcdef${'0'.repeat(48)}`;
const REDIRECT='http://127.0.0.1:49152/callback';
const pendingFor=(scope:string)=>({client_id_hash:CLIENT_HASH,redirect_uri:REDIRECT,code_challenge:'challenge',scope,resource:RESOURCE,state:'isolated',client_name:'Claude'});
const member=(role:AccessRole):AccessSessionMember=>({id:`member-${role}`,email:`${role}@rehearsal.invalid`,name:`A ${role}`,role,enabled:true,authMethod:'google',authenticatedAt:0});

async function consent(scope:string,session:AccessSessionMember|null,run:(minted:{scope:string|null})=>Promise<void>){
 const savedStore={...oauthStore},savedSession=accessStore.memberForSession,minted={scope:null as string|null};
 Object.assign(oauthStore,{rateLimit:async()=>true,peekAuthorizationRequest:async()=>pendingFor(scope),consumeAuthorizationRequest:async()=>pendingFor(scope),issueAuthorizationCode:async(request:{scope:string})=>{minted.scope=request.scope;return 'crc_code_value'}});
 accessStore.memberForSession=async()=>session;
 try{await run(minted)}finally{Object.assign(oauthStore,savedStore);accessStore.memberForSession=savedSession}
}
const approve=(fields:Record<string,string>={})=>authorizePost(new Request(`${ORIGIN}/oauth/authorize`,{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/x-www-form-urlencoded',Cookie:`crc_access=${SESSION}`},body:new URLSearchParams({request:HANDLE,decision:'approve',...fields}).toString()}));
const resume=()=>authorizeGet(new Request(`${ORIGIN}/oauth/authorize`,{headers:{Cookie:`crc_oauth_request=${HANDLE}; crc_access=${SESSION}`}}));
const LIVE_BOX=/<input type="checkbox" name="allow_live" value="crc\.live">/;

test('crc.live is gated on the explicit role list, not on the control permission',()=>{
 assert.deepEqual([...LIVE_ROLES],['owner','editor','operator']);
 for(const role of LIVE_ROLES)assert.equal(roleAllowsScope(role,'crc.live'),true);
 // canAccess is permission-based and says yes to 'control' for anything; a role added later must not inherit live control.
 const future='viewer' as AccessRole;
 assert.equal(canAccess(future,'control'),true);
 assert.equal(roleAllowsScope(future,'crc.live'),false);
 assert.equal(roleAllowsScope('operator','crc.authoring'),false);
 assert.equal(roleAllowsScope('editor','crc.authoring'),true);
});

test('consent offers live control as its own unchecked line, only when it was asked for',async()=>{
 await consent('crc.authoring crc.live',member('editor'),async()=>{
  const html=await (await resume()).text();
  assert.match(html,LIVE_BOX);
  assert.doesNotMatch(html,/checked/);
  assert.match(html,/Live control: also let this connection show, take out and clear graphics on the CRC output/);
  assert.match(html,/source search and draft authoring/);
 });
 for(const role of ['owner','operator'] as AccessRole[])await consent('crc.live',member(role),async()=>{
  const html=await (await resume()).text();
  assert.match(html,LIVE_BOX,role);
  assert.doesNotMatch(html,/draft authoring/,'a live-only request does not describe authoring');
 });
 // An authoring-only request is the page it always was.
 await consent('crc.authoring',member('editor'),async()=>{assert.doesNotMatch(await (await resume()).text(),/allow_live|Live control/)});
 // A role outside the list is not offered the line at all.
 await consent('crc.authoring crc.live',{...member('editor'),role:'viewer' as AccessRole},async()=>{assert.doesNotMatch(await (await resume()).text(),/allow_live/)});
});

test('the grant is requested ∩ consented ∩ what the role allows',async()=>{
 assert.equal(consentedScope('crc.authoring crc.live offline_access','editor',false),'crc.authoring offline_access');
 assert.equal(consentedScope('crc.authoring crc.live offline_access','editor',true),'crc.authoring crc.live offline_access');
 assert.equal(consentedScope('crc.authoring','editor',true),'crc.authoring','ticking a line that was never offered grants nothing extra');
 assert.equal(consentedScope('crc.authoring crc.live','operator',true),'crc.live');
 assert.equal(consentedScope('crc.live offline_access','operator',false),null);
 await consent('crc.authoring crc.live',member('editor'),async minted=>{assert.equal((await approve()).status,303);assert.equal(minted.scope,'crc.authoring')});
 await consent('crc.authoring crc.live',member('editor'),async minted=>{assert.equal((await approve({allow_live:'crc.live'})).status,303);assert.equal(minted.scope,'crc.authoring crc.live')});
 await consent('crc.live',member('operator'),async minted=>{assert.equal((await approve({allow_live:'crc.live'})).status,303);assert.equal(minted.scope,'crc.live')});
 await consent('crc.authoring crc.live',member('operator'),async minted=>{
  const response=await approve();
  assert.equal(response.status,403);assert.equal(minted.scope,null);
  assert.match(await response.text(),/can’t author graphics, so this connection can have live control only\. Tick Live control to allow it, or Deny\./);
 });
 await consent('crc.live',member('editor'),async minted=>{
  const response=await approve();
  assert.equal(response.status,400);assert.equal(minted.scope,null);
  assert.match(await response.text(),/Nothing was chosen to allow\./);
 });
 await consent('crc.authoring',member('operator'),async()=>{
  const response=await approve({allow_live:'crc.live'});
  assert.equal(response.status,403);
  assert.match(await response.text(),/Your role here can’t author graphics\. Ask an administrator for Editor access\./);
 });
});

type QueryStub=(sql:string,values?:unknown[])=>{rows:unknown[]};
async function withDatabase(query:QueryStub,stored:AccessMember|null,run:()=>Promise<void>){
 const savedQuery=db.query,savedConnect=db.connect,savedMember=accessStore.memberById;
 Object.assign(db,{query:async(sql:string,values?:unknown[])=>query(sql,values),connect:async()=>({query:async(sql:string,values?:unknown[])=>query(sql,values),release(){}})});
 accessStore.memberById=async()=>stored;
 try{await run()}finally{Object.assign(db,{query:savedQuery,connect:savedConnect});accessStore.memberById=savedMember}
}
const ACTOR='mcp:0123456789abcdef:member:member-x';
const tokenRow=(scope:string)=>({client_id_hash:CLIENT_HASH,family_hash:'family-one',scope,resource:RESOURCE,actor:ACTOR,expires:Date.now()+60_000});
const verify=async(scope:string,role:AccessRole|null,enabled=true)=>{let info:AuthInfo|Error=Error('unset');await withDatabase(()=>({rows:[tokenRow(scope)]}),role?{...member(role),enabled}:null,async()=>{try{info=await tokenVerifier.verifyAccessToken('crc_at_x')}catch(error){info=error as Error}});return info as AuthInfo|Error};

test('every request re-checks the member, and a role change ends exactly the matching scope',async()=>{
 const both=await verify('crc.authoring crc.live offline_access','editor') as AuthInfo;
 assert.deepEqual(both.scopes,['crc.authoring','crc.live','offline_access']);
 const demoted=await verify('crc.authoring crc.live offline_access','operator') as AuthInfo;
 assert.deepEqual(demoted.scopes,['crc.live','offline_access'],'moved to Operator: authoring ends, live control stays');
 assert.ok(await verify('crc.authoring','operator') instanceof Error,'an authoring-only token has nothing left');
 assert.deepEqual((await verify('crc.live','operator') as AuthInfo).scopes,['crc.live']);
 assert.ok(await verify('crc.live','operator',false) instanceof Error,'a removed member ends every scope');
 assert.ok(await verify('crc.live',null) instanceof Error);
 assert.ok(await verify('crc.live','viewer' as AccessRole) instanceof Error,'a role off the live list ends live control');
 // Old rows, exactly as stored, still validate.
 assert.deepEqual((await verify('crc.authoring','editor') as AuthInfo).scopes,['crc.authoring']);
 assert.deepEqual((await verify('crc.authoring offline_access','editor') as AuthInfo).scopes,['crc.authoring','offline_access']);
 assert.ok(await verify('offline_access crc.authoring','editor') instanceof Error,'a stored scope must already be canonical');
 // The relay controller id: stable for the family, not the family hash itself.
 const again=await verify('crc.live','editor') as AuthInfo;
 const controller=(both.extra as {liveController:string}).liveController;
 assert.match(controller,/^mcp-[0-9a-f]{40}$/);assert.equal((again.extra as {liveController:string}).liveController,controller);assert.ok(!controller.includes('family-one'));
 assert.equal(effectiveScope('crc.live offline_access','editor'),'crc.live offline_access');
});

test('a refresh carries only what the role still allows',async()=>{
 const inserted:unknown[][]=[];
 const query:QueryStub=(sql,values)=>{if(sql.startsWith('INSERT'))inserted.push(values??[]);return {rows:sql.startsWith('SELECT family_hash')?[{family_hash:'family',client_id_hash:hashOpaque('client'),scope:'crc.authoring crc.live offline_access',resource:RESOURCE,actor:ACTOR}]:[]}};
 await withDatabase(query,member('operator'),async()=>{
  const rotated=await exchangeRefreshToken({refreshToken:'crc_rt_value',clientId:'client',resource:RESOURCE});
  assert.equal(rotated.scope,'crc.live offline_access');
  assert.deepEqual(inserted.map(values=>values[3]),['crc.live offline_access','crc.live offline_access']);
 });
});

// A fixture area with one live-scoped tool: the gate is proved before V3 registers the real ones.
const LIVE_FIXTURE:ScopedArea={scope:'crc.live',register:register=>register('test_live_probe','Test-only live tool.',z.object({}).strict(),{readOnlyHint:true})};
const auth=(scopes:string[])=>({token:'test',clientId:'client',scopes,expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}}) satisfies AuthInfo;
const call=(name:string,args:Record<string,unknown>={})=>new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{workspace:'crc',...args}}})});
async function payload(response:Response):Promise<unknown>{const text=await response.text();if(response.headers.get('content-type')?.includes('application/json'))return JSON.parse(text);const data=text.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);assert.ok(data,'SSE response has a data event');return JSON.parse(data)}
async function toolText(response:Response){const body=await payload(response) as {result:{isError?:boolean;content:{text:string}[]}};return {isError:body.result.isError===true,text:body.result.content[0].text}}

test('each tool needs its own scope: authoring-only cannot go live, live-only cannot author',async()=>{
 const ran:string[]=[];const handler=createAuthoringMcpHandler(async operation=>{ran.push(operation);return {ok:true,workspace:{rehearsal:false}}},undefined,[LIVE_FIXTURE]);
 const authoringOnly=await toolText(await handler.fetch(call('test_live_probe'),{authInfo:auth(['crc.authoring','offline_access'])}));
 assert.equal(authoringOnly.isError,true);
 assert.match(authoringOnly.text,/^This CRC connection wasn’t granted live control, so test_live_probe can’t run\. Nothing was changed\./);
 assert.match(authoringOnly.text,/insufficient_scope: needs crc\.live/);
 const liveOnly=await toolText(await handler.fetch(call('list_templates'),{authInfo:auth(['crc.live'])}));
 assert.equal(liveOnly.isError,true);assert.match(liveOnly.text,/wasn’t granted authoring, so list_templates can’t run.*insufficient_scope: needs crc\.authoring/);
 const write=await toolText(await handler.fetch(call('create_draft',{name:'n',title:'t',layout:'bottom',templateCueId:'x',content:{mode:'custom',text:'hi'}}),{authInfo:auth(['crc.live'])}));
 assert.equal(write.isError,true);
 assert.deepEqual(ran,[],'no refused call reached an operation');
 // The granted side works, and saying which congregation this is needs no particular scope.
 assert.equal((await toolText(await handler.fetch(call('test_live_probe'),{authInfo:auth(['crc.live'])}))).isError,false);
 assert.equal((await toolText(await handler.fetch(call('get_workspace'),{authInfo:auth(['crc.live'])}))).isError,false);
 assert.deepEqual(ran,['test_live_probe','get_workspace']);
});

test('the MCP endpoint lets a live-only token in and still challenges exactly as before',async()=>{
 const listRequest=(headers:Record<string,string>)=>new Request(RESOURCE,{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
 const unauthenticated=await mcpRoute(listRequest({}));
 assert.equal(unauthenticated.status,401);
 assert.equal(unauthenticated.headers.get('www-authenticate'),`Bearer error="invalid_token", error_description="Missing Authorization header", scope="crc.authoring", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`);
 await withDatabase(()=>({rows:[tokenRow('crc.live')]}),member('operator'),async()=>{
  const response=await mcpRoute(listRequest({Authorization:'Bearer crc_at_live'}));
  assert.equal(response.status,200);
  const names=((await payload(response)) as {result:{tools:{name:string}[]}}).result.tools.map(tool=>tool.name);
  assert.ok(names.includes('create_draft'),'every tool is listed; the call is what is refused');
 });
 await withDatabase(()=>({rows:[tokenRow('crc.authoring')]}),member('operator'),async()=>{
  assert.equal((await mcpRoute(listRequest({Authorization:'Bearer crc_at_demoted'}))).status,401,'an authoring-only token for an Operator is refused at the door');
 });
});
