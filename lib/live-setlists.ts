import {randomUUID} from 'node:crypto';
import {searchCues,cueSearchScore,friendlyCueName} from './cue-search';
import type {Cue} from './player';
import type {LiturgyRef} from './liturgy-index';
import type {CollectionEntry,CoverageItem} from './service-collections';
import type {ServiceRow} from './service-rows';

/**
 * D19 — G1 reads centralreform.live over its MCP HTTP endpoint through an injectable
 * transport, and the matcher that turns a setlist into a prepared service is pure.
 *
 * Nothing here is reachable until Daniel supplies `CRC_LIVE_BASE_URL` and
 * `CRC_LIVE_READ_TOKEN` (CRC project only): unset means `liveSetlistsAvailability` answers
 * `unconfigured`, the `/services` panel renders nothing at all, and the operation refuses
 * with 409 before any transport is constructed. No test, script or preview deployment in
 * this repo ever calls centralreform.live — every test drives `matchSetlist` from fixtures
 * under `tests/fixtures/setlists/`, and the default transport only ever sees a stub fetch.
 *
 * The credential is a `setlist_reader` bearer allowed exactly `list_setlists`,
 * `get_setlist` and `get_congregation_context`. It is never logged, never echoed into an
 * error message, and never reaches the browser.
 */

export type LiveSetlistTool='list_setlists'|'get_setlist'|'get_congregation_context';
export type LiveSetlistTransport=(tool:LiveSetlistTool,args:Record<string,unknown>)=>Promise<unknown>;

export class LiveSetlistsError extends Error{
 code:string;
 constructor(code:string,message=code){super(message);this.name='LiveSetlistsError';this.code=code}
}

export type LiveSetlistSummary={id:string;name:string;date:string|null;eventDate:string|null;trackCount:number;publishedAt:string|null};
/** One centralreform.live row, as `get_setlist` returns it. Unknown fields are ignored. */
export type LiveTrack={id?:unknown;order?:unknown;title?:unknown;type?:unknown;songId?:unknown;liturgyRef?:unknown;notes?:unknown};
export type LiveSetlist={id?:unknown;name?:unknown;date?:unknown;eventDate?:unknown;tracks?:unknown};

export type UnmatchedRow={trackId:string;title:string;kind:'liturgy'|'song'|'other';reason:string};
export type SetlistMatch={entries:CollectionEntry[];coverage:CoverageItem[];rows:ServiceRow[];unmatched:UnmatchedRow[]};

/**
 * Rows that carry no words for the screen. A header is a section label and a note is an
 * annotation for the band — neither is a moment of the service, so neither becomes an entry,
 * a coverage row or an unmatched row. Everything else (`song`, `reading`, `prayer`,
 * `transition`, and the legacy untyped row, which defaults to `song`) is a performance row.
 */
const NON_PERFORMANCE_TRACK_TYPES=new Set(['header','note']);

/**
 * `cueSearchScore` is a banded score, not a continuum: 100 is an exact cue-name match, 80 a
 * cue name that starts with the title, 60 the title appearing anywhere in the cue's indexed
 * text — which includes the prayer body, so a title can "match" a graphic that merely quotes
 * it — 45 a word-prefix match, 25 a fuzzy one. Auto-covering a row therefore requires a score
 * of at least 80: the match must be on the graphic's NAME, not on its body text. That is the
 * whole justification for the number; it is a band boundary, not a tuned constant.
 */
const CLEAR_MATCH_SCORE=80;
/**
 * Below the clear band, 45 is the weakest band that still matched on words rather than on a
 * fuzzy edit distance. A row with candidates at or above it is offered for review with every
 * candidate named; a row with nothing above it has no plausible graphic at all.
 */
const PLAUSIBLE_MATCH_SCORE=45;
/** How many candidate names one reason may carry before it would crowd the 500-char field. */
const MAX_NAMED_CANDIDATES=6;
/** `parseEntries`/`parseCoverage` bound a label at 160 characters and a reason at 500. */
const MAX_LABEL=160;
const MAX_REASON=500;
/** One coverage row per performance row; the collection parser accepts 200 entries and 300 rows. */
const MAX_IMPORT_ROWS=200;

const clip=(value:string,max:number)=>value.length<=max?value:`${value.slice(0,max-1)}…`;
const str=(value:unknown):string|null=>typeof value==='string'&&value?value:null;

/* ---------- availability and the default transport ---------- */

export type LiveSetlistsEnv={CRC_LIVE_BASE_URL?:string|undefined;CRC_LIVE_READ_TOKEN?:string|undefined;[key:string]:string|undefined};

