import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {FONT_FACES,STAGED_FONT_ASSETS,fontFaceRule,fontWaits} from '../lib/font-registry.ts';
import {waitForOverlayFonts} from '../lib/overlay-assets.ts';

const root=(path:string)=>fileURLToPath(new URL(`../${path}`,import.meta.url));

// Every stylesheet under app/, so a face declared in a new sheet is caught too.
const sheets=(readdirSync(root('app'),{recursive:true}) as string[]).map(path=>path.replaceAll('\\','/')).filter(path=>path.endsWith('.css')).map(path=>`app/${path}`);

// One @font-face rule in the registry's one-line form: comments and whitespace dropped, family unquoted.
const canonical=(rule:string)=>`@font-face{${rule.slice(rule.indexOf('{')+1,rule.lastIndexOf('}')).split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const colon=part.indexOf(':'),name=part.slice(0,colon).trim().toLowerCase(),value=part.slice(colon+1).trim().replace(/\s+/g,' ');return `${name}:${name==='font-family'?value.replace(/^(['"])(.*)\1$/,'$2'):value}`}).join(';')}}`;
const declared=(path:string)=>[...readFileSync(root(path),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/@font-face\s*\{[^}]*\}/g)].map(match=>canonical(match[0]));

test('each stylesheet declares exactly the registry faces assigned to it',()=>{
 assert.ok(sheets.includes('app/overlay.css')&&sheets.includes('app/overlay-faces.css')&&sheets.includes('app/globals.css'));
 for(const sheet of sheets)assert.deepEqual(declared(sheet).sort(),FONT_FACES.filter(face=>face.stylesheet===sheet).map(fontFaceRule).sort(),`${sheet} @font-face rules match lib/font-registry.ts`);
 for(const face of FONT_FACES)assert.ok(sheets.includes(face.stylesheet),`${face.stylesheet} exists`);
});

test('waitForOverlayFonts loads exactly the registry wait targets',async()=>{
 const calls:string[]=[];
 (globalThis as unknown as {document:unknown}).document={fonts:{load:async(spec:string)=>{calls.push(spec);return []},ready:Promise.resolve(),check:()=>true}};
 await waitForOverlayFonts(undefined,'book');
 const expected=[...fontWaits('default'),...fontWaits('book')].map(({family,weight})=>`${weight} 40px "${family}"`);
 assert.deepEqual(calls,expected);
 // And every target is a declared face at a weight it serves.
 for(const {family,weight} of [...fontWaits('default'),...fontWaits('book')])assert.ok(FONT_FACES.some(face=>face.family===family&&face.weight?.split(' ').includes(weight)),`${weight} ${family} is declared`);
});

test('the TBI staging allowlist is exactly the font files and licences the registry names',()=>{
 const files=new Set(sheets.flatMap(sheet=>declared(sheet)).map(rule=>rule.match(/url\('\/assets\/([^']+)'\)/)![1]));
 const licences=new Set(FONT_FACES.flatMap(face=>face.licence?[face.licence]:[]));
 assert.deepEqual([...STAGED_FONT_ASSETS].sort(),[...new Set([...files,...licences])].map(file=>`public/assets/${file}`).sort());
 for(const file of STAGED_FONT_ASSETS)assert.ok(existsSync(root(file)),`${file} exists`);
 // The script names no font file of its own: the registry is its only source.
 const staging=readFileSync(root('scripts/stage-workspace-source.mjs'),'utf8');
 assert.doesNotMatch(staging,/public\/assets\//,'stage-workspace-source.mjs hard-codes no public/assets path');
});
