// R-B1 - the artwork library over the MCP: upload_asset (begin/append/commit), list_assets and
// archive_asset. The rules are the web library's own (lib/assets.ts createAsset, setArchived); this
// file only adds the chunk staging, the compact rows and the published-use guard on archiving.
// TBI redo G2 adds the one-call forms (an 'asset' import by importId, or an allowlisted https url)
// and the server fit (lib/assets.ts fitAssetImage) in front of createAsset on every form.
import {createHash} from 'node:crypto';
import {ASSET_MAX_BYTES,ASSET_UPLOAD_CHUNK_MAX_BYTES,ASSET_UPLOAD_MAX_OPEN,ASSET_UPLOAD_TTL_MS,AssetError,createAsset,fitAssetImage,newAssetUploadId,type AssetMetadata,type AssetRepository,type AssetUploadStore} from './assets';
import {readImportBytes,type ImportRepository} from './imports';
import {canonicalOrigin,publicOrigins} from './oauth-core';

export const ASSET_TOOL_OPERATIONS:ReadonlySet<string>=new Set(['upload_asset','list_assets','archive_asset']);
export const isAssetTool=(operation:string)=>ASSET_TOOL_OPERATIONS.has(operation);

type UsingCue={id:string;name:string;presentation?:{imageAssetId?:string}};
type UsingDraft=UsingCue&{archivedAt?:number|null};
export type AssetToolContext={
 assets:AssetRepository;
 uploads:AssetUploadStore;
 /** Every draft, archived included; each is matched on presentation.imageAssetId. */
 drafts:()=>Promise<UsingDraft[]>;
 /** The published cues in the catalog now (archived drafts' publications excluded). */
 published:()=>Promise<UsingCue[]>;
 /** L4 - artwork the workspace branding names (logo, resting logo, scan card); the output page loads it. */
 branding?:()=>Promise<{role:string;assetId:string}[]>;
 /** G2 - the workspace's import store, read for upload_asset importId. */
 imports?:()=>ImportRepository;
 /** G2 - the fetch used for upload_asset url (tests inject one). */
 fetch?:typeof fetch;
 /** G2 - the workspace's own site hosts on the url allowlist; defaults to workspaceSiteHosts(). */
 siteHosts?:()=>string[];
 now?:()=>number;
};

