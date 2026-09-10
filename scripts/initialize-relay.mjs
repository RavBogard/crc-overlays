// Run through tsx with production environment explicitly loaded. Never runs at startup.
import {legacySnapshot} from '../lib/server.ts';
import {relayRequest} from '../lib/relay.ts';
import {db} from '../lib/database.ts';
try{
 const state=await legacySnapshot();
 const response=await relayRequest('/initialize',{state,catalogVersion:state.catalogVersion});
 if(!response.ok)throw Error(`Relay initialization refused (${response.status})`);
 const result=await response.json();
 console.log(JSON.stringify({initialized:true,revision:result.revision??result.snapshot?.revision}));
}finally{await db.end()}
