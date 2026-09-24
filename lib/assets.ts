import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {db} from './database';
import {liveRelayConfigured,rehearsalMode,type RehearsalEnv} from './rehearsal';

export const ASSET_MAX_BYTES=512*1024,ASSET_MAX_DIMENSION=4096,ASSET_MAX_PIXELS=16_000_000,ASSET_MAX_ITEMS=500;
export type AssetMime='image/png'|'image/jpeg'|'image/webp';
export type AssetMetadata={id:string;name:string;altText:string;mimeType:AssetMime;bytes:number;width:number;height:number;version:number;archived:boolean;published:boolean;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string;privatePreviewUrl:string;publicUrl?:string};
export type AssetRecord=AssetMetadata&{data:Uint8Array};
export class AssetError extends Error{constructor(public code:string,message:string,public status=400){super(message)}}
export class AssetConflictError extends AssetError{constructor(){super('version_conflict','This asset changed in another session. Refresh and try again.',409)}}
export type AssetQueryable={query:(text:string,values?:unknown[])=>Promise<{rows:unknown[];rowCount:number|null}>};
export interface AssetRepository{list(includeArchived?:boolean):Promise<AssetMetadata[]>;count():Promise<number>;get(id:string):Promise<AssetRecord|null>;insert(record:AssetRecord):Promise<boolean>;setArchived(id:string,expectedVersion:number,archived:boolean,actor:string,now:number):Promise<AssetMetadata|null>;markPublished(id:string,now:number):Promise<boolean>}

function urls<T extends Omit<AssetMetadata,'privatePreviewUrl'|'publicUrl'>>(value:T):AssetMetadata{return {...value,privatePreviewUrl:`/api/assets/${encodeURIComponent(value.id)}/preview`,...(value.published?{publicUrl:`/api/assets/${encodeURIComponent(value.id)}/content`}:{})}}
const clone=<T>(value:T):T=>structuredClone(value);
export class MemoryAssetRepository implements AssetRepository{
 records=new Map<string,AssetRecord>();
 async list(includeArchived=false){return [...this.records.values()].filter(item=>includeArchived||!item.archived).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,ASSET_MAX_ITEMS).map(assetMetadata)}
 async count(){return this.records.size}async get(id:string){const value=this.records.get(id);return value?clone(value):null}
 async insert(record:AssetRecord){if(this.records.has(record.id))return false;this.records.set(record.id,clone(record));return true}
 async setArchived(id:string,expected:number,archived:boolean,actor:string,now:number){const value=this.records.get(id);if(!value||value.version!==expected)return null;const next={...value,archived,version:value.version+1,updatedAt:now,updatedBy:actor};this.records.set(id,next);return assetMetadata(next)}
 async markPublished(id:string,now:number){const value=this.records.get(id);if(!value||value.archived)return false;this.records.set(id,{...value,published:true,publicUrl:`/api/assets/${encodeURIComponent(id)}/content`,updatedAt:now});return true}
}

