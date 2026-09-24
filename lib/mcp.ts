import {McpServer,createMcpHandler,type AuthInfo} from '@modelcontextprotocol/server';
import {z} from 'zod/v4';
import {AUTHORING_SCOPE,LIVE_SCOPE,canonicalOrigin,type ResourceScope} from './oauth-core';
import {getPublicWorkspace} from './workspace';
import {registerAssetsTools} from './mcp/assets';
import {registerAuthoringTools} from './mcp/authoring';
import {registerBrandingTools} from './mcp/branding';
import {registerCatalogTools} from './mcp/catalog';
import {registerDeckTools} from './mcp/deck';
import {registerLayoutsTools} from './mcp/layouts';
import {registerLiveTools} from './mcp/live';
import {registerServicesTools} from './mcp/services';
import type {McpIdentity,RegisterArea,RegisterTool} from './mcp/shared';

export type AuthoringOperation=(operation:string,input:unknown,actor:string)=>Promise<unknown>;
export type {McpIdentity} from './mcp/shared';

/** A tool group and the scope every tool in it needs: an area declares its scope once, here. */
export type ScopedArea={register:RegisterArea;scope:ResourceScope};
const AREAS:ScopedArea[]=[{register:registerCatalogTools,scope:AUTHORING_SCOPE},{register:registerAuthoringTools,scope:AUTHORING_SCOPE},{register:registerServicesTools,scope:AUTHORING_SCOPE},{register:registerLiveTools,scope:LIVE_SCOPE},{register:registerLayoutsTools,scope:AUTHORING_SCOPE},{register:registerAssetsTools,scope:AUTHORING_SCOPE},{register:registerBrandingTools,scope:AUTHORING_SCOPE},{register:registerDeckTools,scope:AUTHORING_SCOPE}];
// Saying which congregation this is needs no grant beyond reaching the server at all.
const ANY_SCOPE_TOOLS=new Set(['get_workspace']);
const SCOPE_NAMES:Record<ResourceScope,string>={[AUTHORING_SCOPE]:'authoring',[LIVE_SCOPE]:'live control'};
// Every tool is listed whatever the token holds, so an agent can see what a wider grant would add;
// a call without the scope is refused in words before anything runs.
function scopeRefusal(tool:string,scope:ResourceScope,identity:McpIdentity){return {isError:true,content:[{type:'text' as const,text:`This ${identity.shortName} connection wasn’t granted ${SCOPE_NAMES[scope]}, so ${tool} can’t run. Nothing was changed. To use it, reconnect the ${identity.shortName} connector and allow ${SCOPE_NAMES[scope]} when you approve. (insufficient_scope: needs ${scope})`}]}}
export function workspaceIdentity(env:Parameters<typeof getPublicWorkspace>[0]=process.env):McpIdentity{const workspace=getPublicWorkspace(env);return {workspaceId:workspace.id,shortName:workspace.shortName,organizationName:workspace.organizationName,host:new URL(canonicalOrigin()).host}}
// The house rules an agent otherwise has no way to learn. Sent once, at initialize.
function instructions(identity:McpIdentity){return [
 `This connection serves ${identity.organizationName} (${identity.shortName}, workspace '${identity.workspaceId}', ${identity.host}) and no other congregation. Every change takes workspace:'${identity.workspaceId}'; a call naming another congregation is refused, so use that congregation's own connector.`,
 'Make a graphic: search_sources with includeBlocks:true, then create_draft with those block ids (or content mode custom for free text such as an announcement; compose_custom_draft fills a named form). templateCueId is optional: each layout defaults to its look. Then preview_draft, fit_check_draft (includePreviewImage:true shows you the frame), review_draft and publish_draft with the same draftId, expectedVersion and previewId.',
 'Layouts: bottom is a lower third, left and right are panels, and corner is a small bottom-right card for a line or two that takes a bottom template. Text that would need more than two lower thirds becomes a left panel sequence instead.',
 'To show a long prayer in parts, use create_source_draft_set from its source; do not use split_draft_into_set for that.',
 'Nothing on this connection puts anything on screen.',
].join('\n')}
// Every change names its congregation, so a call meant for the other connector is refused here
// rather than landing in the wrong database; a read may name it too, and is checked when it does. The web needs no equivalent: a browser is on one host.
function workspaceField(identity:McpIdentity){return z.string({error:`Name the congregation: pass workspace:'${identity.workspaceId}' (${identity.shortName}). Call get_workspace to confirm which one this connection serves.`}).min(1).max(80).describe(`Which congregation this call is for. This connection serves '${identity.workspaceId}' (${identity.shortName}) only.`)}
function namesWorkspace(value:unknown,identity:McpIdentity){return typeof value==='string'&&[identity.workspaceId,identity.shortName.toLowerCase()].includes(value.trim().toLowerCase())}
function workspaceRefusal(value:unknown,identity:McpIdentity){return {isError:true,content:[{type:'text' as const,text:`This connection serves ${identity.shortName} (workspace '${identity.workspaceId}' at ${identity.host}), not '${String(value)}'. Nothing was changed. Use the connector for '${String(value)}', or pass workspace:'${identity.workspaceId}' if you meant ${identity.shortName}.`}]}}

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
// Both server-browser tools may carry a frame; it leaves JSON as an MCP image, never base64 text.
function result(operation:string,value:unknown,identity:McpIdentity){let output=value,previewImage:undefined|{mimeType:'image/jpeg'|'image/png';dataBase64:string;width:number;height:number};if(operation==='preview_draft'&&value&&typeof value==='object'&&typeof (value as {previewPath?:unknown}).previewPath==='string')output={...(value as Record<string,unknown>),previewUrl:new URL((value as {previewPath:string}).previewPath,canonicalOrigin()).toString()};if((operation==='fit_check_draft'||operation==='preview_content')&&output&&typeof output==='object'){const record=output as Record<string,unknown>,candidate=record.previewImage;if(candidate&&typeof candidate==='object'&&typeof (candidate as {dataBase64?:unknown}).dataBase64==='string'&&((candidate as {mimeType?:unknown}).mimeType==='image/jpeg'||(candidate as {mimeType?:unknown}).mimeType==='image/png')){const image=candidate as {mimeType:'image/jpeg'|'image/png';dataBase64:string;width:number;height:number};previewImage=image;output={...record,previewImage:{mimeType:image.mimeType,width:image.width,height:image.height}}}}if(!FULL_RECORD_OPERATIONS.has(operation)&&output&&typeof output==='object'&&!Array.isArray(output)){const compact=compactResult(output) as Record<string,unknown>;if(JSON.stringify(compact).length<JSON.stringify(output).length)output={...compact,compacted:{omitted:[...OMITTED_RESULT_KEYS,'blockSha256'],fullRecord:'get_draft'}}}if(operation==='get_workspace'){const workspace=(value as {workspace?:{rehearsal?:unknown;label?:unknown}}|undefined)?.workspace;output={organizationName:identity.organizationName,rehearsal:workspace?.rehearsal===true,rehearsalLabel:typeof workspace?.label==='string'?workspace.label:null}}const echo={workspaceId:identity.workspaceId,shortName:identity.shortName,host:identity.host};output=output&&typeof output==='object'&&!Array.isArray(output)?{...echo,...output}:{...echo,result:output};return {content:[{type:'text' as const,text:JSON.stringify(output)},...(previewImage?[{type:'image' as const,data:previewImage.dataBase64,mimeType:previewImage.mimeType}]:[])]}}
function ensureCoverage(input:Record<string,unknown>){const patch=input.patch as Record<string,unknown>|undefined;const candidate=(patch?.content??input.content) as {mode?:string;hebrewGroups?:{sourceId:string;blockIds:string[]}[];transliterationGroups?:{sourceId:string;blockIds:string[]}[]}|undefined;if(candidate?.mode!=='bilingual')return;const sequence=(groups:typeof candidate.hebrewGroups)=>groups?.flatMap(group=>group.blockIds.map(blockId=>`${group.sourceId}\0${blockId}`));if(JSON.stringify(sequence(candidate.hebrewGroups))!==JSON.stringify(sequence(candidate.transliterationGroups)))throw Error('Hebrew and transliteration must use the same ordered source blocks')}

