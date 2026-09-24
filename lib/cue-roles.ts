/**
 * Role and set per cue, for the `?include=slots` catalog envelope's `roles` key (R-C5).
 *
 * `content/cue-roles.json` is the register, generated from the deck model by
 * scripts/build-cue-roles.mjs (CRC's seed deck today; the stored per-workspace deck once
 * `companion_decks` is live). It is read with the same tolerance as `content/slot-cues.json`:
 * an unreadable or malformed register is one warning and no roles, never a 503, and the module
 * then builds its presets exactly as it did before roles existed. A cue the register does not
 * name, or a register entry for a cue the catalog does not carry (another congregation's ids),
 * is simply left out.
 */
import {createRequire} from 'node:module';
import {isCueRole,type CueRole} from './companion-deck/palette.ts';

export type CatalogCueSet={id:string;name:string;index:number;count:number};
/** One cue's role as `GET /api/catalog?include=slots` reports it under `roles`. */
export type CatalogCueRole={cueId:string;role:CueRole;set?:CatalogCueSet};
type RegisterEntry={role:CueRole;set?:CatalogCueSet};

const require=createRequire(import.meta.url);
export type CueRoleReader=()=>unknown;
const readCommitted:CueRoleReader=()=>require('../content/cue-roles.json');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SET_ID=/^[a-z0-9][a-z0-9-]{0,79}$/;
const UNSAFE_NAME=/[<>\u0000-\u001f\u007f]/;
const panel=(value:unknown):value is number=>Number.isInteger(value)&&(value as number)>=1&&(value as number)<=99;

function readSet(value:unknown):CatalogCueSet|null|undefined{
 if(value===undefined)return undefined;
 const set=value as Record<string,unknown>|null;
 if(!set||typeof set!=='object')return null;
 if(typeof set.id!=='string'||!SET_ID.test(set.id))return null;
 if(typeof set.name!=='string'||!set.name||set.name.length>80||UNSAFE_NAME.test(set.name))return null;
 if(!panel(set.index)||!panel(set.count)||set.index>set.count)return null;
 return {id:set.id,name:set.name,index:set.index,count:set.count};
}

function readRegister(value:unknown):Map<string,RegisterEntry>{
 const raw=(value as {cues?:unknown}|null)?.cues;
 const map=new Map<string,RegisterEntry>();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return map;
 for(const [cueId,entry] of Object.entries(raw as Record<string,unknown>)){
  // An entry that is not exactly well formed is skipped rather than trusted: its set name reaches
  // a Companion preset group label.
  if(!UUID.test(cueId)||!entry||typeof entry!=='object')continue;
  const {role}=entry as {role?:unknown};
  if(!isCueRole(role))continue;
  const set=readSet((entry as {set?:unknown}).set);
  if(set===null)continue;
  map.set(cueId,{role,...(set?{set}:{})});
 }
 return map;
}

let committed:Map<string,RegisterEntry>|undefined;
let warned=false;
/** The committed register. An injected reader is always run, so a test never poisons the cache. */
export function cueRoleRegister(read:CueRoleReader=readCommitted):Map<string,RegisterEntry>{
 const load=()=>{
  try{return readRegister(read())}
  catch(error){
   if(!warned){warned=true;console.warn('content/cue-roles.json could not be read; the catalog carries no roles',error)}
   return new Map<string,RegisterEntry>();
  }
 };
 if(read!==readCommitted)return load();
 if(!committed)committed=load();
 return committed;
}

/** The envelope's `roles`: one entry per catalog cue the register names, in catalog order. */
export function cueRoleIndex(cues:readonly {id:string}[],register=cueRoleRegister()):CatalogCueRole[]{
 const index:CatalogCueRole[]=[];
 for(const cue of cues){
  const entry=register.get(cue.id);
  if(entry)index.push({cueId:cue.id,...entry});
 }
 return index;
}
