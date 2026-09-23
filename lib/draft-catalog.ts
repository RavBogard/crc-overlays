import {sourcePack,type Draft,type Layout,type Presentation} from './authoring-model';

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

function summary(draft:Draft):DraftCatalogSummary{
 const sources=sourceMetadata(draft);
 const sourceBooks=[...new Map(sources.map(source=>{
  const value=typeof source.metadata?.bookSlug==='string'?source.metadata.bookSlug:source.book??'';
  const label=typeof source.metadata?.bookTitle==='string'?source.metadata.bookTitle:source.book??value;
  return [value,{value,label}] as const;
 }).filter(([value])=>Boolean(value))).values()];
 const sourceServices=[...new Set(sources.map(source=>source.service??'').filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const content=draft.content.mode==='local-variant'?draft.content.base:draft.content;
 const arrangement=content.mode==='bilingual'&&content.arrangement==='blocks'?'blocks':content.mode==='bilingual'?'together':null;
 const selectedBlocks=content.mode==='bilingual'?content.hebrewGroups.reduce((count,group)=>count+group.blockIds.length,0):0;
 const visibleLanguages=content.mode==='bilingual'?(content.layers?.length??(content.includeTranslation?3:2)):0;
 const presentation={...draft.presentation};
 // These are the editor's established Compact sizes. This is an authoring cue to inspect,
 // not a measurement or a visual-pass claim.
 const smallFont=(presentation.hebrewFontSize!==undefined&&presentation.hebrewFontSize<34)||(presentation.transliterationFontSize!==undefined&&presentation.transliterationFontSize<28)||(presentation.titleFontSize!==undefined&&presentation.titleFontSize<28);
 return {id:draft.id,name:draft.name,title:draft.title,version:draft.version,activeVersion:draft.activeDraftVersion,activeRevision:draft.activeRevision,layout:draft.layout,templateCueId:draft.templateCueId,presentation,arrangement,sourceBooks,sourceServices,flags:{smallFont,alternatingGrouping:arrangement==='together'&&draft.layout!=='bottom'&&selectedBlocks>1&&visibleLanguages>1}};
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
