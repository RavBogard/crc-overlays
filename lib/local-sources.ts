import {createHash,randomUUID} from 'node:crypto';
import {AuthoringError,type AuthoringSource,type Draft,type SourceBlock} from './authoring-model';

/**
 * T2 - workspace-owned sources: readings a congregation enters itself (a Mishkan T'filah page, a
 * song setting), stored per workspace and merged into the corpus that workspace searches and
 * authors from. They are never shared upstream: lib/shared-library.ts skips every cue built on
 * one, and nothing here is ever written to the siddur library or its feed.
 *
 * A stored record is what the caller entered: channels per block, attribution and licence text
 * exactly as given (never inferred), and a printed position {book, page}. `localSourceUnit`
 * turns it into the AuthoringSource shape the rest of authoring already understands, so a draft
 * built from it pins, snapshots and refreshes exactly as a corpus draft does. Its unitSha256 is a
 * hash of everything the unit says and where it sits, so an edit moves the pin and a pinned draft
 * sees the drift (scan_source_changes, update_draft refreshSourceIds).
 */
export const LOCAL_SOURCE_PREFIX='local:';
export const isLocalSourceId=(id:unknown):id is string=>typeof id==='string'&&id.startsWith(LOCAL_SOURCE_PREFIX);
export const LOCAL_SOURCE_TOOLS=['add_local_source','update_local_source','list_local_sources'] as const;
export const isLocalSourceTool=(operation:string)=>(LOCAL_SOURCE_TOOLS as readonly string[]).includes(operation);

export const LOCAL_SOURCE_LIMITS={name:120,book:100,section:120,service:120,attribution:300,licence:2000,alias:100,aliases:12,blocks:48,channel:2000,total:20000,page:9999,sources:2000} as const;

export type LocalSourceBlock={he?:string;tr?:string;en?:string};
export type LocalSourceRecord={
 id:string;workspaceId:string;version:number;
 name:string;book:string;page:number;section:string|null;service:string|null;
 attribution:string;licence:string|null;aliases:string[];blocks:LocalSourceBlock[];
 unitSha256:string;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string;
};

export interface LocalSourceRepository{
 list():Promise<LocalSourceRecord[]>;
 get(id:string):Promise<LocalSourceRecord|null>;
 insert(record:LocalSourceRecord):Promise<LocalSourceRecord>;
 /** Replaces the record when its stored version is still `expectedVersion`; null when it is not. */
 replace(record:LocalSourceRecord,expectedVersion:number):Promise<LocalSourceRecord|null>;
}

const clone=<T>(value:T):T=>structuredClone(value);
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])]));
 return value;
}
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function currentWorkspaceId(env:{WORKSPACE_ID?:string}=process.env as {WORKSPACE_ID?:string}){return env.WORKSPACE_ID?.trim().toLowerCase()||'crc'}

export class MemoryLocalSourceRepository implements LocalSourceRepository{
 private rows=new Map<string,LocalSourceRecord>();
 async list(){return [...this.rows.values()].map(clone)}
 async get(id:string){const row=this.rows.get(id);return row?clone(row):null}
 async insert(record:LocalSourceRecord){if(this.rows.has(record.id))throw new AuthoringError('local_source_exists','That local source already exists.',409);this.rows.set(record.id,clone(record));return clone(record)}
 async replace(record:LocalSourceRecord,expectedVersion:number){const current=this.rows.get(record.id);if(!current||current.version!==expectedVersion)return null;this.rows.set(record.id,clone(record));return clone(record)}
}

/** Postgres "relation does not exist": db/local-sources.sql has not been applied to this database yet. */
const missingTable=(error:unknown)=>(error as {code?:unknown}|null)?.code==='42P01';
const UNMIGRATED='Local sources are not set up in this workspace\'s database yet (db/local-sources.sql). Nothing was saved; ask whoever runs the database to apply it.';
/**
 * db/local-sources.sql. One row per source, scoped by workspace, written with an optimistic version.
 * Until the migration is applied, reads answer an empty list, so search and book outlines keep
 * working on the corpus alone, and writes refuse in a sentence.
 */
