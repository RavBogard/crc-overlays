/**
 * Google sign-in (I2/S1) — availability, redirect URI, memoized OIDC client and the pure
 * callback decision function.
 *
 * Google establishes identity only. Nothing here ever creates a member, changes a role or
 * changes `enabled`: congregation access keeps coming from the existing invitation,
 * membership and role system. The binding config contract is
 * `docs/planning/2026-09-13-product-review/GOOGLE-SIGNIN-CONFIG-2026-09-13.md`; the strings
 * below are copied from it and must not drift.
 */
import type {Configuration} from 'openid-client';
import {canonicalOrigin} from './oauth-core';
import type {AccessMember,GoogleIdentity,SignInFlow} from './access';
export type {GoogleIdentity,SignInFlow};

/** Fixed by the config record; the Google console holds the matching redirect URIs. */
export const GOOGLE_CALLBACK_PATH='/api/auth/google/callback';
/** The only origins whose callback URI is registered with Google. Previews are not. */
export const REGISTERED_ORIGINS=['https://crc-overlays.vercel.app','https://tbi-overlays.vercel.app','http://localhost:3000','http://localhost:5175'] as const;
/** The three basic scopes, nothing else, ever. */
export const GOOGLE_SCOPES='openid email profile';
export const GOOGLE_ISSUER='https://accounts.google.com';
/** Discovery is memoized per instance for an hour; a cold start pays it once. */
export const GOOGLE_CONFIG_TTL_MS=60*60_000;
const DISCOVERY_TIMEOUT_S=5;

/** Only the two Google variables are read; the index signature is what lets `process.env` pass. */
export type GoogleEnv={GOOGLE_OAUTH_CLIENT_ID?:string;GOOGLE_OAUTH_CLIENT_SECRET?:string;[name:string]:string|undefined};
export type GoogleUnavailableReason='unconfigured'|'preview'|'misconfigured';
export type GoogleAvailability={available:boolean;reason:null|GoogleUnavailableReason;redirectUri:string|null};

/** Identity provider or discovery is not answering, or the workspace is not configured. */
export class GoogleUnavailableError extends Error{}
/** The response did not match the flow we started (state, nonce, audience, expiry, signature). */
export class GoogleMismatchError extends Error{}

/**
 * Test seam, same monkeypatch precedent as `withStoreMethods` in `tests/access.test.ts`:
 * the fake-issuer suite swaps `fetch` and `issuer` so no test touches the network.
 */
export const googleDependencies:{fetch:typeof fetch;issuer:string;now:()=>number}={fetch:globalThis.fetch,issuer:GOOGLE_ISSUER,now:Date.now};

/**
 * The slice of `AccessStore` the Google decision path uses, declared structurally so a test
 * can hand in a small fake. `memberById` and `invitationTarget` are read-only: the `link`
 * rows compare the Google email against the signed-in member's own address, and the
 * `redeem` rows compare it against the invited address and need the invitation's member id
 * to report `already_linked` without consuming the single-use link.
 */
export interface GoogleIdentityStore {
 identityForMember(memberId:string):Promise<{email:string;linkedAt:number}|null>;
 memberForIdentity(identity:GoogleIdentity,now:number):Promise<(AccessMember&{enabled:boolean})|null>;
 linkIdentity(memberId:string,identity:GoogleIdentity,now:number):Promise<void>;
 unlinkIdentity(memberId:string,provider:'google'):Promise<void>;
 putSignInFlow(hash:string,payload:SignInFlow,expiresAt:number):Promise<void>;
 takeSignInFlow(hash:string,now:number):Promise<SignInFlow|null>;
 memberById(memberId:string):Promise<AccessMember|null>;
 invitationTarget(inviteHash:string,now:number):Promise<{memberId:string;email:string}|null>;
}

export type GoogleOutcome=
 |{code:'signed_in';member:AccessMember}
 |{code:'removed'}
 |{code:'no_access'}
 |{code:'linked';member:AccessMember}
 |{code:'already_linked'}
 |{code:'confirm';flow:SignInFlow}
 |{code:'invite_invalid'}
 |{code:'redeem';identity:GoogleIdentity;inviteHash:string}
 |{code:'cancelled'}
 |{code:'mismatch'}
 |{code:'unavailable'};
export type GoogleOutcomeCode=GoogleOutcome['code'];

/**
 * Host gating. `available` needs both credentials, a registered request origin, and that
 * origin to be this workspace's canonical origin — a registered host whose
 * `PUBLIC_BASE_URL` names the *other* workspace would otherwise send a code to a redirect
 * URI belonging to that other congregation.
 *
 * `redirectUri` is always built from `canonicalOrigin(request)`, never from the Host header
 * alone. Note `canonicalOrigin` reads `process.env.PUBLIC_BASE_URL` itself; `env` carries
 * only the two Google variables.
 */
