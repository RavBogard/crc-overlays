import {authorizeRequest} from '@/lib/access';
import {AuthoringError,publicErrorDetails} from '@/lib/authoring-model';
import {authoringOperation} from '@/lib/authoring';
import {catalog,json} from '@/lib/server';
import {slotCueRegister,slotIndex} from '@/lib/slot-catalog';
import {SERVICE_TYPES,SLOTS} from '@/lib/slots';

/**
 * "This service" — read the slot text, and save it.
 *
 * It is its own route rather than another `operation` on `/api/authoring` because the page
 * needs one small answer, not the whole catalog: the slot table, which service types exist,
 * what each slot currently says and which slots have a graphic at all.
 *
 * Both verbs need the `author` permission, which is owner or editor. An Editor is who
 * prepares "Names for this service" today, and is who fills a slot before a service.
 */
export const runtime='nodejs';

export async function GET(request:Request){
 const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
 try{
  const current=await catalog();
  const register=slotCueRegister();
  // Each slot's draft version, handed back on Save so one person's Save can't silently replace another's.
  const listed=await authoringOperation('list_slots',{},actor.id) as {slots:{key:string;version:number|null}[]};
  const versions=Object.fromEntries(listed.slots.filter(slot=>slot.version!==null).map(slot=>[slot.key,slot.version]));
  const values=Object.fromEntries(slotIndex(current.cues,register).map(slot=>[slot.key,slot.text]));
  return json({
   serviceTypes:SERVICE_TYPES,
   slots:SLOTS,
   values,
   // A slot with no published graphic yet cannot be typed into. Saying so on the page is
   // better than a field that silently refuses on Save.
   minted:SLOTS.filter(slot=>register.has(slot.key)).map(slot=>slot.key),
   versions,
  });
 }catch{return json({error:'The slot list is unavailable right now.'},503)}
}

export async function POST(request:Request){
 try{
  const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
  let body:unknown;try{body=await request.json()}catch{throw new AuthoringError('invalid_json','Body must be valid JSON')}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AuthoringError('invalid_input','Body must be an object');
  return json(await authoringOperation('save_slots',body,actor.id));
 }catch(error){
  // The MCP wording says to call list_slots; on the page the remedy is a reload.
  if(error instanceof AuthoringError&&error.code==='version_conflict')return json({error:'Someone else saved this service’s text after this page loaded. Reload the page to see it, then make your change again. Nothing was saved.',code:error.code},409);
  if(error instanceof AuthoringError)return json({error:error.message,code:error.code,...publicErrorDetails(error.details)},error.status);
  console.error('Slot save failed');return json({error:'The slot service is unavailable right now.',code:'slots_unavailable'},503);
 }
}
