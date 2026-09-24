import {OAuthError,OAuthErrorCode,type AuthInfo,type OAuthTokenVerifier} from '@modelcontextprotocol/server';
import {accessStore,canAccess,type AccessRole} from './access';
import {db} from './database';
import {AUTHORING_SCOPE,AUTH_REQUEST_TTL_MS,CODE_TTL_MS,LIVE_SCOPE,OFFLINE_ACCESS_SCOPE,REFRESH_TOKEN_TTL_MS,RESOURCE_SCOPES,TOKEN_TTL_MS,hashOpaque,normalizeScope,opaque,pkceChallenge,validPkceVerifier} from './oauth-core';

type ClientRow={client_id_hash:string;redirect_uris:string[];client_name:string};
type AuthRequestRow={client_id_hash:string;redirect_uri:string;code_challenge:string;scope:string;resource:string;state:string|null};
type CodeRow=AuthRequestRow&{actor:string};

/**
 * Every MCP actor names the member who approved the connection: `mcp:<client>:member:<id>`.
 * A token minted before consent moved to workspace sign-in has no member and is refused, so
 * the shared authoring key cannot keep a connection alive.
 */
export function actorMemberId(actor:string){return /^mcp:[0-9a-f]{1,64}:member:(.+)$/.exec(actor)?.[1]??null}
async function approvingMember(actor:string){const id=actorMemberId(actor);if(!id)return null;const member=await accessStore.memberById(id);return member&&member.enabled?member:null}
/**
 * crc.live goes to exactly these roles (addendum §1). An explicit list, not canAccess(role,'control'):
 * that is permission-based and true for nearly everything, so a future role would inherit live control.
 */
export const LIVE_ROLES:readonly AccessRole[]=['owner','editor','operator'];
export function roleAllowsScope(role:AccessRole,scope:string){return scope===AUTHORING_SCOPE?canAccess(role,'author'):scope===LIVE_SCOPE?LIVE_ROLES.includes(role):scope===OFFLINE_ACCESS_SCOPE}
/**
 * What a grant is worth for this role now: the granted scopes the role still allows, canonical, or
 * null when no resource scope is left. Checked on every request and refresh, so a role change ends
 * the matching scope at the next one without touching the rest of the grant.
 */
export function effectiveScope(granted:string,role:AccessRole){const kept=normalizeScope(granted).split(' ').filter(scope=>roleAllowsScope(role,scope));return kept.some(scope=>(RESOURCE_SCOPES as readonly string[]).includes(scope))?kept.join(' '):null}
// The relay's controller id for this connection: stable across refreshes (one token family) and
// never the family hash itself, which stays in this database.
const liveController=(family:string)=>`mcp-${hashOpaque(`crc.live controller\0${family}`).slice(0,40)}`;

