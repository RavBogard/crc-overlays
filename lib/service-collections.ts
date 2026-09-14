import {randomUUID} from 'node:crypto';
import {db} from './database';
import {liveRelayConfigured} from './rehearsal';
import type {AccessPermission} from './access';
import {friendlyCueName} from './cue-search';
import {sourcePack} from './authoring-model';
import {sourceDisplay} from './source-library';
import {authoringCatalog} from './server';
import {liturgyForCue} from './liturgy-index';
import {createLiveTransport,importSetlist as importLiveSetlist,listRecentSetlists,liveSetlistsAvailability,type LiveSetlistsEnv,type LiveSetlistTransport} from './live-setlists';
import {isNamesCueId,namesPages,panelName,parseNames,ServicesError,type NamesList} from './names-list';
import type {Cue} from './player';

export type CollectionEntryType='cue'|'alternates'|'multipart';
export type CoverageStatus='covered'|'needs-cue'|'needs-review'|'intentional-fallback'|'not-needed';
export type FeedbackKind='issue'|'fallback'|'observation';
export type FeedbackImpact='none'|'minor'|'service-affecting';
export type CollectionEntry={id:string;type:CollectionEntryType;label:string;cueIds:string[]};
export type CoverageItem={id:string;label:string;status:CoverageStatus;cueId?:string;sourceId?:string;owner?:string;reason?:string};
// D9 - a names list is per-service data on the collection document. It is never written
// to the published catalog, and archiving a collection nulls it in the same optimistic write.
export type ServiceCollection={id:string;name:string;service:string;version:number;archived:boolean;entries:CollectionEntry[];coverage:CoverageItem[];names?:NamesList|null;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string};
export type BetaFeedback={id:string;version:number;collectionId?:string;kind:FeedbackKind;cueId?:string;context:string;reason:string;impact:FeedbackImpact;productGap:boolean;archived:boolean;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string};

// Declared in lib/names-list.ts (the leaf module) and re-exported here under the name every
// caller already imports, so the pure names helpers stay free of this module's Postgres import.
export {ServicesError};
export class ServicesConflictError extends ServicesError{constructor(){super('version_conflict','This item changed in another session. Refresh and try again.',409)}}

export interface ServicesRepository{
 listCollections(includeArchived?:boolean):Promise<ServiceCollection[]>;
 insertCollection(value:ServiceCollection):Promise<void>;
 replaceCollection(value:ServiceCollection,expectedVersion:number):Promise<boolean>;
 listFeedback(includeArchived?:boolean):Promise<BetaFeedback[]>;
 insertFeedback(value:BetaFeedback):Promise<void>;
 replaceFeedback(value:BetaFeedback,expectedVersion:number):Promise<boolean>;
}

const clone=<T>(value:T):T=>structuredClone(value);
export class MemoryServicesRepository implements ServicesRepository{
 collections=new Map<string,ServiceCollection>();feedback=new Map<string,BetaFeedback>();
 async listCollections(includeArchived=false){return [...this.collections.values()].filter(x=>includeArchived||!x.archived).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,500).map(clone)}
 async insertCollection(value:ServiceCollection){if(this.collections.has(value.id))throw new Error('duplicate');this.collections.set(value.id,clone(value))}
 async replaceCollection(value:ServiceCollection,expectedVersion:number){const current=this.collections.get(value.id);if(!current||current.version!==expectedVersion)return false;this.collections.set(value.id,clone(value));return true}
 async listFeedback(includeArchived=false){return [...this.feedback.values()].filter(x=>includeArchived||!x.archived).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,5000).map(clone)}
 async insertFeedback(value:BetaFeedback){if(this.feedback.has(value.id))throw new Error('duplicate');this.feedback.set(value.id,clone(value))}
 async replaceFeedback(value:BetaFeedback,expectedVersion:number){const current=this.feedback.get(value.id);if(!current||current.version!==expectedVersion)return false;this.feedback.set(value.id,clone(value));return true}
}

