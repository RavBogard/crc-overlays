/**
 * The layout tools (MCP plan L3, R-L4): list, read, clone, edit, check, preview, publish and rebase
 * data layouts - the per-workspace card layouts L2 stores in lib/layout-definitions.ts - so an
 * agent can add a layout (a top-right "Response" card, say) and publish a graphic in it with no
 * code change and no release. The built-in four stay code (ruling 7): they can be read, and the
 * corner card can be cloned, but none of them is ever written here.
 *
 * Nothing here puts anything on screen. publish_layout makes a definition the one new graphics
 * pin; a graphic already published keeps the version it pinned until rebase_to_layout
 * republishes it (a dry run unless dryRun:false), one ship_draft per graphic.
 */
import {baselineCues,buildCue,sourcePinFor,type AuthoringCue,type Draft} from './authoring-model';
import {FONT_FACES} from './font-registry';
import {LayoutDefinitionError,layoutMotion,parseLayoutDocument,type LayoutDefinitionRecord,type LayoutDefinitionsRepository} from './layout-definitions';
import {isBuiltInLayout,layoutDefinition,layoutIds,layoutRefKey,type CardDefinition,type LayoutDocument,type LayoutRef,type ResolvedLayouts} from './layout-registry';
import type {ServerFitResult} from './server-fit-contract';

export const LAYOUT_TOOLS=new Set(['list_layouts','get_layout','create_layout','update_layout','validate_layout','preview_layout','publish_layout','rebase_to_layout']);
export const isLayoutTool=(operation:string)=>LAYOUT_TOOLS.has(operation);

/** The server fit, handed the definitions the cue's card is drawn from (the fit stage knows no data layout of its own). */
export type LayoutFitRunner=(cue:AuthoringCue,options:{includePreviewImage?:boolean;layouts:ResolvedLayouts})=>Promise<ServerFitResult>;
export type LayoutToolDeps={
 repository:LayoutDefinitionsRepository;
 serverFit:LayoutFitRunner;
 /** The authoring service's own operation runner: rebase_to_layout republishes through ship_draft. */
 run:(operation:string,input:unknown,actor:string)=>Promise<unknown>;
 drafts:()=>Promise<Draft[]>;
 published:()=>Promise<AuthoringCue[]>;
 now?:()=>number;
 /** rebase_to_layout starts no new graphic after this long, so one call stays inside the route's time limit. */
 budgetMs?:number;
};

const LAYOUT_ID=/^[a-z][a-z0-9_-]{0,39}$/;
const refuse=(code:string,message:string,status=400):never=>{throw new LayoutDefinitionError(code,message,status)};
type Input=Record<string,unknown>;
function allowed(data:Input,keys:string[]){const extra=Object.keys(data).filter(key=>!keys.includes(key));if(extra.length)refuse('invalid_input',`Unsupported fields: ${extra.join(', ')}.`)}
const isPlain=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
/** A patch merged into a document: objects merge key by key, anything else (a number, null, an array) replaces. */
export function mergePatch(base:unknown,patch:unknown):unknown{
 if(patch===undefined)return structuredClone(base);
 if(isPlain(base)&&isPlain(patch)){const output:Record<string,unknown>=structuredClone(base);for(const [key,value] of Object.entries(patch))output[key]=mergePatch(base[key],value);return output}
 return structuredClone(patch);
}
const idOf=(value:unknown,label='layoutId')=>{if(typeof value!=='string'||!LAYOUT_ID.test(value))refuse('invalid_input',`${label} must start with a letter and use only a-z, 0-9, _ and -, up to 40 characters.`);return value as string};
const optionalVersion=(value:unknown,label:string)=>{if(value===undefined)return undefined;if(typeof value!=='number'||!Number.isInteger(value)||value<1)refuse('invalid_input',`${label} must be a whole number from 1.`);return value as number};
const requiredVersion=(value:unknown,label:string)=>optionalVersion(value,label)??refuse('invalid_input',`Pass ${label}: the version get_layout or list_layouts returned.`);

/* -------------------------------------------------------------- reading --- */

