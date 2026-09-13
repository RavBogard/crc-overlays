import {authorizeRequest} from '@/lib/access';
import {AuthoringError} from '@/lib/authoring-model';
import {sourceReviewOperation} from '@/lib/source-review';
import {json} from '@/lib/server';

export async function POST(request:Request){
 try{
  const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
  const reader=request.body?.getReader(),decoder=new TextDecoder();let raw='',bytes=0;if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072){await reader.cancel();return json({error:'Request is too large',code:'request_too_large'},413)}raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode();
  const body=JSON.parse(raw) as unknown;if(!body||typeof body!=='object'||Array.isArray(body))throw new AuthoringError('invalid_input','Body must be an object');
  const data=body as Record<string,unknown>,extra=Object.keys(data).filter(key=>!['operation','input'].includes(key));if(extra.length)throw new AuthoringError('invalid_input',`Body contains unsupported fields: ${extra.join(', ')}`);if(typeof data.operation!=='string'||!data.operation)throw new AuthoringError('invalid_input','operation is required');
  return json(await sourceReviewOperation(data.operation,data.input??{},actor.id));
 }catch(error){if(error instanceof SyntaxError)return json({error:'Body must be valid JSON',code:'invalid_json'},400);if(error instanceof AuthoringError)return json({error:error.message,code:error.code},error.status);console.error('Source review operation failed');return json({error:'Source review service unavailable',code:'source_review_unavailable'},503)}
}
