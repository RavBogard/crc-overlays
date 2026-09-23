import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=(path:string)=>fileURLToPath(new URL(`../${path}`,import.meta.url));
const css=readFileSync(root('app/overlay.css'),'utf8');

// Od Yavo Shalom carries the Arabic word سلام. The overlay faces have no Arabic letters, so a
// renderer without a system Arabic font (the server fit check's Chromium) drew empty boxes.
test('overlay text stacks fall back to a bundled Arabic face',()=>{
 const face=css.match(/@font-face\{font-family:Noto Sans Arabic;[^}]*\}/)?.[0];
 assert.ok(face,'app/overlay.css declares the Arabic face');
 const file=face!.match(/url\('\/assets\/([^']+)'\)/)?.[1];
 assert.ok(file&&existsSync(root(`public/assets/${file}`)),'the face file ships in public/assets');
 assert.ok(existsSync(root('public/assets/NotoSansArabic-OFL.txt')),'with its licence');
 assert.match(face!,/unicode-range:U\+0600-06FF/,'and loads only for Arabic text');
 for(const selector of ['.overlay{','.overlay .prayer{','.overlay .hebrew,.overlay .row-hebrew,.overlay .title-accent{','.row-transliteration{','.row-translation{']){
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const stacks=[...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${escaped}[^}]*?(font-family:[^;}]*)`,'g'))].map(match=>match[1]);
  assert.ok(stacks.length,`${selector} declares a font stack`);
  for(const stack of stacks)assert.match(stack!,/Noto Sans Arabic/,`${selector} falls back to the Arabic face`);
 }
});
