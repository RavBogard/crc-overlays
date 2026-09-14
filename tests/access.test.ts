import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GET,POST} from '../app/api/access/route.ts';
import {
 ACCESS_COOKIE,
 ACCESS_ATTEMPT_SQL,
 AccessInvariantError,
 AccessIdentityConflictError,
 MemoryAccessStore,
 REHEARSAL_OWNER,
 PgAccessStore,
 accessStore,
 authorizeRequest,
 canAccess,
 cookieToken,
 currentMember,
 issueSession,
 hashPassword,
 sameSiteWrite,
 sessionCookie,
 secretEqual,
 tokenHash,
 validPassword,
 verifyPassword,
 type AccessMember,
 type AccessRole,
 type GoogleIdentity,
 type SignInFlow,
 type AccessSessionMember,
 type AccessStore,
} from '../lib/access.ts';

const owner:AccessMember={id:'owner-1',email:'owner@example.test',name:'Owner',role:'owner',enabled:true};
const ownerSession:AccessSessionMember={...owner,authMethod:'invite',authenticatedAt:Date.now()};
const editor:AccessMember={id:'editor-1',email:'editor@example.test',name:'Editor',role:'editor',enabled:true};
const operator:AccessMember={id:'operator-1',email:'operator@example.test',name:'Operator',role:'operator',enabled:true};
const validToken='a'.repeat(43);

/** The identity half of AccessStore, for literals that only exercise the rest of it. */
const identityStoreStubs={identityForMember:async()=>null,memberForIdentity:async()=>null,linkIdentity:async()=>{},unlinkIdentity:async()=>{},putSignInFlow:async()=>{},takeSignInFlow:async()=>null,memberById:async()=>null,invitationTarget:async()=>null};

type TestStore=AccessStore;
async function withStoreMethods<T>(overrides:Partial<TestStore>,run:()=>Promise<T>){
 const saved:TestStore={
  memberForSession:accessStore.memberForSession,
  createSession:accessStore.createSession,
  deleteSession:accessStore.deleteSession,
  credentialForEmail:accessStore.credentialForEmail,
  setPassword:accessStore.setPassword,
  redeem:accessStore.redeem,
  invite:accessStore.invite,
  list:accessStore.list,
  disable:accessStore.disable,
  allowAttempt:accessStore.allowAttempt,
  bootstrap:accessStore.bootstrap,
  identityForMember:accessStore.identityForMember,
  memberForIdentity:accessStore.memberForIdentity,
  linkIdentity:accessStore.linkIdentity,
  unlinkIdentity:accessStore.unlinkIdentity,
  putSignInFlow:accessStore.putSignInFlow,
  takeSignInFlow:accessStore.takeSignInFlow,
  memberById:accessStore.memberById,
  invitationTarget:accessStore.invitationTarget,
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
  memberForSession:async()=>{touched=true;return ownerSession},
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
  redeem:async(hash:string,_now:number,sessionHash:string)=>{
   if(redeemed.has(hash))return null;
   redeemed.add(hash);
   sessions.push(sessionHash);
   return editor;
  },
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
   if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('LOCK TABLE'))return {rows:[]};
   if(sql.startsWith('UPDATE access_links SET used_at=')){
    assert.match(sql,/used_at IS NULL/);
    assert.match(sql,/expires_at>\$2/);
    if(used)return {rows:[]};
    used=true;
    return {rows:[{member_id:editor.id,pending_name:editor.name,pending_role:editor.role,reset_password:false}]};
   }
   if(sql.startsWith('UPDATE access_members SET name=')){
    assert.deepEqual(params,[editor.id,editor.name,editor.role,false]);
    return {rows:[editor]};
   }
   if(sql.startsWith('SELECT id,email,name,role,enabled FROM access_members WHERE id='))return {rows:[editor]};
   if(sql.startsWith('INSERT INTO access_sessions'))return {rows:[]};
   throw new Error(`unexpected SQL: ${sql}`);
  },
  release(){},
 };
 const store=new PgAccessStore();
 Reflect.set(store,'db',async()=>({connect:async()=>client}));
 assert.equal((await store.redeem(tokenHash(validToken),1000,'session-hash',2000))?.id,editor.id);
 assert.equal(await store.redeem(tokenHash(validToken),1001,'session-hash-2',2001),null);
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
   if(sql.startsWith('DELETE FROM access_sessions')||sql.startsWith('DELETE FROM access_links')||sql.startsWith('INSERT INTO access_sessions'))return {rows:[]};
   throw new Error(`unexpected SQL: ${sql}`);
  },
  release(){},
 };
 const store=new PgAccessStore();
 Reflect.set(store,'db',async()=>({connect:async()=>client}));
 assert.equal((await store.bootstrap(owner.email,owner.name,'scrypt$record','session-hash',1000,2000))?.id,owner.id);
 assert.equal(await store.bootstrap('second@example.test','Second','scrypt$record','session-hash-2',1001,2001),null);
 assert.equal(inserts,1);
 assert.equal(statements.filter(sql=>sql.startsWith('LOCK TABLE access_members')).length,2);
 assert.equal(statements.at(-1),'ROLLBACK');
});