type Queryable={query:(text:string,values?:unknown[])=>Promise<{rows:unknown[];rowCount:number|null}>};
export class PgServicesRepository implements ServicesRepository{
 constructor(private connection:Queryable=db){}
 async listCollections(includeArchived=false){const r=await this.connection.query('SELECT document FROM service_collections WHERE ($1 OR archived=false) ORDER BY updated_at DESC LIMIT 500',[includeArchived]);return r.rows.map(row=>(row as {document:ServiceCollection}).document)}
 async insertCollection(value:ServiceCollection){await this.connection.query('INSERT INTO service_collections(id,document,version,archived,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[value.id,value,value.version,value.archived,value.createdAt,value.updatedAt,value.createdBy,value.updatedBy])}
 async replaceCollection(value:ServiceCollection,expectedVersion:number){const r=await this.connection.query('UPDATE service_collections SET document=$2,version=$3,archived=$4,updated_at=$5,updated_by=$6 WHERE id=$1 AND version=$7',[value.id,value,value.version,value.archived,value.updatedAt,value.updatedBy,expectedVersion]);return Boolean(r.rowCount)}
 async listFeedback(includeArchived=false){const r=await this.connection.query('SELECT document FROM beta_feedback WHERE ($1 OR archived=false) ORDER BY updated_at DESC LIMIT 5000',[includeArchived]);return r.rows.map(row=>(row as {document:BetaFeedback}).document)}
 async insertFeedback(value:BetaFeedback){await this.connection.query('INSERT INTO beta_feedback(id,document,version,archived,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[value.id,value,value.version,value.archived,value.createdAt,value.updatedAt,value.createdBy,value.updatedBy])}
 async replaceFeedback(value:BetaFeedback,expectedVersion:number){const r=await this.connection.query('UPDATE beta_feedback SET document=$2,version=$3,archived=$4,updated_at=$5,updated_by=$6 WHERE id=$1 AND version=$7',[value.id,value,value.version,value.archived,value.updatedAt,value.updatedBy,expectedVersion]);return Boolean(r.rowCount)}
}

const rehearsalRepository=new MemoryServicesRepository();
export function defaultServicesRepository():ServicesRepository{
 if(process.env.CRC_AUTHORING_REHEARSAL==='1'){
  if(process.env.NODE_ENV!=='development'||liveRelayConfigured())throw new Error('Services rehearsal storage is allowed only in local development without a relay.');
  return rehearsalRepository;
 }
 return new PgServicesRepository();
}

type CatalogItem={id:string;name:string;title?:string;hidden?:boolean;layout?:string};
type SourceItem={id:string;name:string;book?:string;service?:string;section?:string|number;origin?:string;blocks?:unknown[];metadata?:Record<string,unknown>&{bookTitle?:string}};
// `liveCue` reads the live state through the one existing snapshot path. It is a read: a
// services write never issues a live command, so taking a graphic off air stays the
// operator's deliberate act on Live control or Companion.
export type ServicesLoaders={catalog:()=>Promise<{cues:CatalogItem[];version:string}>;sources:()=>SourceItem[];now:()=>number;id:()=>string;liveCue:()=>Promise<string|null>};
const defaultLiveCue=async():Promise<string|null>=>{try{const {snapshot}=await import('./server');const state=await snapshot() as {cue?:unknown};return typeof state.cue==='string'?state.cue:null}catch{return null}};
const defaultLoaders:ServicesLoaders={catalog:authoringCatalog,sources:()=>sourcePack.sources as SourceItem[],now:Date.now,id:randomUUID,liveCue:defaultLiveCue};

function object(value:unknown,label:string){if(!value||typeof value!=='object'||Array.isArray(value))throw new ServicesError('invalid_input',`${label} must be an object`);return value as Record<string,unknown>}
function only(value:Record<string,unknown>,keys:string[],label:string){const extra=Object.keys(value).filter(k=>!keys.includes(k));if(extra.length)throw new ServicesError('invalid_input',`${label} contains unsupported fields: ${extra.join(', ')}`)}
function text(value:unknown,label:string,max:number,optional=false){if(optional&&(value===undefined||value===''))return undefined;if(typeof value!=='string'||!value.trim()||value.length>max)throw new ServicesError('invalid_input',`${label} must be 1-${max} characters`);return value.trim()}
function bool(value:unknown,label:string){if(typeof value!=='boolean')throw new ServicesError('invalid_input',`${label} must be true or false`);return value}
function version(value:unknown){if(!Number.isInteger(value)||(value as number)<1)throw new ServicesError('invalid_input','expectedVersion must be a positive integer');return value as number}
function oneOf<T extends string>(value:unknown,allowed:readonly T[],label:string):T{if(typeof value!=='string'||!allowed.includes(value as T))throw new ServicesError('invalid_input',`${label} must be one of: ${allowed.join(', ')}`);return value as T}

function parseEntries(value:unknown,catalog:Set<string>,previous:CollectionEntry[]=[]):CollectionEntry[]{
 if(!Array.isArray(value)||value.length>200)throw new ServicesError('invalid_input','entries must be an array with at most 200 items');
 const entryIds=new Set<string>(),previousById=new Map(previous.map(entry=>[entry.id,new Set(entry.cueIds)]));
 return value.map((raw,index)=>{const item=object(raw,`entries[${index}]`);only(item,['id','type','label','cueIds'],`entries[${index}]`);const id=text(item.id,`entries[${index}].id`,80,true)??randomUUID();if(entryIds.has(id))throw new ServicesError('duplicate_entry',`Entry ID appears more than once: ${id}`);entryIds.add(id);const type=oneOf(item.type,['cue','alternates','multipart'] as const,`entries[${index}].type`);if(!Array.isArray(item.cueIds))throw new ServicesError('invalid_input',`entries[${index}].cueIds must be an array`);const cueIds=item.cueIds.map((cue,j)=>text(cue,`entries[${index}].cueIds[${j}]`,160)!);if(type==='cue'&&cueIds.length!==1)throw new ServicesError('invalid_input','A cue entry must contain exactly one cue');if(type!=='cue'&&(cueIds.length<2||cueIds.length>30))throw new ServicesError('invalid_input','Alternates and multipart entries must contain 2-30 cues');if(new Set(cueIds).size!==cueIds.length)throw new ServicesError('duplicate_cue','A cue may appear only once within the same group');for(const cueId of cueIds)if(!catalog.has(cueId)&&!previousById.get(id)?.has(cueId))throw new ServicesError('unknown_cue',`Published cue is unavailable: ${cueId}`,404);return {id,type,label:text(item.label,`entries[${index}].label`,160)!,cueIds}});
}
function parseCoverage(value:unknown,catalog:Set<string>,sources:Set<string>,previous:CoverageItem[]=[]):CoverageItem[]{
 if(!Array.isArray(value)||value.length>300)throw new ServicesError('invalid_input','coverage must be an array with at most 300 items');
 const previousById=new Map(previous.map(row=>[row.id,row])),ids=new Set<string>();
 return value.map((raw,index)=>{const item=object(raw,`coverage[${index}]`);only(item,['id','label','status','cueId','sourceId','owner','reason'],`coverage[${index}]`);const id=text(item.id,`coverage[${index}].id`,80,true)??randomUUID(),prior=previousById.get(id);if(ids.has(id))throw new ServicesError('duplicate_coverage',`Coverage ID appears more than once: ${id}`);ids.add(id);const status=oneOf(item.status,['covered','needs-cue','needs-review','intentional-fallback','not-needed'] as const,`coverage[${index}].status`);const cueId=text(item.cueId,`coverage[${index}].cueId`,160,true);const sourceId=text(item.sourceId,`coverage[${index}].sourceId`,220,true);const owner=text(item.owner,`coverage[${index}].owner`,120,true);const reason=text(item.reason,`coverage[${index}].reason`,500,true);if(cueId&&!catalog.has(cueId)&&prior?.cueId!==cueId)throw new ServicesError('unknown_cue',`Published cue is unavailable: ${cueId}`,404);if(sourceId&&!sources.has(sourceId)&&prior?.sourceId!==sourceId)throw new ServicesError('unknown_source',`Source is unavailable: ${sourceId}`,404);if(status==='covered'&&!cueId)throw new ServicesError('invalid_coverage','Covered items require a published cue');if(['needs-cue','needs-review','intentional-fallback'].includes(status)&&(!owner||!reason))throw new ServicesError('invalid_coverage','Unresolved and fallback items require an owner and reason');if(status==='not-needed'&&!reason)throw new ServicesError('invalid_coverage','Not-needed items require a reason');return {id,label:text(item.label,`coverage[${index}].label`,160)!,status,cueId,sourceId,owner,reason}});
}

function enrichCollection(value:ServiceCollection,catalog:CatalogItem[],sources:SourceItem[]){
 const cues=new Map(catalog.map(c=>[c.id,c])),sourceMap=new Map(sources.map(s=>[s.id,s]));
 return {...value,entries:value.entries.map(e=>({...e,cues:e.cueIds.map(id=>({id,name:cues.get(id)?friendlyCueName(cues.get(id)!.name):id,available:cues.has(id)})),available:e.cueIds.every(id=>cues.has(id))})),coverage:value.coverage.map(row=>{const cue= row.cueId?cues.get(row.cueId):undefined;const source=row.sourceId?sourceMap.get(row.sourceId):undefined;const cueAvailable=!row.cueId||Boolean(cue),sourceAvailable=!row.sourceId||Boolean(source);const computedStatus=row.status==='covered'&&!cue?'needs-review':row.status;return {...row,cueAvailable,sourceAvailable,computedStatus,cueName:cue?friendlyCueName(cue.name):undefined,sourceName:source?.name,degraded:computedStatus!==row.status||!cueAvailable||!sourceAvailable}})};
}

/**
 * D19 — the one seam G1's two operations reach the outside world through. A test replaces
 * `createTransport` with a spy and asserts it is never constructed when the credential is
 * missing; nothing else in this module knows the network exists.
 */
export const liveSetlistDependencies:{
 availability:(env?:LiveSetlistsEnv)=>{available:boolean;reason:'ok'|'unconfigured'};
 createTransport:(env?:LiveSetlistsEnv)=>LiveSetlistTransport;
 listRecentSetlists:typeof listRecentSetlists;
 importSetlist:typeof importLiveSetlist;
 liturgyFor:(cue:Cue)=>ReturnType<typeof liturgyForCue>;
}={
 availability:(env=process.env)=>liveSetlistsAvailability(env),
 createTransport:(env=process.env)=>createLiveTransport(env),
 listRecentSetlists,
 importSetlist:importLiveSetlist,
 liturgyFor:cue=>liturgyForCue(cue as {authoring?:{sourceIds?:string[]}}),
};

const UNCONFIGURED_MESSAGE='Importing from centralreform.live is not set up for this congregation.';
const LIVE_UNAVAILABLE_MESSAGE='centralreform.live did not answer. Try again in a minute.';

/** The service field an imported collection gets when the caller names none: "Friday, September 18". */
function serviceLabel(setlist:{name:string;date:string|null;eventDate:string|null}):string{
 const iso=setlist.eventDate??setlist.date;
 if(iso){const stamp=Date.parse(iso);if(!Number.isNaN(stamp))return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(stamp))}
 return setlist.name;
}

export class ServicesManager{
 constructor(private repository:ServicesRepository=defaultServicesRepository(),private loaders:ServicesLoaders=defaultLoaders){}
 /**
  * The evidence every collection operation is built from. Names panels are excluded on
  * purpose: a names list belongs to exactly one service and is materialized into the live
  * catalog only, so it must never be offered as library evidence, copied into another
  * service by Create from library, or accepted as an entry or coverage cue id. Excluding it
  * here is what makes `parseEntries`/`parseCoverage` refuse a `names:` id with the unknown
  * cue refusal they already have.
  */
 private async evidence(){const [catalog,sources]=await Promise.all([this.loaders.catalog(),Promise.resolve(this.loaders.sources())]);const cues=catalog.cues.filter(c=>!c.hidden&&!isNamesCueId(c.id));return {catalog:{...catalog,cues},sources};}
 /**
  * The published name of this collection's names panel if one of its panels is the live
  * graphic, otherwise null. Derived from the list itself rather than the catalog, because
  * `evidence()` deliberately no longer carries names cues.
  */
 private async namesPanelOnAir(collection:ServiceCollection):Promise<string|null>{
  if(!collection.names)return null;
  const prefix=`names:${collection.id}:`;
  let live:string|null=null;try{live=await this.loaders.liveCue()}catch{return null}
  if(typeof live!=='string'||!live.startsWith(prefix))return null;
  const index=Number(live.slice(prefix.length)),total=namesPages(collection.names).length;
  return Number.isInteger(index)&&index>=1&&index<=total?panelName(collection.names.title,index-1,total):live;
 }
 // Removing or archiving a list would take its panels out of the catalog while the relay is
 // still holding one on air, leaving a graphic on screen that nothing can clear by name. The
 // write is refused instead; the operator clears the output, which is a live command only
 // they issue.
 private async refuseWhileOnAir(collection:ServiceCollection){
  const panel=await this.namesPanelOnAir(collection);
  if(panel)throw new ServicesError('names_on_air',`Take ${panel} off air first — Clear now on Live control — then remove the names.`,409);
 }
 async dashboard(raw:unknown={}){const input=object(raw,'input');only(input,['includeArchived'],'input');const includeArchived=input.includeArchived===undefined?false:bool(input.includeArchived,'includeArchived');const [{catalog,sources},collections,feedback]=await Promise.all([this.evidence(),this.repository.listCollections(includeArchived),this.repository.listFeedback(includeArchived)]);return {catalog:{...catalog,cues:catalog.cues.map(cue=>({...cue,name:friendlyCueName(cue.name)}))},collections:collections.map(c=>enrichCollection(c,catalog.cues,sources)),feedback:feedback.slice(0,200)};}
 async searchSources(raw:unknown){const input=object(raw,'input');only(input,['query','limit'], 'input');const query=(text(input.query,'query',160,true)??'').toLocaleLowerCase().normalize('NFKD').replace(/[\u0591-\u05c7]/g,'');const limit=input.limit===undefined?40:version(input.limit);if(limit>100)throw new ServicesError('invalid_input','limit must be at most 100');const results:SourceItem[]=[],seen=new Set<string>();for(const source of this.loaders.sources()){const blocks=source.blocks??[],nonPlanning=/rubric|how to use/i.test(source.name)||/(^|:)frontmatter[.@]/i.test(source.id),hasUsable=blocks.some(block=>!block||typeof block!=='object'||(block as {noteLike?:boolean}).noteLike!==true);if(!blocks.length||nonPlanning||!hasUsable)continue;if(query&&![source.name,source.book,source.metadata?.bookTitle,source.service,source.section,source.id].some(value=>value!==undefined&&String(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0591-\u05c7]/g,'').includes(query)))continue;const key=`${source.name.toLocaleLowerCase()}|${(source.service??'').toLocaleLowerCase().replace(/^crc\s+/,'')}`;if(seen.has(key))continue;seen.add(key);results.push(source);if(results.length>=limit)break}return results.map(source=>({id:source.id,name:source.name,book:source.metadata?.bookTitle??source.book,service:source.service,section:source.section,display:sourceDisplay(source)}))}
 async createCollection(raw:unknown,actor:string){const input=object(raw,'input');only(input,['name','service','entries','coverage'],'input');const {catalog,sources}=await this.evidence();const now=this.loaders.now();const value:ServiceCollection={id:this.loaders.id(),name:text(input.name,'name',120)!,service:text(input.service,'service',120)!,version:1,archived:false,entries:parseEntries(input.entries??[],new Set(catalog.cues.map(c=>c.id))),coverage:parseCoverage(input.coverage??[],new Set(catalog.cues.map(c=>c.id)),new Set(sources.map(s=>s.id))),createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor};await this.repository.insertCollection(value);return enrichCollection(value,catalog.cues,sources)}
 async createFromLibrary(raw:unknown,actor:string){
  const input=object(raw,'input');only(input,['name','service'],'input');const name=text(input.name,'name',120)!,service=text(input.service,'service',120)!,{catalog}=await this.evidence();
  const numbered=new Map<string,{count:number;items:{index:number;cue:CatalogItem}[]}>(),used=new Set<string>();
  for(const cue of catalog.cues){const match=cue.name.match(/^(.*?)\s+[—-]\s+(\d{1,3}) of (\d{1,3})$/i);if(!match)continue;const base=match[1].trim(),index=Number(match[2]),count=Number(match[3]);if(count<2||count>30||index<1||index>count)continue;const current=numbered.get(base)??{count,items:[]};if(current.count===count)current.items.push({index,cue});numbered.set(base,current)}
  const grouped=new Map<string,CollectionEntry>();
  for(const [base,group] of numbered){const ordered=[...group.items].sort((a,b)=>a.index-b.index);if(ordered.length===group.count&&ordered.every((item,index)=>item.index===index+1)){const entry={id:this.loaders.id(),type:'multipart' as const,label:base,cueIds:ordered.map(item=>item.cue.id)};grouped.set(ordered[0].cue.id,entry);for(const item of ordered)used.add(item.cue.id)}}
  const entries:CollectionEntry[]=[];for(const cue of catalog.cues){const group=grouped.get(cue.id);if(group)entries.push(group);else if(!used.has(cue.id))entries.push({id:this.loaders.id(),type:'cue',label:friendlyCueName(cue.name),cueIds:[cue.id]})}
  const coverage:CoverageItem[]=catalog.cues.map(cue=>{const label=friendlyCueName(cue.name),partial=/\(partial\)\s*$/i.test(label);return partial?{id:this.loaders.id(),label,status:'needs-review',cueId:cue.id,owner:'Unassigned',reason:'This published graphic is labeled partial; confirm what is covered before relying on it.'}:{id:this.loaders.id(),label,status:'covered',cueId:cue.id,reason:'Included from the current published library.'}});
  return this.createCollection({name,service,entries,coverage},actor);
 }
 /**
  * D19 — the recent services on centralreform.live, or `{available:false}` when this
  * congregation has no credential. The unconfigured answer is deliberately not an error: the
  * `/services` panel asks on mount and renders nothing at all on TBI.
  */
 async listLiveSetlists(raw:unknown){
  const input=object(raw,'input');only(input,[],'input');
  if(!liveSetlistDependencies.availability().available)return {available:false as const};
  try{return {available:true as const,setlists:await liveSetlistDependencies.listRecentSetlists(liveSetlistDependencies.createTransport())}}
  catch{throw new ServicesError('live_unavailable',LIVE_UNAVAILABLE_MESSAGE,503)}
 }
 /**
  * D19 — one setlist becomes one ordinary prepared service through `createCollection`, with a
  * coverage row per performance row. It never publishes and never issues a live command; the
  * rows it could not settle come back in `unmatched` so the operator sees them before relying
  * on any of it.
  */
 async importSetlist(raw:unknown,actor:string){
  const input=object(raw,'input');only(input,['setlistId','name','service'],'input');
  const setlistId=text(input.setlistId,'setlistId',160)!,name=text(input.name,'name',120,true),service=text(input.service,'service',120,true);
  if(!liveSetlistDependencies.availability().available)throw new ServicesError('unconfigured',UNCONFIGURED_MESSAGE,409);
  const {catalog}=await this.evidence();
  let imported;
  try{imported=await liveSetlistDependencies.importSetlist(setlistId,{transport:liveSetlistDependencies.createTransport(),cues:catalog.cues as unknown as Cue[],liturgyFor:liveSetlistDependencies.liturgyFor,id:this.loaders.id})}
  catch(error){if(error instanceof ServicesError)throw error;throw new ServicesError('live_unavailable',LIVE_UNAVAILABLE_MESSAGE,503)}
  const collection=await this.createCollection({name:name??imported.setlist.name,service:service??serviceLabel(imported.setlist),entries:imported.entries,coverage:imported.coverage},actor);
  return {collection,unmatched:imported.unmatched};
 }
 async updateCollection(raw:unknown,actor:string){const input=object(raw,'input');only(input,['id','expectedVersion','name','service','entries','coverage'],'input');const id=text(input.id,'id',80)!,expected=version(input.expectedVersion);const current=(await this.repository.listCollections(true)).find(x=>x.id===id);if(!current)throw new ServicesError('not_found','Collection not found',404);const {catalog,sources}=await this.evidence();const cueSet=new Set(catalog.cues.map(c=>c.id)),sourceSet=new Set(sources.map(s=>s.id));const next:ServiceCollection={...current,name:input.name===undefined?current.name:text(input.name,'name',120)!,service:input.service===undefined?current.service:text(input.service,'service',120)!,entries:input.entries===undefined?current.entries:parseEntries(input.entries,cueSet,current.entries),coverage:input.coverage===undefined?current.coverage:parseCoverage(input.coverage,cueSet,sourceSet,current.coverage),version:expected+1,updatedAt:this.loaders.now(),updatedBy:actor};if(current.version!==expected||!await this.repository.replaceCollection(next,expected))throw new ServicesConflictError();return enrichCollection(next,catalog.cues,sources)}
 async setCollectionArchived(raw:unknown,actor:string,archived:boolean){const input=object(raw,'input');only(input,['id','expectedVersion'],'input');const id=text(input.id,'id',80)!,expected=version(input.expectedVersion),current=(await this.repository.listCollections(true)).find(x=>x.id===id);if(!current)throw new ServicesError('not_found','Collection not found',404);if(archived&&current.names)await this.refuseWhileOnAir(current);const next={...current,archived,...(archived?{names:null}:{}),version:expected+1,updatedAt:this.loaders.now(),updatedBy:actor};if(current.version!==expected||!await this.repository.replaceCollection(next,expected))throw new ServicesConflictError();return next}
 async setNames(raw:unknown,actor:string){const input=object(raw,'input');only(input,['id','expectedVersion','names'],'input');const id=text(input.id,'id',80)!,expected=version(input.expectedVersion);const current=(await this.repository.listCollections(true)).find(x=>x.id===id);if(!current)throw new ServicesError('not_found','Collection not found',404);if(current.archived)throw new ServicesError('collection_archived','Restore this service before adding names.',409);const now=this.loaders.now();const next:ServiceCollection={...current,names:parseNames(input.names,now,actor),version:expected+1,updatedAt:now,updatedBy:actor};if(current.version!==expected||!await this.repository.replaceCollection(next,expected))throw new ServicesConflictError();const {catalog,sources}=await this.evidence();return enrichCollection(next,catalog.cues,sources)}
 async clearNames(raw:unknown,actor:string){const input=object(raw,'input');only(input,['id','expectedVersion'],'input');const id=text(input.id,'id',80)!,expected=version(input.expectedVersion);const current=(await this.repository.listCollections(true)).find(x=>x.id===id);if(!current)throw new ServicesError('not_found','Collection not found',404);await this.refuseWhileOnAir(current);const next:ServiceCollection={...current,names:null,version:expected+1,updatedAt:this.loaders.now(),updatedBy:actor};if(current.version!==expected||!await this.repository.replaceCollection(next,expected))throw new ServicesConflictError();const {catalog,sources}=await this.evidence();return enrichCollection(next,catalog.cues,sources)}
 async recordFeedback(raw:unknown,actor:string){const input=object(raw,'input');only(input,['collectionId','kind','cueId','context','reason','impact','productGap'],'input');const collectionId=text(input.collectionId,'collectionId',80,true);if(collectionId&&!(await this.repository.listCollections(true)).some(x=>x.id===collectionId))throw new ServicesError('not_found','Collection not found',404);const cueId=text(input.cueId,'cueId',160,true);const now=this.loaders.now();const value:BetaFeedback={id:this.loaders.id(),version:1,collectionId,kind:oneOf(input.kind,['issue','fallback','observation'] as const,'kind'),cueId,context:text(input.context,'context',240)!,reason:text(input.reason,'reason',1200)!,impact:oneOf(input.impact,['none','minor','service-affecting'] as const,'impact'),productGap:bool(input.productGap,'productGap'),archived:false,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor};await this.repository.insertFeedback(value);return value}
 async updateFeedback(raw:unknown,actor:string){const input=object(raw,'input');only(input,['id','expectedVersion','context','reason','impact','productGap','archived'],'input');const id=text(input.id,'id',80)!,expected=version(input.expectedVersion),current=(await this.repository.listFeedback(true)).find(x=>x.id===id);if(!current)throw new ServicesError('not_found','Feedback not found',404);const next:BetaFeedback={...current,context:input.context===undefined?current.context:text(input.context,'context',240)!,reason:input.reason===undefined?current.reason:text(input.reason,'reason',1200)!,impact:input.impact===undefined?current.impact:oneOf(input.impact,['none','minor','service-affecting'] as const,'impact'),productGap:input.productGap===undefined?current.productGap:bool(input.productGap,'productGap'),archived:input.archived===undefined?current.archived:bool(input.archived,'archived'),version:expected+1,updatedAt:this.loaders.now(),updatedBy:actor};if(current.version!==expected||!await this.repository.replaceFeedback(next,expected))throw new ServicesConflictError();return next}
}

// D10 - a names list reaches the live library through the one existing path: the operation
// writes the collection, then `syncLiveCatalog` pushes `authoringCatalog()` - which now
// composes the names panels - exactly as a publication does. Archiving nulls the names, so
// it syncs too; restoring does not bring them back, so it does not. When the relay cannot
// be reached the write still stands and the caller is told, in the same words a publication
// uses, that the live library is behind.
const NAMES_CATALOG_OPERATIONS=['set_names','clear_names','archive_collection'];
export async function servicesOperation(operation:string,input:unknown,actor:string,repository?:ServicesRepository){
 const result=await servicesOperationResult(operation,input,actor,repository);
 if(!NAMES_CATALOG_OPERATIONS.includes(operation))return result;
 const {relayConfigured}=await import('./relay');
 if(!relayConfigured())return result;
 try{const {syncLiveCatalog}=await import('./sync-live-catalog');await syncLiveCatalog()}
 catch{return {...result,liveRefreshPending:true,warning:'Saved successfully, but the live library has not received this update. Use Sync live library in the editor after the connection recovers. Live playback continues using the last synchronized version.'}}
 return result;
}
async function servicesOperationResult(operation:string,input:unknown,actor:string,repository?:ServicesRepository){const manager=new ServicesManager(repository);switch(operation){case'get_dashboard':return manager.dashboard(input);case'search_coverage_sources':return {sources:await manager.searchSources(input)};case'create_collection':return {collection:await manager.createCollection(input,actor)};case'create_from_library':return {collection:await manager.createFromLibrary(input,actor)};case'list_live_setlists':return manager.listLiveSetlists(input);case'import_setlist':return manager.importSetlist(input,actor);case'update_collection':return {collection:await manager.updateCollection(input,actor)};case'set_names':return {collection:await manager.setNames(input,actor)};case'clear_names':return {collection:await manager.clearNames(input,actor)};case'archive_collection':return {collection:await manager.setCollectionArchived(input,actor,true)};case'restore_collection':return {collection:await manager.setCollectionArchived(input,actor,false)};case'record_feedback':return {feedback:await manager.recordFeedback(input,actor)};case'update_feedback':return {feedback:await manager.updateFeedback(input,actor)};default:throw new ServicesError('unknown_operation',`Unknown services operation: ${operation}`,404)}}

export function servicesPermission(operation:string):AccessPermission{return ['create_collection','create_from_library','list_live_setlists','import_setlist','update_collection','archive_collection','restore_collection','set_names','clear_names','update_feedback'].includes(operation)?'author':operation==='record_feedback'?'control':'read'}

function csvCell(value:unknown){let text=String(value??'');if(/^[\u0000-\u0020]*[=+\-@]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`}
export async function feedbackCsv(repository:ServicesRepository=defaultServicesRepository()){const rows=await repository.listFeedback(true);const columns=['id','createdAt','kind','impact','productGap','collectionId','cueId','context','reason','archived','createdBy'];return [columns.join(','),...rows.map(row=>columns.map(column=>csvCell(row[column as keyof BetaFeedback])).join(','))].join('\r\n')+'\r\n'}

export async function collectionsContainingCueIds(cueIds:string[],repository:ServicesRepository=defaultServicesRepository()){
 const wanted=[...new Set(cueIds)];if(wanted.length>500||wanted.some(id=>typeof id!=='string'||!id||id.length>160))throw new ServicesError('invalid_input','cueIds must contain at most 500 bounded IDs');const set=new Set(wanted);
 return (await repository.listCollections(true)).map(collection=>({id:collection.id,name:collection.name,service:collection.service,archived:collection.archived,matches:collection.entries.filter(entry=>entry.cueIds.some(id=>set.has(id))).map(entry=>({entryId:entry.id,entryType:entry.type,label:entry.label,cueIds:entry.cueIds.filter(id=>set.has(id))}))})).filter(collection=>collection.matches.length>0);
}
