// Workspace branding over the MCP (plan L4, R-B2): get_branding, update_branding and
// preview_branding. The stored document holds only what a congregation changed
// (lib/branding-palette.ts); /api/workspace serves it resolved, and every renderer - the output
// page, the console, the editor and the server fit stage - draws with it.
import type {AssetRepository} from './assets';
import type {OverlayBranding} from './branding';
import {ACCENT_TITLE_DEFAULTS,ACCENT_TITLE_DRAWS,ACCENT_TITLE_SCALE,ACCENT_TITLE_WEIGHTS,BRANDING_ARTWORK_ROLES,BRANDING_ASSET_ID,BRANDING_COLOR_KEYS,BRANDING_COLOR_ROLES,BRANDING_FONT_ROLES,BRANDING_FONT_ROLE_USES,HEX_COLOR,accentTitleFace,accentTitleWeights,brandingAssetPath,brandingFontChoices,parseBrandingDocument,resolveBranding,validAccentScale,validAccentWeight,type AccentTitleTypography,type BrandingArtworkRole,type ResolvedBranding,type WorkspaceBrandingDocument} from './branding-palette';
import {BrandingError,forgetBrandingMemo,type StoredBranding,type WorkspaceBrandingRepository} from './branding-store';
import type {Cue} from './player';
import type {ServerFitResult} from './server-fit-contract';
import type {PublicWorkspace} from './workspace';

export const BRANDING_TOOL_OPERATIONS:ReadonlySet<string>=new Set(['get_branding','update_branding','preview_branding']);
export const isBrandingTool=(operation:string)=>BRANDING_TOOL_OPERATIONS.has(operation);

/** The built-in layouts a preview shows, one graphic each, in this order. */
export const PREVIEW_LAYOUTS=['bottom','left','right','corner'] as const;
export const PREVIEW_MAX_CUES=4;
/** Stop starting new frames once this much of the request has gone (maxDuration is 60 s). */
export const PREVIEW_BUDGET_MS=40_000;

export type BrandingFit=(cue:Cue,options:{branding:OverlayBranding;artworkUrl?:string})=>Promise<ServerFitResult>;
export type BrandingToolContext={
 repository:WorkspaceBrandingRepository;
 workspace:PublicWorkspace;
 assets:AssetRepository;
 /** The catalog graphics a preview may draw. */
 cues:()=>Promise<Cue[]>;
 fit:BrandingFit;
 /** A signed, minutes-long read link for one asset (lib/assets.ts signedAssetReadPath), or undefined. */
 signedAsset:(assetId:string)=>string|undefined;
 now?:()=>number;
};

const invalid=(message:string)=>new BrandingError('invalid_input',message);
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
function record(value:unknown){if(!isRecord(value))throw invalid('Arguments must be an object.');return value}
function only(data:Record<string,unknown>,allowed:string[],operation:string){const extra=Object.keys(data).filter(key=>!allowed.includes(key));if(extra.length)throw invalid(`${operation} does not take ${extra.join(', ')}. It takes ${allowed.join(', ')}.`)}

