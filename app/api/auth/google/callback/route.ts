/**
 * The fixed Google redirect URI (`GOOGLE_CALLBACK_PATH`). Every outcome is a 303 back to
 * `/access?google=<code>`, which resolves the session by a same-site fetch - the landing
 * document itself never reads the session, because a `SameSite=Strict` cookie is not sent
 * with a navigation that arrives from Google.
 */
import {AccessIdentityConflictError,accessStore,accessToken,issueSession,sessionCookie,tokenHash} from '@/lib/access';
import {canonicalOrigin} from '@/lib/oauth-core';
import {GOOGLE_CALLBACK_PATH,GoogleMismatchError,completeGoogleCallback,googleConfiguration,googleReturnPath,resolveGoogleCallback} from '@/lib/google-sign-in';

/** See the note in the start route: the flow cookie cannot be shared between route modules. */
const FLOW_COOKIE='crc_google_flow';
const FLOW_TTL_MS=10*60_000;
const flowCookie=(token:string,request:Request,clear=false)=>`${FLOW_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${clear?0:FLOW_TTL_MS/1000}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
const FLOW_TOKEN=/^[A-Za-z0-9_-]{43}$/;
/** Mirrors SESSION_MS in lib/access.ts, which is module-private; redeem needs the expiry. */
const SESSION_MS=30*24*60*60_000;

function redirect(location:string,cookies:string[]){
 const headers=new Headers({Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 for(const cookie of cookies)headers.append('Set-Cookie',cookie);
 return new Response(null,{status:303,headers});
}

function cookieValue(request:Request){
 const match=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${FLOW_COOKIE}=`));
 return match?.slice(FLOW_COOKIE.length+1)||'';
}

export async function GET(request:Request){
 const cleared=[flowCookie('',request,true)];
 try{
  const url=new URL(request.url);
  const token=cookieValue(request);
  if(!FLOW_TOKEN.test(token))return redirect(googleReturnPath('mismatch'),cleared);
  const now=Date.now();
  // Delete-returning: a replayed callback finds nothing and is a mismatch, not a second sign-in.
  const flow=await accessStore.takeSignInFlow(tokenHash(token),now);
  if(!flow)return redirect(googleReturnPath('mismatch'),cleared);
  // "Cancel" at Google: the flow row is already gone and nothing else is written.
  if(url.searchParams.get('error'))return redirect(googleReturnPath('cancelled'),cleared);

  const config=await googleConfiguration();
  // Built from the canonical origin, never from `request.url`: openid-client derives the
  // redirect_uri it sends to the token endpoint from this URL.
  const callbackUrl=new URL(`${canonicalOrigin(request)}${GOOGLE_CALLBACK_PATH}${url.search}`);
  let identity;
  try{identity=await completeGoogleCallback(config,callbackUrl,flow)}
  catch(error){return redirect(googleReturnPath(error instanceof GoogleMismatchError?'mismatch':'unavailable'),cleared)}

  const outcome=await resolveGoogleCallback(flow,identity,accessStore,now);
  if(outcome.code==='signed_in'){
   const session=await issueSession(outcome.member,accessStore,'google');
   return redirect(googleReturnPath('signed_in'),[...cleared,sessionCookie(session,request)]);
  }
  if(outcome.code==='redeem'){
   const session=accessToken();
   let member;
   // The redemption and the identity bind are one transaction; a conflict leaves the
   // single-use invitation unused.
   try{member=await accessStore.redeem(outcome.inviteHash,now,tokenHash(session),now+SESSION_MS,outcome.identity)}
   catch(error){if(error instanceof AccessIdentityConflictError)return redirect(googleReturnPath('already_linked'),cleared);throw error}
   if(!member)return redirect(googleReturnPath('invite_invalid'),cleared);
   // The session stays `invite`: the invitation, not Google, is what granted the access.
   return redirect(googleReturnPath('signed_in'),[...cleared,sessionCookie(session,request)]);
  }
  if(outcome.code==='confirm'){
   // Held for the confirmation card: a fresh token, so the spent one cannot be replayed.
   const fresh=accessToken();
   await accessStore.putSignInFlow(tokenHash(fresh),outcome.flow,now+FLOW_TTL_MS);
   return redirect(googleReturnPath('confirm'),[flowCookie(fresh,request)]);
  }
  return redirect(googleReturnPath(outcome.code),cleared);
 }catch(error){
  console.error('google_callback_error',{name:error instanceof Error?error.name:'UnknownError'});
  return redirect(googleReturnPath('unavailable'),cleared);
 }
}