/** `extraAreas` exists for tests: a fixture area proves the gate before a real live tool is registered. */
export function createAuthoringMcpHandler(authoringOperation:AuthoringOperation,identify:()=>McpIdentity=workspaceIdentity,extraAreas:ScopedArea[]=[]){
 return createMcpHandler(({authInfo})=>{
  const identity=identify(),granted=new Set(authInfo?.scopes??[]);
  const server=new McpServer({name:`${identity.shortName} Overlay Authoring`,version:'1.0.0'},{instructions:instructions(identity)});
  const registerFor=(scope:ResourceScope):RegisterTool=>(name:string,description:string,inputSchema:z.ZodObject,annotations)=>{
   const writes=annotations.readOnlyHint===false,schema=inputSchema.extend({workspace:writes?workspaceField(identity):workspaceField(identity).optional()});
   server.registerTool(name,{description,inputSchema:schema.shape,annotations},async (input:Record<string,unknown>)=>{
    if(!ANY_SCOPE_TOOLS.has(name)&&!granted.has(scope))return scopeRefusal(name,scope,identity);
    if((writes||input.workspace!==undefined)&&!namesWorkspace(input.workspace,identity))return workspaceRefusal(input.workspace,identity);
    const {workspace:named,...parsed}=schema.parse(input) as Record<string,unknown>;void named;ensureCoverage(parsed);
    return result(name,await authoringOperation(name,parsed,actor(authInfo)),identity);
   });
  };
  for(const area of [...AREAS,...extraAreas])area.register(registerFor(area.scope),identity);
  return server;
 },{responseMode:'json'});
}
