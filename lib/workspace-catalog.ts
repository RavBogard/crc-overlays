import baseline from './cues.json';
import tbiMapping from '../workspaces/temple-bnai-israel/catalog-map.json';
import type {Cue} from './player';

type ProvenancedCue = Cue & {provenance?: Record<string, unknown>};
type CatalogMapping = {sourceCueId:string;destinationCueId:string;name:string;copyMode:string};
const crcCatalog = baseline as unknown as ProvenancedCue[];

function mappedCatalog(items:CatalogMapping[],destinationWorkspace:string,starterCollectionId:string,preparedAt:string){
 const visible=crcCatalog.filter(cue=>!cue.hidden),sources=new Map(visible.map(cue=>[cue.id,cue]));
 if(items.length!==visible.length||new Set(items.map(item=>item.sourceCueId)).size!==visible.length||new Set(items.map(item=>item.destinationCueId)).size!==visible.length)throw new Error(`Workspace catalog mapping for ${destinationWorkspace} is incomplete or duplicated`);
 return items.map(item=>{
  const source=sources.get(item.sourceCueId);
  if(!source||source.name!==item.name)throw new Error(`Workspace catalog source changed: ${item.sourceCueId}`);
  return {...source,id:item.destinationCueId,provenance:{...source.provenance,workspaceTransfer:{sourceWorkspace:'crc',sourceCueId:item.sourceCueId,destinationWorkspace,starterCollectionId,copyMode:item.copyMode,preparedAt,automaticUpdates:false}}};
 });
}

export function baselineCatalogForWorkspace(workspaceId=process.env.WORKSPACE_ID?.trim().toLowerCase()||'crc'):ProvenancedCue[]{
 if(workspaceId==='crc')return crcCatalog;
 if(workspaceId===tbiMapping.destinationWorkspace)return mappedCatalog(tbiMapping.items,tbiMapping.destinationWorkspace,tbiMapping.starterCollectionId,tbiMapping.preparedAt);
 throw new Error(`No baseline catalog is configured for workspace ${workspaceId}`);
}

/**
 * The CRC graphic each of this workspace's starter graphics was copied from
 * (sourceCueId → destinationCueId). CRC itself has no starters, so its map is empty.
 */
export function starterSourceMap(workspaceId=process.env.WORKSPACE_ID?.trim().toLowerCase()||'crc'):Map<string,string>{
 if(workspaceId===tbiMapping.destinationWorkspace)return new Map(tbiMapping.items.map(item=>[item.sourceCueId,item.destinationCueId]));
 return new Map();
}
