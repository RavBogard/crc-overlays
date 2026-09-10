import {db} from '../lib/database.ts';
import {syncLiveCatalog} from '../lib/sync-live-catalog.ts';
try{
 await syncLiveCatalog();
 console.log('Relay catalog synchronization confirmed');
}finally{await db.end()}
