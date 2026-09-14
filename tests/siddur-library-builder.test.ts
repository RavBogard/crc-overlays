import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
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
  const library=JSON.parse(readFileSync(output,'utf8')) as {sources?:unknown[]};
  assert.ok(Array.isArray(library.sources),'the generated library carries a sources array');
  assert.ok(library.sources.length>=1,'the fixture yields at least one source');
 });
}
