import {authorizeRequest,canAccess} from '@/lib/access';
import {feedbackCsv,ServicesError,servicesOperation,servicesPermission} from '@/lib/service-collections';
import {json} from '@/lib/server';

async function body(request:Request){
 const reader=request.body?.getReader(),decoder=new TextDecoder();let raw='',bytes=0;
 if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072){await reader.cancel();throw new ServicesError('request_too_large','Request is too large',413)}raw+=decoder.decode(value,{stream:true})}
 raw+=decoder.decode();let parsed:unknown;try{parsed=JSON.parse(raw)}catch{throw new ServicesError('invalid_json','Body must be valid JSON')}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new ServicesError('invalid_input','Body must be an object');
 const value=parsed as Record<string,unknown>,extra=Object.keys(value).filter(k=>!['operation','input'].includes(k));
 if(extra.length)throw new ServicesError('invalid_input',`Body contains unsupported fields: ${extra.join(', ')}`);
 if(typeof value.operation!=='string'||!value.operation)throw new ServicesError('invalid_input','operation is required');
 return {operation:value.operation,input:value.input??{}};
}

export async function GET(request:Request){
 try{
  const actor=await authorizeRequest(request,'read');if(!actor)return json({error:'Unauthorized'},401);
  const url=new URL(request.url);if(url.searchParams.get('export')!=='feedback.csv')return json({error:'Not found'},404);
  const csv=await feedbackCsv();
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="overlay-beta-feedback.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.error('Services export failed',error instanceof Error?error.name:'UnknownError');return json({error:'Services unavailable',code:'services_unavailable'},503)}
}

export async function POST(request:Request){
 try{
  const payload=await body(request);const permission=servicesPermission(payload.operation);
  const actor=await authorizeRequest(request,permission);if(!actor)return json({error:'Unauthorized'},401);
  const result=await servicesOperation(payload.operation,payload.input,actor.id);
  return json({...result,permissions:{editCollections:canAccess(actor.role,'author'),recordFeedback:canAccess(actor.role,'control'),editFeedback:canAccess(actor.role,'author')}});
 }catch(error){if(error instanceof ServicesError)return json({error:error.message,code:error.code},error.status);console.error('Services operation failed',error instanceof Error?error.name:'UnknownError');return json({error:'Services unavailable',code:'services_unavailable'},503)}
}
