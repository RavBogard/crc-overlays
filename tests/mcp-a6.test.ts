import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {crc32,deflateSync} from 'node:zlib';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import {ASSET_READ_TTL_SECONDS,ASSET_UPLOAD_CHUNK_MAX_BYTES,MemoryAssetRepository,MemoryAssetUploadStore,signedAssetReadPath,verifyAssetRead} from '../lib/assets';
import {stageArtworkUrl} from '../lib/overlay-assets';
import {measureCueOnServer,type StageLauncher} from '../lib/server-fit';
import type {Cue} from '../lib/player';

// Packet A6 (R-B1): the artwork library over the MCP and the signed artwork link the server fit
// uses, through the real MCP handler into the real in-memory authoring service with a stubbed
// server fit runner that checks the link it is handed.
const SECRET='test-relay-secret-for-asset-signing-only';
process.env.RELAY_SECRET=SECRET;
const AGENT='mcp:0a1b2c:member:member-7';
const authInfo=(actor=AGENT)=>({token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor}}) satisfies AuthInfo;
type Content={type:string;text?:string;data?:string;mimeType?:string};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output;content:Content[]};

/** A real, non-animated RGBA PNG of noise, so it does not compress below one chunk. */
function noisePng(width:number,height:number,seed=7){
 const chunk=(type:string,body:Buffer)=>{const head=Buffer.alloc(8);head.writeUInt32BE(body.length,0);head.write(type,4,'latin1');const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type,'latin1'),body])),0);return Buffer.concat([head,body,crc])};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const raw=Buffer.alloc((width*4+1)*height);let state=seed;
 for(let y=0;y<height;y++){raw[y*(width*4+1)]=0;for(let x=0;x<width*4;x++){state^=state<<13;state^=state>>>17;state^=state<<5;raw[y*(width*4+1)+1+x]=x%4===3?255:state&255}}
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

function wired(serverFit:ServerFitRunner){
 const assets=new MemoryAssetRepository(),repo=new MemoryAuthoringRepository(assets);
 const uploads=new MemoryAssetUploadStore();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,serverFit,undefined,undefined,{assets,uploads});
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>service.operation(operation,input,who));
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={},workspace:string|undefined='crc',as=AGENT):Promise<Called>=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:workspace===undefined?args:{...args,workspace}}})}),{authInfo:authInfo(as)});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Content[]};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{},content:[]};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output,content:body.result!.content};
 };
 return {repo,assets,uploads,call};
}

async function upload(call:(name:string,args?:Record<string,unknown>)=>Promise<Called>,bytes:Buffer,name='Chanukah menorah'){
 const begun=await call('upload_asset',{step:'begin',name,altText:'A lit menorah',totalBytes:bytes.byteLength});
 assert.equal(begun.isError,false,begun.text);
 for(let index=0,offset=0;offset<bytes.byteLength;index++,offset+=ASSET_UPLOAD_CHUNK_MAX_BYTES){
  const appended=await call('upload_asset',{step:'append',uploadId:begun.output.uploadId,chunkIndex:index,dataBase64:bytes.subarray(offset,offset+ASSET_UPLOAD_CHUNK_MAX_BYTES).toString('base64')});
  assert.equal(appended.isError,false,appended.text);
 }
 return {begun,committed:await call('upload_asset',{step:'commit',uploadId:begun.output.uploadId})};
}

