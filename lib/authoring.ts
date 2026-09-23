import {randomUUID} from 'node:crypto';
import type {Cue} from './player';
import {AuthoringError,assertSourcePin,baselineCues,buildCue,cueHash,draftSetSelections,editableFromBaseline,newDraftId,normalizeGraphicName,parseEditable,previewValidation,resolveSourceBoundaries,sameStructuredValue,sourceBlockFor,sourcePack,sourcePinFor,sourceReferences,sourceSnapshotsFor,type AuthoringCue,type BilingualContent,type CanonicalContent,type Draft,type DraftContent,type DraftSetSelection,type EditableDraft,type Layout,type LocalVariantContent,type LocalVariantOverride,type VariantChannel,type SourceBlock,type SharedCueUpstream} from './authoring-model';
import {compactDraftCatalog,type DraftCatalogInput} from './draft-catalog';
import {planDraftStyle,type DraftStyleOptions,type DraftStylePlan} from './authoring-style';
import {withCreateDefaultBilingualBlocks} from './authoring-defaults';
import {layoutLabel} from './layout-label';
// One source of truth for how much liturgy one panel holds, shared with the editor so a
// selection warning and a server split can never disagree.
import {PANEL_BLOCK_LIMIT,blockCharacters,panelCharacterBudget} from './panel-budget';
import {baselineCatalogForWorkspace,starterSourceMap} from './workspace-catalog';
import {sourceDisplay} from './source-library';
import {sharedCueHash,sharedLibraryClient,type SharedLibraryEntry,type SharedLibraryPayload,type SharedLibrarySnapshot} from './shared-library';
import {compareUpstream,groupSets,setState,shelfState} from './shared-shelf';
import {AssetError,cueAssetId,defaultAssetRepository,importSharedAsset,markCueAssetPublished,type AssetRepository} from './assets';
import {liveRelayConfigured} from './rehearsal';
// Only the contract, never the browser: lib/server-fit.ts is reached exclusively through the
// dynamic import in defaultServerFitRunner, so playwright-core and the Chromium pack stay out
// of the function trace of every entrypoint that touches the authoring service.
import {SERVER_RENDERER_PREFIX,type ServerFitArtwork,type ServerFitResult} from './server-fit-contract';

export type BrowserMeasurement={viewportWidth:number;viewportHeight:number;fontsReady:true;overflow:false;rendererVersion:string;measuredAt:number};
/**
 * Approval for one exact preview. Normally that approval IS a browser measurement: somebody
 * looked at a 1920x1080 render of this exact version and said yes.
 *
 * A slot text edit is the one case where it is not. The slot's layout was reviewed once and
 * approved standing; what changes weekly is a name in a box, and a fresh review round trip to
 * type "Noa" on a Friday afternoon would turn a one-click save into a four-click ritual.
 * `standingApproval` names what the receipt stands on, in place of the measurement, and only
 * the slot path writes one. The publish gate refuses a receipt that carries neither.
 */
export type ReviewReceipt={humanApproved:true;browserMeasurement?:BrowserMeasurement;standingApproval?:string;reviewedAt:number;reviewedBy:string};
// D17/D18 - the server-attested fit measurement `fit_check_draft` writes onto the preview it
// measured. It is version-bound by construction: it lives on one preview, which is already
// bound to one draft version and one cue hash.
// `artwork` is a label, not a gate: the stage cannot load artwork through the author-only
// asset route, so a server `pass` says nothing about it and the attestation records that.
export type ServerFitCheck={verdict:'pass'|'fail';fitErrors:string[];warnings:string[];fill:number|null;artwork:ServerFitArtwork;measuredAt:number;rendererVersion:string};
export type PreviewRecord={id:string;draftId:string;draftVersion:number;cueHash:string;cue:AuthoringCue;validation:ReturnType<typeof previewValidation>;review:ReviewReceipt|null;fitCheck?:ServerFitCheck|null;createdAt:number;createdBy:string};
export type Revision={draftId:string;revision:number;draftVersion:number;cueHash:string;cue:AuthoringCue;previewId:string|null;review:ReviewReceipt|null;actor:string;createdAt:number;sourceCommits:string[]|null};

type DraftUpdate=EditableDraft&Partial<Pick<Draft,'sourceSnapshots'|'sourcePin'>>;

export interface AuthoringRepository{
 listDrafts():Promise<Draft[]>; getDraft(id:string):Promise<Draft|null>; insertDraft(draft:Draft):Promise<Draft>; insertDraftSet(drafts:Draft[]):Promise<Draft[]>; insertImportedDraft(draft:Draft,cue:AuthoringCue,actor:string):Promise<Draft>;
 updateDraft(id:string,expectedVersion:number,editable:DraftUpdate,actor:string):Promise<Draft|null>;
 setArchived(id:string,expectedVersion:number,archived:boolean,actor:string):Promise<Draft|null>;
 setDraftSetArchived(setId:string,expectedIds:string[],archived:boolean,actor:string):Promise<Draft[]>;
 reorderDraftSet(setId:string,expectedIds:string[],orderedIds:string[],actor:string):Promise<Draft[]>;
 duplicateDraftInSet(sourceId:string,expectedVersion:number,expectedIds:string[],duplicate:Draft,actor:string):Promise<Draft[]>;
 insertPreview(preview:PreviewRecord):Promise<void>; getPreview(id:string):Promise<PreviewRecord|null>; saveReview(id:string,review:ReviewReceipt):Promise<void>; saveFitCheck(id:string,fitCheck:ServerFitCheck):Promise<void>;
 publish(id:string,expectedVersion:number,previewId:string,actor:string):Promise<Revision>;
 revisions(id:string):Promise<Revision[]>; rollback(id:string,expectedVersion:number,revision:number,actor:string):Promise<{draft:Draft;revision:Revision}>;
 published():Promise<AuthoringCue[]>;
}

const object=(value:unknown,label='input')=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new AuthoringError('invalid_input',`${label} must be an object`);return value as Record<string,unknown>};
const keys=(value:Record<string,unknown>,allowed:string[],label='input')=>{const extra=Object.keys(value).filter(k=>!allowed.includes(k));if(extra.length)throw new AuthoringError('invalid_input',`${label} contains unsupported fields: ${extra.join(', ')}`)};
const string=(value:unknown,label:string,max=160)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new AuthoringError('invalid_input',`${label} must be 1-${max} characters`);return value.trim()};
const integer=(value:unknown,label:string,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw new AuthoringError('invalid_input',`${label} must be an integer`);return value as number};
const optionalString=(value:unknown,label:string,max=160)=>value===undefined||value===''?undefined:string(value,label,max);
const optionalBoolean=(value:unknown,label:string)=>{if(value===undefined)return undefined;if(typeof value!=='boolean')throw new AuthoringError('invalid_input',`${label} must be boolean`);return value};
const sourceRefreshIds=(value:unknown)=>{if(!Array.isArray(value)||value.length<1||value.length>24)throw new AuthoringError('invalid_input','refreshSourceIds must contain 1-24 source IDs');const ids=value.map((item,index)=>string(item,`refreshSourceIds[${index}]`,160));if(new Set(ids).size!==ids.length)throw new AuthoringError('invalid_input','refreshSourceIds must not repeat a source ID');return ids};
const normalized=(value:unknown)=>String(value??'').normalize('NFKD').replace(/[\u0591-\u05c7\p{M}]/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const MAX_SOURCE_RESPONSE_BYTES=128*1024;
const jsonBytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value));
type SearchSource=(typeof sourcePack.sources)[number]&{book?:string;service?:string;aliases?:string[];openingWords?:string[];metadata?:Record<string,unknown>};
const sourceBook=(source:SearchSource)=>{const value=typeof source.metadata?.bookSlug==='string'?source.metadata.bookSlug:source.book??'';const label=typeof source.metadata?.bookTitle==='string'?source.metadata.bookTitle:source.book??value;return {value,label}};
const sourceService=(source:SearchSource)=>({value:source.service??'',label:source.service??''});
const browseEquivalence=(source:SearchSource)=>JSON.stringify([sourceBook(source).value,normalized(source.name),source.blocks.filter(block=>block.kind==='bilingual'||block.kind==='original-en').map(block=>block.kind==='bilingual'?{kind:block.kind,he:block.he,tr:block.tr}:{kind:block.kind,en:block.en,role:block.role})]);
const sourceEnglishCount=(source:SearchSource)=>source.blocks.filter(block=>block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en))).length;
const legacyBrowseSources=sourcePack.sources.filter(source=>!source.id.startsWith('library:')&&source.blocks.length) as SearchSource[];
const legacyBrowseByKey=new Map(legacyBrowseSources.map(source=>[browseEquivalence(source),source]));
const richLibraryKeys=new Set(sourcePack.sources.filter(source=>source.id.startsWith('library:')&&source.blocks.length).filter(raw=>{const source=raw as SearchSource,legacy=legacyBrowseByKey.get(browseEquivalence(source));return legacy&&sourceEnglishCount(source)>sourceEnglishCount(legacy)}).map(source=>browseEquivalence(source as SearchSource)));
const browsableSources=sourcePack.sources.filter(raw=>{const source=raw as SearchSource;if(!source.blocks.length)return false;const key=browseEquivalence(source),legacy=legacyBrowseByKey.get(key);return source.id.startsWith('library:')?(!legacy||richLibraryKeys.has(key)):!richLibraryKeys.has(key)});
const sourceFacets=(field:'book'|'service')=>{const facets=new Map<string,{value:string;label:string;count:number}>();for(const raw of browsableSources){const source=raw as SearchSource;const item=field==='book'?sourceBook(source):sourceService(source);if(!item.value)continue;const existing=facets.get(item.value);if(existing)existing.count++;else facets.set(item.value,{...item,count:1})}return [...facets.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.value.localeCompare(b.value))};
const compactStylePlan=(plan:DraftStylePlan)=>{
 const {content,...patch}=plan.patch;
 return {changedFields:Object.keys(plan.patch),patch:{...patch,...(content?{content:{arrangement:plan.after.arrangement}}:{})},warnings:plan.warnings,before:plan.before,after:plan.after,sourcePreserved:true as const};
};
/** One browsable unit as a book outline prints it: enough to choose by, never the text itself. */
type BookUnit={id:string;name:string;folio:string|null;kinds:string[];blockCount:number;noteLikeOnly:boolean};
/** A unit that is only source English a siddur prints as a note, never prayer text to lead. */
const unitNoteLikeOnly=(source:SearchSource)=>source.blocks.every(block=>block.kind==='source-en'&&block.noteLike===true);
/** The printed section a unit belongs to: library metadata first, then a legacy section label. */
const sourceSection=(source:SearchSource)=>{const index=typeof source.metadata?.sectionIndex==='number'?source.metadata.sectionIndex:null;const metadataTitle=typeof source.metadata?.sectionTitle==='string'?source.metadata.sectionTitle.trim():'';const legacyTitle=typeof source.section==='string'?source.section.trim():'';return {index,title:metadataTitle||legacyTitle||null}};
const searchRank=(source:SearchSource,query:string)=>{if(!query)return 0;const name=normalized(source.name),opening=normalized((source.openingWords??[]).join(' ')),body=normalized(source.blocks.flatMap(block=>[block.he,block.tr,block.en]).join(' ')),metadata=normalized([source.id,source.section,...(source.aliases??[]),sourceBook(source).value,sourceBook(source).label,source.service].join(' '));if(name===query)return 0;if(name.startsWith(query))return 1;if(name.includes(query))return 2;if(opening.includes(query))return 3;if(body.includes(query))return 4;if(metadata.includes(query))return 5;return null};
function sourceSetSegments(source:SearchSource,mode:'bilingual'|'original-en'|'source-en',includeTranslation:boolean){
 const partitionedParents=new Set(source.blocks.flatMap(block=>block.canonicalParentBlockId?[block.canonicalParentBlockId]:[]));
 const blocks=source.blocks.filter(block=>mode==='source-en'?(block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en)))&&block.automatic!==false:block.kind===(mode==='bilingual'?'bilingual':'original-en')).filter(block=>!partitionedParents.has(block.id));
 if(!blocks.length)throw new AuthoringError('source_mode_unavailable',`This source has no automatic ${mode==='bilingual'?'paired Hebrew and transliteration':mode==='original-en'?'original English':'source English'} blocks`,409);
 if(!includeTranslation)return blocks.map(block=>[block]);
 const translations=source.blocks.filter(block=>block.kind==='translation-en');
 const segments:SourceBlock[][]=[];
 for(let offset=0;offset<blocks.length;){
  const match=translations.find(block=>block.pairedBlockIds?.[0]===blocks[offset].id);
  if(!match?.pairedBlockIds?.length)throw new AuthoringError('missing_translation','This prayer does not have complete authorized English translation coverage',409);
  const ids=match.pairedBlockIds;
  if(ids.length>PANEL_BLOCK_LIMIT)throw new AuthoringError('translation_set_too_large','An authorized translation group is too large for one slide',409);
  const segment=blocks.slice(offset,offset+ids.length);
  if(segment.length!==ids.length||segment.some((block,index)=>block.id!==ids[index]))throw new AuthoringError('partial_translation','Authorized English translation coverage is not a complete ordered sequence',409);
  segments.push(segment);offset+=segment.length;
 }
 return segments;
}
function sourceSetPages(source:SearchSource,mode:'bilingual'|'original-en'|'source-en',includeTranslation:boolean,layout:Layout){
 const segments=sourceSetSegments(source,mode,includeTranslation);
 return sourceSetPagesFromSegments(source,segments,mode,includeTranslation,layout);
}
function sourceSetPagesFromSegments(source:SearchSource,segments:SourceBlock[][],mode:'bilingual'|'original-en'|'source-en',includeTranslation:boolean,layout:Layout){
 // A translated slide keeps its whole authorized pair; only an untranslated lower third splits to one block a slide.
 if(layout==='bottom')return includeTranslation?segments:segments.flatMap(segment=>segment.map(block=>[block]));
 const characterBudget=panelCharacterBudget(mode);
 const pages:SourceBlock[][]=[];let page:SourceBlock[]=[];let characters=0;
 for(const segment of segments){
  const translationCharacters=includeTranslation?(source.blocks.find(block=>block.kind==='translation-en'&&block.pairedBlockIds?.[0]===segment[0].id)?.en?.length??0):0;
  const nextCharacters=segment.reduce((sum,block)=>sum+blockCharacters(block,mode),translationCharacters);
  if(page.length&&(page.length+segment.length>PANEL_BLOCK_LIMIT||characters+nextCharacters>characterBudget)){pages.push(page);page=[];characters=0}
  page.push(...segment);characters+=nextCharacters;
 }
 if(page.length)pages.push(page);
 return pages;
}

