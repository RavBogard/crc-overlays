import {authorized,json} from '@/lib/server';
import {relayConfigured} from '@/lib/relay';
import {syncLiveCatalog} from '@/lib/sync-live-catalog';

// Explicit recovery for a publication saved while the live relay was unavailable.
export async function POST(request:Request){
 if(!authorized(request,true))return json({error:'Control key required'},401);
 if(!relayConfigured())return json({error:'Live relay is not configured'},503);
 try{
  return json({synced:true,...await syncLiveCatalog()});
 }catch{return json({error:'Live library could not be synchronized. Your saved edits are preserved; try again when the connection recovers.'},503)}
}
