export const MAX_MESSAGE_BYTES=4096;
export const MAX_SNAPSHOT_BYTES=256*1024;
// The approved library grows independently from the single cue pinned in live state.
export const MAX_CATALOG_BYTES=4*1024*1024;
export const MAX_REQUEST_BYTES=MAX_CATALOG_BYTES+MAX_SNAPSHOT_BYTES;
// Controller presence is unbounded on the wire (any signed-in browser tab is one),
// so the reported set is capped; 32 entries are ~3.5 KB, far inside MAX_SNAPSHOT_BYTES
// as a whole — but a snapshot is cuePayload + renderers + controllers + framing under
// ONE cap, so that 3.5 KB has to come out of the cue-payload headroom below, not sit
// on top of it.
export const MAX_CONTROLLERS=32;
// Bytes for one serialized controller entry plus its array-comma, at worst realistic
// field widths: a 36-char uuid, the longest ClientKind ('companion', 9 chars), an
// 'xx.yy.zz'-shaped semver version (8 chars), and a 13-digit ms-epoch `seen`. Measured
// ~109 (108 for the entry + 1 comma); 112 rounds up for JSON punctuation slop.
export const MAX_CONTROLLER_BYTES=112;
// Bytes reserved for the optional `bug` field on live state. A real bug object
// (`"bug":{"on":true,"page":"123"}`) serializes at ~34 bytes; 192 is deliberate slack
// so a later widening of `page` is not a second reservation.
export const MAX_BUG_BYTES=192;
// Bytes reserved for the optional `logo` field -- the resting logo's preference, a separate
// feature from the scan card above. `"logo":{"on":true}` serializes at ~20 bytes; 64 leaves
// room for a later field without needing a second reservation.
export const MAX_LOGO_BYTES=64;
// Leave room for revision, renderer presence, a full controller set, the optional scan
// card, and event framing around a pinned cue. Every one of those shares the SINGLE
// MAX_SNAPSHOT_BYTES cap with the pinned cue, so each allowance comes out of the cue
// payload headroom rather than sitting on top of it.
export const MAX_CUE_PAYLOAD_BYTES=MAX_SNAPSHOT_BYTES-4096-MAX_CONTROLLERS*MAX_CONTROLLER_BYTES-MAX_BUG_BYTES-MAX_LOGO_BYTES;
export const MAX_RECEIPTS=2048;
// The cue log (2026-09-14 integration ruling 7). A bounded operational history of what the
// service actually did, never who did it: 2,000 rows or 14 days, whichever is smaller, and a
// read page capped at the same 256 KiB the snapshot is. Rows are dropped, never archived.
export const MAX_HISTORY_ROWS=2000;
export const HISTORY_WINDOW_MS=14*24*60*60*1000;
export const HISTORY_WINDOW_DAYS=14;
export const MAX_HISTORY_BYTES=256*1024;
// One page of rows. 500 rows serialize to ~110 KB at realistic widths, well inside the byte cap
// that guards the response as a whole.
export const MAX_HISTORY_PAGE=500;
// A row records the library sources of the graphic that was pinned, not a resolved position:
// only the web server holds the siddur library, and resolving at read time means a moment table
// that lands later starts answering without republishing a single graphic.
export const MAX_HISTORY_SOURCE_IDS=8;
export const STALE_MS=30_000;
// Inclusive: a renderer last seen exactly STALE_MS ago is expired, so an alarm that
// fires precisely on the deadline both drops the renderer and reschedules correctly.
export const rendererExpired=(seen:number,now:number)=>now-seen>=STALE_MS;
export const PROTOCOL='crc-overlays-v1';
export type Role='control'|'output'|'preview';
export type Mode='animate'|'cut';
export type Phase='settled'|'transition'|'error';
export type CuePayload=Record<string,unknown>;
/**
 * `layouts` (MCP plan L2) is the envelope's pinned data-layout definitions, keyed `id@version`, carried
 * beside the cues and returned by GET /catalog only when present. The relay stores it opaquely: the
 * catalog version stays the web's hash of the cues, each of which names its definition's sha256.
 */
