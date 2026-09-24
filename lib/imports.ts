import {createHash,randomBytes} from 'node:crypto';
import {AuthoringError} from './authoring-model';
import {findCredential,normaliseSingularExtract,SINGULAR_EXTRACT,textLooksLikeCredential} from './companion-deck/singular-references';
import {liveRelayConfigured} from './rehearsal';
import {getPublicWorkspace} from './workspace';

/**
 * TBI redo G1 - file intake. A person drops a file on a short-lived signed page
 * (/import/<token>), and an agent reads it by importId instead of re-typing it through tool
 * arguments. One row per import, scoped to the workspace, with the bytes, their sha256 and size.
 *
 * This module is the store and its rules. The dropzone page, its chunk route and the tools
 * (open_import_dropzone, get_import) are G1; the readers (import_singular_extract,
 * import_local_sources, upload_asset, apply_deck_plan) call `readImportJson` / `readImportBytes`.
 */

export const IMPORT_KINDS=['singular-extract','local-sources','asset','deck-plan'] as const;
export type ImportKind=typeof IMPORT_KINDS[number];
export const isImportKind=(value:unknown):value is ImportKind=>typeof value==='string'&&(IMPORT_KINDS as readonly string[]).includes(value);

/** A JSON or CSV import holds at most 2 MB; an image 5 MB (G2 downscales it to the artwork limit). */
export const IMPORT_LIMITS={jsonBytes:2*1024*1024,imageBytes:5*1024*1024,chunkBytes:1024*1024,linkTtlMs:30*60_000,keepMs:7*24*60*60_000,open:10} as const;
export const importByteLimit=(kind:ImportKind)=>kind==='asset'?IMPORT_LIMITS.imageBytes:IMPORT_LIMITS.jsonBytes;

export type ImportStatus='waiting'|'receiving'|'ready'|'refused';
export type ImportRecord={
 id:string;workspaceId:string;kind:ImportKind;
 /** sha256 of the dropzone token; the token itself is only ever in the link. */
 tokenSha256:string;linkExpiresAt:number;
 status:ImportStatus;
 /** The file name the browser reported, and its media type. */
 fileName:string|null;mediaType:string|null;
 totalBytes:number|null;receivedBytes:number;nextChunk:number;
 sha256:string|null;
 /** Why a finished upload was refused, in a sentence. Never echoes file content. */
 refusal:string|null;
 note:string|null;
 createdBy:string;createdAt:number;updatedAt:number;expiresAt:number;
};
export type ImportWithData=ImportRecord&{data:Uint8Array};

export interface ImportRepository{
 insert(record:ImportRecord):Promise<ImportRecord>;
 get(id:string):Promise<ImportRecord|null>;
 getWithData(id:string):Promise<ImportWithData|null>;
 byToken(tokenSha256:string):Promise<ImportRecord|null>;
 /** Appends chunk `chunk` when it is the next one and fits `totalBytes`; null otherwise. */
 append(id:string,chunk:number,data:Uint8Array,now:number):Promise<ImportRecord|null>;
 /** Replaces the status fields of an import (begin, finish, refuse). */
 update(id:string,patch:Partial<Pick<ImportRecord,'status'|'fileName'|'mediaType'|'totalBytes'|'sha256'|'refusal'|'updatedAt'|'receivedBytes'|'nextChunk'>>&{resetData?:boolean}):Promise<ImportRecord|null>;
 /** Imports still kept (not past expiresAt), newest first. */
 list(now:number):Promise<ImportRecord[]>;
 sweep(now:number):Promise<void>;
}

export const newImportId=()=>`import_${randomBytes(16).toString('hex')}`;
export const newImportToken=()=>randomBytes(24).toString('base64url');
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export const bytesSha256=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
export const isImportId=(value:unknown):value is string=>typeof value==='string'&&/^import_[a-f0-9]{32}$/.test(value);