function splitDraftSetSegments(content:CanonicalContent,snapshots:Draft['sourceSnapshots']){
 const references=sourceReferences(content,snapshots),sourceIds=[...new Set(references.map(reference=>reference.sourceId))];
 if(sourceIds.length!==1)throw new AuthoringError('mixed_source_selection','A multipart split can only preserve one selected source at a time',409);
 const sourceId=sourceIds[0];if(!sourceId)throw new AuthoringError('split_source_required','This draft has no selected source blocks to split',409);
 const snapshot=snapshots?.find(source=>source.id===sourceId);if(!snapshot)throw new AuthoringError('split_snapshot_missing','This draft has no retained source snapshot for its selection',409);
 const source=resolveSourceBoundaries(snapshot) as SearchSource;
 if(content.mode!=='bilingual'){
  const blocks=content.englishGroups.flatMap(group=>group.blockIds.map(blockId=>sourceBlockFor(sourceId,blockId,[source])));
  if(!blocks.length)throw new AuthoringError('split_source_required','This draft has no selected source blocks to split',409);
  return {sourceId,source,segments:blocks.map(block=>[block]),mode:content.mode,includeTranslation:false};
 }
 const selected=content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>sourceBlockFor(sourceId,blockId,[source])));
 if(!selected.length)throw new AuthoringError('split_source_required','This draft has no selected source blocks to split',409);
 if(!content.includeTranslation)return {sourceId,source,segments:selected.map(block=>[block]),mode:content.mode,includeTranslation:false};
 const translations=source.blocks.filter(block=>block.kind==='translation-en');const segments:SourceBlock[][]=[];
 for(let offset=0;offset<selected.length;){
  const match=translations.find(block=>block.pairedBlockIds?.[0]===selected[offset].id),ids=match?.pairedBlockIds;
  if(!ids?.length||ids.length>PANEL_BLOCK_LIMIT||selected.slice(offset,offset+ids.length).length!==ids.length||ids.some((id,index)=>selected[offset+index]?.id!==id))throw new AuthoringError('partial_translation','The selected draft does not contain complete ordered translation pairs',409);
  segments.push(selected.slice(offset,offset+ids.length));offset+=ids.length;
 }
 return {sourceId,source,segments,mode:content.mode,includeTranslation:true};
}

function splitDraftContent(content:DraftContent,sourceId:string,blocks:SourceBlock[]):DraftContent{
 const variant=content.mode==='local-variant'?content:null,base=(variant?.base??content) as CanonicalContent;
 const blockIds=blocks.map(block=>block.id),groups=base.mode==='bilingual'?[{sourceId,blockIds}]:blockIds.map(blockId=>({sourceId,blockIds:[blockId]}));
 const pageBase:CanonicalContent=base.mode==='bilingual'?{mode:'bilingual',hebrewGroups:groups,transliterationGroups:structuredClone(groups),...(base.includeTranslation?{includeTranslation:true}:{}),...(base.layers?{layers:structuredClone(base.layers)}:{}),...(base.arrangement?{arrangement:base.arrangement}:{})}:{mode:base.mode,englishGroups:groups};
 if(!variant)return pageBase;
 const selected=new Set(blockIds),overrides=variant.overrides.filter(override=>override.sourceId===sourceId&&selected.has(override.blockId));
 return overrides.length?{mode:'local-variant',label:variant.label,...(variant.reason?{reason:variant.reason}:{}),base:pageBase,overrides:structuredClone(overrides)}:pageBase;
}

// R6 - a library name identifies one graphic. Two graphics that read the same are a
// warning while drafting and a confirmation before publication, never a silent collision.
export type DuplicateNameWarning={code:'duplicate-name';suggestedName:string};
const MAX_GRAPHIC_NAME=80;
/** Appends a disambiguating suffix while staying inside the stored name limit. */
function suffixedName(base:string,suffix:string){return `${base.slice(0,Math.max(1,MAX_GRAPHIC_NAME-suffix.length)).trimEnd()}${suffix}`}
/** "Modeh Ani" plus its layout label, then " · 2", " · 3"... until the name is free. */
export function suggestGraphicName(name:string,layout:string,taken:ReadonlySet<string>){
 const label=layoutLabel(layout);
 let candidate=suffixedName(name,` · ${label}`);
 for(let attempt=2;taken.has(normalizeGraphicName(candidate))&&attempt<=99;attempt++)candidate=suffixedName(name,` · ${label} · ${attempt}`);
 return candidate;
}

// The CRC wording a shared graphic reads as right now: what a person compares against when
// CRC republishes. A few KB, so a TBI draft can carry its own copy of what it was taken from.
export function upstreamSnapshot(cue:Cue):SharedCueUpstream{return {layout:cue.layout as Layout,texts:structuredClone(cue.texts),...(cue.contentRows?{contentRows:structuredClone(cue.contentRows)}:{}),...(cue.presentation?{presentation:structuredClone(cue.presentation)}:{})}}
// A starter graphic is a private copy of a CRC baseline cue under a workspace-owned id. Its
// CRC original is the baseline cue it was copied from, hashed the way the CRC feed hashes it,
// so "CRC changed this" is decided by the same bytes on both sides.
function starterBaselineHash(starterMap:Map<string,string>){const origins=new Map([...starterMap].map(([source,destination])=>[destination,source]));return (starterCueId:string)=>{const sourceCueId=origins.get(starterCueId);const cue=sourceCueId?baselineCues.find(item=>item.id===sourceCueId):undefined;return cue?sharedCueHash(cue):null}}
// Every baseline lookup in this file reads CRC's cue list, so one of this workspace's own
// starter ids is resolved back to the CRC graphic it was copied from before the lookup. CRC's
// own ids - and anything that is not a starter - pass through unchanged.
const baselineSourceCueId=(cueId:string)=>{for(const [source,destination] of starterSourceMap())if(destination===cueId)return source;return cueId};
/** The catalog row this workspace publishes for an id: its own id and name, never CRC's. */
const workspaceCatalogCue=(cueId:string)=>baselineCatalogForWorkspace().find(cue=>cue.id===cueId)??baselineCues.find(cue=>cue.id===cueId);
/** CRC's editable model for the graphic behind this workspace's id, under this workspace's name. */
const editableFromWorkspaceBaseline=(cueId:string):EditableDraft=>{const editable=editableFromBaseline(baselineSourceCueId(cueId));const cue=workspaceCatalogCue(cueId);return cue?{...editable,name:cue.name}:editable};

export type AuthoringWorkspace={rehearsal:boolean;storage:'memory'|'postgres';label:string|null};
type SharedLibraryReader={get(force?:boolean):Promise<SharedLibrarySnapshot>};
export type SharedAssetImporter=(id:string,actor:string)=>Promise<unknown>;
/**
 * R7 - how `fit_check_draft` measures. The default launches headless Chromium against this
 * deployment's own /author/fit-stage; the module is imported lazily so neither playwright-core
 * nor the Chromium pack is pulled into a process that never runs a fit check. Tests inject.
 */
