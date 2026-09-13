import {createHash,randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {rehearsalMode} from './rehearsal';

export type AccessRole='owner'|'editor'|'operator';
export type AccessPermission='read'|'control'|'author'|'owner';
export type AccessMember={id:string;email:string;name:string;role:AccessRole;enabled:boolean};
export type AccessSessionMember=AccessMember&{authMethod:'invite'|'password'|'bootstrap';authenticatedAt:number};
export type AccessCredential=AccessMember&{passwordHash:string|null};
export class AccessInvariantError extends Error{}
export const ACCESS_COOKIE='crc_access';
export const ACCESS_ATTEMPT_SQL='WITH pruned AS (DELETE FROM access_attempts WHERE window_start<($2::bigint)-60000) INSERT INTO access_attempts(identity,window_start,attempts) VALUES($1,$2,1) ON CONFLICT(identity) DO UPDATE SET attempts=CASE WHEN access_attempts.window_start<($2::bigint)-60000 THEN 1 ELSE access_attempts.attempts+1 END,window_start=CASE WHEN access_attempts.window_start<($2::bigint)-60000 THEN $2 ELSE access_attempts.window_start END RETURNING attempts';
const SESSION_MS=30*24*60*60_000;
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const accessToken=()=>randomBytes(32).toString('base64url');
export function secretEqual(actual:string,expected:string|undefined){if(!expected)return false;const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
const PASSWORD_N=16384,PASSWORD_R=8,PASSWORD_P=1,PASSWORD_BYTES=64;
const dummySalt=Buffer.alloc(16),dummyDigest=Buffer.alloc(PASSWORD_BYTES);
const derivePassword=(password:string,salt:Buffer)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,PASSWORD_BYTES,{N:PASSWORD_N,r:PASSWORD_R,p:PASSWORD_P,maxmem:32*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export function validPassword(value:unknown):value is string{return typeof value==='string'&&value.length>=12&&value.length<=200&&Buffer.byteLength(value,'utf8')<=512}
export async function hashPassword(password:string){if(!validPassword(password))throw new Error('Password must be 12-200 characters');const salt=randomBytes(16),digest=await derivePassword(password,salt);return `scrypt$${PASSWORD_N}$${PASSWORD_R}$${PASSWORD_P}$${salt.toString('base64url')}$${digest.toString('base64url')}`}
export async function verifyPassword(password:string,encoded:string|null|undefined){const parts=encoded?.split('$')??[],valid=parts.length===6&&parts[0]==='scrypt'&&parts[1]===String(PASSWORD_N)&&parts[2]===String(PASSWORD_R)&&parts[3]===String(PASSWORD_P)&&/^[A-Za-z0-9_-]{22}$/.test(parts[4])&&/^[A-Za-z0-9_-]{86}$/.test(parts[5]);const salt=valid?Buffer.from(parts[4],'base64url'):dummySalt,expected=valid?Buffer.from(parts[5],'base64url'):dummyDigest;const actual=await derivePassword(password,salt);return Boolean(valid&&expected.length===actual.length&&timingSafeEqual(actual,expected))}
export function canAccess(role:AccessRole,permission:AccessPermission){return permission==='owner'?role==='owner':permission==='author'?role==='owner'||role==='editor':true}
export function cookieToken(request:Request){const match=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${ACCESS_COOKIE}=`));return match?.slice(ACCESS_COOKIE.length+1)||''}
export function sessionCookie(token:string,request:Request,clear=false){return `${ACCESS_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:SESSION_MS/1000}${new URL(request.url).protocol==='https:'?'; Secure':''}`}
export function sameSiteWrite(request:Request){return ['GET','HEAD'].includes(request.method)||request.headers.get('origin')===new URL(request.url).origin}
export interface AccessStore {
 memberForSession(hash:string,now:number):Promise<AccessSessionMember|null>;
 createSession(hash:string,memberId:string,now:number,expires:number,authMethod:AccessSessionMember['authMethod']):Promise<void>;
 deleteSession(hash:string):Promise<void>;
 credentialForEmail(email:string):Promise<AccessCredential|null>;
 setPassword(memberId:string,passwordHash:string,newSessionHash:string,now:number,expires:number):Promise<void>;
 redeem(hash:string,now:number,sessionHash:string,expires:number):Promise<AccessMember|null>;
 invite(email:string,name:string,role:AccessRole,hash:string,expires:number):Promise<AccessMember>;
 list():Promise<AccessMember[]>;
 disable(id:string):Promise<void>;
 bootstrap(email:string,name:string,passwordHash:string,sessionHash:string,now:number,expires:number):Promise<AccessMember|null>;
 allowAttempt(identity:string,now:number):Promise<boolean>;
}
export class PgAccessStore implements AccessStore {
 private async db(){return (await import('./database')).db}
 async memberForSession(hash:string,now:number){return (await (await this.db()).query('SELECT m.id,m.email,m.name,m.role,m.enabled,s.auth_method AS "authMethod",s.authenticated_at AS "authenticatedAt" FROM access_sessions s JOIN access_members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND m.enabled=true',[hash,now])).rows[0]??null}
 async createSession(hash:string,id:string,now:number,expires:number,authMethod:AccessSessionMember['authMethod']){await (await this.db()).query('INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,$5,$3)',[hash,id,now,expires,authMethod])}
 async deleteSession(hash:string){await (await this.db()).query('DELETE FROM access_sessions WHERE token_hash=$1',[hash])}
 async credentialForEmail(email:string){return (await (await this.db()).query('SELECT id,email,name,role,enabled,password_hash AS "passwordHash" FROM access_members WHERE email=$1 AND enabled=true',[email])).rows[0]??null}
 async setPassword(id:string,passwordHash:string,newSessionHash:string,now:number,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');const changed=await c.query('UPDATE access_members SET password_hash=$2 WHERE id=$1 AND enabled=true RETURNING id',[id,passwordHash]);if(!changed.rows[0])throw new Error('member unavailable');await c.query('DELETE FROM access_sessions WHERE member_id=$1',[id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[id]);await c.query("INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,'password',$3)",[newSessionHash,id,now,expires]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async redeem(hash:string,now:number,sessionHash:string,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const r=await c.query('UPDATE access_links SET used_at=$2 WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2 RETURNING member_id,pending_name,pending_role,reset_password',[hash,now]);const link=r.rows[0] as {member_id:string;pending_name:string;pending_role:AccessRole;reset_password:boolean}|undefined;let m:AccessMember|null=null;if(link){const current=(await c.query('SELECT id,email,name,role,enabled FROM access_members WHERE id=$1',[link.member_id])).rows[0] as AccessMember|undefined;if(current?.role==='owner'&&current.enabled&&link.pending_role!=='owner'){const owners=Number((await c.query("SELECT count(*)::int AS count FROM access_members WHERE role='owner' AND enabled=true")).rows[0]?.count??0);if(owners<=1)throw new AccessInvariantError('Keep at least one enabled administrator.')}m=(await c.query('UPDATE access_members SET name=$2,role=$3,enabled=true,password_hash=CASE WHEN $4 THEN NULL ELSE password_hash END WHERE id=$1 RETURNING id,email,name,role,enabled',[link.member_id,link.pending_name,link.pending_role,link.reset_password])).rows[0]??null;if(m&&link.reset_password)await c.query('DELETE FROM access_sessions WHERE member_id=$1',[m.id]);if(m)await c.query("INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,'invite',$3)",[sessionHash,m.id,now,expires])}await c.query('COMMIT');return m}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async invite(email:string,name:string,role:AccessRole,hash:string,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const existing=(await c.query('SELECT id,email,name,role,enabled FROM access_members WHERE email=$1',[email])).rows[0] as AccessMember|undefined;if(existing?.role==='owner'&&existing.enabled&&role!=='owner'){const owners=Number((await c.query("SELECT count(*)::int AS count FROM access_members WHERE role='owner' AND enabled=true")).rows[0]?.count??0);if(owners<=1)throw new AccessInvariantError('Keep at least one enabled administrator.')}const m=existing??(await c.query('INSERT INTO access_members(id,email,name,role,enabled,created_at,password_hash) VALUES($1,$2,$3,$4,false,$5,NULL) RETURNING id,email,name,role,enabled',[randomUUID(),email,name,role,Date.now()])).rows[0];const resetPassword=!existing||!existing.enabled||existing.role!==role;await c.query('DELETE FROM access_links WHERE member_id=$1',[m.id]);await c.query('INSERT INTO access_links(token_hash,member_id,expires_at,pending_name,pending_role,reset_password) VALUES($1,$2,$3,$4,$5,$6)',[hash,m.id,expires,name,role,resetPassword]);await c.query('COMMIT');return m}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async list(){return (await (await this.db()).query('SELECT id,email,name,role,enabled FROM access_members ORDER BY name')).rows}
 async disable(id:string){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const target=(await c.query('SELECT role,enabled FROM access_members WHERE id=$1',[id])).rows[0] as Pick<AccessMember,'role'|'enabled'>|undefined;if(target?.role==='owner'&&target.enabled){const owners=Number((await c.query("SELECT count(*)::int AS count FROM access_members WHERE role='owner' AND enabled=true")).rows[0]?.count??0);if(owners<=1)throw new AccessInvariantError('Keep at least one enabled administrator.')}await c.query('UPDATE access_members SET enabled=false WHERE id=$1',[id]);await c.query('DELETE FROM access_sessions WHERE member_id=$1',[id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[id]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async bootstrap(email:string,name:string,passwordHash:string,sessionHash:string,now:number,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');if((await c.query("SELECT id FROM access_members WHERE role='owner' LIMIT 1")).rows.length){await c.query('ROLLBACK');return null}const r=await c.query("INSERT INTO access_members(id,email,name,role,created_at,password_hash) VALUES($1,$2,$3,'owner',$4,$5) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,role='owner',enabled=true,password_hash=EXCLUDED.password_hash RETURNING id,email,name,role,enabled",[randomUUID(),email,name,now,passwordHash]);await c.query('DELETE FROM access_sessions WHERE member_id=$1',[r.rows[0].id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[r.rows[0].id]);await c.query("INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,'password',$3)",[sessionHash,r.rows[0].id,now,expires]);await c.query('COMMIT');return r.rows[0]}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async allowAttempt(id:string,now:number){const r=await (await this.db()).query(ACCESS_ATTEMPT_SQL,[tokenHash(id),now]);return r.rows[0].attempts<=10}
}

/**
 * The rehearsal account store (S4). Semantics are a line-for-line mirror of
 * PgAccessStore - including the "keep at least one enabled administrator" invariant,
 * single-use invitation links, and per-minute attempt limiting - so an agent driving
 * rehearsal exercises the same rules production enforces. Nothing here reads
 * DATABASE_URL.
 */
export const REHEARSAL_OWNER={id:'rehearsal-owner',email:'rehearsal-owner@rehearsal.invalid',name:'Rehearsal Owner',role:'owner' as AccessRole};
export const REHEARSAL_OWNER_PASSWORD='rehearsal-owner-local-2026';
const ATTEMPT_WINDOW_MS=60_000,ATTEMPT_LIMIT=10;
type MemoryMember=AccessMember&{passwordHash:string|null;createdAt:number};
type MemorySession={memberId:string;expiresAt:number;authMethod:AccessSessionMember['authMethod'];authenticatedAt:number};
type MemoryLink={memberId:string;expiresAt:number;pendingName:string;pendingRole:AccessRole;resetPassword:boolean;usedAt:number|null};

export class MemoryAccessStore implements AccessStore{
 members=new Map<string,MemoryMember>();
 sessions=new Map<string,MemorySession>();
 links=new Map<string,MemoryLink>();
 attempts=new Map<string,{windowStart:number;attempts:number}>();
 /** The seeded password is hashed on first use: scrypt cannot run in a constructor. */
 private seedPending=true;
 constructor(){this.members.set(REHEARSAL_OWNER.id,{...REHEARSAL_OWNER,enabled:true,passwordHash:null,createdAt:Date.now()})}
 private async seed(){if(!this.seedPending)return;this.seedPending=false;const member=this.members.get(REHEARSAL_OWNER.id);if(member&&member.passwordHash===null)member.passwordHash=await hashPassword(REHEARSAL_OWNER_PASSWORD)}
 private enabledOwners(){return [...this.members.values()].filter(m=>m.role==='owner'&&m.enabled).length}
 private detachLinks(memberId:string){for(const [hash,link] of this.links)if(link.memberId===memberId)this.links.delete(hash)}
 private detach(memberId:string){for(const [hash,session] of this.sessions)if(session.memberId===memberId)this.sessions.delete(hash);this.detachLinks(memberId)}
 private view(member:MemoryMember):AccessMember{return {id:member.id,email:member.email,name:member.name,role:member.role,enabled:member.enabled}}
 async memberForSession(hash:string,now:number){const session=this.sessions.get(hash);if(!session||session.expiresAt<=now)return null;const member=this.members.get(session.memberId);if(!member?.enabled)return null;return {...this.view(member),authMethod:session.authMethod,authenticatedAt:session.authenticatedAt}}
 async createSession(hash:string,memberId:string,now:number,expires:number,authMethod:AccessSessionMember['authMethod']){this.sessions.set(hash,{memberId,expiresAt:expires,authMethod,authenticatedAt:now})}
 async deleteSession(hash:string){this.sessions.delete(hash)}
 async credentialForEmail(email:string){await this.seed();const member=[...this.members.values()].find(m=>m.email===email&&m.enabled);return member?{...this.view(member),passwordHash:member.passwordHash}:null}
 async setPassword(memberId:string,passwordHash:string,newSessionHash:string,now:number,expires:number){await this.seed();const member=this.members.get(memberId);if(!member?.enabled)throw new Error('member unavailable');member.passwordHash=passwordHash;this.detach(memberId);this.sessions.set(newSessionHash,{memberId,expiresAt:expires,authMethod:'password',authenticatedAt:now})}
 async redeem(hash:string,now:number,sessionHash:string,expires:number){
  const link=this.links.get(hash);
  if(!link||link.usedAt!==null||link.expiresAt<=now)return null;
  const member=this.members.get(link.memberId);
  // Mirror the Postgres transaction: an invariant failure ROLLBACKs the used_at
  // update, so the link stays redeemable once another administrator exists.
  if(member&&member.role==='owner'&&member.enabled&&link.pendingRole!=='owner'&&this.enabledOwners()<=1)throw new AccessInvariantError('Keep at least one enabled administrator.');
  link.usedAt=now;
  if(!member)return null;
  member.name=link.pendingName;member.role=link.pendingRole;member.enabled=true;
  // A reset invitation clears the password and every live session, exactly as the
  // Postgres transaction does; the spent link itself is kept so it stays single-use.
  if(link.resetPassword){member.passwordHash=null;this.detach(member.id);this.links.set(hash,link)}
  this.sessions.set(sessionHash,{memberId:member.id,expiresAt:expires,authMethod:'invite',authenticatedAt:now});
  return this.view(member);
 }
 async invite(email:string,name:string,role:AccessRole,hash:string,expires:number){
  const existing=[...this.members.values()].find(m=>m.email===email);
  if(existing?.role==='owner'&&existing.enabled&&role!=='owner'&&this.enabledOwners()<=1)throw new AccessInvariantError('Keep at least one enabled administrator.');
  let member=existing;
  if(!member){member={id:randomUUID(),email,name,role,enabled:false,passwordHash:null,createdAt:Date.now()};this.members.set(member.id,member)}
  const resetPassword=!existing||!existing.enabled||existing.role!==role;
  this.detachLinks(member.id);
  this.links.set(hash,{memberId:member.id,expiresAt:expires,pendingName:name,pendingRole:role,resetPassword,usedAt:null});
  return this.view(member);
 }
 async list(){return [...this.members.values()].map(member=>this.view(member)).sort((a,b)=>a.name.localeCompare(b.name))}
 async disable(id:string){const member=this.members.get(id);if(member?.role==='owner'&&member.enabled&&this.enabledOwners()<=1)throw new AccessInvariantError('Keep at least one enabled administrator.');if(member)member.enabled=false;this.detach(id)}
 async bootstrap(email:string,name:string,passwordHash:string,sessionHash:string,now:number,expires:number){
  if([...this.members.values()].some(member=>member.role==='owner'))return null;
  const existing=[...this.members.values()].find(member=>member.email===email);
  const member:MemoryMember=existing?Object.assign(existing,{name,role:'owner' as AccessRole,enabled:true,passwordHash}):{id:randomUUID(),email,name,role:'owner',enabled:true,passwordHash,createdAt:now};
  this.members.set(member.id,member);
  this.detach(member.id);
  this.sessions.set(sessionHash,{memberId:member.id,expiresAt:expires,authMethod:'password',authenticatedAt:now});
  return this.view(member);
 }
 async allowAttempt(identity:string,now:number){
  for(const [key,row] of this.attempts)if(row.windowStart<now-ATTEMPT_WINDOW_MS)this.attempts.delete(key);
  const key=tokenHash(identity),current=this.attempts.get(key);
  const next=!current||current.windowStart<now-ATTEMPT_WINDOW_MS?{windowStart:now,attempts:1}:{windowStart:current.windowStart,attempts:current.attempts+1};
  this.attempts.set(key,next);
  return next.attempts<=ATTEMPT_LIMIT;
 }
}

export const accessStore:AccessStore=rehearsalMode()?new MemoryAccessStore():new PgAccessStore();
export async function currentMember(request:Request,store:AccessStore=accessStore){const token=cookieToken(request);if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;return store.memberForSession(tokenHash(token),Date.now())}
export async function authorizeRequest(request:Request,permission:AccessPermission='read'):Promise<AccessMember|null>{
 const bearer=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 // Transitional compatibility for existing Companion and authoring clients. It is
 // deliberately excluded from owner/account administration and should be retired
 // after every human author has moved to an individual membership.
 if(permission!=='owner'&&secretEqual(bearer,process.env.CONTROL_KEY))return {id:'legacy-control',email:'',name:'Administrator',role:'owner',enabled:true};
 if(permission==='read'&&secretEqual(bearer,process.env.OUTPUT_KEY))return {id:'legacy-output',email:'',name:'Graphics output',role:'operator',enabled:true};
 if(!sameSiteWrite(request))return null;
 const member=await currentMember(request);
 return member&&canAccess(member.role,permission)?member:null;
}
export async function issueSession(member:AccessMember,store:AccessStore=accessStore,authMethod:AccessSessionMember['authMethod']='invite'){const token=accessToken();const now=Date.now();await store.createSession(tokenHash(token),member.id,now,now+SESSION_MS,authMethod);return token}
export async function redeemSession(inviteToken:string,store:AccessStore=accessStore){const token=accessToken(),now=Date.now();const user=await store.redeem(tokenHash(inviteToken),now,tokenHash(token),now+SESSION_MS);return user?{user,token}:null}
export async function replacePasswordSession(member:AccessMember,passwordHash:string,store:AccessStore=accessStore){const token=accessToken(),now=Date.now();await store.setPassword(member.id,passwordHash,tokenHash(token),now,now+SESSION_MS);return token}
export async function bootstrapWithPassword(email:string,name:string,passwordHash:string,store:AccessStore=accessStore){const token=accessToken(),now=Date.now();const user=await store.bootstrap(email,name,passwordHash,tokenHash(token),now,now+SESSION_MS);return user?{user,token}:null}