type AccentPatch={scale?:number|null;weight?:number|null};
type Patch={colors?:Record<string,string|null>;fonts?:Record<string,string|null>;artwork?:Record<string,string|null>;typography?:{accentTitle?:AccentPatch|null}};
// G10: typography.accentTitle names only what changes; null (for the whole of it or one value) goes back to the built-in size or weight.
function typographyPatch(value:unknown):Patch['typography']{
 if(!isRecord(value))throw invalid('typography must be an object naming accentTitle.');
 const extra=Object.keys(value).filter(key=>key!=='accentTitle');
 if(extra.length)throw invalid(`typography has no ${extra.join(', ')}. It takes accentTitle.`);
 const accent=value.accentTitle;
 if(accent===undefined)return {};
 if(accent===null)return {accentTitle:null};
 if(!isRecord(accent))throw invalid('typography.accentTitle must be an object with scale and/or weight, or null to go back to the built-in accent title.');
 const unknown=Object.keys(accent).filter(key=>key!=='scale'&&key!=='weight');
 if(unknown.length)throw invalid(`typography.accentTitle has no ${unknown.join(', ')}. It takes scale and weight.`);
 const out:AccentPatch={};
 if(accent.scale!==undefined){if(accent.scale!==null&&!validAccentScale(accent.scale))throw invalid(`typography.accentTitle.scale must be a number from ${ACCENT_TITLE_SCALE.min} to ${ACCENT_TITLE_SCALE.max} (two decimals at most), or null to go back to ${ACCENT_TITLE_DEFAULTS.scale}.`);out.scale=accent.scale as number|null}
 if(accent.weight!==undefined){if(accent.weight!==null&&!validAccentWeight(accent.weight))throw invalid(`typography.accentTitle.weight must be one of ${ACCENT_TITLE_WEIGHTS.join(', ')}, or null to go back to ${ACCENT_TITLE_DEFAULTS.weight}.`);out.weight=accent.weight as number|null}
 if(!Object.keys(out).length)throw invalid('typography.accentTitle names nothing to change: give scale and/or weight, or pass null to go back to the built-in accent title.');
 return {accentTitle:out};
}
// A patch names only what changes; null puts that value back to the workspace's built-in one.
function patchFrom(data:Record<string,unknown>,bookFaces:boolean):Patch{
 const patch:Patch={};
 const section=(name:'colors'|'fonts'|'artwork',keys:readonly string[],check:(key:string,value:string)=>void)=>{
  const value=data[name];if(value===undefined)return;
  if(!isRecord(value))throw invalid(`${name} must be an object.`);
  const out:Record<string,string|null>={};
  for(const [key,item] of Object.entries(value)){
   if(!keys.includes(key))throw invalid(`${name} has no ${key}. It takes ${keys.join(', ')}.`);
   if(item===null){out[key]=null;continue}
   if(typeof item!=='string')throw invalid(`${name}.${key} must be a string, or null to go back to the built-in value.`);
   check(key,item);out[key]=item;
  }
  patch[name]=out;
 };
 section('colors',BRANDING_COLOR_KEYS,(key,value)=>{if(!HEX_COLOR.test(value))throw invalid(`colors.${key} must be a six-digit hex colour such as #d9a62e.`)});
 const choices=brandingFontChoices(bookFaces);
 section('fonts',BRANDING_FONT_ROLES,(key,value)=>{if(!choices.includes(value))throw invalid(`fonts.${key} must be one of the installed overlay fonts: ${choices.join(', ')}. A new font is added in code.`)});
 section('artwork',BRANDING_ARTWORK_ROLES,(key,value)=>{if(!BRANDING_ASSET_ID.test(value))throw invalid(`artwork.${key} must be an asset id from list_assets (asset_ followed by 64 hex characters).`)});
 if(data.typography!==undefined)patch.typography=typographyPatch(data.typography);
 return patch;
}
const changeCount=(patch:Patch)=>{
 const {typography,...rest}=patch,accent=typography?.accentTitle;
 return Object.values(rest).reduce((sum,section)=>sum+Object.keys(section??{}).length,0)+(accent===null?1:Object.keys(accent??{}).length);
};

