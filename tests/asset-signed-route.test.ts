import assert from 'node:assert/strict';
import test from 'node:test';

// R-B1 - the signed artwork read the server fit stage uses: the right link serves the bytes with
// no session; an expired link, a link for another asset or a changed signature is refused.
// Rehearsal storage (memory) stands in for Postgres; the env is set before the modules load.
Object.assign(process.env,{CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development',RELAY_SECRET:'test-relay-secret-for-the-signed-route'});
delete process.env.RELAY_URL;delete process.env.VERCEL;

const PNG=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));

test('a signed link serves one asset for minutes and nothing else',async()=>{
 const [{GET},{createAsset,defaultAssetRepository,signedAssetReadPath}]=await Promise.all([import('../app/api/assets/[id]/signed/route.ts'),import('../lib/assets.ts')]);
 const asset=await createAsset(PNG,new Headers({'x-asset-name':'Dot','x-asset-alt':'A%20dot'}),'editor',defaultAssetRepository());
 const read=(path:string,id=asset.id)=>GET(new Request(new URL(path,'https://crc.example')),{params:Promise.resolve({id})});
 const path=signedAssetReadPath(asset.id)!;
 const served=await read(path);
 assert.equal(served.status,200);
 assert.equal(served.headers.get('content-type'),'image/png');
 assert.equal(served.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(new Uint8Array(await served.arrayBuffer()),PNG);
 // The same signature presented for another id - here an id that does exist in no library.
 assert.equal((await read(path.replace(asset.id,`asset_${'f'.repeat(64)}`),`asset_${'f'.repeat(64)}`)).status,403);
 const expired=signedAssetReadPath(asset.id,Date.now()-10*60_000)!;
 assert.equal((await read(expired)).status,403,'expired');
 assert.equal((await read(path.replace(/sig=(.)/,(_,first:string)=>`sig=${first==='A'?'B':'A'}`))).status,403,'a changed signature');
 assert.equal((await read(`/api/assets/${asset.id}/signed`)).status,403,'no signature');
 const missing=`asset_${'0'.repeat(64)}`;
 assert.equal((await read(signedAssetReadPath(missing)!,missing)).status,404,'a valid link to nothing is simply not found');
});
