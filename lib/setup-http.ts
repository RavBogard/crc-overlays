/**
 * The Setup page's three requests (PLAN.md, S1/S2):
 *   GET  /api/setup/deck          the stored deck's summary and readiness (a member who runs the booth)
 *   GET  /api/setup/graphics-url  the durable graphics URL, when one was minted here (an editor or owner)
 *   POST /api/setup/graphics-url  mint it once
 *   POST /api/setup/companion     the operator's personal Companion file (an Owner, signed in)
 * People only: a legacy shared key, a device token and a signed export link are all refused, because
 * each of these hands out a credential or the settings behind one. Handlers take their dependencies so
 * tests run them without Postgres, the relay or the environment.
 */
import type {AccessMember, AccessPermission} from './access';
import type {DeviceStore} from './devices';
import type {SetupFlow} from './setup-flow';
import type {SetupDeckSummary} from './setup-deck';
import type {StoredDeck} from './companion-deck/repository.ts';
import type {ValidationResult} from './companion-deck/validate.ts';
import type {ValuesSecret} from './companion-deck/personal.ts';
import {isLegacyActor} from './setup-progress';
import {personalDeviceName} from './setup-flow';

const HEADERS={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:HEADERS});
const UNAVAILABLE='Setup is temporarily unavailable. Try again in a minute.';

export type SetupDeps={
 flow:SetupFlow|null;
 authorize:(request:Request,permission:AccessPermission)=>Promise<AccessMember|null>;
 sameSite:(request:Request)=>boolean;
 origin:(request:Request)=>string;
 now?:()=>number;
};

/** A signed-in person with the permission; never a shared key or a device. */
async function person(request:Request,deps:SetupDeps,permission:AccessPermission):Promise<AccessMember|null|'unavailable'>{
 let member;try{member=await deps.authorize(request,permission)}catch{return 'unavailable'}
 return member&&!isLegacyActor(member.id)?member:null;
}

export type DeckDeps=SetupDeps&{summary:(flow:SetupFlow)=>Promise<SetupDeckSummary>;reviewBoard:()=>Promise<{id:string;title:string}|null>;valuesConfigured:()=>boolean};

export async function handleSetupDeck(request:Request,deps:DeckDeps){
 const member=await person(request,deps,'control');
 if(member==='unavailable')return reply({error:UNAVAILABLE},503);
 if(!member)return reply({error:'Sign in to this workspace to see its deck.'},401);
 if(!deps.flow)return reply({error:'This workspace has no setup flow.'},404);
 let summary:SetupDeckSummary;
 try{summary=await deps.summary(deps.flow)}
 catch(error){
  const message=error instanceof Error&&(error as {status?:number}).status&&(error as {status?:number}).status!<500?error.message:null;
  if(!message)console.error('setup_deck_failed',{name:error instanceof Error?error.name:'UnknownError'});
  return reply({error:message??'The deck could not be read right now. Try again in a minute.'},message?409:503);
 }
 let reviewBoard=null;try{reviewBoard=await deps.reviewBoard()}catch{}
 return reply({...summary,reviewBoard,personal:{owner:member.role==='owner',configured:deps.valuesConfigured()}});
}

export type GraphicsDeps=SetupDeps&{
 devices:DeviceStore;
 key:Buffer|null;
 current:(store:DeviceStore,key:Buffer,origin:string)=>Promise<{url:string}|null>;
 mint:(store:DeviceStore,key:Buffer,origin:string,input:{name:string;memberId:string;now:number})=>Promise<{url:string;durable:boolean}>;
 outputName:string;
};

