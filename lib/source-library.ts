import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import type {AuthoringSource,SourcePack} from './authoring-model';

// This module deliberately depends on node:* and the private generated JSON. Import it
// only from server authoring code; client UI receives bounded search results, never the corpus.
const require=createRequire(import.meta.url);
const legacyJson=require('../content/authoring-sources.json') as SourcePack;
const libraryJson=require('../content/siddur-library.json') as SiddurLibrary;

export type SourceAuthority={
 id:string;
 repository:string;
 repositoryCommit:string;
 feed:string;
 feedSha256:string;
 feedSchemaVersion:number;
 printing:unknown;
 license:unknown;
};

export type LibrarySource=AuthoringSource&{
 origin:string;
 sourceSha256:string;
 book:string;
 service:string;
 aliases:string[];
 openingWords:string[];
 metadata:Record<string,unknown>;
 authority:{
  id:string;
  repository:string;
  repositoryCommit:string;
  feed:string;
  feedSha256:string;
  unitId:string;
  unitSha256:string;
 };
};

export type CoverageBook={
 book:string;
 service:string;
 feed:string;
 feedSha256:string;
 units:number;
 usableUnits:number;
 unsupportedUnits:Array<{id:string;name:string;reason:string;skipped:Record<string,number>}>;
 blocks:number;
 pairedBilingualBlocks:number;
 originalEnglishBlocks:number;
 sourceEnglishBlocks:number;
 noteLikeEnglishBlocks:number;
 skipped:Record<string,number>;
};

export type SiddurLibrary={
 schemaVersion:number;
 scope?:{workspaceId:string};
 generatedFrom:{repository:string;repositoryCommit:string;manifest:string;manifestSha256:string};
 authorities:SourceAuthority[];
 sources:LibrarySource[];
 coverage:{books:CoverageBook[];totals:Record<string,unknown>;rules:string[]};
};

export type MergedSourcePack=SourcePack&{
 authorities:Array<SourceAuthority|({id:string}&SourcePack['authority'])>;
 library:{generatedFrom:SiddurLibrary['generatedFrom'];coverage:SiddurLibrary['coverage']};
};

function fail(message:string):never{throw new Error(`Invalid siddur source library: ${message}`)}
function sha(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function words(value:unknown){return typeof value==='string'&&value?value.split(/\s+/).slice(0,12).join(' '):''}
function unique(values:string[]){return [...new Set(values.filter(Boolean))]}

function annotateLegacy(source:AuthoringSource):LibrarySource{
 const openingWords=unique(source.blocks.flatMap(block=>[words(block.he),words(block.tr),words(block.en)]));
 return {
  ...source,
  origin:'legacy:authoring-sources',
  sourceSha256:source.unitSha256,
  book:'CRC Shabbat Morning Siddur',
  service:'Shabbat Morning',
  aliases:unique([source.name,typeof source.section==='string'?source.section:'']),
  openingWords:openingWords.slice(0,8),
  metadata:{bookSlug:'legacy-shabbat-morning',legacySource:true},
  authority:{
   id:'legacy:authoring-sources',
   repository:legacyJson.authority.repository,
   repositoryCommit:legacyJson.authority.repositoryCommit,
   feed:legacyJson.authority.feed,
   feedSha256:legacyJson.authority.feedSha256,
   unitId:source.id,
   unitSha256:source.unitSha256,
  },
 };
}

function validate(){
 if(libraryJson.schemaVersion!==1)fail('unsupported schema version');
 if(!Array.isArray(libraryJson.sources))fail('sources are absent');
 if(!Array.isArray(libraryJson.authorities))fail('authorities are absent');
 if(!libraryJson.sources.length||!libraryJson.authorities.length)fail('sources and authorities must both be populated');
 const authorityIds=new Set(libraryJson.authorities.map(item=>item.id));
 if(authorityIds.size!==libraryJson.authorities.length)fail('authority IDs are not unique');
 const sourceIds=new Set(legacyJson.sources.map(item=>item.id));
 const blockIds=new Set<string>();
 for(const source of libraryJson.sources){
  if(!source.id.startsWith('library:'))fail(`source is not namespaced: ${source.id}`);
  if(sourceIds.has(source.id))fail(`duplicate source ID: ${source.id}`);
  sourceIds.add(source.id);
  if(!authorityIds.has(source.origin)||source.authority.id!==source.origin)fail(`unknown authority for ${source.id}`);
  if(source.sourceSha256!==source.unitSha256||source.authority.unitSha256!==source.unitSha256)fail(`unit pin mismatch for ${source.id}`);
  if(!Array.isArray(source.aliases)||!Array.isArray(source.openingWords))fail(`search metadata is absent for ${source.id}`);
  if(!Array.isArray(source.blocks)||!source.blocks.length)fail(`source has no supported blocks: ${source.id}`);
  for(const block of source.blocks){
   if(blockIds.has(block.id))fail(`duplicate block ID: ${block.id}`);
   blockIds.add(block.id);
   if(block.kind==='bilingual'){
    if(!block.he||!block.tr)fail(`invalid bilingual block: ${block.id}`);
    if(block.en!==undefined&&(!block.englishRole||typeof block.automatic!=='boolean'||typeof block.noteLike!=='boolean'))fail(`bilingual English metadata is absent: ${block.id}`);
   }else if(block.kind==='original-en'){
    if(!block.en||block.role!=='original'||block.he!==undefined||block.tr!==undefined)fail(`invalid original English block: ${block.id}`);
   }else if(block.kind==='source-en'){
    if(!block.en||!block.englishRole||typeof block.automatic!=='boolean'||typeof block.noteLike!=='boolean'||block.role==='original')fail(`invalid source English block: ${block.id}`);
   }else fail(`unsupported block kind in expanded library: ${block.id}`);
  }
 }
 // Exercise the deterministic hashing dependency here so accidental non-object JSON
 // fails during server startup rather than during a user's source search.
 if(!sha(libraryJson.generatedFrom))fail('generated source metadata cannot be hashed');
}

validate();

const legacyAuthority={id:'legacy:authoring-sources',...legacyJson.authority};
const annotatedLegacySources=legacyJson.sources.map(annotateLegacy);
const merged: MergedSourcePack={
 ...legacyJson,
 // Existing authority and source objects remain untouched so old draft pins retain
 // their exact identity and hash meaning. Search-only metadata is additive.
 sources:[...annotatedLegacySources,...libraryJson.sources],
 authorities:[legacyAuthority,...libraryJson.authorities],
 library:{generatedFrom:libraryJson.generatedFrom,coverage:libraryJson.coverage},
};

export type SourceDisplay={bookTitle:string;folio:string|null;sectionTitle:string|null;edition:string|null};

/** Sources a person can see are never named by their slug, so a source whose title is missing falls back to this. */
const UNTITLED_BOOK='Unlabeled book';
const LOCAL_KIND_LABELS:Record<string,string>={'prayer-book reading':'Prayer-book reading','song setting':'Song setting','tbi text':'TBI text'};
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)+$/;
const printingLabel=(printing:unknown)=>{
 if(!printing||typeof printing!=='object')return null;
 const pages=(printing as {pages?:unknown}).pages;
 return typeof pages==='number'&&Number.isFinite(pages)&&pages>0?`${pages}-page printing`:null;
};

