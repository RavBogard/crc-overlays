import {accessStore,authorizeRequest} from '@/lib/access';
import {AuthoringError,publicErrorDetails} from '@/lib/authoring-model';
import {authoringOperation,authoringRepository} from '@/lib/authoring';
import {json} from '@/lib/server';

// R-A2 - the publications page (/author/publications). GET lists recent publications with the
// name of the member behind each, for a person to read; GET ?image=<preview> returns the frame
// the server fit captured for that preview. Both need an authoring member. Rolling back goes
// through /api/authoring's rollback_draft, like every other change the editor makes.
export const runtime='nodejs';
const PREVIEW_ID=/^[A-Za-z0-9_-]{1,200}$/;
type Row={member:string|null}&Record<string,unknown>;

export async function GET(request:Request){
 try{
  const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
  const url=new URL(request.url),image=url.searchParams.get('image');
  if(image!==null){
   if(!PREVIEW_ID.test(image))return json({error:'Not found'},404);
   const stored=await authoringRepository().getFitImage(image);
   if(!stored)return json({error:'Not found'},404);
   const bytes=Uint8Array.from(stored.data);
   return new Response(bytes.buffer,{headers:{'Content-Type':stored.mimeType,'Content-Length':String(bytes.byteLength),'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
  }
  const who=url.searchParams.get('who');const since=Number(url.searchParams.get('since')||'');
  const input={...(Number.isSafeInteger(since)&&since>=0?{since}:{}),...(who==='agent'||who==='person'?{actor:who}:{}),limit:100};
  const result=await authoringOperation('list_recent_publications',input,actor.id) as {since:number;publications:Row[]};
  // A person reads names, never member ids: each id is looked up once, and one that no longer
  // resolves (a removed member, a device, the legacy key) reads as nobody in particular.
  const names=new Map<string,string|null>();
  for(const id of new Set(result.publications.flatMap(row=>row.member?[row.member]:[])))names.set(id,await accessStore.memberById(id).then(member=>member?.name||member?.email||null).catch(()=>null));
  return json({since:result.since,publications:result.publications.map(({member,...row})=>({...row,memberName:member?names.get(member)??null:null}))});
 }catch(error){
  if(error instanceof AuthoringError)return json({error:error.message,code:error.code,...publicErrorDetails(error.details)},error.status);
  console.error('Publications read failed');return json({error:'Publications are unavailable right now',code:'authoring_unavailable'},503);
 }
}
