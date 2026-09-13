import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {Pool} from 'pg';
import {createAsset,PgAssetRepository} from '../lib/assets.ts';

test('PostgreSQL asset writes, versions, and publication roll back cleanly',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}),client=await pool.connect();try{await client.query('BEGIN');await client.query(fs.readFileSync(new URL('../db/assets.sql',import.meta.url),'utf8'));const repository=new PgAssetRepository(client),data=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')),asset=await createAsset(data,new Headers({'x-asset-name':'Test','x-asset-alt':'Test%20artwork'}),'test',repository);assert.equal((await repository.get(asset.id))?.published,false);assert.equal(await repository.markPublished(asset.id,2),true);assert.equal((await repository.get(asset.id))?.published,true);assert.equal((await repository.list()).some(item=>item.id===asset.id),true)}finally{await client.query('ROLLBACK');client.release();await pool.end()}
});