const clone=<T>(value:T):T=>structuredClone(value);
const withoutData=(row:ImportWithData):ImportRecord=>{const record:Partial<ImportWithData>={...row};delete record.data;return clone(record as ImportRecord)};
export class MemoryImportRepository implements ImportRepository{
 rows=new Map<string,ImportWithData>();
 async insert(record:ImportRecord){this.rows.set(record.id,{...clone(record),data:new Uint8Array(0)});return clone(record)}
 async get(id:string){const row=this.rows.get(id);return row?withoutData(row):null}
 async getWithData(id:string){const row=this.rows.get(id);return row?{...clone({...row,data:undefined}),data:row.data.slice()} as ImportWithData:null}
 async byToken(tokenSha256:string){for(const row of this.rows.values())if(row.tokenSha256===tokenSha256)return withoutData(row);return null}
 async append(id:string,chunk:number,data:Uint8Array,now:number){const row=this.rows.get(id);if(!row||row.nextChunk!==chunk||row.totalBytes===null||row.receivedBytes+data.byteLength>row.totalBytes)return null;const joined=new Uint8Array(row.receivedBytes+data.byteLength);joined.set(row.data);joined.set(data,row.receivedBytes);row.data=joined;row.receivedBytes=joined.byteLength;row.nextChunk+=1;row.updatedAt=now;return this.get(id)}
 async update(id:string,patch:Parameters<ImportRepository['update']>[1]){const row=this.rows.get(id);if(!row)return null;const {resetData,...fields}=patch;Object.assign(row,fields);if(resetData){row.data=new Uint8Array(0);row.receivedBytes=0;row.nextChunk=0}return this.get(id)}
 async list(now:number){return [...this.rows.values()].filter(row=>row.expiresAt>now).sort((a,b)=>b.createdAt-a.createdAt).map(withoutData)}
 async sweep(now:number){for(const [id,row] of this.rows)if(row.expiresAt<=now)this.rows.delete(id)}
}

const refuse=(code:string,message:string,status=400):never=>{throw new AuthoringError(code,message,status)};

/**
 * The bytes of a finished import of `kind`, for a reader tool. Every refusal is a sentence that
 * says what to do next; none echoes content.
 */
export async function readImportBytes(repository:ImportRepository,importId:unknown,kind:ImportKind,now=Date.now()):Promise<ImportWithData>{
 if(!isImportId(importId))return refuse('invalid_import_id','importId must be the id open_import_dropzone returned (import_ followed by 32 hex characters).');
 const row=await repository.getWithData(importId);
 if(!row||row.expiresAt<=now)return refuse('unknown_import','There is no such import here, or it has expired (imports are kept 7 days). Open a new dropzone with open_import_dropzone.',404);
 if(row.kind!==kind)return refuse('wrong_import_kind',`That import is ${row.kind==='asset'?'an':'a'} ${row.kind} file, not ${kind}. Open a dropzone of kind '${kind}' for this.`,409);
 if(row.status==='refused')return refuse('import_refused',`That import was refused when it arrived: ${row.refusal??'no reason recorded'} Open a new dropzone and drop a corrected file.`,409);
 if(row.status!=='ready')return refuse('import_not_ready','Nothing has finished arriving on that dropzone yet. Wait until the page says the file was received, then call get_import to confirm.',409);
 return row;
}

/** A finished JSON import, parsed. */
export async function readImportJson(repository:ImportRepository,importId:unknown,kind:ImportKind,now=Date.now()):Promise<{record:ImportRecord;value:unknown}>{
 const row=await readImportBytes(repository,importId,kind,now);
 const {data,...record}=row;
 try{return {record,value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data))}}
 catch{return refuse('import_not_json','That import is not valid UTF-8 JSON. Nothing was read.',422)}
}

/** A finished text import (a CSV deck plan), decoded as UTF-8 with any byte-order mark removed. */
export async function readImportText(repository:ImportRepository,importId:unknown,kind:ImportKind,now=Date.now()):Promise<{record:ImportRecord;text:string}>{
 const row=await readImportBytes(repository,importId,kind,now);
 const {data,...record}=row;
 try{return {record,text:new TextDecoder('utf-8',{fatal:true}).decode(data).replace(/^﻿/,'')}}
 catch{return refuse('import_not_text','That import is not valid UTF-8 text. Nothing was read.',422)}
}

/* ------------------------------------------------------------ Postgres --- */

