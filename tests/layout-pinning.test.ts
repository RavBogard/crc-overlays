import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {baselineCues,buildCue,cueHash,sourcePinFor,type AuthoringCue,type Draft,type EditableDraft} from '../lib/authoring-model.ts';
import {MemoryAuthoringRepository,createAuthoringService,authoringOperation,type Revision} from '../lib/authoring.ts';
import {layoutDefinitionsRepository,layoutMotion,MemoryLayoutDefinitionsRepository,withResolvedLayouts} from '../lib/layout-definitions.ts';
import {cardStyle,layoutDefinition,layoutRefKey,resolveCueLayout,unregisterLayout,type ResolvedLayouts} from '../lib/layout-registry.ts';
import {Player,type Cue} from '../lib/player.ts';
import {composeAuthoringCatalog} from '../lib/server.ts';
import {syncLiveCatalog} from '../lib/sync-live-catalog.ts';
import {GET} from '../app/api/catalog/route.ts';
import {RehearsalRoom} from '../scripts/rehearsal-relay.ts';
import {parseCatalog} from '../relay/src/protocol.ts';
import {fixtureCues,fixtureHashes} from './cue-hash-fixtures.ts';
import {RESPONSE_CARD} from './layout-fixtures.ts';

/**
 * MCP plan L2 (R-L3, R-L5): a published graphic in a data layout pins layoutRef{id,version,sha256}
 * inside its cue and cueHash, the catalog and relay carry the pinned definitions beside the cues,
 * and nothing about a built-in graphic moves.
 */

const measurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:'test-renderer',measuredAt:Date.now()} as const;
const bottomTemplates=baselineCues.filter(cue=>cue.layout==='bottom'&&!cue.hidden);
const draftOf=(editable:EditableDraft,id:string):Draft=>({...editable,id,version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:0,updatedAt:0,createdBy:'t',updatedBy:'t'});
const custom=(layout:string,templateCueId=bottomTemplates[0].id):EditableDraft=>({name:'Response',title:'Response',layout,templateCueId,content:{mode:'custom',text:'Vaimru Amen'},presentation:{}});

/* ------------------------------------------------------ built-in hashes --- */

test('every built-in published cue keeps the exact hash it had before L2',()=>{
 const recorded=JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/cue-hashes.json',import.meta.url)),'utf8'));
 assert.ok(Object.keys(recorded.cues).length>=30,'the fixture covers the importable baseline and a custom graphic per built-in layout');
 assert.deepEqual(fixtureHashes(),recorded);
 for(const cue of fixtureCues())assert.equal('layoutRef' in cue,false,`${cue.id} (${cue.layout}) carries no pin: a built-in layout is pinned by the code release, as before`);
});

test('a built-in cue renders from the registry whatever envelope it arrives in',()=>{
 for(const layout of ['bottom','left','right','corner'])assert.equal(resolveCueLayout({layout},{'x@1':{id:'x',version:1,sha256:'0'.repeat(64),document:RESPONSE_CARD}}),layoutDefinition(layout));
});

/* --------------------------------------------------------- data layouts --- */

async function publishedLayout(id:string,repository=new MemoryLayoutDefinitionsRepository()){
 const draft=await repository.saveDraft(id,RESPONSE_CARD,null,'editor',1);
 return {repository,row:await repository.publish(id,draft.version,'editor',2)};
}

test('a data-layout cue pins its definition inside cueHash and takes the definition\'s motion, not its template\'s',async()=>{
 const id='fixture-pin';
 try{
  const {row}=await publishedLayout(id);
  const cue=buildCue(draftOf(custom(id),'pin-1'));
  assert.deepEqual(cue.layoutRef,{id,version:1,sha256:row.sha256});
  assert.equal(Object.keys(cue).indexOf('layoutRef'),Object.keys(cue).indexOf('layout')+1,'the pin sits beside the layout it qualifies');
  const motion=layoutMotion(RESPONSE_CARD.motion);
  assert.deepEqual(cue.animations,motion.animations);
  assert.deepEqual(cue.duration,motion.duration);
  assert.equal('template' in cue,false,'no template block is cloned');
  // Another template cue changes nothing: buildCue no longer clones baseline motion for this layout.
  const other=bottomTemplates.find(template=>JSON.stringify(template.animations)!==JSON.stringify(bottomTemplates[0].animations))??bottomTemplates[1];
  const again=buildCue(draftOf(custom(id,other.id),'pin-1'));
  assert.deepEqual([again.animations,again.duration],[cue.animations,cue.duration]);
  // The pin is part of the hash: the same cue pinned to other bytes is a different cue.
  assert.notEqual(cueHash({...cue,layoutRef:{...cue.layoutRef!,sha256:'0'.repeat(64)}}),cueHash(cue));
 }finally{unregisterLayout(id)}
});

