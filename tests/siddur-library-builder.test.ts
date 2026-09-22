import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {cpSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const repoRoot=resolve(import.meta.dirname,'..');
const fixtureRoot=join(repoRoot,'tests','fixtures','siddur-source');
const builder=join(repoRoot,'scripts','build-siddur-library.py');

// Vercel's build runs this suite without a Python interpreter, so the test announces
// its absence rather than failing a deployment over a tool it cannot install.
const findPython=():string|null=>{
 for(const candidate of ['python3','python','py']){
  const probe=spawnSync(candidate,['--version'],{encoding:'utf8'});
  if(!probe.error&&probe.status===0)return candidate;
 }
 return null;
};

const python=findPython();

if(python===null){
 test.skip('the siddur library builder accepts the synthetic source fixture (no python interpreter on PATH)',()=>{});
}else{
 test('the siddur library builder accepts the synthetic source fixture',()=>{
  const output=join(mkdtempSync(join(tmpdir(),'siddur-library-')),'siddur-library.json');
  const run=spawnSync(python,[builder,'--output',output],{
   cwd:repoRoot,
   encoding:'utf8',
   env:{...process.env,SIDDUR_SOURCE_ROOT:fixtureRoot},
  });
  assert.equal(run.status,0,`builder failed: ${run.stderr||run.stdout}`);
  const library=JSON.parse(readFileSync(output,'utf8')) as {sources?:{id:string;sourceBoundaries?:unknown}[]};
  assert.ok(Array.isArray(library.sources),'the generated library carries a sources array');
  assert.ok(library.sources.length>=1,'the fixture yields at least one source');
  assert.deepEqual(library.sources.find(source=>source.id.endsWith('fixture-unit-original'))?.sourceBoundaries,{en:[{block:0,endAfter:'Placeholder original English'}]});
 });

 // A published `dist-app/` is an artifact, not a checkout: there is no repository to ask what
 // commit it came from, so the producer ships PROVENANCE.json beside it and the builder reads
 // the commit from there. Without this the library would attribute the producer's feeds to
 // whatever commit the runner's working directory happened to be on, which for a fetched
 // surface is this repository's own — a wrong answer that nothing downstream could catch.
 test('a published app surface attributes the library to the commit its provenance names',()=>{
  const surfaceRoot=mkdtempSync(join(tmpdir(),'siddur-surface-'));
  cpSync(fixtureRoot,surfaceRoot,{recursive:true});
  const commit='a'.repeat(40);
  writeFileSync(join(surfaceRoot,'dist-app','PROVENANCE.json'),JSON.stringify({
   schemaVersion:1,
   sourceRepo:'RavBogard/ShireiShabbat',
   sourceSha:commit,
   bookCount:1,
  }));
  const output=join(mkdtempSync(join(tmpdir(),'siddur-library-')),'siddur-library.json');
  const run=spawnSync(python,[builder,'--output',output],{
   cwd:repoRoot,
   encoding:'utf8',
   env:{...process.env,SIDDUR_SOURCE_ROOT:surfaceRoot},
  });
  assert.equal(run.status,0,`builder failed: ${run.stderr||run.stdout}`);
  const library=JSON.parse(readFileSync(output,'utf8')) as {authorities?:{repositoryCommit?:string}[]};
  assert.ok(Array.isArray(library.authorities)&&library.authorities.length>=1);
  for(const authority of library.authorities)assert.equal(authority.repositoryCommit,commit);
 });

 test('a provenance file that names no commit is refused rather than guessed around',()=>{
  const surfaceRoot=mkdtempSync(join(tmpdir(),'siddur-surface-'));
  cpSync(fixtureRoot,surfaceRoot,{recursive:true});
  writeFileSync(join(surfaceRoot,'dist-app','PROVENANCE.json'),JSON.stringify({
   schemaVersion:1,
   sourceRepo:'RavBogard/ShireiShabbat',
  }));
  const output=join(mkdtempSync(join(tmpdir(),'siddur-library-')),'siddur-library.json');
  const run=spawnSync(python,[builder,'--output',output],{
   cwd:repoRoot,
   encoding:'utf8',
   env:{...process.env,SIDDUR_SOURCE_ROOT:surfaceRoot},
  });
  assert.notEqual(run.status,0,'the builder accepted a surface it cannot attribute');
 });
}
