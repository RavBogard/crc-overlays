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

export const siddurLibrary:SiddurLibrary=libraryJson;
export function loadSourceLibrary():SourcePack{return merged}