type AssetRow={id:string;name:string;altText:string;mimeType:AssetMime;bytes:number;width:number;height:number;version:number;archived:boolean;published:boolean;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string;data?:Buffer};
const rowMetadata=(row:AssetRow)=>urls({id:row.id,name:row.name,altText:row.altText,mimeType:row.mimeType,bytes:Number(row.bytes),width:row.width,height:row.height,version:row.version,archived:row.archived,published:row.published,createdAt:Number(row.createdAt),updatedAt:Number(row.updatedAt),createdBy:row.createdBy,updatedBy:row.updatedBy});
const columns=`id,name,alt_text AS "altText",mime_type AS "mimeType",byte_size AS bytes,width,height,version,archived,(published_at IS NOT NULL) AS published,created_at AS "createdAt",updated_at AS "updatedAt",created_by AS "createdBy",updated_by AS "updatedBy"`;
export class PgAssetRepository implements AssetRepository{
 constructor(private connection:AssetQueryable=db){}
 async list(includeArchived=false){const result=await this.connection.query(`SELECT ${columns} FROM workspace_assets WHERE ($1 OR archived=false) ORDER BY updated_at DESC LIMIT ${ASSET_MAX_ITEMS}`,[includeArchived]);return result.rows.map(row=>rowMetadata(row as AssetRow))}
 async count(){const result=await this.connection.query('SELECT count(*)::int AS count FROM workspace_assets');return Number((result.rows[0] as {count:number}|undefined)?.count??0)}
 async get(id:string){const result=await this.connection.query(`SELECT ${columns},data FROM workspace_assets WHERE id=$1`,[id]);const row=result.rows[0] as AssetRow|undefined;if(!row?.data)return null;return {...rowMetadata(row),data:new Uint8Array(row.data)}}
 async insert(value:AssetRecord){const result=await this.connection.query('INSERT INTO workspace_assets(id,name,alt_text,mime_type,byte_size,width,height,data,version,archived,published_at,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,false,NULL,$9,$9,$10,$10) ON CONFLICT(id) DO NOTHING',[value.id,value.name,value.altText,value.mimeType,value.bytes,value.width,value.height,Buffer.from(value.data),value.createdAt,value.createdBy]);return Boolean(result.rowCount)}
 async setArchived(id:string,expected:number,archived:boolean,actor:string,now:number){const result=await this.connection.query(`UPDATE workspace_assets SET archived=$3,version=version+1,updated_at=$4,updated_by=$5 WHERE id=$1 AND version=$2 RETURNING ${columns}`,[id,expected,archived,now,actor]);const row=result.rows[0] as AssetRow|undefined;return row?rowMetadata(row):null}
 async markPublished(id:string,now:number){return markAssetPublished(this.connection,id,now)}
}

const rehearsalAssets=new MemoryAssetRepository();
export function defaultAssetRepository():AssetRepository{if(process.env.CRC_AUTHORING_REHEARSAL==='1'){if(process.env.NODE_ENV!=='development'||liveRelayConfigured())throw new Error('Asset rehearsal storage is allowed only in local development without a relay.');return rehearsalAssets}return new PgAssetRepository()}