/** Apply a patch to the stored document; artwork ids are checked against the library and carry its alt text. */
async function applyPatch(current:WorkspaceBrandingDocument,patch:Patch,assets:AssetRepository,bookFaces:boolean){
 const next:Record<'colors'|'fonts'|'artwork',Record<string,unknown>>={colors:{...current.colors},fonts:{...current.fonts},artwork:{...current.artwork}};
 for(const [key,value] of Object.entries(patch.colors??{}))if(value===null)delete next.colors[key];else next.colors[key]=value.toLowerCase();
 for(const [key,value] of Object.entries(patch.fonts??{}))if(value===null)delete next.fonts[key];else next.fonts[key]=value;
 const artworkIds:string[]=[];
 for(const [key,value] of Object.entries(patch.artwork??{})){
  if(value===null){delete next.artwork[key];continue}
  const asset=await assets.get(value);
  if(!asset)throw new BrandingError('asset_unavailable',`There is no artwork ${value} in this workspace's library. Upload it with upload_asset, or pick one from list_assets. Nothing was changed.`,404);
  if(asset.archived)throw new BrandingError('asset_unavailable',`"${asset.name}" is archived, so it can't be used as the ${key}. Restore it in the editor's artwork library or pick another. Nothing was changed.`,409);
  next.artwork[key]={assetId:asset.id,alt:asset.altText};artworkIds.push(asset.id);
 }
 const raw:Record<string,unknown>=Object.fromEntries(Object.entries(next).filter(([,section])=>Object.keys(section).length));
 // G10: the accent title's values merge onto what is stored; back at both built-in values, nothing is stored.
 let accent:AccentTitleTypography|undefined=current.typography?.accentTitle?{...current.typography.accentTitle}:undefined;
 const accentPatch=patch.typography?.accentTitle;
 if(accentPatch===null)accent=undefined;
 else if(accentPatch){
  const merged={...(accent??ACCENT_TITLE_DEFAULTS)};
  for(const key of ['scale','weight'] as const)if(accentPatch[key]!==undefined)merged[key]=accentPatch[key]??ACCENT_TITLE_DEFAULTS[key];
  accent=merged.scale===ACCENT_TITLE_DEFAULTS.scale&&merged.weight===ACCENT_TITLE_DEFAULTS.weight?undefined:merged;
 }
 if(accent){
  // Only a weight the accent title's face really ships: the browser would otherwise fake it.
  const fonts=raw.fonts as WorkspaceBrandingDocument['fonts'],weights=accentTitleWeights(fonts);
  if(!weights.includes(accent.weight))throw invalid(`The accent title is drawn in ${accentTitleFace(fonts)}, which ships weights ${weights.join(', ')}; typography.accentTitle.weight ${accent.weight} is not one of them. Nothing was changed.`);
  raw.typography={accentTitle:accent};
 }
 return {document:parseBrandingDocument(raw,{bookFaces}),artworkIds};
}

/** The renderer's branding object for a resolved set; `logo` may be swapped for a signed link. */
export function overlayBrandingFor(workspace:PublicWorkspace,resolved:ResolvedBranding,logoSrc=resolved.artwork.logo.src??workspace.logo.src):OverlayBranding{
 return {name:workspace.shortName,organizationName:workspace.organizationName,titleColor:resolved.palette.primary,titleShade:resolved.palette.deep,accentColor:resolved.palette.accent,logo:logoSrc,logoAlt:resolved.artwork.logo.alt??workspace.logo.alt,palette:resolved.palette,...(Object.keys(resolved.fonts).length?{fonts:resolved.fonts}:{}),...(resolved.typography?.accentTitle?{typography:{accentTitle:{...resolved.typography.accentTitle}}}:{})};
}

function describe(workspace:PublicWorkspace,stored:StoredBranding|null,resolved:ResolvedBranding){
 const defaults=resolveBranding(workspace,null).palette,set=stored?.document??{};
 return {
  colors:BRANDING_COLOR_KEYS.map(key=>({key,value:resolved.palette[key],builtIn:defaults[key],set:Boolean(set.colors?.[key]),paints:BRANDING_COLOR_ROLES[key]})),
  fonts:{choices:brandingFontChoices(workspace.bookFaces),roles:BRANDING_FONT_ROLES.map(role=>({role,family:resolved.fonts[role]??null,uses:BRANDING_FONT_ROLE_USES[role]}))},
  artwork:BRANDING_ARTWORK_ROLES.map(role=>({role,...resolved.artwork[role],set:Boolean(set.artwork?.[role])})),
  typography:{accentTitle:{...(resolved.typography?.accentTitle??ACCENT_TITLE_DEFAULTS),set:Boolean(set.typography?.accentTitle),builtIn:{...ACCENT_TITLE_DEFAULTS},scaleRange:{...ACCENT_TITLE_SCALE},face:accentTitleFace(resolved.fonts),weights:accentTitleWeights(resolved.fonts),draws:ACCENT_TITLE_DRAWS}},
 };
}

