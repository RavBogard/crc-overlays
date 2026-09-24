import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import sharp from 'sharp';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {ASSET_URL_MAX_BYTES,assetToolOperation,type AssetToolContext} from '../lib/asset-tools';
import {ASSET_MAX_BYTES,AssetError,MemoryAssetRepository,MemoryAssetUploadStore,fitAssetImage} from '../lib/assets';
import {MemoryImportRepository,bytesSha256,newImportId,type ImportKind} from '../lib/imports';
import {AuthoringError} from '../lib/authoring-model';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService} from '../lib/authoring';

// TBI redo G2: upload_asset by importId or allowlisted https url, and the server fit that brings an
// image over 512 KB / 4096 px / 16 megapixels inside the limits instead of refusing it.
const SITE='overlays.templebnaiisrael.com';
const sha=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
/** Deterministic RGB(A) noise, so the encoders cannot squeeze it to nothing. */
function noise(width:number,height:number,channels:3|4,seed=11){const pixels=Buffer.alloc(width*height*channels);let state=seed;for(let index=0;index<pixels.length;index++){state^=state<<13;state^=state>>>17;state^=state<<5;pixels[index]=channels===4&&index%4===3?(index>>2)%256:state&255}return sharp(pixels,{raw:{width,height,channels}})}
const solid=(width:number,height:number)=>sharp({create:{width,height,channels:3,background:{r:40,g:90,b:160}}});

type Served={status?:number;type?:string|null;body?:Uint8Array;headers?:Record<string,string>};
function context(routes:Record<string,Served|(()=>Served)>={}){
 const assets=new MemoryAssetRepository(),imports=new MemoryImportRepository(),fetched:string[]=[],seen:RequestInit[]=[];
 const fetcher:typeof fetch=async(input,init)=>{const url=String(input);fetched.push(url);seen.push(init??{});const route=routes[url];if(!route)return new Response('missing',{status:404});const served=typeof route==='function'?route():route;const headers=new Headers(served.headers);if(served.type!==null)headers.set('content-type',served.type??'image/jpeg');return new Response(served.body?Buffer.from(served.body):null,{status:served.status??200,headers})};
 const ctx:AssetToolContext={assets,uploads:new MemoryAssetUploadStore(),drafts:async()=>[],published:async()=>[],imports:()=>imports,fetch:fetcher,siteHosts:()=>[SITE]};
 return {assets,imports,fetched,seen,ctx};
}
async function addImport(imports:MemoryImportRepository,kind:ImportKind,data:Uint8Array,status:'ready'|'receiving'='ready'){
 const id=newImportId(),now=Date.now();
 await imports.insert({id,workspaceId:'temple-bnai-israel-kalamazoo',kind,tokenSha256:'0'.repeat(64),linkExpiresAt:now+60_000,status:'receiving',fileName:'dropped',mediaType:null,totalBytes:data.byteLength,receivedBytes:0,nextChunk:0,sha256:null,refusal:null,note:null,createdBy:'daniel',createdAt:now,updatedAt:now,expiresAt:now+86_400_000});
 await imports.append(id,0,data,now);if(status==='ready')await imports.update(id,{status,sha256:bytesSha256(data)});
 return id;
}
const upload=(ctx:AssetToolContext,args:Record<string,unknown>)=>assetToolOperation('upload_asset',{name:'Artwork',altText:'The artwork',...args},'mcp:test',ctx) as Promise<Record<string,any>>;// eslint-disable-line @typescript-eslint/no-explicit-any
const refusedWith=(code:string,pattern:RegExp)=>(error:unknown)=>{assert.ok(error instanceof AssetError||error instanceof AuthoringError,String(error));assert.equal((error as AssetError).code,code,(error as Error).message);assert.match((error as Error).message,pattern);return true};

