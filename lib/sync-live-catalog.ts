import {authoringCatalog} from './server';
import {relayCatalog,relayRequest} from './relay';

type SyncDependencies={readRelay:typeof relayCatalog;readAuthoring:typeof authoringCatalog;writeRelay:typeof relayRequest};
export async function syncLiveCatalog(dependencies:SyncDependencies={readRelay:relayCatalog,readAuthoring:authoringCatalog,writeRelay:relayRequest}){
 // Read the relay marker BEFORE the authoring snapshot. Compare-and-swap prevents
 // a slow older publication from overwriting a newer concurrently synced library.
 for(let attempt=0;attempt<3;attempt++){
  const before=await dependencies.readRelay();
  const current=await dependencies.readAuthoring();
  const response=await dependencies.writeRelay('/catalog',{...current,expectedVersion:before.version});
  if(response.ok)return {version:current.version,count:current.cues.length};
  if(response.status!==409)throw Error('Live library synchronization unavailable');
 }
 throw Error('Live library changed concurrently. Retry synchronization.');
}
