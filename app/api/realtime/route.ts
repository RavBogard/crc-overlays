import {authorizeRequest} from '@/lib/access';
import {json} from '@/lib/server';
import {relayConfigured,relayConnection,type RelayRole} from '@/lib/relay';

export async function GET(request:Request){
 const role=new URL(request.url).searchParams.get('role')??'output';
 if(!['control','output','preview'].includes(role))return json({error:'Unknown live role'},400);
 // A new live connection verifies a device token against the store directly, past the
 // D4 positive cache, so a revoked device is refused here at its next reconnection -
 // the promise /access makes. Ordinary API calls keep the cache.
 if(!await authorizeRequest(request,role==='control'?'control':'read',{freshDevice:true}))return json({error:'Access key required'},401);
 if(!relayConfigured())return json({error:'Live relay is not configured. Rehearsal is disconnected.'},503);
 try{return json(relayConnection(role as RelayRole))}catch{return json({error:'Live relay configuration unavailable'},503)}
}
