import {createHash} from 'node:crypto';
import {authoringCatalog} from './server';
import {baselineCues,editableFromBaseline,sourcePack,sourcePinFor,type AuthoringCue,type AuthoringSource,type DraftContent,type EditableDraft,type SharedCueCopySpec} from './authoring-model';
import type {Cue} from './player';

export const CRC_WORKSPACE_ID='crc';
export const TBI_WORKSPACE_ID='temple-bnai-israel-kalamazoo';
export const SHARED_LIBRARY_MAX_BYTES=8*1024*1024;
const SHARED_LIBRARY_TTL_MS=60_000;
const SHARED_LIBRARY_TIMEOUT_MS=7_000;

export type SharedLibraryEntry={id:string;name:string;title:string;layout:string;sourceIds:string[];cueHash:string;cue:Cue;copySpec:SharedCueCopySpec};
export type SharedLibraryPayload={schemaVersion:1;sourceWorkspace:'crc';generatedAt:number;catalogVersion:string;cues:SharedLibraryEntry[];sources:AuthoringSource[]};
export type SharedLibrarySnapshot={available:true;configured:true;stale:boolean;refreshedAt:number;payload:SharedLibraryPayload}|{available:false;configured:boolean;stale:false;refreshedAt?:number;error:string};
type SharedLibraryEnvironment=Partial<Pick<NodeJS.ProcessEnv,'WORKSPACE_ID'|'CRC_SHARED_LIBRARY_URL'|'SHARED_LIBRARY_IMPORT_KEY'|'SHARED_LIBRARY_EXPORT_KEY'|'CONTROL_KEY'|'OUTPUT_KEY'|'ACCESS_BOOTSTRAP_KEY'>>;

const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceIdsFor=(content:DraftContent)=>[...new Set((content.mode==='bilingual'?[...content.hebrewGroups,...content.transliterationGroups]:content.mode==='original-en'||content.mode==='source-en'?content.englishGroups:[]).map(group=>group.sourceId))].sort();
const baseEditable=(cue:Cue):EditableDraft|null=>{
 const authored=(cue as AuthoringCue).authoring?.copySpec;
 if(authored)return {name:authored.name,title:authored.title,accentTitle:authored.accentTitle,layout:authored.layout,templateCueId:authored.templateCueId,content:structuredClone(authored.content),presentation:structuredClone(authored.presentation)};
 const baseline=baselineCues.find(item=>item.id===cue.id);
 if(baseline)try{return editableFromBaseline(cue.id)}catch{}
 const text=cue.texts.textMain;
 const template=baseline??baselineCues.find(item=>item.layout===cue.layout&&!item.hidden);
 if(typeof text!=='string'||!text.trim()||!template)return null;
 return {name:cue.name,title:cue.texts.textTitle??cue.name,accentTitle:cue.texts.accentTextTitle,layout:cue.layout as EditableDraft['layout'],templateCueId:template.id,content:{mode:'custom',text},presentation:cue.presentation??{}};
};

export function buildSharedLibraryPayload(catalog:{cues:Cue[];version:string},generatedAt=Date.now()):SharedLibraryPayload{
 const entries:SharedLibraryEntry[]=[];const selectedSources=new Map<string,AuthoringSource>();
 for(const cue of catalog.cues){
  if(cue.hidden)continue;
  const editable=baseEditable(cue);if(!editable)throw new Error(`Published cue ${cue.id} cannot be copied without approved source mapping`);
  const embedded=(cue as AuthoringCue).authoring?.copySpec;
  const pin=embedded?.sourcePin??sourcePinFor(editable.content);
  const sourceIds=sourceIdsFor(editable.content);
  const pinnedSources=embedded?.sourceSnapshots??[];
  for(const id of sourceIds){const source=pinnedSources.find(item=>item.id===id)??sourcePack.sources.find(item=>item.id===id);if(!source)throw new Error(`Published cue ${cue.id} references unavailable source ${id}`);selectedSources.set(id,source)}
  const resolvedSources=sourceIds.map(id=>selectedSources.get(id)!);if(JSON.stringify(sourcePinFor(editable.content,resolvedSources,pin.feedSha256))!==JSON.stringify(pin))throw new Error(`Published cue ${cue.id} source snapshot no longer matches its approved pin`);
  const exportedCue=structuredClone(cue) as AuthoringCue;if(exportedCue.authoring?.copySpec)delete exportedCue.authoring.copySpec.sourceSnapshots;
  entries.push({id:cue.id,name:cue.name,title:cue.texts.textTitle??cue.name,layout:cue.layout,sourceIds,cueHash:sha(exportedCue),cue:exportedCue,copySpec:{...structuredClone(editable),sourcePin:structuredClone(pin)}});
 }
 const payload:SharedLibraryPayload={schemaVersion:1,sourceWorkspace:'crc',generatedAt,catalogVersion:catalog.version,cues:entries,sources:[...selectedSources.values()].map(source=>structuredClone(source))};
 if(Buffer.byteLength(JSON.stringify(payload))>SHARED_LIBRARY_MAX_BYTES)throw new Error('Shared library payload exceeds the export limit');
 return payload;
}