async function publishThrough(service:ReturnType<typeof createAuthoringService>,draft:Draft){
 const preview=await service.operation('preview_draft',{draftId:draft.id,expectedVersion:draft.version},'tester') as {previewId:string};
 await service.operation('review_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
 return (await service.operation('publish_draft',{draftId:draft.id,expectedVersion:draft.version,previewId:preview.previewId},'publisher') as {revision:Revision}).revision;
}

test('editing a definition never changes a published cue until it is republished',async()=>{
 const id='fixture-edit';
 try{
  const {repository,row:v1}=await publishedLayout(id);
  const service=createAuthoringService(new MemoryAuthoringRepository());
  const created=(await service.operation('create_draft',custom(id),'tester') as {draft:Draft}).draft;
  const first=await publishThrough(service,created);
  const pinned=first.cue as AuthoringCue;
  assert.deepEqual(pinned.layoutRef,{id,version:1,sha256:v1.sha256});
  const hash=first.cueHash;assert.equal(hash,cueHash(pinned));
  const envelope=async()=>withResolvedLayouts(composeAuthoringCatalog([],await service.publishedCues()),repository);

  // Edit: a draft version 2, then publish it. The published graphic does not move.
  const edited={...RESPONSE_CARD,card:{...RESPONSE_CARD.card,surface:{...RESPONSE_CARD.card.surface,radius:4}}};
  await repository.saveDraft(id,edited,1,'editor',3);
  assert.deepEqual((await service.publishedCues())[0],pinned,'a draft definition changes nothing');
  const v2=await repository.publish(id,2,'editor',4);
  assert.notEqual(v2.sha256,v1.sha256);
  const live=await service.publishedCues();
  assert.deepEqual(live[0],pinned,'the published cue is byte-for-byte the one that was reviewed');
  assert.equal(cueHash(live[0] as AuthoringCue),hash);
  const before=await envelope();
  assert.deepEqual(Object.keys(before.layouts!),[`${id}@1`],'the catalog carries the pinned version, not the newest');
  assert.equal(before.layouts![`${id}@1`].document.card.surface.radius,RESPONSE_CARD.card.surface.radius);

  // Republish: a new draft version is rebuilt against the newest published definition.
  const updated=(await service.operation('update_draft',{draftId:created.id,expectedVersion:created.version,patch:{title:'Response '}},'tester') as {draft:Draft}).draft;
  const second=await publishThrough(service,updated);
  assert.deepEqual((second.cue as AuthoringCue).layoutRef,{id,version:2,sha256:v2.sha256});
  const after=await envelope();
  assert.deepEqual(Object.keys(after.layouts!),[`${id}@2`]);
  assert.equal(after.layouts![`${id}@2`].document.card.surface.radius,4);
  assert.notEqual(after.version,before.version,'republishing moves the catalog version, as any publish does');
 }finally{unregisterLayout(id)}
});

/* -------------------------------------------------------------- envelope --- */

const prior={...process.env};
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)});
function rehearsal(){
 process.env.CRC_AUTHORING_REHEARSAL='1';Object.assign(process.env,{NODE_ENV:'development'});delete process.env.RELAY_URL;
 process.env.CONTROL_KEY='c'.repeat(43);process.env.OUTPUT_KEY='o'.repeat(43);
}
const get=(url:string)=>GET(new Request(url,{headers:{authorization:`Bearer ${process.env.OUTPUT_KEY}`}}));

// The catalog check of an output page older than this release, verbatim from app/output/page.tsx
// at fe5e87e. Such a page asks for the bare array, validates every cue field by field and ignores
// any field it does not know.
const oldValidCatalog=(next:unknown):next is Cue[]=>Array.isArray(next)&&next.every(item=>{const c=item as Partial<Cue>|null;return Boolean(c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.layout==='string'&&c.texts&&typeof c.texts==='object'&&Array.isArray(c.animations)&&c.duration&&typeof c.duration==='object')});

