import assert from 'node:assert/strict';
import test from 'node:test';
import {AssetError,ASSET_MAX_ITEMS,createAsset,cueAssetUrl,importSharedAsset,inspectAssetImage,MemoryAssetRepository} from '../lib/assets.ts';

const png=()=>new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
const headers=()=>new Headers({'x-asset-name':encodeURIComponent('Service artwork'),'x-asset-alt':encodeURIComponent('A blue woven tree')});

test('upload verifies image bytes, stores content once, and never returns binary in metadata lists',async()=>{
 const repository=new MemoryAssetRepository();const first=await createAsset(png(),headers(),'editor',repository),second=await createAsset(png(),headers(),'editor',repository);
 assert.equal(first.id,second.id);assert.match(first.id,/^asset_[a-f0-9]{64}$/);assert.equal(first.mimeType,'image/png');assert.equal(first.width,1);assert.equal(first.published,false);
 const listed=await repository.list();assert.equal(listed.length,1);assert.equal('data' in listed[0],false);assert.equal(listed[0].privatePreviewUrl,`/api/assets/${first.id}/preview`);assert.equal(listed[0].publicUrl,undefined);
});

test('SVG, animation markers, oversized files, and oversized dimensions are rejected',()=>{
 assert.throws(()=>inspectAssetImage(new TextEncoder().encode('<svg><script>alert(1)</script></svg>')),(error:unknown)=>error instanceof AssetError&&error.code==='unsupported_image');
 const animated=png(),marker=new TextEncoder().encode('acTL');animated.set(marker,30);assert.throws(()=>inspectAssetImage(animated),/non-animated/);
 const huge=png(),view=new DataView(huge.buffer);view.setUint32(16,4097);assert.throws(()=>inspectAssetImage(huge),/no larger/);
 assert.throws(()=>inspectAssetImage(new Uint8Array(512*1024+1)),/smaller/);
});

test('archive uses exact versions and publication exposes only immutable content URL',async()=>{
 const repository=new MemoryAssetRepository(),asset=await createAsset(png(),headers(),'editor',repository);
 const archived=await repository.setArchived(asset.id,1,true,'editor',2);assert.equal(archived?.version,2);assert.equal(await repository.markPublished(asset.id,3),false);assert.equal(await repository.setArchived(asset.id,1,false,'editor',4),null);
 const restored=await repository.setArchived(asset.id,2,false,'editor',5);assert.equal(restored?.archived,false);assert.equal(await repository.markPublished(asset.id,6),true);
 const cue={presentation:{imageAssetId:asset.id}},semantic=JSON.stringify(cue);assert.match((await cueAssetUrl(cue,'preview',repository))!,/\/preview$/);assert.match((await cueAssetUrl(cue,'published',repository))!,/\/content$/);assert.equal(JSON.stringify(cue),semantic);
});