export type ApprovedCatalog={version:string;cues:CuePayload[];layouts?:Record<string,CuePayload>};
export type Renderer={id:string;revision:number;cue:string|null;phase:Phase;seen:number};
export type ClientKind='companion'|'browser'|'unknown';
export type Controller={id:string;client:ClientKind;version:string|null;seen:number};
export type Hello={id:string;client:ClientKind;version:string|null};
// The scan card ("bug"): a second field on live state, not a second cue and not a
// second room. Optional, so a state row serialized by an earlier worker build survives
// a deploy unchanged and reads as "no scan card"; the field is present only while the
// card is on, so a `{on:false}` is never stored.
export type BugState={on:boolean;page:string|null};
// The resting logo's preference: a third field on live state, and a DIFFERENT feature from the
// scan card above. It carries no page and no address, because it is a standing mark rather than
// a card. Optional for the same reason `bug` is: a row written by an earlier worker build reads
// as "the operator has not turned the logo on", which is the quiet startup this product has now.
// This field is the desired setting only. Whether the mark is actually on screen is decided by
// the renderer (lib/resting-logo.ts), which hides it under any graphic; the relay never stores
// that, and no surface may report this field as a picture.
export type LogoState={on:boolean};
export type LiveState={revision:number;cue:string|null;mode:Mode;updated:number;cuePayload:CuePayload|null;catalogVersion:string;bug?:BugState;logo?:LogoState};
export type Snapshot=LiveState&{renderers:Renderer[];controllers:Controller[];serverTime:number};
export type Command={action:'in'|'out'|'clear'|'cut'|'bug'|'logo';cue:string|null;bug:BugState|null;logo:LogoState|null;commandId:string;clientId:string|null;sequence:number|null;source:HistorySource;serviceRef:string|null;ifRevision?:number;ifCue?:string|null};
/**
 * What the relay did with a command, on every command response (MCP plan V1). Read from the
 * exactly-once receipt and the per-controller sequence guard the relay already had:
 *
 * - 'applied': a commandId the relay had not seen, from a caller with no clientId or with a
 *   sequence above that controller's last one. Live state moved (revision + 1), the cue log
 *   gained a row, and connected sockets got the new snapshot.
 * - 'replayed': a commandId the relay already holds a receipt for, with the same action and cue.
 *   Nothing changed this time; the response is the current state. `originalOutcome` says what
 *   the first delivery did ('applied' or 'superseded'), or null for a receipt written by an
 *   earlier worker build that did not record it.
 * - 'superseded': a new commandId whose `sequence` is not above the last one this `clientId`
 *   already sent, so a newer press from the same controller has already won. Nothing moved, but
 *   the receipt is kept, so retrying the same commandId answers 'replayed'. Only the same
 *   controller supersedes: two different controllers still resolve last-writer-wins.
 *
 * A precondition that fails (`ifRevision`, `ifCue`) is not an outcome: it is a 409 refusal that
 * writes nothing -- no receipt, no sequence, no press time -- so the caller can read state and
 * decide again, even with the same commandId.
 */
export type CommandOutcome='applied'|'replayed'|'superseded';
export type CommandReceipt={action:string;cue:string|null;outcome:string|null};
export type CommandPrecondition='ifRevision'|'ifCue';
export type CommandDecision=
 |{kind:'applied'}
 |{kind:'superseded'}
 |{kind:'replayed';originalOutcome:'applied'|'superseded'|null}
 |{kind:'refused';status:400|409;error:string;precondition?:CommandPrecondition};
// Where the command came from, for the cue log. Not an identity: 'control' is any web or
// legacy caller, 'companion' the paired deck, 'mcp' an assistant acting on consent. A caller
// that says nothing is 'control', so every already-deployed client keeps working unchanged.
export type HistorySource='control'|'companion'|'mcp';
export type HistoryAction='in'|'out'|'clear'|'cut'|'bug'|'logo'|'history_cleared';
/**
 * One row of the cue log as the relay keeps it. Built in one place so no caller can widen it:
 * no graphic name, no text, no operator, no renderer presence — the same forbidden-key posture
 * as `/api/now`. `sourceIds` is internal: the web server joins it to the siddur library and
 * drops it, so what leaves `/api/history` is a liturgical position, never a source pin.
 */
