import {Pool, types} from 'pg';
types.setTypeParser(20, value => Number(value));
const globalDb = globalThis as unknown as {crcPool?: Pool};
export const db = globalDb.crcPool ?? new Pool({connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true});
if (!globalDb.crcPool) db.on('error', () => console.error('CRC database idle connection closed; reconnecting on next request.'));
globalDb.crcPool = db;