test('acceptance: an agent uploads a PNG, attaches it, and ship_draft shows it with artwork loaded',async()=>{
 const png=noisePng(300,300),expectedId=`asset_${createHash('sha256').update(png).digest('hex')}`;
 assert.ok(png.byteLength>ASSET_UPLOAD_CHUNK_MAX_BYTES&&png.byteLength<=512*1024,'the image needs more than one chunk');
 const handed:Array<string|undefined>=[];
 // The stub stands where the stage would: it loads the artwork only through the link it was given.
 const stage:ServerFitRunner=async(cue,options)=>{
  handed.push(options?.artworkUrl);
  const url=options?.artworkUrl?new URL(options.artworkUrl,'https://crc.example'):null;
  const id=cue.presentation?.imageAssetId;
  const loaded=Boolean(url&&id&&url.pathname===`/api/assets/${id}/signed`&&verifyAssetRead(id,url.searchParams.get('exp'),url.searchParams.get('sig')));
  return {verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:id?(loaded?'loaded':'not-loaded'):'none',measuredAt:Date.now(),rendererVersion:'server-chromium/test',...(options?.includePreviewImage?{previewImage:{mimeType:'image/jpeg',dataBase64:Buffer.from('frame').toString('base64'),width:1920,height:1080}}:{})};
 };
 const {call,assets}=wired(stage);
 const {begun,committed}=await upload(call,png);
 assert.equal(begun.output.chunks,2);assert.equal(begun.output.workspaceId,'crc');
 assert.equal(committed.isError,false,committed.text);
 assert.equal(committed.output.asset.id,expectedId,'content-addressed: asset_<sha256>');
 assert.deepEqual([committed.output.asset.type,committed.output.asset.width,committed.output.asset.height,committed.output.asset.bytes],['image/png',300,300,png.byteLength]);
 assert.match(committed.output.message,/update_draft patch\.presentation\.imageAssetId/);
 const created=await call('create_draft',{name:'Chanukah welcome',title:'Chanukah',layout:'bottom',content:{mode:'custom',text:'Happy Chanukah from all of us'}});
 const draftId=created.output.draft.id;
 const attached=await call('update_draft',{draftId,expectedVersion:1,patch:{presentation:{imageAssetId:expectedId}}});
 assert.equal(attached.isError,false,attached.text);
 const shipped=await call('ship_draft',{draftId,expectedVersion:2});
 assert.equal(shipped.isError,false,shipped.text);
 assert.deepEqual([shipped.output.shipped,shipped.output.verdict,shipped.output.artwork],[true,'pass','loaded']);
 assert.doesNotMatch(shipped.output.message,/not loaded/,'no artwork caveat once it rendered');
 assert.equal(shipped.content[1]?.type,'image','the frame comes back as an image');
 assert.equal(handed.length,1);assert.match(handed[0]!,new RegExp(`^/api/assets/${expectedId}/signed\\?exp=\\d+&sig=[A-Za-z0-9_-]{43}$`));
 assert.doesNotMatch(shipped.text,/sig=/,'the signed link never reaches the agent');
 assert.equal((await assets.get(expectedId))?.published,true,'publishing marks the artwork published');
 const listed=await call('list_assets',{},undefined);
 assert.equal(listed.isError,false,listed.text);
 assert.deepEqual(listed.output.assets.map((row:Output)=>[row.id,row.usedBy]),[[expectedId,[{draftId,name:'Chanukah welcome',published:true}]]]);
 // Archiving is refused while the published graphic uses it, in a sentence that names it.
 const refused=await call('archive_asset',{assetId:expectedId,expectedVersion:1});
 assert.equal(refused.isError,true);assert.match(refused.text,/can't be archived while a published graphic uses it: "Chanukah welcome"\. Nothing was changed\./);
 assert.equal((await assets.get(expectedId))?.archived,false);
 // Uploading the same bytes again is the same asset, said so.
 const again=await upload(call,png,'Menorah again');
 assert.deepEqual([again.committed.output.asset.id,again.committed.output.alreadyInLibrary],[expectedId,true]);
});

test('a draft without artwork gets no signed link, and archive_asset works once nothing published uses it',async()=>{
 const handed:Array<string|undefined>=[];
 const {call,assets}=wired(async(_cue,options)=>{handed.push(options?.artworkUrl);return {verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test'}});
 const png=noisePng(8,8);
 const {committed}=await upload(call,png,'Small');
 const assetId=committed.output.asset.id;
 const created=await call('create_draft',{name:'Plain',title:'Notice',layout:'bottom',content:{mode:'custom',text:'Plain text'}});
 await call('ship_draft',{draftId:created.output.draft.id,expectedVersion:1});
 assert.deepEqual(handed,[undefined]);
 const draft=await call('create_draft',{name:'Uses art',title:'Notice',layout:'bottom',content:{mode:'custom',text:'With art'},presentation:{imageAssetId:assetId}});
 const stale=await call('archive_asset',{assetId,expectedVersion:5});
 assert.equal(stale.isError,true);assert.match(stale.text,/is at version 1, not 5\. Nothing was changed\./);
 const archived=await call('archive_asset',{assetId,expectedVersion:1});
 assert.equal(archived.isError,false,archived.text);
 assert.equal(archived.output.asset.archived,true);
 assert.match(archived.output.message,/One unpublished draft still uses it \("Uses art"\)/);
 assert.equal((await assets.get(assetId))?.archived,true);
 assert.equal((await call('list_assets',{},undefined)).output.assets.length,0,'archived artwork is hidden by default');
 assert.equal((await call('list_assets',{includeArchived:true},undefined)).output.assets[0].usedBy[0].draftId,draft.output.draft.id);
 assert.equal((await call('archive_asset',{assetId,expectedVersion:2})).isError,true);
});

test('upload_asset refuses in sentences: out of order, over the declared size, incomplete, not an image, another connection, too large',async()=>{
 const {call}=wired(async()=>({verdict:'unavailable',reason:'browser_unavailable'}));
 const png=noisePng(8,8);
 const begun=await call('upload_asset',{step:'begin',name:'Logo',altText:'Logo',totalBytes:png.byteLength});
 const uploadId=begun.output.uploadId;
 const skipped=await call('upload_asset',{step:'append',uploadId,chunkIndex:1,dataBase64:png.toString('base64')});
 assert.equal(skipped.isError,true);assert.match(skipped.text,/expects chunkIndex 0 next, not 1\. Nothing was added\./);
 const over=await call('upload_asset',{step:'append',uploadId,chunkIndex:0,dataBase64:Buffer.concat([png,Buffer.from('x')]).toString('base64')});
 assert.equal(over.isError,true);assert.match(over.text,/past the \d+ bytes declared at begin/);
 const incomplete=await call('upload_asset',{step:'commit',uploadId});
 assert.equal(incomplete.isError,true);assert.match(incomplete.text,/holds 0 of the \d+ bytes declared at begin\. Append chunkIndex 0/);
 const other=await call('upload_asset',{step:'append',uploadId,chunkIndex:0,dataBase64:png.toString('base64')},'crc','mcp:someone-else');
 assert.equal(other.isError,true);assert.match(other.text,/begun by another connection/);
 const badBase64=await call('upload_asset',{step:'append',uploadId,chunkIndex:0,dataBase64:'abc'});
 assert.equal(badBase64.isError,true);
 const text=Buffer.from('this is not an image at all, just words');
 const notImage=await call('upload_asset',{step:'begin',name:'Words',altText:'Words',totalBytes:text.byteLength});
 await call('upload_asset',{step:'append',uploadId:notImage.output.uploadId,chunkIndex:0,dataBase64:text.toString('base64')});
 const refused=await call('upload_asset',{step:'commit',uploadId:notImage.output.uploadId});
 assert.equal(refused.isError,true);assert.match(refused.text,/Choose a non-animated PNG, JPEG, or WebP image\./);
 assert.equal((await call('upload_asset',{step:'begin',name:'Big',altText:'Big',totalBytes:512*1024+1})).isError,true,'over 512 KB is refused at begin');
 assert.equal((await call('upload_asset',{step:'begin',name:'Big',altText:'Big',totalBytes:10})).isError,false);
 const missing=await call('upload_asset',{step:'begin',name:'No size',altText:'x'});
 assert.equal(missing.isError,true);assert.match(missing.text,/totalBytes must be a whole number/);
 const noWorkspace=await call('upload_asset',{step:'begin',name:'x',altText:'x',totalBytes:4},'temple-bnai-israel-kalamazoo');
 assert.equal(noWorkspace.isError,true,noWorkspace.text);assert.match(noWorkspace.text,/Nothing was changed/,'a write names its workspace');
});

test('signed artwork links expire, name one asset and one workspace, and need the secret',()=>{
 const id=`asset_${'a'.repeat(64)}`,other=`asset_${'b'.repeat(64)}`,now=1_800_000_000_000;
 const env={RELAY_SECRET:SECRET,WORKSPACE_ID:'crc'};
 const url=new URL(signedAssetReadPath(id,now,env)!,'https://crc.example');
 const exp=url.searchParams.get('exp'),sig=url.searchParams.get('sig');
 assert.equal(url.pathname,`/api/assets/${id}/signed`);
 assert.equal(Number(exp),now/1000+ASSET_READ_TTL_SECONDS,'minutes, not hours');
 assert.equal(verifyAssetRead(id,exp,sig,now,env),true);
 assert.equal(verifyAssetRead(id,exp,sig,now+(ASSET_READ_TTL_SECONDS-1)*1000,env),true);
 assert.equal(verifyAssetRead(id,exp,sig,now+ASSET_READ_TTL_SECONDS*1000,env),false,'expired');
 assert.equal(verifyAssetRead(other,exp,sig,now,env),false,'another asset id');
 assert.equal(verifyAssetRead(id,String(Number(exp)+1),sig,now,env),false,'a changed expiry');
 assert.equal(verifyAssetRead(id,exp,`${sig!.slice(0,-1)}${sig!.endsWith('A')?'B':'A'}`,now,env),false,'a changed signature');
 assert.equal(verifyAssetRead(id,exp,sig,now,{RELAY_SECRET:'another-secret',WORKSPACE_ID:'crc'}),false,'another key');
 assert.equal(verifyAssetRead(id,exp,sig,now,{RELAY_SECRET:SECRET,WORKSPACE_ID:'temple-bnai-israel-kalamazoo'}),false,'another workspace');
 assert.equal(verifyAssetRead(id,exp,sig,now,{}),false,'no secret, nothing verifies');
 assert.equal(signedAssetReadPath(id,now,{}),undefined,'no secret, nothing is signed');
 const far=new URL(signedAssetReadPath(id,now+3_600_000,env)!,'https://crc.example');
 assert.equal(verifyAssetRead(id,far.searchParams.get('exp'),far.searchParams.get('sig'),now,env),false,'a link further ahead than any this deployment issues');
 assert.equal(verifyAssetRead(id,null,sig,now,env),false);assert.equal(verifyAssetRead(id,exp,null,now,env),false);
});

test('the stage uses a signed link only for the cue\'s own asset',()=>{
 const id=`asset_${'c'.repeat(64)}`,cue={presentation:{imageAssetId:id}};
 const signed=signedAssetReadPath(id,Date.now(),{RELAY_SECRET:SECRET})!;
 assert.equal(stageArtworkUrl(cue,signed),signed);
 assert.equal(stageArtworkUrl(cue),`/api/assets/${id}/preview`);
 assert.equal(stageArtworkUrl(cue,signedAssetReadPath(`asset_${'d'.repeat(64)}`,Date.now(),{RELAY_SECRET:SECRET})),`/api/assets/${id}/preview`,'a link for another asset is ignored');
 assert.equal(stageArtworkUrl(cue,`https://evil.example${signed}`),`/api/assets/${id}/preview`,'never another origin');
 assert.equal(stageArtworkUrl({},signed),undefined);
});

test('measureCueOnServer hands the signed link to the stage in the evaluate argument, not the page URL',async()=>{
 const seen:{url?:string;options?:unknown}={};
 const launch:StageLauncher=async()=>({
  async newPage(){return {async setViewportSize(){},async goto(url:string){seen.url=url;return null},async waitForFunction(){return true},async evaluate<Result,Arg>(_fn:(arg:Arg)=>Result|Promise<Result>,arg:Arg){const input=arg as unknown as {cue?:unknown;options?:unknown};if(input?.cue)seen.options=input.options;return {fitErrors:[],warnings:[],fill:null,artwork:'loaded'} as unknown as Result}}},
  async close(){return null},
 });
 const host={make:async()=>'scratch',remove:async()=>{},bytes:async()=>0,free:async()=>null,survivors:async()=>[],alive:async()=>false,held:async()=>0,kill:async()=>{}};
 const artworkUrl=`/api/assets/asset_${'e'.repeat(64)}/signed?exp=1&sig=${'x'.repeat(43)}`;
 const result=await measureCueOnServer({id:'c',name:'c',layout:'bottom',texts:{}} as unknown as Cue,{origin:'https://crc.example',launch,host,artworkUrl});
 assert.equal(result.verdict,'pass');
 assert.deepEqual(seen.options,{artworkUrl});
 assert.equal(seen.url,'https://crc.example/author/fit-stage');
});