function httpsOrigin(value:string|undefined):URL|null{
 if(!value)return null;
 try{const url=new URL(value);return url.protocol==='https:'?url:null}catch{return null}
}

export function liveSetlistsAvailability(env:LiveSetlistsEnv=process.env):{available:boolean;reason:'ok'|'unconfigured'}{
 const base=httpsOrigin(env.CRC_LIVE_BASE_URL),token=(env.CRC_LIVE_READ_TOKEN??'').trim();
 return base&&token?{available:true,reason:'ok'}:{available:false,reason:'unconfigured'};
}

/** 256 KB. A setlist is a few dozen rows; anything larger is not an answer we asked for. */
const MAX_RESPONSE_BYTES=256*1024;
const REQUEST_TIMEOUT_MS=5000;

async function boundedText(response:Response):Promise<string>{
 const reader=response.body?.getReader();
 if(!reader)return response.text();
 const decoder=new TextDecoder();let raw='',bytes=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  bytes+=value.byteLength;
  if(bytes>MAX_RESPONSE_BYTES){await reader.cancel();throw new LiveSetlistsError('response_too_large','centralreform.live sent more data than this import will read.')}
  raw+=decoder.decode(value,{stream:true});
 }
 return raw+decoder.decode();
}

/** The reply is either a JSON body or an SSE stream of `data:` events; the last one wins. */
function decodeRpc(raw:string):Record<string,unknown>{
 const trimmed=raw.trim();
 const events=trimmed.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).filter(Boolean);
 const body=events.length?events[events.length-1]:trimmed;
 try{const parsed=JSON.parse(body);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed as Record<string,unknown>}catch{/* falls through to the refusal below */}
 throw new LiveSetlistsError('unreadable_response','centralreform.live sent a reply this import could not read.');
}

/** A refusal arrives either as a JSON-RPC error or as `result.isError` with a rich envelope. */
function toolPayload(message:Record<string,unknown>):unknown{
 if(message.error)throw new LiveSetlistsError('rpc_error','centralreform.live refused this request.');
 const result=message.result as {isError?:unknown;content?:unknown}|undefined;
 if(!result||typeof result!=='object')throw new LiveSetlistsError('unreadable_response','centralreform.live sent a reply this import could not read.');
 if(result.isError)throw new LiveSetlistsError('tool_error','centralreform.live refused this request.');
 const first=Array.isArray(result.content)?result.content[0] as {text?:unknown}|undefined:undefined;
 const text=str(first?.text);
 if(text===null)throw new LiveSetlistsError('unreadable_response','centralreform.live sent a reply this import could not read.');
 let payload:unknown;
 try{payload=JSON.parse(text)}catch{throw new LiveSetlistsError('unreadable_response','centralreform.live sent a reply this import could not read.')}
 const envelope=payload as {ok?:unknown;error?:unknown}|null;
 if(envelope&&typeof envelope==='object'&&(envelope.ok===false||envelope.error))throw new LiveSetlistsError('tool_error','centralreform.live refused this request.');
 return payload;
}

/**
 * The one transport that reaches the network: JSON-RPC 2.0 `tools/call` POSTed to
 * `<base>/api/mcp`. No retry — a failed import is the operator's to repeat, not ours to
 * amplify — `redirect:'error'` so a redirect can never carry the bearer somewhere else, a
 * 5 s deadline, and a hard 256 KB cap on the body. The token appears in exactly one place:
 * the Authorization header. No error raised here contains it.
 */
export function createLiveTransport(env:LiveSetlistsEnv=process.env,fetchImpl:typeof fetch=globalThis.fetch):LiveSetlistTransport{
 const base=httpsOrigin(env.CRC_LIVE_BASE_URL),token=(env.CRC_LIVE_READ_TOKEN??'').trim();
 if(!base||!token)throw new LiveSetlistsError('unconfigured','Importing from centralreform.live is not set up for this congregation.');
 const endpoint=new URL('/api/mcp',base).toString();
 let id=0;
 return async(tool,args)=>{
  let response:Response;
  try{
   response=await fetchImpl(endpoint,{
    method:'POST',
    redirect:'error',
    signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/json, text/event-stream'},
    body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name:tool,arguments:args}}),
   });
  }catch(error){
   if(error instanceof LiveSetlistsError)throw error;
   throw new LiveSetlistsError('unreachable','centralreform.live could not be reached.');
  }
  if(!response.ok)throw new LiveSetlistsError('http_error',`centralreform.live answered ${response.status}.`);
  return toolPayload(decodeRpc(await boundedText(response)));
 };
}

