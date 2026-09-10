import {relayConfigured,relayRequest} from '@/lib/relay';
import {authorized,json,db,catalog,snapshot} from '@/lib/server';
export async function POST(r:Request){if(!authorized(r,true))return json({error:'Control key required'},401);
try{if(Number(r.headers.get('content-length'))>4096)return json({error:'Request too large'},413);const raw=await r.text();if(raw.length>4096)return json({error:'Request too large'},413);let b:any;try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}if(!b||typeof b!=='object')return json({error:'Invalid command'},400);
const useRelay=relayConfigured();
const selectedCatalog=!useRelay&&['in','out'].includes(b.action)?await catalog():null;
const selected=selectedCatalog?.cues.find(c=>c.id===b.cue)??null;
if(!['in','out','clear','cut'].includes(b.action)||(['in','out'].includes(b.action)&&(typeof b.cue!=='string'||b.cue.length>160||(!useRelay&&!selected))))return json({error:'Unknown action or cue'},400);
const id=b.commandId??crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return json({error:'Invalid command ID'},400);
const cue=['in','out'].includes(b.action)?b.cue:null;
const client=b.clientId??null;const sequence=b.sequence??null;if(client!==null&&(typeof client!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(client)||!Number.isSafeInteger(sequence)||sequence<0))return json({error:'Invalid controller sequence'},400);
if(useRelay){
 const response=await relayRequest('/command',{action:b.action,cue,commandId:id,clientId:client,sequence});
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
if(client===null||sequence>previous){
await connection.query(`UPDATE state SET revision=revision+1,cue=CASE WHEN $1='in' THEN $2 WHEN $1='out' AND cue IS DISTINCT FROM $2 THEN cue ELSE NULL END,mode=$3,updated=$4,cue_payload=CASE WHEN $1='in' THEN $5::jsonb WHEN $1='out' AND cue IS DISTINCT FROM $2 THEN cue_payload ELSE NULL END WHERE id=1`,[b.action,cue,b.action==='cut'?'cut':'animate',Date.now(),selected?JSON.stringify(selected):null]);
if(client!==null)await connection.query('INSERT INTO controllers(id,sequence) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET sequence=EXCLUDED.sequence',[client,sequence]);
}
await connection.query('INSERT INTO commands(id,action,cue,created) VALUES($1,$2,$3,$4)',[id,b.action,cue,Date.now()]);
}
await connection.query('COMMIT');
}catch(e){await connection.query('ROLLBACK');throw e}finally{connection.release()}
return json({commandId:id,...await snapshot()});
}catch{return json({error:'Command could not be confirmed. Check state before retrying with the same command ID.'},503)}}


