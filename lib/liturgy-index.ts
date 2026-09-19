import {createRequire} from 'node:module';
import {siddurLibrary} from './source-library';
import type {Cue} from './player';

/**
 * D13 — G2 is a derived index, not new cue data.
 *
 * Nothing here is added to a cue payload, so the catalog version does not move and no
 * Stream Deck needs a catalog refresh. The index is computed from what a published cue
 * already carries (`cue.authoring.sourceIds`) plus the committed siddur library, which
 * pins the shireishabbat unit on every expanded source.
 *
 * `content/moments.json` is the one piece of data this module does not already have.
 * It maps a shireishabbat unit onto a named moment of the service, and ships empty so
 * the loader has no conditional require and the shireishabbat producer's later
 * publication is a data-only pull request. Its shape is:
 *
 * ```json
 * {"schemaVersion":1,"moments":[{"momentId":"barechu","unitId":"opening.barechu@legacy-shabbat-evening"}]}
 * ```
 *
 * `momentId` is the producer's stable name for a moment of the service; `unitId` is the
 * exact `authority.unitId` of the source that carries it, the same string this module
 * reports as `LiturgyRef.unitId`. One moment may name several units (repeat the
 * `momentId`); the first entry for a unit wins. Unknown fields are ignored and a
 * malformed entry is skipped rather than failing a page load — a mapping table is a
 * convenience, and losing it must never take the live catalog down. That tolerance
 * extends to the read itself: the file is data the shireishabbat producer commits, so
 * invalid JSON must not 503 `/api/catalog?include=liturgy` or `/api/now` at runtime.
 * A throwing read is one `console.warn` and an empty table.
 */
export type LiturgyRef={unitId:string|null;momentId:string|null;book:string|null;folio:number|null};
export type MomentEntry={momentId:string;unitId:string};
export type LiturgySource={id:string;book?:string;authority?:{id?:string;unitId?:string};metadata?:Record<string,unknown>};
export type LiturgyLookups={sources?:readonly LiturgySource[];moments?:readonly MomentEntry[]};

/** A baseline, custom, template or names cue resolves to this: it is backed by no library source. */
export const NO_LITURGY:LiturgyRef={unitId:null,momentId:null,book:null,folio:null};

const require=createRequire(import.meta.url);

function readMoments(value:unknown):MomentEntry[]{
 const raw=(value as {moments?:unknown}|null)?.moments;
 if(!Array.isArray(raw))return [];
 const seen=new Set<string>();const entries:MomentEntry[]=[];
 for(const item of raw){
  const entry=item as {momentId?:unknown;unitId?:unknown}|null;
  if(!entry||typeof entry.momentId!=='string'||typeof entry.unitId!=='string'||!entry.momentId||!entry.unitId)continue;
  if(seen.has(entry.unitId))continue;
  seen.add(entry.unitId);entries.push({momentId:entry.momentId,unitId:entry.unitId});
 }
 return entries;
}

let committedMoments:MomentEntry[]|undefined;
let warnedAboutMoments=false;
/** How `loadMoments` reads the file; a test injects one that throws to prove the tolerance. */
export type MomentsReader=()=>unknown;
const readCommittedMoments:MomentsReader=()=>require('../content/moments.json');
function momentsFrom(read:MomentsReader):MomentEntry[]{
 try{return readMoments(read())}
 catch(error){
  if(!warnedAboutMoments){warnedAboutMoments=true;console.warn('content/moments.json could not be read; no moment is named for any cue',error)}
  return [];
 }
}
/**
 * The committed `content/moments.json`, tolerating the empty list it ships with today and
 * an unreadable file tomorrow. Only the committed read is memoized; an injected reader is
 * always run, so a test never poisons or reads the module-level cache.
 */
export function loadMoments(read:MomentsReader=readCommittedMoments):MomentEntry[]{
 if(read!==readCommittedMoments)return momentsFrom(read);
 if(!committedMoments)committedMoments=momentsFrom(read);
 return committedMoments;
}

/**
 * `book` is the feed slug the library source was built from: authority IDs read
 * `shireishabbat:<feed slug>:<feed sha prefix>`, and the slug is also what the source
 * carries in `book`. A source with neither reports no book rather than a guess.
 */
function feedSlug(source:LiturgySource):string|null{
 const parts=typeof source.authority?.id==='string'?source.authority.id.split(':'):[];
 if(parts.length>=3&&parts[1])return parts[1];
 return typeof source.book==='string'&&source.book?source.book:null;
}

/** The first printed folio of the source — the same `metadata.folios` field `sourceDisplay` reads. */
function firstFolio(source:LiturgySource):number|null{
 const folios=(source.metadata??{}).folios;
 if(!Array.isArray(folios))return null;
 const value=folios.find((item):item is number=>typeof item==='number'&&Number.isFinite(item));
 return value===undefined?null:value;
}

let libraryIndex:Map<string,LiturgySource>|undefined;
function sourceIndex(sources?:readonly LiturgySource[]):Map<string,LiturgySource>{
 if(sources)return new Map(sources.map(source=>[source.id,source]));
 if(!libraryIndex)libraryIndex=new Map(siddurLibrary.sources.map(source=>[source.id,source as LiturgySource]));
 return libraryIndex;
}

