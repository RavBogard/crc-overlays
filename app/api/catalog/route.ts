import {authorized,catalogVersion,cues,json} from '@/lib/server';
export async function GET(r:Request){return authorized(r)?new Response(JSON.stringify(cues),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-CRC-Catalog-Version':catalogVersion}}):json({error:'Access key required'},401)}
