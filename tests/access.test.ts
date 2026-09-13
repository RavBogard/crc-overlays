import assert from 'node:assert/strict';
import {test} from 'node:test';
import {POST} from '../app/api/access/route.ts';
import {
 ACCESS_COOKIE,
 PgAccessStore,
 accessStore,
 authorizeRequest,
 canAccess,
 cookieToken,
 currentMember,
 issueSession,
 sameSiteWrite,
 sessionCookie,
 secretEqual,
 tokenHash,
 type AccessMember,
 type AccessStore,
} from '../lib/access.ts';

const owner:AccessMember={id:'owner-1',email:'owner@example.test',name:'Owner',role:'owner',enabled:true};
const editor:AccessMember={id:'editor-1',email:'editor@example.test',name:'Editor',role:'editor',enabled:true};
const operator:AccessMember={id:'operator-1',email:'operator@example.test',name:'Operator',role:'operator',enabled:true};
const validToken='a'.repeat(43);

type TestStore=AccessStore;
async function withStoreMethods<T>(overrides:Partial<TestStore>,run:()=>Promise<T>){
 const saved:TestStore={
  memberForSession:accessStore.memberForSession,
  createSession:accessStore.createSession,
  deleteSession:accessStore.deleteSession,
  redeem:accessStore.redeem,
  invite:accessStore.invite,
  list:accessStore.list,
  disable:accessStore.disable,
  allowAttempt:accessStore.allowAttempt,
  bootstrap:accessStore.bootstrap,
 };
 Object.assign(accessStore,overrides);
 try{return await run()}finally{Object.assign(accessStore,saved)}
}

function jsonRequest(body:unknown,origin='https://graphics.test'){
 return new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
}

test('role matrix keeps publishing and administration away from operators',()=>{
 const expected={
  owner:{read:true,control:true,author:true,owner:true},
  editor:{read:true,control:true,author:true,owner:false},
  operator:{read:true,control:true,author:false,owner:false},
 } as const;
 for(const member of [owner,editor,operator])for(const permission of ['read','control','author','owner'] as const)
  assert.equal(canAccess(member.role,permission),expected[member.role][permission],`${member.role} ${permission}`);
});

