import {AccessInvariantError,accessStore,accessToken,authorizeRequest,bootstrapWithPassword,cookieToken,currentMember,hashPassword,issueSession,redeemSession,replacePasswordSession,sameSiteWrite,secretEqual,sessionCookie,tokenHash,validPassword,verifyPassword,type AccessMember,type AccessRole} from '@/lib/access';
import {canonicalOrigin,readLimitedBody} from '@/lib/oauth-core';
const reply=(body:unknown,status=200,cookie?:string)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
const publicMember=({id,email,name,role,enabled}:AccessMember):AccessMember=>({id,email,name,role,enabled});
const profile=async(user:AccessMember)=>({...publicMember(user),hasPassword:Boolean((await accessStore.credentialForEmail(user.email))?.passwordHash)});
const emailValue=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():'';
const emailValid=(email:string)=>email.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
function accessRequestIdentity(request:Request){return process.env.VERCEL==='1'?(request.headers.get('x-vercel-forwarded-for')||'unknown').trim().slice(0,128):'local'}
async function loginAllowed(request:Request,email:string){const now=Date.now();if(!await accessStore.allowAttempt(`login:ip:${accessRequestIdentity(request)}`,now))return false;return accessStore.allowAttempt(`login:account:${email}`,now)}
export async function GET(request:Request){try{const user=await currentMember(request);if(!user)return reply({user:null},401);if(new URL(request.url).searchParams.get('manage')==='1'){if(user.role!=='owner')return reply({error:'Administrator access required'},403);return reply({user:await profile(user),members:await accessStore.list()})}return reply({user:await profile(user)})}catch{return reply({error:'Sign-in is temporarily unavailable. Existing graphics devices remain connected.'},503)}}
export async function POST(request:Request){
 if(!sameSiteWrite(request))return reply({error:'Open this action from the same website.'},403);
 try{
  const input=JSON.parse(await readLimitedBody(request,8192));
  if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request'},400);
  if(input.action==='logout'){const token=cookieToken(request);if(token)await accessStore.deleteSession(tokenHash(token));return reply({ok:true},200,sessionCookie('',request,true))}
  if(input.action==='login'){
   const email=emailValue(input.email),password=input.password;
   if(!await loginAllowed(request,email||'invalid'))return reply({error:'Please wait a minute before trying again.'},429);
   if(!emailValid(email)||!validPassword(password))return reply({error:'Email or password was not recognized.'},401);
   const credential=await accessStore.credentialForEmail(email);const accepted=await verifyPassword(password,credential?.passwordHash);if(!credential||!accepted)return reply({error:'Email or password was not recognized.'},401);
   return reply({user:{...publicMember(credential),hasPassword:true}},200,sessionCookie(await issueSession(credential,accessStore,'password'),request));
  }
  if(input.action==='redeem'){
   if(typeof input.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(input.token))return reply({error:'This sign-in link is invalid.'},400);
   if(!await accessStore.allowAttempt(`invite:ip:${accessRequestIdentity(request)}`,Date.now()))return reply({error:'Please wait a minute before trying again.'},429);
   const result=await redeemSession(input.token,accessStore);if(!result)return reply({error:'This link has expired or was already used. Ask your administrator for a new link.'},401);
   return reply({user:result.user},200,sessionCookie(result.token,request));
  }
  if(input.action==='bootstrap'){
   if(!await accessStore.allowAttempt(`bootstrap:ip:${accessRequestIdentity(request)}`,Date.now()))return reply({error:'Please wait a minute before trying again.'},429);
   if(typeof input.key!=='string'||!secretEqual(input.key,process.env.ACCESS_BOOTSTRAP_KEY))return reply({error:'Administrator access was not recognized.'},401);
   // The existing administrator credential establishes the first named account.
   const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
   const name=typeof input.name==='string'?input.name.trim():'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200||!name||name.length>80||!validPassword(input.newPassword))return reply({error:'Enter your name, email address, and a password between 12 and 200 characters.'},400);
   const result=await bootstrapWithPassword(email,name,await hashPassword(input.newPassword),accessStore);if(!result)return reply({error:'An administrator account already exists. Ask that administrator for an invitation.'},409);
   return reply({user:{...publicMember(result.user),hasPassword:true}},200,sessionCookie(result.token,request));
  }
  if(input.action==='set_password'){
   const session=await currentMember(request);if(!session)return reply({error:'Sign in again before changing your password.'},401);
   if(!validPassword(input.newPassword))return reply({error:'Use a password between 12 and 200 characters.'},400);
   if(!await loginAllowed(request,session.email))return reply({error:'Please wait a minute before trying again.'},429);
   const credential=await accessStore.credentialForEmail(session.email);if(!credential)return reply({error:'Sign in again before changing your password.'},401);
   if(credential.passwordHash){const freshInvite=session.authMethod==='invite'&&Date.now()-session.authenticatedAt<=15*60_000;const currentAccepted=validPassword(input.currentPassword)&&await verifyPassword(input.currentPassword,credential.passwordHash);if(!freshInvite&&!currentAccepted)return reply({error:'Enter your current password, or use a fresh invitation link to reset it.'},401)}
   const token=await replacePasswordSession(session,await hashPassword(input.newPassword),accessStore);return reply({ok:true,hasPassword:true},200,sessionCookie(token,request));
  }
  const user=await authorizeRequest(request,'owner');if(!user)return reply({error:'Administrator access required'},401);
  if(input.action==='invite'){
   const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';const name=typeof input.name==='string'?input.name.trim():'';const role=input.role as AccessRole;
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200||!name||name.length>80||!['owner','editor','operator'].includes(role))return reply({error:'Enter a name, email address, and valid role.'},400);
   if(email===user.email)return reply({error:'Use the password panel to update your own sign-in.'},400);
   const token=accessToken();const member=await accessStore.invite(email,name,role,tokenHash(token),Date.now()+24*60*60_000);
   return reply({member,url:`${canonicalOrigin(request)}/access#invite=${token}`,expiresInHours:24},201);
  }
  if(input.action==='disable'){
   if(typeof input.memberId!=='string'||input.memberId===user.id)return reply({error:'Choose a different member.'},400);
   await accessStore.disable(input.memberId);return reply({ok:true});
  }
  return reply({error:'Unknown action'},400);
 }catch(error){if(error instanceof SyntaxError)return reply({error:'Invalid request'},400);if(error instanceof Error&&error.message==='request_too_large')return reply({error:'Request is too large'},413);if(error instanceof AccessInvariantError)return reply({error:error.message},409);return reply({error:'Sign-in is temporarily unavailable. Existing graphics devices remain connected.'},503)}
}
