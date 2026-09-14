/**
 * Device credentials (Phase C, S1). A paired Companion or graphics output holds a
 * credential of its own, so the device relationship outlives every human session:
 * "the short code expires, the established device relationship does not routinely
 * expire." Only a named revocation ends it.
 *
 * Shape (D2): `cd_<id:12 base64url>.<secret:43 base64url>`. Only sha256(secret) is
 * stored, lookup is by id (a primary key, never a scan) and the comparison is
 * timing-safe. The token is shown exactly once, at creation.
 *
 * Authority (D3, enforced in lib/access.ts): a companion credential satisfies `read`
 * and `control`; an output credential satisfies `read` only; neither ever satisfies
 * `author` or `owner`.
 *
 * Availability (D4): verification reads the same Postgres authoring also uses, so a
 * per-process cache of verified tokens keeps playback separate from authoring
 * availability. Positive entries only, ten minutes normally and up to sixty while the
 * store is throwing; an unknown token is never accepted from cache. The documented
 * consequence is that revocation takes effect within ten minutes (sixty during a store
 * outage) for ordinary API calls. A new live connection is the exception: a realtime
 * ticket verifies against the store directly (verifyDeviceTokenFresh), so a revoked
 * device is refused at its next reconnection, which is what /access promises. An
 * already-open socket is still never kicked.
 */

