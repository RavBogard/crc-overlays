import {authorizeRequest} from '@/lib/access';
import {AuthoringError,publicErrorDetails} from '@/lib/authoring-model';
import {authoringOperation} from '@/lib/authoring';
import {json} from '@/lib/server';
import {SERVICE_TYPES,SLOTS} from '@/lib/slots';

/**
 * "This service" — read the slot text, save it, and choose which graphic a slot fills.
 *
 * It is its own route rather than another `operation` on `/api/authoring` because the page
 * needs one small answer, not the whole catalog: the slot table, which service types exist,
 * what each slot currently says, which graphic it fills and which graphics it could fill.
 *
 * Every verb needs the `author` permission, which is owner or editor. An Editor is who
 * prepares "Names for this service" today, and is who fills a slot before a service.
 */
export const runtime='nodejs';

type ListedSlot={key:string;cueId:string|null;graphicName:string|null;minted:boolean;text:string;version:number|null};

export async function GET(request:Request){
 const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
 try{
  // Each slot's fields are read from the graphic it fills (lib/slots.ts slotFieldsFromGraphic), and
  // each draft version is handed back on Save so one person's Save can't silently replace another's.
  const listed=await authoringOperation('list_slots',{includeCandidates:true},actor.id) as {slots:ListedSlot[];candidates?:unknown[]};
  return json({
   serviceTypes:SERVICE_TYPES,
   slots:SLOTS,
   values:Object.fromEntries(listed.slots.filter(slot=>slot.minted).map(slot=>[slot.key,slot.text])),
   // A slot with no graphic yet cannot be typed into. Saying so on the page is better than a
   // field that silently refuses on Save.
   minted:listed.slots.filter(slot=>slot.minted).map(slot=>slot.key),
   versions:Object.fromEntries(listed.slots.filter(slot=>slot.version!==null).map(slot=>[slot.key,slot.version])),
   graphics:Object.fromEntries(listed.slots.filter(slot=>slot.cueId).map(slot=>[slot.key,{cueId:slot.cueId,name:slot.graphicName}])),
   candidates:listed.candidates??[],
  });
 }catch{return json({error:'The slot list is unavailable right now.'},503)}
}

export async function POST(request:Request){
 try{
  const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
  let body:unknown;try{body=await request.json()}catch{throw new AuthoringError('invalid_json','Body must be valid JSON')}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AuthoringError('invalid_input','Body must be an object');
  // `{bind:{key,cueId}}` points a slot at a graphic; anything else is a Save.
  const bind=(body as {bind?:unknown}).bind;
  if(bind!==undefined)return json(await authoringOperation('bind_slot',bind,actor.id));
  return json(await authoringOperation('save_slots',body,actor.id));
 }catch(error){
  // The MCP wording says to call list_slots; on the page the remedy is a reload.
  if(error instanceof AuthoringError&&error.code==='version_conflict')return json({error:'Someone else saved this service’s text after this page loaded. Reload the page to see it, then make your change again. Nothing was saved.',code:error.code},409);
  if(error instanceof AuthoringError)return json({error:error.message,code:error.code,...publicErrorDetails(error.details)},error.status);
  console.error('Slot save failed');return json({error:'The slot service is unavailable right now.',code:'slots_unavailable'},503);
 }
}
