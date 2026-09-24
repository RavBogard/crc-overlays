import type {CollectionEntry,CoverageItem,CoverageStatus} from './service-collections';
import {ServicesError} from './names-list';

/**
 * R-S1 (S1) - the ordered spine of a prepared service. `entries[]` (what can be played) and
 * `coverage[]` (what was decided about each service moment) stay exactly as the web edits
 * them; `rows[]` is the one service order that links them, so a moment with no graphic keeps
 * its place and a moment's graphic can be found from its coverage decision.
 *
 * Invariants `reconcileRows` restores on every read and every write:
 * - a row links at most one entry and at most one coverage item, and no two rows link the same one;
 * - every entry and every coverage item is linked by exactly one row;
 * - a row's `label` and `status` mirror its coverage item (its entry's label when it has none);
 * - rows that link an entry appear in the entries' order, in the slots such rows already
 *   occupy, so reordering entries never moves a row without a graphic.
 * Nothing here reads the catalog or throws on a stored document: this runs on reads.
 */
export type ServiceRow={
 id:string;
 label:string;
 /** Mirrors the linked coverage item; absent when the row links only an entry. */
 status?:CoverageStatus;
 entryId?:string;
 coverageId?:string;
 /** Published cue ids a person should choose between; the importer records them instead of only naming them in `reason`. */
 candidateCueIds:string[];
 /** 1-based position of the source track in the centralreform.live setlist, headers and notes included. */
 setlistPosition?:number;
 trackId?:string;
 buttonLabel?:string;
 camera?:string;
 note?:string;
};
/** Where an imported service came from. Absent (null) on services created on the web and on services imported before S1. */
export type ServiceOrigin={setlistId:string;trackIds:string[];eventDate:string|null;importedAt:number};

export const MAX_SERVICE_ROWS=500;
export const MAX_ROW_CANDIDATES=30;

const str=(value:unknown):string|undefined=>typeof value==='string'&&value?value:undefined;

/** A stored row read tolerantly: anything unreadable is dropped rather than failing the read. */
function storedRow(raw:unknown):ServiceRow|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const item=raw as Record<string,unknown>,id=str(item.id);
 if(!id)return null;
 const candidates=Array.isArray(item.candidateCueIds)?[...new Set(item.candidateCueIds.filter((cue):cue is string=>typeof cue==='string'&&Boolean(cue)))].slice(0,MAX_ROW_CANDIDATES):[];
 const row:ServiceRow={id,label:str(item.label)??'',candidateCueIds:candidates};
 const entryId=str(item.entryId),coverageId=str(item.coverageId),trackId=str(item.trackId),buttonLabel=str(item.buttonLabel),camera=str(item.camera),note=str(item.note);
 if(entryId)row.entryId=entryId;
 if(coverageId)row.coverageId=coverageId;
 if(Number.isInteger(item.setlistPosition)&&(item.setlistPosition as number)>=1)row.setlistPosition=item.setlistPosition as number;
 if(trackId)row.trackId=trackId;
 if(buttonLabel)row.buttonLabel=buttonLabel;
 if(camera)row.camera=camera;
 if(note)row.note=note;
 return row;
}

/**
 * The rows a document without `rows[]` gets. Coverage items and entries are paired by equal
 * label, walking both lists forward only (the importer always wrote an entry and its coverage
 * item under the same label, in setlist order). Coverage order leads; an unpaired entry is
 * placed just before the next paired entry after it, or at the end. Both lists' own orders are
 * preserved. Row ids derive from the linked ids, so reading the same stored document twice
 * gives the same rows.
 */
function derivedRows(entries:CollectionEntry[],coverage:CoverageItem[],taken:Set<string>):ServiceRow[]{
 const pairedEntry=new Map<number,number>();let from=0;
 coverage.forEach((item,j)=>{for(let i=from;i<entries.length;i++)if(entries[i].label===item.label){pairedEntry.set(j,i);from=i+1;return}});
 const pairedEntries=new Set(pairedEntry.values());
 const rowId=(base:string)=>{let id=base,n=2;while(taken.has(id))id=`${base}-${n++}`;taken.add(id);return id};
 const rows:ServiceRow[]=[];let nextEntry=0;
 const entryOnly=(entry:CollectionEntry):ServiceRow=>({id:rowId(`row-e-${entry.id}`),label:entry.label,entryId:entry.id,candidateCueIds:[]});
 const flushEntriesBefore=(limit:number)=>{for(;nextEntry<limit;nextEntry++)if(!pairedEntries.has(nextEntry))rows.push(entryOnly(entries[nextEntry]))};
 coverage.forEach((item,j)=>{
  const i=pairedEntry.get(j);
  const row:ServiceRow={id:rowId(`row-c-${item.id}`),label:item.label,status:item.status,coverageId:item.id,candidateCueIds:[]};
  if(i!==undefined){
   flushEntriesBefore(i);nextEntry=Math.max(nextEntry,i+1);
   const entry=entries[i];row.entryId=entry.id;
   if(item.status==='needs-review'&&entry.type==='alternates')row.candidateCueIds=entry.cueIds.slice(0,MAX_ROW_CANDIDATES);
  }
  rows.push(row);
 });
 flushEntriesBefore(entries.length);
 return rows;
}

