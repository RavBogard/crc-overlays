import {AuthoringError,type Draft} from './authoring-model';
import type {SharedLibraryEntry,SharedLibraryPayload} from './shared-library';

// T1 - customize_shared_batch: many shared-library graphics copied here in one call. This module
// only reads: it checks each item and decides what would happen to it. lib/authoring.ts makes the
// copies through the same paths customize_shared_cue and customize_shared_set use.
//
// Resumable by content, not by cursor: an item is "already copied" when a live draft here was copied
// from that exact upstream version (cue id and cue hash; for a set, a whole set in order). Every
// copy is its own insert, so a call that stops part way leaves its finished items in place and the
// same call again skips them and copies the rest.
export const SHARED_BATCH_MAX_ITEMS=50;
export type SharedBatchItem={cueId?:string;setId?:string;expectedCueHash?:string;expectedCueHashes?:Record<string,string>;name?:string;applyDefaults?:boolean};
export type SharedBatchPlan={
 index:number;kind:'cue'|'set';id:string;name:string;layout:string|null;
 entries:SharedLibraryEntry[];item:SharedBatchItem;
 status:'ready'|'already-copied'|'refused';reason?:string;
 draftIds?:string[];notes:string[];
};

const HASH=/^[a-f0-9]{64}$/;
const refuse=(message:string)=>new AuthoringError('invalid_input',message);
const text=(value:unknown,field:string,max:number)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw refuse(`${field} must be 1-${max} characters`);return value.trim()};

export function parseSharedBatchItems(value:unknown):SharedBatchItem[]{
 if(!Array.isArray(value)||!value.length)throw refuse('items must list 1 to 50 shared-library graphics, each {cueId} or {setId}.');
 if(value.length>SHARED_BATCH_MAX_ITEMS)throw new AuthoringError('batch_too_large',`customize_shared_batch copies at most ${SHARED_BATCH_MAX_ITEMS} items per call, and this one has ${value.length}. Nothing was copied. Send the first ${SHARED_BATCH_MAX_ITEMS}, then the rest in another call; items already copied are skipped, so the order doesn't matter.`,400);
 return value.map((raw,index)=>{
  const at=`items[${index}]`;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw refuse(`${at} must be an object`);
  const item=raw as Record<string,unknown>,extra=Object.keys(item).filter(key=>!['cueId','setId','expectedCueHash','expectedCueHashes','name','applyDefaults'].includes(key));if(extra.length)throw refuse(`${at} contains unsupported fields: ${extra.join(', ')}`);
  if((item.cueId===undefined)===(item.setId===undefined))throw refuse(`${at} needs exactly one of cueId (one graphic) or setId (a whole multipart prayer).`);
  const parsed:SharedBatchItem={};
  if(item.cueId!==undefined)parsed.cueId=text(item.cueId,`${at}.cueId`,160);
  if(item.setId!==undefined)parsed.setId=text(item.setId,`${at}.setId`,160);
  if(item.expectedCueHash!==undefined){if(!parsed.cueId)throw refuse(`${at}.expectedCueHash goes with cueId; a set takes expectedCueHashes.`);if(typeof item.expectedCueHash!=='string'||!HASH.test(item.expectedCueHash))throw refuse(`${at}.expectedCueHash must be the 64-character cueHash list_shared_library returned.`);parsed.expectedCueHash=item.expectedCueHash}
  if(item.expectedCueHashes!==undefined){if(!parsed.setId)throw refuse(`${at}.expectedCueHashes goes with setId; a single graphic takes expectedCueHash.`);const hashes=item.expectedCueHashes;if(!hashes||typeof hashes!=='object'||Array.isArray(hashes)||!Object.keys(hashes).length||Object.keys(hashes).length>200||Object.values(hashes).some(hash=>typeof hash!=='string'||!HASH.test(hash)))throw refuse(`${at}.expectedCueHashes must map each part's cue id to its 64-character cueHash.`);parsed.expectedCueHashes={...hashes as Record<string,string>}}
  if(item.name!==undefined){if(!parsed.cueId)throw refuse(`${at}.name goes with cueId; a set keeps its own part names.`);parsed.name=text(item.name,`${at}.name`,80)}
  if(item.applyDefaults!==undefined){if(typeof item.applyDefaults!=='boolean')throw refuse(`${at}.applyDefaults must be true or false`);parsed.applyDefaults=item.applyDefaults}
  return parsed;
 });
}

