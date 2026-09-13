import {authorizeRequest} from '@/lib/access';
import {AssetConflictError,AssetError,defaultAssetRepository} from '@/lib/assets';
import {json} from '@/lib/server';

async function boundedText(request:Request){
 const reader=request.body?.getReader(),decoder=new TextDecoder();let raw='',bytes=0;
 if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();throw new AssetError('request_too_large','Request is too large',413)}raw+=decoder.decode(value,{stream:true})}
 return raw+decoder.decode();
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
  const raw=await boundedText(request);let body:unknown;try{body=JSON.parse(raw)}catch{throw new AssetError('invalid_json','Body must be valid JSON')}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AssetError('invalid_input','Body must be an object');
  const value=body as Record<string,unknown>,extra=Object.keys(value).filter(key=>!['expectedVersion','archived'].includes(key));
  if(extra.length||!Number.isInteger(value.expectedVersion)||(value.expectedVersion as number)<1||typeof value.archived!=='boolean')throw new AssetError('invalid_input','expectedVersion and archived are required');
  const {id}=await params;if(!/^asset_[a-f0-9]{64}$/.test(id))throw new AssetError('invalid_asset','Asset ID is invalid');
  const result=await defaultAssetRepository().setArchived(id,value.expectedVersion as number,value.archived,actor.id,Date.now());if(!result)throw new AssetConflictError();return json({asset:result});
 }catch(error){if(error instanceof AssetError)return json({error:error.message,code:error.code},error.status);console.error('Asset update failed',error instanceof Error?error.name:'UnknownError');return json({error:'Asset update unavailable',code:'assets_unavailable'},503)}
}
