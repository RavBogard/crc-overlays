import {catalog,db} from '../lib/server.ts';
import {relayRequest} from '../lib/relay.ts';
try{
 const {version}=await catalog();
 const response=await relayRequest('/catalog',{version});
 if(!response.ok)throw Error(`Relay catalog update refused (${response.status})`);
 console.log('Relay catalog notification confirmed');
}finally{await db.end()}
