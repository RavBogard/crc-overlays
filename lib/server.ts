import {createHash} from 'node:crypto';
import cues from './cues.json';
import {db} from './database';
import {publishedCues} from './authoring';
import type {Cue} from './player';
export {db};
export function authorized(request:Request,control=false){const token=request.headers.get('authorization')?.replace(/^Bearer /,'');return !!token&&((!!process.env.CONTROL_KEY&&token===process.env.CONTROL_KEY)||(!control&&!!process.env.OUTPUT_KEY&&token===process.env.OUTPUT_KEY));}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})}
export async function catalog(){const active=new Map<string,Cue>(cues.map(c=>[c.id,c as unknown as Cue]));for(const cue of await publishedCues())active.set(cue.id,cue);const items=Array.from(active.values());return {cues:items,version:createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0,16)}}
export async function knownCue(id:unknown){return typeof id==='string'&&(await catalog()).cues.some(c=>c.id===id)}
export {cues};
export async function snapshot(){const state=(await db.query('SELECT revision,cue,mode,updated,cue_payload AS "cuePayload" FROM state WHERE id=1')).rows[0]??{revision:0,cue:null,mode:'animate',updated:0};const rs=await db.query('SELECT id,revision,cue,phase,seen FROM renderers WHERE seen>$1 ORDER BY seen DESC',[Date.now()-8000]);return {...state,catalogVersion:(await catalog()).version,renderers:rs.rows,serverTime:Date.now()}}