test('an image within the limits is stored byte for byte, by url and by importId',async()=>{
 const jpeg=new Uint8Array(await noise(400,300,3).jpeg({quality:80}).toBuffer());
 const {ctx,imports,assets,fetched,seen}=context({'https://image.singular.live/a/images/qr.jpg':{body:jpeg}});
 const byUrl=await upload(ctx,{url:'https://image.singular.live/a/images/qr.jpg'});
 assert.equal(byUrl.downscaled,false);assert.equal(byUrl.asset.id,`asset_${sha(jpeg)}`);assert.deepEqual([byUrl.asset.width,byUrl.asset.height,byUrl.asset.bytes],[400,300,jpeg.byteLength]);
 assert.equal(sha((await assets.get(byUrl.asset.id))!.data),sha(jpeg),'byte-identical');
 assert.deepEqual(fetched,['https://image.singular.live/a/images/qr.jpg']);assert.equal(seen[0].redirect,'manual');assert.equal(seen[0].credentials,'omit');
 const byImport=await upload(ctx,{importId:await addImport(imports,'asset',jpeg)});
 assert.deepEqual([byImport.asset.id,byImport.alreadyInLibrary,byImport.downscaled],[byUrl.asset.id,true,false]);
 const passed=await fitAssetImage(jpeg);assert.equal(passed.data,jpeg,'the same bytes object comes back');
});

test('an 8000x4500 JPEG comes back fitted to 4096 px, still a JPEG, reporting both sizes',async()=>{
 const jpeg=new Uint8Array(await solid(8000,4500).jpeg({quality:90}).withMetadata({exif:{IFD0:{Copyright:'someone'}}}).toBuffer());
 const {ctx,imports,assets}=context();
 const result=await upload(ctx,{importId:await addImport(imports,'asset',jpeg)});
 assert.equal(result.downscaled,true);
 assert.deepEqual(result.original,{type:'image/jpeg',bytes:jpeg.byteLength,width:8000,height:4500});
 assert.deepEqual([result.stored.type,result.stored.width,result.stored.height],['image/jpeg',4096,2304]);
 assert.deepEqual([result.asset.type,result.asset.width,result.asset.height,result.asset.bytes],['image/jpeg',4096,2304,result.stored.bytes]);
 assert.match(result.downscale,/over 4096 px on a side and over 16 megapixels, so the server resized it from 8000×4500 to 4096×2304 and re-encoded it as JPEG at quality 85, dropping its metadata; JPEG \d+ KB became JPEG \d+ KB\./);
 assert.match(result.message,/^The image was .* Added "Artwork" to the artwork library\. Attach it with update_draft/);
 const stored=(await assets.get(result.asset.id))!.data,meta=await sharp(stored).metadata();
 assert.deepEqual([meta.format,meta.width,meta.height,meta.exif],['jpeg',4096,2304,undefined],'metadata stripped');
 assert.equal(result.asset.id,`asset_${sha(stored)}`);
});

test('a JPEG over 512 KB within the dimensions steps its quality down, then its size, until it fits',async()=>{
 const jpeg=new Uint8Array(await noise(1000,750,3).jpeg({quality:95}).toBuffer());
 assert.ok(jpeg.byteLength>ASSET_MAX_BYTES);
 const fitted=await fitAssetImage(jpeg);
 assert.ok(fitted.downscaled&&fitted.stored.type==='image/jpeg'&&fitted.stored.bytes<=ASSET_MAX_BYTES&&fitted.data.byteLength===fitted.stored.bytes);
 assert.ok(fitted.stored.width<=1000&&Math.abs(fitted.stored.width/fitted.stored.height-4/3)<0.01,'aspect kept, never enlarged');
});