function pngSize(data:Uint8Array){if(data.length<45||Buffer.from(data.subarray(0,8)).toString('hex')!=='89504e470d0a1a0a'||Buffer.from(data.subarray(12,16)).toString()!=='IHDR'||Buffer.from(data.subarray(data.length-8,data.length-4)).toString()!=='IEND'||Buffer.from(data).includes(Buffer.from('acTL')))return null;const view=new DataView(data.buffer,data.byteOffset,data.byteLength);return {mimeType:'image/png' as const,width:view.getUint32(16),height:view.getUint32(20)}}
function jpegSize(data:Uint8Array){if(data.length<4||data[0]!==0xff||data[1]!==0xd8||data[data.length-2]!==0xff||data[data.length-1]!==0xd9)return null;for(let offset=2;offset+9<data.length;){if(data[offset]!==0xff){offset++;continue}const marker=data[offset+1];if(marker===0xd9||marker===0xda)break;if(marker>=0xd0&&marker<=0xd7){offset+=2;continue}const length=(data[offset+2]<<8)|data[offset+3];if(length<2||offset+2+length>data.length)return null;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {mimeType:'image/jpeg' as const,width:(data[offset+7]<<8)|data[offset+8],height:(data[offset+5]<<8)|data[offset+6]};offset+=2+length}return null}
function webpSize(data:Uint8Array){if(data.length<30||Buffer.from(data.subarray(0,4)).toString()!=='RIFF'||Buffer.from(data.subarray(8,12)).toString()!=='WEBP'||new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(4,true)+8!==data.length)return null;const chunk=Buffer.from(data.subarray(12,16)).toString();if(chunk==='VP8X'){if(data[20]&0x02)return null;return {mimeType:'image/webp' as const,width:1+data[24]+(data[25]<<8)+(data[26]<<16),height:1+data[27]+(data[28]<<8)+(data[29]<<16)}}if(chunk==='VP8L'){if(data[20]!==0x2f)return null;const bits=data[21]|(data[22]<<8)|(data[23]<<16)|(data[24]<<24);return {mimeType:'image/webp' as const,width:(bits&0x3fff)+1,height:((bits>>14)&0x3fff)+1}}if(chunk==='VP8 '&&data.length>=30&&data[23]===0x9d&&data[24]===0x01&&data[25]===0x2a)return {mimeType:'image/webp' as const,width:(data[26]|(data[27]<<8))&0x3fff,height:(data[28]|(data[29]<<8))&0x3fff};return null}
export function inspectAssetImage(data:Uint8Array){if(!data.length||data.length>ASSET_MAX_BYTES)throw new AssetError('image_too_large',`Choose an image smaller than ${ASSET_MAX_BYTES/1024} KB.`,413);const image=pngSize(data)??jpegSize(data)??webpSize(data);if(!image)throw new AssetError('unsupported_image','Choose a non-animated PNG, JPEG, or WebP image.');if(!image.width||!image.height||image.width>ASSET_MAX_DIMENSION||image.height>ASSET_MAX_DIMENSION||image.width*image.height>ASSET_MAX_PIXELS)throw new AssetError('image_dimensions',`Choose an image no larger than ${ASSET_MAX_DIMENSION} px per side and ${ASSET_MAX_PIXELS/1_000_000} megapixels.`);return image}
// A shared library that sends a malformed label must not break the import; fall back to
// a safe default rather than failing the whole shared preview.
function importedLabel(raw:string|null,fallback:string,label:string,max:number){if(raw)try{return boundedText(raw,label,max)}catch{/* fall through to the default label */}return fallback}
function boundedText(value:string,label:string,max:number){let decoded:string;try{decoded=decodeURIComponent(value)}catch{throw new AssetError('invalid_input',`${label} is invalid`)}if(!decoded.trim()||decoded.length>max)throw new AssetError('invalid_input',`${label} must be 1-${max} characters`);return decoded.trim()}
export async function createAsset(data:Uint8Array,headers:Headers,actor:string,repository:AssetRepository=defaultAssetRepository()){const name=boundedText(headers.get('x-asset-name')??'','Name',160),altText=boundedText(headers.get('x-asset-alt')??'','Alternative text',240),image=inspectAssetImage(data),hash=createHash('sha256').update(data).digest('hex'),id=`asset_${hash}`,existing=await repository.get(id);if(existing)return existing;if(await repository.count()>=ASSET_MAX_ITEMS)throw new AssetError('asset_limit',`This workspace has reached its ${ASSET_MAX_ITEMS}-asset limit, which includes archived artwork. Archived artwork still counts because its bytes stay stored for historical outputs, and archive cleanup does not remove published history.`,409);const now=Date.now(),record:AssetRecord={id,name,altText,mimeType:image.mimeType,bytes:data.byteLength,width:image.width,height:image.height,version:1,archived:false,published:false,createdAt:now,updatedAt:now,createdBy:actor,updatedBy:actor,privatePreviewUrl:`/api/assets/${id}/preview`,data};if(!await repository.insert(record))return (await repository.get(id))!;return record}
export function assetMetadata(record:AssetRecord):AssetMetadata{const metadata=clone(record) as AssetMetadata&{data?:Uint8Array};delete metadata.data;return metadata}
export async function markAssetPublished(connection:AssetQueryable,id:string,now=Date.now()){if(!/^asset_[a-f0-9]{64}$/.test(id))throw new AssetError('invalid_asset','Asset ID is invalid');const result=await connection.query('UPDATE workspace_assets SET published_at=COALESCE(published_at,$2) WHERE id=$1 AND archived=false RETURNING id',[id,now]);return Boolean(result.rowCount)}
export function cueAssetId(cue:{presentation?:{imageAssetId?:string}}){const id=cue.presentation?.imageAssetId;if(id!==undefined&&!/^asset_[a-f0-9]{64}$/.test(id))throw new AssetError('invalid_asset','Cue references an invalid asset');return id}
export async function markCueAssetPublished(connection:AssetQueryable,cue:{presentation?:{imageAssetId?:string}},now=Date.now()){const id=cueAssetId(cue);if(id&&!await markAssetPublished(connection,id,now))throw new AssetError('asset_unavailable','Selected artwork is unavailable or archived',409)}
export async function cueAssetUrl(cue:{presentation?:{imageAssetId?:string}},audience:'preview'|'published',repository:AssetRepository=defaultAssetRepository()){const id=cueAssetId(cue);if(!id)return undefined;const asset=await repository.get(id);if(!asset||(audience==='published'&&!asset.published))throw new AssetError('asset_unavailable','Selected artwork is unavailable',409);return audience==='preview'?asset.privatePreviewUrl:(asset.publicUrl??`/api/assets/${encodeURIComponent(id)}/content`)}