test('the route: the bare array is unchanged for older output pages, and ?include=layouts carries the pinned definitions',async()=>{
 rehearsal();
 const id='fixture-route';
 const repository=layoutDefinitionsRepository();
 try{
  const bareBefore=await (await get('http://localhost/api/catalog')).json();
  assert.deepEqual(await (await get('http://localhost/api/catalog?include=layouts')).json(),{version:(await get('http://localhost/api/catalog')).headers.get('X-CRC-Catalog-Version'),cues:bareBefore,layouts:{}});

  const draft=await repository.saveDraft(id,RESPONSE_CARD,null,'editor',1);const row=await repository.publish(id,draft.version,'editor',2);
  const created=(await authoringOperation('create_draft',custom(id),'tester') as {draft:Draft}).draft;
  const preview=await authoringOperation('preview_draft',{draftId:created.id,expectedVersion:created.version},'tester') as {previewId:string};
  await authoringOperation('review_draft',{draftId:created.id,expectedVersion:created.version,previewId:preview.previewId,browserMeasurement:measurement,humanApproved:true},'reviewer');
  await authoringOperation('publish_draft',{draftId:created.id,expectedVersion:created.version,previewId:preview.previewId},'publisher');

  const bare=await (await get('http://localhost/api/catalog')).json() as Cue[];
  assert.ok(Array.isArray(bare),'the default response is still a bare Cue[]');
  assert.ok(oldValidCatalog(bare),'an old output page accepts the whole catalog, data-layout cue included');
  const builtIn=bare.filter(cue=>!cue.layoutRef);
  assert.deepEqual(builtIn,bareBefore,'every built-in cue it renders is byte-for-byte what it received before');
  assert.equal(bare.filter(cue=>cue.layoutRef).length,1);

  const envelope=await (await get('http://localhost/api/catalog?include=layouts')).json() as {version:string;cues:Cue[];layouts:ResolvedLayouts};
  assert.deepEqual(envelope.cues,bare);
  assert.equal(oldValidCatalog(envelope),false,'the envelope is opt-in: an old page never asks for it');
  assert.deepEqual(envelope.layouts,{[`${id}@1`]:{id,version:1,sha256:row.sha256,document:RESPONSE_CARD}});
 }finally{unregisterLayout(id)}
});

test('the sync hands the relay the envelope, and the relay stores and returns layouts beside the cues',async()=>{
 const cues=[{id:'cue-one',name:'One',layout:'bottom'},{id:'cue-data',name:'Response',layout:'fixture-relay',layoutRef:{id:'fixture-relay',version:1,sha256:'a'.repeat(64)}}];
 const layouts={'fixture-relay@1':{id:'fixture-relay',version:1,sha256:'a'.repeat(64),document:RESPONSE_CARD}};
 const writes:Record<string,unknown>[]=[];
 await syncLiveCatalog({readRelay:async()=>({version:'v0',cues:[]}),readAuthoring:async()=>({version:'v1',cues:cues as Cue[],layouts}),writeRelay:async(_path,body)=>{writes.push(body as Record<string,unknown>);return Response.json({ok:true})}});
 assert.deepEqual(writes,[{version:'v1',cues,layouts,expectedVersion:'v0'}]);

 const room=new RehearsalRoom();
 const [,created]=room.initialize({state:{revision:0,cue:null,mode:'animate',updated:1,cuePayload:null},catalogVersion:'v0',cues:[cues[0]]});
 assert.equal(created,201);
 assert.equal('layouts' in room.catalog!,false,'a catalog without data layouts stores exactly what it did');
 assert.deepEqual(room.approvedCatalog(writes[0]),[{ok:true,version:'v1'},200]);
 assert.deepEqual(room.catalog,{version:'v1',cues,layouts});
 assert.equal(parseCatalog({version:'v2',cues,layouts:{'fixture-relay@2':layouts['fixture-relay@1']}}),null,'a key must name its own entry');
});

/* -------------------------------------------------------------- renderer --- */

