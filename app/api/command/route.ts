import {authorizeRequest} from '@/lib/access';
import {relayConfigured,relayRequest} from '@/lib/relay';
import {json,db,catalog,snapshot} from '@/lib/server';
import {getPublicWorkspace} from '@/lib/workspace';
import {validBugPage,type BugState} from '@/lib/bug-layer';
type CommandBody={action?:string;cue?:string|null;bug?:{on?:unknown;page?:unknown}|null;commandId?:string;clientId?:string|null;sequence?:number|null;serviceRef?:string|null};
export async function POST(r:Request){const actor=await authorizeRequest(r,'control');if(!actor)return json({error:'Control key required'},401);
// The cue log records where a command came from, never who sent it. Only a paired Companion
// holds a device credential that satisfies 'control', so that is the one distinction drawn;
// a member session and the transitional shared key are both plain live control.
const source=actor.id.startsWith('device:')?'companion':'control';
try{if(Number(r.headers.get('content-length'))>4096)return json({error:'Request too large'},413);const raw=await r.text();if(raw.length>4096)return json({error:'Request too large'},413);let b:CommandBody;try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}if(!b||typeof b!=='object')return json({error:'Invalid command'},400);
const useRelay=relayConfigured();
const selectedCatalog=!useRelay&&['in','out'].includes(b.action as string)?await catalog():null;
const selected=selectedCatalog?.cues.find(c=>c.id===b.cue)??null;
if(!['in','out','clear','cut','bug'].includes(b.action as string)||(['in','out'].includes(b.action as string)&&(typeof b.cue!=='string'||b.cue.length>160||(!useRelay&&!selected))))return json({error:'Unknown action or cue'},400);
// D2/D4: the scan card is a congregation-configured, relay-only layer. It is refused in plain
// language rather than as a protocol error, because an operator sees these strings.
let bug:BugState|null=null;
if(b.action==='bug'){
 if(b.cue!==undefined&&b.cue!==null)return json({error:'Unknown action or cue'},400);
 let enabled=false;try{enabled=getPublicWorkspace().bug.enabled}catch{enabled=false}
 if(!enabled)return json({error:'The scan card is not set up for this congregation.'},400);
 const requested=b.bug;
 if(!requested||typeof requested!=='object'||Array.isArray(requested)||typeof requested.on!=='boolean')return json({error:'Unknown action or cue'},400);
 const page=requested.page===undefined?null:requested.page;
 if(!validBugPage(page))return json({error:'Page must be 12 characters or fewer.'},400);
 if(!useRelay)return json({error:'The scan card needs the live connection.'},503);
 bug={on:requested.on,page:page as string|null};
}
const id=b.commandId??crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return json({error:'Invalid command ID'},400);
const cue=['in','out'].includes(b.action as string)?b.cue:null;
const client=b.clientId??null;const sequence=b.sequence??null;if(client!==null&&(typeof client!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(client)||!Number.isSafeInteger(sequence)||(sequence as number)<0))return json({error:'Invalid controller sequence'},400);
// The prepared service this command belongs to, when the caller knows it. Additive and
// optional: nothing on screen asks an operator to load a service, so today it arrives only
// from a caller that already has one in hand, and a names panel names its own collection
// inside the relay. The legacy Postgres path keeps no history and ignores it.
const serviceRef=b.serviceRef??null;if(serviceRef!==null&&(typeof serviceRef!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(serviceRef)))return json({error:'Invalid service reference'},400);
if(useRelay){
 const response=await relayRequest('/command',{action:b.action,cue,bug,commandId:id,clientId:client,sequence,source,serviceRef});
 return json(await response.json(),response.status);
}
const connection=await db.connect();
try{
await connection.query('BEGIN');
// Serialize the single CRC output so concurrent cues and clears are atomic.
await connection.query('SELECT id FROM state WHERE id=1 FOR UPDATE');
const prior=(await connection.query('SELECT action,cue FROM commands WHERE id=$1',[id])).rows[0];
if(prior&&(prior.action!==b.action||prior.cue!==cue)){await connection.query('ROLLBACK');return json({error:'Command ID already used for a different command'},409)}
if(!prior){
const previous=client===null?-1:((await connection.query('SELECT sequence FROM controllers WHERE id=$1',[client])).rows[0]?.sequence??-1);
if(client===null||(sequence as number)>previous){
await connection.query(`UPDATE state SET revision=revision+1,cue=CASE WHEN $1='in' THEN $2 WHEN $1='out' AND cue IS DISTINCT FROM $2 THEN cue ELSE NULL END,mode=$3,updated=$4,cue_payload=CASE WHEN $1='in' THEN $5::jsonb WHEN $1='out' AND cue IS DISTINCT FROM $2 THEN cue_payload ELSE NULL END WHERE id=1`,[b.action,cue,b.action==='cut'?'cut':'animate',Date.now(),selected?JSON.stringify(selected):null]);
if(client!==null)await connection.query('INSERT INTO controllers(id,sequence) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET sequence=EXCLUDED.sequence',[client,sequence]);
}
await connection.query('INSERT INTO commands(id,action,cue,created) VALUES($1,$2,$3,$4)',[id,b.action,cue,Date.now()]);
}
await connection.query('COMMIT');
}catch(e){await connection.query('ROLLBACK');throw e}finally{connection.release()}
return json({commandId:id,...await snapshot()});
}catch{return json({error:'Command could not be confirmed. Check state before retrying with the same command ID.'},503)}}


