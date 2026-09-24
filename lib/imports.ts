import {createHash,randomBytes} from 'node:crypto';
import {AuthoringError} from './authoring-model';

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
export class MemoryImportRepository implements ImportRepository{
 rows=new Map<string,ImportWithData>();
 async insert(record:ImportRecord){this.rows.set(record.id,{...clone(record),data:new Uint8Array(0)});return clone(record)}
 async get(id:string){const row=this.rows.get(id);if(!row)return null;const {data:_data,...record}=row;return clone(record)}
 async getWithData(id:string){const row=this.rows.get(id);return row?{...clone({...row,data:undefined}),data:row.data.slice()} as ImportWithData:null}
 async byToken(tokenSha256:string){for(const row of this.rows.values())if(row.tokenSha256===tokenSha256){const {data:_data,...record}=row;return clone(record)}return null}
 async append(id:string,chunk:number,data:Uint8Array,now:number){const row=this.rows.get(id);if(!row||row.nextChunk!==chunk||row.totalBytes===null||row.receivedBytes+data.byteLength>row.totalBytes)return null;const joined=new Uint8Array(row.receivedBytes+data.byteLength);joined.set(row.data);joined.set(data,row.receivedBytes);row.data=joined;row.receivedBytes=joined.byteLength;row.nextChunk+=1;row.updatedAt=now;return this.get(id)}
 async update(id:string,patch:Parameters<ImportRepository['update']>[1]){const row=this.rows.get(id);if(!row)return null;const {resetData,...fields}=patch;Object.assign(row,fields);if(resetData){row.data=new Uint8Array(0);row.receivedBytes=0;row.nextChunk=0}return this.get(id)}
 async list(now:number){return [...this.rows.values()].filter(row=>row.expiresAt>now).sort((a,b)=>b.createdAt-a.createdAt).map(({data:_data,...record})=>clone(record))}
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
 if(row.kind!==kind)return refuse('wrong_import_kind',`That import is a ${row.kind} file, not ${kind}. Open a dropzone of kind '${kind}' for this.`,409);
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

// G2 wiring placeholder, for upload_asset importId until G1 lands: G1 replaces this with the
// Postgres-backed default (PgImportRepository). Until then nothing is stored here, so every importId
// is answered as unknown.
const placeholderImports=new MemoryImportRepository();
export function defaultImportRepository():ImportRepository{return placeholderImports}
