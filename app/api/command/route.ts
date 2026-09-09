import {authorized,json,bindings,knownCue,snapshot} from '@/lib/server';
export async function POST(r:Request){if(!authorized(r,true))return json({error:'Control key required'},401);
try{if(Number(r.headers.get('content-length'))>4096)return json({error:'Request too large'},413);const raw=await r.text();if(raw.length>4096)return json({error:'Request too large'},413);let b:any;try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}if(!b||typeof b!=='object')return json({error:'Invalid command'},400);
if(!['in','out','clear','cut'].includes(b.action)||(['in','out'].includes(b.action)&&!knownCue(b.cue)))return json({error:'Unknown action or cue'},400);
const id=b.commandId??crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(id))return json({error:'Invalid command ID'},400);
const cue=['in','out'].includes(b.action)?b.cue:null;const db=bindings().DB;
const client=b.clientId??null;const sequence=b.sequence??null;if(client!==null&&(typeof client!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(client)||!Number.isSafeInteger(sequence)||sequence<0))return json({error:'Invalid controller sequence'},400);
await db.batch([
db.prepare('INSERT OR IGNORE INTO state(id) VALUES(1)'),
db.prepare('INSERT OR IGNORE INTO commands(id,action,cue,created) VALUES(?,?,?,?)').bind(id,b.action,cue,Date.now()),
db.prepare(`UPDATE state SET revision=revision+1,cue=CASE WHEN ?='in' THEN ? WHEN ?='out' AND cue IS NOT ? THEN cue ELSE NULL END,mode=?,updated=? WHERE id=1 AND EXISTS(SELECT 1 FROM commands WHERE id=? AND processed=0) AND (? IS NULL OR ?>COALESCE((SELECT sequence FROM controllers WHERE id=?),-1))`).bind(b.action,cue,b.action,cue,b.action==='cut'?'cut':'animate',Date.now(),id,client,sequence,client),
db.prepare('INSERT INTO controllers(id,sequence) SELECT ?,? WHERE ? IS NOT NULL ON CONFLICT(id) DO UPDATE SET sequence=MAX(controllers.sequence,excluded.sequence)').bind(client,sequence,client),
db.prepare('UPDATE commands SET processed=1 WHERE id=?').bind(id)
]);
const command=await db.prepare('SELECT action,cue FROM commands WHERE id=?').bind(id).first();
if(command?.action!==b.action||command?.cue!==cue)return json({error:'Command ID already used for a different command'},409);
return json({commandId:id,...await snapshot()});
}catch{return json({error:'Command could not be confirmed. Check state before retrying with the same command ID.'},503)}}


