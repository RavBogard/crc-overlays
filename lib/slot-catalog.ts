/**
 * Which published cue each slot is, and what that cue's text currently says.
 *
 * `content/slot-cues.json` is the register: `key -> cue id`. It is committed data, read
 * with the same tolerance as `content/moments.json` — an unreadable or malformed file is
 * one warning and an empty register, never a 503 on `/api/catalog`, because losing the
 * slot index must not take the live library down for everyone.
 *
 * A key with no id yet is simply not a slot: it does not appear in the index, the module
 * declares no variable for it, and no preset is generated. That is how the sixteen slots
 * were able to land one at a time.
 */
import {createRequire} from 'node:module';
import {SLOTS,SLOT_CATEGORY,slotDefinition} from './slots';
import type {Cue} from './player';

/** One slot as `GET /api/catalog?include=slots` reports it. */
export type CatalogSlot={cueId:string;key:string;text:string};

const require=createRequire(import.meta.url);
export type SlotCueReader=()=>unknown;
const readCommitted:SlotCueReader=()=>require('../content/slot-cues.json');

const SAFE_KEY=/^[a-z][a-z0-9_]{0,39}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readRegister(value:unknown):Map<string,string>{
 const raw=(value as {cues?:unknown}|null)?.cues;
 const map=new Map<string,string>();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return map;
 for(const [key,id] of Object.entries(raw as Record<string,unknown>)){
  // A key nothing declares, a key that could not be a variable name, or an id that is not
  // a cue id is skipped rather than trusted: this file reaches a Companion variable name.
  if(!SAFE_KEY.test(key)||!slotDefinition(key))continue;
  if(typeof id!=='string'||!UUID.test(id))continue;
  map.set(key,id);
 }
 return map;
}

let committed:Map<string,string>|undefined;
let warned=false;
let override:Map<string,string>|null=null;
/**
 * Tests only. The register is a committed data file with no seam of its own, and the slot save
 * path reads it by name rather than taking it as an argument, so a test that needs different
 * ids installs them here and clears them again.
 */
export function useSlotCueRegister(value:Map<string,string>|null){override=value}

/** The committed register. An injected reader is always run, so a test never poisons the cache. */
export function slotCueRegister(read:SlotCueReader=readCommitted):Map<string,string>{
 if(override&&read===readCommitted)return override;
 const load=()=>{
  try{return readRegister(read())}
  catch(error){
   if(!warned){warned=true;console.warn('content/slot-cues.json could not be read; no slot is addressable',error)}
   return new Map<string,string>();
  }
 };
 if(read!==readCommitted)return load();
 if(!committed)committed=load();
 return committed;
}

/** The text a slot cue currently carries: the one text layer a custom bottom graphic has. */
export function slotTextOf(cue:Cue|undefined):string{
 return typeof cue?.texts?.textMain==='string'?cue.texts.textMain:'';
}

/**
 * The slot index for a catalog: one entry per registered slot whose cue is actually in the
 * catalog, in the order the slot table declares. A registered slot whose cue has not been
 * published yet is left out rather than reported with empty text, because "not there" and
 * "there and blank" are different things on the deck.
 */
export function slotIndex(cues:readonly Cue[],register=slotCueRegister()):CatalogSlot[]{
 const byId=new Map(cues.map(cue=>[cue.id,cue]));
 const index:CatalogSlot[]=[];
 for(const slot of SLOTS){
  const cueId=register.get(slot.key);
  if(!cueId)continue;
  const cue=byId.get(cueId);
  if(!cue)continue;
  index.push({cueId,key:slot.key,text:slotTextOf(cue)});
 }
 return index;
}

/**
 * What kind of graphic a cue is, used only to colour its generated Companion preset. Two
 * categories can honestly be derived from what the library records today: a slot or a
 * names panel is a name card, and everything else is core liturgy. The module treats an
 * unknown category as core liturgy, so adding the remaining categories later is a change
 * to this function alone.
 */
export function cueCategory(cue:Cue,register=slotCueRegister()):string{
 if(cue.id.startsWith('names:'))return SLOT_CATEGORY;
 for(const cueId of register.values())if(cueId===cue.id)return SLOT_CATEGORY;
 return 'core_liturgy';
}

/**
 * The cues as the `?include=slots` envelope carries them: the same cues, each additionally
 * marked with its category and, for a slot, its key. The bare `Cue[]` the default response
 * returns is untouched — three clients validate that shape field by field — so these two
 * extra fields exist only inside the opt-in envelope.
 */
export function cuesWithSlotMarkers(cues:readonly Cue[],register=slotCueRegister()){
 const keyById=new Map(Array.from(register, ([key,cueId])=>[cueId,key]));
 return cues.map(cue=>{
  const key=keyById.get(cue.id);
  return {...cue,category:cueCategory(cue,register),...(key?{slot:{key}}:{})};
 });
}
