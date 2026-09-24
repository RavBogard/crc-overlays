/**
 * The cue log, read side (2026-09-14 integration ruling 7: "the cue log is the service's
 * ground truth"). The relay holds a bounded per-workspace history of accepted commands —
 * 2,000 rows or 14 days, whichever is smaller — and this is the only way in or out of it
 * from the web: `GET /api/history` for an authoring member or a `history_reader` credential,
 * and an administrator's "clear history".
 *
 * The relay stores the `library:` source ids of the graphic it had pinned, not a resolved
 * position: only this side holds the siddur library. So the join happens here, on the way out,
 * which is also why a moment table that lands later starts answering for services already
 * recorded. The ids themselves never leave this module.
 *
 * What a row may carry is fixed here as well as in the relay: a sequence, a time, the action,
 * the graphic's id, its liturgical position, where the command came from, the prepared service if
 * one was named, and the command's own correlation id (ruling 10). Never a graphic name, never
 * text, never who was at the desk, never
 * renderer presence — "bounded operational history, not permanent personal surveillance".
 * Every row is rebuilt key by key and then walked, in production and not only in tests, so a
 * relay that one day answered with more than it should could still not publish it.
 */

import {liturgyForSourceIds} from './liturgy-index';
import {relayConfigured,relayRequest} from './relay';

export const HISTORY_KEYS=['seq','at','action','cueId','unitId','momentId','book','folio','source','serviceRef','commandId'] as const;
export const HISTORY_ACTIONS=['in','out','clear','cut','bug','logo','history_cleared'] as const;
export const HISTORY_SOURCES=['control','companion','mcp'] as const;
export const MAX_HISTORY_PAGE=500;
export type HistoryAction=typeof HISTORY_ACTIONS[number];
export type HistorySource=typeof HISTORY_SOURCES[number];
export type ServiceHistoryRow={seq:number;at:number;action:HistoryAction;cueId:string|null;unitId:string|null;momentId:string|null;book:string|null;folio:number|null;source:HistorySource;serviceRef:string|null;commandId:string|null};
export type ServiceHistory={workspace:string;rows:ServiceHistoryRow[];nextAfter:number|null;window:{rows:number;days:number}};
export type HistoryQuery={since?:string|number|null;until?:string|number|null;after?:string|number|null;limit?:string|number|null};

export class HistoryError extends Error{constructor(readonly status:number,message:string){super(message)}}
export const HISTORY_UNCONFIGURED='The service history needs the live connection.';
export const HISTORY_UNAVAILABLE='The service history is unavailable. Nothing was changed.';
export const HISTORY_RANGE='Ask for a time range in milliseconds since the epoch.';

/** Digits only, so a range is never silently reinterpreted; absent means "the relay decides". */
export function historyQuery(query:HistoryQuery):string{
 const parameters=new URLSearchParams();
 for(const key of ['since','until','after','limit'] as const){
  const raw=query[key];
  if(raw===undefined||raw===null||raw==='')continue;
  const value=String(raw);
  if(!/^\d{1,15}$/.test(value))throw new HistoryError(400,HISTORY_RANGE);
  parameters.set(key,value);
 }
 const encoded=parameters.toString();
 return encoded?`?${encoded}`:'';
}

const text=(value:unknown,limit:number)=>typeof value==='string'&&value.length>0&&value.length<=limit?value:null;
// Ruling 10: the caller's own correlation id, so an agent can find the row its command wrote. It
// names no member and no connection; anything not shaped like a command id is dropped.
const commandIdOf=(value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(value)?value:null;
const count=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0?value as number:null;
/**
 * The pinned source ids of one row, kept verbatim. Like the relay side, this no longer drops
 * everything without a `library:` prefix: a cue published with a bare unit id carries a real
 * liturgical position and used to be filtered out twice before anything could resolve it.
 * Deciding what an id means belongs to `liturgyForSourceIds`, which sees the library.
 */
const sourceIdsOf=(value:unknown)=>Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=160):[];

/**
 * One row, rebuilt from validated parts and joined to the library. An unrecognised row is
 * dropped rather than passed through, and `sourceIds` is consumed here, never emitted.
 */
export function readHistoryRow(value:unknown):ServiceHistoryRow|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const row=value as Record<string,unknown>;
 const seq=count(row.seq),at=count(row.at);
 if(seq===null||at===null)return null;
 if(!HISTORY_ACTIONS.includes(row.action as HistoryAction)||!HISTORY_SOURCES.includes(row.source as HistorySource))return null;
 const reference=liturgyForSourceIds(sourceIdsOf(row.sourceIds));
 return {
  seq,at,action:row.action as HistoryAction,cueId:text(row.cueId,160),
  unitId:reference.unitId,momentId:reference.momentId,book:reference.book,folio:reference.folio,
  source:row.source as HistorySource,serviceRef:text(row.serviceRef,160),commandId:commandIdOf(row.commandId),
 };
}

/** The last word before anything leaves: a row carrying an unexpected key is never published. */
export function assertOnlyAllowedKeys(rows:readonly ServiceHistoryRow[]){
 for(const row of rows)for(const key of Object.keys(row))
  if(!(HISTORY_KEYS as readonly string[]).includes(key))throw new HistoryError(503,HISTORY_UNAVAILABLE);
}

function readWindow(value:unknown):{rows:number;days:number}{
 const window=(value&&typeof value==='object'&&!Array.isArray(value)?value:{}) as Record<string,unknown>;
 return {rows:count(window.rows)??0,days:count(window.days)??0};
}

export function readServiceHistoryBody(value:unknown):ServiceHistory{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new HistoryError(503,HISTORY_UNAVAILABLE);
 const body=value as Record<string,unknown>;
 const rows=(Array.isArray(body.rows)?body.rows:[]).map(readHistoryRow).filter((row):row is ServiceHistoryRow=>row!==null);
 assertOnlyAllowedKeys(rows);
 return {workspace:text(body.workspace,80)??'',rows,nextAfter:count(body.nextAfter),window:readWindow(body.window)};
}

/**
 * The read. The legacy Postgres path keeps no history and none is built for it: without the
 * live relay there is nothing to answer with, and the refusal says so.
 */
export async function readServiceHistory(query:HistoryQuery={}):Promise<ServiceHistory>{
 if(!relayConfigured())throw new HistoryError(409,HISTORY_UNCONFIGURED);
 const suffix=historyQuery(query);
 let response:Response;
 try{response=await relayRequest(`/history${suffix}`)}
 catch{throw new HistoryError(503,HISTORY_UNAVAILABLE)}
 if(response.status===400)throw new HistoryError(400,HISTORY_RANGE);
 if(!response.ok)throw new HistoryError(503,HISTORY_UNAVAILABLE);
 try{return readServiceHistoryBody(await response.json())}
 catch(error){if(error instanceof HistoryError)throw error;throw new HistoryError(503,HISTORY_UNAVAILABLE)}
}

/** The administrator's clear. The clearing itself stays in the log as its own row. */
export async function clearServiceHistory():Promise<{cleared:number;seq:number}>{
 if(!relayConfigured())throw new HistoryError(409,HISTORY_UNCONFIGURED);
 let response:Response;
 try{response=await relayRequest('/history/clear',{})}
 catch{throw new HistoryError(503,HISTORY_UNAVAILABLE)}
 if(!response.ok)throw new HistoryError(503,HISTORY_UNAVAILABLE);
 const body=await response.json() as Record<string,unknown>;
 return {cleared:count(body?.cleared)??0,seq:count(body?.seq)??0};
}
