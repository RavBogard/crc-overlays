import {oauthJson,protectedResourceMetadata} from '@/lib/oauth-http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return oauthJson(protectedResourceMetadata(request))}
