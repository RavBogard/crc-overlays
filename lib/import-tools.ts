import {AuthoringError} from './authoring-model';
import {IMPORT_KINDS,IMPORT_LIMITS,importByteLimit,importSummary,importView,isImportId,isImportKind,newImportId,newImportToken,tokenHash,type ImportRecord,type ImportRepository} from './imports';

/**
 * TBI redo G1 - the dropzone tools over the MCP: open_import_dropzone makes a short-lived link a
 * person drops a file on, get_import says what arrived (a summary, never the content), and
 * list_imports lists what is kept. Readers take the importId (import_singular_extract, and the
 * G2/G3/G6 tools). The store and its rules are lib/imports.ts; the page is app/import/[token].
 */
export const IMPORT_TOOL_OPERATIONS:ReadonlySet<string>=new Set(['open_import_dropzone','get_import','list_imports']);
export const isImportTool=(operation:string)=>IMPORT_TOOL_OPERATIONS.has(operation);
export type ImportToolDeps={repository:ImportRepository;workspaceId:string;shortName:string;origin:string;now?:()=>number};

const invalid=(message:string)=>new AuthoringError('invalid_input',message);
function only(data:Record<string,unknown>,allowed:string[],tool:string){const extra=Object.keys(data).filter(key=>!allowed.includes(key));if(extra.length)throw invalid(`${tool} takes ${allowed.join(', ')}; remove ${extra.join(', ')}. Nothing was changed.`)}
const minutes=(ms:number)=>Math.round(ms/60_000);

export async function importToolOperation(operation:string,input:unknown,actor:string,deps:ImportToolDeps):Promise<unknown>{
 const data=(input&&typeof input==='object'&&!Array.isArray(input)?input:{}) as Record<string,unknown>,now=(deps.now??Date.now)(),repo=deps.repository;
 const mine=async(importId:unknown)=>{if(!isImportId(importId))throw invalid('importId must be the id open_import_dropzone returned (import_ followed by 32 hex characters).');const row=await repo.getWithData(importId);if(!row||row.workspaceId!==deps.workspaceId||row.expiresAt<=now)throw new AuthoringError('unknown_import',`There is no such import in ${deps.shortName}, or it has expired (imports are kept ${minutes(IMPORT_LIMITS.keepMs)/1440} days). Open a new dropzone with open_import_dropzone.`,404);return row};
 if(operation==='open_import_dropzone'){
  only(data,['kind','note'],'open_import_dropzone');
  if(!isImportKind(data.kind))throw invalid(`kind must be one of ${IMPORT_KINDS.join(', ')}. Nothing was opened.`);
  const note=data.note===undefined?null:typeof data.note==='string'&&data.note.trim().length<=200?data.note.trim()||null:(()=>{throw invalid('note must be at most 200 characters. Nothing was opened.')})();
  await repo.sweep(now);
  const waiting=(await repo.list(now)).filter(row=>row.workspaceId===deps.workspaceId&&(row.status==='waiting'||row.status==='receiving')&&row.linkExpiresAt>now);
  if(waiting.length>=IMPORT_LIMITS.open)throw new AuthoringError('too_many_dropzones',`${deps.shortName} already has ${waiting.length} dropzones waiting for a file. Use one of them (list_imports), or wait until a link expires (links last ${minutes(IMPORT_LIMITS.linkTtlMs)} minutes). Nothing was opened.`,409);
  const token=newImportToken(),record:ImportRecord={id:newImportId(),workspaceId:deps.workspaceId,kind:data.kind,tokenSha256:tokenHash(token),linkExpiresAt:now+IMPORT_LIMITS.linkTtlMs,status:'waiting',fileName:null,mediaType:null,totalBytes:null,receivedBytes:0,nextChunk:0,sha256:null,refusal:null,note,createdBy:actor,createdAt:now,updatedAt:now,expiresAt:now+IMPORT_LIMITS.keepMs};
  await repo.insert(record);
  return {importId:record.id,url:`${deps.origin}/import/${token}`,linkExpiresAt:record.linkExpiresAt,kind:record.kind,maxBytes:importByteLimit(record.kind),next:`Give this link to the person with the file; it works for ${minutes(IMPORT_LIMITS.linkTtlMs)} minutes and needs no sign-in, so share it only with them. When the page says the file was received, call get_import with this importId, then pass the importId to the tool that reads it.`};
 }
 if(operation==='get_import'){
  only(data,['importId'],'get_import');
  const {data:bytes,...record}=await mine(data.importId);
  const summary=importSummary(record,bytes);
  const next=record.status==='ready'?'Pass this importId to the tool that reads it.':record.status==='refused'?(record.linkExpiresAt>now?'Ask the person to drop a corrected file on the same link, or open a new dropzone.':'Open a new dropzone with open_import_dropzone for a corrected file.'):record.linkExpiresAt>now?'Nothing has finished arriving yet. Call get_import again once the page says the file was received.':'The link expired before a file arrived. Open a new dropzone with open_import_dropzone.';
  return {...importView(record),...(summary?{summary}:{}),next};
 }
 if(operation==='list_imports'){
  only(data,[],'list_imports');
  const rows=(await repo.list(now)).filter(row=>row.workspaceId===deps.workspaceId).slice(0,50);
  return {imports:rows.map(importView),count:rows.length};
 }
 throw new AuthoringError('unknown_operation',`Unknown import operation: ${operation}`,404);
}

/** The deployment's store, workspace and public origin. */
export async function defaultImportToolDeps():Promise<ImportToolDeps>{
 const [{defaultImportRepository},{getPublicWorkspace},{canonicalOrigin}]=await Promise.all([import('./imports'),import('./workspace'),import('./oauth-core')]);
 const workspace=getPublicWorkspace();
 return {repository:defaultImportRepository(workspace.id),workspaceId:workspace.id,shortName:workspace.shortName,origin:canonicalOrigin()};
}
