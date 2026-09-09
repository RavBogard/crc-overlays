import {env} from 'cloudflare:workers';
import cues from './cues.json';
type Bindings={DB:D1Database;CONTROL_KEY?:string;OUTPUT_KEY?:string};
export function bindings(){return env as unknown as Bindings}
export function authorized(request:Request,control=false){const b=bindings();const token=request.headers.get('authorization')?.replace(/^Bearer /,'');return !!token&&((!!b.CONTROL_KEY&&token===b.CONTROL_KEY)||(!control&&!!b.OUTPUT_KEY&&token===b.OUTPUT_KEY));}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})}
export function knownCue(id:unknown){return typeof id==='string'&&cues.some(c=>c.id===id)}
export {cues};
export async function snapshot(){const db=bindings().DB;const state=await db.prepare('SELECT revision,cue,mode,updated FROM state WHERE id=1').first()??{revision:0,cue:null,mode:'animate',updated:0};const rs=await db.prepare('SELECT id,revision,cue,phase,seen FROM renderers WHERE seen>? ORDER BY seen DESC').bind(Date.now()-8000).all();return {...state,renderers:rs.results,serverTime:Date.now()}}