async function versionsOf(repository:LayoutDefinitionsRepository,id:string){return (await repository.list()).filter(row=>row.id===id).sort((a,b)=>a.version-b.version)}
const newestPublished=(rows:LayoutDefinitionRecord[])=>[...rows].reverse().find(row=>row.status==='published');
const unknownLayout=(id:string)=>refuse('unknown_layout',`There is no layout called ${id} here. list_layouts shows every layout this congregation has.`,404);
/** The document a built-in card clones into. Only a card can be cloned: the lower third and the panels are layered CSS, not a definition. */
function builtInDocument(id:string):LayoutDocument{
 const definition=layoutDefinition(id);
 if(!definition?.card)return refuse('not_a_card',`${id} is drawn by built-in layered CSS, not as a card, so it can't be cloned. Clone corner, or one of this congregation's own layouts (list_layouts).`,409);
 return {label:definition.label,capabilities:{...definition.capabilities,translation:false},card:structuredClone(definition.card),motion:definition.motion?structuredClone(definition.motion):{preset:'card-scale'}};
}
function summary(row:LayoutDefinitionRecord){return {id:row.id,version:row.version,status:row.status,label:row.document.label,sha256:row.sha256,updatedAt:row.updatedAt,updatedBy:row.updatedBy}}

/* ----------------------------------------------------------- validation --- */

type Check={check:string;ok:boolean};
type Box={name:string;x:number;y:number;width:number;height:number};
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
// The faces a card is drawn with (app/overlay.css: `.overlay`, `.overlay .hebrew`, `.title-accent`,
// `.overlay[data-card] .prayer.single-channel`). A card definition names no font of its own yet, so
// the check is that every face its channels use is registered and waited for before a fit.
export const CARD_FACES={title:'WorkRefresh',accentTitle:'Noto Sans Hebrew',hebrew:'Noto Sans Hebrew',latin:'WorkRefresh',single:'WorkRefresh'} as const;
/**
 * The static check: everything that can be known without a browser. The document parses (strict,
 * every part inside the 1920x1080 frame and inside its card), no two text boxes or the logo share
 * space, the shrink floor is at least 20 px and under every channel's size, the id is one Companion
 * can carry (/^[a-z][a-z0-9_-]{0,39}$/), and every face the card draws with is registered.
 */
export function validateLayoutDocument(id:string,value:unknown):{valid:boolean;errors:string[];checks:Check[]}{
 const errors:string[]=[],checks:Check[]=[];
 const note=(check:string,problems:string[])=>{checks.push({check,ok:!problems.length});errors.push(...problems)};
 note('id',!LAYOUT_ID.test(id)?[`The id ${JSON.stringify(id)} must start with a letter and use only a-z, 0-9, _ and -, up to 40 characters (Companion carries it in variable names).`]:isBuiltInLayout(id)?[`${id} is a built-in layout; pick another id.`]:[]);
 let document:LayoutDocument;
 try{document=parseLayoutDocument(value)}catch(error){note('document',[`${error instanceof Error?error.message:String(error)}.`]);return {valid:false,errors,checks}}
 note('document',[]);
 const card:CardDefinition=document.card;
 // parseLayoutDocument refuses anything outside the frame or the card; recorded as its own check.
 note('inside-frame',[]);
 const {title,logo,body}=card;
 const boxes={title:{name:'The title lane',x:title.x,y:title.y,width:title.width,height:title.height},logo:{name:'The logo',x:logo.x,y:logo.y,width:logo.size,height:logo.size},hebrew:{name:'The Hebrew channel',x:body.x,y:body.hebrew.y,width:body.width,height:body.hebrew.height},latin:{name:'The transliteration channel',x:body.x,y:body.latin.y,width:body.width,height:body.latin.height},single:{name:'The single channel',x:body.x,y:body.single.y,width:body.width,height:body.single.height}} satisfies Record<string,Box>;
 // The single channel stands in for the other two (one lone line), so it is never compared with them.
 const pairs:[Box,Box][]=[[boxes.hebrew,boxes.latin],[boxes.title,boxes.hebrew],[boxes.title,boxes.latin],[boxes.title,boxes.single],[boxes.logo,boxes.title],[boxes.logo,boxes.hebrew],[boxes.logo,boxes.latin],[boxes.logo,boxes.single]];
 note('no-overlap',pairs.filter(([a,b])=>logo.size>0||(a!==boxes.logo&&b!==boxes.logo)).filter(([a,b])=>overlaps(a,b)).map(([a,b])=>`${a.name} (x ${a.x}-${a.x+a.width}, y ${a.y}-${a.y+a.height}) overlaps ${b.name.toLowerCase()} (x ${b.x}-${b.x+b.width}, y ${b.y}-${b.y+b.height}). Move or shrink one of them.`));
 const sizes:[string,number][]=[['title.fontSize',title.fontSize],['body.hebrew.fontSize',body.hebrew.fontSize],['body.latin.fontSize',body.latin.fontSize],['body.single.fontSize',body.single.fontSize]];
 note('floor',[...(card.fit.floor<20?[`fit.floor is ${card.fit.floor}; it must be at least 20 px.`]:[]),...sizes.filter(([,size])=>size<card.fit.floor).map(([name,size])=>`${name} is ${size}, below fit.floor ${card.fit.floor}; raise it or lower the floor.`)]);
 const waited=new Set(FONT_FACES.filter(face=>face.wait?.set==='default').map(face=>face.family));
 note('fonts',[...new Set(Object.values(CARD_FACES))].filter(family=>!waited.has(family)).map(family=>`The card draws with ${family}, which is not a registered overlay face (lib/font-registry.ts).`));
 return {valid:errors.length===0,errors,checks};
}