// R-B1 - a short-lived read link for one asset, so the server fit's headless browser (which holds
// no session) can load a draft's unpublished artwork. The key is derived from RELAY_SECRET, the
// secret that already signs this deployment's short-lived relay tickets, under a label of its own:
// an asset signature can never be replayed as a relay ticket or the other way round. The signed
// text binds the workspace, the one asset id and the expiry; nothing here logs a link or a key.
// Without RELAY_SECRET nothing is signed and the fit reports artwork 'not-loaded' as before.
export const ASSET_READ_TTL_SECONDS=300;
type AssetReadEnv=Partial<Pick<NodeJS.ProcessEnv,'RELAY_SECRET'|'WORKSPACE_ID'>>;
const ASSET_ID=/^asset_[a-f0-9]{64}$/;
function assetReadSignature(id:string,exp:number,env:AssetReadEnv){const secret=env.RELAY_SECRET;if(!secret)return null;const key=createHmac('sha256',secret).update('crc-overlays asset-read v1').digest();return createHmac('sha256',key).update(`${(env.WORKSPACE_ID||'crc').trim().toLowerCase()}\n${id}\n${exp}`).digest('base64url')}
/** `/api/assets/<id>/signed?exp=<unix seconds>&sig=<base64url>`, or undefined when signing is not configured. */
export function signedAssetReadPath(id:string,now=Date.now(),env:AssetReadEnv=process.env as AssetReadEnv){if(!ASSET_ID.test(id))return undefined;const exp=Math.floor(now/1000)+ASSET_READ_TTL_SECONDS,sig=assetReadSignature(id,exp,env);return sig?`/api/assets/${id}/signed?exp=${exp}&sig=${sig}`:undefined}
/** True only for this asset id, before its expiry, with a signature this deployment made. */
export function verifyAssetRead(id:string,exp:string|null,sig:string|null,now=Date.now(),env:AssetReadEnv=process.env as AssetReadEnv){
 if(!ASSET_ID.test(id)||!exp||!/^\d{1,12}$/.test(exp)||!sig||!/^[A-Za-z0-9_-]{43}$/.test(sig))return false;
 const expires=Number(exp),nowSeconds=Math.floor(now/1000);
 // Expired, or further ahead than any link this deployment issues (a key reused elsewhere cannot mint a long-lived one).
 if(expires<=nowSeconds||expires-nowSeconds>ASSET_READ_TTL_SECONDS+30)return false;
 const expected=assetReadSignature(id,expires,env);if(!expected)return false;
 const a=Buffer.from(sig),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
export function signedCueArtworkPath(cue:{presentation?:{imageAssetId?:string}},now=Date.now(),env:AssetReadEnv=process.env as AssetReadEnv){const id=cueAssetId(cue);return id?signedAssetReadPath(id,now,env):undefined}

// R-B1 - chunked uploads for the MCP (upload_asset begin/append/commit). A client cannot send a
// 512 KB image as one tool argument comfortably, and a Vercel function instance is not sticky
// between calls, so the chunks are staged in Postgres (db/assets.sql workspace_asset_uploads) and
// assembled at commit by createAsset - the same PNG/JPEG/WebP, size, dimension and item rules as
// the web upload route. Only the actor that began an upload can add to it or commit it.
export const ASSET_UPLOAD_CHUNK_MAX_BYTES=192*1024,ASSET_UPLOAD_TTL_MS=15*60_000,ASSET_UPLOAD_MAX_OPEN=20;
export type AssetUpload={id:string;name:string;altText:string;totalBytes:number;receivedBytes:number;nextChunk:number;createdBy:string;createdAt:number;expiresAt:number};
export interface AssetUploadStore{
 begin(upload:AssetUpload,now:number):Promise<boolean>;
 append(id:string,chunk:number,data:Uint8Array,actor:string,now:number):Promise<AssetUpload|null>;
 get(id:string,actor:string,now:number):Promise<(AssetUpload&{data:Uint8Array})|null>;
 remove(id:string):Promise<void>;
}
export class MemoryAssetUploadStore implements AssetUploadStore{
 uploads=new Map<string,AssetUpload&{data:Uint8Array}>();
 private sweep(now:number){for(const [id,upload] of this.uploads)if(upload.expiresAt<=now)this.uploads.delete(id)}
 async begin(upload:AssetUpload,now:number){this.sweep(now);if(this.uploads.size>=ASSET_UPLOAD_MAX_OPEN)return false;this.uploads.set(upload.id,{...upload,data:new Uint8Array(0)});return true}
 async append(id:string,chunk:number,data:Uint8Array,actor:string,now:number){const upload=this.uploads.get(id);if(!upload||upload.createdBy!==actor||upload.expiresAt<=now||upload.nextChunk!==chunk||upload.receivedBytes+data.byteLength>upload.totalBytes)return null;const joined=new Uint8Array(upload.receivedBytes+data.byteLength);joined.set(upload.data);joined.set(data,upload.receivedBytes);const next={...upload,data:joined,receivedBytes:joined.byteLength,nextChunk:chunk+1};this.uploads.set(id,next);const {data:_bytes,...meta}=next;void _bytes;return meta}
 async get(id:string,actor:string,now:number){const upload=this.uploads.get(id);return upload&&upload.createdBy===actor&&upload.expiresAt>now?{...upload,data:upload.data.slice()}:null}
 async remove(id:string){this.uploads.delete(id)}
}
const uploadColumns=`id,name,alt_text AS "altText",total_bytes AS "totalBytes",received_bytes AS "receivedBytes",next_chunk AS "nextChunk",created_by AS "createdBy",created_at AS "createdAt",expires_at AS "expiresAt"`;
type UploadRow=AssetUpload&{data?:Buffer};
const uploadRow=(row:UploadRow):AssetUpload=>({id:row.id,name:row.name,altText:row.altText,totalBytes:Number(row.totalBytes),receivedBytes:Number(row.receivedBytes),nextChunk:Number(row.nextChunk),createdBy:row.createdBy,createdAt:Number(row.createdAt),expiresAt:Number(row.expiresAt)});
// Until db/assets.sql's upload table exists every step answers with a sentence, never a stack.
const missingUploadTable=(error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:unknown}).code==='42P01');
async function uploadQuery<T>(run:()=>Promise<T>){try{return await run()}catch(error){if(missingUploadTable(error))throw new AssetError('asset_upload_unavailable','Uploading artwork over this connection is not set up on this server yet. Upload it in the editor\'s artwork library instead.',503);throw error}}
export class PgAssetUploadStore implements AssetUploadStore{
 constructor(private connection:AssetQueryable=db){}
 async begin(upload:AssetUpload,now:number){return uploadQuery(async()=>{await this.connection.query('DELETE FROM workspace_asset_uploads WHERE expires_at<=$1',[now]);const result=await this.connection.query(`INSERT INTO workspace_asset_uploads(id,name,alt_text,total_bytes,received_bytes,next_chunk,data,created_by,created_at,expires_at) SELECT $1::text,$2::text,$3::text,$4::int,0,0,''::bytea,$5::text,$6::bigint,$7::bigint WHERE (SELECT count(*) FROM workspace_asset_uploads)<${ASSET_UPLOAD_MAX_OPEN}`,[upload.id,upload.name,upload.altText,upload.totalBytes,upload.createdBy,upload.createdAt,upload.expiresAt]);return Boolean(result.rowCount)})}
 async append(id:string,chunk:number,data:Uint8Array,actor:string,now:number){return uploadQuery(async()=>{const result=await this.connection.query(`UPDATE workspace_asset_uploads SET data=data||$3,received_bytes=received_bytes+$4,next_chunk=next_chunk+1 WHERE id=$1 AND next_chunk=$2 AND created_by=$5 AND expires_at>$6 AND received_bytes+$4<=total_bytes RETURNING ${uploadColumns}`,[id,chunk,Buffer.from(data),data.byteLength,actor,now]);const row=result.rows[0] as UploadRow|undefined;return row?uploadRow(row):null})}
 async get(id:string,actor:string,now:number){return uploadQuery(async()=>{const result=await this.connection.query(`SELECT ${uploadColumns},data FROM workspace_asset_uploads WHERE id=$1 AND created_by=$2 AND expires_at>$3`,[id,actor,now]);const row=result.rows[0] as UploadRow|undefined;return row?{...uploadRow(row),data:new Uint8Array(row.data??Buffer.alloc(0))}:null})}
 async remove(id:string){await uploadQuery(()=>this.connection.query('DELETE FROM workspace_asset_uploads WHERE id=$1',[id]))}
}
const rehearsalUploads=new MemoryAssetUploadStore();
export function defaultAssetUploadStore():AssetUploadStore{if(process.env.CRC_AUTHORING_REHEARSAL==='1'){if(process.env.NODE_ENV!=='development'||liveRelayConfigured())throw new Error('Asset rehearsal storage is allowed only in local development without a relay.');return rehearsalUploads}return new PgAssetUploadStore()}
export const newAssetUploadId=()=>`upload_${randomBytes(16).toString('hex')}`;

