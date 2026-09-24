import {createHash,randomUUID} from 'node:crypto';
import {AuthoringError,type AuthoringSource,type Draft,type SourceBlock} from './authoring-model';
import {buildKey,type BuildKeyRepository} from './build-keys';
import {readImportJson,type ImportRepository} from './imports';

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
 *
 * G3 (TBI redo) - a source has a kind, and not every one is printed: a song setting or a
 * congregation's own text may have no book or page, and no credit (attribution null, shown as
 * "not credited", never invented). A block may be transliteration only, or transliteration and
 * English, for lines that are sung in transliteration. import_local_sources enters many at once
 * from a dropped file, idempotently by the caller's key (lib/build-keys.ts).
 */
export const LOCAL_SOURCE_PREFIX='local:';
export const isLocalSourceId=(id:unknown):id is string=>typeof id==='string'&&id.startsWith(LOCAL_SOURCE_PREFIX);
export const LOCAL_SOURCE_TOOLS=['add_local_source','update_local_source','list_local_sources','import_local_sources'] as const;
export const isLocalSourceTool=(operation:string)=>(LOCAL_SOURCE_TOOLS as readonly string[]).includes(operation);

export const LOCAL_SOURCE_LIMITS={name:120,book:100,section:120,service:120,attribution:300,licence:2000,alias:100,aliases:12,blocks:48,channel:2000,total:20000,page:9999,sources:2000,importItems:200,inlineItems:100} as const;

export const LOCAL_SOURCE_KINDS=['prayer-book reading','song setting','tbi text'] as const;
export type LocalSourceKind=typeof LOCAL_SOURCE_KINDS[number];
/** A record entered before kinds existed has none, and reads as a prayer-book reading. */
export const localSourceKind=(record:{kind?:LocalSourceKind}):LocalSourceKind=>record.kind??'prayer-book reading';
/** What a source with no attribution says in place of a credit. */
export const NOT_CREDITED='not credited';

