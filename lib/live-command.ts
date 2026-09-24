import {relayConfigured,relayRequest} from './relay';
import {db,catalog,snapshot} from './server';
import {getPublicWorkspace} from './workspace';
import {validBugPage,type BugState} from './bug-layer';
import type {RestingLogoState} from './resting-logo';

/**
 * The one path a live command takes to the output, shared by POST /api/command (the console and
 * Companion) and the MCP live tools (V3), so validation, the plain-language refusals and the relay
 * call cannot drift between them. It answers `{status, body}` exactly as the route always has; the
 * typed fields beside them are read from that body and never change it.
 */
export type CommandSource='control'|'companion'|'mcp';
export type LiveCommandBody={action?:string;cue?:string|null;bug?:{on?:unknown;page?:unknown}|null;logo?:{on?:unknown}|null;commandId?:string;clientId?:string|null;sequence?:number|null;serviceRef?:string|null;ifRevision?:unknown;ifCue?:unknown};
export type CommandOutcome='applied'|'replayed'|'superseded';
export type LastPress={control:number|null;companion:number|null;mcp:number|null};
export type LiveCommandAnswer={status:number;body:unknown;outcome:CommandOutcome|null;originalOutcome:'applied'|'superseded'|null;lastPress:LastPress|null};

const TOKEN=/^[a-zA-Z0-9_-]{8,80}$/;
const SERVICE_REF=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// The same two shapes, for the MCP live tools' schemas (lib/mcp/live.ts), so a value the schema
// accepts is one this core accepts too.
export const COMMAND_ID_PATTERN=TOKEN,SERVICE_REF_PATTERN=SERVICE_REF;
const NOT_CONFIRMED='Command could not be confirmed. Check state before retrying with the same command ID.';
const pressTime=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0?value as number:null;
/** V1's answer fields, read defensively: a relay released before V1 sends none and every field is null. */
export function readCommandAnswer(status:number,raw:unknown):LiveCommandAnswer{
 // The route returns whatever the relay said, byte for byte; only the typed reads need an object.
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {status,body:raw,outcome:null,originalOutcome:null,lastPress:null};
 const body=raw as Record<string,unknown>;
 const outcome=['applied','replayed','superseded'].includes(body.outcome as string)?body.outcome as CommandOutcome:null;
 const originalOutcome=outcome==='replayed'&&(body.originalOutcome==='applied'||body.originalOutcome==='superseded')?body.originalOutcome:null;
 const press=body.lastPress&&typeof body.lastPress==='object'&&!Array.isArray(body.lastPress)?body.lastPress as Record<string,unknown>:null;
 return {status,body,outcome,originalOutcome,lastPress:press?{control:pressTime(press.control),companion:pressTime(press.companion),mcp:pressTime(press.mcp)}:null};
}
const answer=(body:unknown,status=200)=>readCommandAnswer(status,body);

// An MCP connection is one controller: its id comes from the token family (lib/oauth-store.ts puts
// it on the verified token), and its sequence is the clock, so two serverless instances serving the
// same connection still order its presses by when they were made. Microseconds from the ms clock,
// bumped when two land in the same millisecond on one instance; well inside a safe integer.
let lastSequence=0;
export function clockSequence(now=Date.now()){lastSequence=Math.max(now*1000,lastSequence+1);return lastSequence}
export function mcpController(extra:Record<string,unknown>|undefined){const id=extra?.liveController;return typeof id==='string'&&TOKEN.test(id)?id:null}