/* ------------------------------------------------------------- previews --- */

export type LayoutSample={label?:string;title:string;accentTitle?:string;hebrew?:string;transliteration?:string;english?:string};
/** What publish_layout always fits: a response line, one English line, and a title with its Hebrew accent. */
export const STANDARD_SAMPLES:readonly LayoutSample[]=[
 {label:'Hebrew with transliteration',title:'Response',hebrew:'וְאִמְרוּ אָמֵן',transliteration:'V\'imru amen'},
 {label:'One English line',title:'Announcement',english:'Kiddush follows in the social hall'},
 {label:'Title with a Hebrew accent',title:'Healing',accentTitle:'אֵל נָא',hebrew:'אֵל נָא רְפָא נָא לָהּ',transliteration:'El na r\'fa na lah'},
];
const standInTemplate=()=>baselineCues.find(cue=>cue.layout==='bottom'&&!cue.hidden)!.id;
function parseSample(value:unknown,index:number):LayoutSample{
 if(!isPlain(value))return refuse('invalid_input',`samples[${index}] must be an object.`);
 allowed(value,['label','title','accentTitle','hebrew','transliteration','english']);
 const text=(key:string,max:number)=>{const item=value[key];if(item===undefined)return undefined;if(typeof item!=='string'||!item.trim()||item.length>max)refuse('invalid_input',`samples[${index}].${key} must be 1-${max} characters.`);return item as string};
 const sample:LayoutSample={title:text('title',100)??refuse('invalid_input',`samples[${index}] needs a title.`),label:text('label',80),accentTitle:text('accentTitle',60),hebrew:text('hebrew',400),transliteration:text('transliteration',400),english:text('english',400)};
 if(!sample.hebrew&&!sample.transliteration&&!sample.english)refuse('invalid_input',`samples[${index}] needs hebrew and/or transliteration, or one english line.`);
 if(sample.english&&(sample.hebrew||sample.transliteration))refuse('invalid_input',`samples[${index}]: a card shows Hebrew with transliteration, or one English line, not both.`);
 return Object.fromEntries(Object.entries(sample).filter(([,item])=>item!==undefined)) as LayoutSample;
}
/**
 * A cue drawn in a layout that may not be published yet. It is built exactly as a corner-card
 * graphic is (the same text rules: no translated third layer), then carries this layout's id, the
 * version it is being looked at in and that version's own motion - so the stage draws it from the
 * definition it is handed, never from this process's registry.
 */