export type LocalSourceBlock={he?:string;tr?:string;en?:string};
export type LocalSourceRecord={
 id:string;workspaceId:string;version:number;
 /** Absent on records entered before G3 (and when the caller names none). */
 kind?:LocalSourceKind;
 name:string;book:string|null;page:number|null;section:string|null;service:string|null;
 attribution:string|null;licence:string|null;aliases:string[];blocks:LocalSourceBlock[];
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
/**
 * The receipt import_local_sources gives for one stored block: sha256 (hex) of the UTF-8 JSON
 * array [he, tr, en] exactly as stored, with null for an absent channel.
 */
export const localBlockSha256=(block:LocalSourceBlock)=>createHash('sha256').update(JSON.stringify([block.he??null,block.tr??null,block.en??null])).digest('hex');

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
/** The order a book prints them in: printed sources by book and page, then those with no book, by name. */
export function compareLocalSources(a:LocalSourceRecord,b:LocalSourceRecord){return Number(a.book===null)-Number(b.book===null)||(a.book??'').localeCompare(b.book??'')||(a.page??0)-(b.page??0)||a.name.localeCompare(b.name)}

function unitBlocks(id:string,blocks:LocalSourceBlock[]):SourceBlock[]{
 const out:SourceBlock[]=[];
 blocks.forEach((block,position)=>{
  const blockId=`${id}#block-${position}`;
  if(block.tr!==undefined){
   // Hebrew with its transliteration is the corpus's bilingual block. A transliteration alone
   // (G3) is the same kind with no Hebrew, so it renders as a transliteration row and adds
   // nothing to the Hebrew channel (transliterationOnly in lib/authoring-model.ts).
   const channels=block.he!==undefined?{he:block.he,tr:block.tr}:{tr:block.tr};
   out.push({id:blockId,index:out.length,kind:'bilingual',...channels,sourceBlockSha256:sha({kind:'bilingual',...channels})});
   // English beside Hebrew is that block's translation: includeTranslation pairs it the way the corpus pairs its own.
   if(block.en!==undefined)out.push({id:`${blockId}-en`,index:out.length,kind:'translation-en',en:block.en,pairedBlockIds:[blockId],sourceBlockSha256:sha({kind:'translation-en',en:block.en,pairedBlockIds:[blockId]})});
  }else out.push({id:blockId,index:out.length,kind:'original-en',en:block.en,role:'original',sourceBlockSha256:sha({kind:'original-en',en:block.en})});
 });
 return out;
}

/**
 * What a unit's pin covers: everything it says and where it sits. Aliases and service only help
 * search. `kind` joins the hash only when a record has one, so a record entered before G3 keeps
 * the hash it was pinned by.
 */
function unitHash(record:Pick<LocalSourceRecord,'id'|'kind'|'name'|'book'|'page'|'section'|'attribution'|'licence'|'blocks'>){return sha({schema:'local-source-v1',id:record.id,name:record.name,book:record.book,page:record.page,section:record.section,attribution:record.attribution,licence:record.licence,blocks:record.blocks,...(record.kind!==undefined?{kind:record.kind}:{})})}

/** One stored record as the AuthoringSource every search, draft and pin reads. */
export function localSourceUnit(record:LocalSourceRecord):AuthoringSource{
 const blocks=unitBlocks(record.id,record.blocks);
 const openingWords=[...new Set(record.blocks.flatMap(block=>[firstWords(block.he),firstWords(block.tr),firstWords(block.en)]).filter(Boolean))].slice(0,8);
 // No book means no book facet and no outline; no page means no folio. Neither is made up.
 return {
  id:record.id,name:record.name,section:record.section,unitSha256:record.unitSha256,blocks,
  origin:`local:${record.workspaceId}`,sourceSha256:record.unitSha256,...(record.book!==null?{book:record.book}:{}),service:record.service??'',
  aliases:[...new Set([record.name,...record.aliases,...(record.section?[record.section]:[])])],openingWords,
  metadata:{local:true,localVersion:record.version,...(record.book!==null?{bookTitle:record.book,bookSlug:localBookSlug(record.book)}:{}),...(record.page!==null?{folios:[record.page]}:{}),...(record.section?{sectionTitle:record.section}:{}),attribution:record.attribution,licence:record.licence,workspaceId:record.workspaceId,localKind:localSourceKind(record)},
  authority:{id:`local:${record.workspaceId}`,repository:`workspace:${record.workspaceId}`,repositoryCommit:'',feed:'local-sources',feedSha256:record.unitSha256,unitId:record.id,unitSha256:record.unitSha256},
 };
}

/**
 * The attribution a graphic built on a local source carries, read from the source snapshot it
 * pins. A source with none carries no credit line: attribution is null and credit says so.
 */
export function localProvenance(snapshots:readonly AuthoringSource[]|undefined){
 return (snapshots??[]).filter(source=>isLocalSourceId(source.id)).map(source=>{const meta=source.metadata??{};const folios=Array.isArray(meta.folios)?meta.folios:[];const attribution=typeof meta.attribution==='string'?meta.attribution:null;return {sourceId:source.id,name:source.name,kind:typeof meta.localKind==='string'?meta.localKind:'prayer-book reading',book:typeof meta.bookTitle==='string'?meta.bookTitle:source.book??null,page:typeof folios[0]==='number'?folios[0]:null,attribution,...(attribution===null?{credit:NOT_CREDITED}:{}),licence:typeof meta.licence==='string'?meta.licence:null,version:typeof meta.localVersion==='number'?meta.localVersion:null}});
}

const normalizedBook=(value:string)=>localBookSlug(value).replace(/-/g,'');
/**
 * The deck-conversion and setlist lookup: every local unit printed on this page of this book. The
 * book matches by its printed title or its slug, ignoring case and punctuation, so "Mishkan
 * T'filah", "mishkan-tfilah" and "MISHKAN TFILAH" all name the same book. A source with no page
 * is never on one.
 */
export function localSourcesAt(units:readonly AuthoringSource[],book:string,page:number):AuthoringSource[]{
 const wanted=normalizedBook(book);
 return units.filter(unit=>isLocalSourceId(unit.id)&&Array.isArray(unit.metadata?.folios)&&(unit.metadata!.folios as unknown[]).includes(page)&&[unit.book??'',String(unit.metadata?.bookSlug??'')].some(value=>value&&normalizedBook(value)===wanted));
}
export async function findLocalSourcesAt(repo:LocalSourceRepository,book:string,page:number){return localSourcesAt((await repo.list()).map(localSourceUnit),book,page)}

/* ---------- validation: every refusal is a sentence that says what to do next ---------- */

const refuse=(message:string):never=>{throw new AuthoringError('invalid_local_source',message)};
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const HEBREW=/[֐-׿יִ-ﭏ]/;
/** The one normalisation stored text gets: CRLF (or CR) to LF, then trimmed. */
const normaliseText=(value:string)=>value.replace(/\r\n?/g,'\n').trim();
function field(value:unknown,label:string,max:number,required:boolean):string|null{
 if(value===undefined||value===null){if(required)refuse(`A local source needs ${label}. Add it and try again.`);return null}
 if(typeof value!=='string')return refuse(`${label} must be text.`);
 const trimmed=normaliseText(value);
 if(!trimmed){if(required)refuse(`${label} is empty. Give it some text and try again.`);return null}
 if(trimmed.length>max)refuse(`${label} is ${trimmed.length} characters; it holds at most ${max}. Shorten it and try again.`);
 if(CONTROL.test(trimmed))refuse(`${label} contains a control character. Remove it and try again.`);
 return trimmed;
}
function page(value:unknown){if(!Number.isInteger(value)||(value as number)<1||(value as number)>LOCAL_SOURCE_LIMITS.page)refuse(`page must be the printed page number, a whole number from 1 to ${LOCAL_SOURCE_LIMITS.page}.`);return value as number}
const optionalPage=(value:unknown)=>value===undefined||value===null?null:page(value);
function kind(value:unknown):LocalSourceKind|undefined{
 if(value===undefined||value===null)return undefined;
 if(typeof value!=='string'||!(LOCAL_SOURCE_KINDS as readonly string[]).includes(value))refuse(`kind must be one of ${LOCAL_SOURCE_KINDS.map(item=>`'${item}'`).join(', ')}.`);
 return value as LocalSourceKind;
}
/** A page is a page of a book, and a reading from a named prayer book is found by its page. */
function position(sourceKind:LocalSourceKind,book:string|null,at:number|null){
 if(at!==null&&book===null)refuse('A page needs its book. Add book (for example "Mishkan T\'filah"), or leave page out.');
 if(sourceKind==='prayer-book reading'&&book!==null&&at===null)refuse(`A prayer-book reading from ${book} needs its printed page. Add page, or set kind to 'song setting' or 'tbi text' if it is not read from that book.`);
}
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
  // Transliteration alone, or with English, is a sung line printed without Hebrew. Hebrew is never shown without its transliteration.
  if(he&&!tr)refuse(`Block ${n} has Hebrew but no transliteration. Add tr to that block, or enter it as English only (en).`);
  if(he&&!HEBREW.test(he))refuse(`Block ${n}'s he has no Hebrew letters. Put transliteration in tr and English in en.`);
  total+=(he?.length??0)+(tr?.length??0)+(en?.length??0);
  return {...(he?{he}:{}),...(tr?{tr}:{}),...(en?{en}:{})} satisfies LocalSourceBlock;
 });
 if(total>LOCAL_SOURCE_LIMITS.total)refuse(`This source holds ${total} characters in all; a local source holds at most ${LOCAL_SOURCE_LIMITS.total}. Enter the reading as two sources.`);
 return parsed;
}
const onlyFields=(data:Record<string,unknown>,allowed:string[])=>{const extra=Object.keys(data).filter(key=>!allowed.includes(key));if(extra.length)refuse(`A local source cannot take ${extra.join(', ')}. It takes ${allowed.join(', ')}.`)};
const FIELDS=['name','kind','book','page','section','service','attribution','licence','aliases','blocks'];
const ATTRIBUTION_LABEL='attribution (who wrote or holds the text, as it should be credited)';
/** No credit is said by leaving attribution out (or null), never by an empty one. */
function attribution(value:unknown){if(typeof value==='string'&&!normaliseText(value))refuse(`${ATTRIBUTION_LABEL} is empty. Give the credit as it should read, or leave attribution out when the text has none.`);return field(value,ATTRIBUTION_LABEL,LOCAL_SOURCE_LIMITS.attribution,false)}

