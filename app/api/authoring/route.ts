import {AuthoringError} from '@/lib/authoring-model';
import {authoringOperation} from '@/lib/authoring';
import {authorized,json} from '@/lib/server';

export async function POST(request:Request){
 if(!authorized(request,true))return json({error:'Unauthorized'},401);
 try{
  const reader=request.body?.getReader();const decoder=new TextDecoder();let raw='';let bytes=0;
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072){await reader.cancel();return json({error:'Request is too large',code:'request_too_large'},413)}raw+=decoder.decode(value,{stream:true})}
  raw+=decoder.decode();let body:unknown;try{body=JSON.parse(raw)}catch{throw new AuthoringError('invalid_json','Body must be valid JSON')}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new AuthoringError('invalid_input','Body must be an object');
  const input=body as Record<string,unknown>;const extra=Object.keys(input).filter(key=>!['operation','input'].includes(key));
  if(extra.length)throw new AuthoringError('invalid_input',`Body contains unsupported fields: ${extra.join(', ')}`);
  if(typeof input.operation!=='string'||!input.operation)throw new AuthoringError('invalid_input','operation is required');
  return json(await authoringOperation(input.operation,input.input??{},'web-control'));
 }catch(error){
  if(error instanceof AuthoringError)return json({error:error.message,code:error.code},error.status);
  console.error('Authoring operation failed');return json({error:'Authoring service unavailable',code:'authoring_unavailable'},503);
 }
}