test('cookie writes require the exact origin and session cookies are tightly scoped',()=>{
 const crossSite=jsonRequest({action:'logout'},'https://evil.test');
 assert.equal(sameSiteWrite(crossSite),false);
 assert.equal(sameSiteWrite(jsonRequest({action:'logout'})),true);
 assert.equal(sameSiteWrite(new Request('https://graphics.test/api/access',{method:'POST'})),false);
 const cookie=sessionCookie(validToken,crossSite);
 assert.match(cookie,new RegExp(`^${ACCESS_COOKIE}=${validToken};`));
 assert.match(cookie,/HttpOnly/);
 assert.match(cookie,/SameSite=Strict/);
 assert.match(cookie,/Path=\//);
 assert.match(cookie,/Max-Age=2592000/);
 assert.match(cookie,/Secure/);
 assert.match(sessionCookie('',crossSite,true),/Max-Age=0/);
 assert.equal(cookieToken(new Request('https://graphics.test',{headers:{cookie:`other=x; ${ACCESS_COOKIE}=${validToken}; tail=y`}})),validToken);
});

test('access POST rejects cross-site state changes before consulting access storage',async()=>{
 let touched=false;
 await withStoreMethods({
  memberForSession:async()=>{touched=true;return owner},
  deleteSession:async()=>{touched=true},
 },async()=>{
  const response=await POST(jsonRequest({action:'logout'},'https://evil.test'));
  assert.equal(response.status,403);
  assert.equal(touched,false);
  assert.deepEqual(await response.json(),{error:'Open this action from the same website.'});
 });
});

test('invitation redemption creates one session and the same link cannot be redeemed twice',async()=>{
 const redeemed=new Set<string>();
 const sessions:string[]=[];
 await withStoreMethods({
  allowAttempt:async()=>true,
  redeem:async(hash:string)=>{
   if(redeemed.has(hash))return null;
   redeemed.add(hash);
   return editor;
  },
  createSession:async(hash:string)=>{sessions.push(hash)},
 },async()=>{
  const first=await POST(jsonRequest({action:'redeem',token:validToken}));
  assert.equal(first.status,200);
  assert.equal((await first.json()).user.id,editor.id);
  assert.match(first.headers.get('set-cookie')||'',new RegExp(`^${ACCESS_COOKIE}=`));
  assert.equal(redeemed.has(tokenHash(validToken)),true,'only the invite hash reaches storage');
  assert.equal(sessions.length,1);

  const replay=await POST(jsonRequest({action:'redeem',token:validToken}));
  assert.equal(replay.status,401);
  assert.match((await replay.json()).error,/already used/);
  assert.equal(sessions.length,1,'a replay cannot create another session');
 });
});

test('Postgres redemption uses an atomic one-time update before loading the member',async()=>{
 let used=false;
 const statements:string[]=[];
 const client={
  async query(sql:string,params?:unknown[]){
   statements.push(sql);
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   if(sql.startsWith('UPDATE access_links SET used_at=')){
    assert.match(sql,/used_at IS NULL/);
    assert.match(sql,/expires_at>\$2/);
    if(used)return {rows:[]};
    used=true;
    return {rows:[{member_id:editor.id}]};
   }
   if(sql.startsWith('SELECT id,email,name,role,enabled FROM access_members')){
    assert.match(sql,/enabled=true/);
    assert.deepEqual(params,[editor.id]);
    return {rows:[editor]};
   }
   throw new Error(`unexpected SQL: ${sql}`);
  },
  release(){},
 };
 const store=new PgAccessStore();
 Reflect.set(store,'db',async()=>({connect:async()=>client}));
 assert.equal((await store.redeem(tokenHash(validToken),1000))?.id,editor.id);
 assert.equal(await store.redeem(tokenHash(validToken),1001),null);
 assert.equal(statements.filter(sql=>sql==='COMMIT').length,2);
});

test('bootstrap is serialized and permanently closes after the first owner',async()=>{
 let ownerExists=false;
 let inserts=0;
 const statements:string[]=[];
 const client={
  async query(sql:string){
   statements.push(sql);
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('LOCK TABLE'))return {rows:[]};
   if(sql.startsWith("SELECT id FROM access_members WHERE role='owner'"))return {rows:ownerExists?[{id:owner.id}]:[]};
   if(sql.startsWith('INSERT INTO access_members')){ownerExists=true;inserts++;return {rows:[owner]}}
   if(sql.startsWith('DELETE FROM access_sessions')||sql.startsWith('DELETE FROM access_links'))return {rows:[]};
   throw new Error(`unexpected SQL: ${sql}`);
  },
  release(){},
 };
 const store=new PgAccessStore();
 Reflect.set(store,'db',async()=>({connect:async()=>client}));
 assert.equal((await store.bootstrap(owner.email,owner.name))?.id,owner.id);
 assert.equal(await store.bootstrap('second@example.test','Second'),null);
 assert.equal(inserts,1);
 assert.equal(statements.filter(sql=>sql.startsWith('LOCK TABLE access_members')).length,2);
 assert.equal(statements.at(-1),'ROLLBACK');
});

test('dedicated bootstrap key takes precedence over the legacy control key',async()=>{
 const before={bootstrap:process.env.ACCESS_BOOTSTRAP_KEY,control:process.env.CONTROL_KEY};
 process.env.ACCESS_BOOTSTRAP_KEY='bootstrap-only';process.env.CONTROL_KEY='legacy-control';
 let calls=0;
 try{
  await withStoreMethods({
   allowAttempt:async()=>true,
   bootstrap:async()=>{calls++;return owner},
   createSession:async()=>{},
  },async()=>{
   const legacy=await POST(jsonRequest({action:'bootstrap',key:'legacy-control',email:owner.email,name:owner.name}));
   assert.equal(legacy.status,401);
   assert.equal(calls,0);
   const dedicated=await POST(jsonRequest({action:'bootstrap',key:'bootstrap-only',email:owner.email,name:owner.name}));
   assert.equal(dedicated.status,200);
   assert.equal(calls,1);
  });
 }finally{
  if(before.bootstrap===undefined)delete process.env.ACCESS_BOOTSTRAP_KEY;else process.env.ACCESS_BOOTSTRAP_KEY=before.bootstrap;
  if(before.control===undefined)delete process.env.CONTROL_KEY;else process.env.CONTROL_KEY=before.control;
 }
});