type SourceFields=Pick<LocalSourceRecord,'kind'|'name'|'book'|'page'|'section'|'service'|'attribution'|'licence'|'aliases'|'blocks'>;
/** Every field of a new source, validated; the one parse add_local_source and import_local_sources share. */
function sourceFields(data:Record<string,unknown>):SourceFields{
 const sourceKind=kind(data.kind),name=field(data.name,'a name',LOCAL_SOURCE_LIMITS.name,true)!,book=field(data.book,'book',LOCAL_SOURCE_LIMITS.book,false),at=optionalPage(data.page);
 position(sourceKind??'prayer-book reading',book,at);
 return {...(sourceKind?{kind:sourceKind}:{}),name,book,page:at,section:field(data.section,'section',LOCAL_SOURCE_LIMITS.section,false),service:field(data.service,'service',LOCAL_SOURCE_LIMITS.service,false),attribution:attribution(data.attribution),licence:field(data.licence,'licence',LOCAL_SOURCE_LIMITS.licence,false),aliases:aliases(data.aliases),blocks:blocks(data.blocks)};
}

/* ---------- the four tools ---------- */

export type LocalSourceDeps={sources:LocalSourceRepository;drafts:()=>Promise<Draft[]>;workspaceId:string;now?:()=>number;newId?:()=>string;
 /** G3 - where import_local_sources reads a dropped file, and where it remembers each key. */
 imports?:ImportRepository;buildKeys?:BuildKeyRepository};
