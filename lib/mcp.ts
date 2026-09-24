import {McpServer,createMcpHandler,type AuthInfo} from '@modelcontextprotocol/server';
import {z} from 'zod/v4';
import {canonicalOrigin} from './oauth-core';
import {registerAssetsTools} from './mcp/assets';
import {registerAuthoringTools} from './mcp/authoring';
import {registerBrandingTools} from './mcp/branding';
import {registerCatalogTools} from './mcp/catalog';
import {registerDeckTools} from './mcp/deck';
import {registerLayoutsTools} from './mcp/layouts';
import {registerLiveTools} from './mcp/live';
import {registerServicesTools} from './mcp/services';
import type {RegisterTool} from './mcp/shared';

export type AuthoringOperation=(operation:string,input:unknown,actor:string)=>Promise<unknown>;

function actor(authInfo:AuthInfo|undefined){const stored=authInfo?.extra?.actor;return typeof stored==='string'?stored:`mcp:${authInfo?.clientId??'unknown'}`}
// Reads return the full record. Every other result drops what an agent never acts on - embedded
// source snapshots, animation tracks and per-block pin hashes - which made one publish ~25 KB.
// Ids, versions, cue hashes, texts, content rows, validation and review receipts stay.
const FULL_RECORD_OPERATIONS=new Set(['get_draft','get_source','search_sources','list_drafts','list_archived_drafts','list_templates','list_revisions','get_service_history','list_wording_changes']);
const OMITTED_RESULT_KEYS=new Set(['sourceSnapshots','animations','openingWords']);
function compactResult(value:unknown):unknown{
 if(Array.isArray(value))return value.map(compactResult);
 if(!value||typeof value!=='object')return value;
 const output:Record<string,unknown>={};
 for(const [key,item] of Object.entries(value as Record<string,unknown>)){
  if(OMITTED_RESULT_KEYS.has(key))continue;
  if(key==='blockSha256'&&item&&typeof item==='object'){output.pinnedBlockCount=Object.keys(item).length;continue}
  if(key==='draftSetManifest'&&item&&typeof item==='object'){const manifest=item as {version?:unknown;selections?:unknown};output[key]={version:manifest.version,selectionCount:Array.isArray(manifest.selections)?manifest.selections.length:0};continue}
  output[key]=compactResult(item);
 }
 // publish_draft returns the published cue twice, inside the revision and beside it.
 const revision=output.revision as {cue?:unknown}|undefined;
 if(output.cue&&revision?.cue&&JSON.stringify(output.cue)===JSON.stringify(revision.cue))output.cue='same as revision.cue';
 return output;
}
function result(operation:string,value:unknown){let output=value,previewImage:undefined|{mimeType:'image/jpeg'|'image/png';dataBase64:string;width:number;height:number};if(operation==='preview_draft'&&value&&typeof value==='object'&&typeof (value as {previewPath?:unknown}).previewPath==='string')output={...(value as Record<string,unknown>),previewUrl:new URL((value as {previewPath:string}).previewPath,canonicalOrigin()).toString()};if(operation==='fit_check_draft'&&output&&typeof output==='object'){const record=output as Record<string,unknown>,candidate=record.previewImage;if(candidate&&typeof candidate==='object'&&typeof (candidate as {dataBase64?:unknown}).dataBase64==='string'&&((candidate as {mimeType?:unknown}).mimeType==='image/jpeg'||(candidate as {mimeType?:unknown}).mimeType==='image/png')){const image=candidate as {mimeType:'image/jpeg'|'image/png';dataBase64:string;width:number;height:number};previewImage=image;output={...record,previewImage:{mimeType:image.mimeType,width:image.width,height:image.height}}}}if(!FULL_RECORD_OPERATIONS.has(operation)&&output&&typeof output==='object'&&!Array.isArray(output)){const compact=compactResult(output) as Record<string,unknown>;if(JSON.stringify(compact).length<JSON.stringify(output).length)output={...compact,compacted:{omitted:[...OMITTED_RESULT_KEYS,'blockSha256'],fullRecord:'get_draft'}}}return {content:[{type:'text' as const,text:JSON.stringify(output)},...(previewImage?[{type:'image' as const,data:previewImage.dataBase64,mimeType:previewImage.mimeType}]:[])]}}
function ensureCoverage(input:Record<string,unknown>){const patch=input.patch as Record<string,unknown>|undefined;const candidate=(patch?.content??input.content) as {mode?:string;hebrewGroups?:{sourceId:string;blockIds:string[]}[];transliterationGroups?:{sourceId:string;blockIds:string[]}[]}|undefined;if(candidate?.mode!=='bilingual')return;const sequence=(groups:typeof candidate.hebrewGroups)=>groups?.flatMap(group=>group.blockIds.map(blockId=>`${group.sourceId}\0${blockId}`));if(JSON.stringify(sequence(candidate.hebrewGroups))!==JSON.stringify(sequence(candidate.transliterationGroups)))throw Error('Hebrew and transliteration must use the same ordered source blocks')}

export function createAuthoringMcpHandler(authoringOperation:AuthoringOperation){
 return createMcpHandler(({authInfo})=>{
  const server=new McpServer({name:'CRC Overlay Authoring',version:'1.0.0'});
  const register:RegisterTool=(name:string,description:string,inputSchema:z.ZodObject,annotations)=>server.registerTool(name,{description,inputSchema:inputSchema.shape,annotations},async (input:Record<string,unknown>)=>{const parsed=inputSchema.parse(input);ensureCoverage(parsed);return result(name,await authoringOperation(name,parsed,actor(authInfo)))});
  registerCatalogTools(register);registerAuthoringTools(register);registerServicesTools(register);registerLiveTools(register);registerLayoutsTools(register);registerAssetsTools(register);registerBrandingTools(register);registerDeckTools(register);
  return server;
 },{responseMode:'json'});
}
