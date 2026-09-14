import {authorizeRequest,sameSiteWrite} from '@/lib/access';
import {DeviceLimitError,MAX_DEVICE_NAME,PAIRING_CODE_TTL_MS,deviceName,deviceStore,forgetDeviceCredential,newPairingCode,pairingCodeHash} from '@/lib/devices';
import {canonicalOrigin,readLimitedBody} from '@/lib/oauth-core';
import {isLegacyActor} from '@/lib/setup-progress';

const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const AUTHOR_REQUIRED='Sign in as an editor or an administrator to manage devices.';
const OWNER_REQUIRED='Administrator access required';
const UNAVAILABLE='Paired devices are temporarily unavailable. Existing graphics devices remain connected.';
const NAME_REQUIRED=`Name this device in ${MAX_DEVICE_NAME} characters or fewer.`;

/**
 * Paired devices, newest first. The same list /access renders in its administrator-only
 * panel; editors may also read it, because an editor creates devices during setup.
 *
 * Only a signed-in member manages devices. A legacy shared key satisfies `author`, so
 * without this check a leaked CONTROL_KEY could mint permanent device credentials and
 * never be able to revoke them (revoke is owner-only, which no legacy actor reaches).
 */
export async function GET(request:Request){
 let user;try{user=await authorizeRequest(request,'author')}catch{return reply({error:UNAVAILABLE},503)}
 if(!user||isLegacyActor(user.id))return reply({error:AUTHOR_REQUIRED},401);
 try{return reply({devices:await deviceStore.list()})}catch{return reply({error:UNAVAILABLE},503)}
}

export async function POST(request:Request){
 if(!sameSiteWrite(request))return reply({error:'Open this action from the same website.'},403);
 let input:unknown;
 try{input=JSON.parse(await readLimitedBody(request,8192))}
 catch(error){if(error instanceof Error&&error.message==='request_too_large')return reply({error:'Request is too large'},413);return reply({error:'Invalid request'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request'},400);
 const value=input as Record<string,unknown>;
 const action=value.action;
 if(action!=='pair_code'&&action!=='create_output'&&action!=='create_history_reader'&&action!=='revoke')return reply({error:'Unknown action'},400);
 // Revoking a device is administrator work; creating one is editor work (D6). A service-history
 // connection is administrator work too: it hands another website a standing read of this one.
 let user;try{user=await authorizeRequest(request,action==='revoke'||action==='create_history_reader'?'owner':'author')}catch{return reply({error:UNAVAILABLE},503)}
 if(!user)return reply({error:action==='revoke'||action==='create_history_reader'?OWNER_REQUIRED:AUTHOR_REQUIRED},401);
 // Devices are managed by people, never by a shared key or by another device.
 if(isLegacyActor(user.id))return reply({error:AUTHOR_REQUIRED},401);
 const now=Date.now();
 try{
  if(action==='pair_code'){
   // Only Companion types a code. A graphics output gets a URL instead (D5).
   if(value.kind!==undefined&&value.kind!=='companion')return reply({error:'Pairing codes are for Companion. Create a graphics connection instead.'},400);
   const name=deviceName(value.name);
   if(!name)return reply({error:NAME_REQUIRED},400);
   const code=newPairingCode(),expiresAt=now+PAIRING_CODE_TTL_MS;
   await deviceStore.createPairingCode({codeHash:pairingCodeHash(code),kind:'companion',name,memberId:user.id,now,expiresAt});
   return reply({code,expiresAt},201);
  }
  if(action==='create_output'){
   const name=deviceName(value.name);
   if(!name)return reply({error:NAME_REQUIRED},400);
   const {token,credential}=await deviceStore.issue({name,kind:'output',memberId:user.id,now});
   // The token is shown exactly once, here, inside the URL the operator pastes.
   return reply({url:`${canonicalOrigin(request)}/output#device=${token}`,credential},201);
  }
  // The cue-log credential. It reads the service history and nothing else: no live control, no
  // graphics, no authoring. The token is shown exactly once, here.
  if(action==='create_history_reader'){
   const name=deviceName(value.name);
   if(!name)return reply({error:NAME_REQUIRED},400);
   const {token,credential}=await deviceStore.issue({name,kind:'history_reader',memberId:user.id,now});
   return reply({token,credential},201);
  }
  if(typeof value.id!=='string'||!value.id)return reply({error:'Choose a device to revoke.'},400);
  await deviceStore.revoke(value.id,now);
  // Belt and braces: the verified-token cache is per instance, so dropping the entry
  // here only helps the instance that served the revoke. Revocation is made to bite on
  // the next reconnection by the realtime ticket route, which verifies afresh.
  forgetDeviceCredential(value.id);
  return reply({ok:true});
 }catch(error){
  if(error instanceof DeviceLimitError)return reply({error:error.message},409);
  console.error('devices_api_error',{name:error instanceof Error?error.name:'UnknownError'});
  return reply({error:UNAVAILABLE},503);
 }
}