export async function rateLimit(bucket:string,identity:string,limit:number,windowMs:number){
 const key=hashOpaque(`${bucket}\0${identity}`),now=Date.now(),cutoff=now-windowMs;
 const result=await db.query(`INSERT INTO oauth_rate_limits(key_hash,window_start,count) VALUES($1,$2,1)
 ON CONFLICT(key_hash) DO UPDATE SET window_start=CASE WHEN oauth_rate_limits.window_start<$3 THEN $2 ELSE oauth_rate_limits.window_start END,
 count=CASE WHEN oauth_rate_limits.window_start<$3 THEN 1 ELSE oauth_rate_limits.count+1 END RETURNING count`,[key,now,cutoff]);
 return Number(result.rows[0].count)<=limit;
}
export async function registerClient(redirectUris:string[],clientName:string){const clientId=opaque('crc_client_');await db.query('INSERT INTO oauth_clients(client_id_hash,redirect_uris,client_name,created) VALUES($1,$2,$3,$4)',[hashOpaque(clientId),JSON.stringify(redirectUris),clientName,Date.now()]);return clientId}
export async function getClient(clientId:string){const result=await db.query<ClientRow>('SELECT client_id_hash,redirect_uris,client_name FROM oauth_clients WHERE client_id_hash=$1',[hashOpaque(clientId)]);return result.rows[0]??null}
export async function createAuthorizationRequest(input:{clientId:string;redirectUri:string;codeChallenge:string;scope:string;resource:string;state:string|null}){const id=opaque('crc_req_');await db.query('INSERT INTO oauth_authorization_requests(request_hash,client_id_hash,redirect_uri,code_challenge,scope,resource,state,expires) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[hashOpaque(id),hashOpaque(input.clientId),input.redirectUri,input.codeChallenge,input.scope,input.resource,input.state,Date.now()+AUTH_REQUEST_TTL_MS]);return id}
export async function peekAuthorizationRequest(id:string){const result=await db.query<AuthRequestRow&{client_name:string}>('SELECT r.client_id_hash,r.redirect_uri,r.code_challenge,r.scope,r.resource,r.state,c.client_name FROM oauth_authorization_requests r JOIN oauth_clients c ON c.client_id_hash=r.client_id_hash WHERE r.request_hash=$1 AND r.expires>$2',[hashOpaque(id),Date.now()]);return result.rows[0]??null}
export async function consumeAuthorizationRequest(id:string){const result=await db.query<AuthRequestRow>('DELETE FROM oauth_authorization_requests WHERE request_hash=$1 AND expires>$2 RETURNING client_id_hash,redirect_uri,code_challenge,scope,resource,state',[hashOpaque(id),Date.now()]);return result.rows[0]??null}
export async function issueAuthorizationCode(request:AuthRequestRow,actor:string){const code=opaque('crc_code_');await db.query('INSERT INTO oauth_codes(code_hash,client_id_hash,redirect_uri,code_challenge,scope,resource,actor,expires) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[hashOpaque(code),request.client_id_hash,request.redirect_uri,request.code_challenge,request.scope,request.resource,actor,Date.now()+CODE_TTL_MS]);return code}
export async function exchangeAuthorizationCode(input:{code:string;clientId:string;redirectUri:string;verifier:string;resource:string}){
 if(!validPkceVerifier(input.verifier))throw Error('invalid_grant');const client=await db.connect();
 try{await client.query('BEGIN');const result=await client.query<CodeRow>('SELECT client_id_hash,redirect_uri,code_challenge,scope,resource,actor FROM oauth_codes WHERE code_hash=$1 AND used_at IS NULL AND expires>$2 FOR UPDATE',[hashOpaque(input.code),Date.now()]);const row=result.rows[0];
  if(!row||row.client_id_hash!==hashOpaque(input.clientId)||row.redirect_uri!==input.redirectUri||row.resource!==input.resource||row.code_challenge!==pkceChallenge(input.verifier))throw Error('invalid_grant');
  await client.query('UPDATE oauth_codes SET used_at=$2 WHERE code_hash=$1',[hashOpaque(input.code),Date.now()]);const token=opaque('crc_at_'),refreshToken=opaque('crc_rt_'),expires=Date.now()+TOKEN_TTL_MS,refreshExpires=Date.now()+REFRESH_TOKEN_TTL_MS,familyHash=hashOpaque(opaque('crc_family_'));await client.query('INSERT INTO oauth_tokens(token_hash,family_hash,client_id_hash,scope,resource,actor,expires) VALUES($1,$2,$3,$4,$5,$6,$7)',[hashOpaque(token),familyHash,row.client_id_hash,row.scope,row.resource,row.actor,expires]);await client.query('INSERT INTO oauth_refresh_tokens(token_hash,family_hash,client_id_hash,scope,resource,actor,expires) VALUES($1,$2,$3,$4,$5,$6,$7)',[hashOpaque(refreshToken),familyHash,row.client_id_hash,row.scope,row.resource,row.actor,refreshExpires]);await client.query('COMMIT');return {token,refreshToken,expires,scope:row.scope};
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
export async function exchangeRefreshToken(input:{refreshToken:string;clientId:string;resource:string}){
 const client=await db.connect();const tokenHash=hashOpaque(input.refreshToken);let transactionOpen=false;try{await client.query('BEGIN');transactionOpen=true;const result=await client.query<{family_hash:string;client_id_hash:string;scope:string;resource:string;actor:string}>('SELECT family_hash,client_id_hash,scope,resource,actor FROM oauth_refresh_tokens WHERE token_hash=$1 AND expires>$2 FOR UPDATE',[tokenHash,Date.now()]);const row=result.rows[0];
  if(!row||row.client_id_hash!==hashOpaque(input.clientId)||row.resource!==input.resource)throw Error('invalid_grant');
  // The member who approved this connection must still be here, and their role must still allow at
  // least one granted scope. The rotated pair carries only what the role still allows.
  const member=await approvingMember(row.actor);let scope:string|null=null;try{scope=member&&effectiveScope(row.scope,member.role)}catch{scope=null}if(!scope)throw Error('invalid_grant');
  const used=await client.query<{used_at:number|null;revoked_at:number|null}>('SELECT used_at,revoked_at FROM oauth_refresh_tokens WHERE token_hash=$1',[tokenHash]);if(used.rows[0]?.used_at||used.rows[0]?.revoked_at){const revokedAt=Date.now();await client.query('UPDATE oauth_refresh_tokens SET revoked_at=$2 WHERE family_hash=$1 AND revoked_at IS NULL',[row.family_hash,revokedAt]);await client.query('UPDATE oauth_tokens SET revoked_at=$2 WHERE family_hash=$1 AND revoked_at IS NULL',[row.family_hash,revokedAt]);await client.query('COMMIT');transactionOpen=false;throw Error('invalid_grant')}
  await client.query('UPDATE oauth_refresh_tokens SET used_at=$2 WHERE token_hash=$1',[tokenHash,Date.now()]);const token=opaque('crc_at_'),refreshToken=opaque('crc_rt_'),expires=Date.now()+TOKEN_TTL_MS;await client.query('INSERT INTO oauth_tokens(token_hash,family_hash,client_id_hash,scope,resource,actor,expires) VALUES($1,$2,$3,$4,$5,$6,$7)',[hashOpaque(token),row.family_hash,row.client_id_hash,scope,row.resource,row.actor,expires]);await client.query('INSERT INTO oauth_refresh_tokens(token_hash,family_hash,client_id_hash,scope,resource,actor,expires) VALUES($1,$2,$3,$4,$5,$6,$7)',[hashOpaque(refreshToken),row.family_hash,row.client_id_hash,scope,row.resource,row.actor,Date.now()+REFRESH_TOKEN_TTL_MS]);await client.query('COMMIT');transactionOpen=false;return {token,refreshToken,expires,scope};
 }catch(error){if(transactionOpen)try{await client.query('ROLLBACK')}catch{}throw error}finally{client.release()}
}
export async function revokeToken(raw:string,clientId:string){const hashed=hashOpaque(raw),clientHash=hashOpaque(clientId),client=await db.connect();try{await client.query('BEGIN');const refresh=await client.query<{family_hash:string}>('SELECT family_hash FROM oauth_refresh_tokens WHERE token_hash=$1 AND client_id_hash=$2 FOR UPDATE',[hashed,clientHash]);if(refresh.rows[0]){const revokedAt=Date.now();await client.query('UPDATE oauth_refresh_tokens SET revoked_at=$2 WHERE family_hash=$1 AND revoked_at IS NULL',[refresh.rows[0].family_hash,revokedAt]);await client.query('UPDATE oauth_tokens SET revoked_at=$2 WHERE family_hash=$1 AND revoked_at IS NULL',[refresh.rows[0].family_hash,revokedAt])}else await client.query('UPDATE oauth_tokens SET revoked_at=$3 WHERE token_hash=$1 AND client_id_hash=$2',[hashed,clientHash,Date.now()]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
// A stored scope must already be canonical (every row ever written is), and the scopes reported are
// the ones the approving member's role allows at this request, not the ones granted at consent.
export const tokenVerifier:OAuthTokenVerifier={async verifyAccessToken(token:string){const result=await db.query<{client_id_hash:string;family_hash?:string;scope:string;resource:string;actor:string;expires:number}>('SELECT client_id_hash,family_hash,scope,resource,actor,expires FROM oauth_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires>$2',[hashOpaque(token),Date.now()]);const row=result.rows[0];let scope:string;try{scope=normalizeScope(row?.scope??null);if(!row||scope!==row.scope)throw Error('invalid_scope')}catch{throw new OAuthError(OAuthErrorCode.InvalidToken,'Invalid or expired token')}const member=await approvingMember(row.actor),effective=member&&effectiveScope(scope,member.role);if(!effective)throw new OAuthError(OAuthErrorCode.InvalidToken,'Invalid or expired token');return {token,clientId:row.client_id_hash,scopes:effective.split(' '),expiresAt:Math.floor(Number(row.expires)/1000),resource:new URL(row.resource),extra:{actor:row.actor,...(row.family_hash?{liveController:liveController(row.family_hash)}:{})}} satisfies AuthInfo}};
/**
 * One indirection for the HTTP layer, so the consent flow can be exercised without Postgres
 * (tests replace individual methods, the same way access tests replace `accessStore` methods).
 */
export const oauthStore={rateLimit,registerClient,getClient,createAuthorizationRequest,peekAuthorizationRequest,consumeAuthorizationRequest,issueAuthorizationCode,exchangeAuthorizationCode,exchangeRefreshToken,revokeToken};
