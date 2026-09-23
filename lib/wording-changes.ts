import {resolveSourceBoundaries,sourcePack,type AuthoringSource,type Draft,type VariantChannel} from './authoring-model';
import {sourceDisplay} from './source-library';

/**
 * The "Wording changes" review list (Daniel + Michael, 2026-09-23). Every local-variant line in the
 * workspace, the exact siddur text beside the edited text, so a misspelling found while building a
 * graphic can be corrected in the source later. Reading it changes nothing; the siddur is never
 * rewritten from here. Upstream feed changes are a different queue (lib/source-review.ts).
 */
export type WordingChange={
 draftId:string;draftName:string;draftTitle:string;published:boolean;archived:boolean;
 label:string;reason:string|null;
 sourceId:string;sourceName:string;book:string;folio:string|null;
 blockId:string;blockNumber:number|null;channel:VariantChannel;
 sourceText:string;localText:string;
 updatedAt:number;updatedBy:string;
};

function sourceFor(draft:Draft,sourceId:string):AuthoringSource|undefined{
 const raw=draft.sourceSnapshots?.find(item=>item.id===sourceId)??sourcePack.sources.find(item=>item.id===sourceId);
 if(!raw)return undefined;
 try{return resolveSourceBoundaries(raw)}catch{return raw}
}

export function wordingChanges(drafts:readonly Draft[]):WordingChange[]{
 const rows=drafts.flatMap(draft=>{
  if(draft.content.mode!=='local-variant')return [];
  const content=draft.content;
  return content.overrides.map(item=>{
   const source=sourceFor(draft,item.sourceId),block=source?.blocks.find(candidate=>candidate.id===item.blockId),display=sourceDisplay(source);
   return {
    draftId:draft.id,draftName:draft.name,draftTitle:draft.title,published:draft.activeRevision!==null,archived:Boolean(draft.archivedAt),
    label:content.label,reason:content.reason??null,
    sourceId:item.sourceId,sourceName:source?.name??item.sourceId,book:display.bookTitle,folio:display.folio,
    blockId:item.blockId,blockNumber:block?block.index+1:null,channel:item.channel,
    sourceText:item.sourceText,localText:item.localText,
    updatedAt:draft.updatedAt,updatedBy:draft.updatedBy,
   } satisfies WordingChange;
  });
 });
 const channelOrder:Record<VariantChannel,number>={he:0,tr:1,en:2};
 return rows.sort((a,b)=>a.book.localeCompare(b.book)||a.sourceName.localeCompare(b.sourceName)||a.sourceId.localeCompare(b.sourceId)||(a.blockNumber??0)-(b.blockNumber??0)||channelOrder[a.channel]-channelOrder[b.channel]||b.updatedAt-a.updatedAt||a.draftId.localeCompare(b.draftId));
}
