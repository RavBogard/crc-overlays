import {authorized,json,snapshot} from '@/lib/server';
export async function GET(r:Request){if(!authorized(r))return json({error:'Access key required'},401);try{return json(await snapshot())}catch{return json({error:'State unavailable'},503)}}