test('disable revokes sessions and links, and a new invitation invalidates prior links',async()=>{
 const disableSql:string[]=[];
 const disableClient={
  async query(sql:string){disableSql.push(sql);return {rows:[]}},
  release(){},
 };
 const disableStore=new PgAccessStore();
 Reflect.set(disableStore,'db',async()=>({connect:async()=>disableClient}));
 await disableStore.disable(editor.id);
 assert.ok(disableSql.some(sql=>sql.startsWith('UPDATE access_members SET enabled=false')));
 assert.ok(disableSql.some(sql=>sql.startsWith('DELETE FROM access_sessions WHERE member_id=')));
 assert.ok(disableSql.some(sql=>sql.startsWith('DELETE FROM access_links WHERE member_id=')));
 assert.equal(disableSql.at(0),'BEGIN');
 assert.equal(disableSql.at(-1),'COMMIT');

 const inviteSql:string[]=[];
 const inviteClient={
  async query(sql:string){
   inviteSql.push(sql);
   if(sql.startsWith('INSERT INTO access_members'))return {rows:[editor]};
   return {rows:[]};
  },
  release(){},
 };
 const inviteStore=new PgAccessStore();
 Reflect.set(inviteStore,'db',async()=>({connect:async()=>inviteClient}));
 await inviteStore.invite(editor.email,editor.name,'editor',tokenHash(validToken),Date.now()+1000);
 const deleteIndex=inviteSql.findIndex(sql=>sql.startsWith('DELETE FROM access_links WHERE member_id='));
 const insertIndex=inviteSql.findIndex(sql=>sql.startsWith('INSERT INTO access_links'));
 assert.ok(deleteIndex>0&&insertIndex>deleteIndex,'old links are removed before the replacement is inserted');
});

test('expired, disabled, or deleted sessions cannot produce a current member',async()=>{
 const hashes:string[]=[];
 const store:AccessStore={
  memberForSession:async(hash)=>{hashes.push(hash);return null},
  createSession:async()=>{},deleteSession:async()=>{},redeem:async()=>null,
  invite:async()=>owner,list:async()=>[],disable:async()=>{},bootstrap:async()=>null,allowAttempt:async()=>true,
 };
 const request=new Request('https://graphics.test/author',{headers:{cookie:`${ACCESS_COOKIE}=${validToken}`}});
 assert.equal(await currentMember(request,store),null);
 assert.deepEqual(hashes,[tokenHash(validToken)]);
 const malformed=new Request('https://graphics.test/author',{headers:{cookie:`${ACCESS_COOKIE}=too-short`}});
 assert.equal(await currentMember(malformed,store),null);
 assert.equal(hashes.length,1,'malformed tokens never reach storage');

 const pg=new PgAccessStore();
 let sql='';
 Reflect.set(pg,'db',async()=>({query:async(statement:string)=>{sql=statement;return {rows:[]}}}));
 assert.equal(await pg.memberForSession(tokenHash(validToken),1234),null);
 assert.match(sql,/s\.expires_at>\$2/);
 assert.match(sql,/m\.enabled=true/);
});

test('session issuance stores only a hash and uses a fixed thirty-day expiry',async()=>{
 let recorded:{hash:string;memberId:string;now:number;expires:number}|undefined;
 const store:AccessStore={
  memberForSession:async()=>null,
  createSession:async(hash,memberId,now,expires)=>{recorded={hash,memberId,now,expires}},
  deleteSession:async()=>{},redeem:async()=>null,invite:async()=>owner,list:async()=>[],disable:async()=>{},bootstrap:async()=>null,allowAttempt:async()=>true,
 };
 const token=await issueSession(owner,store);
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(recorded?.hash,token);
 assert.equal(recorded?.hash,tokenHash(token));
 assert.equal(recorded?.memberId,owner.id);
 assert.equal(recorded!.expires-recorded!.now,30*24*60*60_000);
});

test('legacy playback credentials bypass membership without giving the output key control',async()=>{
 const before={control:process.env.CONTROL_KEY,output:process.env.OUTPUT_KEY};
 process.env.CONTROL_KEY='control-test';process.env.OUTPUT_KEY='output-test';
 try{
  assert.equal(secretEqual('control-test',process.env.CONTROL_KEY),true);
  assert.equal((await authorizeRequest(new Request('https://site.test',{headers:{Authorization:'Bearer control-test'}}),'control'))?.id,'legacy-control');
  assert.equal((await authorizeRequest(new Request('https://site.test',{headers:{Authorization:'Bearer control-test'}}),'author'))?.id,'legacy-control');
  assert.equal(await authorizeRequest(new Request('https://site.test',{headers:{Authorization:'Bearer control-test'}}),'owner'),null);
  assert.equal((await authorizeRequest(new Request('https://site.test',{headers:{Authorization:'Bearer output-test'}}),'read'))?.id,'legacy-output');
  assert.equal(await authorizeRequest(new Request('https://site.test',{headers:{Authorization:'Bearer output-test'}}),'control'),null);
  assert.equal(await authorizeRequest(new Request('https://site.test',{headers:{Authorization:'Bearer output-test'}}),'author'),null);
  assert.equal(await authorizeRequest(new Request('https://site.test',{headers:{Authorization:'Bearer output-test'}}),'owner'),null);
 }finally{
  if(before.control===undefined)delete process.env.CONTROL_KEY;else process.env.CONTROL_KEY=before.control;
  if(before.output===undefined)delete process.env.OUTPUT_KEY;else process.env.OUTPUT_KEY=before.output;
 }
});
