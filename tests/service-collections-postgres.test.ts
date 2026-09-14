import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {Pool} from 'pg';
import {PgServicesRepository,type ServiceCollection} from '../lib/service-collections.ts';

test('PostgreSQL repository persists JSON and rejects a stale version atomically',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query(fs.readFileSync(new URL('../db/service-collections.sql',import.meta.url),'utf8'));
  const repository=new PgServicesRepository(client),id=`test-${Date.now()}`;
  const initial:ServiceCollection={id,name:'Test service',service:'Test',version:1,archived:false,entries:[],coverage:[],createdAt:1,updatedAt:1,createdBy:'test',updatedBy:'test'};
  await repository.insertCollection(initial);
  assert.equal((await repository.listCollections()).find(item=>item.id===id)?.name,'Test service');
  assert.equal(await repository.replaceCollection({...initial,name:'Changed',version:2},1),true);
  assert.equal(await repository.replaceCollection({...initial,name:'Stale',version:2},1),false);
  // D9 - a names list is jsonb on the same document: no column, no migration.
  const names={title:'Mi Shebeirach',perPanel:8,layout:'left' as const,rows:[{he:'רבקה',en:'Rebecca'},{he:'',en:'Ada'}],updatedAt:2,updatedBy:'test'};
  assert.equal(await repository.replaceCollection({...initial,name:'Changed',version:3,names},2),true);
  const stored=(await repository.listCollections()).find(item=>item.id===id);
  assert.deepEqual(stored?.names,names);
  assert.equal(await repository.replaceCollection({...initial,version:4,names:null},2),false,'a stale expectedVersion cannot clear a names list');
  // Archiving nulls the names in the same optimistic write.
  assert.equal(await repository.replaceCollection({...initial,version:4,archived:true,names:null},3),true);
  assert.equal((await repository.listCollections(true)).find(item=>item.id===id)?.names,null);
 }finally{await client.query('ROLLBACK');client.release();await pool.end()}
});