export type ServerFitRunner=(cue:AuthoringCue,options?:{includePreviewImage?:boolean})=>Promise<ServerFitResult>;
const defaultServerFitRunner:ServerFitRunner=async(cue,options)=>{
 const [{measureCueOnServer},{canonicalOrigin}]=await Promise.all([import('./server-fit'),import('./oauth-core')]);
 // The origin is the configured public base URL, never the request host: the stage must be
 // the page this deployment serves, and a request host is attacker-controllable.
 return measureCueOnServer(cue as unknown as Cue,{origin:canonicalOrigin(),includePreviewImage:options?.includePreviewImage});
};
export function createAuthoringService(repo:AuthoringRepository,workspace:AuthoringWorkspace={rehearsal:false,storage:'postgres',label:null},shared:SharedLibraryReader=sharedLibraryClient,sharedAssetImporter:SharedAssetImporter=(id,actor)=>importSharedAsset(id,actor),serverFit:ServerFitRunner=defaultServerFitRunner){
 // Every name a person can currently see in the library: the baseline catalog this
 // workspace ships with, live drafts, and published graphics. The catalog a viewer
 // actually sees is baseline + published (lib/server.ts authoringCatalog), so uniqueness
 // is measured against that same set. Hidden aliases never appear under their own name,
 // and a published draft replaces the baseline cue whose id it overrides. Archived drafts
 // and their publications release their names.
 const libraryNames=async(excludeId?:string)=>{
  const [drafts,published]=await Promise.all([repo.listDrafts(),repo.published()]);
  const archived=new Set(drafts.filter(draft=>draft.archivedAt).map(draft=>draft.id));
  const live=published.filter(cue=>!archived.has(cue.id));
  const overridden=new Set(live.map(cue=>cue.id));
  const draftNames=new Set(drafts.filter(draft=>!draft.archivedAt&&draft.id!==excludeId).map(draft=>normalizeGraphicName(draft.name)));
  const catalogNames=baselineCatalogForWorkspace().filter(cue=>!cue.hidden&&!cue.aliasOf&&!overridden.has(cue.id)&&cue.id!==excludeId).concat(live.filter(cue=>cue.id!==excludeId));
  const publishedNames=new Set(catalogNames.map(cue=>normalizeGraphicName(cue.name)));
  return {draftNames,publishedNames,taken:new Set([...draftNames,...publishedNames])};
 };
 // One CRC item becomes one unpublished TBI draft. Shared by the single-graphic copy and the
 // whole-prayer copy so both verify the same source authority, import the same artwork, and
 // record the same origin - including the CRC wording as it read at that moment.
 const sharedDraftFromEntry=async(entry:SharedLibraryEntry,payload:SharedLibraryPayload,who:string,name?:string):Promise<Draft>=>{
  const sourceSnapshots=entry.sourceIds.map(id=>payload.sources.find(source=>source.id===id)).filter((source):source is NonNullable<typeof source>=>Boolean(source)).map(source=>structuredClone(source));if(sourceSnapshots.length!==entry.sourceIds.length)throw new AuthoringError('shared_library_invalid','CRC source snapshots are incomplete',503);
  const {sourcePin:sharedPin,...sharedEditable}=entry.copySpec;const editable=parseEditable(name?{...sharedEditable,name}:sharedEditable,false,sourceSnapshots) as EditableDraft;const pin=sourcePinFor(editable.content,sourceSnapshots,sharedPin.feedSha256);if(!sameStructuredValue(pin,sharedPin))throw new AuthoringError('shared_library_invalid','CRC source authority could not be verified',503);
  const sharedAssetId=cueAssetId(entry.cue);if(sharedAssetId)try{await sharedAssetImporter(sharedAssetId,who)}catch(error){if(error instanceof AssetError)throw new AuthoringError(error.code,error.message,error.status);throw error}
  const now=Date.now();const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:pin,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,...(sourceSnapshots.length?{sourceSnapshots}:{}),sharedFrom:{workspaceId:'crc',cueId:entry.id,cueHash:entry.cueHash,importedAt:now,upstream:upstreamSnapshot(entry.cue)}};assertSourcePin(draft);return draft;
 };
 const duplicateNameWarnings=async(draft:Draft):Promise<DuplicateNameWarning[]>=>{
  const {taken}=await libraryNames(draft.id);
  return taken.has(normalizeGraphicName(draft.name))?[{code:'duplicate-name',suggestedName:suggestGraphicName(draft.name,draft.layout,taken)}]:[];
 };
 const execute=async(operation:string,input:unknown,actor:string):Promise<unknown>=>{
  const who=string(actor,'actor',80); const data=object(input);
  if(operation==='get_workspace'){keys(data,[]);return {workspace};}
  // D20 — G5 is one tool and nothing else: it delegates to D19's importer on the services
  // side and returns the prepared service it created. The import is dynamic because
  // `lib/service-collections` imports the authoring catalog, and a static import here would
  // close the cycle (the `lib/source-review.ts` precedent). Unconfigured is a plain refusal,
  // not a thrown error stack, so an MCP client reads a sentence instead of a trace.
  if(operation==='prepare_service_from_setlist'){
   keys(data,['setlistId','name','service']);
   const setlistId=string(data.setlistId,'setlistId',160),name=optionalString(data.name,'name',120),service=optionalString(data.service,'service',120);
   const {servicesOperation,ServicesError:ServicesFailure}=await import('./service-collections');
   try{return await servicesOperation('import_setlist',{setlistId,...(name?{name}:{}),...(service?{service}:{})},who)}
   catch(error){
    if(error instanceof ServicesFailure&&error.code==='unconfigured')return {ok:false,reason:'unconfigured',message:error.message};
    if(error instanceof ServicesFailure)throw new AuthoringError(error.code,error.message,error.status);
    throw error;
   }
  }
  // The cue log, read-only, for an assistant asked what a service actually did. Same bound and
  // same shape as `GET /api/history`: graphics, liturgical positions and times - no names, no
  // titles, no text, nobody's identity. An unavailable relay is a sentence, not a stack trace.
  if(operation==='get_service_history'){
   keys(data,['since','until','after']);
   const bound=(value:unknown,name:string)=>value===undefined?null:String(integer(value,name,0,Number.MAX_SAFE_INTEGER));
   const {readServiceHistory,HistoryError:HistoryFailure}=await import('./service-history');
   try{return await readServiceHistory({since:bound(data.since,'since'),until:bound(data.until,'until'),after:bound(data.after,'after')})}
   catch(error){
    if(error instanceof HistoryFailure&&error.status===400)throw new AuthoringError('invalid_input',error.message);
    if(error instanceof HistoryFailure)return {ok:false,reason:'unavailable',message:error.message};
    throw error;
   }
  }
  if(operation==='list_shared_library'){
   keys(data,['query','limit','refresh']);const query=normalized(optionalString(data.query,'query',100));const limit=data.limit===undefined?1000:integer(data.limit,'limit',1,1000);if(data.refresh!==undefined&&typeof data.refresh!=='boolean')throw new AuthoringError('invalid_input','refresh must be boolean');const snapshot=await shared.get(data.refresh===true);
   if(!snapshot.available)return snapshot;
   // One read of the drafts table answers the whole shelf: what is already here, what CRC has
   // changed since, and which starter graphic each item corresponds to. Nothing here writes.
   const starterMap=starterSourceMap();const states=shelfState(snapshot.payload.cues,await repo.listDrafts(),starterMap,starterBaselineHash(starterMap));
   const setStates=new Map(groupSets(snapshot.payload.cues).map(set=>[set.id,setState(set.entries.map(entry=>states.get(entry.id)!.state))]));
   const matches=snapshot.payload.cues.filter(entry=>!query||normalized([entry.name,entry.title].join(' ')).includes(query));
   const cues=matches.slice(0,limit).map(entry=>{const shelf=states.get(entry.id)!;return {id:entry.id,name:entry.name,title:entry.title,layout:entry.layout,sourceIds:entry.sourceIds,cueHash:entry.cueHash,state:(entry.set&&setStates.get(entry.set.id))||shelf.state,...(entry.set?{set:{...entry.set}}:{}),local:shelf.local}});
   return {available:true,configured:true,stale:snapshot.stale,refreshedAt:snapshot.refreshedAt,total:matches.length,truncated:cues.length<matches.length,cues};
  }
  if(operation==='preview_shared_cue'){
   keys(data,['cueId','refresh']);const cueId=string(data.cueId,'cueId',160);if(data.refresh!==undefined&&typeof data.refresh!=='boolean')throw new AuthoringError('invalid_input','refresh must be boolean');const snapshot=await shared.get(data.refresh===true);if(!snapshot.available)return snapshot;const entry=snapshot.payload.cues.find(item=>item.id===cueId);if(!entry)throw new AuthoringError('unknown_shared_cue','This CRC library item is no longer available',404);const sharedAssetId=cueAssetId(entry.cue);if(sharedAssetId)try{await sharedAssetImporter(sharedAssetId,who)}catch(error){if(error instanceof AssetError)throw new AuthoringError(error.code,error.message,error.status);throw error}return {available:true,configured:true,stale:snapshot.stale,refreshedAt:snapshot.refreshedAt,cueHash:entry.cueHash,cue:structuredClone(entry.cue)};
  }
  if(operation==='customize_shared_cue'){
   keys(data,['cueId','expectedCueHash','name']);const cueId=string(data.cueId,'cueId',160);const expectedCueHash=string(data.expectedCueHash,'expectedCueHash',64);if(!/^[a-f0-9]{64}$/.test(expectedCueHash))throw new AuthoringError('invalid_input','expectedCueHash must be a SHA-256 hash');const name=optionalString(data.name,'name',80);const snapshot=await shared.get();if(!snapshot.available)throw new AuthoringError('shared_library_unavailable',snapshot.error,503);const entry=snapshot.payload.cues.find(item=>item.id===cueId);if(!entry)throw new AuthoringError('unknown_shared_cue','This CRC library item is no longer available',404);if(entry.cueHash!==expectedCueHash)throw new AuthoringError('shared_cue_changed','This CRC graphic changed after you opened it. Refresh the CRC library and review the current version before customizing.',409);
   const draft=await sharedDraftFromEntry(entry,snapshot.payload,who,name);return {draft:await repo.insertDraft(draft),sharedFrom:draft.sharedFrom};
  }
  // A CRC whole prayer arrives as N graphics that belong together. Copying it takes them all
  // or none: one insert, one new TBI set, CRC's order preserved.
  if(operation==='customize_shared_set'){
   keys(data,['setId','expectedCueHashes']);const setId=string(data.setId,'setId',160);const expected=object(data.expectedCueHashes,'expectedCueHashes');const expectedIds=Object.keys(expected);if(!expectedIds.length||expectedIds.length>200)throw new AuthoringError('invalid_input','expectedCueHashes must name 1-200 graphics');
   for(const id of expectedIds){const hash=string(expected[id],`expectedCueHashes.${id}`,64);if(!/^[a-f0-9]{64}$/.test(hash))throw new AuthoringError('invalid_input','expectedCueHashes values must be SHA-256 hashes')}
   const snapshot=await shared.get();if(!snapshot.available)throw new AuthoringError('shared_library_unavailable',snapshot.error,503);
   const members=snapshot.payload.cues.filter(entry=>entry.set?.id===setId).sort((a,b)=>a.set!.index-b.set!.index);if(!members.length)throw new AuthoringError('unknown_shared_set','This CRC multipart graphic is no longer available',404);
   if(members.length!==expectedIds.length||members.some(entry=>expected[entry.id]!==entry.cueHash))throw new AuthoringError('shared_cue_changed','This CRC multipart graphic changed after you opened it. Refresh the CRC library and review the current version before customizing.',409);
   const draftSetId=randomUUID(),count=members.length;const copies:Draft[]=[];for(const [index,entry] of members.entries())copies.push({...await sharedDraftFromEntry(entry,snapshot.payload,who),draftSetId,setIndex:index+1,setCount:count});
   const draftSetManifest={version:1 as const,selections:copies.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots))};const drafts=copies.map(draft=>({...draft,draftSetManifest:structuredClone(draftSetManifest)}));
   const inserted=await repo.insertDraftSet(drafts);return {drafts:inserted,set:{id:draftSetId,name:members[0].set!.title,count,draftIds:inserted.map(draft=>draft.id)},sharedFrom:inserted.map(draft=>draft.sharedFrom)};
  }
  // Read-only: what CRC changed since this graphic was copied. `before` is the wording this
  // draft recorded at import; graphics copied before that was recorded have no before.
  if(operation==='compare_shared_cue'){
   keys(data,['cueId','draftId']);const cueId=string(data.cueId,'cueId',160);const draftId=string(data.draftId,'draftId',160);const draft=await requiredDraft(repo,draftId);const snapshot=await shared.get();if(!snapshot.available)return snapshot;
   const entry=snapshot.payload.cues.find(item=>item.id===cueId);if(!entry)throw new AuthoringError('unknown_shared_cue','This CRC library item is no longer available',404);const after=upstreamSnapshot(entry.cue);const before=draft.sharedFrom?.upstream;
   const head={available:true,configured:true,stale:snapshot.stale,refreshedAt:snapshot.refreshedAt,cueHash:entry.cueHash,draftId:draft.id};
   if(!before)return {...head,beforeAvailable:false,before:null,after,changed:{wording:false,layout:false,presentation:false},lines:[]};
   return {...head,beforeAvailable:true,before:structuredClone(before),after,...compareUpstream(before,after)};
  }
  if(operation==='source_facets'||operation==='list_source_facets'){
   keys(data,[]);return {books:sourceFacets('book'),services:sourceFacets('service')};
  }
  // The printed outline of one book: every browsable unit, in printed order, grouped by the
  // section a reader would find it under. Names and folios only — the corpus itself stays on
  // the server, and `get_source` remains the way to read one unit.
  if(operation==='list_book_units'){
   keys(data,['book']);const book=normalized(string(data.book,'book',100));
   const matches=browsableSources.map(raw=>raw as SearchSource).filter(source=>[sourceBook(source).value,sourceBook(source).label].some(value=>normalized(value)===book));
   if(!matches.length)throw new AuthoringError('unknown_source','Unknown authoring source book',404);
   const sections=new Map<string,{index:number;title:string|null;units:BookUnit[]}>();
   for(const source of matches){
    const {index,title}=sourceSection(source);const key=index===null?`title:${title??''}`:`index:${index}`;
    let section=sections.get(key);if(!section){section={index:index??sections.size,title,units:[]};sections.set(key,section)}
    section.units.push({id:source.id,name:source.name,folio:sourceDisplay(source).folio,kinds:[...new Set(source.blocks.map(block=>block.kind))],blockCount:source.blocks.length,noteLikeOnly:unitNoteLikeOnly(source)});
   }
   const services=[...new Set(matches.map(source=>sourceService(source).label).filter(Boolean))];
   const result={book:sourceBook(matches[0]),service:services.length===1?services[0]:null,sections:[...sections.values()].sort((a,b)=>a.index-b.index),total:matches.length,noteLikeOnly:matches.filter(unitNoteLikeOnly).length};
   if(jsonBytes(result)>MAX_SOURCE_RESPONSE_BYTES)throw new AuthoringError('source_too_large','This book is too large for direct browser authoring',413);
   return result;
  }
  if(operation==='search_sources'){
   keys(data,['query','book','service','limit']);const query=normalized(optionalString(data.query,'query',100));const book=normalized(optionalString(data.book,'book',100));const service=normalized(optionalString(data.service,'service',100));const limit=data.limit===undefined?20:integer(data.limit,'limit',1,50);
   const matches=browsableSources.map((raw,index)=>{const source=raw as SearchSource,rank=searchRank(source,query);return {source,index,rank}}).filter(item=>item.rank!==null&&(!book||[sourceBook(item.source).value,sourceBook(item.source).label].some(value=>normalized(value)===book))&&(!service||[sourceService(item.source).value,sourceService(item.source).label].some(value=>normalized(value)===service))).sort((a,b)=>a.rank!-b.rank!||a.index-b.index);const summaries=[];for(const {source} of matches){const {blocks,...summary}=source;if(summaries.length>=limit)break;const sourceEnglish=(block:SourceBlock)=>block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en));const coverage={bilingual:blocks.filter(block=>block.kind==='bilingual').length,originalEnglish:blocks.filter(block=>block.kind==='original-en').length,sourceEnglish:blocks.filter(sourceEnglish).length,automaticSourceEnglish:blocks.filter(block=>sourceEnglish(block)&&block.automatic!==false).length,noteLikeEnglish:blocks.filter(block=>block.noteLike===true).length};const candidate={...summary,bookValue:sourceBook(source).value,bookLabel:sourceBook(source).label,display:sourceDisplay(source),blockCount:blocks.length,kinds:[...new Set(blocks.map(b=>b.kind))],coverage};if(jsonBytes({authority:sourcePack.authority,sources:[...summaries,candidate]})>MAX_SOURCE_RESPONSE_BYTES)break;summaries.push(candidate)}return {authority:sourcePack.authority,sources:summaries,truncated:summaries.length<matches.length};
  }
  if(operation==='get_source'){keys(data,['sourceId']);const id=string(data.sourceId,'sourceId');const canonical=sourcePack.sources.find(s=>s.id===id);if(!canonical)throw new AuthoringError('unknown_source','Unknown authoring source',404);const source=resolveSourceBoundaries(canonical);const result={authority:sourcePack.authority,source,display:sourceDisplay(source)};if(jsonBytes(result)>MAX_SOURCE_RESPONSE_BYTES)throw new AuthoringError('source_too_large','This source is too large for direct browser authoring',413);return result;}
  // Both listings enumerate this workspace's own catalog - baselineCatalogForWorkspace(), the
  // same seam lib/server.ts mergePublishedCatalog reads for the live catalog - so a TBI editor
  // never sees a CRC id. Origin detection still needs the CRC source id, so baselineSourceCueId
  // translates a workspace id back before asking editableFromBaseline; on CRC that is a no-op.
  if(operation==='list_templates'){keys(data,[]);return {templates:baselineCatalogForWorkspace().filter(cue=>!cue.hidden).map(cue=>{let importable=true;try{editableFromBaseline(baselineSourceCueId(cue.id))}catch{importable=false}return {id:cue.id,name:cue.name,layout:cue.layout,importable}})};}
  if(operation==='list_catalog'){
   keys(data,[]);const [allDrafts,published]=await Promise.all([repo.listDrafts(),repo.published()]);const archivedIds=new Set(allDrafts.filter(draft=>draft.archivedAt).map(draft=>draft.id));const drafts=allDrafts.filter(draft=>!draft.archivedAt);const active=new Map(baselineCatalogForWorkspace().filter(cue=>!archivedIds.has(cue.id)).map(cue=>[cue.id,cue]));for(const cue of published)if(!archivedIds.has(cue.id))active.set(cue.id,cue);const byId=new Map(drafts.map(draft=>[draft.id,draft]));
   return {cues:[...active.values()].map(cue=>{const draft=byId.get(cue.id);let origin:'canonical'|'variant'|'local'|'legacy'='legacy';const authoredOrigin=(cue as AuthoringCue).authoring?.origin;if(authoredOrigin)origin=authoredOrigin;if(origin==='legacy')try{editableFromBaseline(baselineSourceCueId(cue.id));origin='canonical'}catch{}const editAction=draft?'open':origin==='canonical'?'import':'duplicate';return {id:cue.id,name:cue.name,title:cue.texts.textTitle,layout:cue.layout,hidden:Boolean(cue.hidden),origin,draftId:draft?.id??null,draftVersion:draft?.version??null,activeRevision:draft?.activeRevision??null,canEdit:true,editAction,canDuplicate:true}})};
  }
  if(operation==='list_drafts'){
   keys(data,['compact','query','service','book','layout','limit','cursor']);
   const compactFields=['query','service','book','layout','limit','cursor'].some(field=>data[field]!==undefined);
   if(data.compact!==undefined&&typeof data.compact!=='boolean')throw new AuthoringError('invalid_input','compact must be boolean');
   if(data.compact===false&&compactFields)throw new AuthoringError('invalid_input','filters require compact results');
   const drafts=(await repo.listDrafts()).filter(draft=>!draft.archivedAt);
   if(data.compact!==true&&!compactFields)return {drafts};
   const layout=data.layout;if(layout!==undefined&&layout!=='left'&&layout!=='bottom'&&layout!=='right')throw new AuthoringError('invalid_input','layout must be left, bottom, or right');
   const input:DraftCatalogInput={query:optionalString(data.query,'query',100),service:optionalString(data.service,'service',100),book:optionalString(data.book,'book',100),layout,limit:data.limit===undefined?undefined:integer(data.limit,'limit',1,50),cursor:optionalString(data.cursor,'cursor',200)};
   return compactDraftCatalog(drafts,input);
  }
  if(operation==='list_archived_drafts'){keys(data,[]);return {drafts:(await repo.listDrafts()).filter(draft=>Boolean(draft.archivedAt))};}
  if(operation==='get_draft'){keys(data,['draftId']);const draft=await requiredDraft(repo,string(data.draftId,'draftId'));return {draft};}
  if(operation==='archive_draft'||operation==='restore_draft'){keys(data,['draftId','expectedVersion']);const id=string(data.draftId,'draftId'),expected=integer(data.expectedVersion,'expectedVersion',1);const current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();if(current.draftSetId)throw new AuthoringError('set_member_archive','Archive or restore multipart graphics as a complete set',409);if(operation==='archive_draft'&&current.archivedAt)return {draft:current};if(operation==='restore_draft'&&!current.archivedAt)return {draft:current};const draft=await repo.setArchived(id,expected,operation==='archive_draft',who);if(!draft)throw conflict();return {draft};}
  if(operation==='archive_draft_set'||operation==='restore_draft_set'){keys(data,['setId','expectedDraftIds']);const setId=string(data.setId,'setId');if(!Array.isArray(data.expectedDraftIds)||!data.expectedDraftIds.length||data.expectedDraftIds.length>200)throw new AuthoringError('invalid_input','expectedDraftIds must contain 1-200 draft IDs');const expectedDraftIds=data.expectedDraftIds.map((id,index)=>string(id,`expectedDraftIds[${index}]`,160));const drafts=await repo.setDraftSetArchived(setId,expectedDraftIds,operation==='archive_draft_set',who);return {set:{id:setId,count:drafts.length,draftIds:drafts.map(draft=>draft.id)},drafts};}
  if(operation==='create_source_draft_set'){
   keys(data,['sourceId','mode','includeTranslation','layout','templateCueId']);
   const sourceId=string(data.sourceId,'sourceId');const canonicalSource=sourcePack.sources.find(item=>item.id===sourceId) as SearchSource|undefined;if(!canonicalSource)throw new AuthoringError('unknown_source','Unknown authoring source',404);const source=resolveSourceBoundaries(canonicalSource) as SearchSource;
   if(data.mode!=='bilingual'&&data.mode!=='original-en'&&data.mode!=='source-en')throw new AuthoringError('invalid_input','mode must be bilingual, original-en, or source-en');const mode=data.mode;
   if(data.includeTranslation!==undefined&&typeof data.includeTranslation!=='boolean')throw new AuthoringError('invalid_input','includeTranslation must be boolean');
   const includeTranslation=data.includeTranslation===true;if(mode!=='bilingual'&&includeTranslation)throw new AuthoringError('invalid_input','includeTranslation is available only for bilingual sources');
   if(!['bottom','left','right'].includes(String(data.layout)))throw new AuthoringError('invalid_input','layout must be bottom, left, or right');const layout=data.layout as Layout;
   const templateCueId=baselineSourceCueId(string(data.templateCueId,'templateCueId',80));const template=baselineCues.find(cue=>cue.id===templateCueId);if(!template)throw new AuthoringError('unknown_template','Unknown baseline cue template',404);if(template.layout!==layout)throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
   const pages=sourceSetPages(source,mode,includeTranslation,layout);const setId=randomUUID();const count=pages.length;const width=Math.max(2,String(count).length);const now=Date.now();
   let drafts=pages.map((page,index)=>{
    const groups=mode==='bilingual'?[{sourceId,blockIds:page.map(block=>block.id)}]:page.map(block=>({sourceId,blockIds:[block.id]}));
    const content:DraftContent=mode==='bilingual'?{mode,hebrewGroups:groups,transliterationGroups:structuredClone(groups),...(includeTranslation?{includeTranslation:true}:{})}:{mode,englishGroups:groups};
    const editable=parseEditable({name:`${source.name} — ${String(index+1).padStart(width,'0')} of ${String(count).padStart(width,'0')}`,title:source.name,layout,templateCueId,content:withCreateDefaultBilingualBlocks(content),presentation:{}}) as EditableDraft;
    const sourceSnapshots=[structuredClone(canonicalSource)];return {...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots),sourceSnapshots,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,draftSetId:setId,setIndex:index+1,setCount:count} satisfies Draft;
   });
  const draftSetManifest={version:1 as const,selections:drafts.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots))};drafts=drafts.map(draft=>({...draft,draftSetManifest:structuredClone(draftSetManifest)}));
  const inserted=await repo.insertDraftSet(drafts);return {drafts:inserted,set:{id:setId,name:source.name,count,draftIds:inserted.map(draft=>draft.id)}};
 }
 if(operation==='split_draft_into_set'){
  keys(data,['draftId','expectedVersion']);const draftId=string(data.draftId,'draftId'),expectedVersion=integer(data.expectedVersion,'expectedVersion',1);const original=await requiredDraft(repo,draftId);
  if(original.version!==expectedVersion)throw conflict();if(original.archivedAt)throw new AuthoringError('draft_archived','Restore this draft before splitting it',409);if(original.draftSetId)throw new AuthoringError('already_multipart','This draft is already a multipart set member',409);
  const origin={draftId,draftVersion:expectedVersion};const existing=(await repo.listDrafts()).filter(draft=>draft.splitFrom?.draftId===draftId&&draft.splitFrom.draftVersion===expectedVersion&&!draft.archivedAt).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));
  if(existing.length){const setId=existing[0].draftSetId;if(setId&&existing.every(draft=>draft.draftSetId===setId)&&existing.length===existing[0].setCount&&existing.every((draft,index)=>draft.setIndex===index+1))return {drafts:existing,set:{id:setId,name:original.name,count:existing.length,draftIds:existing.map(draft=>draft.id)},splitFrom:origin,reused:true};throw new AuthoringError('split_retry_incomplete','A prior split attempt is incomplete; inspect the multipart drafts before retrying',409)}
  if(original.content.mode==='custom')throw new AuthoringError('split_source_required','Only source-backed drafts can be split into a source-preserving set',409);
  const base=original.content.mode==='local-variant'?original.content.base:original.content;const {sourceId,source,segments,mode,includeTranslation}=splitDraftSetSegments(base,original.sourceSnapshots);assertSourcePin(original);const pages=sourceSetPagesFromSegments(source,segments,mode,includeTranslation,original.layout);
  if(pages.length<2)throw new AuthoringError('split_not_needed','The selected draft already fits in one source-preserving page',409);
  const setId=randomUUID(),count=pages.length,width=Math.max(2,String(count).length),now=Date.now();let drafts=pages.map((page,index)=>{
   const content=splitDraftContent(original.content,sourceId,page),editable=parseEditable({name:`${original.name} — ${String(index+1).padStart(width,'0')} of ${String(count).padStart(width,'0')}`,title:original.title,...(original.accentTitle?{accentTitle:original.accentTitle}:{}),layout:original.layout,templateCueId:original.templateCueId,content,presentation:structuredClone(original.presentation)},false,original.sourceSnapshots) as EditableDraft;
   const sourceSnapshots=structuredClone(original.sourceSnapshots);return {...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots,original.sourcePin.feedSha256),sourceSnapshots,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,draftSetId:setId,setIndex:index+1,setCount:count,splitFrom:origin} satisfies Draft;
  });
  const draftSetManifest={version:1 as const,selections:drafts.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots))};drafts=drafts.map(draft=>({...draft,draftSetManifest:structuredClone(draftSetManifest)}));const inserted=await repo.insertDraftSet(drafts);return {drafts:inserted,set:{id:setId,name:original.name,count,draftIds:inserted.map(draft=>draft.id)},splitFrom:origin,reused:false};
 }
 if(operation==='create_draft'){
   const rawContent=object(data.content,'content'),rawBase=rawContent.mode==='local-variant'?object(rawContent.base,'content.base'):rawContent,explicitArrangement=Object.hasOwn(rawBase,'arrangement');const parsed=parseEditable(data) as EditableDraft;const editable=explicitArrangement?parsed:{...parsed,content:withCreateDefaultBilingualBlocks(parsed.content)};const sourceSnapshots=sourceSnapshotsFor(editable.content);const now=Date.now(); const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots),...(sourceSnapshots.length?{sourceSnapshots}:{}),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
   const warnings=await duplicateNameWarnings(draft);
   return {draft:await repo.insertDraft(draft),warnings};
  }
  if(operation==='create_local_variant'){
   keys(data,['draftId','cueId','label','reason','overrides']);const draftId=optionalString(data.draftId,'draftId'),cueId=optionalString(data.cueId,'cueId');if(Boolean(draftId)===Boolean(cueId))throw new AuthoringError('invalid_input','Provide exactly one of draftId or cueId');let sourceDraft:Draft|undefined,editable:EditableDraft,sourceSnapshots:Draft['sourceSnapshots'];
   if(draftId){sourceDraft=await requiredDraft(repo,draftId);if(sourceDraft.archivedAt)throw new AuthoringError('draft_archived','Restore this draft before creating a variant',409);assertSourcePin(sourceDraft);editable=editableOnly(sourceDraft);sourceSnapshots=sourceDraft.sourceSnapshots?.length?structuredClone(sourceDraft.sourceSnapshots):sourceSnapshotsFor(sourceDraft.content)}else{const authored=await repo.getDraft(cueId!);if(authored){assertSourcePin(authored);editable=editableOnly(authored);sourceSnapshots=authored.sourceSnapshots?.length?structuredClone(authored.sourceSnapshots):sourceSnapshotsFor(authored.content)}else{editable=editableFromCatalogCue(cueId!);sourceSnapshots=sourceSnapshotsFor(editable.content)}}
   if(editable.content.mode==='custom'||editable.content.mode==='local-variant')throw new AuthoringError('variant_source_required','Choose a canonical source-backed graphic for a local liturgical variant',409);if(!Array.isArray(data.overrides)||data.overrides.length<1||data.overrides.length>96)throw new AuthoringError('invalid_input','overrides must contain 1-96 deviations');const selected=new Set(sourceReferences(editable.content,sourceSnapshots).map(pair=>JSON.stringify([pair.sourceId,pair.blockId])));const overrides:LocalVariantOverride[]=data.overrides.map((raw,index)=>{const item=object(raw,`overrides[${index}]`);keys(item,['sourceId','blockId','channel','localText'],`overrides[${index}]`);const sourceId=string(item.sourceId,`overrides[${index}].sourceId`),blockId=string(item.blockId,`overrides[${index}].blockId`,220),channel=String(item.channel) as VariantChannel;if(!['he','tr','en'].includes(channel))throw new AuthoringError('invalid_input',`overrides[${index}].channel must be he, tr, or en`);if(!selected.has(JSON.stringify([sourceId,blockId])))throw new AuthoringError('invalid_variant_target','A local deviation must target a selected canonical source block');const block=sourceBlockFor(sourceId,blockId,sourceSnapshots),sourceText=block[channel];if(typeof sourceText!=='string'||!sourceText)throw new AuthoringError('missing_source_channel',`Source block ${blockId} lacks ${channel}`);return {sourceId,blockId,channel,sourceText,localText:string(item.localText,`overrides[${index}].localText`,4000)}});const label=string(data.label,'label',80),reason=optionalString(data.reason,'reason',500);const content:DraftContent={mode:'local-variant',label,reason,base:structuredClone(editable.content),overrides};const variantEditable=parseEditable({...editable,name:`Variant of ${editable.name}`.slice(0,80),content},false,sourceSnapshots) as EditableDraft;const now=Date.now();const draft:Draft={...variantEditable,id:newDraftId(),version:1,sourcePin:sourcePinFor(content,sourceSnapshots,sourceDraft?.sourcePin.feedSha256),sourceSnapshots,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};return {draft:await repo.insertDraft(draft),variantOf:{kind:draftId?'draft':'cue',id:draftId??cueId},provenance:{label,reason:reason??null,overrides:structuredClone(overrides)}};
  }
  if(operation==='reorder_draft_set'){
   keys(data,['setId','expectedDraftIds','orderedDraftIds']);const setId=string(data.setId,'setId');const ids=(value:unknown,label:string)=>{if(!Array.isArray(value)||!value.length||value.length>200)throw new AuthoringError('invalid_input',`${label} must contain 1-200 draft IDs`);return value.map((id,index)=>string(id,`${label}[${index}]`,160))};const expectedDraftIds=ids(data.expectedDraftIds,'expectedDraftIds'),orderedDraftIds=ids(data.orderedDraftIds,'orderedDraftIds');const drafts=await repo.reorderDraftSet(setId,expectedDraftIds,orderedDraftIds,who);return {set:{id:setId,count:drafts.length,draftIds:drafts.map(draft=>draft.id)},drafts};
  }
  if(operation==='duplicate_draft_in_set'){
   keys(data,['draftId','expectedVersion','expectedDraftIds']);const draftId=string(data.draftId,'draftId'),expectedVersion=integer(data.expectedVersion,'expectedVersion',1);if(!Array.isArray(data.expectedDraftIds)||!data.expectedDraftIds.length||data.expectedDraftIds.length>200)throw new AuthoringError('invalid_input','expectedDraftIds must contain 1-200 draft IDs');const expectedDraftIds=data.expectedDraftIds.map((id,index)=>string(id,`expectedDraftIds[${index}]`,160));const sourceDraft=await requiredDraft(repo,draftId);if(sourceDraft.version!==expectedVersion||!sourceDraft.draftSetId||sourceDraft.archivedAt)throw conflict();assertSourcePin(sourceDraft);const now=Date.now();const duplicate:Draft={...structuredClone(sourceDraft),id:newDraftId(),name:copyLabel(sourceDraft.name),version:1,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};const drafts=await repo.duplicateDraftInSet(draftId,expectedVersion,expectedDraftIds,duplicate,who);return {set:{id:sourceDraft.draftSetId,count:drafts.length,draftIds:drafts.map(draft=>draft.id)},drafts,duplicatedFrom:{draftId}};
  }
  if(operation==='review_draft_set'){
   keys(data,['setId']);const setId=string(data.setId,'setId'),drafts=(await repo.listDrafts()).filter(draft=>draft.draftSetId===setId).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(!drafts.length)throw new AuthoringError('unknown_draft_set','Draft set not found',404);const manifest=drafts.find(draft=>draft.draftSetManifest)?.draftSetManifest;if(!manifest)return {set:{id:setId,count:drafts.length,draftIds:drafts.map(draft=>draft.id)},status:'unknown',message:'This historical multipart draft predates retained source-selection manifests. Completeness cannot be verified automatically.',issues:[]};const expected=manifest.selections,current=drafts.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots)),key=(item:DraftSetSelection)=>JSON.stringify([item.sourceId,item.blockId,item.channels]),counts=(items:DraftSetSelection[])=>{const result=new Map<string,number>();for(const item of items)result.set(key(item),(result.get(key(item))??0)+1);return result},expectedCounts=counts(expected),currentCounts=counts(current);const missing=expected.filter((item,index)=>expected.findIndex(candidate=>key(candidate)===key(item))===index&&(currentCounts.get(key(item))??0)<(expectedCounts.get(key(item))??0)),duplicated=current.filter((item,index)=>current.findIndex(candidate=>key(candidate)===key(item))===index&&(currentCounts.get(key(item))??0)>(expectedCounts.get(key(item))??0)),unknown=current.filter(item=>!expectedCounts.has(key(item)));const expectedKnown=expected.map(key),currentKnown=current.filter(item=>expectedCounts.has(key(item))).map(key),outOfOrder=!missing.length&&!duplicated.length&&!unknown.length&&JSON.stringify(currentKnown)!==JSON.stringify(expectedKnown);const issues=[...(missing.length?[{kind:'missing',selections:missing}]:[]),...(duplicated.length?[{kind:'duplicated',selections:duplicated}]:[]),...(unknown.length?[{kind:'unknown',selections:unknown}]:[]),...(outOfOrder?[{kind:'out-of-order',selections:current}]:[])];return {set:{id:setId,count:drafts.length,draftIds:drafts.map(draft=>draft.id)},status:issues.length?'needs-review':'complete',message:issues.length?'Review multipart source coverage before publication.':'Every expected source block and language channel appears exactly once in the approved order.',expected,current,issues};
  }
  if(operation==='duplicate_draft'){
   keys(data,['draftId','cueId','name']);const draftId=optionalString(data.draftId,'draftId');const cueId=optionalString(data.cueId,'cueId');if(Boolean(draftId)===Boolean(cueId))throw new AuthoringError('invalid_input','Provide exactly one of draftId or cueId');
   let editable:EditableDraft;let sourceKind:'draft'|'cue';let sourceId:string;let sourceSnapshots:Draft['sourceSnapshots'];let sharedFrom:Draft['sharedFrom'];let pinnedFeedSha256:string|undefined;
   if(draftId){const sourceDraft=await requiredDraft(repo,draftId);assertSourcePin(sourceDraft);editable=editableOnly(sourceDraft);sourceSnapshots=structuredClone(sourceDraft.sourceSnapshots);sharedFrom=structuredClone(sourceDraft.sharedFrom);pinnedFeedSha256=sourceDraft.sourcePin.feedSha256;sourceKind='draft';sourceId=draftId}
   else{sourceId=cueId!;sourceKind='cue';const authored=await repo.getDraft(sourceId);if(authored){assertSourcePin(authored);editable=editableOnly(authored);sourceSnapshots=structuredClone(authored.sourceSnapshots);pinnedFeedSha256=authored.sourcePin.feedSha256}else{editable=editableFromCatalogCue(sourceId);sourceSnapshots=sourceSnapshotsFor(editable.content)}}
   const requestedName=optionalString(data.name,'name',80);const copyName=requestedName??copyLabel(editable.name);const now=Date.now();const duplicate:Draft={...structuredClone(editable),name:copyName,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots,pinnedFeedSha256),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,...(sourceSnapshots?{sourceSnapshots}:{}),...(sharedFrom?{sharedFrom}:{})};
   return {draft:await repo.insertDraft(duplicate),duplicatedFrom:{kind:sourceKind,id:sourceId}};
  }
  if(operation==='import_cue'){
   keys(data,['cueId']);const cueId=string(data.cueId,'cueId',80);const existing=await repo.getDraft(cueId);if(existing)return {draft:existing,created:false};
   const editable=editableFromWorkspaceBaseline(cueId);const sourceSnapshots=sourceSnapshotsFor(editable.content);const now=Date.now();const draft:Draft={...editable,id:cueId,version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots),...(sourceSnapshots.length?{sourceSnapshots}:{}),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
   const baseline=workspaceCatalogCue(cueId)! as AuthoringCue;
   try{return {draft:await repo.insertImportedDraft(draft,structuredClone(baseline),who),created:true}}catch(error){const raced=await repo.getDraft(cueId);if(raced)return {draft:raced,created:false};throw error}
  }
  if(operation==='style_draft'){
   keys(data,['draftId','expectedVersion','layout','arrangement','comfortableTypography','dryRun']);
   const id=string(data.draftId,'draftId'),expected=integer(data.expectedVersion,'expectedVersion',1),current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();assertSourcePin(current);
   const layout=data.layout;if(layout!==undefined&&layout!=='left'&&layout!=='bottom'&&layout!=='right')throw new AuthoringError('invalid_input','layout must be left, bottom, or right');
   const arrangement=data.arrangement;if(arrangement!==undefined&&arrangement!=='together'&&arrangement!=='blocks')throw new AuthoringError('invalid_input','arrangement must be together or blocks');
   const options:DraftStyleOptions={layout,arrangement,comfortableTypography:optionalBoolean(data.comfortableTypography,'comfortableTypography')};
   const dryRun=optionalBoolean(data.dryRun,'dryRun')??true;
   const templates=baselineCatalogForWorkspace().filter(template=>!template.hidden).map(template=>({id:baselineSourceCueId(template.id),layout:template.layout as Layout}));
   const plan=planDraftStyle(current,options,templates),compact=compactStylePlan(plan);
   if(dryRun)return {draft:{id:current.id,version:current.version,activeVersion:current.activeDraftVersion},dryRun:true,applied:false,...compact};
   if(layout!==undefined&&plan.warnings.some(warning=>warning.startsWith('No compatible ')))throw new AuthoringError('style_template_unavailable',`No compatible ${layout} template is available`,409);
   if(!Object.keys(plan.patch).length)return {draft:{id:current.id,version:current.version,activeVersion:current.activeDraftVersion},dryRun:false,applied:false,...compact};
   const updated=await execute('update_draft',{draftId:id,expectedVersion:expected,patch:plan.patch},who) as {draft:Draft};
   if(!sameStructuredValue(current.sourcePin,updated.draft.sourcePin))throw new AuthoringError('style_source_changed','Style changes must preserve source authority',409);
   return {draft:{id:updated.draft.id,version:updated.draft.version,activeVersion:updated.draft.activeDraftVersion},dryRun:false,applied:true,...compact};
  }
  if(operation==='update_draft'){
   keys(data,['draftId','expectedVersion','patch','refreshSourceIds']);const id=string(data.draftId,'draftId');const expected=integer(data.expectedVersion,'expectedVersion',1);const current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();assertSourcePin(current);
   const requestedRefresh=data.refreshSourceIds===undefined?[]:sourceRefreshIds(data.refreshSourceIds);if(requestedRefresh.length&&(!data.patch||typeof data.patch!=='object'||Array.isArray(data.patch)||!Object.hasOwn(data.patch,'content')))throw new AuthoringError('source_refresh_requires_content','refreshSourceIds requires a content selection in patch',400);
   const inheritedSnapshots=current.sourceSnapshots?.length?structuredClone(current.sourceSnapshots):sourceSnapshotsFor(current.content);
   const refreshedSources=requestedRefresh.map(sourceId=>{const source=sourcePack.sources.find(candidate=>candidate.id===sourceId);if(!source)throw new AuthoringError('unknown_source',`Unknown source ${sourceId}`,404);return structuredClone(source)});
   const validationSnapshots=requestedRefresh.length?[...inheritedSnapshots.filter(source=>!requestedRefresh.includes(source.id)),...refreshedSources]:inheritedSnapshots;
   const patch=parseEditable(data.patch,true,validationSnapshots);const merged=parseEditable({...editableOnly(current),...patch},false,validationSnapshots) as EditableDraft;
   if(requestedRefresh.length){const selected=new Set(sourceReferences(merged.content,validationSnapshots).map(reference=>reference.sourceId));for(const sourceId of requestedRefresh)if(!selected.has(sourceId))throw new AuthoringError('invalid_source_refresh','refreshSourceIds must name sources selected by patch.content',400);const sourceSnapshots=sourceSnapshotsFor(merged.content,validationSnapshots);const sourcePin=sourcePinFor(merged.content,sourceSnapshots);const updated=await repo.updateDraft(id,expected,{...merged,sourceSnapshots,sourcePin},who);if(!updated)throw conflict();return {draft:updated,warnings:await duplicateNameWarnings(updated)}}
   const updated=await repo.updateDraft(id,expected,merged,who);if(!updated)throw conflict();return {draft:updated,warnings:await duplicateNameWarnings(updated)};
  }
  if(operation==='preview_draft'){
   keys(data,['draftId','expectedVersion']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const cue=buildCue(draft);const validation=previewValidation(cue);const preview:PreviewRecord={id:randomUUID(),draftId:draft.id,draftVersion:draft.version,cueHash:cueHash(cue),cue,validation,review:null,createdAt:Date.now(),createdBy:who};await repo.insertPreview(preview);
   return {previewId:preview.id,draftVersion:draft.version,cue,cueHash:preview.cueHash,validation,previewPath:`/author?draft=${encodeURIComponent(draft.id)}`,fitContract:{viewport:{width:1920,height:1080},fontsReadyRequired:true,noOverflowRequired:true,browserReported:true,humanReviewRequired:true}};
  }
  if(operation==='preview_content'){
   return ephemeralCue(parseEditable(data) as EditableDraft,who);
  }
  // Looking at a baseline graphic is not importing it: the cue is rebuilt from the same
  // baseline mapping `import_cue` would use, and a baseline the model refuses to manage
  // (a non-liturgical archive copy) refuses here too, with its own error.
  if(operation==='preview_baseline_cue'){
   keys(data,['cueId']);const cueId=string(data.cueId,'cueId',160);return ephemeralCue(editableFromWorkspaceBaseline(cueId),who,cueId);
  }
  // R7/D17 - measure this exact preview in a real browser on the server and store the
  // verdict on the preview record. Nothing is published; nothing reaches live output.
  if(operation==='fit_check_draft'){
   keys(data,['draftId','expectedVersion','previewId','includePreviewImage']);
   const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);
   const preview=await requiredPreview(repo,string(data.previewId,'previewId'));
   if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);
   const includePreviewImage=optionalBoolean(data.includePreviewImage,'includePreviewImage')===true;
   const result=await serverFit(preview.cue,{includePreviewImage});
   if(result.verdict==='unavailable')
    return {verdict:'unavailable',reason:result.reason,fitCheckUrl:`/author/fit-check?draft=${encodeURIComponent(draft.id)}`,message:FIT_CHECK_UNAVAILABLE};
   const fitCheck:ServerFitCheck={verdict:result.verdict,fitErrors:result.fitErrors,warnings:result.warnings,fill:result.fill,artwork:result.artwork,measuredAt:result.measuredAt,rendererVersion:result.rendererVersion};
   await repo.saveFitCheck(preview.id,fitCheck);
   // A pass whose artwork never loaded on the server is still a pass - findFitErrors never
   // evaluates artwork - but it says what it did not see rather than implying it did.
   const passMessage=fitCheck.artwork==='not-loaded'?FIT_CHECK_PASSED_NO_ARTWORK:FIT_CHECK_PASSED;
   return {draftId:draft.id,draftVersion:draft.version,previewId:preview.id,cueHash:preview.cueHash,...fitCheck,...(includePreviewImage?{previewImage:result.previewImage??null,...(result.previewImageUnavailable?{previewImageUnavailable:result.previewImageUnavailable}:{})}:{}),...(fitCheck.verdict==='pass'?{message:passMessage}:{})};
  }
  if(operation==='review_draft'){
   keys(data,['draftId','expectedVersion','previewId','browserMeasurement','humanApproved']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const preview=await requiredPreview(repo,string(data.previewId,'previewId'));if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);if(data.humanApproved!==true)throw new AuthoringError('review_required','Human approval is required',400);
   // D18 - where the measurement may come from depends on who is asking.
   //
   // The web dock path (a signed-in member measuring in their own browser) is unchanged: it
   // asserts the measurement and the server trusts it, because a real browser produced it in
   // a real session. An MCP actor cannot be trusted to have rendered anything, so for it only
   // a stored, server-attested measurement counts - the one `fit_check_draft` wrote onto this
   // exact preview with a `server-chromium/` renderer. A hand-asserted measurement from an MCP
   // actor is ignored and the call is refused. `humanApproved` keeps exactly today's meaning.
   const measurement=isMcpActor(who)?attestedMeasurement(preview):assertedMeasurement(data);
   const review:ReviewReceipt={humanApproved:true,browserMeasurement:measurement,reviewedAt:Date.now(),reviewedBy:who};await repo.saveReview(preview.id,review);return {draftId:draft.id,draftVersion:draft.version,previewId:preview.id,cueHash:preview.cueHash,review};
  }
  // One Save on "This service", in one call: every slot of the chosen service type whose
  // text changed is republished, and nothing else is touched. No review round trip and no
  // second page — the slot's layout carries a standing approval, and the guard that replaces
  // the per-edit review is a length check whose refusal names the field and says what to do.
  //
  // Every value is checked before anything is published, so a typo in the last field cannot
  // leave half the service published and half not.
  if(operation==='save_slots'){
   keys(data,['serviceType','values']);
   const {SERVICE_TYPES,slotDefinition,slotTextProblems}=await import('./slots');
   const {slotCueRegister}=await import('./slot-catalog');
   const serviceType=string(data.serviceType,'serviceType',80);
   if(!SERVICE_TYPES.some(type=>type.id===serviceType))throw new AuthoringError('unknown_service_type','That service type does not exist',404);
   const values=object(data.values,'values');
   const register=slotCueRegister();
   const wanted=Object.entries(values).map(([key,value])=>{
    const definition=slotDefinition(key);
    if(!definition)throw new AuthoringError('unknown_slot',`There is no slot called ${key}`,404);
    const cueId=register.get(key);
    if(!cueId)throw new AuthoringError('unminted_slot',`The graphic for ${definition.name} has not been created yet.`,409);
    if(typeof value!=='string'||value.length>4000)throw new AuthoringError('invalid_input',`${definition.name} must be 4000 characters or fewer`);
    return {definition,cueId,text:value};
   });
   const problems=wanted.flatMap(item=>slotTextProblems(item.definition,item.text));
   if(problems.length)throw new AuthoringError('slot_text_too_long',problems.join(' '),400);
   const saved:Array<{key:string;cueId:string;text:string;published:boolean}>=[];
   for(const item of wanted)saved.push(await publishSlotText(repo,item.definition.key,item.cueId,item.text,who));
   return {serviceType,slots:saved,published:saved.filter(item=>item.published).length};
  }
  if(operation==='publish_draft'){
   keys(data,['draftId','expectedVersion','previewId','confirmDuplicateName']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);
   if(data.confirmDuplicateName!==undefined&&typeof data.confirmDuplicateName!=='boolean')throw new AuthoringError('invalid_input','confirmDuplicateName must be boolean');
   const previewId=string(data.previewId,'previewId');
   const {publishedNames,taken}=await libraryNames(draft.id);
   if(publishedNames.has(normalizeGraphicName(draft.name))){
    const suggestedName=suggestGraphicName(draft.name,draft.layout,taken);
    if(data.confirmDuplicateName!==true)throw new AuthoringError('duplicate_name',`Another published graphic is already named "${draft.name}". Publish anyway as "${suggestedName}"?`,409,{suggestedName});
    // The name is the library label and is never rendered, so renaming cannot change the
    // fit verdict. The approved exact-version browser measurement is carried onto the renamed
    // version rather than discarded, and the draft keeps the name it published under.
    const approved=await requiredPreview(repo,previewId);validatePublishPreview(draft,approved);
    const renamed=await repo.updateDraft(draft.id,draft.version,{...editableOnly(draft),name:suggestedName},who);if(!renamed)throw conflict();
    const renamedCue=buildCue(renamed);
    const preview:PreviewRecord={id:randomUUID(),draftId:renamed.id,draftVersion:renamed.version,cueHash:cueHash(renamedCue),cue:renamedCue,validation:previewValidation(renamedCue),review:null,createdAt:Date.now(),createdBy:who};
    await repo.insertPreview(preview);await repo.saveReview(preview.id,approved.review!);
    const renamedRevision=await repo.publish(renamed.id,renamed.version,preview.id,who);
    return {revision:renamedRevision,cue:renamedRevision.cue,draft:renamed,renamedFrom:draft.name,previewId:preview.id};
   }
   const revision=await repo.publish(draft.id,draft.version,previewId,who);return {revision,cue:revision.cue};
  }
  if(operation==='list_revisions'){keys(data,['draftId']);const id=string(data.draftId,'draftId');await requiredDraft(repo,id);return {revisions:await repo.revisions(id)};}
  if(operation==='rollback_draft'){keys(data,['draftId','expectedVersion','revision']);const id=string(data.draftId,'draftId');const revision=integer(data.revision,'revision',1);const selected=(await repo.revisions(id)).find(row=>row.revision===revision);if(!selected)throw new AuthoringError('unknown_revision','Unknown revision',404);assertRevisionAuthority(selected.cue);const result=await repo.rollback(id,integer(data.expectedVersion,'expectedVersion',1),revision,who);return result;}
  throw new AuthoringError('unknown_operation',`Unknown authoring operation: ${operation}`,404);
 };
 return {operation:execute,publishedCues:()=>repo.published()};
}

