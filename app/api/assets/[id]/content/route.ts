import {defaultAssetRepository} from '@/lib/assets';
import {json} from '@/lib/server';

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,asset=await defaultAssetRepository().get(id);if(!asset?.published)return json({error:'Not found'},404);return new Response(Uint8Array.from(asset.data).buffer,{headers:{'Content-Type':asset.mimeType,'Content-Length':String(asset.bytes),'Cache-Control':'public, max-age=31536000, immutable','ETag':`"${asset.id.slice(6)}"`,'X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}})}catch{return json({error:'Asset unavailable'},503)}}
