import {authorizeGet,authorizePost} from '@/lib/oauth-http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return authorizeGet(request)}
export async function POST(request:Request){return authorizePost(request)}