const FIT_CONTRACT={viewport:{width:1920,height:1080},fontsReadyRequired:true,noOverflowRequired:true,browserReported:true,humanReviewRequired:true} as const;
// Phase D section E, strings 39 and 40. Neither has precedent; both are quoted from the plan.
const FIT_CHECK_PASSED='Checked in a browser on the server — no fit problems found.';
const FIT_CHECK_PASSED_NO_ARTWORK='Checked in a browser on the server — no fit problems found. The artwork was not loaded on the server; confirm it in the editor.';
const FIT_CHECK_UNAVAILABLE='The server could not open a browser to check this graphic. Open Fit check and review it yourself.';
/**
 * Builds the cue an editable draft would produce without storing anything: no draft row, no
 * preview record, nothing a publication could later cite. Every ephemeral preview goes through
 * here so a look at a graphic can never leave a trace in the library.
 */
function ephemeralCue(editable:EditableDraft,who:string,cueId?:string){
 const sourceSnapshots=sourceSnapshotsFor(editable.content);const now=Date.now();
 const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots),...(sourceSnapshots.length?{sourceSnapshots}:{}),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
 // A look at a catalog graphic reports it under the id the catalog publishes it as, so a fit
 // check measures the graphic a person asked for rather than a throwaway draft id.
 const cue={...buildCue(draft),...(cueId?{id:cueId}:{})};
 return {cue,validation:previewValidation(cue),ephemeral:true as const,fitContract:structuredClone(FIT_CONTRACT)};
}
function editableOnly(draft:Draft):EditableDraft{return {name:draft.name,title:draft.title,accentTitle:draft.accentTitle,layout:draft.layout,templateCueId:draft.templateCueId,content:draft.content,presentation:draft.presentation}}
function copyLabel(name:string){const prefix='Copy of ';return `${prefix}${name}`.slice(0,80).trim()}
function editableFromCatalogCue(cueId:string):EditableDraft{
 try{return editableFromWorkspaceBaseline(cueId)}catch(error){
  const cue=workspaceCatalogCue(cueId);if(!cue)throw new AuthoringError('unknown_cue','Unknown catalog cue',404);
  const body=cue.texts.textMain;if(typeof body!=='string'||!body.trim())throw error;
  return {name:cue.name,title:cue.texts.textTitle,accentTitle:cue.texts.accentTextTitle,layout:cue.layout as EditableDraft['layout'],templateCueId:baselineSourceCueId(cue.id),content:{mode:'custom',text:body},presentation:(cue as AuthoringCue).presentation??{}};
 }
}
const conflict=()=>new AuthoringError('version_conflict','Draft version changed; reload before editing',409);
async function requiredDraft(repo:AuthoringRepository,id:string){const draft=await repo.getDraft(id);if(!draft)throw new AuthoringError('unknown_draft','Unknown draft',404);return draft}
async function versionedDraft(repo:AuthoringRepository,id:string,version:number){const draft=await requiredDraft(repo,id);if(draft.version!==version)throw conflict();return draft}
async function requiredPreview(repo:AuthoringRepository,id:string){const preview=await repo.getPreview(id);if(!preview)throw new AuthoringError('unknown_preview','Unknown preview',404);return preview}

