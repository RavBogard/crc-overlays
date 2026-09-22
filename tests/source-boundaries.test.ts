import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseContent,resolveSourceBoundaries,sourceBlockFor,sourcePinFor,sourceSnapshotsFor,type AuthoringSource} from '../lib/authoring-model.ts';

function source(boundaries:{block:number;endAfter:string}[]=[{block:0,endAfter:'One.'},{block:0,endAfter:'Two.'}],hash='a'.repeat(64)):AuthoringSource{
 return {id:'example',name:'Example',section:null,unitSha256:'u'.repeat(64),sourceBoundaries:{en:boundaries},blocks:[{id:'example#block-0',index:0,kind:'original-en',role:'original',en:'One. Two. Three.',sourceBlockSha256:hash}]};
}
const content={mode:'original-en' as const,englishGroups:[{sourceId:'example',blockIds:['example#block-0/slice-0','example#block-0/slice-1','example#block-0/slice-2']}]};

test('boundary pointers resolve to a lossless selectable partition while retaining the whole block',()=>{
 const raw=source(),resolved=resolveSourceBoundaries(raw),children=resolved.blocks.filter(block=>block.canonicalParentBlockId);
 assert.deepEqual(children.map(block=>block.id),['example#block-0/slice-0','example#block-0/slice-1','example#block-0/slice-2']);
 assert.equal(children.map(block=>block.en).join(''),'One. Two. Three.');
 assert.equal(sourceBlockFor('example','example#block-0',[raw]).sourceBlockSha256,'a'.repeat(64));
 assert.equal(sourceBlockFor('example','example#block-0/slice-1',[raw]).canonicalParentBlockSha256,'a'.repeat(64));
 assert.deepEqual(parseContent(content,[raw]),content);
 const snapshot=sourceSnapshotsFor(content,[raw])[0];
 assert.equal(snapshot.blocks.length,1,'snapshots retain only canonical source text');
 assert.deepEqual(snapshot.sourceBoundaries,raw.sourceBoundaries);
});

test('derived pins include canonical hash drift and old whole-block selections retain their pin',()=>{
 const old=source(),changed=source(undefined,'b'.repeat(64));
 const child='example#block-0/slice-0';
 const childPin=sourcePinFor({...content,englishGroups:[{sourceId:'example',blockIds:[child]}]},[old]).blockSha256[JSON.stringify(['example',child])];
 const drifted=sourcePinFor({...content,englishGroups:[{sourceId:'example',blockIds:[child]}]},[changed]).blockSha256[JSON.stringify(['example',child])];
 assert.notEqual(childPin,drifted);
 const whole={mode:'original-en' as const,englishGroups:[{sourceId:'example',blockIds:['example#block-0']}]};
 assert.equal(sourcePinFor(whole,[old]).blockSha256[JSON.stringify(['example','example#block-0'])],'a'.repeat(64));
});

test('missing, ambiguous, unordered, duplicate, terminal, and invalid cut pointers are rejected',()=>{
 const cases:[{block:number;endAfter:string}[],string?][]=[
  [[{block:0,endAfter:'Missing.'}]],
  [[{block:0,endAfter:'One.'}],'One. One. Three.'],
  [[{block:0,endAfter:'Two.'},{block:0,endAfter:'One.'}]],
  [[{block:0,endAfter:'One.'},{block:0,endAfter:'One.'}]],
  [[{block:0,endAfter:'Three.'}]],
  [[{block:true as unknown as number,endAfter:'One.'}]],
  [[{block:0.5,endAfter:'One.'}]],
 ];
 for(const [boundaries,text] of cases){const raw=source(boundaries);if(text)raw.blocks[0].en=text;assert.throws(()=>resolveSourceBoundaries(raw),/Source example|invalid/i)}
});