import {createHash,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {rehearsalMode} from './rehearsal';

export type DeviceKind='companion'|'output';
export type DeviceCredential={id:string;name:string;kind:DeviceKind;createdBy:string;createdAt:number;lastSeenAt:number|null;revokedAt:number|null};
/** A workspace already holding the maximum number of unredeemed pairing codes. */
export class DeviceLimitError extends Error{}

export const PAIRING_CODE_TTL_MS=10*60_000;
export const MAX_PAIRING_ATTEMPTS=5;
export const MAX_UNREDEEMED_CODES=10;
/** `last_seen_at` is written at most once a minute per credential (D4). */
export const LAST_SEEN_INTERVAL_MS=60_000;
export const VERIFIED_CACHE_MS=10*60_000;
export const VERIFIED_OUTAGE_MS=60*60_000;
const VERIFIED_CACHE_MAX=256;
export const MAX_DEVICE_NAME=80;
export const DEVICE_TOKEN_PREFIX='cd_';
export const DEVICE_TOKEN=/^cd_([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/;
export const PAIRING_CODE=/^[0-9]{6}$/;
export const PAIRING_LIMIT_MESSAGE='Ten pairing codes are already waiting. Use one, or wait for it to expire, before making another.';

export const isDeviceKind=(value:unknown):value is DeviceKind=>value==='companion'||value==='output';
export const secretDigest=(value:string)=>createHash('sha256').update(value).digest('hex');
/** The pairing code is never stored; the row is keyed by this digest. */
export const pairingCodeHash=(code:string)=>createHash('sha256').update(`pairing:${code}`).digest('hex');
/** Six digits from crypto.randomInt, zero-padded so 000123 is as likely as any other. */
export const newPairingCode=()=>String(randomInt(0,1_000_000)).padStart(6,'0');
export const newDeviceId=()=>randomBytes(9).toString('base64url');
export const newDeviceSecret=()=>randomBytes(32).toString('base64url');
export const deviceToken=(id:string,secret:string)=>`${DEVICE_TOKEN_PREFIX}${id}.${secret}`;
export function parseDeviceToken(value:string){const match=DEVICE_TOKEN.exec(value);return match?{id:match[1],secret:match[2]}:null}
export function digestEqual(actual:string,expected:string){const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
/** A device name is what an operator will read on /access; blank or oversized is refused. */
export function deviceName(value:unknown){const name=typeof value==='string'?value.trim():'';return name&&name.length<=MAX_DEVICE_NAME?name:null}
/** Legacy and device actors have no member row, so created_by is stored as NULL. */
const memberReference=(memberId:string)=>memberId&&!memberId.startsWith('legacy-')&&!memberId.startsWith('device:')?memberId:null;

export interface DeviceStore{
 createPairingCode(input:{codeHash:string;kind:DeviceKind;name:string;memberId:string;now:number;expiresAt:number}):Promise<void>;
 redeemPairingCode(codeHash:string,now:number):Promise<{token:string;credential:DeviceCredential}|null>;
 issue(input:{name:string;kind:DeviceKind;memberId:string;now:number}):Promise<{token:string;credential:DeviceCredential}>;
 verify(token:string,now:number):Promise<DeviceCredential|null>;
 list():Promise<DeviceCredential[]>;
 revoke(id:string,now:number):Promise<void>;
}

type CredentialRow={id:string;name:string;kind:string;created_by:string|null;created_at:string|number;last_seen_at:string|number|null;revoked_at:string|number|null};
const credentialView=(row:CredentialRow):DeviceCredential=>({id:String(row.id),name:String(row.name),kind:row.kind as DeviceKind,createdBy:row.created_by==null?'':String(row.created_by),createdAt:Number(row.created_at),lastSeenAt:row.last_seen_at==null?null:Number(row.last_seen_at),revokedAt:row.revoked_at==null?null:Number(row.revoked_at)});
const CREDENTIAL_COLUMNS='id,name,kind,created_by,created_at,last_seen_at,revoked_at';

export class PgDeviceStore implements DeviceStore{
 private async db(){return (await import('./database')).db}
 /** The ten-code cap and the insert share one transaction, so two administrators cannot both slip past it. */
 async createPairingCode(input:{codeHash:string;kind:DeviceKind;name:string;memberId:string;now:number;expiresAt:number}){
  const c=await (await this.db()).connect();
  try{
   await c.query('BEGIN');
   await c.query('LOCK TABLE device_pairing_codes IN EXCLUSIVE MODE');
   const open=Number((await c.query('SELECT count(*)::int AS count FROM device_pairing_codes WHERE redeemed_at IS NULL AND expires_at>$1',[input.now])).rows[0]?.count??0);
   if(open>=MAX_UNREDEEMED_CODES)throw new DeviceLimitError(PAIRING_LIMIT_MESSAGE);
   await c.query('INSERT INTO device_pairing_codes(code_hash,kind,name,created_by,created_at,expires_at,attempts) VALUES($1,$2,$3,$4,$5,$6,0) ON CONFLICT(code_hash) DO NOTHING',[input.codeHash,input.kind,input.name,memberReference(input.memberId),input.now,input.expiresAt]);
   await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
 }
 /** One atomic claim: a second caller in the same millisecond finds redeemed_at already set and gets nothing. */
 async redeemPairingCode(codeHash:string,now:number){
  const c=await (await this.db()).connect();
  try{
   await c.query('BEGIN');
   const id=newDeviceId(),secret=newDeviceSecret();
   const claimed=(await c.query('UPDATE device_pairing_codes SET attempts=attempts+1,redeemed_at=$2,credential_id=$3 WHERE code_hash=$1 AND redeemed_at IS NULL AND expires_at>$2 AND attempts<$4 RETURNING kind,name,created_by',[codeHash,now,id,MAX_PAIRING_ATTEMPTS])).rows[0] as {kind:string;name:string;created_by:string|null}|undefined;
   if(!claimed){
    // A present but spent, expired or exhausted code still burns an attempt.
    await c.query('UPDATE device_pairing_codes SET attempts=attempts+1 WHERE code_hash=$1',[codeHash]);
    await c.query('COMMIT');
    return null;
   }
   const row=(await c.query(`INSERT INTO device_credentials(id,name,kind,secret_hash,created_by,created_at,last_seen_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,NULL,NULL) RETURNING ${CREDENTIAL_COLUMNS}`,[id,claimed.name,claimed.kind,secretDigest(secret),claimed.created_by,now])).rows[0] as CredentialRow;
   await c.query('COMMIT');
   return {token:deviceToken(id,secret),credential:credentialView(row)};
  }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
 }
 async issue(input:{name:string;kind:DeviceKind;memberId:string;now:number}){
  const id=newDeviceId(),secret=newDeviceSecret();
  const row=(await (await this.db()).query(`INSERT INTO device_credentials(id,name,kind,secret_hash,created_by,created_at,last_seen_at,revoked_at) VALUES($1,$2,$3,$4,$5,$6,NULL,NULL) RETURNING ${CREDENTIAL_COLUMNS}`,[id,input.name,input.kind,secretDigest(secret),memberReference(input.memberId),input.now])).rows[0] as CredentialRow;
  return {token:deviceToken(id,secret),credential:credentialView(row)};
 }
 async verify(token:string,now:number){
  const parsed=parseDeviceToken(token);
  if(!parsed)return null;
  const db=await this.db();
  const row=(await db.query(`SELECT ${CREDENTIAL_COLUMNS},secret_hash FROM device_credentials WHERE id=$1`,[parsed.id])).rows[0] as (CredentialRow&{secret_hash:string})|undefined;
  if(!row||!digestEqual(secretDigest(parsed.secret),String(row.secret_hash))||row.revoked_at!=null)return null;
  const credential=credentialView(row);
  if(credential.lastSeenAt===null||credential.lastSeenAt<now-LAST_SEEN_INTERVAL_MS){
   await db.query('UPDATE device_credentials SET last_seen_at=$2 WHERE id=$1',[credential.id,now]);
   return {...credential,lastSeenAt:now};
  }
  return credential;
 }
 async list(){return ((await (await this.db()).query(`SELECT ${CREDENTIAL_COLUMNS} FROM device_credentials ORDER BY created_at DESC`)).rows as CredentialRow[]).map(credentialView)}
 async revoke(id:string,now:number){await (await this.db()).query('UPDATE device_credentials SET revoked_at=$2 WHERE id=$1 AND revoked_at IS NULL',[id,now])}
}

type MemoryCode={codeHash:string;kind:DeviceKind;name:string;createdBy:string|null;createdAt:number;expiresAt:number;attempts:number;redeemedAt:number|null;credentialId:string|null};
type MemoryCredential=DeviceCredential&{secretHash:string};

/**
 * The rehearsal device store. Every rule PgDeviceStore enforces is mirrored here -
 * the ten-code cap, single use, expiry, the five-attempt cap, timing-safe secret
 * comparison and the once-a-minute last-seen write - so rehearsal exercises the same
 * contract. Nothing here reads DATABASE_URL.
 */
export class MemoryDeviceStore implements DeviceStore{
 credentials=new Map<string,MemoryCredential>();
 codes=new Map<string,MemoryCode>();
 /** The secret digest never leaves the store, exactly as it never leaves the row. */
 private view(credential:MemoryCredential):DeviceCredential{return {id:credential.id,name:credential.name,kind:credential.kind,createdBy:credential.createdBy,createdAt:credential.createdAt,lastSeenAt:credential.lastSeenAt,revokedAt:credential.revokedAt}}
 async createPairingCode(input:{codeHash:string;kind:DeviceKind;name:string;memberId:string;now:number;expiresAt:number}){
  const open=[...this.codes.values()].filter(code=>code.redeemedAt===null&&code.expiresAt>input.now).length;
  if(open>=MAX_UNREDEEMED_CODES)throw new DeviceLimitError(PAIRING_LIMIT_MESSAGE);
  if(this.codes.has(input.codeHash))return;
  this.codes.set(input.codeHash,{codeHash:input.codeHash,kind:input.kind,name:input.name,createdBy:memberReference(input.memberId),createdAt:input.now,expiresAt:input.expiresAt,attempts:0,redeemedAt:null,credentialId:null});
 }
 /**
  * Single use without a transaction: the row is read and claimed in one synchronous
  * step before any await, which is the in-process equivalent of the atomic UPDATE.
  */
 async redeemPairingCode(codeHash:string,now:number){
  const code=this.codes.get(codeHash);
  if(!code)return null;
  code.attempts+=1;
  if(code.redeemedAt!==null||code.expiresAt<=now||code.attempts>MAX_PAIRING_ATTEMPTS)return null;
  const id=newDeviceId(),secret=newDeviceSecret();
  code.redeemedAt=now;code.credentialId=id;
  const credential:MemoryCredential={id,name:code.name,kind:code.kind,createdBy:code.createdBy??'',createdAt:now,lastSeenAt:null,revokedAt:null,secretHash:secretDigest(secret)};
  this.credentials.set(id,credential);
  return {token:deviceToken(id,secret),credential:this.view(credential)};
 }
 async issue(input:{name:string;kind:DeviceKind;memberId:string;now:number}){
  const id=newDeviceId(),secret=newDeviceSecret();
  const credential:MemoryCredential={id,name:input.name,kind:input.kind,createdBy:memberReference(input.memberId)??'',createdAt:input.now,lastSeenAt:null,revokedAt:null,secretHash:secretDigest(secret)};
  this.credentials.set(id,credential);
  return {token:deviceToken(id,secret),credential:this.view(credential)};
 }
 async verify(token:string,now:number){
  const parsed=parseDeviceToken(token);
  if(!parsed)return null;
  const credential=this.credentials.get(parsed.id);
  if(!credential||!digestEqual(secretDigest(parsed.secret),credential.secretHash)||credential.revokedAt!==null)return null;
  if(credential.lastSeenAt===null||credential.lastSeenAt<now-LAST_SEEN_INTERVAL_MS)credential.lastSeenAt=now;
  return this.view(credential);
 }
 async list(){return [...this.credentials.values()].sort((a,b)=>b.createdAt-a.createdAt).map(credential=>this.view(credential))}
 async revoke(id:string,now:number){const credential=this.credentials.get(id);if(credential&&credential.revokedAt===null)credential.revokedAt=now}
}

export const deviceStore:DeviceStore=rehearsalMode()?new MemoryDeviceStore():new PgDeviceStore();

/** D4: positive entries only, keyed by a digest of the whole token. */
const verifiedTokens=new Map<string,{credential:DeviceCredential;at:number}>();
/** Tests and rehearsal restarts; nothing in the request path calls this. */
export function clearVerifiedDeviceCache(){verifiedTokens.clear()}
function remember(key:string,credential:DeviceCredential,now:number){
 for(const [existing,entry] of verifiedTokens)if(now-entry.at>=VERIFIED_OUTAGE_MS)verifiedTokens.delete(existing);
 if(verifiedTokens.size>=VERIFIED_CACHE_MAX)verifiedTokens.delete(verifiedTokens.keys().next().value as string);
 verifiedTokens.set(key,{credential,at:now});
}

/**
 * Forget every cached entry for one credential. Called when a device is revoked so this
 * instance stops answering from its own cache. Belt and braces only: the cache is
 * per-process, so other serverless instances keep their own entries and this alone can
 * never make revocation instant. What actually makes the /access sentence true is the
 * fresh verification every realtime ticket performs (verifyDeviceTokenFresh).
 */
export function forgetDeviceCredential(id:string){
 for(const [key,entry] of verifiedTokens)if(entry.credential.id===id)verifiedTokens.delete(key);
}

/** The one place the store is consulted; the cache is only a fallback for an outage. */
async function verifyThroughStore(key:string,token:string,now:number,store:DeviceStore,cached:{credential:DeviceCredential;at:number}|undefined){
 let credential:DeviceCredential|null;
 try{credential=await store.verify(token,now)}
 catch(error){
  // D4's outage rule, and it applies to fresh verification too: when the store cannot
  // be reached we would otherwise drop every live device, so a cached entry still
  // answers for up to sixty minutes. A revoked device can therefore survive a store
  // outage; availability wins over promptness here, exactly as D4 decided.
  console.error('device_verify_unavailable',{name:error instanceof Error?error.name:'UnknownError'});
  return cached&&now-cached.at<VERIFIED_OUTAGE_MS?cached.credential:null;
 }
 if(credential)remember(key,credential,now);else verifiedTokens.delete(key);
 return credential;
}

/**
 * Verification as the ordinary request path uses it. A fresh cache entry answers without
 * touching the store; a store outage may extend a cached entry to sixty minutes; a
 * token that is not in the cache is only ever accepted by the store itself, so an
 * unknown or revoked-since-eviction token is refused while the store is down.
 */
export async function verifyDeviceToken(token:string,now=Date.now(),store:DeviceStore=deviceStore):Promise<DeviceCredential|null>{
 if(!parseDeviceToken(token))return null;
 const key=secretDigest(token),cached=verifiedTokens.get(key);
 if(cached&&now-cached.at<VERIFIED_CACHE_MS)return cached.credential;
 return verifyThroughStore(key,token,now,store,cached);
}

/**
 * Verification for a new connection. The positive cache is bypassed and the store has
 * the last word, so a revoked device is refused at its next reconnection rather than up
 * to ten minutes later - which is what /access promises. The cache entry is refreshed
 * from the result (or dropped), so the ordinary request path sees the same answer, and
 * an unreachable store still falls back to the cache under D4's outage rule.
 */
export async function verifyDeviceTokenFresh(token:string,now=Date.now(),store:DeviceStore=deviceStore):Promise<DeviceCredential|null>{
 if(!parseDeviceToken(token))return null;
 const key=secretDigest(token);
 return verifyThroughStore(key,token,now,store,verifiedTokens.get(key));
}