export class MemoryAuthoringRepository implements AuthoringRepository{
 constructor(private assets?:AssetRepository){}
 drafts=new Map<string,Draft>(); previews=new Map<string,PreviewRecord>(); revisionRows=new Map<string,Revision[]>();
 async listDrafts(){return [...this.drafts.values()].map(clone).sort((a,b)=>b.updatedAt-a.updatedAt)} async getDraft(id:string){const d=this.drafts.get(id);return d?clone(d):null}
 async insertDraft(d:Draft){if(this.drafts.has(d.id))throw new AuthoringError('draft_exists','Draft already exists',409);this.drafts.set(d.id,clone(d));return clone(d)}
 async insertDraftSet(drafts:Draft[]){const ids=drafts.map(draft=>draft.id);if(new Set(ids).size!==ids.length||ids.some(id=>this.drafts.has(id)))throw new AuthoringError('draft_exists','Draft already exists',409);for(const draft of drafts)this.drafts.set(draft.id,clone(draft));return clone(drafts)}
 async insertImportedDraft(d:Draft,cue:AuthoringCue,actor:string){if(this.drafts.has(d.id))throw new AuthoringError('draft_exists','Draft already exists',409);const row:Revision={draftId:d.id,revision:1,draftVersion:1,cueHash:cueHash(cue),cue:clone(cue),previewId:null,review:null,actor,createdAt:Date.now(),sourceCommits:revisionSourceCommits(cue)};d.activeRevision=1;d.activeDraftVersion=1;this.drafts.set(d.id,clone(d));this.revisionRows.set(d.id,[row]);return clone(d)}
 async updateDraft(id:string,v:number,e:DraftUpdate,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)return null;const sourceSnapshots=e.sourceSnapshots??d.sourceSnapshots;const sourcePin=e.sourcePin??sourcePinFor(e.content,sourceSnapshots,sourceSnapshots?.length?d.sourcePin.feedSha256:undefined);const next={...d,...clone(e),sourceSnapshots,version:v+1,sourcePin,updatedAt:Date.now(),updatedBy:actor};this.drafts.set(id,next);return clone(next)}
 async setArchived(id:string,v:number,archived:boolean,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)return null;const next:Draft={...d,version:v+1,updatedAt:Date.now(),updatedBy:actor,...(archived?{archivedAt:Date.now(),archivedBy:actor}:{archivedAt:undefined,archivedBy:undefined})};this.drafts.set(id,next);return clone(next)}
 async setDraftSetArchived(setId:string,expectedIds:string[],archived:boolean,actor:string){const members=[...this.drafts.values()].filter(d=>d.draftSetId===setId&&Boolean(d.archivedAt)===!archived).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds))throw conflict();const now=Date.now(),result=members.map(draft=>({...draft,version:draft.version+1,updatedAt:now,updatedBy:actor,...(archived?{archivedAt:now,archivedBy:actor}:{archivedAt:undefined,archivedBy:undefined})}));for(const draft of result)this.drafts.set(draft.id,draft);return clone(result)}
 async reorderDraftSet(setId:string,expectedIds:string[],orderedIds:string[],actor:string){const members=[...this.drafts.values()].filter(d=>d.draftSetId===setId&&!d.archivedAt).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds))throw conflict();const byId=new Map(members.map(d=>[d.id,d]));if(orderedIds.length!==members.length||new Set(orderedIds).size!==members.length||orderedIds.some(id=>!byId.has(id)))throw new AuthoringError('invalid_set_order','orderedDraftIds must be the complete draft set',400);const now=Date.now();const result=orderedIds.map((id,index)=>({...byId.get(id)!,setIndex:index+1,setCount:members.length,updatedAt:now,updatedBy:actor}));for(const draft of result)this.drafts.set(draft.id,draft);return clone(result)}
 async duplicateDraftInSet(sourceId:string,v:number,expectedIds:string[],duplicate:Draft,actor:string){const source=this.drafts.get(sourceId);if(!source||source.version!==v||!source.draftSetId)throw conflict();const members=[...this.drafts.values()].filter(d=>d.draftSetId===source.draftSetId&&!d.archivedAt).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds)||this.drafts.has(duplicate.id))throw conflict();const offset=members.findIndex(d=>d.id===sourceId);if(offset<0)throw conflict();const ordered=[...members.slice(0,offset+1),duplicate,...members.slice(offset+1)];const now=Date.now();for(const [index,draft] of ordered.entries()){draft.setIndex=index+1;draft.setCount=ordered.length;draft.updatedAt=now;draft.updatedBy=actor;this.drafts.set(draft.id,clone(draft))}return clone(ordered)}
 async insertPreview(p:PreviewRecord){this.previews.set(p.id,clone(p))} async getPreview(id:string){const p=this.previews.get(id);return p?clone(p):null} async saveReview(id:string,r:ReviewReceipt){const p=this.previews.get(id);if(!p)throw new AuthoringError('unknown_preview','Unknown preview',404);p.review=clone(r)}
 async saveFitCheck(id:string,f:ServerFitCheck){const p=this.previews.get(id);if(!p)throw new AuthoringError('unknown_preview','Unknown preview',404);p.fitCheck=clone(f)}
 async publish(id:string,v:number,previewId:string,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const p=this.previews.get(previewId);validatePublishPreview(d,p);const assetId=cueAssetId(p!.cue);if(assetId&&(!this.assets||!await this.assets.markPublished(assetId,Date.now())))throw new AuthoringError('asset_unavailable','Selected artwork is unavailable or archived',409);const rows=this.revisionRows.get(id)??[];let row=rows.find(r=>r.draftVersion===v&&r.cueHash===p!.cueHash);if(!row){row={draftId:id,revision:rows.length+1,draftVersion:v,cueHash:p!.cueHash,cue:clone(p!.cue),previewId,review:clone(p!.review!),actor,createdAt:Date.now(),sourceCommits:revisionSourceCommits(p!.cue)};rows.push(row);this.revisionRows.set(id,rows)}d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return clone(row)}
 async revisions(id:string){return clone(this.revisionRows.get(id)??[])}
 async rollback(id:string,v:number,revision:number,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const row=(this.revisionRows.get(id)??[]).find(r=>r.revision===revision);if(!row)throw new AuthoringError('unknown_revision','Unknown revision',404);d.version++;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return {draft:clone(d),revision:clone(row)}}
 async published(){return [...this.drafts.values()].filter(d=>d.activeRevision!==null).map(d=>clone((this.revisionRows.get(d.id)??[]).find(r=>r.revision===d.activeRevision)!.cue))}
}