test('a large PNG with transparency is fitted and keeps its alpha',async()=>{
 const png=new Uint8Array(await noise(700,700,4).png().toBuffer());
 assert.ok(png.byteLength>ASSET_MAX_BYTES);
 const fitted=await fitAssetImage(png);
 assert.ok(fitted.downscaled);assert.ok(['image/png','image/webp'].includes(fitted.stored.type));assert.ok(fitted.stored.bytes<=ASSET_MAX_BYTES);
 const meta=await sharp(fitted.data).metadata();assert.equal(meta.hasAlpha,true,'transparency kept');
 if(fitted.stored.type==='image/webp')assert.match(fitted.summary,/WebP at quality \d+ with its transparency kept/);
 // A wide mostly-flat PNG only needs resizing, so it stays a PNG.
 const wide=new Uint8Array(await sharp({create:{width:6000,height:400,channels:4,background:{r:255,g:0,b:0,alpha:0.5}}}).png().toBuffer());
 const fittedWide=await fitAssetImage(wide);
 assert.ok(fittedWide.downscaled);assert.deepEqual([fittedWide.stored.type,fittedWide.stored.width,fittedWide.stored.height],['image/png',4096,273]);
 assert.equal((await sharp(fittedWide.data).metadata()).hasAlpha,true);
});

test('the chunked form is fitted too, and animated or non-image bytes stay refused',async()=>{
 const {ctx}=context();
 const tall=new Uint8Array(await solid(20,5000).png().toBuffer());
 const begun=await assetToolOperation('upload_asset',{step:'begin',name:'Tall',altText:'Tall',totalBytes:tall.byteLength},'mcp:test',ctx) as {uploadId:string};
 await assetToolOperation('upload_asset',{step:'append',uploadId:begun.uploadId,chunkIndex:0,dataBase64:Buffer.from(tall).toString('base64')},'mcp:test',ctx);
 const committed=await assetToolOperation('upload_asset',{step:'commit',uploadId:begun.uploadId},'mcp:test',ctx) as Record<string,any>;// eslint-disable-line @typescript-eslint/no-explicit-any
 assert.deepEqual([committed.downscaled,committed.asset.width,committed.asset.height],[true,16,4096]);
 const png=Buffer.from(await solid(10,10).png().toBuffer()),animated=Buffer.concat([png.subarray(0,33),Buffer.from('000000086163544c000000010000000000000000','hex'),png.subarray(33)]);
 await assert.rejects(fitAssetImage(new Uint8Array(animated)),refusedWith('unsupported_image',/non-animated/));
 await assert.rejects(fitAssetImage(new TextEncoder().encode('not an image')),refusedWith('unsupported_image',/non-animated/));
 const webp=new Uint8Array(await solid(8,8).webp().toBuffer());assert.equal((await fitAssetImage(webp)).downscaled,false);
});

test('the url allowlist: https only, listed hosts only, no credentials, redirects re-checked, images only, 10 MB',async()=>{
 const jpeg=new Uint8Array(await solid(50,50).jpeg().toBuffer());
 const {ctx,fetched}=context({
  'https://assets.singular.live/hop':{status:302,headers:{location:'https://evil.example/x.jpg'}},
  'https://assets.singular.live/ok-hop':{status:301,headers:{location:`https://${SITE}/art/logo.jpg`}},
  [`https://${SITE}/art/logo.jpg`]:{body:jpeg},
  'https://image.singular.live/page':{type:'text/html',body:new TextEncoder().encode('<html>')},
  'https://image.singular.live/huge':{headers:{'content-length':String(ASSET_URL_MAX_BYTES+1)},body:jpeg},
  'https://image.singular.live/stream':()=>({body:new Uint8Array(ASSET_URL_MAX_BYTES+10)}),
  'https://image.singular.live/gone':{status:404,body:new Uint8Array(0)},
 });
 const refuses=async(url:string,code:string,pattern:RegExp)=>assert.rejects(upload(ctx,{url}),refusedWith(code,pattern));
 await refuses('http://image.singular.live/a.jpg','asset_url_refused',/Only https links are fetched; that link is http\. Nothing was changed\./);
 await refuses('https://evil.example/a.jpg','asset_url_refused',/on evil\.example, which is not on the list images are fetched from \(image\.singular\.live, assets\.singular\.live, overlays\.templebnaiisrael\.com\)\. Nothing was changed\./);
 await refuses('https://user:pw@image.singular.live/a.jpg','asset_url_refused',/carries a user name or password/);
 await refuses('https://image.singular.live:8443/a.jpg','asset_url_refused',/port 8443/);
 await refuses('not a link','asset_url_refused',/not a valid absolute link/);
 await refuses('https://assets.singular.live/hop','asset_url_refused',/redirects to a link that is on evil\.example/);
 assert.ok(!fetched.some(url=>url.includes('evil.example')),'the refused hop is never fetched');
 await refuses('https://image.singular.live/page','asset_url_refused',/not an image: image\.singular\.live sent 'text\/html'/);
 await refuses('https://image.singular.live/huge','image_too_large',/over the 10 MB the server fetches/);
 await refuses('https://image.singular.live/stream','image_too_large',/over the 10 MB/);
 await refuses('https://image.singular.live/gone','asset_url_unavailable',/answered 404/);
 const followed=await upload(ctx,{url:'https://assets.singular.live/ok-hop'});
 assert.equal(followed.asset.id,`asset_${sha(jpeg)}`);assert.deepEqual(fetched.slice(-2),['https://assets.singular.live/ok-hop',`https://${SITE}/art/logo.jpg`]);
 await assert.rejects(upload(ctx,{url:'https://image.singular.live/a.jpg',importId:newImportId()}),refusedWith('invalid_input',/importId or url, not both/));
 await assert.rejects(upload(ctx,{url:'https://image.singular.live/a.jpg',step:'begin'}),refusedWith('invalid_input',/does not take/));
});

