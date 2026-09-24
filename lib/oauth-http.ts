import {canAccess,currentMember,type AccessMember,type AccessRole} from './access';
import {AUTHORIZATION_SCOPES,AUTHORING_SCOPE,LIVE_SCOPE,RESOURCE_SCOPES,appendOAuthRedirect,canonicalOrigin,exactResource,mcpResource,normalizeRedirect,normalizeScope,readLimitedBody,requestIdentity,safeClientMetadata,sameOrigin,securityHeaders} from './oauth-core';
import {oauthStore,roleAllowsScope} from './oauth-store';
import {getPublicWorkspace} from './workspace';

const jsonHeaders={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'};
const standardErrors=new Set(['invalid_request','invalid_client','invalid_grant','unauthorized_client','unsupported_grant_type','invalid_scope','invalid_target','unsupported_response_type','access_denied','server_error','temporarily_unavailable','slow_down','invalid_client_metadata','invalid_redirect_uri']);
// Consent names the congregation it connects to: on TBI it said "Connect CRC authoring".
const congregation=()=>{try{return getPublicWorkspace().shortName}catch{return 'overlays'}};
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function oauthJson(body:unknown,status=200){return Response.json(body,{status,headers:jsonHeaders})}
export function oauthError(error:string,status=400){const safe=standardErrors.has(error)?error:'server_error';return oauthJson({error:safe},safe==='server_error'&&status<500?500:status)}
function oauthFailure(error:unknown,syntaxFallback='invalid_request'){if(error instanceof Error&&error.message==='request_too_large')return oauthError('invalid_request',413);if(error instanceof SyntaxError)return oauthError(syntaxFallback);return oauthError(error instanceof Error?error.message:'server_error')}
export function authorizationMetadata(request:Request){const origin=canonicalOrigin(request);return {issuer:origin,authorization_endpoint:`${origin}/oauth/authorize`,token_endpoint:`${origin}/oauth/token`,revocation_endpoint:`${origin}/oauth/revoke`,registration_endpoint:`${origin}/oauth/register`,scopes_supported:[...AUTHORIZATION_SCOPES],response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']}}
export function protectedResourceMetadata(request:Request){return {resource:mcpResource(request),authorization_servers:[canonicalOrigin(request)],scopes_supported:[...RESOURCE_SCOPES],bearer_methods_supported:['header']}}
export async function register(request:Request){try{if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return oauthError('invalid_client_metadata');if(!await oauthStore.rateLimit('register',requestIdentity(request),20,10*60_000))return oauthError('slow_down',429);const body=JSON.parse(await readLimitedBody(request));const metadata=safeClientMetadata(body);const clientId=await oauthStore.registerClient(metadata.redirectUris,metadata.clientName);return oauthJson({client_id:clientId,client_id_issued_at:Math.floor(Date.now()/1000),client_name:metadata.clientName,redirect_uris:metadata.redirectUris,grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},201)}catch(error){return oauthFailure(error,'invalid_client_metadata')}}
/**
 * The pending-request cookie. `SameSite=Lax`, not `Strict` like `crc_access`: the person
 * leaves for `/access` and comes back by a top-level navigation. Scoped to the consent path,
 * and holding only the opaque handle that is already in the form - it is not a bearer, and
 * approving still needs a workspace session with an authoring role.
 */
const REQUEST_COOKIE='crc_oauth_request';
const REQUEST_COOKIE_TTL_MS=10*60_000;
const REQUEST_HANDLE=/^crc_req_[A-Za-z0-9_-]{43}$/;
const ACCESS_RETURN='/access?next=%2Foauth%2Fauthorize';
const NOT_AN_AUTHOR='Your role here can’t author graphics. Ask an administrator for Editor access.';
const LIVE_ONLY_ROLE='Your role here can’t author graphics, so this connection can have live control only. Tick Live control to allow it, or Deny.';
const NOTHING_CHOSEN='Nothing was chosen to allow. Tick Live control to connect, or Deny.';
const SIGN_IN_INCOMPLETE='Sign-in didn’t complete. Start the connection again from your MCP client.';
const requestCookie=(handle:string,request:Request,clear=false)=>`${REQUEST_COOKIE}=${handle}; HttpOnly; SameSite=Lax; Path=/oauth/authorize; Max-Age=${clear?0:REQUEST_COOKIE_TTL_MS/1000}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
function pendingHandle(request:Request){const match=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${REQUEST_COOKIE}=`));const value=match?.slice(REQUEST_COOKIE.length+1)||'';return REQUEST_HANDLE.test(value)?value:''}
function redirectTo(location:string,cookie?:string){const headers=new Headers({Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});if(cookie)headers.append('Set-Cookie',cookie);return new Response(null,{status:303,headers})}
// Two header choices a real browser depends on, which scripts/check-mcp.py asserts because a scripted
// client never notices them: `Referrer-Policy: same-origin`, not the default `no-referrer`, because a
// page served with no-referrer posts its own form with `Origin: null`, which sameOrigin() refuses; and
// `form-action` naming the verified return destination, because Chrome enforces form-action across the
// redirect chain of a form post and would otherwise block the 303 that carries the code (or the denial)
// after the one-time request was already consumed. The 303s themselves keep `no-referrer`.
function page(inner:string,status:number,cookie?:string,formAction?:string){const headers=securityHeaders({'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'same-origin'},formAction);if(cookie)headers.append('Set-Cookie',cookie);return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect ${escape(congregation())} authoring</title><style>body{font:16px system-ui;max-width:36rem;margin:4rem auto;padding:1.5rem;background:#081b35;color:#fff}main{background:#102b4d;padding:2rem;border-radius:1rem}code{overflow-wrap:anywhere}button{padding:.7rem 1rem;margin-right:.5rem}.error{color:#ffd67c}</style></head><body><main>${inner}</main></body></html>`,{status,headers})}
// Live control is its own line, off until the person ticks it, and only for a request that asked for
// it and a role on the explicit live list. Before sign-in the role is unknown; the post re-checks it.
const LIVE_FIELD='allow_live';
const offersLive=(scope:string,member:AccessMember|null)=>scope.split(' ').includes(LIVE_SCOPE)&&(!member||roleAllowsScope(member.role,LIVE_SCOPE));
function consentPage(requestHandle:string,clientName:string,redirectUri:string,member:AccessMember|null,scope:string,message='',status=200,cookie?:string){const destination=new URL(redirectUri);const who=member?`<p>Approving as <strong>${escape(member.name)}</strong> (${escape(member.email)}).</p>`:'<p>Approve to connect as the member you’re signed in to this workspace as. If you’re not signed in yet, you’ll sign in first and come back here.</p>';const authoring=scope.split(' ').includes(AUTHORING_SCOPE)?`<p>This grants access to ${escape(congregation())} source search and draft authoring. Publishing still requires an exact preview reviewed in the ${escape(congregation())} web UI.</p>`:'';const live=offersLive(scope,member)?`<p><label><input type="checkbox" name="${LIVE_FIELD}" value="${LIVE_SCOPE}"> Live control: also let this connection show, take out and clear graphics on the ${escape(congregation())} output, as the console does.</label></p>`:'';return page(`<h1>Connect ${escape(clientName)}</h1><p>Verified return destination: <code>${escape(destination.origin+destination.pathname)}</code></p>${authoring}${who}${message?`<p class="error">${escape(message)}</p>`:''}<form method="post"><input type="hidden" name="request" value="${escape(requestHandle)}">${live}<button name="decision" value="approve">Approve</button><button name="decision" value="deny" formnovalidate>Deny</button></form>`,status,cookie,`'self' ${destination.origin}`)}
/**
 * The grant: requested ∩ consented ∩ what the role allows. offline_access rides along only with a
 * resource scope. Null when nothing that reaches the MCP resource is left.
 */
export function consentedScope(requested:string,role:AccessRole,liveTicked:boolean){const granted=normalizeScope(requested).split(' ').filter(scope=>scope===LIVE_SCOPE?liveTicked&&roleAllowsScope(role,scope):roleAllowsScope(role,scope));return granted.some(scope=>(RESOURCE_SCOPES as readonly string[]).includes(scope))?granted.join(' '):null}
/** A resume with nothing pending: there is no client and no verified destination to show. */
function noticePage(message:string,status:number,cookie?:string){return page(`<h1>Connect ${escape(congregation())} authoring</h1><p class="error">${escape(message)}</p>`,status,cookie)}
export async function authorizeGet(request:Request){const url=new URL(request.url);let verifiedRedirect:string|undefined;try{if(!await oauthStore.rateLimit('authorize_get',requestIdentity(request),60,10*60_000))return oauthError('slow_down',429);if(url.search.length>8192)throw Error('invalid_request');const clientId=url.searchParams.get('client_id')||'';
 // Coming back from `/access`: the request is already stored and this navigation is same-site,
 // so the Strict session cookie is here and the member can be named on the page.
 const resumed=clientId?'':pendingHandle(request);
 if(resumed){const pending=await oauthStore.peekAuthorizationRequest(resumed),cleared=requestCookie('',request,true);return pending?consentPage(resumed,pending.client_name,pending.redirect_uri,await currentMember(request),pending.scope,'',200,cleared):noticePage(SIGN_IN_INCOMPLETE,400,cleared)}
 const client=await oauthStore.getClient(clientId),redirect=normalizeRedirect(url.searchParams.get('redirect_uri'));if(!client||!client.redirect_uris.includes(redirect))throw Error('invalid_client');verifiedRedirect=redirect;if(url.searchParams.get('response_type')!=='code')throw Error('unsupported_response_type');const challenge=url.searchParams.get('code_challenge')||'';if(url.searchParams.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge))throw Error('invalid_request');const scope=normalizeScope(url.searchParams.get('scope')),resource=exactResource(url.searchParams.get('resource'),request),state=url.searchParams.get('state');if(state&&state.length>1024)throw Error('invalid_request');const handle=await oauthStore.createAuthorizationRequest({clientId,redirectUri:redirect,codeChallenge:challenge,scope,resource,state});return consentPage(handle,client.client_name,redirect,await currentMember(request),scope,'',200,pendingHandle(request)?requestCookie('',request,true):undefined)}catch(error){const known=error instanceof Error?error.message:'server_error',safe=standardErrors.has(known)?known:'server_error',state=url.searchParams.get('state');if(verifiedRedirect)return Response.redirect(appendOAuthRedirect(verifiedRedirect,{error:safe,state:state&&state.length<=1024?state:undefined}),303);return oauthError(safe)}}
export async function authorizePost(request:Request){try{if(!sameOrigin(request)||!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))return oauthError('invalid_request',403);if(!await oauthStore.rateLimit('authorize',requestIdentity(request),20,10*60_000))return oauthError('slow_down',429);const form=new URLSearchParams(await readLimitedBody(request)),handle=form.get('request')||'';if(!REQUEST_HANDLE.test(handle))return oauthError('invalid_request');
 // A request parked for sign-in belongs to this browser: a form naming a different one is not acted on.
 const parked=pendingHandle(request);if(parked&&parked!==handle)return noticePage(SIGN_IN_INCOMPLETE,400,requestCookie('',request,true));
 const pending=await oauthStore.peekAuthorizationRequest(handle);if(!pending)return oauthError('invalid_request');if(form.get('decision')==='deny'){const consumed=await oauthStore.consumeAuthorizationRequest(handle);return redirectTo(appendOAuthRedirect(consumed!.redirect_uri,{error:'access_denied',state:consumed!.state??undefined}),requestCookie('',request,true))}
 // Who is approving is the workspace session, never a shared key. An arrival straight from the
 // MCP client carries no Strict cookie, so the request is parked and sign-in comes first.
 const member=await currentMember(request);
 if(!member)return redirectTo(ACCESS_RETURN,requestCookie(handle,request));
 const requested=pending.scope.split(' '),scope=consentedScope(pending.scope,member.role,form.get(LIVE_FIELD)===LIVE_SCOPE);
 if(!scope){
  const canAuthor=canAccess(member.role,'author'),canLive=offersLive(pending.scope,member);
  // An authoring request from a role that can't author, with no live line to fall back on, keeps today's refusal.
  if(requested.includes(AUTHORING_SCOPE)&&!canAuthor&&!canLive)return consentPage(handle,pending.client_name,pending.redirect_uri,member,pending.scope,NOT_AN_AUTHOR,403);
  const roleLimited=requested.includes(AUTHORING_SCOPE)&&!canAuthor;
  return consentPage(handle,pending.client_name,pending.redirect_uri,member,pending.scope,roleLimited?LIVE_ONLY_ROLE:NOTHING_CHOSEN,roleLimited?403:400);
 }
 const consumed=await oauthStore.consumeAuthorizationRequest(handle);if(!consumed)return oauthError('invalid_request');
 const code=await oauthStore.issueAuthorizationCode({...consumed,scope},`mcp:${consumed.client_id_hash.slice(0,16)}:member:${member.id}`);
 return redirectTo(appendOAuthRedirect(consumed.redirect_uri,{code,state:consumed.state??undefined}),requestCookie('',request,true))}catch(error){return oauthFailure(error)}}
export async function token(request:Request){try{if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))return oauthError('invalid_request');if(!await oauthStore.rateLimit('token',requestIdentity(request),60,10*60_000))return oauthError('slow_down',429);const form=new URLSearchParams(await readLimitedBody(request)),grant=form.get('grant_type'),clientId=form.get('client_id')||'',resource=exactResource(form.get('resource'),request);let issued;if(grant==='authorization_code')issued=await oauthStore.exchangeAuthorizationCode({code:form.get('code')||'',clientId,redirectUri:normalizeRedirect(form.get('redirect_uri')),verifier:form.get('code_verifier')||'',resource});else if(grant==='refresh_token')issued=await oauthStore.exchangeRefreshToken({refreshToken:form.get('refresh_token')||'',clientId,resource});else return oauthError('unsupported_grant_type');return oauthJson({access_token:issued.token,token_type:'Bearer',expires_in:Math.floor((issued.expires-Date.now())/1000),refresh_token:issued.refreshToken,scope:issued.scope})}catch(error){return oauthFailure(error)}}
export async function revoke(request:Request){try{if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))return oauthError('invalid_request');if(!await oauthStore.rateLimit('revoke',requestIdentity(request),60,10*60_000))return oauthError('slow_down',429);const form=new URLSearchParams(await readLimitedBody(request)),clientId=form.get('client_id'),raw=form.get('token');if(!clientId||!raw)return oauthError('invalid_request');await oauthStore.revokeToken(raw,clientId);return new Response(null,{status:200,headers:jsonHeaders})}catch(error){return oauthFailure(error)}}