/**
 * An MCP actor is exactly an actor minted by the OAuth store, whose ids are `mcp:<client>`
 * (lib/oauth-store.ts). Web sessions carry a member id, `device:<id>` or a legacy key name.
 */
export function isMcpActor(actor:string){return actor.startsWith('mcp:')}
/** The web dock path, unchanged: the caller's own browser measurement, validated as before. */
function assertedMeasurement(data:Record<string,unknown>):BrowserMeasurement{
 const m=object(data.browserMeasurement,'browserMeasurement');keys(m,['viewportWidth','viewportHeight','fontsReady','overflow','rendererVersion','measuredAt'],'browserMeasurement');
 if(m.viewportWidth!==1920||m.viewportHeight!==1080||m.fontsReady!==true||m.overflow!==false)throw new AuthoringError('fit_failed','Preview must be measured at 1920x1080 with loaded fonts and no overflow',409);
 return {viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:string(m.rendererVersion,'rendererVersion',80),measuredAt:integer(m.measuredAt,'measuredAt',1)};
}
/** The D18 path: only what a server browser measured on this preview, never what was claimed. */
function attestedMeasurement(preview:PreviewRecord):BrowserMeasurement{
 const stored=preview.fitCheck;
 if(!stored||stored.verdict!=='pass'||!stored.rendererVersion.startsWith(SERVER_RENDERER_PREFIX))
  throw new AuthoringError('review_required','Exact-version browser fit review is required',409);
 return {viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:stored.rendererVersion,measuredAt:stored.measuredAt};
}
/**
 * One slot's text, published under its standing approval. Unchanged text publishes nothing:
 * a Save that moved one name must not mint fifteen identical revisions of the slots beside it.
 */
