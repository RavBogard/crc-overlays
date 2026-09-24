import {authorizeRequest} from '@/lib/access';
import {catalog,json} from '@/lib/server';
import {liturgyIndex} from '@/lib/liturgy-index';
import {cuesWithSlotMarkers,slotIndex} from '@/lib/slot-catalog';
import {cueRoleIndex} from '@/lib/cue-roles';

/**
 * D14 — the liturgy index is additive and opt-in. `/output`, the console and Companion all
 * validate a bare `Cue[]` field by field, so the default response stays exactly what it has
 * always been, header for header. `?include=liturgy` and `?include=slots` are the only ways
 * to get an envelope, and the slot envelope is the only place a cue carries `category` or
 * `slot` — adding either to the default response would move a shape three clients check.
 * The slot envelope also carries `roles` (lib/cue-roles.ts, R-C5): role and set per cue, a key
 * of its own that a module older than 1.8.0 never reads.
 */
export async function GET(r:Request){
 if(!await authorizeRequest(r,'read'))return json({error:'Access key required'},401);
 try{
  const current=await catalog();
  const include=new URL(r.url).searchParams.get('include');
  const body=include==='liturgy'?{version:current.version,cues:current.cues,liturgy:liturgyIndex(current.cues)}
   :include==='slots'?{version:current.version,cues:cuesWithSlotMarkers(current.cues),slots:slotIndex(current.cues),roles:cueRoleIndex(current.cues)}
   :current.cues;
  return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-CRC-Catalog-Version':current.version}});
 }catch{return json({error:'Catalog unavailable'},503)}
}
