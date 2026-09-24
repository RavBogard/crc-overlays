import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {AuthInfo} from '@modelcontextprotocol/server';
import baseline from '../lib/cues.json';
import {Player,type Cue} from '../lib/player.ts';
import {branding as crcBranding,overlayBrandingFromWorkspace} from '../lib/branding.ts';
import {BRANDING_COLOR_KEYS,brandedWorkspace,brandingCssVariables,brandingFontChoices,defaultPalette,hexRgba,parseBrandingDocument,resolveBranding} from '../lib/branding-palette.ts';
import {MemoryWorkspaceBrandingRepository,PgWorkspaceBrandingRepository,currentBranding,publicWorkspaceWithBranding} from '../lib/branding-store.ts';
import {brandingToolOperation,overlayBrandingFor,type BrandingFit,type BrandingToolContext} from '../lib/branding-tools.ts';
import {MemoryAssetRepository,type AssetRecord} from '../lib/assets.ts';
import {getPublicWorkspace} from '../lib/workspace.ts';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {AuthoringError} from '../lib/authoring-model.ts';
import {BrandingError} from '../lib/branding-store.ts';

// Packet L4 (R-B2): workspace branding as data. With nothing stored, both workspaces render the
// values they rendered before; TBI's accent now reaches the medallion ring.
const css=readFileSync(fileURLToPath(new URL('../app/overlay.css',import.meta.url)),'utf8');
const CRC=getPublicWorkspace({WORKSPACE_ID:'crc'}),TBI=getPublicWorkspace({WORKSPACE_ID:'temple-bnai-israel-kalamazoo'});

// What the renderer set before L4 (the four lib/player.ts properties) and what app/overlay.css drew.
const TODAY={
 '--crc-ring':'rgba(217,166,46,.9)','--crc-paper':'#f8f5ec','--crc-base':'rgba(248,245,236,.97)','--crc-ink':'#11283a',
 '--crc-title-ink':'#ffffff','--crc-accent-title':'#8fe7e2','--crc-translation-ink':'#385365',
};

test('with no stored branding CRC gets exactly the values it rendered before',()=>{
 assert.deepEqual(brandingCssVariables(crcBranding),{'--crc-blue':'#07345f','--crc-blue-deep':'#07345f','--crc-turquoise':'#09bfc2','--crc-gold':'#d9a62e',...TODAY});
 assert.deepEqual(brandingCssVariables(overlayBrandingFromWorkspace(CRC)),brandingCssVariables(crcBranding));
 // The renderer's branding object itself is unchanged: no palette or fonts appear without stored branding.
 assert.deepEqual(overlayBrandingFromWorkspace(CRC),crcBranding);
});

test('with no stored branding TBI keeps its identity and the overlay literals, and its accent reaches the medallion ring',()=>{
 const variables=brandingCssVariables(overlayBrandingFromWorkspace(TBI));
 assert.deepEqual(variables,{'--crc-blue':'#183646','--crc-blue-deep':'#183646','--crc-turquoise':'#2b5672','--crc-gold':'#e55c5e',...TODAY,'--crc-ring':'rgba(229,92,94,.9)'});
 assert.equal(variables['--crc-ring'],hexRgba(TBI.colors.accent,.9));
});

