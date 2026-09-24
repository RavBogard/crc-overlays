import assert from 'node:assert/strict';
import test from 'node:test';
import {AssetError,MemoryAssetRepository,MemoryAssetUploadStore,createAsset} from '../lib/assets';
import {assetToolOperation} from '../lib/asset-tools';

// L4 follow-up: archive_asset refuses artwork the branding uses, as it does artwork a published graphic uses.
const PNG=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
test('archive_asset refuses artwork the branding uses, and archives it once the branding lets go',async()=>{
 const assets=new MemoryAssetRepository();const asset=await createAsset(PNG,new Headers({'x-asset-name':'Logo','x-asset-alt':'Logo'}),'editor',assets);
 let branding=[{role:'logo',assetId:asset.id}];
 const context={assets,uploads:new MemoryAssetUploadStore(),drafts:async()=>[],published:async()=>[],branding:async()=>branding};
 await assert.rejects(assetToolOperation('archive_asset',{assetId:asset.id,expectedVersion:asset.version},'editor',context),(error:unknown)=>error instanceof AssetError&&error.code==='asset_in_use'&&/while the branding uses it as the logo\. Nothing was changed\. Change the branding with update_branding first\./.test(error.message));
 branding=[];
 const archived=await assetToolOperation('archive_asset',{assetId:asset.id,expectedVersion:asset.version},'editor',context) as {asset:{archived:boolean}};
 assert.equal(archived.asset.archived,true);
});