function layoutCue(draft:Draft,ref:LayoutRef,document:LayoutDocument):AuthoringCue{
 const template=baselineCues.find(cue=>cue.id===draft.templateCueId)?.layout==='bottom'?draft.templateCueId:standInTemplate();
 const built=buildCue({...draft,layout:'corner',templateCueId:template}) as AuthoringCue&{template?:unknown};
 const {template:_template,...cue}=built;void _template;
 return {...cue,layout:ref.id,layoutRef:ref,...layoutMotion(document.motion)} as AuthoringCue;
}
function sampleDraft(sample:LayoutSample,index:number):Draft{
 const content={mode:'custom' as const,text:sample.english??'sample'};
 return {id:`layout-sample-${index+1}`,version:1,name:sample.label??`Sample ${index+1}`,title:sample.title,...(sample.accentTitle?{accentTitle:sample.accentTitle}:{}),layout:'corner',templateCueId:standInTemplate(),content,presentation:{},sourcePin:sourcePinFor(content),activeRevision:null,activeDraftVersion:null,createdAt:0,updatedAt:0,createdBy:'layout-preview',updatedBy:'layout-preview'};
}
function sampleCue(sample:LayoutSample,index:number,ref:LayoutRef,document:LayoutDocument){
 const cue=layoutCue(sampleDraft(sample,index),ref,document);
 cue.texts={textTitle:sample.title,...(sample.accentTitle?{accentTextTitle:sample.accentTitle}:{}),...(sample.english?{textMain:sample.english}:{}),...(sample.hebrew?{textMainheb:sample.hebrew}:{}),...(sample.transliteration?{textMainEng:sample.transliteration}:{})};
 return cue;
}
type Measured={label:string;source:'sample'|'draft';draftId?:string;verdict:'pass'|'fail'|'unavailable'|'not-rendered';fitErrors?:string[];warnings?:string[];fill?:number|null;reason?:string;previewImage?:unknown;previewImageUnavailable?:string;message?:string};
async function measure(deps:LayoutToolDeps,items:{label:string;source:'sample'|'draft';draftId?:string;cue?:AuthoringCue;problem?:string}[],row:LayoutDefinitionRecord,includePreviewImage:boolean):Promise<Measured[]>{
 const layouts:ResolvedLayouts={[layoutRefKey(row)]:{id:row.id,version:row.version,sha256:row.sha256,document:row.document}};
 const out:Measured[]=[];
 for(const item of items){
  const head={label:item.label,source:item.source,...(item.draftId?{draftId:item.draftId}:{})};
  if(!item.cue){out.push({...head,verdict:'not-rendered',message:item.problem});continue}
  const result=await deps.serverFit(item.cue,{includePreviewImage,layouts});
  if(result.verdict==='unavailable'){out.push({...head,verdict:'unavailable',reason:result.reason});continue}
  out.push({...head,verdict:result.verdict,fitErrors:result.fitErrors,warnings:result.warnings,fill:result.fill,...(includePreviewImage?{previewImage:result.previewImage??null,...(result.previewImageUnavailable?{previewImageUnavailable:result.previewImageUnavailable}:{})}:{})});
 }
 return out;
}
const overall=(items:Measured[])=>items.some(item=>item.verdict==='unavailable')?'unavailable':items.every(item=>item.verdict==='pass')?'pass':'fail';
const FIT_UNAVAILABLE='The server could not open a browser to fit the samples, so nothing was checked. Try again in a minute.';
const problems=(items:Measured[])=>items.filter(item=>item.verdict==='fail'||item.verdict==='not-rendered').map(item=>`${item.label}: ${item.verdict==='fail'?(item.fitErrors??[]).join(' '):item.message}`);

/* ------------------------------------------------------------ operation --- */

