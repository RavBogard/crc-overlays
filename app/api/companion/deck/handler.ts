import {exportSigningKey,verifyExport} from '@/lib/companion-deck/export';
import {DeckToolError,exportForLink,prepareExport,type DeckToolContext} from '@/lib/companion-deck/tools';

/**
 * GET /api/companion/deck - the full Companion deck export (R-C4).
 *   ?token=<signed link>  the file export_deck_config linked to: no session needed, the link is the
 *                         grant. It expires after 15 minutes and names the deck version and the sha256 of
 *                         the bytes that were validated, so it never serves a different deck.
 *   ?download=full        for a signed-in member on the Setup page: validates the deck now and redirects
 *                         to a fresh signed link.
 * The file holds connection labels only, never a connection's config or secrets.
 */
export type DeckDownloadDeps={
 context?:DeckToolContext;
 /** Resolves the signed-in member (session cookie); null when there is none or the role may not. */
 member:(request:Request)=>Promise<{id:string}|null>;
 signingKey?:Buffer|null;
 now?:()=>number;
};
const text=(message:string,status:number)=>new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});

export async function handleDeckDownload(request:Request,deps:DeckDownloadDeps):Promise<Response>{
 const url=new URL(request.url),now=deps.now??Date.now,key=deps.signingKey===undefined?exportSigningKey():deps.signingKey;
 try{
  const token=url.searchParams.get('token');
  if(token){
   if(!key)return text('Deck export links are not configured on this deployment.',503);
   const claims=verifyExport(token,key,now());
   if(!claims)return text('This deck export link is not valid or has expired (links work for 15 minutes). Ask for a new one with export_deck_config, or download it from the Setup page.',403);
   const file=await exportForLink(deps.context??{},claims);
   return new Response(new Uint8Array(file.bytes),{status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${file.fileName}"`,'Content-Length':String(file.bytes.length),'X-Content-SHA256':file.sha256,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  }
  if(url.searchParams.get('download')==='full'){
   const member=await deps.member(request);
   if(!member)return text('Sign in to this workspace to download the Companion deck.',401);
   const link=await prepareExport({...deps.context,signingKey:key,now,origin:url.origin});
   return new Response(null,{status:303,headers:{Location:link.url,'Cache-Control':'no-store'}});
  }
  return text('Pass a signed export link (token), or download=full from the Setup page.',404);
 }catch(error){
  if(error instanceof DeckToolError)return text(error.message,error.status);
  console.error('Companion deck export failed',error instanceof Error?error.name:'UnknownError');
  return text('The Companion deck could not be exported right now. Try again in a minute.',503);
 }
}