// Just enough DOM for Player.render and applyFit (a compact form of tests/corner-layout.test.ts's).
class FakeElement{
 tagName:string;className='';dataset:Record<string,string>={};textContent='';children:FakeElement[]=[];src='';alt='';
 style:{fontSize:string;visibility?:string;properties:Record<string,string>;setProperty(name:string,value:string):void}={fontSize:'',properties:{},setProperty(name,value){this.properties[name]=value}};
 constructor(tag:string){this.tagName=tag}
 get classes(){return this.className.split(/\s+/).filter(Boolean)}
 get classList(){return {contains:(name:string)=>this.classes.includes(name)}}
 get clientWidth(){return 1000}get clientHeight(){return 1000}get scrollWidth(){return 10}get scrollHeight(){return 10}
 appendChild(child:FakeElement){this.children.push(child);return child}
 replaceChildren(...children:FakeElement[]){this.children=children}
 get all():FakeElement[]{return this.children.flatMap(child=>[child,...child.all])}
 matches(selector:string){return selector.split(',').some(part=>{const [positive,negative]=part.trim().split(':not(');const wanted=positive.split('.').filter(Boolean);const excluded=negative?negative.replace(')','').split('.').filter(Boolean):[];return wanted.every(name=>this.classes.includes(name))&&!excluded.some(name=>this.classes.includes(name))})}
 querySelectorAll(selector:string){return this.all.filter(element=>element.matches(selector))}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null}
 getAnimations(){return []}
 get childElementCount(){return this.children.length}
}
class FakeImage extends FakeElement{}
const globals=globalThis as unknown as Record<string,unknown>;
globals.HTMLImageElement=FakeImage;
globals.document={createElement:(tag:string)=>tag==='img'?new FakeImage(tag):new FakeElement(tag)};
globals.getComputedStyle=(element:FakeElement)=>({fontSize:element.style.fontSize||'32px'});

test('the Player renders a data-layout cue from the envelope\'s pinned definition through the card path',()=>{
 // No registry entry anywhere in this process: the output page knows the layout only from the envelope.
 const id='fixture-render';assert.equal(layoutDefinition(id),undefined);
 const ref={id,version:3,sha256:'b'.repeat(64)};
 const layouts:ResolvedLayouts={[layoutRefKey(ref)]:{...ref,document:RESPONSE_CARD}};
 const cue:Cue={id:'data-cue',name:'Response',layout:id,layoutRef:ref,texts:{textTitle:'Response',textMainheb:'וְאִמְרוּ אָמֵן',textMainEng:'Vaimru Amen'},...layoutMotion(RESPONSE_CARD.motion)};
 const root=new FakeElement('div');
 const box=new Player(root as unknown as HTMLElement,[cue],undefined,{layouts}).render(cue) as unknown as FakeElement;
 assert.equal(box.className,'overlay','the author\'s id is never a class');
 assert.equal(box.dataset.layout,id);
 assert.equal(box.dataset.card,id,'drawn by the generic card block');
 assert.equal('contain' in box.dataset,true,'the fit check holds it to its card');
 for(const [name,value] of Object.entries(cardStyle(RESPONSE_CARD.card)))assert.equal(box.style.properties[name],value,`the box carries ${name}`);
 assert.equal(box.style.properties['--card-base-top'],'48px','anchored top-right, as the definition says');
 assert.equal(box.dataset.fit,'fit','the definition\'s fit strategy ran');
 assert.deepEqual(box.children.map(child=>child.dataset.element),['baseMain','baseTitle','baseTitleGrad','accentLineBottom','textTitle','textMainEng','textMainheb','Image']);

 // A pin the envelope no longer holds (an output page opened after a republish) degrades to the newest version it has.
 const newer={id,version:4,sha256:'c'.repeat(64)};
 const moved={...RESPONSE_CARD,card:{...RESPONSE_CARD.card,frame:{...RESPONSE_CARD.card.frame,anchor:'top-left' as const}}};
 const degraded=new Player(new FakeElement('div') as unknown as HTMLElement,[cue],undefined,{layouts:{[layoutRefKey(newer)]:{...newer,document:moved}}}).render(cue) as unknown as FakeElement;
 assert.equal(degraded.style.properties['--card-base-left'],'48px');
 // With no definition at all it still draws its parts rather than failing the cue.
 const bare=new Player(new FakeElement('div') as unknown as HTMLElement,[cue]).render(cue) as unknown as FakeElement;
 assert.equal(bare.className,'overlay');assert.equal('card' in bare.dataset,false);
});