export function googleSignInAvailability(request:Request,env:GoogleEnv=process.env):GoogleAvailability{
 let canonical:string|null=null;
 try{canonical=canonicalOrigin(request)}catch{canonical=null}
 const redirectUri=canonical?`${canonical}${GOOGLE_CALLBACK_PATH}`:null;
 if(!env.GOOGLE_OAUTH_CLIENT_ID||!env.GOOGLE_OAUTH_CLIENT_SECRET)return {available:false,reason:'unconfigured',redirectUri};
 const requestOrigin=new URL(request.url).origin;
 if(!(REGISTERED_ORIGINS as readonly string[]).includes(requestOrigin))return {available:false,reason:'preview',redirectUri};
 if(!canonical||requestOrigin!==canonical)return {available:false,reason:'misconfigured',redirectUri};
 return {available:true,reason:null,redirectUri};
}

let configurationCache:{key:string;at:number;config:Promise<Configuration>}|null=null;
/** Drops the memoized `Configuration`. Test seam and credential-rotation escape hatch. */
export function resetGoogleConfiguration(){configurationCache=null}

/**
 * The memoized `openid-client` `Configuration`. Discovery failure is `unavailable`, never a
 * 500, and a failed discovery is not cached.
 */
export function googleConfiguration(env:GoogleEnv=process.env):Promise<Configuration>{
 const clientId=env.GOOGLE_OAUTH_CLIENT_ID||'';const clientSecret=env.GOOGLE_OAUTH_CLIENT_SECRET||'';
 if(!clientId||!clientSecret)return Promise.reject(new GoogleUnavailableError('Google sign-in is not configured'));
 const key=`${googleDependencies.issuer}\n${clientId}`;const now=googleDependencies.now();
 if(configurationCache&&configurationCache.key===key&&now-configurationCache.at<GOOGLE_CONFIG_TTL_MS)return configurationCache.config;
 const pending=(async()=>{
  const {discovery,customFetch}=await import('openid-client');
  try{return await discovery(new URL(googleDependencies.issuer),clientId,clientSecret,undefined,{[customFetch]:googleDependencies.fetch,timeout:DISCOVERY_TIMEOUT_S})}
  catch(error){throw new GoogleUnavailableError('Google discovery failed',{cause:error})}
 })();
 configurationCache={key,at:now,config:pending};
 pending.catch(()=>{if(configurationCache?.config===pending)configurationCache=null});
 return pending;
}

export type GoogleFlowRequest={redirectUri:string;kind:SignInFlow['kind'];memberId?:string;inviteHash?:string};

/**
 * Builds the authorization URL and the flow row that must be stored alongside it. PKCE S256,
 * state and nonce come from the library. `prompt=select_account` always; `access_type=offline`
 * never — this app holds no Google tokens beyond the exchange.
 */
export async function beginGoogleFlow(config:Configuration,request:GoogleFlowRequest):Promise<{url:URL;flow:SignInFlow}>{
 const {randomPKCECodeVerifier,calculatePKCECodeChallenge,randomState,randomNonce,buildAuthorizationUrl}=await import('openid-client');
 const codeVerifier=randomPKCECodeVerifier();
 const codeChallenge=await calculatePKCECodeChallenge(codeVerifier);
 const state=randomState();const nonce=randomNonce();
 const url=buildAuthorizationUrl(config,{redirect_uri:request.redirectUri,scope:GOOGLE_SCOPES,state,nonce,code_challenge:codeChallenge,code_challenge_method:'S256',prompt:'select_account'});
 const flow:SignInFlow={kind:request.kind,createdAt:googleDependencies.now(),codeVerifier,state,nonce,redirectUri:request.redirectUri};
 if(request.memberId)flow.memberId=request.memberId;
 if(request.inviteHash)flow.inviteHash=request.inviteHash;
 return {url,flow};
}

function networkFailure(error:unknown){
 if(error instanceof TypeError)return true;
 if(typeof DOMException==='function'&&error instanceof DOMException&&error.name==='AbortError')return true;
 return error instanceof Error&&error.name==='AbortError';
}

/**
 * Exchanges the code and returns the verified identity. The library verifies `iss`, `aud`,
 * `exp`, `nonce` and the signature against the discovered JWKS; anything it rejects is a
 * `GoogleMismatchError`. Userinfo is never called and no token is kept.
 */