const normalizedName=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const excerpt=(record:LocalSourceRecord)=>{const first=record.blocks[0];const flat=(first.en??first.tr??first.he??'').replace(/\s+/g,' ').trim();return flat.length>60?`${flat.slice(0,59).trimEnd()}…`:flat};
const positioned=(record:Pick<LocalSourceRecord,'book'|'page'>)=>record.book!==null&&record.page!==null;
/**
 * One name per printed page, as before; a source with no printed page is one name per kind among
 * the others that have none.
 */
function duplicateOf(records:readonly LocalSourceRecord[],candidate:Pick<LocalSourceRecord,'kind'|'name'|'book'|'page'>&{id?:string}){
 const name=normalizedName(candidate.name),candidateKind=localSourceKind(candidate);
 return records.find(record=>record.id!==candidate.id&&normalizedName(record.name)===name&&(positioned(candidate)?positioned(record)&&record.page===candidate.page&&normalizedBook(record.book!)===normalizedBook(candidate.book!):!positioned(record)&&localSourceKind(record)===candidateKind));
}
function duplicateError(duplicate:LocalSourceRecord,candidate:Pick<LocalSourceRecord,'kind'|'book'|'page'>,next:string){
 const where=positioned(candidate)?`${candidate.book} page ${candidate.page} already has a local source`:`This workspace already has a ${localSourceKind(candidate)} with no printed page`;
 return new AuthoringError('local_source_exists',`${where} named "${duplicate.name}" (${duplicate.id}, version ${duplicate.version}). ${next}`,409,{sourceId:duplicate.id});
}
/** Drafts that pin this source, and whether each pins an older wording than the source holds now. */
function usage(record:LocalSourceRecord,drafts:Draft[]){
 return drafts.filter(draft=>!draft.archivedAt&&draft.sourcePin?.unitSha256?.[record.id]!==undefined).map(draft=>({draftId:draft.id,name:draft.name,published:draft.activeRevision!==null,stale:draft.sourcePin.unitSha256[record.id]!==record.unitSha256}));
}
function summary(record:LocalSourceRecord,drafts:Draft[]){
 const unit=localSourceUnit(record);const used=usage(record,drafts);
 return {id:record.id,version:record.version,kind:localSourceKind(record),name:record.name,book:record.book,bookValue:record.book===null?null:localBookSlug(record.book),page:record.page,section:record.section,service:record.service,attribution:record.attribution,...(record.attribution===null?{credit:NOT_CREDITED}:{}),licence:record.licence,aliases:record.aliases,blockCount:unit.blocks.length,kinds:[...new Set(unit.blocks.map(block=>block.kind))],blocks:unit.blocks.map(block=>({id:block.id,kind:block.kind,...(block.pairedBlockIds?{translates:block.pairedBlockIds}:{})})),excerpt:excerpt(record),usedBy:used,staleDrafts:used.filter(item=>item.stale).length,updatedAt:record.updatedAt,updatedBy:record.updatedBy};
}
const REFRESH_HINT='Drafts pinned to an earlier wording keep it until refreshed: scan_source_changes lists them in the source-change inbox, or update_draft with refreshSourceIds and the same content rebases one.';
/** Whether a write would change anything a reader sees: the pinned unit, or what only helps search. */
const sameSource=(a:LocalSourceRecord,b:LocalSourceRecord)=>a.unitSha256===b.unitSha256&&a.service===b.service&&JSON.stringify(a.aliases)===JSON.stringify(b.aliases);