export class PgLocalSourceRepository implements LocalSourceRepository{
 constructor(private workspaceId=currentWorkspaceId()){}
 private async query(sql:string,values:unknown[],write:boolean):Promise<{rows:unknown[];rowCount:number|null}>{try{return await (await import('./database')).db.query(sql,values)}catch(error){if(missingTable(error)){if(write)throw new AuthoringError('local_sources_unavailable',UNMIGRATED,503);return {rows:[],rowCount:0}}throw error}}
 async list(){return (await this.query('SELECT document FROM local_sources WHERE workspace_id=$1 ORDER BY updated_at DESC',[this.workspaceId],false)).rows.map(row=>(row as {document:LocalSourceRecord}).document)}
 async get(id:string){return ((await this.query('SELECT document FROM local_sources WHERE workspace_id=$1 AND id=$2',[this.workspaceId,id],false)).rows[0] as {document:LocalSourceRecord}|undefined)?.document??null}
 async insert(record:LocalSourceRecord){await this.query('INSERT INTO local_sources(workspace_id,id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5,$6,$6)',[this.workspaceId,record.id,record,record.version,record.createdAt,record.createdBy],true);return record}
 async replace(record:LocalSourceRecord,expectedVersion:number){const result=await this.query('UPDATE local_sources SET document=$3,version=$4,updated_at=$5,updated_by=$6 WHERE workspace_id=$1 AND id=$2 AND version=$7',[this.workspaceId,record.id,record,record.version,record.updatedAt,record.updatedBy,expectedVersion],true);return result.rowCount?record:null}
}

/* ---------- the corpus shape ---------- */

