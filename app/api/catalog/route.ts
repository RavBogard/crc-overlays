import {authorized,json,cues} from '@/lib/server';
export async function GET(r:Request){return authorized(r)?json(cues):json({error:'Access key required'},401)}