test('every overlay.css branding variable falls back to the literal the renderer now sets by default',()=>{
 const fallbacks=new Map([...css.matchAll(/var\((--crc-[a-z-]+),([^()]*(?:\([^()]*\))?)\)/g)].map(match=>[match[1],match[2]]));
 const normal=(value:string)=>value==='#fff'?'#ffffff':value;
 for(const [name,value] of Object.entries(TODAY)){
  // Paper and ink were already variables, declared on .overlay; the rest fall back in place.
  if(name==='--crc-paper'||name==='--crc-ink')assert.match(css,new RegExp(String.raw`\.overlay\{position:absolute;inset:0;[^}]*${name}:${value}`),name);
  else assert.equal(normal(fallbacks.get(name)??''),value,`${name} falls back to today's literal`);
 }
 // The medallion ring is the one that moved from a literal to the accent-derived variable.
 assert.match(css,/\.logo\{[^}]*border:3px solid var\(--crc-ring,rgba\(217,166,46,\.9\)\)/);
 assert.doesNotMatch(css,/\.row-translation\{[^}]*#385365;/);
 // Font roles fall back to the stylesheet's own faces.
 assert.match(css,/\.overlay \.hebrew,\.overlay \.row-hebrew,\.overlay \.title-accent\{font-family:var\(--crc-font-hebrew,Noto Sans Hebrew\),Noto Sans Arabic/);
 assert.match(css,/\.overlay \.prayer\{font-family:var\(--crc-font-latin,WorkRefresh\),Noto Sans Arabic/);
});

/* ------------------------------------------------------------ renderer --- */
class FakeElement{
 tagName:string;className='';dataset:Record<string,string>={};textContent='';children:FakeElement[]=[];src='';alt='';
 style:{fontSize:string;height:string;visibility?:string;properties:Record<string,string>;setProperty(name:string,value:string):void}={fontSize:'',height:'',properties:{},setProperty(name,value){this.properties[name]=value}};
 constructor(tag:string){this.tagName=tag}
 get classes(){return this.className.split(/\s+/).filter(Boolean)}
 get clientWidth(){return 1920}get clientHeight(){return 1080}get scrollWidth(){return 10}get scrollHeight(){return 10}
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
globals.getComputedStyle=()=>({fontSize:'40px'});
const cues=baseline as unknown as Cue[];
const bottom=cues.find(cue=>cue.layout==='bottom'&&!(cue as {hidden?:boolean}).hidden)!;
const render=(branding=crcBranding)=>new Player(new FakeElement('div') as unknown as HTMLElement,[bottom],branding).render(bottom) as unknown as FakeElement;

test('the renderer sets every branding variable on the overlay box: CRC as before, TBI with its accent on the ring',()=>{
 const crc=render();
 for(const [name,value] of Object.entries(brandingCssVariables(crcBranding)))assert.equal(crc.style.properties[name],value,name);
 assert.equal(crc.style.properties['--crc-ring'],'rgba(217,166,46,.9)');
 assert.equal('--crc-font-latin' in crc.style.properties,false,'no font role is set without stored branding');
 const tbi=render(overlayBrandingFromWorkspace(TBI));
 assert.equal(tbi.style.properties['--crc-ring'],'rgba(229,92,94,.9)','TBI accent reaches the medallion ring');
 assert.equal(tbi.style.properties['--crc-gold'],'#e55c5e');
 const logo=tbi.children.find(child=>child.classes.includes('logo'))!;
 assert.equal(logo.src,TBI.logo.src);
});

test('stored branding reaches the renderer through the public workspace',()=>{
 const resolved=resolveBranding(TBI,{version:3,document:{colors:{ring:'#123456',paper:'#fefefe',translationInk:'#222222'},fonts:{hebrew:'Noto Sans Hebrew'},artwork:{logo:{assetId:`asset_${'a'.repeat(64)}`,alt:'Tree of life'}}}});
 const served=JSON.parse(JSON.stringify(brandedWorkspace(TBI,resolved)));
 assert.equal(served.logo.src,`/api/assets/asset_${'a'.repeat(64)}/content`);
 const box=render(overlayBrandingFromWorkspace(served));
 assert.equal(box.style.properties['--crc-ring'],'rgba(18,52,86,.9)');
 assert.equal(box.style.properties['--crc-base'],'rgba(254,254,254,.97)');
 assert.equal(box.style.properties['--crc-translation-ink'],'#222222');
 assert.equal(box.style.properties['--crc-font-hebrew'],'"Noto Sans Hebrew"');
 assert.equal(box.children.find(child=>child.classes.includes('logo'))!.alt,'Tree of life');
 // Nothing stored: the public workspace is returned as it is.
 assert.equal(brandedWorkspace(CRC,resolveBranding(CRC,null)),CRC);
});

test('a stored accent moves the ring with it unless the ring is set on its own',()=>{
 assert.equal(resolveBranding(CRC,{version:1,document:{colors:{accent:'#aa0000'}}}).palette.ring,'#aa0000');
 assert.equal(resolveBranding(CRC,{version:1,document:{colors:{accent:'#aa0000',ring:'#00aa00'}}}).palette.ring,'#00aa00');
 assert.deepEqual(resolveBranding(CRC,null).palette,defaultPalette(CRC.colors));
});

test('branding documents are parsed strictly, in sentences',()=>{
 assert.throws(()=>parseBrandingDocument({colours:{}}),/does not take colours/);
 assert.throws(()=>parseBrandingDocument({colors:{gold:'#ffffff'}}),/no colour called gold/);
 assert.throws(()=>parseBrandingDocument({colors:{ink:'red'}}),/six-digit hex/);
 assert.throws(()=>parseBrandingDocument({fonts:{latin:'Comic Sans'}}),/installed overlay fonts/);
 assert.throws(()=>parseBrandingDocument({artwork:{logo:{assetId:'nope',alt:'x'}}}),/asset id/);
 assert.deepEqual(parseBrandingDocument({colors:{ink:'#ABCDEF'}}),{colors:{ink:'#abcdef'}});
 assert.deepEqual(brandingFontChoices(false),['Noto Sans Hebrew','WorkRefresh']);
 assert.deepEqual(brandingFontChoices(true),['Noto Sans Hebrew','WorkRefresh','David Libre','Frank Ruhl Libre']);
});

/* --------------------------------------------------------------- store --- */
test('a missing workspace_branding table reads as nothing stored and refuses writes in a sentence',async()=>{
 const missing={query:async()=>{throw Object.assign(new Error('relation does not exist'),{code:'42P01'})}};
 const repo=new PgWorkspaceBrandingRepository('crc',missing);
 assert.equal(await repo.get(),null);
 await assert.rejects(repo.put({colors:{ink:'#000000'}},0,'someone',1),(error:unknown)=>error instanceof BrandingError&&/can't be saved yet/.test(error.message)&&/Nothing was changed/.test(error.message));
 // /api/workspace still serves the built-in identity.
 assert.equal(await publicWorkspaceWithBranding(CRC,repo),CRC);
 const failing={get:async()=>{throw new Error('connection refused')},put:async()=>{throw new Error('no')}};
 assert.equal((await currentBranding(CRC,failing)).readFailed,true);
 assert.equal(await publicWorkspaceWithBranding(CRC,failing),CRC);
 const slow={get:()=>new Promise<never>(()=>{}),put:async()=>{throw new Error('no')}};
 assert.equal((await currentBranding(CRC,slow,{timeoutMs:20})).readFailed,true,'a slow store never holds up the output page');
});

test('writes are versioned',async()=>{
 const repo=new MemoryWorkspaceBrandingRepository();
 const first=await repo.put({colors:{ink:'#000000'}},0,'a',1);assert.equal(first.version,1);
 await assert.rejects(repo.put({},0,'b',2),/now version 1/);
 assert.equal((await repo.put({},1,'b',2)).version,2);
});

/* --------------------------------------------------------------- tools --- */
const ASSET=`asset_${'b'.repeat(64)}`,ARCHIVED=`asset_${'c'.repeat(64)}`;
const record=(id:string,archived=false):AssetRecord=>({id,name:archived?'Old logo':'Tree logo',altText:'The TBI tree',mimeType:'image/png',bytes:10,width:10,height:10,version:1,archived,published:false,createdAt:1,updatedAt:1,createdBy:'x',updatedBy:'x',privatePreviewUrl:`/api/assets/${id}/preview`,data:new Uint8Array(10)});
const FRAME={mimeType:'image/jpeg' as const,dataBase64:'AQID',width:1920,height:1080};
function context(workspace=TBI){
 const assets=new MemoryAssetRepository();assets.records.set(ASSET,record(ASSET));assets.records.set(ARCHIVED,record(ARCHIVED,true));
 const fits:Array<{cue:Cue;branding:Parameters<BrandingFit>[1]['branding']}>=[];
 const ctx:BrandingToolContext={repository:new MemoryWorkspaceBrandingRepository(),workspace,assets,cues:async()=>[...cues,{...bottom,id:'corner-sample',name:'Response',layout:'corner'}],signedAsset:id=>`/api/assets/${id}/signed?exp=1&sig=${'s'.repeat(43)}`,now:()=>1000,
  fit:async(cue,options)=>{fits.push({cue,branding:options.branding});return {verdict:'pass',fitErrors:[],warnings:[],fill:null,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test',previewImage:FRAME}}};
 return {ctx,assets,fits,run:(operation:string,input:Record<string,unknown>={})=>brandingToolOperation(operation,input,'mcp:agent',ctx) as Promise<Record<string,any>>}; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test('get_branding with nothing stored lists the built-in values and says how to start',async()=>{
 const {run}=context();
 const read=await run('get_branding');
 assert.equal(read.version,0);assert.equal(read.stored,false);
 assert.deepEqual(read.colors.map((row:{key:string})=>row.key),[...BRANDING_COLOR_KEYS]);
 assert.equal(read.colors.find((row:{key:string})=>row.key==='ring').value,'#e55c5e');
 assert.match(read.message,/expectedVersion 0/);
 assert.equal(read.artwork.find((row:{role:string})=>row.role==='logo').src,TBI.logo.src);
});

test('update_branding saves a versioned change, publishes the artwork it uses, and refuses stale or empty writes',async()=>{
 const {run,assets}=context();
 await assert.rejects(run('update_branding',{expectedVersion:0}),/Nothing to change/);
 await assert.rejects(run('update_branding',{expectedVersion:1,colors:{ink:'#000000'}}),/now version 0/);
 await assert.rejects(run('update_branding',{expectedVersion:0,artwork:{logo:ARCHIVED}}),/is archived/);
 await assert.rejects(run('update_branding',{expectedVersion:0,artwork:{logo:`asset_${'d'.repeat(64)}`}}),/no artwork/);
 await assert.rejects(run('update_branding',{expectedVersion:0,fonts:{latin:'David Libre'}}),/installed overlay fonts: Noto Sans Hebrew, WorkRefresh/,'a book face needs book faces on');
 const saved=await run('update_branding',{expectedVersion:0,colors:{accent:'#AA0000'},artwork:{logo:ASSET}});
 assert.equal(saved.version,1);
 assert.equal(saved.colors.find((row:{key:string})=>row.key==='ring').value,'#aa0000','the ring follows the accent');
 assert.equal((await assets.get(ASSET))!.published,true,'artwork used by branding is served publicly');
 assert.match(saved.message,/reloaded/);
 const cleared=await run('update_branding',{expectedVersion:1,colors:{accent:null}});
 assert.equal(cleared.colors.find((row:{key:string})=>row.key==='accent').value,'#e55c5e');
 assert.equal(cleared.artwork.find((row:{role:string})=>row.role==='logo').assetId,ASSET,'what the patch does not name is kept');
});

test('preview_branding draws one graphic per layout with the candidate branding and saves nothing',async()=>{
 const {run,fits,ctx}=context();
 const preview=await run('preview_branding',{colors:{ring:'#00ff00'},artwork:{logo:ASSET}});
 assert.deepEqual(preview.previews.map((row:{layout:string})=>row.layout),['bottom','left','right','corner']);
 assert.equal(fits.length,4);
 for(const fit of fits){assert.equal(fit.branding.palette!.ring,'#00ff00');assert.match(fit.branding.logo,/\/signed\?/,'unpublished artwork goes to the stage by signed link')}
 assert.equal(preview.previews[0].previewImage.dataBase64,'AQID');
 assert.equal(await ctx.repository.get(),null,'nothing saved');
 const named=await run('preview_branding',{cueIds:[bottom.id]});
 assert.equal(named.previews.length,1);
 await assert.rejects(run('preview_branding',{cueIds:['no-such-cue']}),/no graphic no-such-cue/);
 assert.equal(overlayBrandingFor(TBI,resolveBranding(TBI,null)).accentColor,'#e55c5e');
});

/* ----------------------------------------------------------------- MCP --- */
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:agent'}} satisfies AuthInfo;
test('over the MCP: results start with the workspace, writes need workspace, frames leave as images',async()=>{
 const {ctx}=context(CRC);
 const handler=createAuthoringMcpHandler(async(operation,input,who)=>{try{return await brandingToolOperation(operation,input,who,ctx)}catch(error){if(error instanceof BrandingError)throw new AuthoringError(error.code,error.message,error.status);throw error}});
 let id=0;
 const call=async(name:string,args:Record<string,unknown>)=>{const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}})}),{authInfo});const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);return (JSON.parse(data??'{}') as {result:{isError?:boolean;content:Array<{type:string;text?:string;data?:string;mimeType?:string}>}}).result};
 const read=await call('get_branding',{});
 assert.ok(read.content[0].text!.startsWith('{"workspaceId":"crc","shortName":"CRC"'));
 const refused=await call('update_branding',{expectedVersion:0,colors:{ink:'#000000'}});
 assert.equal(refused.isError,true);assert.match(refused.content[0].text!,/Name the congregation/);
 const bad=await call('update_branding',{workspace:'crc',expectedVersion:0,colors:{ink:'black'}});
 assert.equal(bad.isError,true);assert.match(bad.content[0].text!,/six-digit hex/);
 const saved=await call('update_branding',{workspace:'crc',expectedVersion:0,colors:{ink:'#000000'}});
 assert.equal(saved.isError,undefined);assert.equal(JSON.parse(saved.content[0].text!).version,1);
 const preview=await call('preview_branding',{colors:{paper:'#ffffff'}});
 assert.equal(preview.content.length,5,'one text block and four frames');
 assert.deepEqual(preview.content[1],{type:'image',data:'AQID',mimeType:'image/jpeg'});
 assert.doesNotMatch(preview.content[0].text!,/AQID/);
 assert.equal(JSON.parse(preview.content[0].text!).previews[3].previewImage.frame,4);
});