export type HistoryRow={seq:number;at:number;action:HistoryAction;cueId:string|null;source:HistorySource;serviceRef:string|null;sourceIds:string[];commandId:string|null};
// `commandId` is a correlation id only (2026-09-23 ruling 10): the random id the caller chose for
// the command, so a retried call can be matched to its row. It never names a member, a device or
// a connection. Rows written before it existed, and the `history_cleared` row, carry null.
export const HISTORY_KEYS=['seq','at','action','cueId','source','serviceRef','sourceIds','commandId'] as const;
/**
 * When each controller class last pressed something, by the same `source` the cue log uses
 * ('control' = console or legacy caller, 'companion' = a paired deck, 'mcp' = an assistant).
 * A press is a new command the relay processed -- 'applied' or 'superseded' -- never a replay, a
 * refusal or an invalid request. Milliseconds since the epoch, null when that class has not
 * pressed since this build started recording. Class times only: no id, no device, no member.
 * Served on the HTTP `/state` and `/command` answers only, never in a socket frame, so it takes
 * nothing from the MAX_SNAPSHOT_BYTES budget the realtime clients enforce.
 */
export type LastPress=Record<HistorySource,number|null>;
// `client`/`version` are optional: attachments serialized by an earlier worker build
// survive a deploy without them, and a 1.3.0 hello never carries them.
export type SocketAttachment={role:Role;id:string|null;client?:ClientKind;version?:string|null;seen:number;ack:Renderer|null};
export type Ticket={room:'crc';role:Role;exp:number;jti:string};

const tokenPattern=/^[A-Za-z0-9_-]{8,160}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validToken=(value:unknown)=>typeof value==='string'&&tokenPattern.test(value);
export const validUuid=(value:unknown)=>typeof value==='string'&&uuidPattern.test(value);
export const validInteger=(value:unknown)=>Number.isSafeInteger(value)&&(value as number)>=0;
const clientVersionPattern=/^\d+\.\d+\.\d+$/;
export const parseClientKind=(value:unknown):ClientKind=>value==='companion'||value==='browser'?value:'unknown';
// A malformed version is data we simply do not have; it is never a reason to close.
export const parseClientVersion=(value:unknown):string|null=>typeof value==='string'&&value.length<=32&&clientVersionPattern.test(value)?value:null;
// A page chip is a short hand-typed label: 1-12 characters of digits, letters, spaces
// and the punctuation a folio reference actually uses, including an en dash for ranges.
const bugPagePattern=/^[A-Za-z0-9 .,\-\u2013]{1,12}$/;
export const validBugPage=(value:unknown)=>value===null||(typeof value==='string'&&bugPagePattern.test(value));
// Normalizes to exactly {on,page}: unknown keys are dropped rather than stored, so the
// MAX_BUG_BYTES reservation bounds what any caller can push into live state.
export const parseBugState=(value:unknown):BugState|null=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(typeof input.on!=='boolean'||!validBugPage(input.page))return null;
 return {on:input.on,page:(input.page??null) as string|null};
};
// Normalizes to exactly {on}. A logo request carries nothing else -- no page, no address, no
// size -- so anything extra is dropped rather than stored, and MAX_LOGO_BYTES bounds the field.
export const parseLogoState=(value:unknown):LogoState|null=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(typeof input.on!=='boolean')return null;
 return {on:input.on};
};
export const validCatalogVersion=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=160;
// Presence derivation shared by the worker and the rehearsal stub so the two cannot
// drift. Closing an expired socket stays with the caller (it owns the socket); this
// is only the ranking, the cap and the frame shape.
export const rankControllers=(controllers:Controller[]):Controller[]=>[...controllers].sort((a,b)=>b.seen-a.seen).slice(0,MAX_CONTROLLERS);
export const presenceFrame=(renderers:Renderer[],controllers:Controller[],serverTime:number)=>({type:'presence' as const,renderers,controllers,serverTime});
export const jsonBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;

// hello keeps its one hard rule (a UUID id, 4400 otherwise); the two fields added in
// 1.4.0 are optional and degrade to 'unknown'/null so a 1.3.0 module still connects.
export function parseHello(value:unknown):Hello|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(!validUuid(input.id))return null;
 return {id:input.id as string,client:parseClientKind(input.client),version:parseClientVersion(input.version)};
}

