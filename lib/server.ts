import {createHash} from 'node:crypto';
import {relayConfigured,relaySnapshot,relayCatalog} from './relay';
import {baselineCatalogForWorkspace} from './workspace-catalog';
import {db} from './database';
import type {Cue} from './player';
import {SNAPSHOT_STATE_SQL,newestPayloadCache,resolvePayload,type PayloadCache} from './snapshot-payload-cache';
export type AliasCatalogCue=Cue&{hidden?:boolean;aliasOf?:string};
export {db};
export function authorized(request:Request,control=false){const token=request.headers.get('authorization')?.replace(/^Bearer /,'');return !!token&&((!!process.env.CONTROL_KEY&&token===process.env.CONTROL_KEY)||(!control&&!!process.env.OUTPUT_KEY&&token===process.env.OUTPUT_KEY));}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})}
export function mergePublishedCatalog(baseline:readonly AliasCatalogCue[],published:readonly Cue[]){
 const declarations=new Map(baseline.map(cue=>[cue.id,cue]));
 const active=new Map<string,AliasCatalogCue>(baseline.map(cue=>[cue.id,cue]));
 for(const cue of published)active.set(cue.id,cue);
 const resolved=new Map<string,AliasCatalogCue>();
 const resolve=(id:string,visiting:Set<string>):AliasCatalogCue|undefined=>{
  if(resolved.has(id))return resolved.get(id);
  const current=active.get(id);
  if(!current)return undefined;
  const declaration=declarations.get(id);
  if(!declaration?.hidden||!declaration.aliasOf){resolved.set(id,current);return current}
  if(visiting.has(id))return {...current,id:declaration.id,name:declaration.name,hidden:true,aliasOf:declaration.aliasOf};
  visiting.add(id);
  const target=resolve(declaration.aliasOf,visiting);
  visiting.delete(id);
  const alias={...(target??current),id:declaration.id,name:declaration.name,hidden:true,aliasOf:declaration.aliasOf};
  resolved.set(id,alias);
  return alias;
 };
 return Array.from(active.keys(),id=>resolve(id,new Set())!);
}
export async function catalog(){return relayConfigured()?relayCatalog():authoringCatalog()}
/**
 * D10 - the authoring catalog is the published library plus the names panels of every
 * non-archived service that has a list. `syncLiveCatalog` pushes exactly this object to
 * the relay, so names reach the live library by the one existing path and `/api/health`'s
 * live-versus-authoring comparison keeps agreeing. Names are never written to
 * `authoring_drafts`, `authoring_previews` or `authoring_revisions`, and never appear in
 * `publishedCues()`; clearing a list removes its panels from the very next read.
 */
export function composeAuthoringCatalog(baseline:readonly AliasCatalogCue[],published:readonly Cue[],names:readonly Cue[]=[]){
 const items=[...mergePublishedCatalog(baseline,published),...names];
 return {cues:items,version:createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0,16)};
}
// A signature cache in the shape of `publishedCache`: the collection rows carry their own
// optimistic version, so `id:version` over the lists in play is an exact change marker and
// the panel cues are rebuilt only when one of them actually moves.
let namesCache:{signature:string;value:Cue[]}|undefined;
export async function serviceNamesCues():Promise<Cue[]>{
 const [{defaultServicesRepository},{namesPanelCues,namesPanelMotion}]=await Promise.all([import('./service-collections'),import('./names-list')]);
 const lists=(await defaultServicesRepository().listCollections(false)).filter(collection=>!collection.archived&&collection.names);
 const signature=lists.map(collection=>`${collection.id}:${collection.version}`).join(',');
 if(namesCache?.signature===signature)return namesCache.value;
 const baseline=baselineCatalogForWorkspace() as Cue[];
 const value=lists.flatMap(collection=>namesPanelCues(collection.id,collection.names!,namesPanelMotion(baseline,collection.names!.layout)));
 namesCache={signature,value};
 return value;
}
export async function authoringCatalog(){const {publishedCues}=await import('./authoring');const [published,names]=await Promise.all([publishedCues(),serviceNamesCues()]);return composeAuthoringCatalog(baselineCatalogForWorkspace() as AliasCatalogCue[],published,names)}
export async function knownCue(id:unknown){return typeof id==='string'&&(await catalog()).cues.some(c=>c.id===id)}
export const cues=baselineCatalogForWorkspace();
let payloadCache:PayloadCache|null=null;
export async function snapshot(){return relayConfigured()?relaySnapshot():legacySnapshot()}
export async function legacySnapshot(){const captured=payloadCache;const state=(await db.query(SNAPSHOT_STATE_SQL,[captured?.revision??-1])).rows[0]??{revision:0,cue:null,mode:'animate',updated:0,cuePayload:null};const resolved=resolvePayload(captured,state);payloadCache=newestPayloadCache(payloadCache,resolved.candidate);const [rs,currentCatalog]=await Promise.all([db.query('SELECT id,revision,cue,phase,seen FROM renderers WHERE seen>$1 ORDER BY seen DESC',[Date.now()-8000]),authoringCatalog()]);return {...state,cuePayload:resolved.payload,catalogVersion:currentCatalog.version,renderers:rs.rows,serverTime:Date.now()}}

/**
 * D15/D16 — the payload behind `GET /api/now`, and nothing else. The response carries a
 * liturgical position and a timestamp: no cue name, no title, no text, no revision, no
 * renderer or controller presence, no catalog version. A names panel, a custom graphic or
 * a cleared output all answer all-nulls with a live `updatedAt`, so the public endpoint
 * cannot name a person or a graphic.
 *
 * The memo is the reason a burst of cold edge PoPs cannot fan out into the relay: within
 * `PUBLIC_NOW_MEMO_MS` every caller shares one in-flight read, and a failed read is never
 * remembered (so a 503 is not cached in process any more than it is at the edge).
 */
export type PublicNow={unitId:string|null;momentId:string|null;book:string|null;folio:number|null;updatedAt:number;pollSeconds:number};
export type PublicNowDeps={snapshot:()=>Promise<{cue?:unknown;updated?:unknown}>;catalog:()=>Promise<{cues:readonly Cue[]}>};
export const PUBLIC_NOW_POLL_SECONDS=5;
export const PUBLIC_NOW_MEMO_MS=2000;
let publicNowMemo:{at:number;value:Promise<PublicNow>}|null=null;
export function resetPublicNowMemo(){publicNowMemo=null}
async function readPublicNow(deps:PublicNowDeps,now:number):Promise<PublicNow>{
 const {liturgyForCue,NO_LITURGY}=await import('./liturgy-index');
 const [state,current]=await Promise.all([deps.snapshot(),deps.catalog()]);
 const id=typeof state?.cue==='string'?state.cue:null;
 const live=id?current.cues.find(cue=>cue.id===id):undefined;
 const reference=live?liturgyForCue(live as {authoring?:{sourceIds?:string[]}}):{...NO_LITURGY};
 const updated=typeof state?.updated==='number'&&Number.isFinite(state.updated)&&state.updated>0?state.updated:now;
 return {...reference,updatedAt:updated,pollSeconds:PUBLIC_NOW_POLL_SECONDS};
}
export function publicNow(deps:PublicNowDeps={snapshot,catalog:authoringCatalog},now=Date.now()):Promise<PublicNow>{
 if(publicNowMemo&&now-publicNowMemo.at<PUBLIC_NOW_MEMO_MS&&now>=publicNowMemo.at)return publicNowMemo.value;
 const value=readPublicNow(deps,now);
 publicNowMemo={at:now,value};
 value.catch(()=>{if(publicNowMemo?.value===value)publicNowMemo=null});
 return value;
}