test('shared asset copy is TBI-only, bounded, and verifies the content hash',async()=>{
 const source=new MemoryAssetRepository(),destination=new MemoryAssetRepository(),asset=await createAsset(png(),headers(),'crc',source);await source.markPublished(asset.id,2);const stored=await source.get(asset.id);
 const fetcher:typeof fetch=async(input,init)=>{assert.equal(new URL(String(input)).pathname,`/api/shared-library/assets/${asset.id}`);assert.equal((init?.headers as Record<string,string>).Authorization,`Bearer ${'x'.repeat(32)}`);return new Response(Uint8Array.from(stored!.data).buffer,{status:200,headers:{'content-length':String(stored!.bytes),'x-asset-name':encodeURIComponent(stored!.name),'x-asset-alt':encodeURIComponent(stored!.altText)}})};
 const copied=await importSharedAsset(asset.id,'tbi-editor',destination,{WORKSPACE_ID:'temple-bnai-israel-kalamazoo',CRC_SHARED_LIBRARY_URL:'https://crc.example/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:'x'.repeat(32)},fetcher);assert.equal(copied.id,asset.id);assert.equal(copied.published,false);assert.deepEqual((await destination.get(asset.id))?.data,stored?.data);
 await assert.rejects(()=>importSharedAsset(asset.id,'crc',destination,{WORKSPACE_ID:'crc',CRC_SHARED_LIBRARY_URL:'https://crc.example/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:'x'.repeat(32)},fetcher),/unavailable/);
 await assert.rejects(()=>importSharedAsset(asset.id,'tbi',destination,{WORKSPACE_ID:'temple-bnai-israel-kalamazoo',CRC_SHARED_LIBRARY_URL:'https://crc.example/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:'x'.repeat(32),CONTROL_KEY:'x'.repeat(32)},fetcher),/not configured/);
 const wrong=`asset_${'0'.repeat(64)}`;await assert.rejects(()=>importSharedAsset(wrong,'tbi',destination,{WORKSPACE_ID:'temple-bnai-israel-kalamazoo',CRC_SHARED_LIBRARY_URL:'https://crc.example/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:'x'.repeat(32)},async()=>new Response(Uint8Array.from(stored!.data).buffer)),/integrity/);
});

const sharedEnv={WORKSPACE_ID:'temple-bnai-israel-kalamazoo',CRC_SHARED_LIBRARY_URL:'https://crc.example/api/shared-library',SHARED_LIBRARY_IMPORT_KEY:'x'.repeat(32)};

test('a malformed shared label falls back to a safe default instead of failing the import',async()=>{
 const source=new MemoryAssetRepository(),asset=await createAsset(png(),headers(),'crc',source),stored=(await source.get(asset.id))!;
 const respond=(labels:Record<string,string>)=>(async()=>new Response(Uint8Array.from(stored.data).buffer,{status:200,headers:{'content-length':String(stored.bytes),...labels}})) as typeof fetch;
 // Percent sequences that decodeURIComponent rejects, plus an empty and an over-long label.
 const broken=await importSharedAsset(asset.id,'tbi',new MemoryAssetRepository(),sharedEnv,respond({'x-asset-name':'%E0%A4%A','x-asset-alt':'%zz'}));
 assert.equal(broken.name,asset.id);assert.equal(broken.altText,'Congregation artwork');
 const blank=await importSharedAsset(asset.id,'tbi',new MemoryAssetRepository(),sharedEnv,respond({'x-asset-name':'%20%20','x-asset-alt':encodeURIComponent('a'.repeat(241))}));
 assert.equal(blank.name,asset.id);assert.equal(blank.altText,'Congregation artwork');
 const missing=await importSharedAsset(asset.id,'tbi',new MemoryAssetRepository(),sharedEnv,respond({}));
 assert.equal(missing.name,asset.id);assert.equal(missing.altText,'Congregation artwork');
 const good=await importSharedAsset(asset.id,'tbi',new MemoryAssetRepository(),sharedEnv,respond({'x-asset-name':encodeURIComponent('Shared tree'),'x-asset-alt':encodeURIComponent('A woven tree')}));
 assert.equal(good.name,'Shared tree');assert.equal(good.altText,'A woven tree');
});

test('the workspace asset quota counts archived artwork and says so',async()=>{
 const repository=new MemoryAssetRepository();
 // Archived artwork keeps its stored bytes for historical outputs, so it still counts.
 for(let index=0;index<ASSET_MAX_ITEMS;index++)await repository.insert({id:`asset_${index.toString(16).padStart(64,'0')}`,name:'n',altText:'a',mimeType:'image/png',bytes:1,width:1,height:1,version:1,archived:true,published:false,createdAt:1,updatedAt:1,createdBy:'x',updatedBy:'x',privatePreviewUrl:'/preview',data:new Uint8Array([1])});
 assert.equal(await repository.count(),ASSET_MAX_ITEMS);
 assert.equal((await repository.list()).length,0,'archived artwork is hidden from the list but still counted');
 await assert.rejects(()=>createAsset(png(),headers(),'editor',repository),(error:unknown)=>{
  assert.ok(error instanceof AssetError&&error.code==='asset_limit'&&error.status===409);
  // This exact message is what the assets API returns and the author UI surfaces.
  assert.match(error.message,/includes archived artwork/);
  return true;
 });
});
