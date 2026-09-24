import {AuthoringError} from './authoring-model';
import {IMPORT_LIMITS,appendDrop,beginDrop,finishDrop,type ImportRepository} from './imports';

/**
 * TBI redo G1 - what /api/imports/<token> serves the dropzone page (app/import/[token]). The link is
 * the capability, like a signed URL: no sign-in, valid for its one import until the link expires.
 * POST ?step=begin {fileName, mediaType, totalBytes}; POST ?step=chunk&index=<n> with the raw bytes
 * (application/octet-stream, at most 1 MB, in order); POST ?step=finish. Nothing here logs the token
 * or echoes file content. The route passes the real store; tests pass their own.
 */
export const IMPORT_HEADERS={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'} as const;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:IMPORT_HEADERS});
const MAX_BEGIN_BODY=4096;

export type DropState={status:string;receivedBytes:number;totalBytes:number|null;refusal:string|null};
const state=(row:{status:string;receivedBytes:number;totalBytes:number|null;refusal:string|null}):DropState=>({status:row.status,receivedBytes:row.receivedBytes,totalBytes:row.totalBytes,refusal:row.refusal});

async function boundedBytes(request:Request,max:number){
 const declared=Number(request.headers.get('content-length')||0);if(declared>max)return null;
 const reader=request.body?.getReader();if(!reader)return new Uint8Array(0);
 const parts:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();return null}parts.push(value)}
 const out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength}return out;
}

export async function importDropPost(request:Request,token:string,repository:ImportRepository,now=Date.now()):Promise<Response>{
 try{
  const url=new URL(request.url),step=url.searchParams.get('step');
  if(step==='begin'){
   const raw=await boundedBytes(request,MAX_BEGIN_BODY);if(!raw)return json({error:'Reload the page and try again.'},413);
   let body:Record<string,unknown>;try{body=JSON.parse(new TextDecoder().decode(raw))}catch{return json({error:'Reload the page and try again.'},400)}
   if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Reload the page and try again.'},400);
   const row=await beginDrop(repository,token,{fileName:body.fileName,mediaType:body.mediaType,totalBytes:body.totalBytes},now);
   return json({...state(row),chunkBytes:IMPORT_LIMITS.chunkBytes});
  }
  if(step==='chunk'){
   const index=url.searchParams.get('index')??'';if(!/^\d{1,4}$/.test(index))return json({error:'Reload the page and try again.'},400);
   if(!(request.headers.get('content-type')??'').startsWith('application/octet-stream'))return json({error:'Reload the page and try again.'},415);
   const bytes=await boundedBytes(request,IMPORT_LIMITS.chunkBytes);if(!bytes)return json({error:`Each part must be at most ${IMPORT_LIMITS.chunkBytes/1024/1024} MB. Reload the page and try again.`},413);
   return json(state(await appendDrop(repository,token,Number(index),bytes,now)));
  }
  if(step==='finish')return json(state(await finishDrop(repository,token,now)));
  return json({error:'Reload the page and try again.'},400);
 }catch(error){
  if(error instanceof AuthoringError)return json({error:error.message,code:error.code},error.status);
  console.error('Import drop failed');return json({error:'The upload is unavailable right now. Try again in a minute.',code:'import_unavailable'},503);
 }
}