async function publishSlotText(repo:AuthoringRepository,key:string,cueId:string,text:string,who:string){
 const current=await repo.getDraft(cueId);
 if(!current)throw new AuthoringError('unknown_draft','That slot graphic no longer exists',404);
 if(current.content.mode!=='custom')throw new AuthoringError('unknown_slot','That graphic is not a slot',409);
 if(current.content.text===text&&current.activeRevision!==null)return {key,cueId,text,published:false};
 const updated=await repo.updateDraft(cueId,current.version,{...editableOnly(current),content:{mode:'custom',text}},who);
 if(!updated)throw conflict();
 const cue=buildCue(updated);
 // A slot with nothing typed in it carries only its title bar, which previewValidation would
 // otherwise call "no text yet". An empty slot drawing nothing is the point.
 const validation=previewValidation(cue,true);
 if(!validation.valid)throw new AuthoringError('invalid_preview',validation.errors.join(' '),409);
 const preview:PreviewRecord={id:randomUUID(),draftId:updated.id,draftVersion:updated.version,cueHash:cueHash(cue),cue,validation,review:null,createdAt:Date.now(),createdBy:who};
 await repo.insertPreview(preview);
 await repo.saveReview(preview.id,{humanApproved:true,standingApproval:`slot:${key}`,reviewedAt:Date.now(),reviewedBy:who});
 await repo.publish(updated.id,updated.version,preview.id,who);
 return {key,cueId,text,published:true};
}
function validatePublishPreview(draft:Draft,preview?:PreviewRecord){
 if(!preview)throw new AuthoringError('unknown_preview','Unknown preview',404);
 if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);
 if(!preview.validation.valid)throw new AuthoringError('invalid_preview','Preview validation failed',409);
 const review=preview.review;
 if(!review?.humanApproved)throw new AuthoringError('review_required','Exact-version browser fit review is required',409);
 // A standing approval stands in for the measurement, and only for a slot's text. Everything
 // else still needs a browser that actually looked at this exact version.
 if(review.standingApproval)return;
 if(!review.browserMeasurement||review.browserMeasurement.overflow||!review.browserMeasurement.fontsReady)throw new AuthoringError('review_required','Exact-version browser fit review is required',409);
}
function assertRevisionAuthority(cue:AuthoringCue){
 const value=cue as AuthoringCue&{provenance?:{liturgy?:{feedSha256?:string}}};
 if(value.authoring?.origin==='local'){if(value.authoring.feedSha256!=='local'||value.authoring.sourceIds.length)throw new AuthoringError('source_pin_mismatch','Local revision authority is invalid',409);return}
 const feed=value.authoring?.feedSha256??value.provenance?.liturgy?.feedSha256;if(feed!==sourcePack.authority.feedSha256)throw new AuthoringError('source_pin_mismatch','Revision source authority no longer matches the pinned feed',409);
 if(!value.authoring)return;
 const sources=value.authoring.sourceIds.map(id=>sourcePack.sources.find(item=>item.id===id));if(sources.some(item=>!item))throw new AuthoringError('source_pin_mismatch','A revision source is no longer available',409);
 const units=Object.fromEntries(sources.map(item=>[item!.id,item!.unitSha256]));if(!sameStructuredValue(units,value.authoring.unitSha256))throw new AuthoringError('source_pin_mismatch','Revision source units no longer match the pinned authority',409);
 const expanded=Object.fromEntries(sources.filter(item=>item!.id.startsWith('library:')).map(item=>{const source=item!;if(!source.authority||!source.sourceSha256)throw new AuthoringError('source_pin_mismatch','Expanded revision source authority is unavailable',409);return [source.id,{id:source.authority.id,feedSha256:source.authority.feedSha256,unitSha256:source.authority.unitSha256,sourceSha256:source.sourceSha256}]}));
 if(Object.keys(expanded).length&&!sameStructuredValue(expanded,value.authoring.sourceAuthority))throw new AuthoringError('source_pin_mismatch','Expanded revision authority no longer matches its source feed',409);
}
/* Wave 2 item 7b - the producer commits behind a revision's sources, for `authoring_revisions.
   source_commits`. It reads the same pack `assertRevisionAuthority` has just checked the revision
   against, so a stamp is only ever written for sources that still match their pinned authority.
   NULL for a local cue, which has no upstream source to name. */
function revisionSourceCommits(cue:AuthoringCue):string[]|null{
 const value=cue as AuthoringCue&{authoring?:{origin?:string;sourceIds?:string[]}};
 if(!value.authoring||value.authoring.origin==='local')return null;
 const commits=new Set<string>();
 for(const id of value.authoring.sourceIds??[]){
  const commit=(sourcePack.sources.find(item=>item.id===id) as {authority?:{repositoryCommit?:string}}|undefined)?.authority?.repositoryCommit;
  if(commit)commits.add(commit);
 }
 return commits.size?[...commits].sort():null;
}
const clone=<T>(value:T):T=>structuredClone(value);

export type SignatureSnapshot<T>={signature:string;value:T};
export function signatureCache<T>(signature:()=>Promise<string>,load:()=>Promise<SignatureSnapshot<T>>){
 let cached:{signature:string;value:T}|undefined;
 let pending:{signature:string;value:Promise<T>}|undefined;
 return async()=>{
  const current=await signature();
  if(cached?.signature===current)return cached.value;
  if(pending?.signature===current)return pending.value;
  const value=load().then(snapshot=>{cached=snapshot;return snapshot.value});
  pending={signature:current,value};
  try{return await value}finally{if(pending?.value===value)pending=undefined}
 };
}

export const PUBLISHED_SIGNATURE_SQL=`SELECT COALESCE(md5(string_agg(id || ':' || active_revision::text, ',' ORDER BY id)),md5('')) AS signature
FROM authoring_drafts
WHERE active_revision IS NOT NULL`;
export const PUBLISHED_CUES_SQL=`WITH active AS MATERIALIZED (
 SELECT id,active_revision,updated_at FROM authoring_drafts WHERE active_revision IS NOT NULL
)
SELECT COALESCE(json_agg(r.cue ORDER BY active.updated_at DESC),'[]'::json) AS cues,
 COALESCE(md5(string_agg(active.id || ':' || active.active_revision::text, ',' ORDER BY active.id)),md5('')) AS signature
FROM active
JOIN authoring_revisions r ON r.draft_id=active.id AND r.revision=active.active_revision`;

