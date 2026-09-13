import {Pool} from 'pg';
import fs from 'node:fs';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
try{await pool.query(fs.readFileSync(new URL('../db/operations.sql',import.meta.url),'utf8'));console.log('Operations schema ready.')}finally{await pool.end()}
