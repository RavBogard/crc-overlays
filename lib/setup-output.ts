/**
 * The Setup page's graphics URL, minted once and shown again on later visits (PLAN.md step 5/8).
 * An output token is otherwise shown exactly once; one created here is also kept sealed with
 * AES-256-GCM under a key derived, with a purpose label, from the deployment's relay secret or
 * control key (or SETUP_SEAL_KEY), the same way lib/companion-deck/export.ts derives its signing key,
 * so no existing secret is used as-is. An output credential satisfies `read` only, and revoking it
 * on the Access page ends the URL: the next visit mints a new one.
 */
import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto';
import type {DeviceStore} from './devices';

type SealEnvironment={SETUP_SEAL_KEY?:string;RELAY_SECRET?:string;CONTROL_KEY?:string;[key:string]:string|undefined};

export function setupSealKey(env:SealEnvironment=process.env):Buffer|null{
 const own=env.SETUP_SEAL_KEY?.trim();
 const base=own&&own.length>=32?own:env.RELAY_SECRET||env.CONTROL_KEY;
 if(!base)return null;
 return createHmac('sha256',base).update('setup-output-seal/v1').digest();
}

/** `v1.<iv>.<tag>.<ciphertext>`, base64url. */
export function sealToken(token:string,key:Buffer):string{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}

/** The token, or null for anything that does not open under this key. */
export function unsealToken(sealed:string,key:Buffer):string|null{
 const [version,iv,tag,body,extra]=String(sealed).split('.');
 if(version!=='v1'||!iv||!tag||!body||extra!==undefined)return null;
 try{
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body,'base64url')),decipher.final()]).toString('utf8');
 }catch{return null}
}

export const outputUrl=(origin:string,token:string)=>`${origin}/output#device=${token}`;

/** The newest sealed graphics URL that still opens, or null. */
export async function currentGraphicsUrl(store:DeviceStore,key:Buffer,origin:string){
 for(const {credential,sealed} of await store.sealedOutputs()){
  const token=unsealToken(sealed,key);
  if(token)return {url:outputUrl(origin,token),credential};
 }
 return null;
}

/** Mints the Setup page's graphics output; its token is sealed in the same insert. */
export async function mintGraphicsUrl(store:DeviceStore,key:Buffer,origin:string,input:{name:string;memberId:string;now:number}){
 try{
  const {token,credential}=await store.issue({...input,kind:'output',seal:value=>sealToken(value,key)});
  return {url:outputUrl(origin,token),credential,durable:true};
 }catch(error){
  // Until db/setup-output.sql is applied there is nowhere to keep it: the URL is shown this once.
  if((error as {code?:string})?.code!=='42703')throw error;
  const {token,credential}=await store.issue({...input,kind:'output'});
  return {url:outputUrl(origin,token),credential,durable:false};
 }
}