/* ---------- reads ---------- */

export async function listRecentSetlists(transport:LiveSetlistTransport,{limit=20}:{limit?:number}={}):Promise<LiveSetlistSummary[]>{
 const payload=await transport('list_setlists',{limit,sort:'recent_event'});
 const rows=Array.isArray(payload)?payload:Array.isArray((payload as {setlists?:unknown}|null)?.setlists)?(payload as {setlists:unknown[]}).setlists:[];
 return rows.map(raw=>{
  const row=(raw??{}) as Record<string,unknown>;
  return {id:typeof row.id==='string'||typeof row.id==='number'?String(row.id):'',name:str(row.name)??'(untitled)',date:str(row.date),eventDate:str(row.eventDate),trackCount:typeof row.trackCount==='number'?row.trackCount:0,publishedAt:str(row.publishedAt)};
 }).filter(row=>row.id);
}

/* ---------- the pure matcher ---------- */

export type MatchDeps={cues:Cue[];liturgyFor:(cue:Cue)=>LiturgyRef;id?:()=>string};

// T2 - a book matches by its letters and digits alone, so a setlist's "Mishkan T'filah" meets a
// workspace source's "mishkan-tfilah"; slugs that already matched still match exactly.
const bookKey=(book:string)=>book.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const folioKey=(book:string,folio:number)=>`${bookKey(book)}|${folio}`;

function liturgyMap(deps:MatchDeps):Map<string,Cue[]>{
 const map=new Map<string,Cue[]>();
 for(const cue of deps.cues){
  const ref=deps.liturgyFor(cue);
  if(!ref||typeof ref.book!=='string'||!ref.book||typeof ref.folio!=='number'||!Number.isFinite(ref.folio))continue;
  const key=folioKey(ref.book,ref.folio);
  const bucket=map.get(key);if(bucket)bucket.push(cue);else map.set(key,[cue]);
 }
 return map;
}

function names(cues:Cue[]):string{
 const shown=cues.slice(0,MAX_NAMED_CANDIDATES).map(cue=>friendlyCueName(cue.name));
 const rest=cues.length-shown.length;
 return rest>0?`${shown.join(', ')} and ${rest} more`:shown.join(', ');
}

/** Candidate graphics for a title, and whether the best of them is unambiguously the one. */
function titleCandidates(title:string,cues:Cue[]){
 const ranked=searchCues(cues,title);
 if(!ranked.length)return {clear:null as Cue|null,plausible:[] as Cue[]};
 const top=cueSearchScore(ranked[0],title),runnerUp=ranked.length>1?cueSearchScore(ranked[1],title):-1;
 const clear=top>=CLEAR_MATCH_SCORE&&top>runnerUp?ranked[0]:null;
 return {clear,plausible:ranked.filter(cue=>cueSearchScore(cue,title)>=PLAUSIBLE_MATCH_SCORE)};
}

/**
 * A setlist becomes entries plus one coverage row per performance row. Two graphics that
 * share a folio never produce a silent pick: the row is `needs-review`, owned by Unassigned,
 * with every candidate named, and its entry is `alternates` so the operator chooses on
 * `/services`. Nothing here publishes anything or issues a live command.
 *
 * S1 - it also writes one service row per performance row, in setlist order, linking that
 * row's coverage item and entry (when it has one) and carrying its track id, its position in
 * the setlist and the candidate cue ids, so a row with no graphic keeps its place.
 */