/** "Mishkan T'filah" -> "mishkan-tfilah": the book value a facet, a filter or a setlist names it by. */
export function localBookSlug(book:string){return book.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/['’‘`"״׳]/g,'').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'')}
const firstWords=(value:string|undefined)=>value?value.split(/\s+/).slice(0,12).join(' '):'';

function unitBlocks(id:string,blocks:LocalSourceBlock[]):SourceBlock[]{
 const out:SourceBlock[]=[];
 blocks.forEach((block,position)=>{
  const blockId=`${id}#block-${position}`;
  if(block.he!==undefined&&block.tr!==undefined){
   out.push({id:blockId,index:out.length,kind:'bilingual',he:block.he,tr:block.tr,sourceBlockSha256:sha({kind:'bilingual',he:block.he,tr:block.tr})});
   // English beside Hebrew is that block's translation: includeTranslation pairs it the way the corpus pairs its own.
   if(block.en!==undefined)out.push({id:`${blockId}-en`,index:out.length,kind:'translation-en',en:block.en,pairedBlockIds:[blockId],sourceBlockSha256:sha({kind:'translation-en',en:block.en,pairedBlockIds:[blockId]})});
  }else out.push({id:blockId,index:out.length,kind:'original-en',en:block.en,role:'original',sourceBlockSha256:sha({kind:'original-en',en:block.en})});
 });
 return out;
}

/** What a unit's pin covers: everything it says and where it sits. Aliases and service only help search. */
function unitHash(record:Pick<LocalSourceRecord,'id'|'name'|'book'|'page'|'section'|'attribution'|'licence'|'blocks'>){return sha({schema:'local-source-v1',id:record.id,name:record.name,book:record.book,page:record.page,section:record.section,attribution:record.attribution,licence:record.licence,blocks:record.blocks})}

/** One stored record as the AuthoringSource every search, draft and pin reads. */
export function localSourceUnit(record:LocalSourceRecord):AuthoringSource{
 const blocks=unitBlocks(record.id,record.blocks);
 const openingWords=[...new Set(record.blocks.flatMap(block=>[firstWords(block.he),firstWords(block.tr),firstWords(block.en)]).filter(Boolean))].slice(0,8);
 return {
  id:record.id,name:record.name,section:record.section,unitSha256:record.unitSha256,blocks,
  origin:`local:${record.workspaceId}`,sourceSha256:record.unitSha256,book:record.book,service:record.service??'',
  aliases:[...new Set([record.name,...record.aliases,...(record.section?[record.section]:[])])],openingWords,
  metadata:{local:true,localVersion:record.version,bookTitle:record.book,bookSlug:localBookSlug(record.book),folios:[record.page],...(record.section?{sectionTitle:record.section}:{}),attribution:record.attribution,licence:record.licence,workspaceId:record.workspaceId},
  authority:{id:`local:${record.workspaceId}`,repository:`workspace:${record.workspaceId}`,repositoryCommit:'',feed:'local-sources',feedSha256:record.unitSha256,unitId:record.id,unitSha256:record.unitSha256},
 };
}

/** The attribution a graphic built on a local source carries, read from the source snapshot it pins. */
export function localProvenance(snapshots:readonly AuthoringSource[]|undefined){
 return (snapshots??[]).filter(source=>isLocalSourceId(source.id)).map(source=>{const meta=source.metadata??{};const folios=Array.isArray(meta.folios)?meta.folios:[];return {sourceId:source.id,name:source.name,book:typeof meta.bookTitle==='string'?meta.bookTitle:source.book??'',page:typeof folios[0]==='number'?folios[0]:null,attribution:typeof meta.attribution==='string'?meta.attribution:null,licence:typeof meta.licence==='string'?meta.licence:null,version:typeof meta.localVersion==='number'?meta.localVersion:null}});
}

const normalizedBook=(value:string)=>localBookSlug(value).replace(/-/g,'');
/**
 * The deck-conversion and setlist lookup: every local unit printed on this page of this book. The
 * book matches by its printed title or its slug, ignoring case and punctuation, so "Mishkan
 * T'filah", "mishkan-tfilah" and "MISHKAN TFILAH" all name the same book.
 */
export function localSourcesAt(units:readonly AuthoringSource[],book:string,page:number):AuthoringSource[]{
 const wanted=normalizedBook(book);
 return units.filter(unit=>isLocalSourceId(unit.id)&&Array.isArray(unit.metadata?.folios)&&(unit.metadata!.folios as unknown[]).includes(page)&&[unit.book??'',String(unit.metadata?.bookSlug??'')].some(value=>value&&normalizedBook(value)===wanted));
}
export async function findLocalSourcesAt(repo:LocalSourceRepository,book:string,page:number){return localSourcesAt((await repo.list()).map(localSourceUnit),book,page)}

/* ---------- validation: every refusal is a sentence that says what to do next ---------- */

const refuse=(message:string):never=>{throw new AuthoringError('invalid_local_source',message)};
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const HEBREW=/[֐-׿יִ-ﭏ]/;
function field(value:unknown,label:string,max:number,required:boolean):string|null{
 if(value===undefined||value===null){if(required)refuse(`A local source needs ${label}. Add it and try again.`);return null}
 if(typeof value!=='string')return refuse(`${label} must be text.`);
 const trimmed=value.replace(/\r\n?/g,'\n').trim();
 if(!trimmed){if(required)refuse(`${label} is empty. Give it some text and try again.`);return null}
 if(trimmed.length>max)refuse(`${label} is ${trimmed.length} characters; it holds at most ${max}. Shorten it and try again.`);
 if(CONTROL.test(trimmed))refuse(`${label} contains a control character. Remove it and try again.`);
 return trimmed;
}
function page(value:unknown){if(!Number.isInteger(value)||(value as number)<1||(value as number)>LOCAL_SOURCE_LIMITS.page)refuse(`page must be the printed page number, a whole number from 1 to ${LOCAL_SOURCE_LIMITS.page}.`);return value as number}
function aliases(value:unknown){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>LOCAL_SOURCE_LIMITS.aliases)refuse(`aliases must be a list of at most ${LOCAL_SOURCE_LIMITS.aliases} other names.`);
 return [...new Set((value as unknown[]).map((item,index)=>field(item,`alias ${index+1}`,LOCAL_SOURCE_LIMITS.alias,true)!))];
}
function blocks(value:unknown):LocalSourceBlock[]{
 if(!Array.isArray(value)||!value.length)return refuse('A local source needs at least one block of text. Pass blocks as a list like [{he, tr, en}], one entry per passage.');
 if(value.length>LOCAL_SOURCE_LIMITS.blocks)refuse(`This source has ${value.length} blocks; a local source holds at most ${LOCAL_SOURCE_LIMITS.blocks}. Enter it as two sources.`);
 let total=0;
 const parsed=(value as unknown[]).map((raw,index)=>{
  const n=index+1;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))refuse(`Block ${n} must be an object with he, tr and/or en.`);
  const extra=Object.keys(raw as object).filter(key=>!['he','tr','en'].includes(key));
  if(extra.length)refuse(`Block ${n} has fields a block cannot hold (${extra.join(', ')}). A block holds only he (Hebrew), tr (transliteration) and en (English).`);
  const item=raw as Record<string,unknown>;
  const he=field(item.he,`Block ${n}'s Hebrew (he)`,LOCAL_SOURCE_LIMITS.channel,false),tr=field(item.tr,`Block ${n}'s transliteration (tr)`,LOCAL_SOURCE_LIMITS.channel,false),en=field(item.en,`Block ${n}'s English (en)`,LOCAL_SOURCE_LIMITS.channel,false);
  if(!he&&!tr&&!en)refuse(`Block ${n} is empty. Give each block at least one of he, tr or en, or leave the block out.`);
  if(he&&!tr)refuse(`Block ${n} has Hebrew but no transliteration. Add tr to that block, or enter it as English only (en).`);
  if(tr&&!he)refuse(`Block ${n} has a transliteration but no Hebrew. Add he to that block, or enter it as English only (en).`);
  if(he&&!HEBREW.test(he))refuse(`Block ${n}'s he has no Hebrew letters. Put transliteration in tr and English in en.`);
  total+=(he?.length??0)+(tr?.length??0)+(en?.length??0);
  return {...(he?{he}:{}),...(tr?{tr}:{}),...(en?{en}:{})} satisfies LocalSourceBlock;
 });
 if(total>LOCAL_SOURCE_LIMITS.total)refuse(`This source holds ${total} characters in all; a local source holds at most ${LOCAL_SOURCE_LIMITS.total}. Enter the reading as two sources.`);
 return parsed;
}
const onlyFields=(data:Record<string,unknown>,allowed:string[])=>{const extra=Object.keys(data).filter(key=>!allowed.includes(key));if(extra.length)refuse(`A local source cannot take ${extra.join(', ')}. It takes ${allowed.join(', ')}.`)};
const FIELDS=['name','book','page','section','service','attribution','licence','aliases','blocks'];

