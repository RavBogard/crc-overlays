import {accessRequestIdentity,accessStore} from '@/lib/access';
import {PAIRING_CODE,deviceStore,pairingCodeHash} from '@/lib/devices';
import {readLimitedBody} from '@/lib/oauth-core';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const REFUSED='That pairing code has expired or was already used. Ask for a new code.';

/**
 * Redeemed by the Companion module, which sends no Origin header, so the same-site
 * check that guards /api/devices cannot apply here. The per-address limiter the
 * sign-in routes use takes its place (D6), on top of the code's own ten-minute
 * expiry, single use and five-attempt cap.
 */
export async function POST(request:Request){
 let input:unknown;
 try{input=JSON.parse(await readLimitedBody(request,1024))}
 catch(error){if(error instanceof Error&&error.message==='request_too_large')return reply({error:'Request is too large'},413);return reply({error:'Invalid request'},400)}
 const now=Date.now();
 try{
  if(!await accessStore.allowAttempt(`pairing:ip:${accessRequestIdentity(request)}`,now))return reply({error:'Please wait a minute before trying again.'},429);
 }catch{return reply({error:'Pairing is temporarily unavailable. Existing graphics devices remain connected.'},503)}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request'},400);
 const code=(input as Record<string,unknown>).code;
 if(typeof code!=='string'||!PAIRING_CODE.test(code.trim()))return reply({error:'Enter the six-digit pairing code.'},400);
 try{
  const result=await deviceStore.redeemPairingCode(pairingCodeHash(code.trim()),now);
  if(!result)return reply({error:REFUSED},400);
  return reply({token:result.token,name:result.credential.name,kind:result.credential.kind},201);
 }catch(error){
  console.error('pairing_redeem_error',{name:error instanceof Error?error.name:'UnknownError'});
  return reply({error:'Pairing is temporarily unavailable. Existing graphics devices remain connected.'},503);
 }
}
