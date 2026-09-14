/**
 * Begins a Google sign-in. This is the target of a plain HTML form post from `/access`, so
 * every outcome a person can reach is a 303 back to `/access?google=<code>`; only a
 * cross-site or rate-limited post, which the UI never makes, answers with JSON.
 *
 * Google establishes identity only. Nothing here creates a member, changes a role or changes
 * `enabled` - the flow row this route stores is the whole of its side effects.
 */
import {accessRequestIdentity,accessStore,accessToken,currentMember,sameSiteWrite,tokenHash,validPassword,verifyPassword} from '@/lib/access';
import {readLimitedBody} from '@/lib/oauth-core';
import {beginGoogleFlow,googleConfiguration,googleReturnPath,googleSignInAvailability} from '@/lib/google-sign-in';

/**
 * The flow cookie. `SameSite=Lax`, not `Strict` like `crc_access`: the callback arrives as a
 * cross-site top-level navigation from Google and a Strict cookie would not be sent. Scoped
 * to `/api/auth/google` so it never travels with an ordinary page request. The same three
 * lines appear in the callback and confirm routes; Next.js route modules may not export
 * anything but their handlers, so the constant cannot be shared from one of them.
 */
const FLOW_COOKIE='crc_google_flow';
const FLOW_TTL_MS=10*60_000;
const flowCookie=(token:string,request:Request)=>`${FLOW_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${FLOW_TTL_MS/1000}${new URL(request.url).protocol==='https:'?'; Secure':''}`;

const INVITE_TOKEN=/^[A-Za-z0-9_-]{43}$/;
const json=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
function redirect(location:string,cookie?:string){
 const headers=new Headers({Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 if(cookie)headers.append('Set-Cookie',cookie);
 return new Response(null,{status:303,headers});
}

export async function POST(request:Request){
 if(!sameSiteWrite(request))return json({error:'Open this action from the same website.'},403);
 try{
  const now=Date.now();
  // The same bucket as the password routes: never a header the caller can set itself.
  if(!await accessStore.allowAttempt(`google:ip:${accessRequestIdentity(request)}`,now))return json({error:'Please wait a minute before trying again.'},429);
  const availability=googleSignInAvailability(request);
  // `preview` and `misconfigured` are told apart on `/access` by GET /api/access, not here.
  if(!availability.available||!availability.redirectUri)return redirect(googleReturnPath('unavailable'));
  const form=new URLSearchParams(await readLimitedBody(request,8192));
  const intent=form.get('intent');
  if(intent!=='signin'&&intent!=='link'&&intent!=='redeem')return redirect(googleReturnPath('mismatch'));

  let memberId:string|undefined;
  let inviteHash:string|undefined;
  if(intent==='link'){
   const member=await currentMember(request);
   if(!member)return redirect(googleReturnPath('mismatch'));
   // A member already holding a Google link unlinks first; the page never offers this form
   // to a linked member, so a direct post simply lands back on the account page as it is.
   if(await accessStore.identityForMember(member.id))return redirect('/access');
   // D1: linking from a signed-in session requires the current password when one exists, so
   // a borrowed browser cannot quietly attach a second way in.
   const credential=await accessStore.credentialForEmail(member.email);
   if(credential?.passwordHash){
    const supplied=form.get('currentPassword')??'';
    if(!validPassword(supplied)||!await verifyPassword(supplied,credential.passwordHash))return redirect('/access?google=password');
   }
   memberId=member.id;
  }
  if(intent==='redeem'){
   const token=form.get('token')??'';
   // Shape only: whether the invitation is live is the callback's `invitationTarget` check.
   if(!INVITE_TOKEN.test(token))return redirect(googleReturnPath('invite_invalid'));
   inviteHash=tokenHash(token);
  }

  const config=await googleConfiguration();
  const {url,flow}=await beginGoogleFlow(config,{redirectUri:availability.redirectUri,kind:intent,memberId,inviteHash});
  const token=accessToken();
  await accessStore.putSignInFlow(tokenHash(token),flow,now+FLOW_TTL_MS);
  return redirect(url.href,flowCookie(token,request));
 }catch(error){
  // Discovery, the identity provider or the store: never a 500 on a sign-in page.
  console.error('google_start_error',{name:error instanceof Error?error.name:'UnknownError'});
  return redirect(googleReturnPath('unavailable'));
 }
}