/**
 * The same sources keyed by `authority.unitId`. A cue may pin a bare unit id
 * (`shma.barchu@legacy-shabbat-morning`) rather than the library key that contains it
 * (`library:legacy-shabbat-morning:shma.barchu@legacy-shabbat-morning`), and that cue still
 * names a real position. Twenty of the 732 unit ids appear on more than one source; the first
 * wins, the same rule `loadMoments` uses, because a duplicate is a genuine ambiguity and
 * guessing differently on each read would be worse than guessing once.
 */
let libraryUnitIndex:Map<string,LiturgySource>|undefined;
function unitIndex(sources?:readonly LiturgySource[]):Map<string,LiturgySource>{
 const build=(list:readonly LiturgySource[])=>{
  const map=new Map<string,LiturgySource>();
  for(const source of list){
   const unitId=source.authority?.unitId;
   if(typeof unitId==='string'&&unitId&&!map.has(unitId))map.set(unitId,source);
  }
  return map;
 };
 if(sources)return build(sources);
 if(!libraryUnitIndex)libraryUnitIndex=build(siddurLibrary.sources as LiturgySource[]);
 return libraryUnitIndex;
}

/**
 * An id that meant to name a liturgical unit: either the library key itself, or the bare
 * `<section>.<name>@<feed>` unit id. A `custom:` or `upload:` source names no unit and its
 * absence from the library is not a miss, so it is not reported as one.
 */
const namesAUnit=(id:string)=>id.startsWith('library:')||id.includes('@');

const reportedMisses=new Set<string>();
/**
 * A pinned id that meant to name a unit and matched nothing. This is logged rather than
 * swallowed because a silent miss and a cue with no liturgy look identical from outside —
 * which is exactly how four days of null positions in the cue log went unnoticed. Reported
 * once per distinct id and capped, so reading a page of history cannot flood the log.
 */
function reportLiturgyMiss(ids:readonly string[]){
 for(const id of ids){
  if(!namesAUnit(id)||reportedMisses.has(id))continue;
  if(reportedMisses.size>=500)return;
  reportedMisses.add(id);
  console.warn(`liturgy: no library source matches the pinned id ${JSON.stringify(id)} by key or by authority.unitId; this cue reports no position`);
 }
}

/**
 * The liturgical position of one cue, from the first of its sources that the library can
 * place — by library key, or failing that by bare `authority.unitId`. A cue with no such
 * source — a baseline cue, a custom graphic, an F3 template, a names panel — resolves to
 * all nulls, which is also what `/api/now` publishes for it. A source id that meant to name
 * a unit and matched neither way is logged rather than silently nulled.
 */
export function liturgyForCue(cue:{authoring?:{sourceIds?:string[]}}|null|undefined,lookups:LiturgyLookups={}):LiturgyRef{
 return liturgyForSourceIds(cue?.authoring?.sourceIds,lookups);
}

/**
 * The same resolution from source ids alone. The cue log keeps the `library:` ids of the
 * graphic that was pinned rather than a position, so a history read resolves them here — which
 * is why a moment table that lands later starts answering for services already recorded.
 */
export function liturgyForSourceIds(ids:readonly string[]|null|undefined,lookups:LiturgyLookups={}):LiturgyRef{
 if(!Array.isArray(ids))return {...NO_LITURGY};
 const candidates=ids.filter((id):id is string=>typeof id==='string'&&id.length>0);
 if(candidates.length===0)return {...NO_LITURGY};
 const index=sourceIndex(lookups.sources);
 const keyed=candidates.find(id=>index.has(id));
 let source=keyed===undefined?undefined:index.get(keyed);
 if(!source){
  // The cue pinned a bare unit id rather than a library key. Resolve it the other way round
  // before giving up — this is the Barechu case, and it is a real position either way.
  const units=unitIndex(lookups.sources);
  const bare=candidates.find(id=>units.has(id));
  if(bare!==undefined)source=units.get(bare);
 }
 if(!source){reportLiturgyMiss(candidates);return {...NO_LITURGY};}
 const unitId=typeof source.authority?.unitId==='string'&&source.authority.unitId?source.authority.unitId:null;
 const moments=lookups.moments??loadMoments();
 const moment=unitId?moments.find(entry=>entry.unitId===unitId):undefined;
 return {unitId,momentId:moment?.momentId??null,book:feedSlug(source),folio:firstFolio(source)};
}

/** The whole catalog as `{[cueId]:LiturgyRef}` — what `/api/catalog?include=liturgy` returns. */
export function liturgyIndex(cues:readonly Cue[],lookups:LiturgyLookups={}):Record<string,LiturgyRef>{
 const moments=lookups.moments??loadMoments();
 const sources=lookups.sources??undefined;
 const result:Record<string,LiturgyRef>={};
 for(const cue of cues)result[cue.id]=liturgyForCue(cue as {authoring?:{sourceIds?:string[]}},{sources,moments});
 return result;
}
