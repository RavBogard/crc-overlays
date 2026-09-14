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
 * The liturgical position of one cue, from its first library source. Only `library:`
 * sources are considered: they are the ones that carry a shireishabbat unit pin. A cue
 * with no such source — a baseline cue, a custom graphic, an F3 template, a names panel —
 * resolves to all nulls, which is also what `/api/now` publishes for it.
 */
export function liturgyForCue(cue:{authoring?:{sourceIds?:string[]}}|null|undefined,lookups:LiturgyLookups={}):LiturgyRef{
 const ids=cue?.authoring?.sourceIds;
 if(!Array.isArray(ids))return {...NO_LITURGY};
 const index=sourceIndex(lookups.sources);
 const sourceId=ids.find(id=>typeof id==='string'&&id.startsWith('library:')&&index.has(id));
 if(!sourceId)return {...NO_LITURGY};
 const source=index.get(sourceId)!;
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