export async function layoutToolOperation(operation:string,data:Input,who:string,deps:LayoutToolDeps):Promise<unknown>{
 const {repository}=deps,now=deps.now??Date.now;
 const pinnedCounts=async(id:string)=>{const counts:Record<string,number>={};for(const cue of await deps.published())if(cue.layoutRef?.id===id)counts[cue.layoutRef.version]=(counts[cue.layoutRef.version]??0)+1;return counts};
 const read=async(id:string,version?:number)=>{
  const rows=await versionsOf(repository,id);
  if(!rows.length)unknownLayout(id);
  const row=version===undefined?rows[rows.length-1]:rows.find(item=>item.version===version);
  if(!row)refuse('unknown_version',`${id} has no version ${version}; its versions are ${rows.map(item=>item.version).join(', ')}.`,404);
  return {rows,row:row!};
 };

 if(operation==='list_layouts'){
  allowed(data,[]);
  const rows=await repository.list(),ids=[...new Set(rows.map(row=>row.id))].sort();
  const builtIn=layoutIds().filter(isBuiltInLayout).map(id=>{const definition=layoutDefinition(id)!;return {id,label:definition.label,kind:'built-in' as const,card:Boolean(definition.card),cloneable:Boolean(definition.card),capabilities:definition.capabilities}});
  const own=ids.map(id=>{const versions=rows.filter(row=>row.id===id).sort((a,b)=>a.version-b.version),newest=versions[versions.length-1],published=newestPublished(versions);return {id,label:newest.document.label,kind:'data' as const,card:true,cloneable:true,anchor:newest.document.card.frame.anchor,newestVersion:newest.version,status:newest.status,publishedVersion:published?.version??null,usable:Boolean(published),updatedAt:newest.updatedAt}});
  return {layouts:[...builtIn,...own],message:own.length?`${own.length} of this congregation's own layout${own.length===1?'':'s'} beside the four built in. A layout is usable in create_draft once it has a published version.`:'Only the four built-in layouts so far. create_layout clones corner (or a layout of your own) into a new card layout.'};
 }

 if(operation==='get_layout'){
  allowed(data,['layoutId','version']);
  const id=idOf(data.layoutId),version=optionalVersion(data.version,'version');
  if(isBuiltInLayout(id)){const definition=layoutDefinition(id)!;return {id,kind:'built-in',label:definition.label,capabilities:definition.capabilities,contained:definition.contained,card:definition.card?structuredClone(definition.card):null,motion:'the template cue\'s',cloneable:Boolean(definition.card),message:definition.card?`Built in and read only. create_layout with from:'${id}' copies it into a layout you can change.`:'Built in and read only: drawn by layered CSS, not a card definition, so it cannot be cloned.'}}
  const {rows,row}=await read(id,version);
  return {kind:'data',...summary(row),document:row.document,versions:rows.map(item=>({version:item.version,status:item.status,sha256:item.sha256})),publishedVersion:newestPublished(rows)?.version??null,pinnedGraphics:await pinnedCounts(id),validation:validateLayoutDocument(id,row.document)};
 }

 if(operation==='validate_layout'){
  allowed(data,['layoutId','version']);
  const id=idOf(data.layoutId),version=optionalVersion(data.version,'version');
  if(isBuiltInLayout(id))refuse('built_in_layout',`${id} is built in; there is nothing stored to check. Clone it with create_layout and check the copy.`,409);
  const {row}=await read(id,version);
  const validation=validateLayoutDocument(id,row.document);
  return {layoutId:id,version:row.version,status:row.status,sha256:row.sha256,...validation,message:validation.valid?`${row.document.label} version ${row.version} passes every static check. preview_layout fits sample text in it on the server.`:`${validation.errors.join(' ')} Fix it with update_layout.`};
 }

 if(operation==='create_layout'){
  allowed(data,['layoutId','from','fromVersion','label','capabilities','card','motion']);
  const id=idOf(data.layoutId),from=idOf(data.from,'from'),fromVersion=optionalVersion(data.fromVersion,'fromVersion');
  if(isBuiltInLayout(id))refuse('built_in_layout',`${id} is a built-in layout. Pick a new id for the copy.`,409);
  const existing=await versionsOf(repository,id);
  if(existing.length)refuse('layout_exists',`A layout called ${id} already exists (version ${existing[existing.length-1].version}). Change it with update_layout, or pick another id.`,409);
  let base:LayoutDocument;
  if(isBuiltInLayout(from)){if(fromVersion!==undefined)refuse('invalid_input','fromVersion applies only to a layout of your own; a built-in layout has no versions.');base=builtInDocument(from)}
  else{const rows=await versionsOf(repository,from);if(!rows.length)unknownLayout(from);const source=fromVersion===undefined?newestPublished(rows)??rows[rows.length-1]:rows.find(item=>item.version===fromVersion);if(!source)refuse('unknown_version',`${from} has no version ${fromVersion}.`,404);base=source!.document}
  const document={label:typeof data.label==='string'?data.label:base.label,capabilities:mergePatch(base.capabilities,data.capabilities),card:mergePatch(base.card,data.card),motion:data.motion===undefined?structuredClone(base.motion):data.motion};
  const row=await repository.saveDraft(id,document as LayoutDocument,null,who,now());
  const validation=validateLayoutDocument(id,row.document);
  return {layout:summary(row),clonedFrom:{id:from,...(fromVersion?{version:fromVersion}:{})},validation,message:`Created ${row.document.label} (${id}) as draft version 1, copied from ${from}. ${validation.valid?'It passes the static checks. ':`${validation.errors.join(' ')} `}preview_layout shows it with sample text; publish_layout with expectedVersion 1 makes it usable.`};
 }

 if(operation==='update_layout'){
  allowed(data,['layoutId','expectedVersion','label','capabilities','card','motion']);
  const id=idOf(data.layoutId),expectedVersion=requiredVersion(data.expectedVersion,'expectedVersion');
  if(isBuiltInLayout(id))refuse('built_in_layout',`${id} is built in and cannot be changed here. create_layout with from:'${id}' makes a copy you can change.`,409);
  if(data.label===undefined&&data.capabilities===undefined&&data.card===undefined&&data.motion===undefined)refuse('invalid_input','Nothing to change: pass label, capabilities, card or motion.');
  const rows=await versionsOf(repository,id);if(!rows.length)unknownLayout(id);
  const newest=rows[rows.length-1];
  if(newest.version!==expectedVersion)refuse('version_conflict',`${id} is at version ${newest.version} (${newest.status}), not ${expectedVersion}. Call get_layout and retry with expectedVersion ${newest.version}.`,409);
  const document={label:typeof data.label==='string'?data.label:newest.document.label,capabilities:mergePatch(newest.document.capabilities,data.capabilities),card:mergePatch(newest.document.card,data.card),motion:data.motion===undefined?structuredClone(newest.document.motion):data.motion};
  const row=await repository.saveDraft(id,document as LayoutDocument,expectedVersion,who,now());
  const validation=validateLayoutDocument(id,row.document);
  const opened=newest.status==='published';
  return {layout:summary(row),openedDraft:opened,validation,message:`${opened?`Version ${newest.version} is published and stays as it is; your change is draft version ${row.version}.`:`Draft version ${row.version} updated.`} ${validation.valid?'It passes the static checks.':validation.errors.join(' ')} Published graphics are unchanged until publish_layout and then rebase_to_layout.`};
 }

 if(operation==='preview_layout'){
  allowed(data,['layoutId','version','samples','draftIds','includePreviewImages']);
  const id=idOf(data.layoutId),version=optionalVersion(data.version,'version');
  if(isBuiltInLayout(id))refuse('built_in_layout',`${id} is built in. Preview a graphic in it with preview_content, or clone it with create_layout.`,409);
  const {row}=await read(id,version);
  const samples=data.samples===undefined?[]:Array.isArray(data.samples)?data.samples.map(parseSample):refuse('invalid_input','samples must be a list.');
  const draftIds=data.draftIds===undefined?[]:Array.isArray(data.draftIds)&&data.draftIds.every(item=>typeof item==='string'&&item.length>0&&item.length<=200)?data.draftIds as string[]:refuse('invalid_input','draftIds must be a list of draft ids.');
  if(samples.length+draftIds.length>6)refuse('invalid_input','Preview at most 6 samples and drafts at a time.');
  const chosen=samples.length||draftIds.length?samples:[...STANDARD_SAMPLES];
  const ref:LayoutRef={id,version:row.version,sha256:row.sha256};
  const items:Parameters<typeof measure>[1]=chosen.map((sample,index)=>({label:sample.label??`Sample ${index+1}`,source:'sample' as const,cue:sampleCue(sample,index,ref,row.document)}));
  if(draftIds.length){
   const drafts=new Map((await deps.drafts()).map(draft=>[draft.id,draft]));
   for(const draftId of draftIds){
    const draft=drafts.get(draftId);
    if(!draft){items.push({label:draftId,source:'draft',draftId,problem:'There is no draft with this id; list_drafts shows them.'});continue}
    try{items.push({label:draft.name,source:'draft',draftId,cue:layoutCue(draft,ref,row.document)})}
    catch(error){items.push({label:draft.name,source:'draft',draftId,problem:(error as {code?:unknown}).code==='corner_translation_unsupported'?'A card shows Hebrew with transliteration, or one line; this draft includes a translation. Turn Translation off to see it here.':error instanceof Error?error.message:String(error)})}
   }
  }
  const includePreviewImage=data.includePreviewImages!==false;
  const measured=await measure(deps,items,row,includePreviewImage);
  const verdict=overall(measured),validation=validateLayoutDocument(id,row.document);
  return {layoutId:id,version:row.version,status:row.status,sha256:row.sha256,verdict,validation,samples:measured,message:verdict==='unavailable'?FIT_UNAVAILABLE:verdict==='pass'?`Every sample fits ${row.document.label} version ${row.version}.${includePreviewImage?' The frames follow in order.':''} Nothing was saved or published.`:`${problems(measured).join(' ')} Nothing was saved or published.`};
 }

 if(operation==='publish_layout'){
  allowed(data,['layoutId','expectedVersion','samples']);
  const id=idOf(data.layoutId),expectedVersion=requiredVersion(data.expectedVersion,'expectedVersion');
  if(isBuiltInLayout(id))refuse('built_in_layout',`${id} is built in and ships with the code; there is nothing to publish.`,409);
  const rows=await versionsOf(repository,id);if(!rows.length)unknownLayout(id);
  const newest=rows[rows.length-1];
  if(newest.version!==expectedVersion)refuse('version_conflict',`${id} is at version ${newest.version}, not ${expectedVersion}. Call get_layout and retry with expectedVersion ${newest.version}.`,409);
  if(newest.status==='published')refuse('already_published',`${id} version ${newest.version} is already published. update_layout opens a draft version ${newest.version+1} for changes.`,409);
  const validation=validateLayoutDocument(id,newest.document);
  if(!validation.valid)return {published:false,stoppedAt:'validation',layoutId:id,version:newest.version,validation,message:`${validation.errors.join(' ')} Nothing was published; fix it with update_layout.`};
  // The passing sample set: the standard three always, and any the caller adds for this layout.
  const extra=data.samples===undefined?[]:Array.isArray(data.samples)?data.samples.map(parseSample):refuse('invalid_input','samples must be a list.');
  if(extra.length>3)refuse('invalid_input','Add at most 3 samples of your own; the standard three always run.');
  const ref:LayoutRef={id,version:newest.version,sha256:newest.sha256};
  const set=[...STANDARD_SAMPLES,...extra];
  const measured=await measure(deps,set.map((sample,index)=>({label:sample.label??`Sample ${index+1}`,source:'sample' as const,cue:sampleCue(sample,index,ref,newest.document)})),newest,false);
  const verdict=overall(measured);
  if(verdict==='unavailable')return {published:false,stoppedAt:'fit_unavailable',layoutId:id,version:newest.version,samples:measured,message:`${FIT_UNAVAILABLE} Nothing was published.`};
  if(verdict==='fail')return {published:false,stoppedAt:'fit_failed',layoutId:id,version:newest.version,samples:measured,message:`${problems(measured).join(' ')} Nothing was published; preview_layout shows the frames, update_layout fixes the card.`};
  const row=await repository.publish(id,newest.version,who,now());
  const older=newestPublished(rows);
  return {published:true,layout:summary(row),samples:measured.map(item=>({label:item.label,verdict:item.verdict})),message:`Published ${row.document.label} (${id}) version ${row.version}; every sample fit. New graphics can use it now: create_draft with layout:'${id}', then ship_draft.${older?` Graphics published in version ${older.version} keep it until rebase_to_layout moves them.`:''}`};
 }

 if(operation==='rebase_to_layout'){
  allowed(data,['layoutId','expectedVersion','dryRun','draftIds']);
  const id=idOf(data.layoutId),expectedVersion=requiredVersion(data.expectedVersion,'expectedVersion');
  if(data.dryRun!==undefined&&typeof data.dryRun!=='boolean')refuse('invalid_input','dryRun must be true or false.');
  const dryRun=data.dryRun!==false;
  const only=data.draftIds===undefined?undefined:Array.isArray(data.draftIds)&&data.draftIds.every(item=>typeof item==='string')?new Set(data.draftIds as string[]):refuse('invalid_input','draftIds must be a list of draft ids.');
  if(isBuiltInLayout(id))refuse('built_in_layout',`${id} is built in; its graphics follow the code release and have no version to move to.`,409);
  const rows=await versionsOf(repository,id);if(!rows.length)unknownLayout(id);
  const target=newestPublished(rows);
  if(!target)refuse('not_published',`${id} has no published version yet. publish_layout first.`,409);
  if(target!.version!==expectedVersion)refuse('version_conflict',`The newest published version of ${id} is ${target!.version}, not ${expectedVersion}. Retry with expectedVersion ${target!.version}.`,409);
  const drafts=new Map((await deps.drafts()).map(draft=>[draft.id,draft]));
  const behind=(await deps.published()).filter(cue=>cue.layoutRef?.id===id&&cue.layoutRef.version<target!.version).filter(cue=>!only||only.has(cue.authoring?.draftId??cue.id));
  type Item={draftId:string;name:string;pinnedVersion:number;action:string;reason?:string;revision?:number;message?:string};
  const items:Item[]=behind.map(cue=>{
   const draftId=cue.authoring?.draftId??cue.id,draft=drafts.get(draftId),head={draftId,name:cue.name,pinnedVersion:cue.layoutRef!.version};
   if(!draft)return {...head,action:'skipped',reason:'Its draft is missing.'};
   if(draft.archivedAt)return {...head,action:'skipped',reason:'Its draft is archived; restore it first.'};
   // A rebase republishes the version already live: unpublished edits would ride along unreviewed.
   if(draft.activeDraftVersion!==draft.version)return {...head,action:'skipped',reason:`It has unpublished changes (draft version ${draft.version}, published ${draft.activeDraftVersion}); ship or undo them first, so a rebase changes nothing but the layout.`};
   return {...head,action:dryRun?'would-rebase':'pending'};
  });
  const eligible=items.filter(item=>item.action==='would-rebase'||item.action==='pending');
  const targetRef={id,version:target!.version,sha256:target!.sha256,label:target!.document.label};
  if(dryRun)return {dryRun:true,target:targetRef,items,wouldRebase:eligible.length,message:eligible.length?`${eligible.length} published graphic${eligible.length===1?'':'s'} would move to ${id} version ${target!.version}, each through ship_draft (server fit, then publish). Nothing changed. Call again with dryRun:false to do it.`:`No published graphic is behind ${id} version ${target!.version}${items.length?' that can be moved; see the reasons':''}. Nothing changed.`};
  const started=now(),budget=deps.budgetMs??40_000;
  let rebased=0;
  for(const item of eligible){
   if(now()-started>budget){item.action='not-started';item.reason='Out of time for this call; call rebase_to_layout again to continue.';continue}
   try{
    const draft=drafts.get(item.draftId)!;
    const shipped=await deps.run('ship_draft',{draftId:item.draftId,expectedVersion:draft.version},who) as {shipped?:boolean;revision?:number;message?:string;stoppedAt?:string};
    if(shipped.shipped){item.action='rebased';item.revision=shipped.revision;rebased++}
    else{item.action='stopped';item.reason=shipped.stoppedAt;item.message=shipped.message}
   }catch(error){item.action='failed';item.message=error instanceof Error?error.message:String(error)}
  }
  const remaining=items.filter(item=>item.action==='not-started').length;
  return {dryRun:false,target:targetRef,items,rebased,liveCatalogChanged:rebased>0,message:`Moved ${rebased} of ${eligible.length} graphic${eligible.length===1?'':'s'} to ${id} version ${target!.version}.${remaining?` ${remaining} not started yet; call again to continue.`:''}${items.some(item=>item.action==='stopped'||item.action==='failed')?' The rest say why they stopped; they are unchanged.':''}`};
 }
 return refuse('unknown_operation',`Unknown layout operation ${operation}.`,404);
}