// G2 - upload_asset url fetches an https image from Singular's image hosts or this workspace's own
// site, and nothing else: no credentials in the link, every redirect hop re-checked against the same
// list, 10 seconds, 10 MB. Refusals name the host, never the rest of the link (a query may carry a key).
export const ASSET_URL_HOSTS=['image.singular.live','assets.singular.live'] as const;
export const ASSET_URL_MAX_BYTES=10*1024*1024,ASSET_URL_TIMEOUT_MS=10_000,ASSET_URL_MAX_REDIRECTS=3;
/** The hosts of canonicalOrigin(), PUBLIC_BASE_URL and PUBLIC_ALTERNATE_ORIGINS; a misconfigured origin adds none. */
export function workspaceSiteHosts(){try{return [...new Set([canonicalOrigin(),...publicOrigins()].map(origin=>new URL(origin).hostname.toLowerCase()))]}catch{return []}}
const INSTEAD='Nothing was changed. Drop the file on an import dropzone instead (open_import_dropzone kind \'asset\', then upload_asset importId).';
const urlRefused=(message:string)=>new AssetError('asset_url_refused',`${message} ${INSTEAD}`);
function allowedUrl(value:string,hosts:string[],what='That link'){
 let url:URL;try{url=new URL(value)}catch{throw urlRefused(`${what} is not a valid absolute link.`)}
 if(url.protocol!=='https:')throw urlRefused(`Only https links are fetched; ${what.toLowerCase()} is ${url.protocol.replace(/:$/,'')}.`);
 if(url.username||url.password)throw urlRefused(`${what} carries a user name or password. Pass a link without credentials.`);
 if(url.port&&url.port!=='443')throw urlRefused(`${what} names port ${url.port}; only the standard https port is fetched.`);
 if(!hosts.includes(url.hostname.toLowerCase()))throw urlRefused(`${what} is on ${url.hostname}, which is not on the list images are fetched from (${hosts.join(', ')}).`);
 url.hash='';return url;
}
async function fetchImage(value:string,hosts:string[],fetcher:typeof fetch){
 let url=allowedUrl(value,hosts);const signal=AbortSignal.timeout(ASSET_URL_TIMEOUT_MS);
 try{
  for(let hop=0;;hop++){
   const response=await fetcher(url,{redirect:'manual',credentials:'omit',cache:'no-store',signal,headers:{accept:'image/png,image/jpeg,image/webp,image/*;q=0.8'}});
   if(response.status>=300&&response.status<400){
    const location=response.headers.get('location');await response.body?.cancel().catch(()=>undefined);
    if(!location)throw new AssetError('asset_url_unavailable',`${url.hostname} answered with a redirect that names no destination. ${INSTEAD}`,502);
    if(hop>=ASSET_URL_MAX_REDIRECTS)throw urlRefused(`That link redirects more than ${ASSET_URL_MAX_REDIRECTS} times.`);
    url=allowedUrl(new URL(location,url).href,hosts,'That link redirects to a link that');continue;
   }
   if(!response.ok){await response.body?.cancel().catch(()=>undefined);throw new AssetError('asset_url_unavailable',`${url.hostname} answered ${response.status} for that link. Check the link and try again. Nothing was changed.`,502)}
   const type=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
   if(!type.startsWith('image/')){await response.body?.cancel().catch(()=>undefined);throw urlRefused(`That link is not an image: ${url.hostname} sent ${type?`'${type}'`:'no content type'}.`)}
   const tooBig=()=>new AssetError('image_too_large',`That image is over the ${ASSET_URL_MAX_BYTES/1024/1024} MB the server fetches. ${INSTEAD}`,413);
   if(Number(response.headers.get('content-length')??0)>ASSET_URL_MAX_BYTES){await response.body?.cancel().catch(()=>undefined);throw tooBig()}
   const reader=response.body?.getReader();if(!reader)throw new AssetError('asset_url_unavailable',`${url.hostname} sent no image. Check the link and try again. Nothing was changed.`,502);
   const chunks:Uint8Array[]=[];let size=0;
   for(;;){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;if(size>ASSET_URL_MAX_BYTES){await reader.cancel().catch(()=>undefined);throw tooBig()}chunks.push(chunk)}
   const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength}
   return data;
  }
 }catch(error){
  if(error instanceof AssetError)throw error;
  if(error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError'))throw new AssetError('asset_url_unavailable',`That image did not arrive within ${ASSET_URL_TIMEOUT_MS/1000} seconds. ${INSTEAD}`,504);
  throw new AssetError('asset_url_unavailable',`${url.hostname} could not be reached. Check the link and try again. Nothing was changed.`,502);
 }
}

