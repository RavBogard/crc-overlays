import {authorizeRequest} from '@/lib/access';
import {catalog,json} from '@/lib/server';
import {liturgyIndex} from '@/lib/liturgy-index';

/**
 * D14 — the liturgy index is additive and opt-in. `/output`, the console and Companion all
 * validate a bare `Cue[]` field by field, so the default response stays exactly what it has
 * always been, header for header. `?include=liturgy` is the only way to get the envelope.
 */
export async function GET(r:Request){
 if(!await authorizeRequest(r,'read'))return json({error:'Access key required'},401);
 try{
  const current=await catalog();
  const wantsLiturgy=new URL(r.url).searchParams.get('include')==='liturgy';
  const body=wantsLiturgy?{version:current.version,cues:current.cues,liturgy:liturgyIndex(current.cues)}:current.cues;
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-CRC-Catalog-Version':current.version}});
 }catch{return json({error:'Catalog unavailable'},503)}
}
