import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

export type AccessRole='owner'|'editor'|'operator';
export type AccessPermission='read'|'control'|'author'|'owner';
export type AccessMember={id:string;email:string;name:string;role:AccessRole;enabled:boolean};
export const ACCESS_COOKIE='crc_access';
const SESSION_MS=30*24*60*60_000;
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const accessToken=()=>randomBytes(32).toString('base64url');
export function secretEqual(actual:string,expected:string|undefined){if(!expected)return false;const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
export function canAccess(role:AccessRole,permission:AccessPermission){return permission==='owner'?role==='owner':permission==='author'?role==='owner'||role==='editor':true}
export function cookieToken(request:Request){const match=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${ACCESS_COOKIE}=`));return match?.slice(ACCESS_COOKIE.length+1)||''}
export function sessionCookie(token:string,request:Request,clear=false){return `${ACCESS_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:SESSION_MS/1000}${new URL(request.url).protocol==='https:'?'; Secure':''}`}
export function sameSiteWrite(request:Request){return ['GET','HEAD'].includes(request.method)||request.headers.get('origin')===new URL(request.url).origin}
export interface AccessStore {
 memberForSession(hash:string,now:number):Promise<AccessMember|null>;
 createSession(hash:string,memberId:string,now:number,expires:number):Promise<void>;
 deleteSession(hash:string):Promise<void>;
 redeem(hash:string,now:number):Promise<AccessMember|null>;
 invite(email:string,name:string,role:AccessRole,hash:string,expires:number):Promise<AccessMember>;
 list():Promise<AccessMember[]>;
 disable(id:string):Promise<void>;
 bootstrap(email:string,name:string):Promise<AccessMember|null>;
 allowAttempt(identity:string,now:number):Promise<boolean>;
}
export class PgAccessStore implements AccessStore {
 private async db(){return (await import('./database')).db}
 async memberForSession(hash:string,now:number){return (await (await this.db()).query('SELECT m.id,m.email,m.name,m.role,m.enabled FROM access_sessions s JOIN access_members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND m.enabled=true',[hash,now])).rows[0]??null}
 async createSession(hash:string,id:string,now:number,expires:number){await (await this.db()).query('INSERT INTO access_sessions(token_hash,member_id,created_at,expires_at) VALUES($1,$2,$3,$4)',[hash,id,now,expires])}
 async deleteSession(hash:string){await (await this.db()).query('DELETE FROM access_sessions WHERE token_hash=$1',[hash])}
 async redeem(hash:string,now:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');const r=await c.query('UPDATE access_links SET used_at=$2 WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2 RETURNING member_id',[hash,now]);const id=r.rows[0]?.member_id;const m=id?(await c.query('SELECT id,email,name,role,enabled FROM access_members WHERE id=$1 AND enabled=true',[id])).rows[0]:null;await c.query('COMMIT');return m??null}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async invite(email:string,name:string,role:AccessRole,hash:string,expires:number){const c=await (await this.db()).connect();try{await c.query('BEGIN');const r=await c.query('INSERT INTO access_members(id,email,name,role,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,enabled=true RETURNING id,email,name,role,enabled',[randomUUID(),email,name,role,Date.now()]);const m=r.rows[0];await c.query('DELETE FROM access_links WHERE member_id=$1',[m.id]);await c.query('INSERT INTO access_links(token_hash,member_id,expires_at) VALUES($1,$2,$3)',[hash,m.id,expires]);await c.query('COMMIT');return m}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async list(){return (await (await this.db()).query('SELECT id,email,name,role,enabled FROM access_members ORDER BY name')).rows}
 async disable(id:string){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('UPDATE access_members SET enabled=false WHERE id=$1',[id]);await c.query('DELETE FROM access_sessions WHERE member_id=$1',[id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[id]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async bootstrap(email:string,name:string){const c=await (await this.db()).connect();try{await c.query('BEGIN');await c.query('LOCK TABLE access_members IN EXCLUSIVE MODE');if((await c.query("SELECT id FROM access_members WHERE role='owner' LIMIT 1")).rows.length){await c.query('ROLLBACK');return null}const r=await c.query("INSERT INTO access_members(id,email,name,role,created_at) VALUES($1,$2,$3,'owner',$4) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,role='owner',enabled=true RETURNING id,email,name,role,enabled",[randomUUID(),email,name,Date.now()]);await c.query('DELETE FROM access_sessions WHERE member_id=$1',[r.rows[0].id]);await c.query('DELETE FROM access_links WHERE member_id=$1',[r.rows[0].id]);await c.query('COMMIT');return r.rows[0]}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
 async allowAttempt(id:string,now:number){const r=await (await this.db()).query('INSERT INTO access_attempts(identity,window_start,attempts) VALUES($1,$2,1) ON CONFLICT(identity) DO UPDATE SET attempts=CASE WHEN access_attempts.window_start<$2-60000 THEN 1 ELSE access_attempts.attempts+1 END,window_start=CASE WHEN access_attempts.window_start<$2-60000 THEN $2 ELSE access_attempts.window_start END RETURNING attempts',[tokenHash(id),now]);return r.rows[0].attempts<=10}
}
export const accessStore=new PgAccessStore();
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
export async function issueSession(member:AccessMember,store:AccessStore=accessStore){const token=accessToken();const now=Date.now();await store.createSession(tokenHash(token),member.id,now,now+SESSION_MS);return token}
