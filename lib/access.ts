import {createHash,randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {rehearsalMode} from './rehearsal';
import {DEVICE_TOKEN_PREFIX,verifyDeviceToken,verifyDeviceTokenFresh} from './devices';

export type AccessRole='owner'|'editor'|'operator';
export type AccessPermission='read'|'control'|'author'|'owner';
export type AccessMember={id:string;email:string;name:string;role:AccessRole;enabled:boolean};
export type AccessSessionMember=AccessMember&{authMethod:'invite'|'password'|'bootstrap'|'google';authenticatedAt:number};
export type AccessCredential=AccessMember&{passwordHash:string|null};
/** A verified identity assertion from the identity provider. Never persisted whole. */
export type GoogleIdentity={provider:'google';issuer:string;subject:string;email:string;emailVerified:boolean;name?:string};
/** Someone who signed in with Google but is not a member here: held for an administrator to approve or decline. Grants nothing by itself. */
export type AccessRequest={id:string;email:string;name:string;requestedAt:number;lastSeenAt:number;attempts:number};
/** An unredeemed invitation, so the members list can tell "Invited" from "Removed". */
export type PendingInvitation={memberId:string;expiresAt:number};
/** What a member is told about their own link; the issuer and subject never leave the store. */
export type LinkedIdentity={provider:'google';email:string;linkedAt:number;lastUsedAt:number|null};
/** A short-lived sign-in attempt, held server-side rather than in a signed cookie. */
export type SignInFlow={kind:'signin'|'link'|'redeem';createdAt:number;codeVerifier:string;state:string;nonce:string;redirectUri:string;memberId?:string;inviteHash?:string;pending?:{identity:GoogleIdentity;status:'confirm'}};
export class AccessInvariantError extends Error{}
/** One identity belongs to at most one member per workspace; binding it twice is refused. */
export class AccessIdentityConflictError extends Error{code='identity_conflict'}
const IDENTITY_CONFLICT='That Google account is already linked to a different member here.';
export const ACCESS_COOKIE='crc_access';
/** The rate-limit bucket for browser-facing writes: the Vercel-supplied client address on Vercel, one shared bucket anywhere else. Never a header a client can set itself. */
export function accessRequestIdentity(request:Request){return process.env.VERCEL==='1'?(request.headers.get('x-vercel-forwarded-for')||'unknown').trim().slice(0,128):'local'}
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
 /** `identity`, when given, is bound inside the same transaction as the redemption. */
 redeem(hash:string,now:number,sessionHash:string,expires:number,identity?:GoogleIdentity):Promise<AccessMember|null>;
 invite(email:string,name:string,role:AccessRole,hash:string,expires:number):Promise<AccessMember>;
 list():Promise<AccessMember[]>;
 disable(id:string):Promise<void>;
 bootstrap(email:string,name:string,passwordHash:string,sessionHash:string,now:number,expires:number):Promise<AccessMember|null>;
 allowAttempt(identity:string,now:number):Promise<boolean>;
 identityForMember(memberId:string):Promise<LinkedIdentity|null>;
 /** Returns disabled members too - the caller decides what a removed member is told. */
 memberForIdentity(identity:Pick<GoogleIdentity,'provider'|'issuer'|'subject'>,now:number):Promise<(AccessMember&{enabled:boolean})|null>;
 linkIdentity(memberId:string,identity:GoogleIdentity,now:number):Promise<void>;
 unlinkIdentity(memberId:string,provider:'google'):Promise<void>;
 /** `now` is the clock the prune of expired flows uses; it defaults to the flow's own creation time. */
 putSignInFlow(tokenHash:string,flow:SignInFlow,expiresAt:number,now?:number):Promise<void>;
 /** Delete-returning: the flow is gone once taken, so a replayed callback finds nothing. */
 takeSignInFlow(tokenHash:string,now:number):Promise<SignInFlow|null>;
 /** Read-only: the confirmation card may be rendered any number of times without touching the row or its expiry. */
 peekSignInFlow(tokenHash:string,now:number):Promise<SignInFlow|null>;
 /** Read-only lookups for the Google decision table: a member by id, and who a live invitation is for. Neither consumes anything. */
 memberById(memberId:string):Promise<AccessMember|null>;
 invitationTarget(inviteHash:string,now:number):Promise<{memberId:string;email:string}|null>;
 /** Any member by address, enabled or not; `credentialForEmail` sees only enabled ones. */
 memberByEmail(email:string):Promise<AccessMember|null>;
 /** Administration: a role change (refused when it would leave no enabled administrator) and restoring a removed member. Both return null for an unknown id. */
 setRole(memberId:string,role:AccessRole):Promise<AccessMember|null>;
 restore(memberId:string):Promise<AccessMember|null>;
 pendingInvitations():Promise<PendingInvitation[]>;
 /** Access requests, recorded by the Google sign-in row that finds no member. Approval creates or re-enables the member and binds the identity in one transaction; a conflict leaves the request in place. Decline deletes the row. */
 recordAccessRequest(identity:GoogleIdentity,now:number):Promise<void>;
 listAccessRequests():Promise<AccessRequest[]>;
 approveAccessRequest(requestId:string,role:AccessRole,now:number):Promise<AccessMember|null>;
 declineAccessRequest(requestId:string):Promise<void>;
}
/** Just enough of a pg client for the helpers shared between transactions. */
type PgTransaction={query:(text:string,values?:unknown[])=>Promise<{rows:Array<{member_id?:string}>}>};
/** A race that slips past the FOR UPDATE read still surfaces as a conflict, not a 500. */
function identityConflict(error:unknown){return (error as {code?:string})?.code==='23505'?new AccessIdentityConflictError(IDENTITY_CONFLICT):error}
export class PgAccessStore implements AccessStore {
 private async db(){return (await import('./database')).db}
 async memberForSession(hash:string,now:number){return (await (await this.db()).query('SELECT m.id,m.email,m.name,m.role,m.enabled,s.auth_method AS "authMethod",s.authenticated_at AS "authenticatedAt" FROM access_sessions s JOIN access_members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND m.enabled=true',[hash,now])).rows[0]??null}
 async createSession(hash:string,id:string,now:number,expires:number,authMethod:AccessSessionMember['authMethod']){await (await this.db()).query('INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,$5,$3)',[hash,id,now,expires,authMethod])}
 async deleteSession(hash:string){await (await this.db()).query('DELETE FROM access_sessions WHERE token_hash=$1',[hash])}
 async credentialForEmail(email:string){return (await (await this.db()).query('SELECT id,email,name,role,enabled,password_hash AS "passwordHash" FROM access_members WHERE email=$1 AND enabled=true',[email])).rows[0]??null}
 async setPassword(id:string,passwordHash:string,newSessionHash:string,now:number,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');const changed=await c.query('UPDATE access_members SET password_hash=$2 WHERE id=$1 AND enabled=true RETURNING id',[id,passwordHash]);if(!changed.rows[0])throw new Error('member unavailable');await c.query('DELETE FROM access_sessions WHERE member_id=$1',[id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[id]);await c.query("INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,'password',$3)",[newSessionHash,id,now,expires]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async redeem(hash:string,now:number,sessionHash:string,expires:number,identity?:GoogleIdentity){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const r=await c.query('UPDATE access_links SET used_at=$2 WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2 RETURNING member_id,pending_name,pending_role,reset_password',[hash,now]);const link=r.rows[0] as {member_id:string;pending_name:string;pending_role:AccessRole;reset_password:boolean}|undefined;let m:AccessMember|null=null;if(link){const current=(await c.query('SELECT id,email,name,role,enabled FROM access_members WHERE id=$1',[link.member_id])).rows[0] as AccessMember|undefined;if(current?.role==='owner'&&current.enabled&&link.pending_role!=='owner'){const owners=Number((await c.query("SELECT count(*)::int AS count FROM access_members WHERE role='owner' AND enabled=true")).rows[0]?.count??0);if(owners<=1)throw new AccessInvariantError('Keep at least one enabled administrator.')}m=(await c.query('UPDATE access_members SET name=$2,role=$3,enabled=true,password_hash=CASE WHEN $4 THEN NULL ELSE password_hash END WHERE id=$1 RETURNING id,email,name,role,enabled',[link.member_id,link.pending_name,link.pending_role,link.reset_password])).rows[0]??null;if(m&&link.reset_password)await c.query('DELETE FROM access_sessions WHERE member_id=$1',[m.id]);if(m)await c.query("INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,'invite',$3)",[sessionHash,m.id,now,expires]);if(m&&identity)await this.bindIdentity(c,m.id,identity,now)}await c.query('COMMIT');return m}catch(e){await c.query('ROLLBACK');throw identity?identityConflict(e):e}finally{c.release()}}
 async invite(email:string,name:string,role:AccessRole,hash:string,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const existing=(await c.query('SELECT id,email,name,role,enabled FROM access_members WHERE email=$1',[email])).rows[0] as AccessMember|undefined;if(existing?.role==='owner'&&existing.enabled&&role!=='owner'){const owners=Number((await c.query("SELECT count(*)::int AS count FROM access_members WHERE role='owner' AND enabled=true")).rows[0]?.count??0);if(owners<=1)throw new AccessInvariantError('Keep at least one enabled administrator.')}const m=existing??(await c.query('INSERT INTO access_members(id,email,name,role,enabled,created_at,password_hash) VALUES($1,$2,$3,$4,false,$5,NULL) RETURNING id,email,name,role,enabled',[randomUUID(),email,name,role,Date.now()])).rows[0];const resetPassword=!existing||!existing.enabled||existing.role!==role;await c.query('DELETE FROM access_links WHERE member_id=$1',[m.id]);await c.query('INSERT INTO access_links(token_hash,member_id,expires_at,pending_name,pending_role,reset_password) VALUES($1,$2,$3,$4,$5,$6)',[hash,m.id,expires,name,role,resetPassword]);await c.query('COMMIT');return m}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async list(){return (await (await this.db()).query('SELECT id,email,name,role,enabled FROM access_members ORDER BY name')).rows}
 async disable(id:string){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const target=(await c.query('SELECT role,enabled FROM access_members WHERE id=$1',[id])).rows[0] as Pick<AccessMember,'role'|'enabled'>|undefined;if(target?.role==='owner'&&target.enabled){const owners=Number((await c.query("SELECT count(*)::int AS count FROM access_members WHERE role='owner' AND enabled=true")).rows[0]?.count??0);if(owners<=1)throw new AccessInvariantError('Keep at least one enabled administrator.')}await c.query('UPDATE access_members SET enabled=false WHERE id=$1',[id]);await c.query('DELETE FROM access_sessions WHERE member_id=$1',[id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[id]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async bootstrap(email:string,name:string,passwordHash:string,sessionHash:string,now:number,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');if((await c.query("SELECT id FROM access_members WHERE role='owner' LIMIT 1")).rows.length){await c.query('ROLLBACK');return null}const r=await c.query("INSERT INTO access_members(id,email,name,role,created_at,password_hash) VALUES($1,$2,$3,'owner',$4,$5) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,role='owner',enabled=true,password_hash=EXCLUDED.password_hash RETURNING id,email,name,role,enabled",[randomUUID(),email,name,now,passwordHash]);await c.query('DELETE FROM access_sessions WHERE member_id=$1',[r.rows[0].id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[r.rows[0].id]);await c.query("INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at,auth_method,authenticated_at) VALUES($1,$2,$3,$4,'password',$3)",[sessionHash,r.rows[0].id,now,expires]);await c.query('COMMIT');return r.rows[0]}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async allowAttempt(id:string,now:number){const r=await (await this.db()).query(ACCESS_ATTEMPT_SQL,[tokenHash(id),now]);return r.rows[0].attempts<=10}
 /**
  * Binds one identity to one member on an open transaction, so `redeem` can do it
  * without a second connection. The PK (provider,issuer,subject) is read FOR UPDATE
  * first: an identity already held by another member is refused rather than moved,
  * and the caller's ROLLBACK then undoes everything else it had done.
  */
 private async bindIdentity(c:PgTransaction,memberId:string,identity:GoogleIdentity,now:number){
  const held=(await c.query('SELECT member_id FROM access_identities WHERE provider=$1 AND issuer=$2 AND subject=$3 FOR UPDATE',[identity.provider,identity.issuer,identity.subject])).rows[0];
  if(held&&held.member_id!==memberId)throw new AccessIdentityConflictError(IDENTITY_CONFLICT);
  // The member keeps at most one Google link; re-linking replaces the previous one.
  await c.query('INSERT INTO access_identities(provider,issuer,subject,member_id,email_at_link,linked_at,last_used_at) VALUES($1,$2,$3,$4,$5,$6,NULL) ON CONFLICT(member_id,provider) DO UPDATE SET issuer=EXCLUDED.issuer,subject=EXCLUDED.subject,email_at_link=EXCLUDED.email_at_link,linked_at=EXCLUDED.linked_at,last_used_at=NULL',[identity.provider,identity.issuer,identity.subject,memberId,identity.email,now]);
 }
 async identityForMember(memberId:string){return (await (await this.db()).query('SELECT provider,email_at_link AS "email",linked_at AS "linkedAt",last_used_at AS "lastUsedAt" FROM access_identities WHERE member_id=$1 AND provider=$2',[memberId,'google'])).rows[0]??null}
 async memberForIdentity(identity:Pick<GoogleIdentity,'provider'|'issuer'|'subject'>,now:number){
  const db=await this.db();
  const member=(await db.query('SELECT m.id,m.email,m.name,m.role,m.enabled FROM access_identities i JOIN access_members m ON m.id=i.member_id WHERE i.provider=$1 AND i.issuer=$2 AND i.subject=$3',[identity.provider,identity.issuer,identity.subject])).rows[0]??null;
  // A removed member's link is kept so the callback can say so, but last use is not recorded.
  if(member?.enabled)await db.query('UPDATE access_identities SET last_used_at=$4 WHERE provider=$1 AND issuer=$2 AND subject=$3',[identity.provider,identity.issuer,identity.subject,now]);
  return member;
 }
 async linkIdentity(memberId:string,identity:GoogleIdentity,now:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');await this.bindIdentity(c,memberId,identity,now);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw identityConflict(e)}finally{c.release()}}
 async unlinkIdentity(memberId:string,provider:'google'){await (await this.db()).query('DELETE FROM access_identities WHERE member_id=$1 AND provider=$2',[memberId,provider])}
 async putSignInFlow(hash:string,flow:SignInFlow,expiresAt:number,now=flow.createdAt){await (await this.db()).query('WITH pruned AS (DELETE FROM access_sign_in_flows WHERE expires_at<=$3) INSERT INTO access_sign_in_flows(token_hash,payload,expires_at) VALUES($1,$2::jsonb,$4) ON CONFLICT(token_hash) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at',[hash,JSON.stringify(flow),now,expiresAt])}
 async peekSignInFlow(hash:string,now:number){const row=(await (await this.db()).query('SELECT payload FROM access_sign_in_flows WHERE token_hash=$1 AND expires_at>$2',[hash,now])).rows[0];return row?row.payload as SignInFlow:null}
 async takeSignInFlow(hash:string,now:number){const row=(await (await this.db()).query('DELETE FROM access_sign_in_flows WHERE token_hash=$1 RETURNING payload,expires_at AS "expiresAt"',[hash])).rows[0];return row&&Number(row.expiresAt)>now?row.payload as SignInFlow:null}
 async memberById(id:string){return (await (await this.db()).query('SELECT id,email,name,role,enabled FROM access_members WHERE id=$1',[id])).rows[0]??null}
 async invitationTarget(hash:string,now:number){return (await (await this.db()).query('SELECT l.member_id AS "memberId",m.email FROM access_links l JOIN access_members m ON m.id=l.member_id WHERE l.token_hash=$1 AND l.used_at IS NULL AND l.expires_at>$2',[hash,now])).rows[0]??null}
 async memberByEmail(email:string){return (await (await this.db()).query('SELECT id,email,name,role,enabled FROM access_members WHERE email=$1',[email.trim().toLowerCase()])).rows[0]??null}
 async setRole(id:string,role:AccessRole){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const target=(await c.query('SELECT role,enabled FROM access_members WHERE id=$1',[id])).rows[0] as Pick<AccessMember,'role'|'enabled'>|undefined;if(!target){await c.query('ROLLBACK');return null}if(target.role==='owner'&&target.enabled&&role!=='owner'){const owners=Number((await c.query("SELECT count(*)::int AS count FROM access_members WHERE role='owner' AND enabled=true")).rows[0]?.count??0);if(owners<=1)throw new AccessInvariantError('Keep at least one enabled administrator.')}const m=(await c.query('UPDATE access_members SET role=$2 WHERE id=$1 RETURNING id,email,name,role,enabled',[id,role])).rows[0] as AccessMember|undefined;await c.query('COMMIT');return m??null}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async restore(id:string){return (await (await this.db()).query('UPDATE access_members SET enabled=true WHERE id=$1 RETURNING id,email,name,role,enabled',[id])).rows[0]??null}
 async pendingInvitations(){return (await (await this.db()).query('SELECT member_id AS "memberId",expires_at AS "expiresAt" FROM access_links WHERE used_at IS NULL')).rows.map((row:{memberId:string;expiresAt:string|number})=>({memberId:row.memberId,expiresAt:Number(row.expiresAt)}))}
 async recordAccessRequest(identity:GoogleIdentity,now:number){await (await this.db()).query('INSERT INTO access_requests(id,provider,issuer,subject,email,name,requested_at,last_seen_at,attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$7,1) ON CONFLICT(provider,issuer,subject) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,last_seen_at=EXCLUDED.last_seen_at,attempts=access_requests.attempts+1',[randomUUID(),identity.provider,identity.issuer,identity.subject,identity.email.trim().toLowerCase(),(identity.name??'').trim().slice(0,80),now])}
 async listAccessRequests(){return (await (await this.db()).query('SELECT id,email,name,requested_at AS "requestedAt",last_seen_at AS "lastSeenAt",attempts FROM access_requests ORDER BY requested_at')).rows.map((row:Record<string,unknown>)=>({id:String(row.id),email:String(row.email),name:String(row.name),requestedAt:Number(row.requestedAt),lastSeenAt:Number(row.lastSeenAt),attempts:Number(row.attempts)}))}
 /** One transaction: the request row is deleted, the member created or re-enabled with the chosen role, any open invitation dropped, and the identity bound. A conflict rolls all of it back, so the request stays for the administrator to see. */
 async approveAccessRequest(requestId:string,role:AccessRole,now:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');const request=(await c.query('DELETE FROM access_requests WHERE id=$1 RETURNING provider,issuer,subject,email,name',[requestId])).rows[0] as {provider:'google';issuer:string;subject:string;email:string;name:string}|undefined;if(!request){await c.query('ROLLBACK');return null}const existing=(await c.query('SELECT id,email,name,role,enabled FROM access_members WHERE email=$1',[request.email])).rows[0] as AccessMember|undefined;const member=(existing?(await c.query("UPDATE access_members SET role=$2,enabled=true,name=CASE WHEN name='' THEN $3 ELSE name END WHERE id=$1 RETURNING id,email,name,role,enabled",[existing.id,role,request.name||request.email])).rows[0]:(await c.query('INSERT INTO access_members(id,email,name,role,enabled,created_at,password_hash) VALUES($1,$2,$3,$4,true,$5,NULL) RETURNING id,email,name,role,enabled',[randomUUID(),request.email,request.name||request.email,role,now])).rows[0]) as AccessMember;await c.query('DELETE FROM access_links WHERE member_id=$1',[member.id]);await this.bindIdentity(c,member.id,{provider:request.provider,issuer:request.issuer,subject:request.subject,email:request.email,emailVerified:true},now);await c.query('COMMIT');return member}catch(e){await c.query('ROLLBACK');throw identityConflict(e)}finally{c.release()}}
 async declineAccessRequest(requestId:string){await (await this.db()).query('DELETE FROM access_requests WHERE id=$1',[requestId])}
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
type MemoryIdentity={provider:'google';issuer:string;subject:string;memberId:string;emailAtLink:string;linkedAt:number;lastUsedAt:number|null};
type MemoryRequest={id:string;provider:'google';issuer:string;subject:string;email:string;name:string;requestedAt:number;lastSeenAt:number;attempts:number};
/** The Postgres primary key (provider,issuer,subject), flattened to a map key. */
const identityKey=(identity:Pick<GoogleIdentity,'provider'|'issuer'|'subject'>)=>JSON.stringify([identity.provider,identity.issuer,identity.subject]);

export class MemoryAccessStore implements AccessStore{
 members=new Map<string,MemoryMember>();
 sessions=new Map<string,MemorySession>();
 links=new Map<string,MemoryLink>();
 attempts=new Map<string,{windowStart:number;attempts:number}>();
 identities=new Map<string,MemoryIdentity>();
 flows=new Map<string,{flow:SignInFlow;expiresAt:number}>();
 requests=new Map<string,MemoryRequest>();
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
 /**
  * Mirrors PgAccessStore.bindIdentity: an identity already held by another member is
  * refused, and the member keeps at most one Google link.
  */
 private bindIdentity(memberId:string,identity:GoogleIdentity,now:number){
  const key=identityKey(identity),held=this.identities.get(key);
  if(held&&held.memberId!==memberId)throw new AccessIdentityConflictError(IDENTITY_CONFLICT);
  for(const [existing,row] of this.identities)if(row.memberId===memberId&&row.provider===identity.provider&&existing!==key)this.identities.delete(existing);
  this.identities.set(key,{provider:identity.provider,issuer:identity.issuer,subject:identity.subject,memberId,emailAtLink:identity.email,linkedAt:now,lastUsedAt:null});
 }
 async redeem(hash:string,now:number,sessionHash:string,expires:number,identity?:GoogleIdentity){
  const link=this.links.get(hash);
  if(!link||link.usedAt!==null||link.expiresAt<=now)return null;
  const member=this.members.get(link.memberId);
  // Mirror the Postgres transaction: an invariant failure ROLLBACKs the used_at
  // update, so the link stays redeemable once another administrator exists.
  if(member&&member.role==='owner'&&member.enabled&&link.pendingRole!=='owner'&&this.enabledOwners()<=1)throw new AccessInvariantError('Keep at least one enabled administrator.');
  // The identity conflict is detected before anything is written, so a refused bind
  // leaves the invitation unused exactly as the rolled-back Postgres transaction does.
  if(member&&identity){const held=this.identities.get(identityKey(identity));if(held&&held.memberId!==member.id)throw new AccessIdentityConflictError(IDENTITY_CONFLICT)}
  link.usedAt=now;
  if(!member)return null;
  member.name=link.pendingName;member.role=link.pendingRole;member.enabled=true;
  // A reset invitation clears the password and every live session, exactly as the
  // Postgres transaction does; the spent link itself is kept so it stays single-use.
  if(link.resetPassword){member.passwordHash=null;this.detach(member.id);this.links.set(hash,link)}
  this.sessions.set(sessionHash,{memberId:member.id,expiresAt:expires,authMethod:'invite',authenticatedAt:now});
  if(identity)this.bindIdentity(member.id,identity,now);
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
 async identityForMember(memberId:string){
  const row=[...this.identities.values()].find(identity=>identity.memberId===memberId&&identity.provider==='google');
  return row?{provider:row.provider,email:row.emailAtLink,linkedAt:row.linkedAt,lastUsedAt:row.lastUsedAt}:null;
 }
 async memberForIdentity(identity:Pick<GoogleIdentity,'provider'|'issuer'|'subject'>,now:number){
  const row=this.identities.get(identityKey(identity));
  const member=row&&this.members.get(row.memberId);
  if(!row||!member)return null;
  // A removed member still resolves - only an enabled one records the use.
  if(member.enabled)row.lastUsedAt=now;
  return this.view(member);
 }
 async linkIdentity(memberId:string,identity:GoogleIdentity,now:number){this.bindIdentity(memberId,identity,now)}
 async unlinkIdentity(memberId:string,provider:'google'){for(const [key,row] of this.identities)if(row.memberId===memberId&&row.provider===provider)this.identities.delete(key)}
 async putSignInFlow(hash:string,flow:SignInFlow,expiresAt:number,now=flow.createdAt){
  for(const [key,row] of this.flows)if(row.expiresAt<=now)this.flows.delete(key);
  // Stored as a value, as the jsonb column does: later edits to the caller's object
  // must not reach a flow already in the store.
  this.flows.set(hash,{flow:structuredClone(flow),expiresAt});
 }
 async takeSignInFlow(hash:string,now:number){
  const row=this.flows.get(hash);
  if(!row)return null;
  this.flows.delete(hash);
  return row.expiresAt>now?row.flow:null;
 }
 async peekSignInFlow(hash:string,now:number){
  const row=this.flows.get(hash);
  return row&&row.expiresAt>now?structuredClone(row.flow):null;
 }
 async memberById(id:string){await this.seed();const member=this.members.get(id);return member?this.view(member):null}
 async invitationTarget(hash:string,now:number){
  const link=this.links.get(hash);
  if(!link||link.usedAt!==null||link.expiresAt<=now)return null;
  const member=this.members.get(link.memberId);
  return member?{memberId:member.id,email:member.email}:null;
 }
 async memberByEmail(email:string){await this.seed();const key=email.trim().toLowerCase();const member=[...this.members.values()].find(m=>m.email===key);return member?this.view(member):null}
 async setRole(id:string,role:AccessRole){const member=this.members.get(id);if(!member)return null;if(member.role==='owner'&&member.enabled&&role!=='owner'&&this.enabledOwners()<=1)throw new AccessInvariantError('Keep at least one enabled administrator.');member.role=role;return this.view(member)}
 async restore(id:string){const member=this.members.get(id);if(!member)return null;member.enabled=true;return this.view(member)}
 async pendingInvitations(){return [...this.links.values()].filter(link=>link.usedAt===null).map(link=>({memberId:link.memberId,expiresAt:link.expiresAt}))}
 async recordAccessRequest(identity:GoogleIdentity,now:number){
  const key=identityKey(identity),email=identity.email.trim().toLowerCase(),name=(identity.name??'').trim().slice(0,80);
  const current=this.requests.get(key);
  this.requests.set(key,current?{...current,email,name,lastSeenAt:now,attempts:current.attempts+1}:{id:randomUUID(),provider:identity.provider,issuer:identity.issuer,subject:identity.subject,email,name,requestedAt:now,lastSeenAt:now,attempts:1});
 }
 async listAccessRequests(){return [...this.requests.values()].sort((a,b)=>a.requestedAt-b.requestedAt).map(({id,email,name,requestedAt,lastSeenAt,attempts})=>({id,email,name,requestedAt,lastSeenAt,attempts}))}
 async approveAccessRequest(requestId:string,role:AccessRole,now:number){
  const entry=[...this.requests.entries()].find(([,row])=>row.id===requestId);
  if(!entry)return null;
  const [key,request]=entry;
  const identity:GoogleIdentity={provider:request.provider,issuer:request.issuer,subject:request.subject,email:request.email,emailVerified:true};
  const existing=[...this.members.values()].find(m=>m.email===request.email);
  // The conflict is detected before anything is written, so a refused approval leaves the
  // request in place exactly as the rolled-back Postgres transaction does.
  const held=this.identities.get(identityKey(identity));
  if(held&&(!existing||held.memberId!==existing.id))throw new AccessIdentityConflictError(IDENTITY_CONFLICT);
  let member=existing;
  if(member){member.role=role;member.enabled=true;if(!member.name)member.name=request.name||request.email}
  else{member={id:randomUUID(),email:request.email,name:request.name||request.email,role,enabled:true,passwordHash:null,createdAt:now};this.members.set(member.id,member)}
  this.detachLinks(member.id);
  this.bindIdentity(member.id,identity,now);
  this.requests.delete(key);
  return this.view(member);
 }
 async declineAccessRequest(requestId:string){for(const [key,row] of this.requests)if(row.id===requestId)this.requests.delete(key)}
}

export const accessStore:AccessStore=rehearsalMode()?new MemoryAccessStore():new PgAccessStore();
export async function currentMember(request:Request,store:AccessStore=accessStore){const token=cookieToken(request);if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;return store.memberForSession(tokenHash(token),Date.now())}
/**
 * `freshDevice` makes a device token verify against the store directly, bypassing the
 * D4 positive cache. The realtime ticket route sets it so a revoked device is refused at
 * its next reconnection; every ordinary API call leaves it off and keeps the D4 cache.
 */
export async function authorizeRequest(request:Request,permission:AccessPermission='read',options:{freshDevice?:boolean}={}):Promise<AccessMember|null>{
 const bearer=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 // Transitional compatibility for existing Companion and playback clients: read and live
 // control only. Authoring moved to individual memberships (the web editor by session, MCP by
 // consent) on 2026-09-14, so the shared key is refused for `author` exactly as a device token is,
 // and it has never administered members. Retire it when the last legacy client is paired.
 if(permission!=='owner'&&permission!=='author'&&secretEqual(bearer,process.env.CONTROL_KEY))return {id:'legacy-control',email:'',name:'Administrator',role:'owner',enabled:true};
 if(permission==='read'&&secretEqual(bearer,process.env.OUTPUT_KEY))return {id:'legacy-output',email:'',name:'Graphics output',role:'operator',enabled:true};
 // D3: a paired device. A Companion credential satisfies read and control, a graphics
 // output credential satisfies read, and neither ever becomes an author or an owner -
 // so a device token is not even looked up for those two permissions.
 if(bearer.startsWith(DEVICE_TOKEN_PREFIX)&&permission!=='author'&&permission!=='owner'){
  const credential=options.freshDevice?await verifyDeviceTokenFresh(bearer):await verifyDeviceToken(bearer);
  if(credential&&(credential.kind==='companion'||permission==='read'))return {id:`device:${credential.id}`,email:'',name:credential.name,role:'operator',enabled:true};
 }
 if(!sameSiteWrite(request))return null;
 const member=await currentMember(request);
 return member&&canAccess(member.role,permission)?member:null;
}
export async function issueSession(member:AccessMember,store:AccessStore=accessStore,authMethod:AccessSessionMember['authMethod']='invite'){const token=accessToken();const now=Date.now();await store.createSession(tokenHash(token),member.id,now,now+SESSION_MS,authMethod);return token}
export async function redeemSession(inviteToken:string,store:AccessStore=accessStore){const token=accessToken(),now=Date.now();const user=await store.redeem(tokenHash(inviteToken),now,tokenHash(token),now+SESSION_MS);return user?{user,token}:null}
export async function replacePasswordSession(member:AccessMember,passwordHash:string,store:AccessStore=accessStore){const token=accessToken(),now=Date.now();await store.setPassword(member.id,passwordHash,tokenHash(token),now,now+SESSION_MS);return token}
export async function bootstrapWithPassword(email:string,name:string,passwordHash:string,store:AccessStore=accessStore){const token=accessToken(),now=Date.now();const user=await store.bootstrap(email,name,passwordHash,tokenHash(token),now,now+SESSION_MS);return user?{user,token}:null}
