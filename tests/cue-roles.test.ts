import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {GET} from '../app/api/catalog/route.ts';
import {catalog} from '../lib/server.ts';
import {cueRoleIndex,cueRoleRegister} from '../lib/cue-roles.ts';
import {cueSetId,deckCueRoles} from '../lib/companion-deck/cue-roles.ts';
import {PALETTE as DECK_PALETTE,roleColour} from '../lib/companion-deck/model.ts';
import {PALETTE,ROLE_COLOURS} from '../lib/companion-deck/palette.ts';
import {CUE_ROLES_PATH,buildCueRoles,formatCueRoles} from '../scripts/build-cue-roles.mjs';
import {PALETTE_COPY,PALETTE_SOURCE,paletteCopy} from '../companion/scripts/write-palette.mjs';
import * as released from '../companion/tests/fixtures/released-1.7.0/parse.ts';

const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/planning/2026-09-23-overlay-consistency/companion/CUE-MANIFEST.json'),'utf8')) as {bindings:{cueId:string;draftName:string}[]};
const cueNamed=(name:string)=>manifest.bindings.find(binding=>binding.draftName===name)!.cueId;

const prior={...process.env};
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)});
function rehearsal(){
 process.env.CRC_AUTHORING_REHEARSAL='1';Object.assign(process.env,{NODE_ENV:'development'});delete process.env.RELAY_URL;
 process.env.CONTROL_KEY='c'.repeat(43);process.env.OUTPUT_KEY='o'.repeat(43);
}
const request=(url:string)=>new Request(url,{headers:{authorization:`Bearer ${process.env.OUTPUT_KEY}`}});

test('content/cue-roles.json is the deck model\'s roles, regenerated from the seed deck',()=>{
 assert.equal(fs.readFileSync(CUE_ROLES_PATH,'utf8').replace(/\r\n/g,'\n'),formatCueRoles(buildCueRoles()),'stale: run node scripts/build-cue-roles.mjs');
 const {cues}=buildCueRoles();
 assert.equal(Object.keys(cues).length,235,'every cue the deck binds');
 assert.equal(cueRoleRegister().size,235,'and the reader trusts every committed entry');
});

test('one role per cue: its first binding that is not an alternate, in page order',()=>{
 const {cues}=buildCueRoles();
 // Aleinu is a set on Friday and an alternate elsewhere; Hareini a single and an alternate.
 assert.deepEqual(cues[cueNamed('Aleinu 1')],{role:'sequence-part',set:{id:'aleinu',name:'Aleinu',index:1,count:4}});
 assert.equal(cues[cueNamed('Hareini')].role,'single');
 assert.deepEqual(cues[cueNamed('Mourners Kaddish 2')],{role:'sequence-part',set:{id:'mourners-kaddish',name:"Mourner's Kaddish",index:2,count:2}});
 assert.equal(cues[cueNamed('Mi Chamocha (Friday) 1')].set?.id,'mi-chamocha-fri','the lower page wins between two sets');
 assert.equal(cueSetId('Mi Chamocha (HHD evening)'),'mi-chamocha-hhd-evening');
});

test('two differently named sets that would share an id are refused',()=>{
 const button=(name:string,cueId:string)=>({row:0,col:0,spec:{kind:'cue' as const,cueId,label:'x',role:'sequence-part' as const,sequence:{name,index:1,count:1}}});
 const deck={pages:[{number:1,id:'p',name:'P',template:'t',buttons:[button("Mourner's Kaddish",'a'),button('Mourners Kaddish','b')]}]};
 assert.throws(()=>deckCueRoles(deck as never),/share the id mourners-kaddish/);
});

test('the index names only catalog cues, in catalog order, and a bad register is no roles rather than an outage',()=>{
 const a='c2d2c129-7d7d-4bbc-a296-46cc1fb9f48e',b='f15c1944-da76-4d61-95c8-05c032d47c4d';
 const register=cueRoleRegister(()=>({cues:{
  [a]:{role:'sequence-part',set:{id:'k',name:'K',index:1,count:2}},
  [b]:{role:'single'},
  'not-a-uuid':{role:'single'},
  '75ff6cbd-86f3-49ea-a007-77686ec3eaa4':{role:'headline'},
  'bbd7c98b-f1de-41ee-9719-2bb27a30d0db':{role:'single',set:{id:'k',name:'<b>',index:1,count:2}},
 }}));
 assert.deepEqual([...register.keys()],[a,b]);
 assert.deepEqual(cueRoleIndex([{id:b},{id:'efa9fad4-f7d5-4091-a708-82103028861b'},{id:a}],register),[{cueId:b,role:'single'},{cueId:a,role:'sequence-part',set:{id:'k',name:'K',index:1,count:2}}]);
 const warn=console.warn;console.warn=()=>{};
 try{assert.equal(cueRoleRegister(()=>{throw new Error('unreadable')}).size,0)}finally{console.warn=warn}
});

test('include=slots carries roles in a key of its own, and the released 1.7.0 module still validates it',async()=>{
 rehearsal();
 const current=await catalog();
 const response=await GET(request('http://localhost/api/catalog?include=slots'));
 assert.equal(response.status,200);
 assert.equal(response.headers.get('x-crc-catalog-version'),current.version);
 const body=await response.json();
 assert.deepEqual(Object.keys(body),['version','cues','slots','roles']);
 assert.deepEqual(body.roles,cueRoleIndex(current.cues));
 assert.ok(body.roles.length>0,'the rehearsal catalog carries cues the deck binds');
 const ids=current.cues.map(cue=>cue.id);
 assert.deepEqual(body.roles.map((entry:{cueId:string})=>entry.cueId),ids.filter(id=>cueRoleRegister().has(id)),'catalog cues only, in catalog order');
 // The frozen 1.7.0 parse path: the same cues and slots with or without the new key.
 const parsed=released.parseCatalogBody(body);
 const store=new released.CatalogStore([{id:'efa9fad4-f7d5-4091-a708-82103028861b',name:'Barechu',layout:'bottom'}]);
 assert.equal(store.replace(parsed.cues,parsed.slots),true);
 const withoutRoles={...body};delete withoutRoles.roles;
 const before=new released.CatalogStore([{id:'efa9fad4-f7d5-4091-a708-82103028861b',name:'Barechu',layout:'bottom'}]);
 const old=released.parseCatalogBody(withoutRoles);
 assert.equal(before.replace(old.cues,old.slots),true);
 assert.deepEqual(store.cues,before.cues);
 assert.deepEqual(store.slots,before.slots);
 // The default response is untouched: still the bare array.
 assert.equal(await (await GET(request('http://localhost/api/catalog'))).text(),JSON.stringify(current.cues));
});

test('one palette: the deck model re-exports it and the module carries an exact copy',()=>{
 assert.equal(DECK_PALETTE,PALETTE);
 assert.equal(roleColour(PALETTE,{role:'alternate',sequence:{}}),PALETTE.teal);
 for(const [role,name] of Object.entries(ROLE_COLOURS))assert.equal(roleColour(PALETTE,{role:role as keyof typeof ROLE_COLOURS}),PALETTE[name]);
 assert.equal(fs.readFileSync(PALETTE_COPY,'utf8').replace(/\r\n/g,'\n'),paletteCopy(fs.readFileSync(PALETTE_SOURCE,'utf8')),'stale: run npm run build in companion/');
});
