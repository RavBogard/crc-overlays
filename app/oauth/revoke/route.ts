import {revoke} from '@/lib/oauth-http';
export const dynamic='force-dynamic';
export async function POST(request:Request){return revoke(request)}