/* ---------- import_local_sources (G3) ---------- */

/** The item fields a source takes; any other field of a build-prep item is planning only. */
const IMPORT_FIELDS=['key',...FIELDS];
type ImportStatus='created'|'updated'|'unchanged'|'refused'|'would-create'|'would-update';
type Normalised={block:number;channel:'he'|'tr'|'en';change:string};
type ImportItemResult={index:number;key:string|null;status:ImportStatus;sourceId:string|null;version:number|null;blockSha256:string[];normalised?:Normalised[];reason?:string;movedKey?:true};
/** Each block channel the stored text differs from what the item gave, and how. */
function normalisations(raw:unknown):Normalised[]{
 if(!Array.isArray(raw))return [];
 return raw.flatMap((block,index)=>block&&typeof block==='object'?(['he','tr','en'] as const).flatMap(channel=>{
  const value=(block as Record<string,unknown>)[channel];if(typeof value!=='string')return [];
  const stored=normaliseText(value);if(stored===value)return [];
  const changes=[...(/\r/.test(value)?['line endings changed to LF']:[]),...(stored!==value.replace(/\r\n?/g,'\n')?['surrounding whitespace trimmed']:[]),...(!stored?['empty, left out']:[])];
  return [{block:index,channel,change:changes.join('; ')}];
 }):[]);
}
function importItems(value:unknown):unknown[]{
 const items=Array.isArray(value)?value:value&&typeof value==='object'&&Array.isArray((value as {items?:unknown}).items)?(value as {items:unknown[]}).items:refuse('That import is not a list of sources. It must be a JSON array of items, or an object with items:[...]. Nothing was changed.');
 if(!items.length)refuse('That import holds no items. Nothing was changed.');
 if(items.length>LOCAL_SOURCE_LIMITS.importItems)refuse(`That import holds ${items.length} items; one call takes at most ${LOCAL_SOURCE_LIMITS.importItems}. Split the file and import each part. Nothing was changed.`);
 return items;
}

