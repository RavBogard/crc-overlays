import {defaultAssetRepository,verifyAssetRead} from '@/lib/assets';
import {json} from '@/lib/server';

// R-B1 - the server fit stage's artwork read. No session: the link itself is the credential,
// signed for this one asset and valid for minutes (lib/assets.ts signedAssetReadPath). A bad,
// expired or other-asset signature is one refusal, with nothing logged about the link.
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,url=new URL(request.url);if(!verifyAssetRead(id,url.searchParams.get('exp'),url.searchParams.get('sig')))return json({error:'Forbidden'},403);const asset=await defaultAssetRepository().get(id);if(!asset)return json({error:'Not found'},404);return new Response(Uint8Array.from(asset.data).buffer,{headers:{'Content-Type':asset.mimeType,'Content-Length':String(asset.bytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Referrer-Policy':'no-referrer'}})}catch{return json({error:'Asset unavailable'},503)}}