export async function handleGraphicsUrl(request:Request,deps:GraphicsDeps){
 if(!deps.sameSite(request))return reply({error:'Open this action from the same website.'},403);
 const member=await person(request,deps,'author');
 if(member==='unavailable')return reply({error:UNAVAILABLE},503);
 if(!member)return reply({error:'Sign in as an editor or an administrator to connect the graphics.'},401);
 if(!deps.key)return reply({error:'Graphics connections are not configured on this deployment.'},503);
 const origin=deps.origin(request);
 try{
  const current=await deps.current(deps.devices,deps.key,origin);
  if(current||request.method==='GET')return reply({url:current?.url??null,durable:Boolean(current)});
  const minted=await deps.mint(deps.devices,deps.key,origin,{name:deps.outputName,memberId:member.id,now:(deps.now??Date.now)()});
  return reply({url:minted.url,durable:minted.durable},201);
 }catch{
  console.error('setup_graphics_url_failed');
  return reply({error:'The graphics connection could not be prepared. Try again.'},503);
 }
}

export type PersonalDeps=SetupDeps&{
 devices:DeviceStore;
 deck:()=>Promise<{stored:StoredDeck;validation:ValidationResult}>;
 values:()=>ValuesSecret|null;
 build:(stored:StoredDeck,values:ValuesSecret|null,flow:SetupFlow,overlays:{baseUrl:string;deviceToken:string})=>{bytes:Buffer;sha256:string};
 fileName:(label:string,version:number,now:number)=>string;
};

const text=(message:string,status:number)=>new Response(message,{status,headers:{...HEADERS,'Content-Type':'text/plain; charset=utf-8'}});

/**
 * The personal file. Refuses, with the reason, unless the deck validates clean; then mints a named,
 * revocable Companion token and returns the bytes. The token is revoked again if the file cannot be
 * made, so a failed download leaves no device behind. Nothing here logs a value, the token or the file.
 */
export async function handlePersonalDeck(request:Request,deps:PersonalDeps){
 if(!deps.sameSite(request))return text('Open this download from the Setup page.',403);
 const member=await person(request,deps,'owner');
 if(member==='unavailable')return text(UNAVAILABLE,503);
 if(!member)return text('Only an administrator of this workspace, signed in, can download this file.',401);
 const flow=deps.flow,block=flow?.steps.flatMap(step=>step.blocks).find(item=>item.kind==='personal-deck');
 if(!flow||!block||block.kind!=='personal-deck')return text('This workspace has no personal Companion file.',404);
 const now=(deps.now??Date.now)();
 let stored:StoredDeck,validation:ValidationResult;
 try{({stored,validation}=await deps.deck())}
 catch(error){
  const status=(error as {status?:number}).status;
  if(error instanceof Error&&status&&status<500)return text(error.message,status);
  console.error('setup_personal_deck_failed',{stage:'deck',name:error instanceof Error?error.name:'UnknownError'});
  return text('The deck could not be read right now. Try again in a minute.',503);
 }
 const errors=validation.findings.filter(finding=>finding.severity==='error');
 if(errors.length||!validation.exported)return text(`The deck is not ready, so the file is locked. ${errors.length} problem${errors.length===1?'':'s'}: ${errors.slice(0,3).map(finding=>finding.message).join(' ')}`.trim(),409);
 let values:ValuesSecret|null;
 try{values=deps.values()}catch{return text('The saved connection settings on this deployment cannot be read, so the file is locked.',503)}
 let issued:{token:string;credential:{id:string}};
 try{issued=await deps.devices.issue({name:personalDeviceName(flow,now),kind:'companion',memberId:member.id,now})}
 catch{console.error('setup_personal_deck_failed',{stage:'token'});return text(UNAVAILABLE,503)}
 try{
  const file=deps.build(stored,values,flow,{baseUrl:deps.origin(request),deviceToken:issued.token});
  return new Response(new Uint8Array(file.bytes),{status:200,headers:{...HEADERS,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${deps.fileName(block.label,stored.version,now)}"`,'Content-Length':String(file.bytes.length),'X-Deck-Version':String(stored.version)}});
 }catch(error){
  try{await deps.devices.revoke(issued.credential.id,now)}catch{}
  const message=error instanceof Error&&error.name==='PersonalDeckError'?error.message:null;
  if(!message)console.error('setup_personal_deck_failed',{stage:'build',name:error instanceof Error?error.name:'UnknownError'});
  return text(message?`${message} The file is locked.`:'The file could not be made right now. Try again in a minute.',message?409:503);
 }
}