export function parseCommand(value:unknown):Command|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 const action=input.action;
 if(!['in','out','clear','cut','bug','logo'].includes(String(action))||!validToken(input.commandId))return null;
 const selects=action==='in'||action==='out';
 const cue=selects&&typeof input.cue==='string'&&input.cue.length<=160?input.cue:null;
 if(selects&&!cue)return null;
 if(!selects&&input.cue!==null)return null;
 if('cuePayload' in input||'catalogVersion' in input)return null;
 // `bug` is non-null only for action 'bug'. A caller that omits the field entirely --
 // every 1.4.0 module and the deployed web build -- is unaffected; a caller that attaches
 // a bug to an 'in' or a 'cut' is refused rather than silently ignored.
 let bug:BugState|null=null;
 if(action==='bug'){
  bug=parseBugState(input.bug);
  if(!bug)return null;
 }else if(input.bug!==undefined&&input.bug!==null)return null;
 // `logo` follows the same rule one field over, and the two never travel together: a command
 // that attaches a logo to a 'bug' -- or a bug to a 'logo' -- is refused rather than half
 // applied, which is what keeps the scan card and the resting logo genuinely separate on the
 // wire. A caller that omits the field entirely, which is every deployed client, is unaffected.
 let logo:LogoState|null=null;
 if(action==='logo'){
  logo=parseLogoState(input.logo);
  if(!logo)return null;
 }else if(input.logo!==undefined&&input.logo!==null)return null;
 const clientId=input.clientId;
 const sequence=input.sequence;
 if(clientId===null){if(sequence!==null)return null}
 else if(!validToken(clientId)||!validInteger(sequence))return null;
 // The two cue-log fields. Both are optional on the wire: a caller that omits them is a
 // 'control' command with no prepared service, which is what every deployed client is.
 const source=input.source===undefined||input.source===null?'control':parseHistorySource(input.source);
 if(!source)return null;
 const serviceRef=input.serviceRef===undefined||input.serviceRef===null?null:validUuid(input.serviceRef)?input.serviceRef as string:undefined;
 if(serviceRef===undefined)return null;
 const command:Command={action:action as Command['action'],cue,bug,logo,commandId:input.commandId as string,clientId:clientId as string|null,sequence:sequence as number|null,source,serviceRef};
 // The two optional preconditions (MCP plan V1). Absent -- which is every deployed client --
 // means no check at all, and the parsed command is exactly what it was before. `ifCue:null`
 // is a real condition ("only if nothing is pinned"), distinct from leaving the field out.
 if(input.ifRevision!==undefined){
  if(!validInteger(input.ifRevision))return null;
  command.ifRevision=input.ifRevision as number;
 }
 if(input.ifCue!==undefined){
  if(input.ifCue!==null&&!(typeof input.ifCue==='string'&&input.ifCue.length>0&&input.ifCue.length<=160))return null;
  command.ifCue=input.ifCue as string|null;
 }
 return command;
}

/**
 * The preconditions, read against the state the command would change. A plain sentence, because
 * an assistant relays it to a person; null when the command carries none or all of them hold.
 */
export function commandPreconditionFailure(current:LiveState,command:Command):{precondition:CommandPrecondition;error:string}|null{
 const again=' Nothing was changed; read the live state and decide again.';
 if(command.ifRevision!==undefined&&command.ifRevision!==current.revision)
  return {precondition:'ifRevision',error:`Live state has moved on: it is at revision ${current.revision}, not ${command.ifRevision}.${again}`};
 if(command.ifCue!==undefined&&command.ifCue!==current.cue){
  const error=current.cue===null?'Nothing is live now, not the graphic this command expected.':command.ifCue===null?'A graphic is live now, not the empty screen this command expected.':'A different graphic is live now than the one this command expected.';
  return {precondition:'ifCue',error:error+again};
 }
 return null;
}

/** An 'out' naming the graphic that is pinned right now, whose payload the live state holds. */
export const outOfPinnedCue=(current:LiveState,command:Command)=>command.action==='out'&&command.cue!==null&&command.cue===current.cue&&current.cuePayload!==null;

/**
 * The payload a command concerns, for the cue log: the approved catalog's copy, or, for an 'out'
 * of a pinned graphic that has since left the catalog, the copy the live state still holds.
 */