/* ---------- the three tools ---------- */

export type LocalSourceDeps={sources:LocalSourceRepository;drafts:()=>Promise<Draft[]>;workspaceId:string;now?:()=>number;newId?:()=>string};
const normalizedName=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const excerpt=(record:LocalSourceRecord)=>{const first=record.blocks[0];const flat=(first.en??first.tr??first.he??'').replace(/\s+/g,' ').trim();return flat.length>60?`${flat.slice(0,59).trimEnd()}…`:flat};
/** Drafts that pin this source, and whether each pins an older wording than the source holds now. */
function usage(record:LocalSourceRecord,drafts:Draft[]){
 return drafts.filter(draft=>!draft.archivedAt&&draft.sourcePin?.unitSha256?.[record.id]!==undefined).map(draft=>({draftId:draft.id,name:draft.name,published:draft.activeRevision!==null,stale:draft.sourcePin.unitSha256[record.id]!==record.unitSha256}));
}
function summary(record:LocalSourceRecord,drafts:Draft[]){
 const unit=localSourceUnit(record);const used=usage(record,drafts);
 return {id:record.id,version:record.version,name:record.name,book:record.book,bookValue:localBookSlug(record.book),page:record.page,section:record.section,service:record.service,attribution:record.attribution,licence:record.licence,aliases:record.aliases,blockCount:unit.blocks.length,kinds:[...new Set(unit.blocks.map(block=>block.kind))],blocks:unit.blocks.map(block=>({id:block.id,kind:block.kind,...(block.pairedBlockIds?{translates:block.pairedBlockIds}:{})})),excerpt:excerpt(record),usedBy:used,staleDrafts:used.filter(item=>item.stale).length,updatedAt:record.updatedAt,updatedBy:record.updatedBy};
}
const REFRESH_HINT='Drafts pinned to an earlier wording keep it until refreshed: scan_source_changes lists them in the source-change inbox, or update_draft with refreshSourceIds and the same content rebases one.';

