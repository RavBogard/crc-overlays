import {createHash} from 'node:crypto';
import {relayConfigured,relaySnapshot,relayCatalog} from './relay';
import cues from './cues.json';
import {db} from './database';
import {publishedCues} from './authoring';
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
export async function authoringCatalog(){const items=mergePublishedCatalog(cues as unknown as AliasCatalogCue[],await publishedCues());return {cues:items,version:createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0,16)}}
export async function knownCue(id:unknown){return typeof id==='string'&&(await catalog()).cues.some(c=>c.id===id)}
export {cues};
let payloadCache:PayloadCache|null=null;
export async function snapshot(){return relayConfigured()?relaySnapshot():legacySnapshot()}
export async function legacySnapshot(){const captured=payloadCache;const state=(await db.query(SNAPSHOT_STATE_SQL,[captured?.revision??-1])).rows[0]??{revision:0,cue:null,mode:'animate',updated:0,cuePayload:null};const resolved=resolvePayload(captured,state);payloadCache=newestPayloadCache(payloadCache,resolved.candidate);const [rs,currentCatalog]=await Promise.all([db.query('SELECT id,revision,cue,phase,seen FROM renderers WHERE seen>$1 ORDER BY seen DESC',[Date.now()-8000]),authoringCatalog()]);return {...state,cuePayload:resolved.payload,catalogVersion:currentCatalog.version,renderers:rs.rows,serverTime:Date.now()}}