export const commandPayload=(current:LiveState,command:Command,fromCatalog:CuePayload|null)=>fromCatalog??(outOfPinnedCue(current,command)?current.cuePayload:null);

/**
 * The one decision the worker and the rehearsal port both make about a parsed command, in the
 * order the worker has always used: the receipt first (so a retry of a command that already
 * moved the state replays instead of tripping its own precondition), then the cue, then the
 * preconditions, then the controller's sequence. `priorSequence` is that clientId's last
 * accepted sequence, -1 when it has none; it is ignored for a command with no clientId.
 */
export function decideCommand(input:{command:Command;current:LiveState;receipt:CommandReceipt|null;cueKnown:boolean;priorSequence:number}):CommandDecision{
 const {command,current,receipt}=input;
 if(receipt){
  if(receipt.action!==command.action||receipt.cue!==command.cue)return {kind:'refused',status:409,error:'Command ID already used for a different command'};
  return {kind:'replayed',originalOutcome:receipt.outcome==='applied'||receipt.outcome==='superseded'?receipt.outcome:null};
 }
 // MCP plan A3: a graphic retired while on air leaves the catalog but stays pinned (the relay
 // holds its payload), so its own Out button must still work. Only an 'in' needs the catalog.
 if((command.action==='in'||command.action==='out')&&!input.cueKnown&&!outOfPinnedCue(current,command))return {kind:'refused',status:400,error:'Unknown cue'};
 const failure=commandPreconditionFailure(current,command);
 if(failure)return {kind:'refused',status:409,...failure};
 if(command.clientId!==null&&!(command.sequence!>input.priorSequence))return {kind:'superseded'};
 return {kind:'applied'};
}

/** Folds stored press times into the fixed three-class shape; an unknown source is ignored. */
export function lastPressFrom(rows:readonly {source:string;at:number}[]):LastPress{
 const press:LastPress={control:null,companion:null,mcp:null};
 for(const row of rows){
  const source=parseHistorySource(row.source);
  const at=Number(row.at);
  if(source&&Number.isSafeInteger(at)&&(press[source]===null||at>(press[source] as number)))press[source]=at;
 }
 return press;
}

export const parseHistorySource=(value:unknown):HistorySource|null=>value==='control'||value==='companion'||value==='mcp'?value:null;

/**
 * The source ids of the graphic that was pinned, taken from the payload the relay already
 * holds, and only the first few, so one graphic can never widen a row without bound.
 *
 * These are stored verbatim. An earlier version kept only `library:`-prefixed ids on the
 * theory that they are the ones carrying a shireishabbat unit, but a cue may be published
 * with a bare unit id instead (`shma.barchu@legacy-shabbat-morning`), and those rows stored
 * `[]` — which is why four days of real liturgical cues logged a null position. The relay
 * does not hold the siddur library and cannot tell a library id from any other, so it keeps
 * what it was given and the web side decides what resolves (`lib/liturgy-index.ts`).
 */
export function librarySourceIds(payload:CuePayload|null|undefined):string[]{
 const ids=(payload as {authoring?:{sourceIds?:unknown}}|null|undefined)?.authoring?.sourceIds;
 if(!Array.isArray(ids))return [];
 return ids.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=160).slice(0,MAX_HISTORY_SOURCE_IDS);
}

/**
 * A names panel's id is `names:<collectionId>:<NN>`, so a service that is on screen names itself
 * even though nothing yet asks an operator to load one. That is the only `serviceRef` any
 * surface produces today; a caller may still send one explicitly.
 */
export function collectionFromNamesCue(cueId:string|null):string|null{
 if(typeof cueId!=='string')return null;
 const parts=cueId.split(':');
 return parts.length===3&&parts[0]==='names'&&validUuid(parts[1])?parts[1]:null;
}

/** The only constructor of a history row: these keys, in one place, from validated parts. */
export function historyRow(input:{seq:number;at:number;action:HistoryAction;cueId:string|null;source:HistorySource;serviceRef:string|null;sourceIds?:readonly string[];commandId?:string|null}):HistoryRow{
 return {seq:input.seq,at:input.at,action:input.action,cueId:input.cueId,source:input.source,serviceRef:input.serviceRef,sourceIds:[...(input.sourceIds??[])],commandId:validToken(input.commandId)?input.commandId as string:null};
}