export async function localSourceOperation(operation:string,data:Record<string,unknown>,actor:string,deps:LocalSourceDeps){
 const now=deps.now??Date.now,newId=deps.newId??randomUUID;
 if(operation==='list_local_sources'){
  onlyFields(data,['query','book','page','limit']);
  const query=data.query===undefined?'':normalizedName(field(data.query,'query',100,true)!);const book=data.book===undefined?null:field(data.book,'book',LOCAL_SOURCE_LIMITS.book,true)!;const at=data.page===undefined?null:page(data.page);
  const limit=data.limit===undefined?50:Number.isInteger(data.limit)&&(data.limit as number)>=1&&(data.limit as number)<=200?data.limit as number:refuse('limit must be a whole number from 1 to 200.');
  const [records,drafts]=await Promise.all([deps.sources.list(),deps.drafts()]);
  const matches=records.filter(record=>(!book||normalizedBook(record.book)===normalizedBook(book))&&(at===null||record.page===at)&&(!query||normalizedName([record.name,record.book,record.section??'',record.attribution,...record.aliases,...record.blocks.flatMap(block=>[block.he??'',block.tr??'',block.en??''])].join(' ')).includes(query))).sort((a,b)=>a.book.localeCompare(b.book)||a.page-b.page||a.name.localeCompare(b.name));
  return {workspaceId:deps.workspaceId,sources:matches.slice(0,limit).map(record=>summary(record,drafts)),total:matches.length,truncated:matches.length>limit,note:'Local sources belong to this workspace only and are never shared with another congregation. search_sources and get_source read them too.'};
 }
 if(operation==='add_local_source'){
  onlyFields(data,FIELDS);
  const existing=await deps.sources.list();
  if(existing.length>=LOCAL_SOURCE_LIMITS.sources)refuse(`This workspace already holds ${existing.length} local sources, the most it keeps. Update an existing one instead.`);
  const name=field(data.name,'a name',LOCAL_SOURCE_LIMITS.name,true)!,book=field(data.book,'a book (for example "Mishkan T\'filah")',LOCAL_SOURCE_LIMITS.book,true)!,at=page(data.page);
  const duplicate=existing.find(record=>record.page===at&&normalizedBook(record.book)===normalizedBook(book)&&normalizedName(record.name)===normalizedName(name));
  if(duplicate)throw new AuthoringError('local_source_exists',`${book} page ${at} already has a local source named "${duplicate.name}" (${duplicate.id}, version ${duplicate.version}). Change it with update_local_source, or give this one a different name.`,409,{sourceId:duplicate.id});
  const id=`${LOCAL_SOURCE_PREFIX}${newId()}`,timestamp=now();
  const draft={id,name,book,page:at,section:field(data.section,'section',LOCAL_SOURCE_LIMITS.section,false),attribution:field(data.attribution,'attribution (who wrote or holds the text, as it should be credited)',LOCAL_SOURCE_LIMITS.attribution,true)!,licence:field(data.licence,'licence',LOCAL_SOURCE_LIMITS.licence,false),blocks:blocks(data.blocks)};
  const record:LocalSourceRecord={...draft,workspaceId:deps.workspaceId,version:1,service:field(data.service,'service',LOCAL_SOURCE_LIMITS.service,false),aliases:aliases(data.aliases),unitSha256:unitHash(draft),createdAt:timestamp,updatedAt:timestamp,createdBy:actor,updatedBy:actor};
  const stored=await deps.sources.insert(record);
  return {workspaceId:deps.workspaceId,source:summary(stored,[]),created:true,next:'Build a graphic from it: search_sources (it is found by text, and by book and page) or use these block ids in create_draft.'};
 }
 if(operation==='update_local_source'){
  onlyFields(data,['sourceId','expectedVersion',...FIELDS]);
  if(!isLocalSourceId(data.sourceId))refuse('sourceId must be a local source id (local:...). list_local_sources names them.');
  if(!Number.isInteger(data.expectedVersion)||(data.expectedVersion as number)<1)refuse('expectedVersion must be the version list_local_sources returned.');
  const id=data.sourceId as string,expected=data.expectedVersion as number;
  const current=await deps.sources.get(id);
  if(!current)throw new AuthoringError('unknown_local_source',`There is no local source ${id} here. list_local_sources names them.`,404);
  const conflict=()=>new AuthoringError('version_conflict',`This local source changed since you read it (now version ${current.version}). Call list_local_sources and try again. Nothing was changed.`,409);
  if(current.version!==expected)throw conflict();
  const has=(key:string)=>data[key]!==undefined;
  const name=has('name')?field(data.name,'a name',LOCAL_SOURCE_LIMITS.name,true)!:current.name,book=has('book')?field(data.book,'a book',LOCAL_SOURCE_LIMITS.book,true)!:current.book,at=has('page')?page(data.page):current.page;
  // A rename or move gets the same one-name-per-page rule add_local_source applies.
  if(has('name')||has('book')||has('page')){const duplicate=(await deps.sources.list()).find(record=>record.id!==id&&record.page===at&&normalizedBook(record.book)===normalizedBook(book)&&normalizedName(record.name)===normalizedName(name));if(duplicate)throw new AuthoringError('local_source_exists',`${book} page ${at} already has a local source named "${duplicate.name}" (${duplicate.id}, version ${duplicate.version}). Give this one a different name, or change that one instead. Nothing was changed.`,409,{sourceId:duplicate.id})}
  // null clears an optional field; undefined leaves it as it was.
  const optional=(key:'section'|'service'|'licence',max:number)=>data[key]===null?null:has(key)?field(data[key],key,max,false):current[key];
  const next={id,name,book,page:at,section:optional('section',LOCAL_SOURCE_LIMITS.section),attribution:has('attribution')?field(data.attribution,'attribution',LOCAL_SOURCE_LIMITS.attribution,true)!:current.attribution,licence:optional('licence',LOCAL_SOURCE_LIMITS.licence),blocks:has('blocks')?blocks(data.blocks):current.blocks};
  const service=optional('service',LOCAL_SOURCE_LIMITS.service),nextAliases=has('aliases')?aliases(data.aliases):current.aliases;
  const unitSha256=unitHash(next);
  const changed=unitSha256!==current.unitSha256||service!==current.service||JSON.stringify(nextAliases)!==JSON.stringify(current.aliases);
  const drafts=await deps.drafts();
  // A no-op write keeps the version, the same rule every other versioned write here follows.
  if(!changed)return {workspaceId:deps.workspaceId,source:summary(current,drafts),changed:false,wordingChanged:false};
  const record:LocalSourceRecord={...current,...next,service,aliases:nextAliases,unitSha256,version:current.version+1,updatedAt:now(),updatedBy:actor};
  const stored=await deps.sources.replace(record,expected);if(!stored)throw conflict();
  const result=summary(stored,drafts),wordingChanged=unitSha256!==current.unitSha256;
  return {workspaceId:deps.workspaceId,source:result,changed:true,wordingChanged,...(wordingChanged&&result.staleDrafts?{next:REFRESH_HINT}:{})};
 }
 throw new AuthoringError('unknown_operation',`Unknown local source operation: ${operation}`,404);
}