/**
 * The printed provenance of one source, for search results and coverage rows: the book as it
 * is printed, the folio as a reader would cite it, the printed section, and the edition the
 * text came from. Never returns a slug identifier such as "legacy-shabbat-morning" — library
 * sources carry the slug in `book` and the printed title in `metadata.bookTitle`, and legacy
 * annotated sources carry the printed title in `book` and the slug in `metadata.bookSlug`.
 */
export function sourceDisplay(source:{id?:string;book?:string;service?:string;section?:string|number|null;origin?:string;metadata?:Record<string,unknown>}|null|undefined):SourceDisplay{
 const metadata=(source?.metadata??{}) as Record<string,unknown>;
 const title=typeof metadata.bookTitle==='string'?metadata.bookTitle.trim():'';
 const book=typeof source?.book==='string'?source.book.trim():'';
 const bookSlug=typeof metadata.bookSlug==='string'?metadata.bookSlug.trim():'';
 // G3 - a workspace's own source with no book (a song setting, its own text) is named by its kind, not as an unlabeled book.
 const localKind=metadata.local===true&&typeof metadata.localKind==='string'?LOCAL_KIND_LABELS[metadata.localKind]??'':'';
 const bookTitle=title||((book&&book!==bookSlug&&!SLUG.test(book))?book:'')||localKind||UNTITLED_BOOK;
 const folios=Array.isArray(metadata.folios)?metadata.folios.filter((value):value is number=>typeof value==='number'&&Number.isFinite(value)):[];
 const ordered=[...new Set(folios)].sort((a,b)=>a-b);
 const contiguous=ordered.length>1&&ordered.every((value,index)=>index===0||value===ordered[index-1]+1);
 const folio=!ordered.length?null:ordered.length===1?`p. ${ordered[0]}`:contiguous?`pp. ${ordered[0]}–${ordered[ordered.length-1]}`:`pp. ${ordered.join(', ')}`;
 const metadataSection=typeof metadata.sectionTitle==='string'?metadata.sectionTitle.trim():'';
 const rawSection=typeof source?.section==='string'?source.section.trim():'';
 const sectionTitle=metadataSection||rawSection||null;
 const edition=(typeof metadata.familyLabel==='string'&&metadata.familyLabel.trim())||printingLabel(authorityPrinting(source?.origin))||null;
 return {bookTitle,folio,sectionTitle,edition};
}

function authorityPrinting(origin:string|undefined){
 if(!origin)return null;
 if(origin==='legacy:authoring-sources')return legacyJson.authority.printing;
 return libraryJson.authorities.find(item=>item.id===origin)?.printing??null;
}

export const siddurLibrary:SiddurLibrary=libraryJson;
export function loadSourceLibrary():SourcePack{return merged}
