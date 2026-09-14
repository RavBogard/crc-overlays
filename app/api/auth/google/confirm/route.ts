/**
 * The held-flow card. A Google sign-in whose email does not match (or is not verified) is
 * not refused and not silently bound: it waits here until the person has seen both addresses
 * and answered. GET describes the wait, POST ends it.
 */
import {AccessIdentityConflictError,accessStore,accessToken,currentMember,sameSiteWrite,sessionCookie,tokenHash} from '@/lib/access';
import {readLimitedBody} from '@/lib/oauth-core';
import {confirmGoogleFlow} from '@/lib/google-sign-in';

/** See the note in the start route: the flow cookie cannot be shared between route modules. */
const FLOW_COOKIE='crc_google_flow';
const FLOW_TTL_MS=10*60_000;
const flowCookie=(token:string,request:Request,clear=false)=>`${FLOW_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${clear?0:FLOW_TTL_MS/1000}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
const FLOW_TOKEN=/^[A-Za-z0-9_-]{43}$/;
/** Mirrors SESSION_MS in lib/access.ts, which is module-private; redeem needs the expiry. */
const SESSION_MS=30*24*60*60_000;
const NO_FLOW='No Google sign-in is waiting.';
const INVITE_GONE='This link has expired or was already used. Ask your administrator for a new link.';

const reply=(body:unknown,status=200,cookies:string[]=[])=>{
 const headers=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 for(const cookie of cookies)headers.append('Set-Cookie',cookie);
 return Response.json(body,{status,headers});
};

function cookieValue(request:Request){
 const match=request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${FLOW_COOKIE}=`));
 return match?.slice(FLOW_COOKIE.length+1)||'';
}

export async function GET(request:Request){
 try{
  const token=cookieValue(request);
  if(!FLOW_TOKEN.test(token))return reply({error:NO_FLOW},404);
  const hash=tokenHash(token),now=Date.now();
  // Read-only: rendering the card never touches the row or its expiry.
  const flow=await accessStore.peekSignInFlow(hash,now);
  if(!flow)return reply({error:NO_FLOW},404);
  const pending=flow.pending;
  if(!pending)return reply({error:NO_FLOW},404);
  const googleEmail=pending.identity.email;
  if(flow.kind==='link'){
   const member=flow.memberId?await accessStore.memberById(flow.memberId):null;
   if(!member)return reply({error:NO_FLOW},404);
   return reply({kind:'link',accountEmail:member.email,googleEmail});
  }
  if(flow.kind==='redeem'){
   const invitation=flow.inviteHash?await accessStore.invitationTarget(flow.inviteHash,now):null;
   if(!invitation)return reply({error:INVITE_GONE},410);
   return reply({kind:'redeem',invitedEmail:invitation.email,googleEmail});
  }
  return reply({error:NO_FLOW},404);
 }catch(error){
  console.error('google_confirm_error',{name:error instanceof Error?error.name:'UnknownError'});
  return reply({error:'Sign-in is temporarily unavailable. Existing graphics devices remain connected.'},503);
 }
}

export async function POST(request:Request){
 if(!sameSiteWrite(request))return reply({error:'Open this action from the same website.'},403);
 const cleared=[flowCookie('',request,true)];
 try{
  const input=JSON.parse(await readLimitedBody(request,8192));
  const decision=input&&typeof input==='object'&&!Array.isArray(input)?input.decision:null;
  if(decision!=='link'&&decision!=='cancel')return reply({error:'Invalid request'},400);
  const token=cookieValue(request);
  if(!FLOW_TOKEN.test(token))return reply({error:NO_FLOW},404,cleared);
  const now=Date.now();
  const flow=await accessStore.takeSignInFlow(tokenHash(token),now);
  if(!flow)return reply({error:NO_FLOW},404,cleared);

  // A link binds to the person signed in right now, not to whoever started the flow ten
  // minutes ago: signing out or being removed in between ends it.
  if(flow.kind==='link'&&(await currentMember(request))?.id!==flow.memberId)return reply({error:NO_FLOW},404,cleared);
  const outcome=await confirmGoogleFlow(flow,decision,accessStore,now);
  if(outcome.code==='redeem'){
   const session=accessToken();
   let member;
   try{member=await accessStore.redeem(outcome.inviteHash,now,tokenHash(session),now+SESSION_MS,outcome.identity)}
   catch(error){if(error instanceof AccessIdentityConflictError)return reply({google:'already_linked'},200,cleared);throw error}
   if(!member)return reply({google:'invite_invalid'},200,cleared);
   // The redemption session stays `invite`; `redeem` sets that itself.
   return reply({google:'signed_in'},200,[...cleared,sessionCookie(session,request)]);
  }
  return reply({google:outcome.code},200,cleared);
 }catch(error){
  if(error instanceof SyntaxError)return reply({error:'Invalid request'},400);
  if(error instanceof Error&&error.message==='request_too_large')return reply({error:'Request is too large'},413);
  console.error('google_confirm_error',{name:error instanceof Error?error.name:'UnknownError'});
  return reply({error:'Sign-in is temporarily unavailable. Existing graphics devices remain connected.'},503);
 }
}