/** Rows older than this are dropped on the next append or read, whichever comes first. */
export const historyWindowStart=(now:number)=>now-HISTORY_WINDOW_MS;

export type HistoryRange={since:number;until:number;after:number;limit:number};
/**
 * `?since=&until=&after=` — milliseconds and a sequence cursor, all optional. The default
 * window is the whole retained history; a malformed value refuses rather than being ignored,
 * so a caller never silently reads a different window than it asked for.
 */
export function parseHistoryRange(since:string|null,until:string|null,after:string|null,now:number,limit:string|null=null):HistoryRange|null{
 const number=(raw:string|null,fallback:number)=>{
  if(raw===null||raw==='')return fallback;
  if(!/^\d{1,15}$/.test(raw))return null;
  const value=Number(raw);
  return Number.isSafeInteger(value)?value:null;
 };
 const from=number(since,historyWindowStart(now)),to=number(until,now),cursor=number(after,0),page=number(limit,MAX_HISTORY_PAGE);
 if(from===null||to===null||cursor===null||page===null||to<from||page<1)return null;
 return {since:from,until:to,after:cursor,limit:Math.min(page,MAX_HISTORY_PAGE)};
}

/**
 * One page of rows under the 256 KiB cap. `nextAfter` is the seq to resume from when the cap
 * or the row limit truncated the answer, and null when the caller has the whole range.
 */
export function historyPage(rows:readonly HistoryRow[],maxBytes=MAX_HISTORY_BYTES):{rows:HistoryRow[];nextAfter:number|null}{
 const page:HistoryRow[]=[];
 // The envelope around the rows ({"workspace":"…","rows":[…],"nextAfter":…}) is small and
 // fixed; 512 bytes of headroom keeps the whole response inside the cap, not just its rows.
 let bytes=512;
 for(const row of rows){
  const size=jsonBytes(row)+1;
  if(page.length&&bytes+size>maxBytes)return {rows:page,nextAfter:page[page.length-1].seq};
  bytes+=size;
  page.push(row);
 }
 return {rows:page,nextAfter:null};
}

export function parseCatalog(value:unknown):ApprovedCatalog|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(!validCatalogVersion(input.version)||!Array.isArray(input.cues)||!input.cues.length)return null;
 const ids=new Set<string>();
 const cues:CuePayload[]=[];
 for(const cue of input.cues){
  if(!cue||typeof cue!=='object'||Array.isArray(cue))return null;
  const id=(cue as Record<string,unknown>).id;
  if(typeof id!=='string'||!id||id.length>160||ids.has(id)||jsonBytes(cue)>MAX_CUE_PAYLOAD_BYTES)return null;
  ids.add(id);cues.push(cue as CuePayload);
 }
 if(input.layouts===undefined)return {version:input.version as string,cues};
 const layouts=parseCatalogLayouts(input.layouts);
 if(!layouts)return null;
 return Object.keys(layouts).length?{version:input.version as string,cues,layouts}:{version:input.version as string,cues};
}
const LAYOUT_KEY=/^[a-z][a-z0-9_-]{0,39}@[1-9][0-9]{0,8}$/;
// Shape only: each entry names the id, version and sha256 its key and the cues' pins agree on,
// and carries its document. The web validated the document; the renderer reads it.
function parseCatalogLayouts(value:unknown):Record<string,CuePayload>|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const layouts:Record<string,CuePayload>={};
 for(const [key,entry] of Object.entries(value as Record<string,unknown>)){
  if(!LAYOUT_KEY.test(key)||!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const item=entry as Record<string,unknown>;
  if(`${item.id}@${item.version}`!==key||typeof item.sha256!=='string'||!/^[a-f0-9]{64}$/.test(item.sha256)||!item.document||typeof item.document!=='object'||Array.isArray(item.document))return null;
  layouts[key]=item;
 }
 return layouts;
}

