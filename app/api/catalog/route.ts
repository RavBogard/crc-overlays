import {authorizeRequest} from '@/lib/access';
import {catalog,json} from '@/lib/server';
export async function GET(r:Request){if(!await authorizeRequest(r,'read'))return json({error:'Access key required'},401);try{const current=await catalog();return new Response(JSON.stringify(current.cues),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-CRC-Catalog-Version':current.version}})}catch{return json({error:'Catalog unavailable'},503)}}