export function matchSetlist(setlist:LiveSetlist,deps:MatchDeps):SetlistMatch{
 const newId=deps.id??randomUUID;
 const byFolio=liturgyMap(deps);
 const entries:CollectionEntry[]=[],coverage:CoverageItem[]=[],rows:ServiceRow[]=[],unmatched:UnmatchedRow[]=[];
 const tracks=Array.isArray(setlist.tracks)?setlist.tracks as LiveTrack[]:[];
 // `parseEntries` accepts 200 entries and `parseCoverage` 300 rows; a longer service is refused
 // here with a sentence instead of failing deep inside createCollection.
 const performanceRows=tracks.filter(track=>!NON_PERFORMANCE_TRACK_TYPES.has(str(track.type)??'song')).length;
 if(performanceRows>MAX_IMPORT_ROWS)throw new LiveSetlistsError('too_many_rows',`This planned service has ${performanceRows} rows; an import handles at most ${MAX_IMPORT_ROWS}.`);
 for(const [index,track] of tracks.entries()){
  const type=str(track.type)??'song';
  if(NON_PERFORMANCE_TRACK_TYPES.has(type))continue;
  const trackId=typeof track.id==='string'||typeof track.id==='number'?String(track.id):'';
  const title=str(track.title)?.trim()||'(untitled row)';
  const label=clip(title,MAX_LABEL);
  const ref=(track.liturgyRef&&typeof track.liturgyRef==='object'&&!Array.isArray(track.liturgyRef))?track.liturgyRef as {book?:unknown;folio?:unknown}:null;
  const book=str(ref?.book),folio=typeof ref?.folio==='number'&&Number.isFinite(ref.folio)?ref.folio:null;
  const hasLiturgy=Boolean(book&&folio!==null);
  const kind:UnmatchedRow['kind']=hasLiturgy?'liturgy':type==='song'?'song':'other';
  let entryId:string|undefined,candidateCueIds:string[]=[];
  const cover=(row:Omit<CoverageItem,'id'|'label'>)=>{
   const item:CoverageItem={id:newId(),label,...row};coverage.push(item);
   rows.push({id:newId(),label,status:item.status,coverageId:item.id,...(entryId?{entryId}:{}),candidateCueIds,setlistPosition:index+1,...(trackId?{trackId}:{})});
  };
  const flag=(reason:string)=>{unmatched.push({trackId,title,kind,reason:clip(reason,MAX_REASON)})};
  const covered=(cue:Cue,reason:string)=>{
   entryId=newId();entries.push({id:entryId,type:'cue',label,cueIds:[cue.id]});
   cover({status:'covered',cueId:cue.id,reason:clip(reason,MAX_REASON)});
  };
  const review=(candidates:Cue[],reason:string)=>{
   const chosen=candidates.slice(0,30);
   candidateCueIds=chosen.map(cue=>cue.id);
   if(chosen.length>=2){entryId=newId();entries.push({id:entryId,type:'alternates',label,cueIds:[...candidateCueIds]})}
   cover({status:'needs-review',owner:'Unassigned',reason:clip(reason,MAX_REASON)});
   flag(reason);
  };

  if(hasLiturgy){
   const sharing=byFolio.get(folioKey(book!,folio!))??[];
   if(sharing.length===1){covered(sharing[0],`Matched page ${folio} of ${book} in the published library.`);continue}
   if(sharing.length>=2){review(sharing,`Two graphics match this page. Choose one before relying on this row. Candidates: ${names(sharing)}.`);continue}
   const {clear,plausible}=titleCandidates(title,deps.cues);
   if(clear){covered(clear,`No graphic carries page ${folio} of ${book}; matched "${friendlyCueName(clear.name)}" by name.`);continue}
   if(plausible.length>=2){review(plausible,`No graphic carries page ${folio} of ${book}, and several could be this row. Candidates: ${names(plausible)}.`);continue}
   if(plausible.length===1){review(plausible,`No graphic carries page ${folio} of ${book}. Closest published graphic: ${names(plausible)}.`);continue}
   const reason='No published graphic matches this setlist row.';
   cover({status:'needs-cue',owner:'Unassigned',reason});flag(reason);continue;
  }

  const {clear,plausible}=titleCandidates(title,deps.cues);
  if(clear){covered(clear,`Matched the published graphic "${friendlyCueName(clear.name)}" by name.`);continue}
  if(plausible.length>=2){review(plausible,`Several graphics could be this row. Candidates: ${names(plausible)}.`);continue}
  if(plausible.length===1){review(plausible,`Closest published graphic: ${names(plausible)}. Confirm it before relying on this row.`);continue}
  const reason='Song without a matching graphic; add one if the words should be on screen.';
  cover({status:'not-needed',reason});flag(reason);
 }
 return {entries,coverage,rows,unmatched};
}

/* ---------- one setlist, fetched and matched ---------- */

export type ImportedSetlist=SetlistMatch&{setlist:{id:string;name:string;date:string|null;eventDate:string|null}};

export async function importSetlist(setlistId:string,deps:MatchDeps&{transport:LiveSetlistTransport}):Promise<ImportedSetlist>{
 const payload=await deps.transport('get_setlist',{id:setlistId});
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new LiveSetlistsError('setlist_not_found','That service is no longer on centralreform.live.');
 const setlist=payload as LiveSetlist;
 return {
  setlist:{id:typeof setlist.id==='string'||typeof setlist.id==='number'?String(setlist.id):setlistId,name:str(setlist.name)??'(untitled)',date:str(setlist.date),eventDate:str(setlist.eventDate)},
  ...matchSetlist(setlist,deps),
 };
}
