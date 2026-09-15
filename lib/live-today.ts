/**
 * R4-f — Ruling 5's Overlays half. `today.json` is the metadata-only file centralreform.live
 * emits when a setlist is saved: service name, setlist id, start time, book slug, stream URL.
 * It is public and carries no text and no bytes, so this module sends no credential, and the
 * file is the only thing on centralreform.live this repo reads without one.
 *
 * What it is for: when Michael opens Prepared services, the service that is about to happen is
 * *suggested* — highlighted, one tap to import — and never loaded for him. That is R2-g's
 * picker-first rule applied to Overlays: a suggestion may reorder and mark, never choose.
 *
 * Everything here fails silently. A 404, an empty `services`, a malformed body, a slow answer
 * or no network all produce `null`, and the panel then behaves exactly as it did before this
 * existed. A suggestion is a convenience; its absence must never be an error an operator reads.
 */

export const TODAY_URL='https://www.centralreform.live/today.json';

export type TodayService={setlistId:string;name:string;serviceType:string|null;startsAt:string;startsAtMs:number};

/** `today.json` is five services with a few fields each; anything larger is not our file. */
const MAX_TODAY_BYTES=64*1024;
const TODAY_TIMEOUT_MS=3000;
/** The panel lists a handful of services; a file naming hundreds is not one we will read. */
const MAX_TODAY_SERVICES=50;

const str=(value:unknown):string|null=>typeof value==='string'&&value.trim()?value.trim():null;

/**
 * The rows of a `today.json` body that carry an identity and a start time. Unknown fields
 * (`book`, `readerBook`, `startFolio`, `rabbi`, `stream`) are ignored on purpose: the
 * suggestion is keyed on `setlistId` alone, and nothing here depends on the reader's vocabulary.
 */
export function parseToday(payload:unknown):TodayService[]{
 const body=(payload??null) as {services?:unknown}|null;
 if(!body||typeof body!=='object'||Array.isArray(body))return [];
 const rows=Array.isArray(body.services)?body.services:[];
 const services:TodayService[]=[];
 for(const raw of rows.slice(0,MAX_TODAY_SERVICES)){
  const row=(raw??{}) as Record<string,unknown>;
  const setlistId=str(row.setlistId),startsAt=str(row.startsAt);
  if(!setlistId||!startsAt)continue;
  const startsAtMs=Date.parse(startsAt);
  if(Number.isNaN(startsAtMs))continue;
  services.push({setlistId,name:str(row.name)??'(untitled)',serviceType:str(row.serviceType),startsAt,startsAtMs});
 }
 return services;
}

/**
 * The service nearest now, by absolute distance from its start. A tie means one service is as
 * far behind as another is ahead — Yizkor at 17:00 and Neilah at 18:00 seen at 17:30 — and the
 * one still to come wins, because a service about to start is the one an operator is opening
 * Prepared services for.
 */
export function nearestService(services:TodayService[],now:number):TodayService|null{
 let best:TodayService|null=null,bestDistance=Number.POSITIVE_INFINITY;
 for(const service of services){
  const distance=Math.abs(service.startsAtMs-now);
  if(distance<bestDistance||(distance===bestDistance&&best&&service.startsAtMs>best.startsAtMs)){best=service;bestDistance=distance}
 }
 return best;
}

async function boundedText(response:Response):Promise<string>{
 const reader=response.body?.getReader();
 if(!reader)return response.text();
 const decoder=new TextDecoder();let raw='',bytes=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  bytes+=value.byteLength;
  if(bytes>MAX_TODAY_BYTES){await reader.cancel();throw new Error('today.json is larger than this read will take')}
  raw+=decoder.decode(value,{stream:true});
 }
 return raw+decoder.decode();
}

/**
 * Read `today.json`. No Authorization header, `redirect:'error'` so the request cannot be led
 * anywhere else, `cache:'no-store'` because a stale file would suggest a service that has
 * already happened, a 3 s deadline and a 64 KB cap. Any failure is an empty list.
 */
export async function fetchTodayServices(fetchImpl:typeof fetch=globalThis.fetch,url=TODAY_URL):Promise<TodayService[]>{
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(TODAY_TIMEOUT_MS),headers:{Accept:'application/json'}});
  if(!response.ok)return [];
  return parseToday(JSON.parse(await boundedText(response)) as unknown);
 }catch{return []}
}

/** The one service to highlight, or `null` — which is also every failure. */
export async function todaySuggestion(now:number,fetchImpl:typeof fetch=globalThis.fetch,url=TODAY_URL):Promise<TodayService|null>{
 return nearestService(await fetchTodayServices(fetchImpl,url),now);
}
