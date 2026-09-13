import {authorizeRequest} from '@/lib/access';
import {relayConfigured,relayRequest} from '@/lib/relay';
import {json,db} from '@/lib/server';
export async function POST(r:Request){if(!await authorizeRequest(r,'read'))return json({error:'Output key required'},401);try{const b:any=await r.json();if(typeof b.id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(b.id)||!Number.isSafeInteger(b.revision)||b.revision<0||!['settled','transition','error'].includes(b.phase)||(b.cue!==null&&typeof b.cue!=='string'))return json({error:'Invalid acknowledgment'},400);
if(relayConfigured()){const response=await relayRequest('/ack',b);return json(await response.json(),response.status)}
await db.query('INSERT INTO renderers(id,revision,cue,phase,seen) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,cue=excluded.cue,phase=excluded.phase,seen=excluded.seen WHERE excluded.revision>=renderers.revision',[b.id,b.revision,b.cue,b.phase,Date.now()]);return json({ok:true})}catch{return json({error:'Acknowledgment unavailable'},503)}}