const missingTable=(error:unknown)=>(error as {code?:unknown}|null)?.code==='42P01';
const UNMIGRATED='Dropped files are not set up in this workspace\'s database yet (db/imports.sql). Nothing was saved; ask whoever runs the database to apply it.';
type Queryable={query:(text:string,values?:unknown[])=>Promise<{rows:unknown[];rowCount:number|null}>};
type Row={id:string;workspace_id:string;kind:ImportKind;token_sha256:string;link_expires_at:number;status:ImportStatus;file_name:string|null;media_type:string|null;total_bytes:number|null;received_bytes:number;next_chunk:number;sha256:string|null;refusal:string|null;note:string|null;created_by:string;created_at:number;updated_at:number;expires_at:number;data?:Buffer};
const COLUMNS='id,workspace_id,kind,token_sha256,link_expires_at,status,file_name,media_type,total_bytes,received_bytes,next_chunk,sha256,refusal,note,created_by,created_at,updated_at,expires_at';
const fromRow=(row:Row):ImportRecord=>({id:row.id,workspaceId:row.workspace_id,kind:row.kind,tokenSha256:row.token_sha256,linkExpiresAt:Number(row.link_expires_at),status:row.status,fileName:row.file_name,mediaType:row.media_type,totalBytes:row.total_bytes===null?null:Number(row.total_bytes),receivedBytes:Number(row.received_bytes),nextChunk:Number(row.next_chunk),sha256:row.sha256,refusal:row.refusal,note:row.note,createdBy:row.created_by,createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),expiresAt:Number(row.expires_at)});
const PATCH_COLUMNS:Record<string,string>={status:'status',fileName:'file_name',mediaType:'media_type',totalBytes:'total_bytes',sha256:'sha256',refusal:'refusal',updatedAt:'updated_at',receivedBytes:'received_bytes',nextChunk:'next_chunk'};