export async function completeGoogleCallback(config:Configuration,callbackUrl:URL,flow:SignInFlow):Promise<GoogleIdentity>{
 const {authorizationCodeGrant}=await import('openid-client');
 let claims;
 try{
  const tokens=await authorizationCodeGrant(config,callbackUrl,{pkceCodeVerifier:flow.codeVerifier,expectedState:flow.state,expectedNonce:flow.nonce,idTokenExpected:true});
  claims=tokens.claims();
 }catch(error){
  if(networkFailure(error))throw new GoogleUnavailableError('Google token exchange failed',{cause:error});
  throw new GoogleMismatchError('Google sign-in did not match this browser',{cause:error});
 }
 if(!claims)throw new GoogleMismatchError('Google returned no identity token');
 const email=typeof claims.email==='string'?claims.email.trim().toLowerCase():'';
 if(!email)throw new GoogleMismatchError('Google returned no email address');
 return {provider:'google',issuer:claims.iss,subject:claims.sub,email,emailVerified:claims.email_verified===true||claims.email_verified==='true'};
}

const sameEmail=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const hold=(flow:SignInFlow,identity:GoogleIdentity):SignInFlow=>({...flow,pending:{identity,status:'confirm'}});

/**
 * The PLAN.md callback decision table, row for row. Pure: the only write it performs is the
 * `linkIdentity` of a verified same-email link. `no_access`, `removed`, `already_linked`,
 * `invite_invalid` and `confirm` write nothing; `confirm` returns the flow to re-store so the
 * caller can mint a fresh cookie token for it. Redemption is returned, not performed, so the
 * session-issuing code stays in one place (`store.redeem(..., identity)` in the route).
 */
export async function resolveGoogleCallback(flow:SignInFlow,identity:GoogleIdentity,store:GoogleIdentityStore,now:number):Promise<GoogleOutcome>{
 if(flow.kind==='signin'){
  const existing=await store.memberForIdentity(identity,now);
  if(!existing)return {code:'no_access'};
  if(!existing.enabled)return {code:'removed'};
  return {code:'signed_in',member:existing};
 }
 if(flow.kind==='link'){
  if(!flow.memberId)return {code:'mismatch'};
  const member=await store.memberById(flow.memberId);
  if(!member)return {code:'mismatch'};
  if(!member.enabled)return {code:'removed'};
  const existing=await store.memberForIdentity(identity,now);
  if(existing)return existing.id===member.id?{code:'linked',member}:{code:'already_linked'};
  if(identity.emailVerified&&sameEmail(identity.email,member.email)){await store.linkIdentity(member.id,identity,now);return {code:'linked',member}}
  return {code:'confirm',flow:hold(flow,identity)};
 }
 if(flow.kind==='redeem'){
  const inviteHash=flow.inviteHash;
  if(!inviteHash)return {code:'mismatch'};
  const invitation=await store.invitationTarget(inviteHash,now);
  if(!invitation)return {code:'invite_invalid'};
  const existing=await store.memberForIdentity(identity,now);
  if(existing&&existing.id!==invitation.memberId)return {code:'already_linked'};
  if(existing||(identity.emailVerified&&sameEmail(identity.email,invitation.email)))return {code:'redeem',identity,inviteHash};
  return {code:'confirm',flow:hold(flow,identity)};
 }
 return {code:'mismatch'};
}

/**
 * Completes a flow held at `confirm`. The person has now seen both addresses, so the email
 * comparison is satisfied by their answer; everything else is the same as the table's rows.
 */
export async function confirmGoogleFlow(flow:SignInFlow,decision:'link'|'cancel',store:GoogleIdentityStore,now:number):Promise<GoogleOutcome>{
 const pending=flow.pending;
 if(!pending)return {code:'mismatch'};
 if(decision==='cancel')return {code:'cancelled'};
 const identity=pending.identity;
 if(flow.kind==='link'){
  if(!flow.memberId)return {code:'mismatch'};
  const member=await store.memberById(flow.memberId);
  if(!member)return {code:'mismatch'};
  if(!member.enabled)return {code:'removed'};
  const existing=await store.memberForIdentity(identity,now);
  if(existing)return existing.id===member.id?{code:'linked',member}:{code:'already_linked'};
  await store.linkIdentity(member.id,identity,now);
  return {code:'linked',member};
 }
 if(flow.kind==='redeem'){
  const inviteHash=flow.inviteHash;
  if(!inviteHash)return {code:'mismatch'};
  const invitation=await store.invitationTarget(inviteHash,now);
  if(!invitation)return {code:'invite_invalid'};
  const existing=await store.memberForIdentity(identity,now);
  if(existing&&existing.id!==invitation.memberId)return {code:'already_linked'};
  return {code:'redeem',identity,inviteHash};
 }
 return {code:'mismatch'};
}

/** Every Google outcome lands back on `/access`, which renders the copy for the code. */
export function googleReturnPath(code:GoogleOutcomeCode|GoogleUnavailableReason){return `/access?google=${code}`}