export async function exportSharedLibrary(){return buildSharedLibraryPayload(await authoringCatalog())}

function configuredSecret(value:string|undefined,env:SharedLibraryEnvironment){
 const secret=value?.trim();if(!secret||secret.length<32)return null;
 if([env.CONTROL_KEY,env.OUTPUT_KEY,env.ACCESS_BOOTSTRAP_KEY].some(other=>other&&other===secret))return null;
 return secret;
}
export function sharedLibraryExportSecret(env:SharedLibraryEnvironment=process.env as SharedLibraryEnvironment){return configuredSecret(env.SHARED_LIBRARY_EXPORT_KEY,env)}

function validatePayload(value:unknown):SharedLibraryPayload{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Shared library response is invalid');
 const payload=value as Partial<SharedLibraryPayload>;
 if(payload.schemaVersion!==1||payload.sourceWorkspace!=='crc'||!Number.isSafeInteger(payload.generatedAt)||typeof payload.catalogVersion!=='string'||!Array.isArray(payload.cues)||!Array.isArray(payload.sources))throw new Error('Shared library response is invalid');
 if(payload.cues.length>1000||payload.sources.length>2000)throw new Error('Shared library response exceeds item limits');
 const sourceIds=new Set<string>();for(const raw of payload.sources){if(!raw||typeof raw.id!=='string'||sourceIds.has(raw.id)||!Array.isArray(raw.blocks))throw new Error('Shared library source snapshot is invalid');sourceIds.add(raw.id)}
 const cueIds=new Set<string>();for(const raw of payload.cues){if(!raw||typeof raw.id!=='string'||cueIds.has(raw.id)||typeof raw.cueHash!=='string'||!raw.cue||typeof raw.copySpec!=='object'||!Array.isArray(raw.sourceIds)||raw.sourceIds.some(id=>!sourceIds.has(id))||sha(raw.cue)!==raw.cueHash)throw new Error('Shared library cue snapshot is invalid');cueIds.add(raw.id)}
 return payload as SharedLibraryPayload;
}

async function boundedJson(response:Response){
 const declared=Number(response.headers.get('content-length')??0);if(declared>SHARED_LIBRARY_MAX_BYTES)throw new Error('Shared library response is too large');
 const reader=response.body?.getReader();if(!reader)throw new Error('Shared library response has no body');const chunks:Uint8Array[]=[];let bytes=0;
 for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>SHARED_LIBRARY_MAX_BYTES){await reader.cancel();throw new Error('Shared library response is too large')}chunks.push(value)}
 const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength}
 return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export class SharedLibraryClient{
 private cached:{payload:SharedLibraryPayload;refreshedAt:number;expiresAt:number}|null=null;
 private inflight:Promise<SharedLibrarySnapshot>|null=null;
 constructor(private env:SharedLibraryEnvironment=process.env as SharedLibraryEnvironment,private fetcher:typeof fetch=fetch){}
 configured(){return this.env.WORKSPACE_ID?.trim().toLowerCase()===TBI_WORKSPACE_ID&&Boolean(this.url())&&Boolean(configuredSecret(this.env.SHARED_LIBRARY_IMPORT_KEY,this.env))}
 private url(){try{const url=new URL(this.env.CRC_SHARED_LIBRARY_URL??'');return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash?url:null}catch{return null}}
 async get(force=false):Promise<SharedLibrarySnapshot>{
  const now=Date.now();if(!this.configured())return {available:false,configured:false,stale:false,error:'CRC library is not configured for this workspace.'};
  if(!force&&this.cached&&this.cached.expiresAt>now)return {available:true,configured:true,stale:false,refreshedAt:this.cached.refreshedAt,payload:this.cached.payload};
  if(this.inflight)return this.inflight;
  this.inflight=this.refresh().finally(()=>{this.inflight=null});return this.inflight;
 }
 private async refresh():Promise<SharedLibrarySnapshot>{
  try{
   const url=this.url()!,key=configuredSecret(this.env.SHARED_LIBRARY_IMPORT_KEY,this.env)!;
   const response=await this.fetcher(url,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(SHARED_LIBRARY_TIMEOUT_MS)});
   if(!response.ok)throw new Error(`Shared library request failed (${response.status})`);
   const payload=validatePayload(await boundedJson(response));const refreshedAt=Date.now();this.cached={payload,refreshedAt,expiresAt:refreshedAt+SHARED_LIBRARY_TTL_MS};return {available:true,configured:true,stale:false,refreshedAt,payload};
  }catch{
   if(this.cached)return {available:true,configured:true,stale:true,refreshedAt:this.cached.refreshedAt,payload:this.cached.payload};
   return {available:false,configured:true,stale:false,error:'CRC library is temporarily unavailable.'};
  }
 }
}

export const sharedLibraryClient=new SharedLibraryClient();