const ARTWORK_NOTES:Record<BrandingArtworkRole,string>={logo:'the medallion on every graphic without its own artwork',restingLogo:'the standing corner mark, where this workspace has one',scanCard:'kept for the scan card; the scan card does not draw artwork yet'};

export async function brandingToolOperation(operation:string,input:unknown,actor:string,context:BrandingToolContext){
 const data=record(input),now=(context.now??Date.now)(),{workspace}=context,bookFaces=workspace.bookFaces;
 if(operation==='get_branding'){
  only(data,[],operation);
  const stored=await context.repository.get(),resolved=resolveBranding(workspace,stored);
  return {version:stored?.version??0,stored:Boolean(stored),updatedAt:stored?.updatedAt??null,updatedBy:stored?.updatedBy??null,...describe(workspace,stored,resolved),artworkUses:ARTWORK_NOTES,
   message:stored?'This is the branding every graphic is drawn with. update_branding with this version changes it; preview_branding shows a change first.':`Nothing is stored, so ${workspace.shortName} uses its built-in identity. update_branding with expectedVersion 0 sets the first values; preview_branding shows a change first.`};
 }
 if(operation==='preview_branding'){
  only(data,['colors','fonts','artwork','typography','cueIds'],operation);
  const patch=patchFrom(data,bookFaces),stored=await context.repository.get();
  const {document}=await applyPatch(stored?.document??{},patch,context.assets,bookFaces);
  const resolved=resolveBranding(workspace,{version:stored?.version??0,document});
  // The stage holds no session: artwork not yet published is loaded through a signed link.
  const logoId=resolved.artwork.logo.assetId,logoSrc=logoId?(context.signedAsset(logoId)??brandingAssetPath(logoId)):undefined;
  const branding=overlayBrandingFor(workspace,resolved,logoSrc);
  const catalog=(await context.cues()).filter(cue=>!(cue as {hidden?:boolean}).hidden&&!(cue as {aliasOf?:string}).aliasOf);
  let picked:Cue[];
  if(data.cueIds!==undefined){
   if(!Array.isArray(data.cueIds)||!data.cueIds.length||data.cueIds.length>PREVIEW_MAX_CUES||!data.cueIds.every(id=>typeof id==='string'))throw invalid(`cueIds must list 1 to ${PREVIEW_MAX_CUES} graphic ids from list_catalog.`);
   picked=data.cueIds.map(id=>{const cue=catalog.find(item=>item.id===id);if(!cue)throw new BrandingError('not_found',`There is no graphic ${id} in the ${workspace.shortName} catalog. Pick ids from list_catalog.`,404);return cue});
  }else{
   // A typography change shows on an accent title, so each layout's pick carries one where the catalog has one.
   const accentFirst=patch.typography?.accentTitle!==undefined,hasAccent=(cue:Cue)=>Boolean(cue.texts?.accentTextTitle?.trim());
   picked=PREVIEW_LAYOUTS.flatMap(layout=>{const all=catalog.filter(cue=>cue.layout===layout),accented=accentFirst?all.filter(hasAccent):[],matches=accented.length?accented:all;const cue=matches.find(item=>!item.presentation?.imageAssetId)??matches[0];return cue?[cue]:[]});
  }
  const started=Date.now(),previews:unknown[]=[];
  for(const cue of picked){
   if(Date.now()-started>PREVIEW_BUDGET_MS){previews.push({cueId:cue.id,name:cue.name,layout:cue.layout,verdict:'skipped',message:'Not drawn: this call ran out of time. Ask for it by id with cueIds.'});continue}
   const cueAsset=cue.presentation?.imageAssetId,artworkUrl=cueAsset?context.signedAsset(cueAsset):undefined;
   const result=await context.fit(cue,{branding,...(artworkUrl?{artworkUrl}:{})});
   if(result.verdict==='unavailable'){previews.push({cueId:cue.id,name:cue.name,layout:cue.layout,verdict:'unavailable',reason:result.reason,message:'The server browser could not draw this graphic. Nothing was changed.'});continue}
   previews.push({cueId:cue.id,name:cue.name,layout:cue.layout,verdict:result.verdict,fitErrors:result.fitErrors,warnings:result.warnings,artwork:result.artwork,previewImage:result.previewImage??null,...(result.previewImageUnavailable?{previewImageUnavailable:result.previewImageUnavailable}:{})});
  }
  return {version:stored?.version??0,changes:changeCount(patch),...describe(workspace,{version:stored?.version??0,document,updatedAt:now,updatedBy:actor},resolved),previews,
   message:changeCount(patch)?'This is how the change would look. Nothing was saved; update_branding with the same values and this version saves it.':'This is how the saved branding looks now.'};
 }
 if(operation==='update_branding'){
  only(data,['expectedVersion','colors','fonts','artwork','typography'],operation);
  const expected=data.expectedVersion;
  if(!Number.isInteger(expected)||(expected as number)<0)throw invalid('expectedVersion must be the version get_branding returned (0 when nothing is stored).');
  const patch=patchFrom(data,bookFaces);
  if(!changeCount(patch))throw invalid('Nothing to change: name at least one of colors, fonts, artwork or typography. Nothing was changed.');
  const stored=await context.repository.get(),current=stored?.version??0;
  if(current!==expected)throw new BrandingError('version_conflict',`The branding changed since you read it (now version ${current}). Call get_branding and try again. Nothing was changed.`,409);
  const {document,artworkIds}=await applyPatch(stored?.document??{},patch,context.assets,bookFaces);
  // Branding artwork is drawn by the public output page, so it is served like published graphics' artwork.
  for(const id of artworkIds)if(!await context.assets.markPublished(id,now))throw new BrandingError('asset_unavailable','That artwork just became unavailable (archived in another session). Pick another. Nothing was changed.',409);
  const saved=await context.repository.put(document,current,actor,now),resolved=resolveBranding(workspace,saved);forgetBrandingMemo();
  return {version:saved.version,updatedAt:saved.updatedAt,updatedBy:saved.updatedBy,...describe(workspace,saved,resolved),
   message:'Saved. New previews, the editor and the server fit use it now. An output page that is already open keeps the old look until it is reloaded.'};
 }
 throw new BrandingError('unknown_operation',`Unknown branding operation: ${operation}`,404);
}

/** The deployment's own context: its store, library, catalog and server browser. */
export async function defaultBrandingContext():Promise<BrandingToolContext>{
 const [{defaultBrandingRepository},{defaultAssetRepository,signedAssetReadPath},{getPublicWorkspace}]=await Promise.all([import('./branding-store'),import('./assets'),import('./workspace')]);
 return {
  repository:defaultBrandingRepository(),workspace:getPublicWorkspace(),assets:defaultAssetRepository(),
  cues:async()=>(await (await import('./server')).catalog()).cues,
  fit:async(cue,options)=>{const [{measureCueOnServer},{canonicalOrigin}]=await Promise.all([import('./server-fit'),import('./oauth-core')]);return measureCueOnServer(cue,{origin:canonicalOrigin(),includePreviewImage:true,branding:options.branding,...(options.artworkUrl?{artworkUrl:options.artworkUrl}:{})})},
  signedAsset:id=>signedAssetReadPath(id),
 };
}