test('importId: the wrong kind, not finished, unknown or malformed are refused in sentences',async()=>{
 const {ctx,imports}=context(),jpeg=new Uint8Array(await solid(10,10).jpeg().toBuffer());
 await assert.rejects(upload(ctx,{importId:await addImport(imports,'deck-plan',jpeg)}),refusedWith('wrong_import_kind',/That import is a deck-plan file, not asset\./));
 await assert.rejects(upload(ctx,{importId:await addImport(imports,'asset',jpeg,'receiving')}),refusedWith('import_not_ready',/Nothing has finished arriving/));
 await assert.rejects(upload(ctx,{importId:newImportId()}),refusedWith('unknown_import',/no such import/));
 await assert.rejects(upload(ctx,{importId:'import_nope'}),refusedWith('invalid_import_id',/importId must be/));
 await assert.rejects(upload(ctx,{importId:newImportId(),name:undefined}),refusedWith('invalid_input',/name must be 1-160 characters/));
 await assert.rejects(upload({...ctx,imports:undefined},{importId:newImportId()}),refusedWith('import_unavailable',/not set up on this server yet/));
});

test('over the MCP: upload_asset takes the url form without a step, through the real handler',async()=>{
 const jpeg=new Uint8Array(await solid(8000,4500).jpeg({quality:85}).toBuffer());
 const assets=new MemoryAssetRepository(),fetcher:typeof fetch=async()=>new Response(Buffer.from(jpeg),{headers:{'content-type':'image/jpeg'}});
 const service=createAuthoringService(new MemoryAuthoringRepository(assets),undefined,undefined,async()=>undefined,undefined,undefined,undefined,{assets,uploads:new MemoryAssetUploadStore(),fetch:fetcher,siteHosts:()=>[]});
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>service.operation(operation,input,who));
 const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:0a1b2c:member:member-7'}} satisfies AuthInfo;
 const call=async(args:Record<string,unknown>)=>{const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'upload_asset',arguments:{...args,workspace:'crc'}}})}),{authInfo});const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);return (JSON.parse(data??'{}') as {result:{isError?:boolean;content:{text:string}[]}}).result};
 const result=await call({url:'https://image.singular.live/x/images/0001.jpg',name:'0001.jpg',altText:'Licence background'});
 assert.notEqual(result.isError,true,result.content[0].text);
 const output=JSON.parse(result.content[0].text);
 assert.deepEqual([output.downscaled,output.asset.width,output.asset.height,output.original.width],[true,4096,2304,8000]);
 const refused=await call({url:'https://example.com/x.jpg',name:'x',altText:'x'});
 assert.equal(refused.isError,true);assert.match(refused.content[0].text,/not on the list images are fetched from \(image\.singular\.live, assets\.singular\.live\)\. Nothing was changed\./);
});
