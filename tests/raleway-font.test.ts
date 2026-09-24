import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {FONT_FACES,STAGED_FONT_ASSETS,fontFaceRule,fontWaits} from '../lib/font-registry.ts';

// G7 (TBI redo): ruling 6 names Raleway for TBI's Latin text. The files are @fontsource/raleway 5.3.0
// (https://cdn.jsdelivr.net/npm/@fontsource/raleway@5.3.0/files/), the latin and latin-ext subsets at
// the two weights the overlay draws (400, 500; nothing is italic); the licence is google/fonts
// ofl/raleway/OFL.txt. The hashes pin the bytes that were checked in.
const root=(path:string)=>fileURLToPath(new URL(`../${path}`,import.meta.url));
const FILES:Record<string,string>={
 'raleway-latin-400-normal.woff2':'2318962e7930f55b45907ee85a6b6165ca3bba437b05ca17068a5c876d3de18b',
 'raleway-latin-500-normal.woff2':'079304529dd9db1bdab7e005680fc30d3233e2ba828c1996a3770018334bedf3',
 'raleway-latin-ext-400-normal.woff2':'e8ab3804b770bc1f6ee998bdcaa28e05d02346654356869ae726469e5148dd0d',
 'raleway-latin-ext-500-normal.woff2':'b16e12bb3514dc53736d08904ad137b160d125f5001911345d59fa95ff578464',
};

test('the Raleway files are the pinned woff2 subsets, with the OFL beside them',()=>{
 for(const [file,sha256] of Object.entries(FILES)){
  const bytes=readFileSync(root(`public/assets/${file}`));
  assert.equal(bytes.subarray(0,4).toString('latin1'),'wOF2',`${file} is woff2`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,`${file} is the checked-in file`);
 }
 const licence=readFileSync(root('public/assets/Raleway-OFL.txt'),'utf8');
 assert.match(licence,/The Raleway Project Authors/);
 assert.match(licence,/SIL OPEN FONT LICENSE Version 1\.1/);
});

test('Raleway is a default overlay face: declared in overlay.css, awaited at 400 and 500, staged for TBI',()=>{
 const faces=FONT_FACES.filter(face=>face.family==='Raleway');
 assert.deepEqual(faces.map(face=>face.file).sort(),Object.keys(FILES).sort());
 const css=readFileSync(root('app/overlay.css'),'utf8');
 for(const face of faces){
  assert.equal(face.stylesheet,'app/overlay.css');
  assert.ok(face.unicodeRange,`${face.file} loads only for its subset`);
  assert.ok(css.includes(fontFaceRule(face)),`${face.file} is declared`);
 }
 assert.deepEqual(fontWaits('default').filter(face=>face.family==='Raleway'),[{family:'Raleway',weight:'400',sample:'latin'},{family:'Raleway',weight:'500',sample:'latin'}]);
 for(const file of [...Object.keys(FILES),'Raleway-OFL.txt']){
  assert.ok(STAGED_FONT_ASSETS.includes(`public/assets/${file}`),`${file} is in TBI's staged copy`);
  assert.ok(existsSync(root(`public/assets/${file}`)));
 }
});
