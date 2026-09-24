import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isLayoutId,layoutDefinition,layoutIds,registerDataLayout,registerLayout,unregisterLayout} from '../lib/layout-registry.ts';
import {LayoutDefinitionError,MemoryLayoutDefinitionsRepository,layoutDocumentSha256,layoutMotion,parseLayoutDocument,parseLayoutId,registerPublishedLayouts,resolvedLayoutsFor} from '../lib/layout-definitions.ts';
import {RESPONSE_CARD} from './layout-fixtures.ts';

/** MCP plan L2 (R-L3, R-L5): the stored, versioned definition of a data layout. */
const code=(expected:string)=>(error:unknown)=>error instanceof LayoutDefinitionError&&error.code===expected;

test('a document is validated strictly: unknown fields, a lit translation layer and a card off the frame are refused',()=>{
 assert.deepEqual(parseLayoutDocument(structuredClone(RESPONSE_CARD)),RESPONSE_CARD);
 assert.throws(()=>parseLayoutDocument({...RESPONSE_CARD,colour:'red'}),/unsupported fields: colour/);
 assert.throws(()=>parseLayoutDocument({...RESPONSE_CARD,capabilities:{...RESPONSE_CARD.capabilities,translation:true}}),/translation must be false/);
 assert.throws(()=>parseLayoutDocument({...RESPONSE_CARD,card:{...RESPONSE_CARD.card,frame:{...RESPONSE_CARD.card.frame,insetX:1400}}}),/inside the 1920x1080 frame/);
 assert.throws(()=>parseLayoutDocument({...RESPONSE_CARD,card:{...RESPONSE_CARD.card,fit:{...RESPONSE_CARD.card.fit,floor:12}}}),/floor must be a whole number from 20/);
 assert.throws(()=>parseLayoutDocument({...RESPONSE_CARD,motion:{preset:'spin'}}),/motion.preset must be card-scale, fade/);
 assert.throws(()=>parseLayoutDocument({...RESPONSE_CARD,motion:{tracks:[{element:'textMain',direction:'In',keyframes:[0,2]}],duration:{In:1,Out:.5}}}),/within the In duration/);
 const tracks={tracks:[{element:'baseMain',direction:'In',effect:{effect:'scale',property:'x'},keyframes:[0,.8]}],duration:{In:.8,Out:.4}};
 assert.deepEqual(parseLayoutDocument({...RESPONSE_CARD,motion:tracks}).motion,tracks);
});

test('layout ids follow Companion\'s grammar and the built-in four are never stored',()=>{
 assert.equal(parseLayoutId('response-card'),'response-card');
 assert.throws(()=>parseLayoutId('Response Card'),code('invalid_layout'));
 for(const id of ['bottom','left','right','corner'])assert.throws(()=>parseLayoutId(id),code('built_in_layout'));
 assert.match(readFileSync(fileURLToPath(new URL('../db/layout-definitions.sql',import.meta.url)),'utf8'),/id NOT IN \('bottom', 'left', 'right', 'corner'\)/);
});

test('the sha256 pin ignores key order and moves with any change',()=>{
 const reordered=JSON.parse(JSON.stringify({motion:RESPONSE_CARD.motion,card:RESPONSE_CARD.card,capabilities:RESPONSE_CARD.capabilities,label:RESPONSE_CARD.label}));
 assert.equal(layoutDocumentSha256(reordered),layoutDocumentSha256(RESPONSE_CARD));
 assert.notEqual(layoutDocumentSha256({...RESPONSE_CARD,card:{...RESPONSE_CARD.card,surface:{...RESPONSE_CARD.card.surface,radius:17}}}),layoutDocumentSha256(RESPONSE_CARD));
});

test('editing a published version writes version N+1 as a draft; the published row never changes',async()=>{
 const repository=new MemoryLayoutDefinitionsRepository(),id='fixture-versions';
 try{
  const v1=await repository.saveDraft(id,RESPONSE_CARD,null,'editor',1);
  assert.deepEqual([v1.version,v1.status],[1,'draft']);
  assert.equal(isLayoutId(id),false,'a draft is never registered');
  await assert.rejects(repository.saveDraft(id,RESPONSE_CARD,null,'editor',2),code('version_conflict'),'create twice');
  const edited=await repository.saveDraft(id,{...RESPONSE_CARD,label:'Response'},1,'editor',3);
  assert.deepEqual([edited.version,edited.status,edited.document.label],[1,'draft','Response'],'a draft is rewritten in place');
  const published=await repository.publish(id,1,'publisher',4);
  assert.deepEqual([published.version,published.status],[1,'published']);
  assert.deepEqual(layoutDefinition(id)?.ref,{id,version:1,sha256:published.sha256},'publishing registers the version new graphics pin');
  await assert.rejects(repository.publish(id,1,'publisher',5),code('version_conflict'),'published twice');
  await assert.rejects(repository.saveDraft(id,RESPONSE_CARD,0,'editor',6),code('version_conflict'),'stale version');
  const v2=await repository.saveDraft(id,{...RESPONSE_CARD,label:'Response v2'},1,'editor',7);
  assert.deepEqual([v2.version,v2.status],[2,'draft']);
  const stored=await repository.get(id,1);
  assert.deepEqual([stored?.status,stored?.document.label,stored?.sha256],['published','Response',published.sha256],'version 1 is untouched');
  assert.equal(layoutDefinition(id)?.ref?.version,1,'until 2 is published, graphics keep pinning 1');
  await repository.publish(id,2,'publisher',8);
  assert.equal(layoutDefinition(id)?.ref?.version,2);
  assert.equal(layoutDefinition(id)?.label,'Response v2');
  assert.deepEqual((await repository.list()).map(row=>[row.version,row.status]),[[1,'published'],[2,'published']]);
 }finally{unregisterLayout(id)}
});