const live=(drafts:Draft[])=>drafts.filter(draft=>!draft.archivedAt&&draft.sharedFrom?.workspaceId==='crc');

export function planSharedBatch(items:SharedBatchItem[],payload:SharedLibraryPayload,drafts:Draft[]):SharedBatchPlan[]{
 const copies=live(drafts),seen=new Map<string,number>();
 return items.map((item,index)=>{
  const kind=item.cueId?'cue':'set',id=(item.cueId??item.setId)!,key=`${kind}:${id}`;
  const plan:SharedBatchPlan={index,kind,id,name:id,layout:null,entries:[],item,status:'ready',notes:[]};
  const refused=(reason:string)=>({...plan,status:'refused' as const,reason});
  const repeated=seen.get(key);if(repeated!==undefined)return refused(`This repeats item ${repeated+1}; it is copied once.`);seen.set(key,index);
  if(kind==='cue'){
   const entry=payload.cues.find(cue=>cue.id===id);if(!entry)return refused(`No shared-library graphic has the id ${id}. Call list_shared_library for the current ids.`);
   plan.entries=[entry];plan.name=item.name??entry.name;plan.layout=entry.layout;
   if(item.expectedCueHash&&item.expectedCueHash!==entry.cueHash)return refused(`"${entry.name}" changed upstream since you read it. Nothing was copied for it; run a dry run again and pass the new expectedCueHash.`);
   const done=copies.filter(draft=>!draft.draftSetId&&draft.sharedFrom!.cueId===id&&draft.sharedFrom!.cueHash===entry.cueHash);
   if(done.length)return {...plan,status:'already-copied' as const,draftIds:done.map(draft=>draft.id)};
   if(entry.set)plan.notes.push(`This is part ${entry.set.index} of ${entry.set.count} of "${entry.set.title}"; pass setId '${entry.set.id}' to copy the whole prayer instead.`);
  }else{
   const members=payload.cues.filter(cue=>cue.set?.id===id).sort((a,b)=>a.set!.index-b.set!.index);if(!members.length)return refused(`No shared-library multipart prayer has the set id ${id}. Call list_shared_library for the current sets.`);
   plan.entries=members;plan.name=members[0].set!.title;plan.layout=members[0].layout;
   if(item.expectedCueHashes){const expected=item.expectedCueHashes;if(Object.keys(expected).length!==members.length||members.some(entry=>expected[entry.id]!==entry.cueHash))return refused(`"${plan.name}" changed upstream since you read it. Nothing was copied for it; run a dry run again and pass the new expectedCueHashes.`)}
   const bySet=new Map<string,Draft[]>();for(const draft of copies)if(draft.draftSetId)bySet.set(draft.draftSetId,[...(bySet.get(draft.draftSetId)??[]),draft]);
   for(const set of bySet.values()){const ordered=set.sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(ordered.length===members.length&&ordered.every((draft,position)=>draft.sharedFrom!.cueId===members[position].id&&draft.sharedFrom!.cueHash===members[position].cueHash))return {...plan,status:'already-copied' as const,draftIds:ordered.map(draft=>draft.id)}}
  }
  const older=copies.filter(draft=>plan.entries.some(entry=>draft.sharedFrom!.cueId===entry.id&&draft.sharedFrom!.cueHash!==entry.cueHash));
  if(older.length)plan.notes.push(`${older.length===1?'A copy':`${older.length} copies`} of an earlier version ${older.length===1?'is':'are'} already here (${[...new Set(older.map(draft=>draft.name))].join(', ')}); this makes a new copy of the current version and leaves ${older.length===1?'it':'them'} alone.`);
  return plan;
 });
}
