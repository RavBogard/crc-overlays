import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {FONT_FACES,STAGED_FONT_ASSETS,familyWeights,fontFaceRule,fontWaits} from '../lib/font-registry.ts';
import {accentTitleWeights} from '../lib/branding-palette.ts';

// G10 (TBI redo): a branded accent title may be drawn heavier (typography.accentTitle.weight). The
// SemiBold and Bold files are the notofonts hinted TTFs
// (https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansHebrew/hinted/ttf/),
// version 3.001 - the same set the Regular and Medium already came from: those two are
// byte-identical to that directory's. The OFL beside them covers all four. The hashes pin the bytes.
const root=(path:string)=>fileURLToPath(new URL(`../${path}`,import.meta.url));
const FILES:Record<string,{sha256:string;weight:string}>={
 'NotoSansHebrew-Regular.ttf':{sha256:'cdefaf8efd47045f6820928eba84db5bed7557539328952b5f828315485e02ee',weight:'400'},
 'NotoSansHebrew-Medium.ttf':{sha256:'ae3d724f56101a961f6824c030ff827e3fcad4ec9eb5a902047506f00bf9516b',weight:'500'},
 'NotoSansHebrew-SemiBold.ttf':{sha256:'1554039810a7059296f4eea651927e32f7219dc6f220ab70e449c69906769c95',weight:'600'},
 'NotoSansHebrew-Bold.ttf':{sha256:'da9226e886c245a7e11673c24dec82bded64d8574c1e1f03983bf89297d2aaa8',weight:'700'},
};

test('the Noto Sans Hebrew files are the pinned notofonts TTFs, one per weight, with the OFL beside them',()=>{
 for(const [file,{sha256,weight}] of Object.entries(FILES)){
  const bytes=readFileSync(root(`public/assets/${file}`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,`${file} is the checked-in file`);
  // OS/2 usWeightClass: the file really is that weight, not a copy the browser would fake bold from.
  const tables=bytes.readUInt16BE(4);let os2=-1;
  for(let index=0;index<tables;index++){const at=12+index*16;if(bytes.toString('latin1',at,at+4)==='OS/2')os2=bytes.readUInt32BE(at+8)}
  assert.ok(os2>0,`${file} has an OS/2 table`);
  assert.equal(String(bytes.readUInt16BE(os2+4)),weight,`${file} is weight ${weight}`);
 }
 const licence=readFileSync(root('public/assets/NotoSansHebrew-OFL.txt'),'utf8');
 assert.match(licence,/The Noto Project Authors/);
 assert.match(licence,/SIL Open Font License, Version 1\.1/i);
});

test('the heavier weights are registered, declared, staged for TBI, and not awaited up front',()=>{
 const faces=FONT_FACES.filter(face=>face.family==='Noto Sans Hebrew');
 assert.deepEqual(faces.map(face=>face.file).sort(),Object.keys(FILES).sort());
 const css=readFileSync(root('app/overlay.css'),'utf8');
 for(const face of faces){
  assert.equal(face.weight,FILES[face.file].weight);
  assert.ok(css.includes(fontFaceRule(face)),`${face.file} is declared`);
  assert.ok(STAGED_FONT_ASSETS.includes(`public/assets/${face.file}`),`${face.file} is in TBI's staged copy`);
 }
 // A workspace that never names 600 or 700 never loads them: the default wait is still 400 and 500.
 assert.deepEqual(fontWaits('default').filter(face=>face.family==='Noto Sans Hebrew').map(face=>face.weight),['400','500']);
 assert.deepEqual(familyWeights('Noto Sans Hebrew'),[400,500,600,700]);
 assert.deepEqual(accentTitleWeights({}),[400,500,600,700]);
 assert.deepEqual(accentTitleWeights({hebrew:'David Libre'}),[400,500],'only weights that really ship are offered');
});