export function parseInitialState(value:unknown,catalogVersion:unknown):LiveState|null{
 if(!value||typeof value!=='object'||Array.isArray(value)||!validCatalogVersion(catalogVersion))return null;
 const input=value as Record<string,unknown>;
 if(!validInteger(input.revision)||!validInteger(input.updated)||!['animate','cut'].includes(String(input.mode)))return null;
 if(input.cue!==null&&typeof input.cue!=='string')return null;
 if(input.cuePayload!==null&&(!input.cuePayload||typeof input.cuePayload!=='object'||Array.isArray(input.cuePayload)))return null;
 const state:LiveState={revision:input.revision as number,cue:input.cue as string|null,mode:input.mode as Mode,updated:input.updated as number,cuePayload:input.cuePayload as CuePayload|null,catalogVersion:catalogVersion as string};
 // A row written without `bug` -- anything an earlier worker build persisted -- reads as
 // no scan card: the key stays absent rather than becoming an explicit off.
 if(input.bug!==undefined&&input.bug!==null){
  const bug=parseBugState(input.bug);
  if(!bug)return null;
  if(bug.on)state.bug=bug;
 }
 // Same posture for the resting logo: absent means the operator has not turned it on.
 if(input.logo!==undefined&&input.logo!==null){
  const logo=parseLogoState(input.logo);
  if(!logo)return null;
  if(logo.on)state.logo=logo;
 }
 return state;
}

export function nextState(current:LiveState,command:Command,selected:CuePayload|null,now:number):LiveState{
 // The scan card touches nothing but itself: no cue, no payload, no mode. It still bumps
 // the revision so a reconnecting client converges on it.
 if(command.action==='bug'){
  const next:LiveState={...current,revision:current.revision+1,updated:now};
  if(command.bug?.on)next.bug={on:true,page:command.bug.page};
  else delete next.bug;
  return next;
 }
 // The resting logo's preference, and nothing else: no cue, no payload, no mode, and not the
 // scan card either. Off is stored as an absent field rather than {on:false}, so "never turned
 // on" and "deliberately turned off" are the same durable answer, and a reconnecting renderer
 // converges on it from the bumped revision.
 if(command.action==='logo'){
  const next:LiveState={...current,revision:current.revision+1,updated:now};
  if(command.logo?.on)next.logo={on:true};
  else delete next.logo;
  return next;
 }
 let cue:string|null=null;
 let cuePayload:CuePayload|null=null;
 if(command.action==='in'){cue=command.cue;cuePayload=selected}
 else if(command.action==='out'&&current.cue!==command.cue){cue=current.cue;cuePayload=current.cuePayload}
 const next:LiveState={...current,revision:current.revision+1,cue,mode:command.action==='cut'?'cut':'animate',updated:now,cuePayload};
 // F1: Clear now removes every layer -- the scan card and the resting logo included -- and
 // that is authoritative state, so a reconnect cannot resurrect either. Clearing the logo here
 // turns the PREFERENCE off, not merely the picture: after a Clear now the mark stays away
 // until an operator deliberately enables it again. 'in'/'out'/'clear' carry both layers
 // through on the spread above, untouched.
 if(command.action==='cut'){delete next.bug;delete next.logo}
 return next;
}

export function parseAck(value:unknown,helloId:string|null):Renderer|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>;
 if(!validUuid(input.id)||input.id!==helloId||!validInteger(input.revision)||!['settled','transition','error'].includes(String(input.phase))||(input.cue!==null&&typeof input.cue!=='string'))return null;
 return {id:input.id as string,revision:input.revision as number,cue:input.cue as string|null,phase:input.phase as Phase,seen:Date.now()};
}

function decodeBase64Url(value:string){
 const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
 const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));
 return Uint8Array.from(binary,char=>char.charCodeAt(0));
}

export async function verifyTicket(raw:string,secret:string,nowSeconds=Math.floor(Date.now()/1000)):Promise<Ticket|null>{
 const [payloadPart,signaturePart,...extra]=raw.split('.');
 if(!payloadPart||!signaturePart||extra.length||!secret)return null;
 try{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,decodeBase64Url(signaturePart),new TextEncoder().encode(payloadPart)))return null;
  const payload=JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart))) as Record<string,unknown>;
  if(payload.room!=='crc'||!['control','output','preview'].includes(String(payload.role))||!Number.isSafeInteger(payload.exp)||!validToken(payload.jti))return null;
  const exp=payload.exp as number;
  if(exp<=nowSeconds||exp>nowSeconds+120)return null;
  return payload as Ticket;
 }catch{return null}
}
