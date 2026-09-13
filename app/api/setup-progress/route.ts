import {authorizeRequest,sameSiteWrite} from '@/lib/access';
import {readLimitedBody} from '@/lib/oauth-core';
import {SetupProgressError,isLegacyActor,mergeSetupSteps,parseSetupSteps,setupProgressStore} from '@/lib/setup-progress';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});

export async function GET(request:Request){
 let member;try{member=await authorizeRequest(request,'read')}catch{return reply({error:'Setup progress is temporarily unavailable.'},503)}
 if(!member)return reply({error:'Sign in to continue.'},401);
 // A legacy control/output key is a device credential, not a person: there is no member
 // row to read, so the setup page shows an unsaved checklist rather than someone else's.
 if(isLegacyActor(member.id))return reply({steps:{},persisted:false});
 try{return reply({steps:await setupProgressStore.get(member.id),persisted:true})}
 catch{return reply({error:'Setup progress is temporarily unavailable.'},503)}
}

export async function PUT(request:Request){
 if(!sameSiteWrite(request))return reply({error:'Open this action from the same website.'},403);
 let member;try{member=await authorizeRequest(request,'read')}catch{return reply({error:'Setup progress is temporarily unavailable.'},503)}
 if(!member)return reply({error:'Sign in to continue.'},401);
 let input:unknown;
 try{input=JSON.parse(await readLimitedBody(request,8192))}
 catch(error){if(error instanceof Error&&error.message==='request_too_large')return reply({error:'Request is too large'},413);return reply({error:'Invalid request'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request'},400);
 const value=input as Record<string,unknown>;
 const extra=Object.keys(value).filter(key=>key!=='steps');
 if(extra.length)return reply({error:`Body contains unsupported fields: ${extra.join(', ')}`},400);
 let steps;
 try{steps=parseSetupSteps(value.steps)}
 catch(error){return reply({error:error instanceof SetupProgressError?error.message:'Invalid request'},400)}
 if(isLegacyActor(member.id))return reply({steps,persisted:false});
 try{
  const merged=mergeSetupSteps(await setupProgressStore.get(member.id),steps);
  await setupProgressStore.set(member.id,merged,Date.now());
  return reply({steps:merged,persisted:true});
 }catch(error){
  if(error instanceof SetupProgressError)return reply({error:error.message},400);
  return reply({error:'Setup progress could not be saved.'},503);
 }
}
