import {Pool} from 'pg';
import fs from 'node:fs';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{await pool.query(fs.readFileSync(new URL('../db/postgres.sql',import.meta.url),'utf8'));console.log('CRC database schema ready.')}finally{await pool.end()}