export class PgAuthoringRepository implements AuthoringRepository{
 private async db(){return (await import('./database')).db}
 private readonly publishedCache=signatureCache(
  async()=>String((await (await this.db()).query(PUBLISHED_SIGNATURE_SQL)).rows[0]?.signature??''),
  async()=>{const row=(await (await this.db()).query(PUBLISHED_CUES_SQL)).rows[0] as {signature:string;cues:AuthoringCue[]};return {signature:String(row.signature),value:row.cues}},
 );
 async listDrafts(){return (await (await this.db()).query('SELECT document FROM authoring_drafts ORDER BY updated_at DESC')).rows.map((r:{document:Draft})=>r.document)}
 async getDraft(id:string){return (await (await this.db()).query('SELECT document FROM authoring_drafts WHERE id=$1',[id])).rows[0]?.document??null}
 async insertDraft(d:Draft){await (await this.db()).query('INSERT INTO authoring_drafts(id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$4,$5,$5)',[d.id,d,d.version,d.createdAt,d.createdBy]);return d}
 async insertDraftSet(drafts:Draft[]){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');for(const draft of drafts)await client.query('INSERT INTO authoring_drafts(id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$4,$5,$5)',[draft.id,draft,draft.version,draft.createdAt,draft.createdBy]);await client.query('COMMIT');return drafts}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 async insertImportedDraft(d:Draft,cue:AuthoringCue,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');d.activeRevision=1;d.activeDraftVersion=1;await client.query('INSERT INTO authoring_drafts(id,document,version,active_revision,active_draft_version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,1,1,$3,$3,$4,$4)',[d.id,d,d.createdAt,actor]);await client.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,preview_id,review,actor,created_at,source_commits) VALUES($1,1,1,$2,$3,NULL,NULL,$4,$5,$6)',[d.id,cueHash(cue),cue,actor,Date.now(),revisionSourceCommits(cue)]);await client.query('COMMIT');return d}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async updateDraft(id:string,v:number,e:DraftUpdate,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const locked=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const current=locked.rows[0]?.document as Draft|undefined;if(!current){await client.query('ROLLBACK');return null}const sourceSnapshots=e.sourceSnapshots??current.sourceSnapshots;const sourcePin=e.sourcePin??sourcePinFor(e.content,sourceSnapshots,sourceSnapshots?.length?current.sourcePin.feedSha256:undefined);const next:Draft={...current,...e,sourceSnapshots,version:v+1,sourcePin,updatedAt:Date.now(),updatedBy:actor};await client.query('UPDATE authoring_drafts SET document=$2,version=$3,updated_at=$4,updated_by=$5 WHERE id=$1',[id,next,next.version,next.updatedAt,actor]);await client.query('COMMIT');return next}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async setArchived(id:string,v:number,archived:boolean,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const row=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const current=row.rows[0]?.document as Draft|undefined;if(!current){await client.query('ROLLBACK');return null}const now=Date.now();const next:Draft={...current,version:v+1,updatedAt:now,updatedBy:actor,...(archived?{archivedAt:now,archivedBy:actor}:{archivedAt:undefined,archivedBy:undefined})};await client.query('UPDATE authoring_drafts SET document=$2,version=$3,updated_at=$4,updated_by=$5 WHERE id=$1',[id,next,next.version,now,actor]);await client.query('COMMIT');return next}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 async setDraftSetArchived(setId:string,expectedIds:string[],archived:boolean,actor:string){const db=await this.db(),client=await db.connect();try{await client.query('BEGIN');const rows=await client.query("SELECT document FROM authoring_drafts WHERE document->>'draftSetId'=$1 AND COALESCE((document ? 'archivedAt'),false)=$2 FOR UPDATE",[setId,!archived]);const members=(rows.rows as Array<{document:Draft}>).map(row=>row.document).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds))throw conflict();const now=Date.now(),result=members.map(draft=>({...draft,version:draft.version+1,updatedAt:now,updatedBy:actor,...(archived?{archivedAt:now,archivedBy:actor}:{archivedAt:undefined,archivedBy:undefined})}));for(const draft of result)await client.query('UPDATE authoring_drafts SET document=$2,version=$3,updated_at=$4,updated_by=$5 WHERE id=$1',[draft.id,draft,draft.version,now,actor]);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 async reorderDraftSet(setId:string,expectedIds:string[],orderedIds:string[],actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const rows=await client.query("SELECT document FROM authoring_drafts WHERE document->>'draftSetId'=$1 AND document->>'archivedAt' IS NULL FOR UPDATE",[setId]);const members=(rows.rows as Array<{document:Draft}>).map(row=>row.document).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds))throw conflict();const byId=new Map(members.map(d=>[d.id,d]));if(orderedIds.length!==members.length||new Set(orderedIds).size!==members.length||orderedIds.some(id=>!byId.has(id)))throw new AuthoringError('invalid_set_order','orderedDraftIds must be the complete draft set');const now=Date.now();const result=orderedIds.map((id,index)=>({...byId.get(id)!,setIndex:index+1,setCount:members.length,updatedAt:now,updatedBy:actor}));for(const draft of result)await client.query('UPDATE authoring_drafts SET document=$2,updated_at=$3,updated_by=$4 WHERE id=$1',[draft.id,draft,now,actor]);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 async duplicateDraftInSet(sourceId:string,v:number,expectedIds:string[],duplicate:Draft,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const sourceRow=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[sourceId,v]);const source=sourceRow.rows[0]?.document as Draft|undefined;if(!source?.draftSetId)throw conflict();const rows=await client.query("SELECT document FROM authoring_drafts WHERE document->>'draftSetId'=$1 AND document->>'archivedAt' IS NULL FOR UPDATE",[source.draftSetId]);const members=(rows.rows as Array<{document:Draft}>).map(row=>row.document).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds))throw conflict();const offset=members.findIndex(d=>d.id===sourceId);if(offset<0)throw conflict();const ordered=[...members.slice(0,offset+1),duplicate,...members.slice(offset+1)];const now=Date.now();for(const [index,draft] of ordered.entries()){draft.setIndex=index+1;draft.setCount=ordered.length;draft.updatedAt=now;draft.updatedBy=actor;if(draft.id===duplicate.id)await client.query('INSERT INTO authoring_drafts(id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,$3,$3,$4,$4)',[draft.id,draft,now,actor]);else await client.query('UPDATE authoring_drafts SET document=$2,updated_at=$3,updated_by=$4 WHERE id=$1',[draft.id,draft,now,actor])}await client.query('COMMIT');return ordered}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 async insertPreview(p:PreviewRecord){await (await this.db()).query('INSERT INTO authoring_previews(id,draft_id,draft_version,cue_hash,cue,validation,review,created_at,created_by) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8)',[p.id,p.draftId,p.draftVersion,p.cueHash,p.cue,p.validation,p.createdAt,p.createdBy])}
 async getPreview(id:string){const r=(await (await this.db()).query('SELECT id,draft_id AS "draftId",draft_version AS "draftVersion",cue_hash AS "cueHash",cue,validation,review,created_at AS "createdAt",created_by AS "createdBy" FROM authoring_previews WHERE id=$1',[id])).rows[0];if(!r)return null;const {serverFitCheck,...validation}=(r.validation??{}) as Record<string,unknown>;return {...r,validation,fitCheck:(serverFitCheck as ServerFitCheck|undefined)??null}}
 async saveReview(id:string,r:ReviewReceipt){await (await this.db()).query('UPDATE authoring_previews SET review=$2 WHERE id=$1',[id,r])}
 // Phase D adds no migration, so the server-attested measurement is stored inside the
 // preview's own `validation` document rather than in a new column. It is read back out by
 // getPreview above, so nothing outside this repository sees the storage shape.
 async saveFitCheck(id:string,f:ServerFitCheck){const r=await (await this.db()).query("UPDATE authoring_previews SET validation=jsonb_set(COALESCE(validation,'{}'::jsonb),'{serverFitCheck}',$2::jsonb,true) WHERE id=$1",[id,JSON.stringify(f)]);if(!r.rowCount)throw new AuthoringError('unknown_preview','Unknown preview',404)}
 async publish(id:string,v:number,previewId:string,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const dr=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const d=dr.rows[0]?.document as Draft|undefined;if(!d)throw conflict();const pr=await client.query('SELECT id,draft_id AS "draftId",draft_version AS "draftVersion",cue_hash AS "cueHash",cue,validation,review,created_at AS "createdAt",created_by AS "createdBy" FROM authoring_previews WHERE id=$1',[previewId]);const p=pr.rows[0] as PreviewRecord|undefined;validatePublishPreview(d,p);let rr=await client.query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt",source_commits AS "sourceCommits" FROM authoring_revisions WHERE draft_id=$1 AND draft_version=$2 AND cue_hash=$3',[id,v,p!.cueHash]);if(!rr.rows[0])rr=await client.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,preview_id,review,actor,created_at,source_commits) SELECT $1,COALESCE(MAX(revision),0)+1,$2,$3,$4,$5,$6,$7,$8,$9 FROM authoring_revisions WHERE draft_id=$1 RETURNING draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt",source_commits AS "sourceCommits"',[id,v,p!.cueHash,p!.cue,previewId,p!.review,actor,Date.now(),revisionSourceCommits(p!.cue)]);try{await markCueAssetPublished(client,p!.cue)}catch(error){if(error instanceof AssetError)throw new AuthoringError(error.code,error.message,error.status);throw error}const row=rr.rows[0] as Revision;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;await client.query('UPDATE authoring_drafts SET document=$2,active_revision=$3,active_draft_version=$4,updated_at=$5,updated_by=$6 WHERE id=$1',[id,d,row.revision,row.draftVersion,d.updatedAt,actor]);await client.query('COMMIT');return row}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async revisions(id:string){return (await (await this.db()).query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt",source_commits AS "sourceCommits" FROM authoring_revisions WHERE draft_id=$1 ORDER BY revision DESC',[id])).rows}
 async rollback(id:string,v:number,revision:number,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const dr=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const d=dr.rows[0]?.document as Draft|undefined;if(!d)throw conflict();const rr=await client.query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt",source_commits AS "sourceCommits" FROM authoring_revisions WHERE draft_id=$1 AND revision=$2',[id,revision]);const row=rr.rows[0] as Revision|undefined;if(!row)throw new AuthoringError('unknown_revision','Unknown revision',404);d.version++;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;await client.query('UPDATE authoring_drafts SET document=$2,version=$3,active_revision=$4,active_draft_version=$5,updated_at=$6,updated_by=$7 WHERE id=$1',[id,d,d.version,row.revision,row.draftVersion,d.updatedAt,actor]);await client.query('COMMIT');return {draft:d,revision:row}}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async published(){return this.publishedCache()}
}

export function authoringRepositoryMode(env:Partial<Pick<NodeJS.ProcessEnv,'CRC_AUTHORING_REHEARSAL'|'NODE_ENV'|'RELAY_URL'|'VERCEL'>>):AuthoringWorkspace{
 if(env.CRC_AUTHORING_REHEARSAL!=='1')return {rehearsal:false,storage:'postgres',label:null};
 // RELAY_URL=memory is the in-process rehearsal stub, not a live relay, so it does not
 // trip the fail-closed check.
 if(env.NODE_ENV!=='development'||env.VERCEL||liveRelayConfigured(env))throw new AuthoringError('unsafe_rehearsal_config','In-memory authoring is allowed only in development with no live relay configured',503);
 return {rehearsal:true,storage:'memory',label:'Local rehearsal — changes are temporary'};
}
let defaultService:ReturnType<typeof createAuthoringService>|undefined;
let defaultRepository:AuthoringRepository|undefined;
export function authoringRepository(){if(defaultRepository)return defaultRepository;const workspace=authoringRepositoryMode(process.env);return defaultRepository=workspace.storage==='memory'?new MemoryAuthoringRepository(defaultAssetRepository()):new PgAuthoringRepository()}
const defaults=()=>{if(defaultService)return defaultService;const workspace=authoringRepositoryMode(process.env);return defaultService=createAuthoringService(authoringRepository(),workspace)};
export async function authoringOperation(operation:string,input:unknown,actor:string){
 const result=await defaults().operation(operation,input,actor);
 if(['publish_draft','save_slots','rollback_draft','import_cue'].includes(operation)){
  const {relayConfigured}=await import('./relay');
  if(relayConfigured()){
   try{const {syncLiveCatalog}=await import('./sync-live-catalog');await syncLiveCatalog()}
   catch{return {...(result as Record<string,unknown>),liveRefreshPending:true,warning:'Saved successfully, but the live library has not received this update. Use Sync live library in the editor after the connection recovers. Live playback continues using the last synchronized version.'}}
  }
 }
 return result;
}
export async function publishedCues():Promise<Cue[]>{return defaults().publishedCues()}