async function importLocalSources(data:Record<string,unknown>,actor:string,deps:LocalSourceDeps,now:()=>number,newId:()=>string){
 onlyFields(data,['importId','sources','dryRun']);
 if((data.importId===undefined)===(data.sources===undefined))refuse('Pass importId (a local-sources import from open_import_dropzone) or sources (a list of items), not both. Nothing was changed.');
 if(data.dryRun!==undefined&&typeof data.dryRun!=='boolean')refuse('dryRun must be true or false. Nothing was changed.');
 const dryRun=data.dryRun===true;
 if(!deps.buildKeys)throw new AuthoringError('build_keys_unavailable','Build keys are not available on this server, so an import cannot be made idempotent. Nothing was changed.',503);
 let items:unknown[],from:Record<string,unknown>;
 if(data.importId!==undefined){
  if(!deps.imports)throw new AuthoringError('imports_unavailable','File imports are not available on this server. Pass the items as sources instead. Nothing was changed.',503);
  const {record,value}=await readImportJson(deps.imports,data.importId,'local-sources',now());
  items=importItems(value);from={importId:record.id,fileName:record.fileName,sha256:record.sha256,items:items.length};
 }else{
  if(!Array.isArray(data.sources)||!data.sources.length)refuse('sources must be a list of at least one item. Nothing was changed.');
  if((data.sources as unknown[]).length>LOCAL_SOURCE_LIMITS.inlineItems)refuse(`sources holds ${(data.sources as unknown[]).length} items; an inline call takes at most ${LOCAL_SOURCE_LIMITS.inlineItems}. Drop the file on open_import_dropzone and pass its importId, or split the list. Nothing was changed.`);
  items=data.sources as unknown[];from={inline:true,items:items.length};
 }
 const buildKeys=deps.buildKeys;
 // The working set: what is stored, plus what this call has made so far (or, on a dry run, would make).
 const records=await deps.sources.list();
 const ignored=new Set<string>(),seen=new Set<string>(),results:ImportItemResult[]=[],keys:Record<string,string>={};
 for(const [index,raw] of items.entries()){
  let key:string|null=null;
  try{
   if(!raw||typeof raw!=='object'||Array.isArray(raw))refuse(`Item ${index+1} is not an object. Each item is {key, name, kind, book, page, attribution, blocks, ...}. Nothing was changed for it.`);
   const item=raw as Record<string,unknown>;
   for(const name of Object.keys(item))if(!IMPORT_FIELDS.includes(name))ignored.add(name);
   key=buildKey(item.key,`Item ${index+1}'s key`);
   if(seen.has(key))refuse(`The key "${key}" is used by an earlier item in this import; each item needs its own key. Nothing was changed for this one.`);
   seen.add(key);
   // null is "not given" for every field; the source then holds none (no book, no page, no credit).
   const fields=sourceFields(Object.fromEntries(FIELDS.map(name=>[name,item[name]===null?undefined:item[name]])));
   const blockSha256=fields.blocks.map(localBlockSha256),changed=normalisations(item.blocks),receipt={blockSha256,...(changed.length?{normalised:changed}:{})};
   const bound=await buildKeys.get('local-source',key);
   const current=bound?records.find(record=>record.id===bound.targetId)??null:null;
   const duplicate=duplicateOf(records,{...fields,...(current?{id:current.id}:{})});
   if(duplicate)throw duplicateError(duplicate,fields,`It was not imported under "${key}". Rename the item, or give it that source's key. Nothing was changed for this item.`);
   const timestamp=now();
   if(!current){
    if(records.length>=LOCAL_SOURCE_LIMITS.sources)refuse(`This workspace already holds ${records.length} local sources, the most it keeps. Nothing was changed for this item.`);
    const id=`${LOCAL_SOURCE_PREFIX}${newId()}`;
    const record:LocalSourceRecord={id,workspaceId:deps.workspaceId,version:1,...fields,unitSha256:unitHash({id,...fields}),createdAt:timestamp,updatedAt:timestamp,createdBy:actor,updatedBy:actor};
    if(dryRun){records.push(record);results.push({index,key,status:'would-create',sourceId:null,version:1,...receipt});continue}
    // The key is written first: if the insert then fails, the key names a missing source and the next run creates it and moves the key.
    await buildKeys.put({workspaceId:deps.workspaceId,kind:'local-source',key,targetId:id,createdBy:actor,createdAt:timestamp,updatedAt:timestamp});
    const stored=await deps.sources.insert(record);records.push(stored);keys[key]=id;
    results.push({index,key,status:'created',sourceId:id,version:1,...receipt,...(bound?{movedKey:true as const}:{})});
    continue;
   }
   const {kind:_previousKind,...rest}=current;void _previousKind;
   const next:LocalSourceRecord={...rest,...fields,unitSha256:unitHash({id:current.id,...fields})};
   if(sameSource(next,current)&&next.kind===current.kind){keys[key]=current.id;results.push({index,key,status:'unchanged',sourceId:current.id,version:current.version,...receipt});continue}
   if(dryRun){keys[key]=current.id;results.push({index,key,status:'would-update',sourceId:current.id,version:current.version+1,...receipt});continue}
   const stored=await deps.sources.replace({...next,version:current.version+1,updatedAt:timestamp,updatedBy:actor},current.version);
   if(!stored)refuse(`The source under "${key}" (${current.id}) changed while this import ran. Run the import again. Nothing was changed for this item.`);
   records.splice(records.findIndex(record=>record.id===current.id),1,stored!);keys[key]=current.id;
   results.push({index,key,status:'updated',sourceId:current.id,version:stored!.version,...receipt});
  }catch(error){
   // One bad item never stops the rest. Anything that is not a refusal (the database is down) still does.
   if(!(error instanceof AuthoringError))throw error;
   results.push({index,key,status:'refused',sourceId:null,version:null,blockSha256:[],reason:error.message});
  }
 }
 const count=(status:ImportStatus)=>results.filter(item=>item.status===status).length;
 return {
  workspaceId:deps.workspaceId,dryRun,from,
  totals:{items:results.length,created:count('created'),updated:count('updated'),unchanged:count('unchanged'),refused:count('refused'),wouldCreate:count('would-create'),wouldUpdate:count('would-update')},
  items:results,keys,
  ...(ignored.size?{ignored:[...ignored].sort(),ignoredNote:'Planning fields a local source does not hold. They were ignored, not stored.'}:{}),
  blockSha256Note:'Each item\'s blockSha256[i] is sha256 (hex) of the UTF-8 JSON array [he, tr, en] of stored block i, null for an absent channel. Text is stored as given apart from CRLF to LF and trimming, and normalised lists any block that changed.',
  next:dryRun?'Nothing was written. Run the same call with dryRun:false to apply it.':'Build graphics from these sources: keys maps each item key to its local: id, for create_draft or search_sources.',
 };
}

