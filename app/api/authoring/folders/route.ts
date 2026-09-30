import {authorizeRequest} from '@/lib/access';
import {authoringRepository} from '@/lib/authoring';
import {AuthoringError,publicErrorDetails} from '@/lib/authoring-model';
import {applyFolderOperation,parseFolderOperation,PgLibraryFoldersRepository} from '@/lib/library-folders';
import {json} from '@/lib/server';
import {baselineCatalogForWorkspace} from '@/lib/workspace-catalog';

export const runtime='nodejs';
const folders=()=>new PgLibraryFoldersRepository();
const failed=(error:unknown)=>{
 if(error instanceof AuthoringError)return json({error:error.message,code:error.code,...publicErrorDetails(error.details)},error.status);
 console.error('Library folders operation failed');
 return json({error:'Library folders are unavailable right now',code:'folders_unavailable'},503);
};

export async function GET(request:Request){
 try{
  const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
  return json(await folders().get());
 }catch(error){return failed(error)}
}

export async function POST(request:Request){
 try{
  const actor=await authorizeRequest(request,'author');if(!actor)return json({error:'Unauthorized'},401);
  const reader=request.body?.getReader(),decoder=new TextDecoder();let raw='',bytes=0;
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();return json({error:'Request is too large',code:'request_too_large'},413)}raw+=decoder.decode(value,{stream:true})}
  raw+=decoder.decode();
  let body:unknown;try{body=JSON.parse(raw)}catch{throw new AuthoringError('invalid_json','Body must be valid JSON')}
  const operation=parseFolderOperation(body);
  const repository=folders(),current=await repository.get();
  const workspace=(process.env.WORKSPACE_ID?.trim()||'crc').toLowerCase();
  const validCueIds=new Set(baselineCatalogForWorkspace(workspace).map(cue=>cue.id));
  for(const draft of await authoringRepository().listDrafts())validCueIds.add(draft.id);
  const next=applyFolderOperation(current,operation,validCueIds);
  return json(await repository.put(next,operation.expectedVersion,actor.id,Date.now()));
 }catch(error){return failed(error)}
}