/**
 * The rows of a service, made consistent with its entries and coverage. `stored` is whatever
 * the document holds (undefined for a document written before S1, which is migrated here, on
 * read, and never rewritten in bulk). Rows that lose every link they had are dropped; rows
 * stored without any link are kept as they are.
 */
export function reconcileRows(stored:unknown,entries:CollectionEntry[],coverage:CoverageItem[]):ServiceRow[]{
 const entryIndex=new Map(entries.map((entry,index)=>[entry.id,index])),coverageById=new Map(coverage.map(item=>[item.id,item]));
 const claimedEntries=new Set<string>(),claimedCoverage=new Set<string>(),ids=new Set<string>();
 const rows:ServiceRow[]=[];
 // Linked rows are bounded by the entries and coverage limits; only rows without any link can
 // grow a document, so they alone are capped.
 let unlinkedRoom=Math.max(0,MAX_SERVICE_ROWS-entries.length-coverage.length);
 for(const raw of Array.isArray(stored)?stored:[]){
  const row=storedRow(raw);
  if(!row||ids.has(row.id))continue;
  const hadLink=Boolean(row.entryId||row.coverageId);
  if(row.entryId&&(!entryIndex.has(row.entryId)||claimedEntries.has(row.entryId)))delete row.entryId;
  if(row.coverageId&&(!coverageById.has(row.coverageId)||claimedCoverage.has(row.coverageId)))delete row.coverageId;
  if(!row.entryId&&!row.coverageId){if(hadLink||unlinkedRoom===0)continue;unlinkedRoom--}
  if(row.entryId)claimedEntries.add(row.entryId);
  if(row.coverageId)claimedCoverage.add(row.coverageId);
  const item=row.coverageId?coverageById.get(row.coverageId):undefined;
  if(item){row.label=item.label;row.status=item.status}
  else{delete row.status;if(row.entryId)row.label=entries[entryIndex.get(row.entryId)!].label}
  ids.add(row.id);rows.push(row);
 }
 rows.push(...derivedRows(entries.filter(entry=>!claimedEntries.has(entry.id)),coverage.filter(item=>!claimedCoverage.has(item.id)),ids));
 // Rows that carry an entry follow the entries' order, in the slots they already hold.
 const slots=rows.flatMap((row,index)=>row.entryId?[index]:[]);
 const ordered=slots.map(index=>rows[index]).sort((a,b)=>entryIndex.get(a.entryId!)!-entryIndex.get(b.entryId!)!);
 slots.forEach((slot,k)=>{rows[slot]=ordered[k]});
 return rows;
}

/** A stored origin read tolerantly; anything incomplete reads as no origin. */
export function storedOrigin(raw:unknown):ServiceOrigin|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const item=raw as Record<string,unknown>,setlistId=str(item.setlistId);
 if(!setlistId||typeof item.importedAt!=='number')return null;
 return {setlistId,trackIds:Array.isArray(item.trackIds)?item.trackIds.filter((id):id is string=>typeof id==='string'&&Boolean(id)):[],eventDate:str(item.eventDate)??null,importedAt:item.importedAt};
}

/* ---------- S2: rows as input ---------- */

export const ROW_ID_MAX=120;
export const ROW_BUTTON_LABEL_MAX=60;
export const ROW_CAMERA_MAX=60;
export const ROW_NOTE_MAX=500;
const ROW_INPUT_KEYS=['id','label','status','entryId','coverageId','candidateCueIds','setlistPosition','trackId','buttonLabel','camera','note'];

/**
 * S2 - the strict parser for `rows[]` the MCP services tools send (never read from a web
 * request body; see `createCollection` / `updateCollection`). Unlike `storedRow`, which tolerates anything on a read,
 * this refuses with a sentence. `label` and `status` are accepted and ignored: they mirror the
 * linked coverage item and entry, and `reconcileRows` writes them. A candidate cue must be
 * published unless this same row already carried it (the rule entries and coverage follow, so
 * a graphic that went unavailable never blocks an unrelated edit).
 */