const invalid=(message:string)=>new AssetError('invalid_input',message);
function record(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('Arguments must be an object.');return value as Record<string,unknown>}
function only(data:Record<string,unknown>,allowed:string[],step:string){const extra=Object.keys(data).filter(key=>!allowed.includes(key));if(extra.length)throw invalid(`${step} does not take ${extra.join(', ')}. It takes ${allowed.join(', ')}.`)}
function text(value:unknown,name:string,max:number){if(typeof value!=='string'||!value.trim()||value.length>max)throw invalid(`${name} must be 1-${max} characters.`);return value.trim()}
function whole(value:unknown,name:string,min:number,max:number){if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw invalid(`${name} must be a whole number from ${min} to ${max}.`);return value as number}
const uploadId=(value:unknown)=>{if(typeof value!=='string'||!/^upload_[a-f0-9]{32}$/.test(value))throw invalid('uploadId must be the id upload_asset step:\'begin\' returned.');return value};
const assetId=(value:unknown)=>{if(typeof value!=='string'||!/^asset_[a-f0-9]{64}$/.test(value))throw invalid('assetId must be an asset id from list_assets (asset_ followed by 64 hex characters).');return value};
// Strict base64: the alphabet, padding only at the end, and a whole number of quads, so a
// truncated chunk is refused here instead of silently decoding to fewer bytes.
function base64(value:unknown){if(typeof value!=='string'||!value.length||value.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw invalid('dataBase64 must be standard base64 (A-Z, a-z, 0-9, + and /, padded with = to a multiple of 4 characters).');const bytes=Buffer.from(value,'base64');if(!bytes.byteLength)throw invalid('dataBase64 is empty.');return new Uint8Array(bytes)}

const BRANDING_ROLE_NAMES:Record<string,string>={logo:'logo',restingLogo:'resting logo',scanCard:'scan card'};
const usesAsset=(id:string)=>(cue:UsingCue)=>cue.presentation?.imageAssetId===id;
const named=(cues:UsingCue[])=>cues.map(cue=>`"${cue.name}"`).join(', ');
function compact(asset:AssetMetadata,drafts:UsingDraft[],published:Set<string>){
 const using=drafts.filter(usesAsset(asset.id));
 return {id:asset.id,name:asset.name,altText:asset.altText,type:asset.mimeType,bytes:asset.bytes,width:asset.width,height:asset.height,version:asset.version,archived:asset.archived,published:asset.published,usedBy:using.map(draft=>({draftId:draft.id,name:draft.name,published:published.has(draft.id),...(draft.archivedAt?{archived:true}:{})}))};
}

// Every upload form ends here: fit the image (unchanged when it is within the limits), then
// createAsset, which is the web upload's own check: non-animated PNG, JPEG or WebP, 512 KB, 4096 px
// per side, 16 megapixels, the workspace item limit, and the content-addressed asset_<sha256> id.
async function storeImage(bytes:Uint8Array,name:string,altText:string,actor:string,context:AssetToolContext){
 const fitted=await fitAssetImage(bytes),id=`asset_${createHash('sha256').update(fitted.data).digest('hex')}`,existed=Boolean(await context.assets.get(id));
 const asset=await createAsset(fitted.data,new Headers({'x-asset-name':encodeURIComponent(name),'x-asset-alt':encodeURIComponent(altText)}),actor,context.assets);
 const [drafts,published]=await Promise.all([context.drafts(),context.published()]);
 const row=compact(asset,drafts,new Set(published.map(cue=>cue.id)));
 const fit=fitted.downscaled?{downscaled:true,original:fitted.original,stored:fitted.stored,downscale:fitted.summary}:{downscaled:false};
 const said=`${fitted.downscaled?`${fitted.summary} `:''}${existed?`This image was already in the library as "${asset.name}".`:`Added "${asset.name}" to the artwork library.`}`;
 return {asset:row,...fit,...(existed?{alreadyInLibrary:true}:{}),message:asset.archived?`${fitted.downscaled?`${fitted.summary} `:''}This image is already in the library as "${asset.name}", archived. Restore it in the editor's artwork library before a graphic can publish with it.`:`${said} Attach it with update_draft patch.presentation.imageAssetId:'${asset.id}'.`};
}

export async function assetToolOperation(operation:string,input:unknown,actor:string,context:AssetToolContext){
 const data=record(input),now=(context.now??Date.now)();
 if(operation==='upload_asset'){
  const step=data.step;
  if(step===undefined&&(data.importId!==undefined||data.url!==undefined)){
   if(data.importId!==undefined&&data.url!==undefined)throw invalid('Pass importId or url, not both.');
   if(data.importId!==undefined){
    only(data,['importId','name','altText'],'upload_asset by importId');
    const name=text(data.name,'name',160),altText=text(data.altText,'altText',240);
    const imports=context.imports?.();if(!imports)throw new AssetError('import_unavailable','Reading dropzone imports is not set up on this server yet. Upload the image with step \'begin\' instead. Nothing was changed.',503);
    const imported=await readImportBytes(imports,data.importId,'asset',now);
    return storeImage(imported.data,name,altText,actor,context);
   }
   only(data,['url','name','altText'],'upload_asset by url');
   if(typeof data.url!=='string'||!data.url.trim()||data.url.length>2048)throw invalid('url must be an https link of 1-2048 characters.');
   const name=text(data.name,'name',160),altText=text(data.altText,'altText',240);
   const hosts=[...new Set([...ASSET_URL_HOSTS,...(context.siteHosts??workspaceSiteHosts)()])];
   return storeImage(await fetchImage(data.url.trim(),hosts,context.fetch??fetch),name,altText,actor,context);
  }
  if(step==='begin'){
   only(data,['step','name','altText','totalBytes'],'upload_asset step \'begin\'');
   const name=text(data.name,'name',160),altText=text(data.altText,'altText',240),totalBytes=whole(data.totalBytes,'totalBytes',1,ASSET_MAX_BYTES);
   const upload={id:newAssetUploadId(),name,altText,totalBytes,receivedBytes:0,nextChunk:0,createdBy:actor,createdAt:now,expiresAt:now+ASSET_UPLOAD_TTL_MS};
   if(!await context.uploads.begin(upload,now))throw new AssetError('asset_upload_busy',`${ASSET_UPLOAD_MAX_OPEN} uploads are already open on this workspace. Commit or let them expire (15 minutes), then begin again.`,429);
   const chunks=Math.ceil(totalBytes/ASSET_UPLOAD_CHUNK_MAX_BYTES);
   return {uploadId:upload.id,totalBytes,maxChunkBytes:ASSET_UPLOAD_CHUNK_MAX_BYTES,chunks,expiresAt:upload.expiresAt,next:`Send the image bytes in order with upload_asset step:'append', chunkIndex 0${chunks>1?` to ${chunks-1}`:''}, each at most ${ASSET_UPLOAD_CHUNK_MAX_BYTES/1024} KB before base64; then step:'commit'.`};
  }
  if(step==='append'){
   only(data,['step','uploadId','chunkIndex','dataBase64'],'upload_asset step \'append\'');
   const id=uploadId(data.uploadId),chunkIndex=whole(data.chunkIndex,'chunkIndex',0,1000),bytes=base64(data.dataBase64);
   if(bytes.byteLength>ASSET_UPLOAD_CHUNK_MAX_BYTES)throw invalid(`A chunk may hold at most ${ASSET_UPLOAD_CHUNK_MAX_BYTES/1024} KB before base64; this one holds ${bytes.byteLength} bytes. Split it and send the pieces as consecutive chunks.`);
   const updated=await context.uploads.append(id,chunkIndex,bytes,actor,now);
   if(!updated){
    const current=await context.uploads.get(id,actor,now);
    if(!current)throw new AssetError('unknown_upload','That upload does not exist, has expired or was begun by another connection. Begin a new upload.',404);
    if(current.nextChunk!==chunkIndex)throw new AssetError('chunk_out_of_order',`This upload expects chunkIndex ${current.nextChunk} next, not ${chunkIndex}. Nothing was added.`,409);
    throw invalid(`This chunk would take the upload past the ${current.totalBytes} bytes declared at begin (${current.receivedBytes} received). Nothing was added.`);
   }
   return {uploadId:id,receivedBytes:updated.receivedBytes,totalBytes:updated.totalBytes,nextChunk:updated.nextChunk,complete:updated.receivedBytes===updated.totalBytes};
  }
  if(step==='commit'){
   only(data,['step','uploadId'],'upload_asset step \'commit\'');
   const id=uploadId(data.uploadId),upload=await context.uploads.get(id,actor,now);
   if(!upload)throw new AssetError('unknown_upload','That upload does not exist, has expired or was begun by another connection. Begin a new upload.',404);
   if(upload.receivedBytes!==upload.totalBytes)throw invalid(`The upload holds ${upload.receivedBytes} of the ${upload.totalBytes} bytes declared at begin. Append chunkIndex ${upload.nextChunk} before committing.`);
   // A failed check keeps the staged bytes until expiry, so nothing is left half-made either way.
   const stored=await storeImage(upload.data,upload.name,upload.altText,actor,context);
   await context.uploads.remove(id);
   return stored;
  }
  throw invalid('upload_asset takes {importId, name, altText} (an asset dropped on open_import_dropzone), {url, name, altText} (an https image on the allowlist), or step: \'begin\' (name, altText, totalBytes), \'append\' (uploadId, chunkIndex, dataBase64) and \'commit\' (uploadId).');
 }
 if(operation==='list_assets'){
  only(data,['includeArchived','query'],'list_assets');
  if(data.includeArchived!==undefined&&typeof data.includeArchived!=='boolean')throw invalid('includeArchived must be true or false.');
  const query=data.query===undefined?undefined:text(data.query,'query',100).toLowerCase();
  const [assets,drafts,published]=await Promise.all([context.assets.list(data.includeArchived===true),context.drafts(),context.published()]);
  const live=new Set(published.map(cue=>cue.id));
  const rows=assets.filter(asset=>!query||asset.name.toLowerCase().includes(query)||asset.altText.toLowerCase().includes(query)).map(asset=>compact(asset,drafts,live));
  return {assets:rows,count:rows.length,limits:{maxBytes:ASSET_MAX_BYTES,acceptedTypes:['image/png','image/jpeg','image/webp'],maxDimension:4096}};
 }
 if(operation==='archive_asset'){
  only(data,['assetId','expectedVersion'],'archive_asset');
  const id=assetId(data.assetId),expectedVersion=whole(data.expectedVersion,'expectedVersion',1,Number.MAX_SAFE_INTEGER);
  const asset=await context.assets.get(id);
  if(!asset)throw new AssetError('unknown_asset','No artwork with that id is in this library. list_assets names what is.',404);
  if(asset.archived)throw new AssetError('already_archived',`"${asset.name}" is already archived. Nothing was changed.`,409);
  const inUse=(await context.published()).filter(usesAsset(id));
  if(inUse.length)throw new AssetError('asset_in_use',`"${asset.name}" can't be archived while ${inUse.length===1?'a published graphic uses':`${inUse.length} published graphics use`} it: ${named(inUse)}. Nothing was changed. Publish ${inUse.length===1?'that graphic':'those graphics'} with other artwork (update_draft presentation.imageAssetId, then ship_draft) or archive ${inUse.length===1?'it':'them'} first.`,409);
  const roles=(await context.branding?.()??[]).filter(item=>item.assetId===id).map(item=>BRANDING_ROLE_NAMES[item.role]??item.role);
  if(roles.length)throw new AssetError('asset_in_use',`"${asset.name}" can't be archived while the branding uses it as the ${roles.join(' and the ')}. Nothing was changed. Change the branding with update_branding first.`,409);
  const updated=await context.assets.setArchived(id,expectedVersion,true,actor,now);
  if(!updated)throw new AssetError('version_conflict',`"${asset.name}" is at version ${asset.version}, not ${expectedVersion}. Nothing was changed. Read it again with list_assets and pass that version.`,409);
  const drafts=(await context.drafts()).filter(draft=>!draft.archivedAt&&usesAsset(id)(draft));
  return {asset:compact(updated,drafts,new Set()),message:`Archived "${updated.name}". ${drafts.length?`${drafts.length===1?'One unpublished draft still uses':`${drafts.length} unpublished drafts still use`} it (${named(drafts)}) and will not publish until the artwork is restored in the editor or replaced.`:'No draft uses it.'}`};
 }
 throw new AssetError('unknown_operation',`Unknown asset operation: ${operation}`,404);
}
