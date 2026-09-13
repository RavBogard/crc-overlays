import {authorizeRequest} from '@/lib/access';
import {defaultAssetRepository} from '@/lib/assets';
import {json} from '@/lib/server';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);const {id}=await params,asset=await defaultAssetRepository().get(id);if(!asset)return json({error:'Not found'},404);return new Response(Uint8Array.from(asset.data).buffer,{headers:{'Content-Type':asset.mimeType,'Content-Length':String(asset.bytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}})}catch{return json({error:'Asset preview unavailable'},503)}}