export function parseRows(value:unknown,entries:CollectionEntry[],coverage:CoverageItem[],{published,previous=[]}:{published:Set<string>;previous?:ServiceRow[]}):ServiceRow[]{
 if(!Array.isArray(value)||value.length>MAX_SERVICE_ROWS)throw new ServicesError('invalid_input',`rows must be an array with at most ${MAX_SERVICE_ROWS} items`);
 const entryIds=new Set(entries.map(entry=>entry.id)),coverageIds=new Set(coverage.map(item=>item.id)),priorCandidates=new Map(previous.map(row=>[row.id,new Set(row.candidateCueIds)]));
 const ids=new Set<string>(),linkedEntries=new Set<string>(),linkedCoverage=new Set<string>();
 const bounded=(raw:unknown,label:string,max:number):string|undefined=>{if(raw===undefined)return undefined;if(typeof raw!=='string'||!raw.trim()||raw.length>max)throw new ServicesError('invalid_input',`${label} must be 1-${max} characters`);return raw.trim()};
 return value.map((raw,index)=>{
  const at=`rows[${index}]`;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ServicesError('invalid_input',`${at} must be an object`);
  const item=raw as Record<string,unknown>,extra=Object.keys(item).filter(key=>!ROW_INPUT_KEYS.includes(key));
  if(extra.length)throw new ServicesError('invalid_input',`${at} contains unsupported fields: ${extra.join(', ')}`);
  const id=bounded(item.id,`${at}.id`,ROW_ID_MAX);
  if(!id)throw new ServicesError('invalid_input',`${at}.id is required`);
  if(ids.has(id))throw new ServicesError('duplicate_row',`Row ID appears more than once: ${id}`);ids.add(id);
  const entryId=bounded(item.entryId,`${at}.entryId`,80),coverageId=bounded(item.coverageId,`${at}.coverageId`,80);
  if(entryId){if(!entryIds.has(entryId))throw new ServicesError('unknown_entry',`${at} links an entry this service does not have: ${entryId}`,404);if(linkedEntries.has(entryId))throw new ServicesError('duplicate_row',`Two rows link the same entry: ${entryId}`);linkedEntries.add(entryId)}
  if(coverageId){if(!coverageIds.has(coverageId))throw new ServicesError('unknown_coverage',`${at} links a coverage item this service does not have: ${coverageId}`,404);if(linkedCoverage.has(coverageId))throw new ServicesError('duplicate_row',`Two rows link the same coverage item: ${coverageId}`);linkedCoverage.add(coverageId)}
  let candidateCueIds:string[]=[];
  if(item.candidateCueIds!==undefined){
   if(!Array.isArray(item.candidateCueIds)||item.candidateCueIds.length>MAX_ROW_CANDIDATES)throw new ServicesError('invalid_input',`${at}.candidateCueIds must be an array with at most ${MAX_ROW_CANDIDATES} items`);
   candidateCueIds=item.candidateCueIds.map((cue,j)=>bounded(cue,`${at}.candidateCueIds[${j}]`,160)!);
   if(new Set(candidateCueIds).size!==candidateCueIds.length)throw new ServicesError('duplicate_cue',`${at} names a candidate more than once`);
   for(const cue of candidateCueIds)if(!published.has(cue)&&!priorCandidates.get(id)?.has(cue))throw new ServicesError('unknown_cue',`Published cue is unavailable: ${cue}`,404);
  }
  const row:ServiceRow={id,label:'',candidateCueIds};
  if(entryId)row.entryId=entryId;
  if(coverageId)row.coverageId=coverageId;
  if(item.setlistPosition!==undefined){if(!Number.isInteger(item.setlistPosition)||(item.setlistPosition as number)<1||(item.setlistPosition as number)>10000)throw new ServicesError('invalid_input',`${at}.setlistPosition must be a whole number from 1 to 10000`);row.setlistPosition=item.setlistPosition as number}
  const trackId=bounded(item.trackId,`${at}.trackId`,160),buttonLabel=bounded(item.buttonLabel,`${at}.buttonLabel`,ROW_BUTTON_LABEL_MAX),camera=bounded(item.camera,`${at}.camera`,ROW_CAMERA_MAX),note=bounded(item.note,`${at}.note`,ROW_NOTE_MAX);
  if(trackId)row.trackId=trackId;
  if(buttonLabel)row.buttonLabel=buttonLabel;
  if(camera)row.camera=camera;
  if(note)row.note=note;
  return row;
 });
}

/**
 * S2 - entries and coverage reordered to follow the rows that link them, so a positioned insert
 * or a row reorder shows in the same order on /services (which lists entries and coverage, not
 * rows). Anything no row links keeps its own order, after the linked items.
 */
export function alignToRows(rows:ServiceRow[],entries:CollectionEntry[],coverage:CoverageItem[]):{entries:CollectionEntry[];coverage:CoverageItem[]}{
 const entryAt=new Map<string,number>(),coverageAt=new Map<string,number>();
 rows.forEach((row,index)=>{if(row.entryId&&!entryAt.has(row.entryId))entryAt.set(row.entryId,index);if(row.coverageId&&!coverageAt.has(row.coverageId))coverageAt.set(row.coverageId,index)});
 const order=<T extends {id:string}>(items:T[],at:Map<string,number>)=>items.map((item,index)=>({item,index,key:at.get(item.id)??Number.MAX_SAFE_INTEGER})).sort((a,b)=>a.key-b.key||a.index-b.index).map(({item})=>item);
 return {entries:order(entries,entryAt),coverage:order(coverage,coverageAt)};
}
