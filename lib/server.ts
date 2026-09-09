import {Pool, types} from 'pg';
import {createHash} from 'node:crypto';
import cues from './cues.json';
// The schema restricts counters to JavaScript-safe integers.
types.setTypeParser(20, value=>Number(value));
const globalDb=globalThis as unknown as {crcPool?:Pool};
export const db=globalDb.crcPool??new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,allowExitOnIdle:true});
if(!globalDb.crcPool)db.on('error',()=>console.error('CRC database idle connection closed; reconnecting on next request.'));
globalDb.crcPool=db;
export function authorized(request:Request,control=false){const token=request.headers.get('authorization')?.replace(/^Bearer /,'');return !!token&&((!!process.env.CONTROL_KEY&&token===process.env.CONTROL_KEY)||(!control&&!!process.env.OUTPUT_KEY&&token===process.env.OUTPUT_KEY));}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})}
export function knownCue(id:unknown){return typeof id==='string'&&cues.some(c=>c.id===id)}
export {cues};
export const catalogVersion=createHash('sha256').update(JSON.stringify(cues)).digest('hex').slice(0,16);
export async function snapshot(){const state=(await db.query('SELECT revision,cue,mode,updated FROM state WHERE id=1')).rows[0]??{revision:0,cue:null,mode:'animate',updated:0};const rs=await db.query('SELECT id,revision,cue,phase,seen FROM renderers WHERE seen>$1 ORDER BY seen DESC',[Date.now()-8000]);return {...state,catalogVersion,renderers:rs.rows,serverTime:Date.now()}}
