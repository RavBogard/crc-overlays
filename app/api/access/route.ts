import {accessStore,accessToken,authorizeRequest,cookieToken,currentMember,issueSession,sameSiteWrite,secretEqual,sessionCookie,tokenHash,type AccessRole} from '@/lib/access';
import {canonicalOrigin,readLimitedBody,requestIdentity} from '@/lib/oauth-core';
const reply=(body:unknown,status=200,cookie?:string)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
export async function GET(request:Request){try{const user=await currentMember(request);if(!user)return reply({user:null},401);if(new URL(request.url).searchParams.get('manage')==='1'){if(user.role!=='owner')return reply({error:'Administrator access required'},403);return reply({user,members:await accessStore.list()})}return reply({user})}catch{return reply({error:'Sign-in is temporarily unavailable. Existing graphics devices remain connected.'},503)}}
export async function POST(request:Request){
 if(!sameSiteWrite(request))return reply({error:'Open this action from the same website.'},403);
 try{
  const input=JSON.parse(await readLimitedBody(request,8192));
  if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request'},400);
  if(input.action==='logout'){const token=cookieToken(request);if(token)await accessStore.deleteSession(tokenHash(token));return reply({ok:true},200,sessionCookie('',request,true))}
  if(input.action==='redeem'){
   if(typeof input.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(input.token))return reply({error:'This sign-in link is invalid.'},400);
   if(!await accessStore.allowAttempt(requestIdentity(request),Date.now()))return reply({error:'Please wait a minute before trying again.'},429);
   const user=await accessStore.redeem(tokenHash(input.token),Date.now());if(!user)return reply({error:'This link has expired or was already used. Ask your administrator for a new link.'},401);
   return reply({user},200,sessionCookie(await issueSession(user),request));
  }
  if(input.action==='bootstrap'){
   if(!await accessStore.allowAttempt(requestIdentity(request),Date.now()))return reply({error:'Please wait a minute before trying again.'},429);
   if(typeof input.key!=='string'||!secretEqual(input.key,(process.env.ACCESS_BOOTSTRAP_KEY||process.env.CONTROL_KEY)))return reply({error:'Administrator access was not recognized.'},401);
   // The existing administrator credential establishes the first named account.
   const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
   const name=typeof input.name==='string'?input.name.trim():'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200||!name||name.length>80)return reply({error:'Enter your name and email address.'},400);
   const user=await accessStore.bootstrap(email,name);if(!user)return reply({error:'An administrator account already exists. Ask that administrator for an invitation.'},409);
   return reply({user},200,sessionCookie(await issueSession(user),request));
  }
  const user=await authorizeRequest(request,'owner');if(!user)return reply({error:'Administrator access required'},401);
  if(input.action==='invite'){
   const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';const name=typeof input.name==='string'?input.name.trim():'';const role=input.role as AccessRole;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200||!name||name.length>80||!['owner','editor','operator'].includes(role))return reply({error:'Enter a name, email address, and valid role.'},400);
   if(email===user.email&&role!=='owner')return reply({error:'Keep your own administrator role.'},400);
   const token=accessToken();const member=await accessStore.invite(email,name,role,tokenHash(token),Date.now()+24*60*60_000);
   return reply({member,url:`${canonicalOrigin(request)}/access#invite=${token}`,expiresInHours:24},201);
  }
  if(input.action==='disable'){
   if(typeof input.memberId!=='string'||input.memberId===user.id)return reply({error:'Choose a different member.'},400);
   await accessStore.disable(input.memberId);return reply({ok:true});
  }
  return reply({error:'Unknown action'},400);
 }catch(error){if(error instanceof SyntaxError)return reply({error:'Invalid request'},400);return reply({error:'Sign-in is temporarily unavailable. Existing graphics devices remain connected.'},503)}
}