export async function runLiveCommand(b:LiveCommandBody,source:CommandSource):Promise<LiveCommandAnswer>{
try{
const useRelay=relayConfigured();
const selectedCatalog=!useRelay&&['in','out'].includes(b.action as string)?await catalog():null;
const selected=selectedCatalog?.cues.find(c=>c.id===b.cue)??null;
if(!['in','out','clear','cut','bug','logo'].includes(b.action as string)||(['in','out'].includes(b.action as string)&&(typeof b.cue!=='string'||b.cue.length>160||(!useRelay&&!selected))))return answer({error:'Unknown action or cue'},400);
// D2/D4: the scan card is a congregation-configured, relay-only layer. It is refused in plain
// language rather than as a protocol error, because an operator sees these strings.
let bug:BugState|null=null;
if(b.action==='bug'){
 if(b.cue!==undefined&&b.cue!==null)return answer({error:'Unknown action or cue'},400);
 let enabled=false;try{enabled=getPublicWorkspace().bug.enabled}catch{enabled=false}
 if(!enabled)return answer({error:'The scan card is not set up for this congregation.'},400);
 const requested=b.bug;
 if(!requested||typeof requested!=='object'||Array.isArray(requested)||typeof requested.on!=='boolean')return answer({error:'Unknown action or cue'},400);
 const page=requested.page===undefined?null:requested.page;
 if(!validBugPage(page))return answer({error:'Page must be 12 characters or fewer.'},400);
 if(!useRelay)return answer({error:'The scan card needs the live connection.'},503);
 bug={on:requested.on,page:page as string|null};
}
// The resting logo: the same shape of refusal one feature over, and deliberately not the scan
// card. A congregation without the capability is told so in plain words rather than quietly
// getting nothing, and the request needs the live connection because the preference lives in
// relay state -- there is no Postgres column for it and inventing one per browser would give
// every output its own answer.
let logo:RestingLogoState|null=null;
if(b.action==='logo'){
 if(b.cue!==undefined&&b.cue!==null)return answer({error:'Unknown action or cue'},400);
 let available=false;try{available=getPublicWorkspace().restingLogo.enabled}catch{available=false}
 if(!available)return answer({error:'The resting logo is not set up for this congregation.'},400);
 const requested=b.logo;
 if(!requested||typeof requested!=='object'||Array.isArray(requested)||typeof requested.on!=='boolean')return answer({error:'Unknown action or cue'},400);
 if(!useRelay)return answer({error:'The resting logo needs the live connection.'},503);
 logo={on:requested.on};
}
const id=b.commandId??crypto.randomUUID();if(typeof id!=='string'||!TOKEN.test(id))return answer({error:'Invalid command ID'},400);
const cue=['in','out'].includes(b.action as string)?b.cue:null;
const client=b.clientId??null;const sequence=b.sequence??null;if(client!==null&&(typeof client!=='string'||!TOKEN.test(client)||!Number.isSafeInteger(sequence)||(sequence as number)<0))return answer({error:'Invalid controller sequence'},400);
// The prepared service this command belongs to, when the caller knows it. Additive and
// optional: nothing on screen asks an operator to load a service, so today it arrives only
// from a caller that already has one in hand, and a names panel names its own collection
// inside the relay. The legacy Postgres path keeps no history and ignores it.
const serviceRef=b.serviceRef??null;if(serviceRef!==null&&(typeof serviceRef!=='string'||!SERVICE_REF.test(serviceRef)))return answer({error:'Invalid service reference'},400);
// V1's preconditions, passed through only when given, so every existing caller's relay request is
// unchanged. The relay is their one judge; the legacy path cannot honour them and says so.
const conditions:{ifRevision?:number;ifCue?:string|null}={};
if(b.ifRevision!==undefined){if(!Number.isSafeInteger(b.ifRevision)||(b.ifRevision as number)<0)return answer({error:'Invalid command precondition'},400);conditions.ifRevision=b.ifRevision as number}
if(b.ifCue!==undefined){if(b.ifCue!==null&&!(typeof b.ifCue==='string'&&b.ifCue.length>0&&b.ifCue.length<=160))return answer({error:'Invalid command precondition'},400);conditions.ifCue=b.ifCue as string|null}
if(useRelay){
 const response=await relayRequest('/command',{action:b.action,cue,bug,logo,commandId:id,clientId:client,sequence,source,serviceRef,...conditions});
 const body=await response.json();
 // The one release-order hazard this feature has: a relay that predates the resting logo
 // refuses `action:'logo'` as an invalid command, and "Invalid command" would send an operator
 // looking for a typo. Name the real cause instead. The relay ships before the web
 // (docs/RELAY-RELEASE.md), so this sentence should never be seen in a finished release; it is
 // here so a half-finished one explains itself.
 if(b.action==='logo'&&response.status===400)return answer({error:'The resting logo needs the updated live service. Release the relay before the site.'},503);
 return answer(body,response.status);
}
if(Object.keys(conditions).length)return answer({error:'Conditional commands need the live connection.'},503);
const connection=await db.connect();
try{
await connection.query('BEGIN');
// Serialize the single CRC output so concurrent cues and clears are atomic.
await connection.query('SELECT id FROM state WHERE id=1 FOR UPDATE');
const prior=(await connection.query('SELECT action,cue FROM commands WHERE id=$1',[id])).rows[0];
if(prior&&(prior.action!==b.action||prior.cue!==cue)){await connection.query('ROLLBACK');return answer({error:'Command ID already used for a different command'},409)}
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
return answer({commandId:id,...await snapshot()});
}catch{return answer({error:NOT_CONFIRMED},503)}}

/**
 * An MCP live command: source 'mcp', this connection's controller id and a clock sequence. The
 * caller's commandId is kept, so a retried tool call replays instead of pressing twice.
 */
export function runMcpCommand(b:Omit<LiveCommandBody,'clientId'|'sequence'>,extra:Record<string,unknown>|undefined){
 const clientId=mcpController(extra);
 if(!clientId)return Promise.resolve(answer({error:'This connection has no live controller identity. Reconnect it and try again.'},401));
 return runLiveCommand({...b,clientId,sequence:clockSequence()},'mcp');
}