/** db/imports.sql, one workspace's rows. Until it is applied, reads answer nothing and writes refuse in a sentence. */
export class PgImportRepository implements ImportRepository{
 constructor(private workspaceId:string,private connection?:Queryable){}
 private async query(sql:string,values:unknown[],write:boolean):Promise<{rows:unknown[];rowCount:number|null}>{try{return await (this.connection??(await import('./database')).db).query(sql,values)}catch(error){if(missingTable(error)){if(write)throw new AuthoringError('imports_unavailable',UNMIGRATED,503);return {rows:[],rowCount:0}}throw error}}
 private one=(result:{rows:unknown[]})=>{const row=result.rows[0] as Row|undefined;return row?fromRow(row):null};
 async insert(record:ImportRecord){const r=record;await this.query(`INSERT INTO workspace_imports(${COLUMNS}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[r.id,this.workspaceId,r.kind,r.tokenSha256,r.linkExpiresAt,r.status,r.fileName,r.mediaType,r.totalBytes,r.receivedBytes,r.nextChunk,r.sha256,r.refusal,r.note,r.createdBy,r.createdAt,r.updatedAt,r.expiresAt],true);return {...record,workspaceId:this.workspaceId}}
 async get(id:string){return this.one(await this.query(`SELECT ${COLUMNS} FROM workspace_imports WHERE id=$1 AND workspace_id=$2`,[id,this.workspaceId],false))}
 async getWithData(id:string){const row=(await this.query(`SELECT ${COLUMNS},data FROM workspace_imports WHERE id=$1 AND workspace_id=$2`,[id,this.workspaceId],false)).rows[0] as Row|undefined;return row?{...fromRow(row),data:new Uint8Array(row.data??Buffer.alloc(0))}:null}
 async byToken(tokenSha256:string){return this.one(await this.query(`SELECT ${COLUMNS} FROM workspace_imports WHERE token_sha256=$1 AND workspace_id=$2`,[tokenSha256,this.workspaceId],false))}
 async append(id:string,chunk:number,data:Uint8Array,now:number){return this.one(await this.query(`UPDATE workspace_imports SET data=data||$4,received_bytes=received_bytes+$5,next_chunk=next_chunk+1,updated_at=$6 WHERE id=$1 AND workspace_id=$2 AND next_chunk=$3 AND total_bytes IS NOT NULL AND received_bytes+$5<=total_bytes RETURNING ${COLUMNS}`,[id,this.workspaceId,chunk,Buffer.from(data),data.byteLength,now],true))}
 async update(id:string,patch:Parameters<ImportRepository['update']>[1]){
  const {resetData,...fields}=patch,sets:string[]=[],values:unknown[]=[id,this.workspaceId];
  for(const [key,value] of Object.entries(fields)){const column=PATCH_COLUMNS[key];if(!column||value===undefined)continue;values.push(value);sets.push(`${column}=$${values.length}`)}
  if(resetData)sets.push(`data=''::bytea`,...(fields.receivedBytes===undefined?['received_bytes=0']:[]),...(fields.nextChunk===undefined?['next_chunk=0']:[]));
  if(!sets.length)return this.get(id);
  return this.one(await this.query(`UPDATE workspace_imports SET ${sets.join(',')} WHERE id=$1 AND workspace_id=$2 RETURNING ${COLUMNS}`,values,true));
 }
 async list(now:number){return (await this.query(`SELECT ${COLUMNS} FROM workspace_imports WHERE workspace_id=$1 AND expires_at>$2 ORDER BY created_at DESC LIMIT 200`,[this.workspaceId,now],false)).rows.map(row=>fromRow(row as Row))}
 async sweep(now:number){await this.query('DELETE FROM workspace_imports WHERE workspace_id=$1 AND expires_at<=$2',[this.workspaceId,now],true)}
}

const rehearsalImports=new MemoryImportRepository();
/** Postgres for this deployment's workspace; in memory only for a local rehearsal without a relay, as lib/assets.ts gates it. */
export function defaultImportRepository(workspaceId=getPublicWorkspace().id):ImportRepository{if(process.env.CRC_AUTHORING_REHEARSAL==='1'){if(process.env.NODE_ENV!=='development'||liveRelayConfigured())throw new Error('Import rehearsal storage is allowed only in local development without a relay.');return rehearsalImports}return new PgImportRepository(workspaceId)}

/* ------------------------------------------------------------ contents --- */

/** What the dropzone page asks for, by kind. */
export const IMPORT_KIND_LABELS:Record<ImportKind,string>={'singular-extract':'the Singular extract JSON','local-sources':'the local sources JSON','asset':'an image (PNG, JPEG or WebP)','deck-plan':'the deck plan CSV or JSON'};
export type ImageInfo={mediaType:'image/png'|'image/jpeg'|'image/webp';width:number|null;height:number|null};
const SOF=[0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf];
function jpegInfo(b:Buffer):ImageInfo{
 for(let offset=2;offset+9<b.length;){if(b[offset]!==0xff){offset++;continue}const marker=b[offset+1];if(marker===0xd9||marker===0xda)break;if(marker===0xff){offset++;continue}if((marker>=0xd0&&marker<=0xd7)||marker===0x01){offset+=2;continue}const length=b.readUInt16BE(offset+2);if(length<2)break;if(SOF.includes(marker))return {mediaType:'image/jpeg',width:b.readUInt16BE(offset+7),height:b.readUInt16BE(offset+5)};offset+=2+length}
 return {mediaType:'image/jpeg',width:null,height:null};
}
function webpInfo(b:Buffer):ImageInfo{
 const chunk=b.subarray(12,16).toString('latin1');
 if(chunk==='VP8X'&&b.length>=30)return {mediaType:'image/webp',width:1+b.readUIntLE(24,3),height:1+b.readUIntLE(27,3)};
 if(chunk==='VP8L'&&b.length>=25&&b[20]===0x2f){const bits=b.readUInt32LE(21);return {mediaType:'image/webp',width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1}}
 if(chunk==='VP8 '&&b.length>=30&&b[23]===0x9d&&b[24]===0x01&&b[25]===0x2a)return {mediaType:'image/webp',width:b.readUInt16LE(26)&0x3fff,height:b.readUInt16LE(28)&0x3fff};
 return {mediaType:'image/webp',width:null,height:null};
}
/** The image type by its first bytes, and its pixel size from the header where it can be read. */
export function imageInfo(data:Uint8Array):ImageInfo|null{
 const b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
 if(b.length>=24&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){const ihdr=b.subarray(12,16).toString('latin1')==='IHDR';return {mediaType:'image/png',width:ihdr?b.readUInt32BE(16):null,height:ihdr?b.readUInt32BE(20):null}}
 if(b.length>=4&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return jpegInfo(b);
 if(b.length>=16&&b.subarray(0,4).toString('latin1')==='RIFF'&&b.subarray(8,12).toString('latin1')==='WEBP')return webpInfo(b);
 return null;
}
const utf8=(data:Uint8Array)=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(data).replace(/^﻿/,'')}catch{return null}};
const parseJson=(text:string)=>{try{return {ok:true as const,value:JSON.parse(text) as unknown}}catch{return {ok:false as const}}};
/** RFC 4180 rows (quoted fields, doubled quotes, CRLF or LF), blank lines dropped. */
export function csvRows(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++}else quoted=false}else field+=c;continue}if(c==='"'){quoted=true;continue}if(c===','){row.push(field);field='';continue}if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(cell=>cell!==''))rows.push(row);row=[];continue}field+=c}
 row.push(field);if(row.some(cell=>cell!==''))rows.push(row);return rows;
}

export type ImportCheck={ok:true;mediaType:string}|{ok:false;refusal:string};
/**
 * What a finished drop is checked for before an agent may read it: its size, its type by content
 * (UTF-8 JSON; CSV or JSON for a deck plan; PNG, JPEG or WebP by magic bytes), and nothing that
 * looks like a credential. A refusal is a sentence that names where, never what.
 */
export function checkImportContent(kind:ImportKind,data:Uint8Array):ImportCheck{
 const limit=importByteLimit(kind);
 if(!data.byteLength)return {ok:false,refusal:'The file was empty. Drop the file again.'};
 if(data.byteLength>limit)return {ok:false,refusal:`The file is larger than ${limit/1024/1024} MB. Drop a smaller file.`};
 const credential=(where:string)=>({ok:false as const,refusal:`The file carries something that looks like a credential (at ${where}). Remove every control link, token, key and password from it, then drop it again.`});
 if(kind==='asset'){const image=imageInfo(data);if(!image)return {ok:false,refusal:'That is not a PNG, JPEG or WebP image. Drop an image of one of those types.'};return {ok:true,mediaType:image.mediaType}}
 const text=utf8(data);
 if(text===null)return {ok:false,refusal:kind==='deck-plan'?'The file is not UTF-8 text. Save the deck plan as UTF-8 CSV or JSON and drop it again.':'The file is not UTF-8 JSON. Save it as UTF-8 JSON and drop it again.'};
 const parsed=parseJson(text);
 if(parsed.ok){const hit=findCredential(parsed.value,'file');return hit?credential(hit):{ok:true,mediaType:'application/json'}}
 if(kind!=='deck-plan')return {ok:false,refusal:'The file is not valid JSON. Check that it is the JSON file itself, then drop it again.'};
 const line=text.split(/\r?\n/).findIndex(textLooksLikeCredential);
 return line>=0?credential(`line ${line+1}`):{ok:true,mediaType:'text/csv'};
}

type Summary=Record<string,unknown>;
const itemsOf=(value:unknown,keys:string[])=>Array.isArray(value)?value:value&&typeof value==='object'?keys.map(key=>(value as Record<string,unknown>)[key]).find(Array.isArray) as unknown[]|undefined:undefined;
const keyOf=(item:unknown)=>item&&typeof item==='object'&&typeof (item as {key?:unknown}).key==='string'&&(item as {key:string}).key.trim()?(item as {key:string}).key:null;
/** A kind summary of a ready import's contents: counts and column names, never the content itself. */
export function importSummary(record:ImportRecord,data:Uint8Array):Summary|null{
 if(record.status!=='ready')return null;
 if(record.kind==='asset'){const image=imageInfo(data);return image?{mediaType:image.mediaType,width:image.width,height:image.height}:{problem:'The image header could not be read.'}}
 const text=utf8(data)??'',parsed=parseJson(text);
 if(record.kind==='singular-extract'){
  if(!parsed.ok)return {problem:'The file is not valid JSON.'};
  const normalised=normaliseSingularExtract(parsed.value);
  if(!normalised.ok)return {shape:'flat',problem:`The first problem is at ${['file',...normalised.issue.path.map(String)].join('.')}: ${normalised.issue.message}.`};
  const extract=SINGULAR_EXTRACT.safeParse(normalised.extract);
  if(!extract.success){const issue=extract.error.issues[0];return {shape:normalised.shape,problem:`The first problem is at ${[normalised.shape==='flat'?'normalised':'file',...issue.path.map(String)].join('.')}: ${issue.message}.`}}
  const apps=extract.data.apps.map(app=>({app:app.label,compositions:app.subcompositions.length}));
  return {shape:normalised.shape,apps,total:apps.reduce((n,app)=>n+app.compositions,0)};
 }
 if(record.kind==='local-sources'){
  const items=parsed.ok?itemsOf(parsed.value,['sources','items']):undefined;if(!items)return {problem:'The file is not a list of sources (an array, or {sources:[...]}).'};
  const keys=items.map(keyOf),missing=keys.flatMap((key,index)=>key===null?[index]:[]);
  return {items:items.length,keys:new Set(keys.filter(Boolean)).size,missingKey:missing.length,...(missing.length?{missingKeyAt:missing.slice(0,20)}:{})};
 }
 if(parsed.ok){const rows=itemsOf(parsed.value,['rows'])??[];const columns=[...new Set(rows.flatMap(row=>row&&typeof row==='object'&&!Array.isArray(row)?Object.keys(row):[]))];return {format:'json',rows:rows.length,columns}}
 const rows=csvRows(text);return {format:'csv',rows:Math.max(rows.length-1,0),columns:rows[0]??[]};
}

/** An import as the tools show it: status and size, never the token or the content. */
export const importView=(record:ImportRecord)=>({importId:record.id,kind:record.kind,status:record.status,fileName:record.fileName,mediaType:record.mediaType,bytes:record.status==='ready'||record.status==='refused'?record.totalBytes:record.receivedBytes,sha256:record.sha256,refusal:record.refusal,note:record.note,createdAt:record.createdAt,linkExpiresAt:record.linkExpiresAt,expiresAt:record.expiresAt});

/* -------------------------------------------------------------- intake --- */

// The dropzone's three steps, by token (the link is the capability): begin names the file and its
// size, parts arrive in order as raw bytes, finish checks the whole file and marks it ready or
// refused. The link works until linkExpiresAt; while it does, dropping again replaces the file.
const closed=():never=>refuse('link_closed','This link has expired or is not valid. Ask for a new link.',404);
/** The import behind a dropzone token while its link is open, or null. */
export async function dropzoneFor(repository:ImportRepository,token:unknown,now=Date.now()){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))return null;
 const row=await repository.byToken(tokenHash(token));
 return row&&row.linkExpiresAt>now&&row.expiresAt>now?row:null;
}
const cleanName=(value:unknown)=>{const name=typeof value==='string'?(value.split(/[\\/]/).pop()??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,200):'';return name||null};
export async function beginDrop(repository:ImportRepository,token:unknown,input:{fileName?:unknown;mediaType?:unknown;totalBytes?:unknown},now=Date.now()){
 const row=await dropzoneFor(repository,token,now)??closed();
 const limit=importByteLimit(row.kind),total=input.totalBytes;
 if(typeof total!=='number'||!Number.isInteger(total)||total<1)return refuse('invalid_size','The file was empty. Choose the file again.');
 if(total>limit)return refuse('too_large',`The file is larger than ${limit/1024/1024} MB. Drop a smaller file.`,413);
 const mediaType=typeof input.mediaType==='string'&&/^[\w.+-]{1,60}\/[\w.+-]{1,60}$/.test(input.mediaType)?input.mediaType:null;
 return (await repository.update(row.id,{status:'receiving',fileName:cleanName(input.fileName),mediaType,totalBytes:total,sha256:null,refusal:null,updatedAt:now,resetData:true}))!;
}
export async function appendDrop(repository:ImportRepository,token:unknown,chunk:number,data:Uint8Array,now=Date.now()){
 const row=await dropzoneFor(repository,token,now)??closed();
 if(row.status!=='receiving')return refuse('not_receiving','Start the upload again by dropping the file.',409);
 if(!data.byteLength||data.byteLength>IMPORT_LIMITS.chunkBytes)return refuse('invalid_chunk',`Each part must be 1 byte to ${IMPORT_LIMITS.chunkBytes/1024/1024} MB. Drop the file again.`,413);
 const next=await repository.append(row.id,chunk,data,now);
 if(!next)return refuse('out_of_order',`The upload lost its place (part ${row.nextChunk} was expected). Drop the file again.`,409);
 return next;
}
export async function finishDrop(repository:ImportRepository,token:unknown,now=Date.now()){
 const row=await dropzoneFor(repository,token,now)??closed();
 if(row.status!=='receiving')return refuse('not_receiving','Start the upload again by dropping the file.',409);
 if(row.receivedBytes!==row.totalBytes)return refuse('incomplete','Part of the file did not arrive. Drop the file again.',409);
 const full=(await repository.getWithData(row.id))!;
 const check=checkImportContent(row.kind,full.data);
 return (await repository.update(row.id,check.ok?{status:'ready',mediaType:check.mediaType,sha256:bytesSha256(full.data),refusal:null,updatedAt:now}:{status:'refused',sha256:bytesSha256(full.data),refusal:check.refusal,updatedAt:now}))!;
}