export async function localSourceOperation(operation:string,data:Record<string,unknown>,actor:string,deps:LocalSourceDeps){
 const now=deps.now??Date.now,newId=deps.newId??randomUUID;
 if(operation==='list_local_sources'){
  onlyFields(data,['query','kind','book','page','limit']);
  const query=data.query===undefined?'':normalizedName(field(data.query,'query',100,true)!);const book=data.book===undefined?null:field(data.book,'book',LOCAL_SOURCE_LIMITS.book,true)!;const at=data.page===undefined?null:page(data.page);const wantedKind=kind(data.kind);
  const limit=data.limit===undefined?50:Number.isInteger(data.limit)&&(data.limit as number)>=1&&(data.limit as number)<=200?data.limit as number:refuse('limit must be a whole number from 1 to 200.');
  const [records,drafts]=await Promise.all([deps.sources.list(),deps.drafts()]);
  const matches=records.filter(record=>(!book||(record.book!==null&&normalizedBook(record.book)===normalizedBook(book)))&&(at===null||record.page===at)&&(!wantedKind||localSourceKind(record)===wantedKind)&&(!query||normalizedName([record.name,localSourceKind(record),record.book??'',record.section??'',record.attribution??'',...record.aliases,...record.blocks.flatMap(block=>[block.he??'',block.tr??'',block.en??''])].join(' ')).includes(query))).sort(compareLocalSources);
  return {workspaceId:deps.workspaceId,sources:matches.slice(0,limit).map(record=>summary(record,drafts)),total:matches.length,truncated:matches.length>limit,note:'Local sources belong to this workspace only and are never shared with another congregation. search_sources and get_source read them too.'};
 }
 if(operation==='add_local_source'){
  onlyFields(data,FIELDS);
  const existing=await deps.sources.list();
  if(existing.length>=LOCAL_SOURCE_LIMITS.sources)refuse(`This workspace already holds ${existing.length} local sources, the most it keeps. Update an existing one instead.`);
  const fields=sourceFields(data);
  const duplicate=duplicateOf(existing,fields);
  if(duplicate)throw duplicateError(duplicate,fields,'Change it with update_local_source, or give this one a different name.');
  const id=`${LOCAL_SOURCE_PREFIX}${newId()}`,timestamp=now();
  const record:LocalSourceRecord={id,workspaceId:deps.workspaceId,version:1,...fields,unitSha256:unitHash({id,...fields}),createdAt:timestamp,updatedAt:timestamp,createdBy:actor,updatedBy:actor};
  const stored=await deps.sources.insert(record);
  return {workspaceId:deps.workspaceId,source:summary(stored,[]),created:true,next:'Build a graphic from it: search_sources (it is found by text, and by book and page when it has them) or use these block ids in create_draft.'};
 }
 if(operation==='import_local_sources')return importLocalSources(data,actor,deps,now,newId);
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
  // null clears an optional field (book, page, attribution, section, service, licence); undefined leaves it as it was.
  const cleared=(key:string)=>data[key]===null;
  const name=has('name')?field(data.name,'a name',LOCAL_SOURCE_LIMITS.name,true)!:current.name;
  const nextKind=has('kind')&&!cleared('kind')?kind(data.kind):current.kind;
  const book=cleared('book')?null:has('book')?field(data.book,'book',LOCAL_SOURCE_LIMITS.book,true)!:current.book,at=cleared('page')?null:has('page')?page(data.page):current.page;
  if(has('kind')||has('book')||has('page'))try{position(localSourceKind({kind:nextKind}),book,at)}catch(error){throw new AuthoringError('invalid_local_source',`${(error as Error).message} Nothing was changed.`)}
  // A rename or move gets the same one-name-per-page rule add_local_source applies.
  if(has('name')||has('book')||has('page')||has('kind')){const candidate={id,kind:nextKind,name,book,page:at};const duplicate=duplicateOf(await deps.sources.list(),candidate);if(duplicate)throw duplicateError(duplicate,candidate,'Give this one a different name, or change that one instead. Nothing was changed.')}
  const optional=(key:'section'|'service'|'licence',max:number)=>cleared(key)?null:has(key)?field(data[key],key,max,false):current[key];
  const {kind:_previousKind,...rest}=current;void _previousKind;
  const next={id,...(nextKind?{kind:nextKind}:{}),name,book,page:at,section:optional('section',LOCAL_SOURCE_LIMITS.section),attribution:cleared('attribution')?null:has('attribution')?attribution(data.attribution):current.attribution,licence:optional('licence',LOCAL_SOURCE_LIMITS.licence),blocks:has('blocks')?blocks(data.blocks):current.blocks};
  const service=optional('service',LOCAL_SOURCE_LIMITS.service),nextAliases=has('aliases')?aliases(data.aliases):current.aliases;
  const unitSha256=unitHash(next);
  const candidate:LocalSourceRecord={...rest,...next,service,aliases:nextAliases,unitSha256};
  const drafts=await deps.drafts();
  // A no-op write keeps the version, the same rule every other versioned write here follows.
  if(sameSource(candidate,current))return {workspaceId:deps.workspaceId,source:summary(current,drafts),changed:false,wordingChanged:false};
  const record:LocalSourceRecord={...candidate,version:current.version+1,updatedAt:now(),updatedBy:actor};
  const stored=await deps.sources.replace(record,expected);if(!stored)throw conflict();
  const result=summary(stored,drafts),wordingChanged=unitSha256!==current.unitSha256;
  return {workspaceId:deps.workspaceId,source:result,changed:true,wordingChanged,...(wordingChanged&&result.staleDrafts?{next:REFRESH_HINT}:{})};
 }
 throw new AuthoringError('unknown_operation',`Unknown local source operation: ${operation}`,404);
}