type AssetImportEnvironment=Partial<Pick<NodeJS.ProcessEnv,'WORKSPACE_ID'|'CRC_SHARED_LIBRARY_URL'|'SHARED_LIBRARY_IMPORT_KEY'|'CONTROL_KEY'|'OUTPUT_KEY'|'ACCESS_BOOTSTRAP_KEY'>>&RehearsalEnv;
// Production is https-only. A local rehearsal process may reach a loopback CRC on another
// port, and nothing else: the allowance is gated on rehearsalMode(), which is false on
// Vercel, outside development, and whenever a real relay is configured.
export function sharedAssetFeedUrl(env:AssetImportEnvironment,id:string){const url=new URL(env.CRC_SHARED_LIBRARY_URL??'');if(url.username||url.password||url.hash||!url.pathname.endsWith('/api/shared-library'))throw new Error('unusable shared library URL');if(url.protocol!=='https:'&&!(url.protocol==='http:'&&Boolean(url.port)&&(url.hostname==='127.0.0.1'||url.hostname==='localhost')&&rehearsalMode(env)))throw new Error('unusable shared library URL');url.pathname=`${url.pathname}/assets/${id}`;return url}
export async function importSharedAsset(id:string,actor:string,repository:AssetRepository=defaultAssetRepository(),env:AssetImportEnvironment=process.env as AssetImportEnvironment,fetcher:typeof fetch=fetch){
 if(env.WORKSPACE_ID?.trim().toLowerCase()!=='temple-bnai-israel-kalamazoo'||!/^asset_[a-f0-9]{64}$/.test(id))throw new AssetError('asset_import_denied','Shared asset import is unavailable',403);const key=env.SHARED_LIBRARY_IMPORT_KEY;if(!key||key.length<32||[env.CONTROL_KEY,env.OUTPUT_KEY,env.ACCESS_BOOTSTRAP_KEY].some(secret=>secret&&secret===key))throw new AssetError('asset_import_unavailable','Shared asset import is not configured',503);let url:URL;try{url=sharedAssetFeedUrl(env,id)}catch{throw new AssetError('asset_import_unavailable','Shared asset import is not configured',503)}
 const existing=await repository.get(id);if(existing)return existing;
 const response=await fetcher(url,{headers:{Authorization:`Bearer ${key}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});if(!response.ok)throw new AssetError('asset_import_unavailable','Shared artwork is temporarily unavailable',503);const declared=Number(response.headers.get('content-length')??0);if(declared>ASSET_MAX_BYTES)throw new AssetError('asset_import_invalid','Shared artwork exceeds the size limit',502);const reader=response.body?.getReader();if(!reader)throw new AssetError('asset_import_invalid','Shared artwork has no content',502);const chunks:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>ASSET_MAX_BYTES){await reader.cancel();throw new AssetError('asset_import_invalid','Shared artwork exceeds the size limit',502)}chunks.push(value)}const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}if(`asset_${createHash('sha256').update(data).digest('hex')}`!==id)throw new AssetError('asset_import_invalid','Shared artwork failed integrity verification',502);const headers=new Headers({'x-asset-name':encodeURIComponent(importedLabel(response.headers.get('x-asset-name'),id,'Name',160)),'x-asset-alt':encodeURIComponent(importedLabel(response.headers.get('x-asset-alt'),'Congregation artwork','Alternative text',240))});return createAsset(data,headers,actor,repository)
}
// TBI redo G2 - an image over the artwork limits (512 KB, 4096 px per side, 16 megapixels) is
// fitted on the server instead of refused: resized to fit (aspect kept, never enlarged), its
// metadata stripped, and re-encoded - JPEG stays JPEG with the quality stepped down from 85 to 60,
// PNG is recompressed, then tried with a palette, then becomes WebP (transparency kept), WebP stays
// WebP - shrinking further only when the lowest quality still does not fit. An image already within
// the limits is returned byte for byte, without loading sharp at all. Animated images stay refused.
// createAsset remains the final check on whatever this returns.
export const ASSET_FIT_MAX_INPUT_PIXELS=100_000_000;
const FIT_QUALITIES=[85,80,75,70,65,60],FIT_SHRINK=0.8,FIT_ROUNDS=8;
export type AssetImageSize={type:AssetMime;bytes:number;width:number;height:number};
export type FittedAssetImage={data:Uint8Array;downscaled:false;stored:AssetImageSize}|{data:Uint8Array;downscaled:true;original:AssetImageSize;stored:AssetImageSize;summary:string};
const TYPE_NAMES:Record<AssetMime,string>={'image/png':'PNG','image/jpeg':'JPEG','image/webp':'WebP'};
const sizeText=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(2)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
const withinAssetLimits=(bytes:number,width:number,height:number)=>bytes<=ASSET_MAX_BYTES&&width<=ASSET_MAX_DIMENSION&&height<=ASSET_MAX_DIMENSION&&width*height<=ASSET_MAX_PIXELS;
const notAnImage=()=>new AssetError('unsupported_image','Choose a non-animated PNG, JPEG, or WebP image.');
// skipAbove: not worth trying when the previous attempt came out larger than this (a palette rarely
// saves more than about three quarters of a recompressed PNG, and quantizing a big image is slow).
type FitEncoder={type:AssetMime;label:string;skipAbove?:number;encode:(image:import('sharp').Sharp)=>Promise<Buffer>};
function fitEncoders(type:AssetMime,alpha:boolean):FitEncoder[]{
 const jpeg=FIT_QUALITIES.map(quality=>({type:'image/jpeg' as const,label:`JPEG at quality ${quality}`,encode:(image:import('sharp').Sharp)=>image.jpeg({quality,mozjpeg:true}).toBuffer()}));
 const webp=FIT_QUALITIES.map(quality=>({type:'image/webp' as const,label:`WebP at quality ${quality}${alpha?' with its transparency kept':''}`,encode:(image:import('sharp').Sharp)=>image.webp({quality,alphaQuality:100,effort:5}).toBuffer()}));
 if(type==='image/jpeg')return jpeg;
 if(type==='image/webp')return webp;
 return [{type:'image/png',label:'PNG, recompressed',encode:image=>image.png({compressionLevel:9,adaptiveFiltering:true}).toBuffer()},{type:'image/png',label:'PNG with a 256-colour palette',skipAbove:4*ASSET_MAX_BYTES,encode:image=>image.png({palette:true,quality:90,compressionLevel:9,effort:3}).toBuffer()},...webp];
}
/** The image as it will be stored: unchanged when it is within the limits, otherwise fitted. */
export async function fitAssetImage(data:Uint8Array):Promise<FittedAssetImage>{
 const image=data.length?pngSize(data)??jpegSize(data)??webpSize(data):null;
 if(!image)throw notAnImage();
 if(withinAssetLimits(data.byteLength,image.width,image.height)){inspectAssetImage(data);return {data,downscaled:false,stored:{type:image.mimeType,bytes:data.byteLength,width:image.width,height:image.height}}}
 if(!image.width||!image.height)throw notAnImage();
 if(image.width*image.height>ASSET_FIT_MAX_INPUT_PIXELS)throw new AssetError('image_dimensions',`This image is ${image.width}×${image.height} px, more than the ${ASSET_FIT_MAX_INPUT_PIXELS/1_000_000} megapixels the server will fit. Nothing was changed. Resize it to at most ${ASSET_MAX_DIMENSION} px per side and upload it again.`);
 const {default:sharp}=await import('sharp');
 const options={limitInputPixels:ASSET_FIT_MAX_INPUT_PIXELS};
 let meta:import('sharp').Metadata;try{meta=await sharp(data,{...options,animated:true}).metadata()}catch{throw notAnImage()}
 if((meta.pages??1)>1)throw notAnImage();
 // EXIF orientations 5-8 swap the sides; the stored image is turned upright because its metadata is dropped.
 const turned=(meta.orientation??1)>=5,width=turned?image.height:image.width,height=turned?image.width:image.height;
 const original:AssetImageSize={type:image.mimeType,bytes:data.byteLength,width,height},over=[data.byteLength>ASSET_MAX_BYTES?`over ${ASSET_MAX_BYTES/1024} KB`:'',Math.max(width,height)>ASSET_MAX_DIMENSION?`over ${ASSET_MAX_DIMENSION} px on a side`:'',width*height>ASSET_MAX_PIXELS?`over ${ASSET_MAX_PIXELS/1_000_000} megapixels`:''].filter(Boolean);
 const encoders=fitEncoders(image.mimeType,Boolean(meta.hasAlpha));
 let scale=Math.min(1,ASSET_MAX_DIMENSION/width,ASSET_MAX_DIMENSION/height,Math.sqrt(ASSET_MAX_PIXELS/(width*height)));
 for(let round=0;round<FIT_ROUNDS;round++,scale*=FIT_SHRINK){
  // Only the long side is named, so rounding the short side cannot shrink the long one; decode and
  // resize once per size, then try each encoding on the same pixels.
  const box=width>=height?{width:Math.max(1,Math.floor(width*scale))}:{height:Math.max(1,Math.floor(height*scale))};
  const {data:pixels,info}=await sharp(data,options).rotate().resize({...box,withoutEnlargement:true}).toColourspace('srgb').raw({depth:'uchar'}).toBuffer({resolveWithObject:true});
  if(info.width*info.height>ASSET_MAX_PIXELS)continue;
  let last=0;
  for(const encoder of encoders){
   if(encoder.skipAbove&&last>encoder.skipAbove)continue;
   const output=new Uint8Array(await encoder.encode(sharp(pixels,{raw:{width:info.width,height:info.height,channels:info.channels}})));
   last=output.byteLength;if(output.byteLength>ASSET_MAX_BYTES)continue;
   const stored:AssetImageSize={type:encoder.type,bytes:output.byteLength,width:info.width,height:info.height},resized=info.width!==width||info.height!==height;
   const summary=`The image was ${over.length>1?`${over.slice(0,-1).join(', ')} and ${over[over.length-1]}`:over[0]}, so the server ${resized?`resized it from ${width}×${height} to ${info.width}×${info.height} and `:''}re-encoded it as ${encoder.label}, dropping its metadata; ${TYPE_NAMES[original.type]} ${sizeText(original.bytes)} became ${TYPE_NAMES[stored.type]} ${sizeText(stored.bytes)}.`;
   return {data:output,downscaled:true,original,stored,summary};
  }
 }
 throw new AssetError('image_too_large',`The server could not bring this ${width}×${height} ${TYPE_NAMES[image.mimeType]} under ${ASSET_MAX_BYTES/1024} KB even at a fifth of its size. Nothing was changed. Export a smaller or simpler version and upload that.`,413);
}