test('bootstrap stores the owner password and password session in the same transaction',async()=>{
 const statements:Array<{sql:string;params?:unknown[]}>=[];
 const client={async query(sql:string,params?:unknown[]){statements.push({sql,params});if(sql.startsWith("SELECT id FROM access_members WHERE role='owner'"))return {rows:[]};if(sql.startsWith('INSERT INTO access_members'))return {rows:[owner]};return {rows:[]}},release(){}};
 const store=new PgAccessStore();Reflect.set(store,'db',async()=>({connect:async()=>client}));
 const result=await store.bootstrap(owner.email,owner.name,'scrypt$record','password-session-hash',1000,2000);
 assert.equal(result?.id,owner.id);assert.equal(statements[0].sql,'BEGIN');assert.match(statements.find(item=>item.sql.startsWith('INSERT INTO access_members'))!.sql,/password_hash/);const session=statements.find(item=>item.sql.startsWith('INSERT INTO access_sessions'))!;assert.match(session.sql,/'password'/);assert.deepEqual(session.params,['password-session-hash',owner.id,1000,2000]);assert.equal(statements.at(-1)?.sql,'COMMIT');
});

test('dedicated bootstrap key takes precedence over the legacy control key',async()=>{
 const before={bootstrap:process.env.ACCESS_BOOTSTRAP_KEY,control:process.env.CONTROL_KEY};
 process.env.ACCESS_BOOTSTRAP_KEY='bootstrap-only';process.env.CONTROL_KEY='legacy-control';
 let calls=0;
 try{
  await withStoreMethods({
   allowAttempt:async()=>true,
   bootstrap:async()=>{calls++;return owner},
  },async()=>{
   const legacy=await POST(jsonRequest({action:'bootstrap',key:'legacy-control',email:owner.email,name:owner.name,newPassword:'owner password manager value'}));
   assert.equal(legacy.status,401);
   assert.equal(calls,0);
   const dedicated=await POST(jsonRequest({action:'bootstrap',key:'bootstrap-only',email:owner.email,name:owner.name,newPassword:'owner password manager value'}));
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

test('database mutations preserve at least one enabled administrator',async()=>{
 const statements:string[]=[];const client={async query(sql:string){statements.push(sql);if(sql.startsWith('SELECT role,enabled'))return {rows:[{role:'owner',enabled:true}]};if(sql.startsWith("SELECT count(*)::int"))return {rows:[{count:1}]};return {rows:[]}},release(){}};const store=new PgAccessStore();Reflect.set(store,'db',async()=>({connect:async()=>client}));
 await assert.rejects(store.disable(owner.id),AccessInvariantError);assert.equal(statements.at(-1),'ROLLBACK');assert.equal(statements.some(sql=>sql.startsWith('UPDATE access_members SET enabled=false')),false);
 const inviteStatements:string[]=[];const inviteClient={async query(sql:string){inviteStatements.push(sql);if(sql.startsWith('SELECT id,email,name,role,enabled'))return {rows:[owner]};if(sql.startsWith("SELECT count(*)::int"))return {rows:[{count:1}]};return {rows:[]}},release(){}};const inviteStore=new PgAccessStore();Reflect.set(inviteStore,'db',async()=>({connect:async()=>inviteClient}));
 await assert.rejects(inviteStore.invite(owner.email,owner.name,'editor',tokenHash(validToken),2000),AccessInvariantError);assert.equal(inviteStatements.at(-1),'ROLLBACK');assert.equal(inviteStatements.some(sql=>sql.startsWith('INSERT INTO access_members')),false);
});

test('re-invitation keeps ordinary access stable and defers risky reauthorization until redemption',async()=>{
 for(const scenario of [
  {member:editor,role:'editor' as const,reset:false},
  {member:{...editor,enabled:false},role:'editor' as const,reset:true},
  {member:editor,role:'owner' as const,reset:true},
 ]){
  const statements:Array<{sql:string;params?:unknown[]}>=[];const client={async query(sql:string,params?:unknown[]){statements.push({sql,params});if(sql.startsWith('SELECT id,email,name,role,enabled'))return {rows:[scenario.member]};return {rows:[]}},release(){}};const store=new PgAccessStore();Reflect.set(store,'db',async()=>({connect:async()=>client}));const result=await store.invite(editor.email,editor.name,scenario.role,tokenHash(validToken),2000);assert.equal(result.enabled,scenario.member.enabled);assert.equal(statements.some(item=>item.sql.startsWith('UPDATE access_members')),false);assert.equal(statements.some(item=>item.sql.startsWith('DELETE FROM access_sessions')),false);const link=statements.find(item=>item.sql.startsWith('INSERT INTO access_links'))!;assert.equal(link.params?.at(-1),scenario.reset);
 }
 const redeemStatements:Array<{sql:string;params?:unknown[]}>=[];const redeemClient={async query(sql:string,params?:unknown[]){redeemStatements.push({sql,params});if(sql.startsWith('UPDATE access_links'))return {rows:[{member_id:editor.id,pending_name:editor.name,pending_role:'editor',reset_password:true}]};if(sql.startsWith('SELECT id,email,name,role,enabled FROM access_members WHERE id='))return {rows:[{...editor,enabled:false}]};if(sql.startsWith('UPDATE access_members'))return {rows:[editor]};return {rows:[]}},release(){}};const store=new PgAccessStore();Reflect.set(store,'db',async()=>({connect:async()=>redeemClient}));await store.redeem(tokenHash(validToken),1000,'new-session',2000);assert.ok(redeemStatements.some(item=>item.sql.startsWith('DELETE FROM access_sessions')));assert.equal(redeemStatements.find(item=>item.sql.startsWith('UPDATE access_members'))?.params?.at(-1),true);
});

test('delayed invitation redemption cannot remove the final enabled administrator',async()=>{
 const statements:string[]=[];const client={async query(sql:string){statements.push(sql);if(sql.startsWith('UPDATE access_links'))return {rows:[{member_id:owner.id,pending_name:owner.name,pending_role:'editor',reset_password:true}]};if(sql.startsWith('SELECT id,email,name,role,enabled FROM access_members WHERE id='))return {rows:[owner]};if(sql.startsWith("SELECT count(*)::int"))return {rows:[{count:1}]};return {rows:[]}},release(){}};const store=new PgAccessStore();Reflect.set(store,'db',async()=>({connect:async()=>client}));await assert.rejects(store.redeem(tokenHash(validToken),1000,'new-session',2000),AccessInvariantError);assert.equal(statements.at(-1),'ROLLBACK');assert.equal(statements.some(sql=>sql.startsWith('UPDATE access_members SET name=')),false);
});

test('expired, disabled, or deleted sessions cannot produce a current member',async()=>{
 const hashes:string[]=[];
 const store:AccessStore={
 memberForSession:async(hash)=>{hashes.push(hash);return null},
  createSession:async()=>{},deleteSession:async()=>{},credentialForEmail:async()=>null,setPassword:async()=>{},redeem:async()=>null,
  invite:async()=>owner,list:async()=>[],disable:async()=>{},bootstrap:async()=>null,allowAttempt:async()=>true,...identityStoreStubs,
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
 let recorded:{hash:string;memberId:string;now:number;expires:number;method?:string}|undefined;
 const store:AccessStore={
 memberForSession:async()=>null,
  createSession:async(hash,memberId,now,expires,method)=>{recorded={hash,memberId,now,expires,method}},
  deleteSession:async()=>{},credentialForEmail:async()=>null,setPassword:async()=>{},redeem:async()=>null,invite:async()=>owner,list:async()=>[],disable:async()=>{},bootstrap:async()=>null,allowAttempt:async()=>true,...identityStoreStubs,
 };
 const token=await issueSession(owner,store);
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(recorded?.hash,token);
 assert.equal(recorded?.hash,tokenHash(token));
 assert.equal(recorded?.memberId,owner.id);
 assert.equal(recorded!.expires-recorded!.now,30*24*60*60_000);
 assert.equal(recorded?.method,'invite');
});

test('scrypt password records are salted, bounded, and verified without plaintext storage',async()=>{
 assert.equal(validPassword('short'),false);assert.equal(validPassword('x'.repeat(201)),false);assert.equal(validPassword('correct horse battery staple'),true);
 const first=await hashPassword('correct horse battery staple'),second=await hashPassword('correct horse battery staple');
 assert.notEqual(first,second);assert.doesNotMatch(first,/correct|horse|battery|staple/);assert.match(first,/^scrypt\$16384\$8\$1\$/);
 assert.equal(await verifyPassword('correct horse battery staple',first),true);assert.equal(await verifyPassword('wrong password value',first),false);assert.equal(await verifyPassword('correct horse battery staple','malformed'),false);
});

test('email login is generic, rate-limited by IP and account, and issues a password session',async()=>{
 const encoded=await hashPassword('correct horse battery staple');const attempts:string[]=[];let method='';
 await withStoreMethods({allowAttempt:async identity=>{attempts.push(identity);return true},credentialForEmail:async email=>email===editor.email?{...editor,passwordHash:encoded}:null,createSession:async(_hash,_id,_now,_expires,nextMethod)=>{method=nextMethod}},async()=>{
  const accepted=await POST(jsonRequest({action:'login',email:editor.email,password:'correct horse battery staple'}));assert.equal(accepted.status,200);assert.equal(method,'password');assert.match(accepted.headers.get('set-cookie')||'',new RegExp(`^${ACCESS_COOKIE}=`));
  const unknown=await POST(jsonRequest({action:'login',email:'missing@example.test',password:'correct horse battery staple'}));const wrong=await POST(jsonRequest({action:'login',email:editor.email,password:'wrong password value'}));assert.equal(unknown.status,401);assert.equal(wrong.status,401);assert.equal((await unknown.json()).error,(await wrong.json()).error);
  assert.ok(attempts.some(value=>value.startsWith('login:ip:')));assert.ok(attempts.includes(`login:account:${editor.email}`));
 });
 let credentialsRead=false;await withStoreMethods({allowAttempt:async identity=>!identity.startsWith('login:account:'),credentialForEmail:async()=>{credentialsRead=true;return null}},async()=>{const limited=await POST(jsonRequest({action:'login',email:editor.email,password:'correct horse battery staple'}));assert.equal(limited.status,429);assert.equal(credentialsRead,false)});
 const blockedAttempts:string[]=[];await withStoreMethods({allowAttempt:async identity=>{blockedAttempts.push(identity);return false}},async()=>{const limited=await POST(jsonRequest({action:'login',email:'unique@example.test',password:'correct horse battery staple'}));assert.equal(limited.status,429);assert.equal(blockedAttempts.length,1);assert.match(blockedAttempts[0],/^login:ip:/)});
});

test('production rate limiting trusts only Vercel-provided client identity',async()=>{
 const before=process.env.VERCEL;process.env.VERCEL='1';const identities:string[]=[];try{await withStoreMethods({allowAttempt:async identity=>{identities.push(identity);return false}},async()=>{await POST(new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json','x-forwarded-for':'spoofed','x-real-ip':'spoofed'},body:JSON.stringify({action:'login',email:editor.email,password:'correct horse battery staple'})}));assert.equal(identities[0],'login:ip:unknown');identities.length=0;await POST(new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json','x-vercel-forwarded-for':'198.51.100.8','x-forwarded-for':'spoofed'},body:JSON.stringify({action:'login',email:editor.email,password:'correct horse battery staple'})}));assert.equal(identities[0],'login:ip:198.51.100.8')})}finally{if(before===undefined)delete process.env.VERCEL;else process.env.VERCEL=before}
});

test('access request bodies are bounded before password work',async()=>{
 let touched=false;await withStoreMethods({allowAttempt:async()=>{touched=true;return true},credentialForEmail:async()=>{touched=true;return null}},async()=>{const response=await POST(new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json'},body:JSON.stringify({action:'login',email:'a@example.test',password:'x'.repeat(9000)})}));assert.equal(response.status,413);assert.equal(touched,false)});
});

test('attempt storage prunes expired identities while updating the bounded window',async()=>{
 let statement='';const store=new PgAccessStore();Reflect.set(store,'db',async()=>({query:async(sql:string)=>{statement=sql;return {rows:[{attempts:1}]}}}));assert.equal(await store.allowAttempt('login:ip:local',Date.now()),true);assert.match(statement,/DELETE FROM access_attempts WHERE window_start<\(\$2::bigint\)-60000/);assert.equal((statement.match(/\$2::bigint/g)??[]).length,3);assert.match(statement,/RETURNING attempts/);
});

test('current epoch rate-limit SQL executes against PostgreSQL without integer overflow',{skip:process.env.ACCESS_POSTGRES_TEST!=='1'||!process.env.DATABASE_URL},async()=>{
 const {Pool}=await import('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();try{await client.query('BEGIN');const result=await client.query(ACCESS_ATTEMPT_SQL,[tokenHash('rollback-only-integration-probe'),Date.now()]);assert.equal(result.rows[0]?.attempts,1);await client.query('ROLLBACK')}finally{await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end()}
});

test('password setup rotates the session and never serializes a hash',async()=>{
 let stored:{id:string;encoded:string;session:string}|undefined;const sessions=new Map([[tokenHash(validToken),ownerSession]]);
 await withStoreMethods({memberForSession:async hash=>sessions.get(hash)??null,credentialForEmail:async()=>({...owner,passwordHash:null}),allowAttempt:async()=>true,setPassword:async(id,encoded,session)=>{stored={id,encoded,session};sessions.clear();sessions.set(session,{...owner,authMethod:'password',authenticatedAt:Date.now()})}},async()=>{
  const response=await POST(new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json',Cookie:`${ACCESS_COOKIE}=${validToken}`},body:JSON.stringify({action:'set_password',newPassword:'owner password manager value'})}));assert.equal(response.status,200);assert.equal(stored?.id,owner.id);assert.notEqual(stored?.session,tokenHash(validToken));assert.doesNotMatch(stored?.encoded??'',/owner password/);
  const rawCookie=response.headers.get('set-cookie')??'';const newToken=rawCookie.match(new RegExp(`^${ACCESS_COOKIE}=([^;]+)`))?.[1]??'';assert.equal(tokenHash(newToken),stored?.session);
  const oldProfile=await GET(new Request('https://graphics.test/api/access',{headers:{Cookie:`${ACCESS_COOKIE}=${validToken}`}}));assert.equal(oldProfile.status,401);
  const profile=await GET(new Request('https://graphics.test/api/access',{headers:{Cookie:`${ACCESS_COOKIE}=${newToken}`}}));const text=await profile.text();assert.equal(profile.status,200);assert.match(text,/"hasPassword":false/);assert.doesNotMatch(text,/passwordHash|scrypt\$/);
 });
});

test('an existing password needs the current password or a fresh invitation proof',async()=>{
 const encoded=await hashPassword('current password value');let changes=0;const request=(currentPassword?:string)=>new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json',Cookie:`${ACCESS_COOKIE}=${validToken}`},body:JSON.stringify({action:'set_password',currentPassword,newPassword:'replacement password value'})});
 await withStoreMethods({memberForSession:async()=>({...ownerSession,authenticatedAt:Date.now()-16*60_000}),credentialForEmail:async()=>({...owner,passwordHash:encoded}),allowAttempt:async()=>true,setPassword:async()=>{changes++}},async()=>{const denied=await POST(request());assert.equal(denied.status,401);assert.equal(changes,0);const accepted=await POST(request('current password value'));assert.equal(accepted.status,200);assert.equal(changes,1)});
 await withStoreMethods({memberForSession:async()=>({...ownerSession,authenticatedAt:Date.now()}),credentialForEmail:async()=>({...owner,passwordHash:encoded}),allowAttempt:async()=>true,setPassword:async()=>{changes++}},async()=>{const reset=await POST(request());assert.equal(reset.status,200);assert.equal(changes,2)});
});

test('a password reset consumes fresh-invite proof and requires the new current password afterward',async()=>{
 let encoded=await hashPassword('current password value');const sessions=new Map([[tokenHash(validToken),ownerSession]]);let latestToken='';
 await withStoreMethods({memberForSession:async hash=>sessions.get(hash)??null,credentialForEmail:async()=>({...owner,passwordHash:encoded}),allowAttempt:async()=>true,setPassword:async(_id,next,sessionHash)=>{encoded=next;sessions.clear();sessions.set(sessionHash,{...owner,authMethod:'password',authenticatedAt:Date.now()})}},async()=>{
  const reset=await POST(new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json',Cookie:`${ACCESS_COOKIE}=${validToken}`},body:JSON.stringify({action:'set_password',newPassword:'replacement password value'})}));assert.equal(reset.status,200);latestToken=(reset.headers.get('set-cookie')??'').match(new RegExp(`^${ACCESS_COOKIE}=([^;]+)`))?.[1]??'';
  const repeat=await POST(new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json',Cookie:`${ACCESS_COOKIE}=${latestToken}`},body:JSON.stringify({action:'set_password',newPassword:'another replacement value'})}));assert.equal(repeat.status,401);
  const withCurrent=await POST(new Request('https://graphics.test/api/access',{method:'POST',headers:{Origin:'https://graphics.test','Content-Type':'application/json',Cookie:`${ACCESS_COOKIE}=${latestToken}`},body:JSON.stringify({action:'set_password',currentPassword:'replacement password value',newPassword:'another replacement value'})}));assert.equal(withCurrent.status,200);
 });
});

test('Postgres password change atomically revokes other sessions and old links',async()=>{
 const statements:Array<{sql:string;params?:unknown[]}>=[];const client={async query(sql:string,params?:unknown[]){statements.push({sql,params});if(sql.startsWith('UPDATE access_members'))return {rows:[{id:owner.id}]};return {rows:[]}},release(){}};const store=new PgAccessStore();Reflect.set(store,'db',async()=>({connect:async()=>client}));await store.setPassword(owner.id,'scrypt$record','new-session-hash',1000,2000);assert.equal(statements[0].sql,'BEGIN');assert.match(statements[1].sql,/password_hash=\$2/);assert.equal(statements[2].sql,'DELETE FROM access_sessions WHERE member_id=$1');assert.match(statements[3].sql,/DELETE FROM access_links/);assert.match(statements[4].sql,/auth_method,authenticated_at/);assert.deepEqual(statements[4].params,['new-session-hash',owner.id,1000,2000]);assert.equal(statements.at(-1)?.sql,'COMMIT');
});

test('legacy CONTROL_KEY cannot bootstrap or recover an owner account',async()=>{
 const before={bootstrap:process.env.ACCESS_BOOTSTRAP_KEY,control:process.env.CONTROL_KEY};delete process.env.ACCESS_BOOTSTRAP_KEY;process.env.CONTROL_KEY='legacy-control';let calls=0;try{await withStoreMethods({allowAttempt:async()=>true,bootstrap:async()=>{calls++;return owner}},async()=>{const response=await POST(jsonRequest({action:'bootstrap',key:'legacy-control',email:owner.email,name:owner.name}));assert.equal(response.status,401);assert.equal(calls,0)})}finally{if(before.bootstrap===undefined)delete process.env.ACCESS_BOOTSTRAP_KEY;else process.env.ACCESS_BOOTSTRAP_KEY=before.bootstrap;if(before.control===undefined)delete process.env.CONTROL_KEY;else process.env.CONTROL_KEY=before.control}
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

// --- MemoryAccessStore (rehearsal) parity with the Postgres transaction -----------
test('memory store: a redemption refused by the administrator invariant leaves the link redeemable',async()=>{
 const store=new MemoryAccessStore();
 const now=Date.now(),expires=now+60_000;
 const second={email:'second-owner@rehearsal.invalid',name:'Second Owner'};
 // Two enabled owners, so the seeded owner may be invited to a lesser role.
 await store.invite(second.email,second.name,'owner',tokenHash('second-1'),expires);
 const secondOwner=await store.redeem(tokenHash('second-1'),now,tokenHash('session-second-1'),expires);
 assert.equal(secondOwner?.role,'owner');
 const demote=tokenHash('demote-seeded-owner');
 await store.invite(REHEARSAL_OWNER.email,REHEARSAL_OWNER.name,'editor',demote,expires);
 await store.disable(secondOwner!.id);
 // Delayed redemption: the seeded owner is now the only enabled administrator.
 await assert.rejects(store.redeem(demote,now,tokenHash('session-demote-1'),expires),AccessInvariantError);
 assert.equal(store.links.get(demote)?.usedAt,null,'the refused link is not consumed');
 assert.equal(store.sessions.has(tokenHash('session-demote-1')),false,'no session is issued for the refused redemption');
 const seeded=(await store.list()).find(member=>member.id===REHEARSAL_OWNER.id);
 assert.deepEqual({role:seeded?.role,enabled:seeded?.enabled},{role:'owner',enabled:true});
 // Once another administrator exists the same link redeems.
 await store.invite(second.email,second.name,'owner',tokenHash('second-2'),expires);
 assert.equal((await store.redeem(tokenHash('second-2'),now,tokenHash('session-second-2'),expires))?.role,'owner');
 const demoted=await store.redeem(demote,now,tokenHash('session-demote-2'),expires);
 assert.deepEqual({id:demoted?.id,role:demoted?.role,enabled:demoted?.enabled},{id:REHEARSAL_OWNER.id,role:'editor',enabled:true});
 assert.equal(store.links.get(demote)?.usedAt,now);
 assert.equal(await store.redeem(demote,now,tokenHash('session-demote-3'),expires),null,'a spent link stays single-use');
});

// --- MemoryAccessStore: Google identities and sign-in flows ----------------------
const ISSUER='https://accounts.google.com';
const googleIdentity=(subject:string,email:string,emailVerified=true):GoogleIdentity=>({provider:'google',issuer:ISSUER,subject,email,emailVerified});
async function memoryMember(store:MemoryAccessStore,email:string,name:string,role:AccessRole='editor'){
 const now=Date.now(),expires=now+60_000,hash=tokenHash(`invite-${email}`);
 await store.invite(email,name,role,hash,expires);
 const member=await store.redeem(hash,now,tokenHash(`session-${email}`),expires);
 assert.ok(member,`${email} redeemed`);
 return member;
}

test('memory store: a linked identity resolves to its member and records the use',async()=>{
 const store=new MemoryAccessStore();
 const member=await memoryMember(store,'linked@rehearsal.invalid','Linked Editor');
 const identity=googleIdentity('google-subject-1','linked@rehearsal.invalid');
 await store.linkIdentity(member.id,identity,1000);
 assert.deepEqual(await store.identityForMember(member.id),{provider:'google',email:'linked@rehearsal.invalid',linkedAt:1000,lastUsedAt:null});
 const resolved=await store.memberForIdentity(identity,2000);
 assert.deepEqual({id:resolved?.id,role:resolved?.role,enabled:resolved?.enabled},{id:member.id,role:'editor',enabled:true});
 assert.equal((await store.identityForMember(member.id))?.lastUsedAt,2000);
 assert.equal(await store.memberForIdentity(googleIdentity('google-subject-unknown','other@rehearsal.invalid'),3000),null);
});

test('memory store: one Google identity cannot be bound to a second member',async()=>{
 const store=new MemoryAccessStore();
 const first=await memoryMember(store,'first@rehearsal.invalid','First Editor');
 const second=await memoryMember(store,'second@rehearsal.invalid','Second Editor');
 const identity=googleIdentity('shared-subject','first@rehearsal.invalid');
 await store.linkIdentity(first.id,identity,1000);
 await assert.rejects(store.linkIdentity(second.id,identity,2000),AccessIdentityConflictError);
 assert.equal((await store.memberForIdentity(identity,3000))?.id,first.id,'the first link survives the refusal');
 assert.equal(await store.identityForMember(second.id),null);
});

test('memory store: re-linking a member replaces its previous Google identity',async()=>{
 const store=new MemoryAccessStore();
 const member=await memoryMember(store,'rotating@rehearsal.invalid','Rotating Editor');
 const old=googleIdentity('subject-old','rotating@rehearsal.invalid');
 const next=googleIdentity('subject-new','rotating-new@rehearsal.invalid');
 await store.linkIdentity(member.id,old,1000);
 await store.linkIdentity(member.id,next,2000);
 assert.equal(store.identities.size,1,'a member keeps at most one Google link');
 assert.equal(await store.memberForIdentity(old,3000),null);
 assert.equal((await store.memberForIdentity(next,3000))?.id,member.id);
 assert.deepEqual(await store.identityForMember(member.id),{provider:'google',email:'rotating-new@rehearsal.invalid',linkedAt:2000,lastUsedAt:3000});
});

test('memory store: a removed member still resolves, is marked disabled, and records no use',async()=>{
 const store=new MemoryAccessStore();
 const member=await memoryMember(store,'removed@rehearsal.invalid','Removed Editor');
 const identity=googleIdentity('subject-removed','removed@rehearsal.invalid');
 await store.linkIdentity(member.id,identity,1000);
 await store.disable(member.id);
 const resolved=await store.memberForIdentity(identity,2000);
 assert.deepEqual({id:resolved?.id,enabled:resolved?.enabled},{id:member.id,enabled:false});
 assert.equal((await store.identityForMember(member.id))?.lastUsedAt,null,'a removed member never records a Google sign-in');
});

test('memory store: unlinking leaves the membership and removes the identity',async()=>{
 const store=new MemoryAccessStore();
 const member=await memoryMember(store,'unlink@rehearsal.invalid','Unlinking Editor');
 const identity=googleIdentity('subject-unlink','unlink@rehearsal.invalid');
 await store.linkIdentity(member.id,identity,1000);
 await store.unlinkIdentity(member.id,'google');
 assert.equal(await store.memberForIdentity(identity,2000),null);
 assert.equal(await store.identityForMember(member.id),null);
 assert.equal((await store.list()).find(row=>row.id===member.id)?.enabled,true);
 await store.unlinkIdentity(member.id,'google');
});

test('memory store: redemption binds the identity in the same step, or binds nothing',async()=>{
 const store=new MemoryAccessStore();
 const now=Date.now(),expires=now+60_000;
 const identity=googleIdentity('subject-redeem','invited@rehearsal.invalid');
 const invited=tokenHash('invite-with-google');
 await store.invite('invited@rehearsal.invalid','Invited Editor','editor',invited,expires);
 const member=await store.redeem(invited,now,tokenHash('session-with-google'),expires,identity);
 assert.equal(member?.role,'editor');
 assert.equal((await store.memberForIdentity(identity,now))?.id,member?.id);

 // An identity already held by somebody else refuses the redemption entirely.
 const other=tokenHash('invite-conflicting');
 await store.invite('other@rehearsal.invalid','Other Editor','editor',other,expires);
 await assert.rejects(store.redeem(other,now,tokenHash('session-conflicting'),expires,identity),AccessIdentityConflictError);
 assert.equal(store.links.get(other)?.usedAt,null,'the refused invitation stays redeemable');
 assert.equal(store.sessions.has(tokenHash('session-conflicting')),false);
 assert.equal((await store.memberForIdentity(identity,now))?.id,member?.id,'the existing link is untouched');
});

test('memory store: a redemption refused by the administrator invariant writes no identity',async()=>{
 const store=new MemoryAccessStore();
 const now=Date.now(),expires=now+60_000;
 const identity=googleIdentity('subject-invariant','rehearsal-owner@rehearsal.invalid');
 // Two enabled owners so the seeded owner may be invited down to editor, then one goes.
 await store.invite('second-owner@rehearsal.invalid','Second Owner','owner',tokenHash('second-owner-1'),expires);
 const secondOwner=await store.redeem(tokenHash('second-owner-1'),now,tokenHash('session-second-owner'),expires);
 const demote=tokenHash('demote-with-identity');
 await store.invite(REHEARSAL_OWNER.email,REHEARSAL_OWNER.name,'editor',demote,expires);
 await store.disable(secondOwner!.id);
 await assert.rejects(store.redeem(demote,now,tokenHash('session-demote'),expires,identity),AccessInvariantError);
 assert.equal(store.identities.size,0,'no identity is bound by a rolled-back redemption');
 assert.equal(store.links.get(demote)?.usedAt,null,'the invitation stays redeemable');
});

test('memory store: a sign-in flow is taken once and never after it expires',async()=>{
 const store=new MemoryAccessStore();
 const now=1_000_000;
 const flow:SignInFlow={kind:'signin',createdAt:now,codeVerifier:'verifier-value',state:'state-value',nonce:'nonce-value',redirectUri:'https://graphics.test/api/auth/google/callback'};
 const hash=tokenHash('flow-token');
 await store.putSignInFlow(hash,flow,now+600_000);
 assert.deepEqual(await store.takeSignInFlow(hash,now+1000),flow);
 assert.equal(await store.takeSignInFlow(hash,now+1000),null,'a second callback finds nothing');

 const expiring=tokenHash('flow-token-expiring');
 await store.putSignInFlow(expiring,flow,now+1000);
 assert.equal(await store.takeSignInFlow(expiring,now+2000),null,'an expired flow never completes');
 assert.equal(store.flows.has(expiring),false,'and is removed on the way out');

 // Insertion prunes whatever has already expired, as ACCESS_ATTEMPT_SQL does.
 await store.putSignInFlow(expiring,flow,now+1000);
 await store.putSignInFlow(tokenHash('flow-token-later'),{...flow,createdAt:now+2000},now+602_000);
 assert.equal(store.flows.has(expiring),false);

 // A held flow is stored by value: later edits to the caller's object do not reach it.
 const confirming=tokenHash('flow-token-confirm');
 const held:SignInFlow={...flow,kind:'link',memberId:'member-1',pending:{identity:googleIdentity('subject-held','held@rehearsal.invalid'),status:'confirm'}};
 await store.putSignInFlow(confirming,held,now+600_000);
 held.memberId='mutated';
 assert.equal((await store.takeSignInFlow(confirming,now+1000))?.memberId,'member-1');
});

test('memory store: each workspace maps the same Google identity independently',async()=>{
 const crc=new MemoryAccessStore(),tbi=new MemoryAccessStore();
 const identity=googleIdentity('subject-shared-person','person@example.test');
 const atCrc=await memoryMember(crc,'person@example.test','Person','owner');
 const atTbi=await memoryMember(tbi,'person@example.test','Person','operator');
 await crc.linkIdentity(atCrc.id,identity,1000);
 await tbi.linkIdentity(atTbi.id,identity,1000);
 assert.equal((await crc.memberForIdentity(identity,2000))?.role,'owner');
 assert.equal((await tbi.memberForIdentity(identity,2000))?.role,'operator');
 await crc.unlinkIdentity(atCrc.id,'google');
 assert.equal(await crc.memberForIdentity(identity,3000),null);
 assert.equal((await tbi.memberForIdentity(identity,3000))?.id,atTbi.id,'the other workspace is unaffected');
});

test('memory store: memberById and invitationTarget read without consuming anything',async()=>{
 const store=new MemoryAccessStore();
 const now=Date.now(),expires=now+60_000;
 assert.equal((await store.memberById(REHEARSAL_OWNER.id))?.email,REHEARSAL_OWNER.email);
 assert.equal(await store.memberById('nobody'),null);
 const invited=tokenHash('invite-target');
 const pending=await store.invite('Target@rehearsal.invalid','Target Editor','editor',invited,expires);
 assert.deepEqual(await store.invitationTarget(invited,now),{memberId:pending.id,email:'Target@rehearsal.invalid'});
 assert.equal(await store.invitationTarget(invited,expires),null,'an expired invitation names nobody');
 assert.equal(store.links.get(invited)?.usedAt,null,'reading the target never spends the link');
 await store.redeem(invited,now,tokenHash('session-target'),expires);
 assert.equal(await store.invitationTarget(invited,now),null,'a spent invitation names nobody');
 assert.equal(await store.invitationTarget(tokenHash('never-issued'),now),null);
});
