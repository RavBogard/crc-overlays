import {sourcePack,textLayers,type Draft,type DraftContent,type Layout,type Presentation,type TextLayer} from './authoring-model';

export type DraftCatalogInput={
 query?:string;
 service?:string;
 book?:string;
 layout?:Layout;
 limit?:number;
 cursor?:string;
};

export type DraftCatalogSummary={
 id:string;
 name:string;
 title:string;
 version:number;
 activeVersion:number|null;
 activeRevision:number|null;
 layout:Layout;
 templateCueId:string;
 presentation:Presentation;
 arrangement:'together'|'blocks'|null;
 sourceBooks:Array<{value:string;label:string}>;
 sourceServices:string[];
 contentSummary:{
  mode:DraftContent['mode'];
  selectedChannels:TextLayer[];
  sourceAvailableChannels:TextLayer[];
  selectedBlockCount:number;
  warnings:Array<{code:'source_language_unavailable';sourceId:string;channel:TextLayer;message:string}>;
 };
 flags:{smallFont:boolean;alternatingGrouping:boolean};
};

const normalized=(value:unknown)=>String(value??'').normalize('NFKD').replace(/[\u0591-\u05c7\p{M}]/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const canonicalSources=new Map(sourcePack.sources.map(source=>[source.id,source]));

function sourceIds(draft:Draft){
 const content=draft.content.mode==='local-variant'?draft.content.base:draft.content;
 if(content.mode==='bilingual')return content.hebrewGroups.map(group=>group.sourceId);
 if(content.mode==='original-en'||content.mode==='source-en')return content.englishGroups.map(group=>group.sourceId);
 return [];
}

function sourceMetadata(draft:Draft){
 const snapshots=draft.sourceSnapshots??[];
 return [...new Set(sourceIds(draft))].map(id=>snapshots.find(source=>source.id===id)??canonicalSources.get(id)).filter((source):source is NonNullable<typeof source>=>Boolean(source));
}

const channelOrder:TextLayer[]=['he','tr','en'];
const meaningful=(channel:TextLayer,value:unknown)=>typeof value==='string'&&(channel==='he'?/\p{Script=Hebrew}/u:/\p{L}/u).test(value);

function canonicalContent(content:DraftContent){return content.mode==='local-variant'?content.base:content;}

function selections(content:DraftContent){
 const base=canonicalContent(content);
 if(base.mode==='bilingual')return base.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId})));
 if(base.mode==='original-en'||base.mode==='source-en')return base.englishGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId})));
 return [];
}

function requestedChannels(content:DraftContent):TextLayer[]{
 const base=canonicalContent(content);
 if(base.mode==='bilingual')return textLayers(base);
 if(base.mode==='original-en'||base.mode==='source-en')return ['en'];
 return [];
}

function contentSummary(draft:Draft):DraftCatalogSummary['contentSummary']{
 const base=canonicalContent(draft.content), selected=selections(draft.content), channels=requestedChannels(draft.content);
 const sourceById=new Map(sourceMetadata(draft).map(source=>[source.id,source]));
 const available=new Set<TextLayer>();
 const warnings:Array<{code:'source_language_unavailable';sourceId:string;channel:TextLayer;message:string}>=[];
 const seen=new Set<string>();
 const warn=(sourceId:string,channel:TextLayer,message:string)=>{
  const key=`${sourceId}\u0000${channel}`;
  if(seen.has(key))return;
  seen.add(key);warnings.push({code:'source_language_unavailable',sourceId,channel,message});
 };
 for(const source of sourceById.values())for(const block of source.blocks)for(const channel of channelOrder){
  const value=block[channel];
  if(meaningful(channel,value)){available.add(channel);continue;}
  // The source explicitly says a paired channel is unavailable (for example `he: "—"`).
  // Surface that fact even on an English-only draft so compact catalog callers do not need a
  // source snapshot to learn that a later bilingual revision cannot be sourced as-is.
  if(typeof value==='string'&&value.trim())warn(source.id,channel,`${channel==='he'?'Hebrew':channel==='tr'?'Transliteration':'English'} is not printed in this source body.`);
 }
 for(const {sourceId,blockId} of selected){
  const source=sourceById.get(sourceId), block=source?.blocks.find(candidate=>candidate.id===blockId)??canonicalSources.get(sourceId)?.blocks.find(candidate=>candidate.id===blockId);
  for(const channel of channels){
   // English for bilingual selections is derived only from validated translation pairs. It is
   // not a direct field on the selected Hebrew/transliteration block.
   if(base.mode==='bilingual'&&channel==='en')continue;
   if(meaningful(channel,block?.[channel]))continue;
   warn(sourceId,channel,`${channel==='he'?'Hebrew':channel==='tr'?'Transliteration':'English'} is not available in the selected source block.`);
  }
 }
 return {mode:draft.content.mode,selectedChannels:channels,sourceAvailableChannels:channelOrder.filter(channel=>available.has(channel)),selectedBlockCount:selected.length,warnings};
}

