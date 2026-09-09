import {McpServer,createMcpHandler,type AuthInfo} from '@modelcontextprotocol/server';
import {z} from 'zod/v4';
import {canonicalOrigin} from './oauth-core';

export type AuthoringOperation=(operation:string,input:unknown,actor:string)=>Promise<unknown>;

const id=z.string().min(1).max(200);
const version=z.number().int().nonnegative();
const presentation=z.object({hebrewFontSize:z.number().int().min(24).max(52).optional(),transliterationFontSize:z.number().int().min(20).max(48).optional(),titleFontSize:z.number().int().min(20).max(42).optional()}).strict();
const sourceGroup=z.object({sourceId:z.string().min(1).max(160),blockIds:z.array(z.string().min(1).max(220)).min(1).max(48)}).strict();
const bilingual=z.object({mode:z.literal('bilingual'),hebrewGroups:z.array(sourceGroup).min(1).max(24),transliterationGroups:z.array(sourceGroup).min(1).max(24),includeTranslation:z.boolean().optional()}).strict();
const originalEnglish=z.object({mode:z.literal('original-en'),englishGroups:z.array(sourceGroup).min(1).max(24)}).strict();
const content=z.discriminatedUnion('mode',[bilingual,originalEnglish]);
const draftFields=z.object({name:z.string().min(1).max(80),title:z.string().min(1).max(100),accentTitle:z.string().max(60).optional(),layout:z.enum(['left','bottom','right']),templateCueId:z.string().min(1).max(80),content,presentation:presentation.optional()}).strict();

function actor(authInfo:AuthInfo|undefined){const stored=authInfo?.extra?.actor;return typeof stored==='string'?stored:`mcp:${authInfo?.clientId??'unknown'}`}
function result(operation:string,value:unknown){let output=value;if(operation==='preview_draft'&&value&&typeof value==='object'&&typeof (value as {previewPath?:unknown}).previewPath==='string')output={...(value as Record<string,unknown>),previewUrl:new URL((value as {previewPath:string}).previewPath,canonicalOrigin()).toString()};return {content:[{type:'text' as const,text:JSON.stringify(output)}]}}
function ensureCoverage(input:Record<string,unknown>){const patch=input.patch as Record<string,unknown>|undefined;const candidate=(patch?.content??input.content) as {mode?:string;hebrewGroups?:{sourceId:string;blockIds:string[]}[];transliterationGroups?:{sourceId:string;blockIds:string[]}[]}|undefined;if(candidate?.mode!=='bilingual')return;const sequence=(groups:typeof candidate.hebrewGroups)=>groups?.flatMap(group=>group.blockIds.map(blockId=>`${group.sourceId}\0${blockId}`));if(JSON.stringify(sequence(candidate.hebrewGroups))!==JSON.stringify(sequence(candidate.transliterationGroups)))throw Error('Hebrew and transliteration must use the same ordered source blocks')}

export function createAuthoringMcpHandler(authoringOperation:AuthoringOperation){
 return createMcpHandler(({authInfo})=>{
  const server=new McpServer({name:'CRC Overlay Authoring',version:'1.0.0'});
  const register=(name:string,description:string,inputSchema:z.ZodObject,annotations:{readOnlyHint?:boolean;idempotentHint?:boolean;destructiveHint?:boolean})=>server.registerTool(name,{description,inputSchema:inputSchema.shape,annotations},async (input:Record<string,unknown>)=>{const parsed=inputSchema.parse(input);ensureCoverage(parsed);return result(name,await authoringOperation(name,parsed,actor(authInfo)))});
  register('search_sources','Search the authorized CRC source corpus. Returns references, never a public corpus export.',z.object({query:z.string().min(1).max(100),limit:z.number().int().min(1).max(50).optional()}).strict(),{readOnlyHint:true});
  register('get_source','Get one authorized source by ID.',z.object({sourceId:id}).strict(),{readOnlyHint:true});
  register('list_templates','List baseline cue templates and whether each can be imported.',z.object({}).strict(),{readOnlyHint:true});
  register('list_drafts','List authoring drafts.',z.object({}).strict(),{readOnlyHint:true});
  register('get_draft','Get one draft and its current version.',z.object({draftId:id}).strict(),{readOnlyHint:true});
  register('import_cue','Idempotently create or return a source-reference draft for an existing baseline cue. No plaintext prayer content is accepted.',z.object({cueId:id}).strict(),{readOnlyHint:false,idempotentHint:true});
  register('create_draft','Create a source-reference draft with a new stable ID.',draftFields,{readOnlyHint:false});
  register('update_draft','Update a draft using optimistic version matching.',z.object({draftId:id,expectedVersion:version.min(1),patch:draftFields.partial().strict()}).strict(),{readOnlyHint:false,idempotentHint:true});
  register('preview_draft','Create a version-bound preview and return its authenticated preview path and fit contract. A human must review it in the web UI before publishing.',z.object({draftId:id,expectedVersion:version.min(1)}).strict(),{readOnlyHint:false,idempotentHint:true});
  register('publish_draft','Publish only a preview with a stored, exact-version human review receipt.',z.object({draftId:id,expectedVersion:version.min(1),previewId:id}).strict(),{readOnlyHint:false});
  register('list_revisions','List immutable revisions for a draft.',z.object({draftId:id}).strict(),{readOnlyHint:true});
  register('rollback_draft','Select an earlier immutable revision for future resolution.',z.object({draftId:id,expectedVersion:version.min(1),revision:version.min(1)}).strict(),{readOnlyHint:false,idempotentHint:true,destructiveHint:true});
  return server;
 },{responseMode:'json'});
}
