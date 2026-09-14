import {authorizeRequest,sameSiteWrite} from '@/lib/access';
import {HistoryError,HISTORY_UNAVAILABLE,clearServiceHistory,readServiceHistory} from '@/lib/service-history';

/**
 * The cue log. `GET /api/history?since=&until=&after=` answers an authoring member or a
 * `history_reader` credential with what this congregation's output actually did: graphics and
 * liturgical positions, never people. No CORS headers, so no browser on another site reads it;
 * centralreform.live holds its credential server-side, as this workspace holds its
 * `setlist_reader` there. `POST {action:'clear'}` is the administrator's clear-history, and the
 * only other thing this route does.
 */
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const HISTORY_REQUIRED='Sign in as an editor or an administrator, or use a service-history credential.';
const OWNER_REQUIRED='Administrator access required';

export async function GET(request:Request){
 let reader;try{reader=await authorizeRequest(request,'history')}catch{return reply({error:HISTORY_UNAVAILABLE},503)}
 if(!reader)return reply({error:HISTORY_REQUIRED},401);
 const parameters=new URL(request.url).searchParams;
 try{
  return reply(await readServiceHistory({since:parameters.get('since'),until:parameters.get('until'),after:parameters.get('after'),limit:parameters.get('limit')}));
 }catch(error){
  if(error instanceof HistoryError)return reply({error:error.message},error.status);
  return reply({error:HISTORY_UNAVAILABLE},503);
 }
}

export async function POST(request:Request){
 if(!sameSiteWrite(request))return reply({error:'Open this action from the same website.'},403);
 let input:unknown;
 try{input=await request.json()}catch{return reply({error:'Invalid request'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input)||(input as Record<string,unknown>).action!=='clear')return reply({error:'Unknown action'},400);
 let user;try{user=await authorizeRequest(request,'owner')}catch{return reply({error:HISTORY_UNAVAILABLE},503)}
 if(!user)return reply({error:OWNER_REQUIRED},401);
 try{
  return reply({ok:true,...await clearServiceHistory()});
 }catch(error){
  if(error instanceof HistoryError)return reply({error:error.message},error.status);
  return reply({error:HISTORY_UNAVAILABLE},503);
 }
}