function summary(draft:Draft):DraftCatalogSummary{
 const sources=sourceMetadata(draft);
 const sourceBooks=[...new Map(sources.map(source=>{
  const value=typeof source.metadata?.bookSlug==='string'?source.metadata.bookSlug:source.book??'';
  const label=typeof source.metadata?.bookTitle==='string'?source.metadata.bookTitle:source.book??value;
  return [value,{value,label}] as const;
 }).filter(([value])=>Boolean(value))).values()];
 const sourceServices=[...new Set(sources.map(source=>source.service??'').filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const content=canonicalContent(draft.content);
 const arrangement=content.mode==='bilingual'&&content.arrangement==='blocks'?'blocks':content.mode==='bilingual'?'together':null;
 const selectedBlocks=content.mode==='bilingual'?content.hebrewGroups.reduce((count,group)=>count+group.blockIds.length,0):0;
 const visibleLanguages=content.mode==='bilingual'?(content.layers?.length??(content.includeTranslation?3:2)):0;
 const presentation={...draft.presentation};
 // These are the editor's established Compact sizes. This is an authoring cue to inspect,
 // not a measurement or a visual-pass claim.
 const smallFont=(presentation.hebrewFontSize!==undefined&&presentation.hebrewFontSize<34)||(presentation.transliterationFontSize!==undefined&&presentation.transliterationFontSize<28)||(presentation.titleFontSize!==undefined&&presentation.titleFontSize<28);
 return {id:draft.id,name:draft.name,title:draft.title,version:draft.version,activeVersion:draft.activeDraftVersion,activeRevision:draft.activeRevision,layout:draft.layout,templateCueId:draft.templateCueId,presentation,arrangement,sourceBooks,sourceServices,contentSummary:contentSummary(draft),flags:{smallFont,alternatingGrouping:arrangement==='together'&&draft.layout!=='bottom'&&selectedBlocks>1&&visibleLanguages>1}};
}

export function compactDraftCatalog(drafts:Draft[],input:DraftCatalogInput){
 const query=normalized(input.query),service=normalized(input.service),book=normalized(input.book);
 const rows=drafts.map(summary).filter(row=>{
  if(input.layout&&row.layout!==input.layout)return false;
  if(service&&!row.sourceServices.some(value=>normalized(value)===service))return false;
  if(book&&!row.sourceBooks.some(value=>normalized(value.value)===book||normalized(value.label)===book))return false;
  return !query||normalized([row.id,row.name,row.title,row.templateCueId,row.layout,row.arrangement??'',...row.sourceServices,...row.sourceBooks.flatMap(value=>[value.value,value.label])].join(' ')).includes(query);
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const after=input.cursor?rows.filter(row=>row.id.localeCompare(input.cursor!)>0):rows;
 const limit=input.limit??25, draftsPage=after.slice(0,limit);
 return {drafts:draftsPage,total:rows.length,nextCursor:after.length>draftsPage.length?draftsPage.at(-1)!.id:null};
}