test('at load the newest published version of each data layout registers, never a draft, never a built-in',async()=>{
 const repository=new MemoryLayoutDefinitionsRepository(),[a,b]=['fixture-load-a','fixture-load-b'];
 try{
  await repository.saveDraft(a,RESPONSE_CARD,null,'editor',1);await repository.publish(a,1,'editor',2);
  await repository.saveDraft(a,{...RESPONSE_CARD,label:'Newer'},1,'editor',3);
  await repository.saveDraft(b,RESPONSE_CARD,null,'editor',4);
  unregisterLayout(a);
  assert.equal(isLayoutId(a),false);
  const refs=await registerPublishedLayouts(repository);
  assert.deepEqual(refs.map(ref=>[ref.id,ref.version]),[[a,1]]);
  assert.equal(layoutDefinition(a)?.label,'Response card','the draft 2 is not what graphics pin');
  assert.equal(isLayoutId(b),false,'a layout with only a draft is not offered');
  assert.deepEqual(layoutIds().slice(0,4),['bottom','left','right','corner']);
  assert.throws(()=>registerDataLayout({...layoutDefinition('corner')!,id:'corner',ref:{id:'corner',version:1,sha256:'0'.repeat(64)},motion:{preset:'fade'}}),/built in/);
  const plain='fixture-plain';registerLayout({id:plain,label:'Plain',templateLayout:'bottom',contained:true,capabilities:{sets:false,translation:false,oneBlockPerSlide:true}});
  try{assert.throws(()=>registerDataLayout({...layoutDefinition(a)!,id:plain}),/already registered/)}finally{unregisterLayout(plain)}
 }finally{unregisterLayout(a)}
});

test('the envelope resolves each pin at its own version and only when the stored document still hashes to it',async()=>{
 const repository=new MemoryLayoutDefinitionsRepository(),id='fixture-resolve';
 try{
  const v1=await repository.saveDraft(id,RESPONSE_CARD,null,'editor',1);await repository.publish(id,1,'editor',2);
  const v2=await repository.saveDraft(id,{...RESPONSE_CARD,label:'Two'},1,'editor',3);await repository.publish(id,2,'editor',4);
  const draft=await repository.saveDraft(id,{...RESPONSE_CARD,label:'Three'},2,'editor',5);
  const layouts=await resolvedLayoutsFor([{layoutRef:{id,version:1,sha256:v1.sha256}},{},{layoutRef:{id,version:2,sha256:v2.sha256}},{layoutRef:{id,version:1,sha256:v1.sha256}},{layoutRef:{id,version:3,sha256:draft.sha256}},{layoutRef:{id,version:2,sha256:'f'.repeat(64)}}],repository);
  assert.deepEqual(Object.keys(layouts),[`${id}@1`,`${id}@2`],'a draft and a mismatched hash are never carried');
  assert.equal(layouts[`${id}@1`].document.label,'Response card');
  assert.deepEqual({...layouts[`${id}@2`],document:undefined},{id,version:2,sha256:v2.sha256,document:undefined});
 }finally{unregisterLayout(id)}
});

test('motion presets name every part a card animates, and explicit tracks pass through untouched',()=>{
 const scale=layoutMotion({preset:'card-scale'});
 assert.deepEqual(scale.duration,{In:1.2,Out:.5});
 const elements=new Set(scale.animations.map(track=>track.element));
 for(const element of ['baseMain','baseTitle','baseTitleGrad','accentLineBottom','textTitle','accentTextTitle','textMain','textMainheb','textMainEng','Image','logoGroup'])assert.ok(elements.has(element),element);
 for(const track of scale.animations)assert.ok(track.keyframes![1]<=scale.duration[track.direction as 'In'|'Out'],`${track.element} ${track.direction} ends inside its duration`);
 const fade=layoutMotion({preset:'fade'});
 assert.ok(fade.animations.every(track=>track.effect?.effect==='fade'));
 const tracks=[{element:'baseMain',direction:'In',keyframes:[0,.4]}];
 const explicit=layoutMotion({tracks,duration:{In:.4,Out:.2}});
 assert.deepEqual(explicit,{animations:tracks,duration:{In:.4,Out:.2}});
 assert.notEqual(explicit.animations,tracks,'a copy, so a cue never shares the stored document');
});
