import {isLayoutId,layoutChoices,layoutDefinition} from './layout-registry';
import {createHash,randomUUID} from 'node:crypto';
import type {Cue} from './player';
import {AuthoringError,assertSourcePin,staleSourceIds,baselineCues,buildCue,cueHash,draftSetSelections,editableFromBaseline,newDraftId,normalizeGraphicName,parseEditable,previewValidation,resolveSourceBoundaries,sameStructuredValue,sourceBlockFor,sourcePack,sourcePinFor,sourceReferences,sourceSnapshotsFor,type AuthoringCue,type BilingualContent,type CanonicalContent,type Draft,type DraftContent,type DraftSetSelection,type EditableDraft,type Layout,type LocalVariantContent,type LocalVariantOverride,type VariantChannel,type SourceBlock,type SharedCueUpstream} from './authoring-model';
import {compactDraftCatalog,type DraftCatalogInput} from './draft-catalog';
import {planDraftStyle,type DraftStyleOptions,type DraftStylePlan} from './authoring-style';
import {DEFAULTS_APPLY_ON,DEFAULT_FIELDS,mergeDefaultsPatch,sequenceLayoutFor,withCreateDefaultBilingualBlocks,withHouseCreateDefaults,withHouseDefaults,type AuthoringDefaults,type DefaultsReport} from './authoring-defaults';
import {MemoryAuthoringDefaultsRepository,PgAuthoringDefaultsRepository,defaultsConflict,type AuthoringDefaultsRepository} from './authoring-defaults-store';
import {parseSharedBatchItems,planSharedBatch,type SharedBatchItem} from './shared-batch';
import {LAYER_ORDER,isRetiredDraft,parseRowOrder} from './authoring-model';
import {layoutLabel,templateLayoutFor} from './layout-label';
import {TEXT_SIZE_IDS,TEXT_SIZE_PRESETS,templateLooks,withTextSize,type TemplateLookMode,type TextSizePreset} from './template-looks';
import {CUSTOM_TEMPLATES,customTemplate,customTemplateProblems,describeCustomTemplate} from './custom-templates';
// One source of truth for how much liturgy one panel holds, shared with the editor so a
// selection warning and a server split can never disagree.
import {PANEL_BLOCK_LIMIT,blockCharacters,panelCharacterBudget} from './panel-budget';
import {baselineCatalogForWorkspace,starterSourceMap} from './workspace-catalog';
import {sourceDisplay} from './source-library';
import {wordingChanges} from './wording-changes';
import {sharedCueHash,sharedLibraryClient,type SharedLibraryEntry,type SharedLibraryPayload,type SharedLibrarySnapshot} from './shared-library';
import {compareUpstream,groupSets,setState,shelfState} from './shared-shelf';
import {AssetError,cueAssetId,defaultAssetRepository,defaultAssetUploadStore,importSharedAsset,markCueAssetPublished,signedCueArtworkPath,type AssetRepository,type AssetUploadStore} from './assets';
import {assetToolOperation,isAssetTool} from './asset-tools';
import {liveRelayConfigured} from './rehearsal';
// Only the contract, never the browser: lib/server-fit.ts is reached exclusively through the
// dynamic import in defaultServerFitRunner, so playwright-core and the Chromium pack stay out
// of the function trace of every entrypoint that touches the authoring service.
import {SERVER_RENDERER_PREFIX,type ServerFitArtwork,type ServerFitResult} from './server-fit-contract';
import {isServiceTool} from './service-tool-schemas';
import {MemoryLocalSourceRepository,PgLocalSourceRepository,currentWorkspaceId,isLocalSourceId,isLocalSourceTool,localProvenance,localSourceOperation,localSourceUnit,type LocalSourceRepository} from './local-sources';
// T4 - kept here rather than imported, so lib/review-board.ts loads only when a board is used.
const REVIEW_BOARD_OPERATIONS=new Set(['create_review_board','get_review_board','update_review_board']);
import {isHygieneTool} from './catalog-hygiene-schemas';
import {isDeckTool} from './companion-deck/tool-schemas';

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
/**
 * R-A1 - who approved: `agent` (an MCP actor, on the server's own fit check) or `person` (a
 * signed-in member, or anything that is not an MCP actor), and the member behind it - the
 * approving member for an agent's connection, the member id itself for a person. Receipts
 * written before R-A1 carry only `humanApproved:true`, which still satisfies the publish gate;
 * a person's receipt keeps writing it, an agent's no longer claims it.
 */
export type ReviewApprover='agent'|'person';
export type ReviewReceipt={approvedBy?:ReviewApprover;member?:string|null;humanApproved?:true;browserMeasurement?:BrowserMeasurement;standingApproval?:string;reviewedAt:number;reviewedBy:string};
/** R-A2 - the frame the server fit captured, kept with its preview so a person sees what the agent saw. */
export type StoredFitImage={mimeType:'image/jpeg'|'image/png';width:number;height:number;data:Buffer};
export type StoredFitImageInfo={mimeType:string;width:number;height:number;byteSize:number};
/** The screenshot cap in lib/server-fit.ts; a stored frame is never larger than one it can return. */
export const STORED_FIT_IMAGE_MAX_BYTES=750_000;
/** One publication as `list_recent_publications` reads it: the revision without its cue body. */
export type PublicationRecord={draftId:string;revision:number;draftVersion:number;cueHash:string;previewId:string|null;review:ReviewReceipt|null;actor:string;createdAt:number;name:string;layout:string;texts:Record<string,unknown>};
// D17/D18 - the server-attested fit measurement `fit_check_draft` writes onto the preview it
// measured. It is version-bound by construction: it lives on one preview, which is already
// bound to one draft version and one cue hash.
// `artwork` is a label, not a gate: the stage cannot load artwork through the author-only
// asset route, so a server `pass` says nothing about it and the attestation records that.
export type ServerFitCheck={verdict:'pass'|'fail';fitErrors:string[];warnings:string[];fill:number|null;artwork:ServerFitArtwork;measuredAt:number;rendererVersion:string};
export type PreviewRecord={id:string;draftId:string;draftVersion:number;cueHash:string;cue:AuthoringCue;validation:ReturnType<typeof previewValidation>;review:ReviewReceipt|null;fitCheck?:ServerFitCheck|null;createdAt:number;createdBy:string};
export type Revision={draftId:string;revision:number;draftVersion:number;cueHash:string;cue:AuthoringCue;previewId:string|null;review:ReviewReceipt|null;actor:string;createdAt:number;sourceCommits:string[]|null};

type DraftUpdate=EditableDraft&Partial<Pick<Draft,'sourceSnapshots'|'sourcePin'>>;
/** A retired graphic, by cue id: what the live catalog, services and deck checks leave out or flag. */
export type RetiredCue={id:string;name:string;retiredAt:number};
// The next document for a retire or a restore; null when the draft is not in the state that allows it.
function retirementUpdate(current:Draft,expectedVersion:number,retired:boolean,actor:string,now:number):Draft|null{
 if(current.version!==expectedVersion)return null;
 const base={...current,version:expectedVersion+1,updatedAt:now,updatedBy:actor};
 if(retired){if(current.activeRevision===null||current.activeDraftVersion===null)return null;return {...base,activeRevision:null,activeDraftVersion:null,retired:{revision:current.activeRevision,draftVersion:current.activeDraftVersion,retiredAt:now,retiredBy:actor}}}
 if(!isRetiredDraft(current))return null;
 const {retired:was,...rest}=base;return {...rest,activeRevision:was!.revision,activeDraftVersion:was!.draftVersion};
}

export interface AuthoringRepository{
 listDrafts():Promise<Draft[]>; getDraft(id:string):Promise<Draft|null>; insertDraft(draft:Draft):Promise<Draft>; insertDraftSet(drafts:Draft[]):Promise<Draft[]>; insertImportedDraft(draft:Draft,cue:AuthoringCue,actor:string):Promise<Draft>;
 updateDraft(id:string,expectedVersion:number,editable:DraftUpdate,actor:string):Promise<Draft|null>;
 setArchived(id:string,expectedVersion:number,archived:boolean,actor:string):Promise<Draft|null>;
 setDraftSetArchived(setId:string,expectedIds:string[],archived:boolean,actor:string):Promise<Draft[]>;
 // MCP plan A3: withdraw a published graphic from the live catalog (or bring the same revision back).
 setRetired(id:string,expectedVersion:number,retired:boolean,actor:string):Promise<Draft|null>;
 retiredCues():Promise<RetiredCue[]>;
 reorderDraftSet(setId:string,expectedIds:string[],orderedIds:string[],actor:string):Promise<Draft[]>;
 duplicateDraftInSet(sourceId:string,expectedVersion:number,expectedIds:string[],duplicate:Draft,actor:string):Promise<Draft[]>;
 insertPreview(preview:PreviewRecord):Promise<void>; getPreview(id:string):Promise<PreviewRecord|null>; saveReview(id:string,review:ReviewReceipt):Promise<void>; saveFitCheck(id:string,fitCheck:ServerFitCheck):Promise<void>;
 publish(id:string,expectedVersion:number,previewId:string,actor:string):Promise<Revision>;
 revisions(id:string):Promise<Revision[]>; rollback(id:string,expectedVersion:number,revision:number,actor:string):Promise<{draft:Draft;revision:Revision}>;
 published():Promise<AuthoringCue[]>;
 saveFitImage(previewId:string,image:StoredFitImage):Promise<void>; getFitImage(previewId:string):Promise<StoredFitImage|null>; fitImageInfo(previewIds:string[]):Promise<Map<string,StoredFitImageInfo>>;
 recentPublications(since:number,limit:number,publisher?:ReviewApprover):Promise<PublicationRecord[]>;
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
type AuthoringSourceLike=(typeof sourcePack.sources)[number];
type SearchSource=(typeof sourcePack.sources)[number]&{book?:string;service?:string;aliases?:string[];openingWords?:string[];metadata?:Record<string,unknown>};
const sourceBook=(source:SearchSource)=>{const value=typeof source.metadata?.bookSlug==='string'?source.metadata.bookSlug:source.book??'';const label=typeof source.metadata?.bookTitle==='string'?source.metadata.bookTitle:source.book??value;return {value,label}};
const sourceService=(source:SearchSource)=>({value:source.service??'',label:source.service??''});
const browseEquivalence=(source:SearchSource)=>JSON.stringify([sourceBook(source).value,normalized(source.name),source.blocks.filter(block=>block.kind==='bilingual'||block.kind==='original-en').map(block=>block.kind==='bilingual'?{kind:block.kind,he:block.he,tr:block.tr}:{kind:block.kind,en:block.en,role:block.role})]);
const sourceEnglishCount=(source:SearchSource)=>source.blocks.filter(block=>block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en))).length;
const legacyBrowseSources=sourcePack.sources.filter(source=>!source.id.startsWith('library:')&&source.blocks.length) as SearchSource[];
const legacyBrowseByKey=new Map(legacyBrowseSources.map(source=>[browseEquivalence(source),source]));
const richLibraryKeys=new Set(sourcePack.sources.filter(source=>source.id.startsWith('library:')&&source.blocks.length).filter(raw=>{const source=raw as SearchSource,legacy=legacyBrowseByKey.get(browseEquivalence(source));return legacy&&sourceEnglishCount(source)>sourceEnglishCount(legacy)}).map(source=>browseEquivalence(source as SearchSource)));
const browsableSources=sourcePack.sources.filter(raw=>{const source=raw as SearchSource;if(!source.blocks.length)return false;const key=browseEquivalence(source),legacy=legacyBrowseByKey.get(key);return source.id.startsWith('library:')?(!legacy||richLibraryKeys.has(key)):!richLibraryKeys.has(key)});
const sourceFacets=(field:'book'|'service',pool:readonly AuthoringSourceLike[]=browsableSources)=>{const facets=new Map<string,{value:string;label:string;count:number}>();for(const raw of pool){const source=raw as SearchSource;const item=field==='book'?sourceBook(source):sourceService(source);if(!item.value)continue;const existing=facets.get(item.value);if(existing)existing.count++;else facets.set(item.value,{...item,count:1})}return [...facets.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.value.localeCompare(b.value))};
const compactStylePlan=(plan:DraftStylePlan)=>{
 const {content,...patch}=plan.patch;
 return {changedFields:Object.keys(plan.patch),patch:{...patch,...(content?{content:{arrangement:plan.after.arrangement,...(plan.after.rowOrder?{rowOrder:plan.after.rowOrder}:{})}}:{})},warnings:plan.warnings,before:plan.before,after:plan.after,sourcePreserved:true as const};
};
/** One browsable unit as a book outline prints it: enough to choose by, never the text itself. */
type BookUnit={id:string;name:string;folio:string|null;kinds:string[];blockCount:number;noteLikeOnly:boolean};
/** A unit that is only source English a siddur prints as a note, never prayer text to lead. */
const unitNoteLikeOnly=(source:SearchSource)=>source.blocks.every(block=>block.kind==='source-en'&&block.noteLike===true);
/** The printed section a unit belongs to: library metadata first, then a legacy section label. */
const sourceSection=(source:SearchSource)=>{const index=typeof source.metadata?.sectionIndex==='number'?source.metadata.sectionIndex:null;const metadataTitle=typeof source.metadata?.sectionTitle==='string'?source.metadata.sectionTitle.trim():'';const legacyTitle=typeof source.section==='string'?source.section.trim():'';return {index,title:metadataTitle||legacyTitle||null}};
const searchRank=(source:SearchSource,query:string)=>{if(!query)return 0;const name=normalized(source.name),opening=normalized((source.openingWords??[]).join(' ')),body=normalized(source.blocks.flatMap(block=>[block.he,block.tr,block.en]).join(' ')),metadata=normalized([source.id,source.section,...(source.aliases??[]),sourceBook(source).value,sourceBook(source).label,source.service].join(' '));if(name===query)return 0;if(name.startsWith(query))return 1;if(name.includes(query))return 2;if(opening.includes(query))return 3;if(body.includes(query))return 4;if(metadata.includes(query))return 5;return null};
/** T2 - the printed pages a unit sits on (library `metadata.folios`; a local source's one page). */
const sourceFolios=(source:SearchSource)=>Array.isArray(source.metadata?.folios)?(source.metadata!.folios as unknown[]):[];
/** Browsable sources matching a normalized query, book, service and printed page, best rank first, then corpus order. */
const matchSources=(query:string,book:string,service:string,page:number|null=null,pool:readonly AuthoringSourceLike[]=browsableSources)=>pool.map((raw,index)=>{const source=raw as SearchSource,rank=searchRank(source,query);return {source,index,rank}}).filter(item=>item.rank!==null&&(!book||[sourceBook(item.source).value,sourceBook(item.source).label].some(value=>normalized(value)===book))&&(!service||[sourceService(item.source).value,sourceService(item.source).label].some(value=>normalized(value)===service))&&(page===null||sourceFolios(item.source).includes(page))).sort((a,b)=>a.rank!-b.rank!||a.index-b.index);
const SEARCH_EXCERPT=60;
const searchExcerpt=(value:string|undefined)=>{const flat=(value??'').replace(/\s+/g,' ').trim();return flat.length>SEARCH_EXCERPT?`${flat.slice(0,SEARCH_EXCERPT-1).trimEnd()}…`:flat};
/**
 * The MCP shape of a search: who a source is and what it can make, never its licence text or pins
 * (one feed pin stays, so a result still says which corpus it came from). With blocks, each
 * selectable block - derived slices included - with its first words; a translation block names
 * the blocks it translates, which includeTranslation pulls in on its own.
 */
function compactSourceSearch(query:string,book:string,service:string,limit:number,includeBlocks:boolean,page:number|null=null,pool:readonly AuthoringSourceLike[]=browsableSources){
 const matches=matchSources(query,book,service,page,pool),sources:unknown[]=[];
 for(const {source:raw} of matches){
  if(sources.length>=limit)break;
  const source=includeBlocks?resolveSourceBoundaries(raw) as SearchSource:raw,blocks=source.blocks;
  const sourceEnglish=(block:SourceBlock)=>block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en));
  const candidate={id:source.id,name:source.name,section:source.section??null,bookValue:sourceBook(source).value,bookLabel:sourceBook(source).label,service:source.service??null,folio:sourceDisplay(source).folio,blockCount:blocks.length,kinds:[...new Set(blocks.map(block=>block.kind))],coverage:{bilingual:blocks.filter(block=>block.kind==='bilingual').length,originalEnglish:blocks.filter(block=>block.kind==='original-en').length,sourceEnglish:blocks.filter(sourceEnglish).length,translation:blocks.filter(block=>block.kind==='translation-en').length},
   ...(isLocalSourceId(source.id)?{local:true,version:source.metadata?.localVersion??null,attribution:source.metadata?.attribution??null}:{}),
   ...(includeBlocks?{blocks:blocks.map(block=>({id:block.id,kind:block.kind,text:searchExcerpt(block.tr||block.en||block.he),...(block.pairedBlockIds?{translates:block.pairedBlockIds}:{}),...(block.automatic===false?{automatic:false}:{}),...(block.noteLike?{noteLike:true}:{})}))}:{})};
  if(jsonBytes({sources:[...sources,candidate]})>MAX_SOURCE_RESPONSE_BYTES)break;
  sources.push(candidate);
 }
 return {feedSha256:sourcePack.authority.feedSha256,sources,total:matches.length,truncated:sources.length<matches.length,...(includeBlocks?{}:{blocks:'Pass includeBlocks:true for block ids.'})};
}
const splitStableId=(draftId:string,draftVersion:number,part:string)=>{const hash=createHash('sha256').update(`crc-authoring-split-v1\u0000${draftId}\u0000${draftVersion}\u0000${part}`).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-${(parseInt(hash.slice(16,18),16)&0x3f|0x80).toString(16)}${hash.slice(18,20)}-${hash.slice(20,32)}`};
const markedAttribution=(block:SourceBlock)=>/^~\s*\S/.test(block.en??'');
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
 // A corner card is one short line on its own; a prayer that needs several slides is a lower
 // third's or a panel's work, so a set is never cut into corner cards.
 if(layoutDefinition(layout)?.capabilities.sets===false)throw new AuthoringError('corner_set_unsupported','A corner card holds one short line and cannot be split into a set of slides. Use a lower third or a panel for a longer reading.',409);
 // A translated slide keeps its whole authorized pair. English lower thirds retain a marked
 // attribution with the preceding text; otherwise an attribution becomes an unreadable orphan.
 if(layout==='bottom'){
  if(includeTranslation)return segments;
  const budget=panelCharacterBudget(mode),pages:SourceBlock[][]=[];
  for(const segment of segments)for(const block of segment){
   const characters=blockCharacters(block,mode);
   if(characters>budget)throw new AuthoringError('split_unsplittable_block','A selected source block exceeds the supported lower-third limit. Select existing source boundary slices or keep this draft whole.',409);
   if(mode!=='bilingual'&&markedAttribution(block)&&pages.length){
    const prior=pages.at(-1)!;const priorCharacters=prior.reduce((total,item)=>total+blockCharacters(item,mode),0);
    if(priorCharacters+characters>budget)throw new AuthoringError('split_attribution_does_not_fit','The marked attribution cannot fit with its preceding selected text in a lower third. Select existing source boundary slices or keep this draft whole.',409);
    prior.push(block);continue;
   }
   pages.push([block]);
  }
  return pages;
 }
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

function splitDraftContent(content:DraftContent,sourceId:string,blocks:SourceBlock[],source:SearchSource):DraftContent{
 const variant=content.mode==='local-variant'?content:null,base=(variant?.base??content) as CanonicalContent;
 const blockIds=blocks.map(block=>block.id),groups=base.mode==='bilingual'?[{sourceId,blockIds}]:blockIds.map(blockId=>({sourceId,blockIds:[blockId]}));
 const pageBase:CanonicalContent=base.mode==='bilingual'?{mode:'bilingual',hebrewGroups:groups,transliterationGroups:structuredClone(groups),...(base.includeTranslation?{includeTranslation:true}:{}),...(base.layers?{layers:structuredClone(base.layers)}:{}),...(base.arrangement?{arrangement:base.arrangement}:{}),...(base.rowOrder?{rowOrder:[...base.rowOrder]}:{})}:{mode:base.mode,englishGroups:groups};
 if(!variant)return pageBase;
 const selected=new Set(blockIds);if(base.mode==='bilingual'&&base.includeTranslation)for(const block of blocks){const translation=source.blocks.find(candidate=>candidate.kind==='translation-en'&&candidate.pairedBlockIds?.[0]===block.id);if(translation)selected.add(translation.id)}const overrides=variant.overrides.filter(override=>override.sourceId===sourceId&&selected.has(override.blockId));
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
/** The `list_templates` rows: this workspace's visible baselines, and whether each imports as content. */
const templateSummaries=()=>baselineCatalogForWorkspace().filter(cue=>!cue.hidden).map(cue=>{let importable=true;try{editableFromBaseline(baselineSourceCueId(cue.id))}catch{importable=false}return {id:cue.id,name:cue.name,layout:cue.layout as Layout,importable}});
// R-A6 - a draft names a look, not a prayer. With no templateCueId the layout's look tile (the one
// the editor offers first) supplies it, so an agent never has to call list_templates to create.
const LOOK_MODES=new Set<string>(['bilingual','source-en','original-en','local-variant','custom']);
function lookTemplateCueId(layout:Layout,mode:unknown){
 const look=templateLooks(templateSummaries(),(typeof mode==='string'&&LOOK_MODES.has(mode)?mode:'bilingual') as TemplateLookMode).find(item=>item.layout===layout);
 if(!look)throw new AuthoringError('unknown_template',`No template is available for the ${layoutLabel(layout)} layout here. Call list_templates and pass one of its ids as templateCueId.`,409);
 return baselineSourceCueId(look.id);
}
const textSizeOf=(value:unknown)=>{if(value===undefined)return undefined;if(typeof value!=='string'||!(TEXT_SIZE_IDS as string[]).includes(value))throw new AuthoringError('invalid_input',`textSize must be ${TEXT_SIZE_IDS.join(', ')}`);return value as TextSizePreset};
/**
 * The create-time conveniences, resolved before the strict draft parser sees the input: a missing
 * templateCueId becomes the layout's look, a workspace template id becomes the CRC baseline it
 * copies (the parser knows only those), and a named text size becomes the three font sizes -
 * under any size the caller set explicitly.
 */
function withDraftDefaults(data:Record<string,unknown>){
 const {textSize:rawSize,...draft}=data;const textSize=textSizeOf(rawSize);
 if(draft.templateCueId===undefined&&isLayoutId(draft.layout)){const content=draft.content as {mode?:unknown}|undefined;draft.templateCueId=lookTemplateCueId(draft.layout,content?.mode)}
 else if(typeof draft.templateCueId==='string')draft.templateCueId=baselineSourceCueId(draft.templateCueId);
 if(textSize){const explicit=draft.presentation&&typeof draft.presentation==='object'&&!Array.isArray(draft.presentation)?draft.presentation as Record<string,unknown>:{};draft.presentation={...withTextSize({...explicit},textSize),...Object.fromEntries(Object.entries(explicit).filter(([key])=>key.endsWith('FontSize')))}}
 return draft;
}

export type AuthoringWorkspace={rehearsal:boolean;storage:'memory'|'postgres';label:string|null};
type SharedLibraryReader={get(force?:boolean):Promise<SharedLibrarySnapshot>};
export type SharedAssetImporter=(id:string,actor:string)=>Promise<unknown>;
/**
 * R7 - how `fit_check_draft` measures. The default launches headless Chromium against this
 * deployment's own /author/fit-stage; the module is imported lazily so neither playwright-core
 * nor the Chromium pack is pulled into a process that never runs a fit check. Tests inject.
 */
// `artworkUrl` (R-B1) is a signed, minutes-long read link for the cue's one asset, so the stage's
// browser can load artwork it holds no session for (lib/assets.ts signedAssetReadPath).
export type ServerFitRunner=(cue:AuthoringCue,options?:{includePreviewImage?:boolean;artworkUrl?:string})=>Promise<ServerFitResult>;
const defaultServerFitRunner:ServerFitRunner=async(cue,options)=>{
 const [{measureCueOnServer},{canonicalOrigin}]=await Promise.all([import('./server-fit'),import('./oauth-core')]);
 // The origin is the configured public base URL, never the request host: the stage must be
 // the page this deployment serves, and a request host is attacker-controllable.
 return measureCueOnServer(cue as unknown as Cue,{origin:canonicalOrigin(),includePreviewImage:options?.includePreviewImage,...(options?.artworkUrl?{artworkUrl:options.artworkUrl}:{})});
};
export type AssetStores={assets?:AssetRepository;uploads?:AssetUploadStore};
export function createAuthoringService(repo:AuthoringRepository,workspace:AuthoringWorkspace={rehearsal:false,storage:'postgres',label:null},shared:SharedLibraryReader=sharedLibraryClient,sharedAssetImporter:SharedAssetImporter=(id,actor)=>importSharedAsset(id,actor),runServerFit:ServerFitRunner=defaultServerFitRunner,localSources:LocalSourceRepository=new MemoryLocalSourceRepository(),defaultsRepo:AuthoringDefaultsRepository=repo instanceof MemoryAuthoringRepository?new MemoryAuthoringDefaultsRepository():new PgAuthoringDefaultsRepository(),assetStores:AssetStores={}){
 // T2 - this workspace's own sources, in the corpus shape, ordered as a book prints them. Read only
 // where a call can reach one: a search, a book outline, or content that names a local: id.
 const localUnits=async()=>(await localSources.list()).sort((a,b)=>a.book.localeCompare(b.book)||a.page-b.page||a.name.localeCompare(b.name)).map(localSourceUnit);
 const localsFor=async(value:unknown)=>JSON.stringify(value??null).includes('"local:')?localUnits():[];
 // Every server fit is handed a signed link to the cue's artwork, when it has any.
 const serverFit:ServerFitRunner=(cue,options)=>{const artworkUrl=signedCueArtworkPath(cue);return runServerFit(cue,artworkUrl?{...options,artworkUrl}:options)};
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
  // A retired draft hides the built-in cue it overrode, so the built-in name is free too.
  const overridden=new Set([...live.map(cue=>cue.id),...drafts.filter(isRetiredDraft).map(draft=>draft.id)]);
  const draftNames=new Set(drafts.filter(draft=>!draft.archivedAt&&draft.id!==excludeId).map(draft=>normalizeGraphicName(draft.name)));
  const catalogNames=baselineCatalogForWorkspace().filter(cue=>!cue.hidden&&!cue.aliasOf&&!overridden.has(cue.id)&&cue.id!==excludeId).concat(live.filter(cue=>cue.id!==excludeId));
  const publishedNames=new Set(catalogNames.map(cue=>normalizeGraphicName(cue.name)));
  return {draftNames,publishedNames,taken:new Set([...draftNames,...publishedNames])};
 };
 // One CRC item becomes one unpublished TBI draft. Shared by the single-graphic copy and the
 // whole-prayer copy so both verify the same source authority, import the same artwork, and
 // record the same origin - including the CRC wording as it read at that moment.
 // T1 - with house defaults the verified copy then takes this workspace's look; the pin is rebuilt on
 // the same CRC source snapshots, so authority and attribution travel unchanged. A translation
 // default the source can't honour is skipped and said so. A dry run imports no artwork.
 const sharedDraftFromEntry=async(entry:SharedLibraryEntry,payload:SharedLibraryPayload,who:string,name?:string,options:{defaults?:AuthoringDefaults|null;translation?:boolean;importArtwork?:boolean}={}):Promise<{draft:Draft;report:DefaultsReport}>=>{
  const sourceSnapshots=entry.sourceIds.map(id=>payload.sources.find(source=>source.id===id)).filter((source):source is NonNullable<typeof source>=>Boolean(source)).map(source=>structuredClone(source));if(sourceSnapshots.length!==entry.sourceIds.length)throw new AuthoringError('shared_library_invalid','CRC source snapshots are incomplete',503);
  const {sourcePin:sharedPin,...sharedEditable}=entry.copySpec;const verified=parseEditable(name?{...sharedEditable,name}:sharedEditable,false,sourceSnapshots) as EditableDraft;const verifiedPin=sourcePinFor(verified.content,sourceSnapshots,sharedPin.feedSha256);if(!sameStructuredValue(verifiedPin,sharedPin))throw new AuthoringError('shared_library_invalid','CRC source authority could not be verified',503);
  const report:DefaultsReport={applied:[],skipped:[]};let editable=verified;
  if(options.defaults){const housed=(translation:boolean)=>{const next=withHouseDefaults(verified,options.defaults!,{translation});return {editable:parseEditable(next.editable,false,sourceSnapshots) as EditableDraft,applied:next.applied}};let result;try{result=housed(options.translation!==false)}catch(error){if(!(error instanceof AuthoringError)||!options.defaults.translation||options.translation===false)throw error;result=housed(false);report.skipped.push(`translation ${options.defaults.translation==='include'?'included':'left out'}: ${error.message}`)}editable=result.editable;report.applied=result.applied}
  const pin=editable===verified?verifiedPin:sourcePinFor(editable.content,sourceSnapshots,sharedPin.feedSha256);
  const sharedAssetId=cueAssetId(entry.cue);if(sharedAssetId&&options.importArtwork!==false)try{await sharedAssetImporter(sharedAssetId,who)}catch(error){if(error instanceof AssetError)throw new AuthoringError(error.code,error.message,error.status);throw error}
  const now=Date.now();const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:pin,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,...(sourceSnapshots.length?{sourceSnapshots}:{}),sharedFrom:{workspaceId:'crc',cueId:entry.id,cueHash:entry.cueHash,importedAt:now,upstream:upstreamSnapshot(entry.cue)}};assertSourcePin(draft);return {draft,report};
 };
 // A whole CRC prayer as one new set here, CRC's order kept. A translation default either holds for
 // every part or for none, so one set never mixes graphics with and without English.
 const sharedSetDrafts=async(members:SharedLibraryEntry[],payload:SharedLibraryPayload,who:string,options:{defaults?:AuthoringDefaults|null;importArtwork?:boolean}={})=>{
  const build=async(translation:boolean)=>{const draftSetId=randomUUID(),count=members.length,copies:Draft[]=[],reports:DefaultsReport[]=[];for(const [index,entry] of members.entries()){const {draft,report}=await sharedDraftFromEntry(entry,payload,who,undefined,{...options,translation});copies.push({...draft,draftSetId,setIndex:index+1,setCount:count});reports.push(report)}return {draftSetId,copies,reports}};
  let built=await build(true);const skipped=built.reports.flatMap(report=>report.skipped);if(skipped.length&&options.defaults?.translation){built=await build(false);built.reports[0].skipped.push(...skipped.slice(0,1))}
  const draftSetManifest={version:1 as const,selections:built.copies.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots))};
  const report:DefaultsReport={applied:[...new Set(built.reports.flatMap(item=>item.applied))],skipped:[...new Set(built.reports.flatMap(item=>item.skipped))]};
  return {draftSetId:built.draftSetId,drafts:built.copies.map(draft=>({...draft,draftSetManifest:structuredClone(draftSetManifest)})),report};
 };
 const houseDefaults=async()=>(await defaultsRepo.get())?.defaults??null;
 const reportField=(report:DefaultsReport)=>report.applied.length||report.skipped.length?{houseDefaults:report}:{};
 // The layout rule is CRC's shape to keep, not to redo: a copied lower-third set longer than the
 // rule allows is copied as it is and flagged, never re-split on another layout.
 const layoutRuleNote=(members:SharedLibraryEntry[],defaults:AuthoringDefaults|null)=>{const layout=sequenceLayoutFor(members[0]?.layout??'',members.length,defaults);return layout?[`This set has ${members.length} lower thirds, more than the house layout rule's ${defaults!.layoutRule!.maxLowerThirds}; it is copied as it is, not re-split as a ${layout} sequence.`]:[]};
 const duplicateNameWarnings=async(draft:Draft):Promise<DuplicateNameWarning[]>=>{
  const {taken}=await libraryNames(draft.id);
  return taken.has(normalizeGraphicName(draft.name))?[{code:'duplicate-name',suggestedName:suggestGraphicName(draft.name,draft.layout,taken)}]:[];
 };
 const execute=async(operation:string,input:unknown,actor:string):Promise<unknown>=>{
  const who=string(actor,'actor',80); const data=object(input);
  if(operation==='get_workspace'){keys(data,[]);return {workspace};}
  if(isLocalSourceTool(operation))return localSourceOperation(operation,data,who,{sources:localSources,drafts:()=>repo.listDrafts(),workspaceId:currentWorkspaceId()});
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
  // S2 - the prepared-services tools (lib/service-tools.ts), dynamic for the same cycle reason.
  if(isServiceTool(operation)){const [{serviceToolOperation},{ServicesError:ServicesFailure}]=await Promise.all([import('./service-tools'),import('./service-collections')]);try{return await serviceToolOperation(operation,data,who)}catch(error){if(error instanceof ServicesFailure)throw new AuthoringError(error.code,error.message,error.status);throw error}}
  // R-B1 - the artwork library (lib/asset-tools.ts). A published cue counts only while its draft
  // is not archived, the same catalog libraryNames measures.
  if(isAssetTool(operation)){try{return await assetToolOperation(operation,data,who,{assets:assetStores.assets??defaultAssetRepository(),uploads:assetStores.uploads??defaultAssetUploadStore(),drafts:()=>repo.listDrafts(),published:async()=>{const [drafts,published]=await Promise.all([repo.listDrafts(),repo.published()]);const archived=new Set(drafts.filter(draft=>draft.archivedAt).map(draft=>draft.id));return published.filter(cue=>!archived.has(cue.id))}})}catch(error){if(error instanceof AssetError)throw new AuthoringError(error.code,error.message,error.status);throw error}}
  // T4 - review boards (lib/review-board.ts) read this service's drafts and kept fit frames.
  if(REVIEW_BOARD_OPERATIONS.has(operation)){const {reviewBoardOperation}=await import('./review-board');return reviewBoardOperation(operation,data,who,{authoring:repo})}
  // A5 - catalog hygiene (lib/catalog-hygiene.ts): every change it makes is one of the operations below, run through execute.
  if(isHygieneTool(operation)){const {hygieneOperation}=await import('./catalog-hygiene');return hygieneOperation(operation,data,who,{repo,run:execute})}
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
   keys(data,['cueId','expectedCueHash','name','applyDefaults']);const cueId=string(data.cueId,'cueId',160);const expectedCueHash=string(data.expectedCueHash,'expectedCueHash',64);if(!/^[a-f0-9]{64}$/.test(expectedCueHash))throw new AuthoringError('invalid_input','expectedCueHash must be a SHA-256 hash');const name=optionalString(data.name,'name',80);const snapshot=await shared.get();if(!snapshot.available)throw new AuthoringError('shared_library_unavailable',snapshot.error,503);const entry=snapshot.payload.cues.find(item=>item.id===cueId);if(!entry)throw new AuthoringError('unknown_shared_cue','This CRC library item is no longer available',404);if(entry.cueHash!==expectedCueHash)throw new AuthoringError('shared_cue_changed','This CRC graphic changed after you opened it. Refresh the CRC library and review the current version before customizing.',409);
   const defaults=optionalBoolean(data.applyDefaults,'applyDefaults')===false?null:await houseDefaults();
   const {draft,report}=await sharedDraftFromEntry(entry,snapshot.payload,who,name,{defaults});return {draft:await repo.insertDraft(draft),sharedFrom:draft.sharedFrom,...reportField(report)};
  }
  // A CRC whole prayer arrives as N graphics that belong together. Copying it takes them all
  // or none: one insert, one new TBI set, CRC's order preserved.
  if(operation==='customize_shared_set'){
   keys(data,['setId','expectedCueHashes','applyDefaults']);const setId=string(data.setId,'setId',160);const expected=object(data.expectedCueHashes,'expectedCueHashes');const expectedIds=Object.keys(expected);if(!expectedIds.length||expectedIds.length>200)throw new AuthoringError('invalid_input','expectedCueHashes must name 1-200 graphics');
   for(const id of expectedIds){const hash=string(expected[id],`expectedCueHashes.${id}`,64);if(!/^[a-f0-9]{64}$/.test(hash))throw new AuthoringError('invalid_input','expectedCueHashes values must be SHA-256 hashes')}
   const snapshot=await shared.get();if(!snapshot.available)throw new AuthoringError('shared_library_unavailable',snapshot.error,503);
   const members=snapshot.payload.cues.filter(entry=>entry.set?.id===setId).sort((a,b)=>a.set!.index-b.set!.index);if(!members.length)throw new AuthoringError('unknown_shared_set','This CRC multipart graphic is no longer available',404);
   if(members.length!==expectedIds.length||members.some(entry=>expected[entry.id]!==entry.cueHash))throw new AuthoringError('shared_cue_changed','This CRC multipart graphic changed after you opened it. Refresh the CRC library and review the current version before customizing.',409);
   const defaults=optionalBoolean(data.applyDefaults,'applyDefaults')===false?null:await houseDefaults();
   const {draftSetId,drafts,report}=await sharedSetDrafts(members,snapshot.payload,who,{defaults});const notes=layoutRuleNote(members,defaults);
   const inserted=await repo.insertDraftSet(drafts);return {drafts:inserted,set:{id:draftSetId,name:members[0].set!.title,count:members.length,draftIds:inserted.map(draft=>draft.id)},sharedFrom:inserted.map(draft=>draft.sharedFrom),...reportField(report),...(notes.length?{notes}:{})};
  }
  // T1 - many shared-library graphics copied in one call, each through the path above. Dry run by
  // default; per-item results, never a stop on the first refusal; resumable (lib/shared-batch.ts).
  if(operation==='customize_shared_batch'){
   keys(data,['items','applyDefaults','dryRun']);const items=parseSharedBatchItems(data.items);const dryRun=optionalBoolean(data.dryRun,'dryRun')??true;const applyAll=optionalBoolean(data.applyDefaults,'applyDefaults')??true;
   const snapshot=await shared.get();if(!snapshot.available)throw new AuthoringError('shared_library_unavailable',snapshot.error,503);
   const stored=await defaultsRepo.get(),house=stored?.defaults??null;
   const plans=planSharedBatch(items,snapshot.payload,await repo.listDrafts()),{taken}=await libraryNames();
   const results:Record<string,unknown>[]=[],apply:SharedBatchItem[]=[];
   for(const plan of plans){
    const head={item:plan.index+1,kind:plan.kind,id:plan.id,name:plan.name,layout:plan.layout,...(plan.kind==='set'?{parts:plan.entries.length}:{})};
    if(plan.status==='refused'){results.push({...head,status:'refused',reason:plan.reason});continue}
    if(plan.status==='already-copied'){results.push({...head,status:'already-copied',draftIds:plan.draftIds});continue}
    const defaults=(plan.item.applyDefaults??applyAll)?house:null,notes=[...plan.notes,...(plan.kind==='set'?layoutRuleNote(plan.entries,defaults):[])];
    try{
     const built=plan.kind==='cue'?await sharedDraftFromEntry(plan.entries[0],snapshot.payload,who,plan.item.name,{defaults,importArtwork:!dryRun}).then(({draft,report})=>({drafts:[draft],report,draftSetId:null})):await sharedSetDrafts(plan.entries,snapshot.payload,who,{defaults,importArtwork:!dryRun});
     const clash=built.drafts.find(draft=>taken.has(normalizeGraphicName(draft.name)));if(clash)notes.push(`A graphic here is already named "${clash.name}"; publishing will ask you to confirm the name or take a suggested one.`);for(const draft of built.drafts)taken.add(normalizeGraphicName(draft.name));
     const inserted=dryRun?null:plan.kind==='cue'?[await repo.insertDraft(built.drafts[0])]:await repo.insertDraftSet(built.drafts);
     results.push({...head,status:dryRun?'would-create':'created',...(inserted?{draftIds:inserted.map(draft=>draft.id),...(built.draftSetId?{setId:built.draftSetId}:{})}:{}),...reportField(built.report),...(notes.length?{notes}:{})});
     if(dryRun)apply.push(plan.kind==='cue'?{cueId:plan.id,expectedCueHash:plan.entries[0].cueHash,...(plan.item.name?{name:plan.item.name}:{}),...(plan.item.applyDefaults!==undefined?{applyDefaults:plan.item.applyDefaults}:{})}:{setId:plan.id,expectedCueHashes:Object.fromEntries(plan.entries.map(entry=>[entry.id,entry.cueHash])),...(plan.item.applyDefaults!==undefined?{applyDefaults:plan.item.applyDefaults}:{})});
    }catch(error){if(error instanceof AuthoringError){results.push({...head,status:'refused',reason:error.message});continue}throw error}
   }
   const count=(status:string)=>results.filter(result=>result.status===status).length,made=count(dryRun?'would-create':'created'),already=count('already-copied'),refused=count('refused');
   const message=dryRun?`Dry run: ${made} would be copied, ${already} ${already===1?'is':'are'} already here, ${refused} refused. Nothing was changed. To copy them, call again with the apply items and dryRun:false.`:`${made} copied as unpublished drafts, ${already} ${already===1?'was':'were'} already here, ${refused} refused. Nothing was published.`;
   return {dryRun,message,counts:{[dryRun?'wouldCreate':'created']:made,alreadyCopied:already,refused},defaults:{version:stored?.version??0,applied:applyAll&&Boolean(house)},stale:snapshot.stale,items:results,...(dryRun&&apply.length?{apply:{items:apply,applyDefaults:applyAll,dryRun:false}}:{})};
  }
  if(operation==='get_authoring_defaults'){
   keys(data,[]);const stored=await defaultsRepo.get();
   return {version:stored?.version??0,stored:Boolean(stored),defaults:stored?.defaults??{},updatedAt:stored?.updatedAt??null,updatedBy:stored?.updatedBy??null,fields:[...DEFAULT_FIELDS],appliesOn:[...DEFAULTS_APPLY_ON],message:stored?'New graphics and shared-library copies take these unless the call names its own value or passes applyDefaults:false. Existing drafts never change.':'No house defaults are set, so new graphics and copies take each template\'s own look. update_authoring_defaults with expectedVersion 0 sets the first ones.'};
  }
  if(operation==='update_authoring_defaults'){
   const {expectedVersion,...patch}=data;const expected=integer(expectedVersion,'expectedVersion',0);const stored=await defaultsRepo.get(),current=stored?.version??0;if(current!==expected)throw defaultsConflict(current);
   const {defaults,changed}=mergeDefaultsPatch(stored?.defaults??{},patch);
   if(!changed.length)return {version:current,defaults:stored?.defaults??{},changed:[],message:'Nothing changed: the defaults already read that way.'};
   const saved=await defaultsRepo.put(defaults,expected,who,Date.now());
   return {version:saved.version,defaults:saved.defaults,changed,updatedAt:saved.updatedAt,updatedBy:saved.updatedBy,message:'Saved. New graphics and shared-library copies take these from now on; existing drafts are unchanged.'};
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
   keys(data,[]);const pool=[...browsableSources,...await localUnits()];return {books:sourceFacets('book',pool),services:sourceFacets('service',pool)};
  }
  // The printed outline of one book: every browsable unit, in printed order, grouped by the
  // section a reader would find it under. Names and folios only — the corpus itself stays on
  // the server, and `get_source` remains the way to read one unit.
  if(operation==='list_book_units'){
   keys(data,['book']);const book=normalized(string(data.book,'book',100));
   const matches=[...browsableSources,...await localUnits()].map(raw=>raw as SearchSource).filter(source=>[sourceBook(source).value,sourceBook(source).label].some(value=>normalized(value)===book));
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
   keys(data,['query','book','service','page','limit','compact','includeBlocks']);const query=normalized(optionalString(data.query,'query',100));const book=normalized(optionalString(data.book,'book',100));const service=normalized(optionalString(data.service,'service',100));const limit=data.limit===undefined?20:integer(data.limit,'limit',1,50);
   // T2 - a printed page narrows to the units on it; this workspace's local sources are searched with the corpus.
   const page=data.page===undefined?null:integer(data.page,'page',1,9999);const pool=[...browsableSources,...await localUnits()];
   // R-A5 - compact drops the licence and pin blocks (repeated per source, most of a result) and
   // includeBlocks lists each selectable block id with its first words, so create_draft needs no get_source.
   if(optionalBoolean(data.compact,'compact')===true||optionalBoolean(data.includeBlocks,'includeBlocks')===true)return compactSourceSearch(query,book,service,limit,data.includeBlocks===true,page,pool);
   const matches=matchSources(query,book,service,page,pool);const summaries=[];for(const {source} of matches){const {blocks,...summary}=source;if(summaries.length>=limit)break;const sourceEnglish=(block:SourceBlock)=>block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en));const coverage={bilingual:blocks.filter(block=>block.kind==='bilingual').length,originalEnglish:blocks.filter(block=>block.kind==='original-en').length,sourceEnglish:blocks.filter(sourceEnglish).length,automaticSourceEnglish:blocks.filter(block=>sourceEnglish(block)&&block.automatic!==false).length,noteLikeEnglish:blocks.filter(block=>block.noteLike===true).length};const candidate={...summary,bookValue:sourceBook(source).value,bookLabel:sourceBook(source).label,display:sourceDisplay(source),blockCount:blocks.length,kinds:[...new Set(blocks.map(b=>b.kind))],coverage};if(jsonBytes({authority:sourcePack.authority,sources:[...summaries,candidate]})>MAX_SOURCE_RESPONSE_BYTES)break;summaries.push(candidate)}return {authority:sourcePack.authority,sources:summaries,truncated:summaries.length<matches.length};
  }
  if(operation==='get_source'){keys(data,['sourceId']);const id=string(data.sourceId,'sourceId');
   // A local source answers with its own authority - its attribution and licence as entered - never the corpus licence.
   if(isLocalSourceId(id)){const local=(await localUnits()).find(unit=>unit.id===id);if(!local)throw new AuthoringError('unknown_source','There is no local source with that id here. list_local_sources names them.',404);const provenance=localProvenance([local])[0];return {authority:{repository:local.authority!.repository,repositoryCommit:'',feed:'local-sources',feedSha256:local.unitSha256,license:provenance.licence,printing:null},source:local,display:sourceDisplay(local),local:provenance};}
   const canonical=sourcePack.sources.find(s=>s.id===id);if(!canonical)throw new AuthoringError('unknown_source','Unknown authoring source',404);const source=resolveSourceBoundaries(canonical);const result={authority:sourcePack.authority,source,display:sourceDisplay(source)};if(jsonBytes(result)>MAX_SOURCE_RESPONSE_BYTES)throw new AuthoringError('source_too_large','This source is too large for direct browser authoring',413);return result;}
  // Both listings enumerate this workspace's own catalog - baselineCatalogForWorkspace(), the
  // same seam lib/server.ts mergePublishedCatalog reads for the live catalog - so a TBI editor
  // never sees a CRC id. Origin detection still needs the CRC source id, so baselineSourceCueId
  // translates a workspace id back before asking editableFromBaseline; on CRC that is a no-op.
  // R-A6 - `looks` is the editor's tile per layout, the template create_draft picks when none is
  // named; `textSizes` are the editor's named sizes. `templates` stays for existing callers.
  if(operation==='list_templates'){keys(data,['mode']);if(data.mode!==undefined&&!LOOK_MODES.has(String(data.mode)))throw new AuthoringError('invalid_input','mode must be bilingual, source-en, original-en, local-variant, or custom');const templates=templateSummaries(),mode=(data.mode??'bilingual') as TemplateLookMode;return {templates,looks:templateLooks(templates,mode).map(look=>({layout:look.layout,templateCueId:look.id,label:look.label,default:true})),textSizes:TEXT_SIZE_IDS.map(id=>({id,label:TEXT_SIZE_PRESETS[id].label,...TEXT_SIZE_PRESETS[id].sizes}))};}
  if(operation==='list_custom_templates'){keys(data,[]);return {templates:CUSTOM_TEMPLATES.map(describeCustomTemplate)};}
  // R-A6 - a speaker card, announcement, citation, start time or corner card from its guided
  // form: the values compose into the same custom-text draft the editor's form makes.
  if(operation==='compose_custom_draft'){
   keys(data,['templateId','values','layout','name','templateCueId','textSize','presentation']);const templateId=string(data.templateId,'templateId',40);const template=customTemplate(templateId);if(!template)throw new AuthoringError('unknown_custom_template',`There is no custom template called ${templateId}. Call list_custom_templates for the ${CUSTOM_TEMPLATES.length} that exist.`,404);
   const values=object(data.values,'values');const problems=customTemplateProblems(template,values);if(problems.length)throw new AuthoringError('invalid_input',problems.join(' '));
   const composed=template.compose(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,String(value)])));if(!composed.text.trim())throw new AuthoringError('invalid_input',`${template.label} would show only its heading. Fill in the rest of its fields (${template.fields.map(field=>field.key).join(', ')}).`);
   return execute('create_draft',{name:optionalString(data.name,'name',80)??composed.name,title:composed.title,layout:data.layout??template.layout,...(data.templateCueId!==undefined?{templateCueId:data.templateCueId}:{}),...(data.textSize!==undefined?{textSize:data.textSize}:{}),content:{mode:'custom',text:composed.text},presentation:data.presentation??{}},who);
  }
  if(operation==='list_catalog'){
   keys(data,['query','layout']);const catalogQuery=normalized(optionalString(data.query,'query',100));const catalogLayout=data.layout;if(catalogLayout!==undefined&&!isLayoutId(catalogLayout))throw new AuthoringError('invalid_input',`layout must be ${layoutChoices()}`);const [allDrafts,published]=await Promise.all([repo.listDrafts(),repo.published()]);const archivedIds=new Set(allDrafts.filter(draft=>draft.archivedAt).map(draft=>draft.id));const drafts=allDrafts.filter(draft=>!draft.archivedAt);const retiredDrafts=drafts.filter(isRetiredDraft);const retiredIds=new Set(retiredDrafts.map(draft=>draft.id));const active=new Map(baselineCatalogForWorkspace().filter(cue=>!archivedIds.has(cue.id)&&!retiredIds.has(cue.id)).map(cue=>[cue.id,cue]));for(const cue of published)if(!archivedIds.has(cue.id))active.set(cue.id,cue);const byId=new Map(drafts.map(draft=>[draft.id,draft]));
   return {cues:[...[...active.values()].filter(cue=>(!catalogLayout||cue.layout===catalogLayout)&&(!catalogQuery||normalized([cue.id,cue.name,cue.texts.textTitle].join(' ')).includes(catalogQuery))).map(cue=>{const draft=byId.get(cue.id);let origin:'canonical'|'variant'|'local'|'legacy'='legacy';const authoredOrigin=(cue as AuthoringCue).authoring?.origin;if(authoredOrigin)origin=authoredOrigin;if(origin==='legacy')try{editableFromBaseline(baselineSourceCueId(cue.id));origin='canonical'}catch{}const editAction=draft?'open':origin==='canonical'?'import':'duplicate';return {id:cue.id,name:cue.name,title:cue.texts.textTitle,layout:cue.layout,hidden:Boolean(cue.hidden),origin,draftId:draft?.id??null,draftVersion:draft?.version??null,activeRevision:draft?.activeRevision??null,canEdit:true,editAction,canDuplicate:true}}),...
    // Retired graphics stay visible to the editor, labelled, so they can be found and restored;
    // they are absent from every live catalog (lib/server.ts authoringCatalog).
    retiredDrafts.filter(draft=>(!catalogLayout||draft.layout===catalogLayout)&&(!catalogQuery||normalized([draft.id,draft.name,draft.title].join(' ')).includes(catalogQuery))).map(draft=>({id:draft.id,name:draft.name,title:draft.title,layout:draft.layout,hidden:false,origin:draft.content.mode==='custom'?'local' as const:draft.content.mode==='local-variant'?'variant' as const:'canonical' as const,draftId:draft.id,draftVersion:draft.version,activeRevision:null,canEdit:true,editAction:'open' as const,canDuplicate:true,retired:true,retiredRevision:draft.retired!.revision}))]};
  }
  if(operation==='list_drafts'){
   keys(data,['compact','query','service','book','layout','limit','cursor','includeArchived']);
   const compactFields=['query','service','book','layout','limit','cursor','includeArchived'].some(field=>data[field]!==undefined);
   if(data.compact!==undefined&&typeof data.compact!=='boolean')throw new AuthoringError('invalid_input','compact must be boolean');
   if(data.compact===false&&compactFields)throw new AuthoringError('invalid_input','filters require compact results; drop compact:false, or drop the filters to read every full record');
   const includeArchived=optionalBoolean(data.includeArchived,'includeArchived')===true;
   const drafts=(await repo.listDrafts()).filter(draft=>includeArchived||!draft.archivedAt);
   if(data.compact!==true&&!compactFields)return {drafts};
   const layout=data.layout;if(layout!==undefined&&!isLayoutId(layout))throw new AuthoringError('invalid_input',`layout must be ${layoutChoices()}`);
   const input:DraftCatalogInput={query:optionalString(data.query,'query',100),service:optionalString(data.service,'service',100),book:optionalString(data.book,'book',100),layout,limit:data.limit===undefined?undefined:integer(data.limit,'limit',1,50),cursor:optionalString(data.cursor,'cursor',200)};
   return compactDraftCatalog(drafts,input);
  }
  if(operation==='list_archived_drafts'){keys(data,[]);return {drafts:(await repo.listDrafts()).filter(draft=>Boolean(draft.archivedAt))};}
  // Wording changes: every edited siddur line in this workspace, archived drafts flagged, with the exact source text beside it. Read only (lib/wording-changes.ts).
  if(operation==='list_wording_changes'){keys(data,[]);const changes=wordingChanges(await repo.listDrafts());return {changes,count:changes.length};}
  // R-A5 - `rendered` says what the graphic reads on screen, built as a preview would build it but
  // stored nowhere, without the source snapshots and pins that make the full record ~9 KB.
  if(operation==='get_draft'){
   keys(data,['draftId','view']);const draft=await requiredDraft(repo,string(data.draftId,'draftId'));if(data.view===undefined||data.view==='full')return {draft};
   if(data.view!=='rendered')throw new AuthoringError('invalid_input','view must be full or rendered');
   const cue=buildCue(draft);const published=draft.activeRevision!==null;
   return {draft:{id:draft.id,version:draft.version,name:draft.name,title:draft.title,layout:draft.layout,templateCueId:draft.templateCueId,mode:draft.content.mode,presentation:draft.presentation,activeRevision:draft.activeRevision,activeVersion:draft.activeDraftVersion,published,dirty:published&&draft.activeDraftVersion!==draft.version,archived:Boolean(draft.archivedAt),retired:isRetiredDraft(draft),set:draft.draftSetId?{id:draft.draftSetId,index:draft.setIndex??0,count:draft.setCount??0}:null},rendered:{texts:Object.fromEntries(Object.entries(cue.texts).filter(([,value])=>typeof value==='string'&&value.trim())),...(cue.contentRows?{contentRows:cue.contentRows}:{}),...(cue.rowOrder?{rowOrder:cue.rowOrder}:{})},validation:previewValidation(cue),fullRecord:"get_draft{view:'full'}"};
  }
  if(operation==='archive_draft'||operation==='restore_draft'){keys(data,['draftId','expectedVersion']);const id=string(data.draftId,'draftId'),expected=integer(data.expectedVersion,'expectedVersion',1);const current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();if(current.draftSetId)throw new AuthoringError('set_member_archive','Archive or restore multipart graphics as a complete set',409);if(operation==='archive_draft'&&current.archivedAt)return {draft:current};if(operation==='restore_draft'&&!current.archivedAt)return {draft:current};const draft=await repo.setArchived(id,expected,operation==='archive_draft',who);if(!draft)throw conflict();return {draft};}
  // MCP plan A3 - retire withdraws a published graphic from every live surface; restore brings the
  // same revision back. Unlike archive, it changes what Companion and the relay can show.
  if(operation==='retire_cue'||operation==='restore_cue'){
   keys(data,['cueId','expectedVersion']);const id=string(data.cueId,'cueId'),expected=integer(data.expectedVersion,'expectedVersion',1);const retire=operation==='retire_cue';
   const current=await repo.getDraft(id);
   if(!current){const builtIn=baselineCatalogForWorkspace().find(cue=>cue.id===id);if(builtIn)throw new AuthoringError('not_a_draft',`"${builtIn.name}" is a built-in graphic with no draft in this library yet. Import it first (import_cue), then retire the imported draft.`,409);throw new AuthoringError('unknown_cue',`No graphic in this library has the id ${id}. Check the id with list_catalog.`,404)}
   if(current.version!==expected)throw conflict();
   const done=(draft:Draft,changed:boolean)=>{const retired=isRetiredDraft(draft);const revision=retired?draft.retired!.revision:draft.activeRevision;return {draft,cue:{id:draft.id,name:draft.name,retired,revision},changed,message:retired?`"${draft.name}" is retired: it is out of the live library, Companion's picker and the relay catalog. If it is on screen now it stays there until it is taken out. restore_cue brings back revision ${revision}.`:`"${draft.name}" is back in the live library at revision ${revision}.`}};
   if(retire&&isRetiredDraft(current))return done(current,false);
   if(!retire&&!isRetiredDraft(current)){if(current.activeRevision!==null)return done(current,false);throw new AuthoringError('not_retired',`"${current.name}" is not retired and has never been published. Publish it to put it in the live library.`,409)}
   if(retire&&current.activeRevision===null)throw new AuthoringError('not_published',`"${current.name}" has never been published, so it is not in the live library and there is nothing to retire. Archive the draft instead (archive_draft) to take it out of the editor.`,409);
   const draft=await repo.setRetired(id,expected,retire,who);if(!draft)throw conflict();return done(draft,true);
  }
  if(operation==='archive_draft_set'||operation==='restore_draft_set'){keys(data,['setId','expectedDraftIds']);const setId=string(data.setId,'setId');if(!Array.isArray(data.expectedDraftIds)||!data.expectedDraftIds.length||data.expectedDraftIds.length>200)throw new AuthoringError('invalid_input','expectedDraftIds must contain 1-200 draft IDs');const expectedDraftIds=data.expectedDraftIds.map((id,index)=>string(id,`expectedDraftIds[${index}]`,160));const drafts=await repo.setDraftSetArchived(setId,expectedDraftIds,operation==='archive_draft_set',who);return {set:{id:setId,count:drafts.length,draftIds:drafts.map(draft=>draft.id)},drafts};}
  if(operation==='create_source_draft_set'){
   keys(data,['sourceId','mode','includeTranslation','layout','templateCueId','applyDefaults']);const house=optionalBoolean(data.applyDefaults,'applyDefaults')===false?null:await houseDefaults(),report:DefaultsReport={applied:[],skipped:[]};
   const sourceId=string(data.sourceId,'sourceId');const localUnit=isLocalSourceId(sourceId)?(await localUnits()).find(item=>item.id===sourceId):undefined;const canonicalSource=(localUnit??sourcePack.sources.find(item=>item.id===sourceId)) as SearchSource|undefined;if(!canonicalSource)throw new AuthoringError('unknown_source','Unknown authoring source',404);const source=resolveSourceBoundaries(canonicalSource) as SearchSource;
   if(data.mode!=='bilingual'&&data.mode!=='original-en'&&data.mode!=='source-en')throw new AuthoringError('invalid_input','mode must be bilingual, original-en, or source-en');const mode=data.mode;
   if(data.includeTranslation!==undefined&&typeof data.includeTranslation!=='boolean')throw new AuthoringError('invalid_input','includeTranslation must be boolean');
   const includeTranslation=data.includeTranslation===true;if(mode!=='bilingual'&&includeTranslation)throw new AuthoringError('invalid_input','includeTranslation is available only for bilingual sources');
   if(!isLayoutId(data.layout))throw new AuthoringError('invalid_input',`layout must be ${layoutChoices()}`);let layout:Layout=data.layout;
   let templateCueId=data.templateCueId===undefined?lookTemplateCueId(layout,mode):baselineSourceCueId(string(data.templateCueId,'templateCueId',80));const template=baselineCues.find(cue=>cue.id===templateCueId);if(!template)throw new AuthoringError('unknown_template','Unknown baseline cue template',404);if(template.layout!==templateLayoutFor(layout))throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
   let pages=sourceSetPages(source,mode,includeTranslation,layout);
   // T1 - the house layout rule: a lower-third set longer than it allows is made as a panel sequence.
   // A named lower-third template is the caller's choice and keeps the lower thirds.
   const sequence=sequenceLayoutFor(layout,pages.length,house);
   if(sequence&&data.templateCueId!==undefined)report.skipped.push(`layout rule: kept ${pages.length} lower thirds because templateCueId names a lower-third template`);
   else if(sequence){const lowerThirds=pages.length;layout=sequence;templateCueId=lookTemplateCueId(layout,mode);pages=sourceSetPages(source,mode,includeTranslation,layout);report.applied.push(`layout rule: ${lowerThirds} lower thirds became a ${layout} sequence of ${pages.length}`)}
   const setId=randomUUID();const count=pages.length;const width=Math.max(2,String(count).length);const now=Date.now();
   let drafts=pages.map((page,index)=>{
    const groups=mode==='bilingual'?[{sourceId,blockIds:page.map(block=>block.id)}]:page.map(block=>({sourceId,blockIds:[block.id]}));
    const content:DraftContent=mode==='bilingual'?{mode,hebrewGroups:groups,transliterationGroups:structuredClone(groups),...(includeTranslation?{includeTranslation:true}:{})}:{mode,englishGroups:groups};
    const plain=parseEditable({name:`${source.name} — ${String(index+1).padStart(width,'0')} of ${String(count).padStart(width,'0')}`,title:source.name,layout,templateCueId,content:withCreateDefaultBilingualBlocks(content),presentation:{}},false,localUnit?[localUnit]:undefined) as EditableDraft;
    // The translation choice is includeTranslation here: it decides the pages, so no default changes it.
    const housed=house?withHouseDefaults(plain,house,{translation:false}):null;if(housed&&index===0)report.applied.push(...housed.applied);const editable=housed?parseEditable(housed.editable,false,localUnit?[localUnit]:undefined) as EditableDraft:plain;
    const sourceSnapshots=[structuredClone(canonicalSource)];return {...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots),sourceSnapshots,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,draftSetId:setId,setIndex:index+1,setCount:count} satisfies Draft;
   });
  const draftSetManifest={version:1 as const,selections:drafts.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots))};drafts=drafts.map(draft=>({...draft,draftSetManifest:structuredClone(draftSetManifest)}));
  const inserted=await repo.insertDraftSet(drafts);return {drafts:inserted,set:{id:setId,name:source.name,count,draftIds:inserted.map(draft=>draft.id)},...reportField(report)};
 }
 if(operation==='split_draft_into_set'){
  keys(data,['draftId','expectedVersion']);const draftId=string(data.draftId,'draftId'),expectedVersion=integer(data.expectedVersion,'expectedVersion',1);const original=await requiredDraft(repo,draftId);
  if(original.version!==expectedVersion)throw conflict();if(original.archivedAt)throw new AuthoringError('draft_archived','Restore this draft before splitting it',409);if(original.draftSetId)throw new AuthoringError('already_multipart','This draft is already a multipart set member',409);
  const origin={draftId,draftVersion:expectedVersion};const existingSplit=async()=>{const existing=(await repo.listDrafts()).filter(draft=>draft.splitFrom?.draftId===draftId&&draft.splitFrom.draftVersion===expectedVersion&&!draft.archivedAt).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(!existing.length)return null;const setId=existing[0].draftSetId;if(setId&&existing.every(draft=>draft.draftSetId===setId)&&existing.length===existing[0].setCount&&existing.every((draft,index)=>draft.setIndex===index+1))return {drafts:existing,set:{id:setId,name:original.name,count:existing.length,draftIds:existing.map(draft=>draft.id)},splitFrom:origin,reused:true as const};throw new AuthoringError('split_retry_incomplete','A prior split attempt is incomplete; inspect the multipart drafts before retrying',409)};const priorSplit=await existingSplit();if(priorSplit)return priorSplit;
  if(original.content.mode==='custom')throw new AuthoringError('split_source_required','Only source-backed drafts can be split into a source-preserving set',409);
  const base=original.content.mode==='local-variant'?original.content.base:original.content;const {sourceId,source,segments,mode,includeTranslation}=splitDraftSetSegments(base,original.sourceSnapshots);assertSourcePin(original);const pages=sourceSetPagesFromSegments(source,segments,mode,includeTranslation,original.layout);
  if(pages.length<2)throw new AuthoringError('split_not_needed','The selected draft already fits in one source-preserving page',409);
  const setId=splitStableId(draftId,expectedVersion,'set'),count=pages.length,width=Math.max(2,String(count).length),now=Date.now();let drafts=pages.map((page,index)=>{
   const content=splitDraftContent(original.content,sourceId,page,source),editable=parseEditable({name:`${original.name} — ${String(index+1).padStart(width,'0')} of ${String(count).padStart(width,'0')}`,title:original.title,...(original.accentTitle!==undefined?{accentTitle:original.accentTitle}:{}),layout:original.layout,templateCueId:original.templateCueId,content,presentation:structuredClone(original.presentation)},false,original.sourceSnapshots) as EditableDraft;
   const sourceSnapshots=structuredClone(original.sourceSnapshots);return {...editable,id:splitStableId(draftId,expectedVersion,`draft-${index+1}`),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots,original.sourcePin.feedSha256),sourceSnapshots,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,draftSetId:setId,setIndex:index+1,setCount:count,splitFrom:origin} satisfies Draft;
  });
  const draftSetManifest={version:1 as const,selections:drafts.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots))};drafts=drafts.map(draft=>({...draft,draftSetManifest:structuredClone(draftSetManifest)}));try{const inserted=await repo.insertDraftSet(drafts);return {drafts:inserted,set:{id:setId,name:original.name,count,draftIds:inserted.map(draft=>draft.id)},splitFrom:origin,reused:false}}catch(error){const recovered=await existingSplit();if(recovered)return recovered;throw error}
 }
 if(operation==='create_draft'){
   const {applyDefaults:rawApply,...request}=data;{const content=object(request.content,'content');if(content.mode==='local-variant')object(content.base,'content.base')}const house=optionalBoolean(rawApply,'applyDefaults')===false?null:await houseDefaults();
   // T1 - house defaults fill in what the call leaves out; a translation default the selected
   // source can't honour is dropped, and said so, rather than refusing the whole draft.
   const housed=house?withHouseCreateDefaults(request,house):null,report:DefaultsReport={applied:housed?.applied??[],skipped:[]};
   const locals=await localsFor(request.content);
   let input=housed?.data??request,parsed:EditableDraft;try{parsed=parseEditable(withDraftDefaults(input),false,locals) as EditableDraft}catch(error){if(!housed?.withoutTranslation||!(error instanceof AuthoringError))throw error;input=housed.withoutTranslation;parsed=parseEditable(withDraftDefaults(input),false,locals) as EditableDraft;report.applied=report.applied.filter(item=>item!=='translation included');report.skipped.push(`translation included: ${error.message}`)}
   const rawContent=object(input.content,'content'),rawBase=rawContent.mode==='local-variant'?object(rawContent.base,'content.base'):rawContent,explicitArrangement=Object.hasOwn(rawBase,'arrangement');const editable=explicitArrangement?parsed:{...parsed,content:withCreateDefaultBilingualBlocks(parsed.content)};const sourceSnapshots=sourceSnapshotsFor(editable.content,locals);const now=Date.now(); const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots),...(sourceSnapshots.length?{sourceSnapshots}:{}),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
   const warnings=await duplicateNameWarnings(draft);const provenance=localProvenance(sourceSnapshots);
   return {draft:await repo.insertDraft(draft),warnings,...reportField(report),...(provenance.length?{provenance}:{})};
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
   keys(data,['draftId','cueId','name','expectedVersion']);const draftId=optionalString(data.draftId,'draftId');const cueId=optionalString(data.cueId,'cueId');if(Boolean(draftId)===Boolean(cueId))throw new AuthoringError('invalid_input','Provide exactly one of draftId or cueId');
   // Optional: pins the version being copied, so a copy is never taken of an edit the caller has not seen.
   const expectedSourceVersion=data.expectedVersion===undefined?undefined:integer(data.expectedVersion,'expectedVersion',1);if(expectedSourceVersion!==undefined&&!draftId)throw new AuthoringError('invalid_input','expectedVersion goes with draftId; a catalog cue has no draft version');
   let editable:EditableDraft;let sourceKind:'draft'|'cue';let sourceId:string;let sourceSnapshots:Draft['sourceSnapshots'];let sharedFrom:Draft['sharedFrom'];let pinnedFeedSha256:string|undefined;
   if(draftId){const sourceDraft=await requiredDraft(repo,draftId);if(expectedSourceVersion!==undefined&&sourceDraft.version!==expectedSourceVersion)throw conflict();assertSourcePin(sourceDraft);editable=editableOnly(sourceDraft);sourceSnapshots=structuredClone(sourceDraft.sourceSnapshots);sharedFrom=structuredClone(sourceDraft.sharedFrom);pinnedFeedSha256=sourceDraft.sourcePin.feedSha256;sourceKind='draft';sourceId=draftId}
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
   keys(data,['draftId','expectedVersion','layout','arrangement','rowOrder','comfortableTypography','latinLineBreaks','dryRun']);
   const id=string(data.draftId,'draftId'),expected=integer(data.expectedVersion,'expectedVersion',1),current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();assertSourcePin(current);
   const layout=data.layout;if(layout!==undefined&&!isLayoutId(layout))throw new AuthoringError('invalid_input',`layout must be ${layoutChoices()}`);
   const arrangement=data.arrangement;if(arrangement!==undefined&&arrangement!=='together'&&arrangement!=='blocks')throw new AuthoringError('invalid_input','arrangement must be together or blocks');
   const latinLineBreaks=data.latinLineBreaks;if(latinLineBreaks!==undefined&&latinLineBreaks!=='preserve'&&latinLineBreaks!=='paragraphs'&&latinLineBreaks!=='phrases')throw new AuthoringError('invalid_input','latinLineBreaks must be preserve, paragraphs, or phrases');const rowOrder=data.rowOrder===undefined?undefined:parseRowOrder(data.rowOrder)??[...LAYER_ORDER];const options:DraftStyleOptions={layout,arrangement,rowOrder,comfortableTypography:optionalBoolean(data.comfortableTypography,'comfortableTypography'),latinLineBreaks};
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
   keys(data,['draftId','expectedVersion','patch','refreshSourceIds','textSize']);const id=string(data.draftId,'draftId');const expected=integer(data.expectedVersion,'expectedVersion',1);const current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();
   // A named text size applies to the presentation the patch leaves in place, under any size the patch names.
   const textSize=textSizeOf(data.textSize);if(textSize){const patch=data.patch===undefined?{}:object(data.patch,'patch'),explicit=patch.presentation===undefined?null:object(patch.presentation,'patch.presentation');data.patch={...patch,presentation:{...withTextSize({...(explicit??current.presentation)},textSize),...Object.fromEntries(Object.entries(explicit??{}).filter(([key])=>key.endsWith('FontSize')))}}}
   // A stale pin blocks every edit except the explicit rebase it asks for (gap D): a refresh that
   // names each stale source it keeps, or drops it from the selection. The new pin is rebuilt below.
   const requestedRefresh=data.refreshSourceIds===undefined?[]:sourceRefreshIds(data.refreshSourceIds);const stalePinSources=staleSourceIds(current);if(!requestedRefresh.length)assertSourcePin(current);if(requestedRefresh.length&&(!data.patch||typeof data.patch!=='object'||Array.isArray(data.patch)||!Object.hasOwn(data.patch,'content')))throw new AuthoringError('source_refresh_requires_content','refreshSourceIds requires a content selection in patch',400);
   const inheritedSnapshots=current.sourceSnapshots?.length?structuredClone(current.sourceSnapshots):sourceSnapshotsFor(current.content);
   // T2 - a local source is found like a corpus one: the current unit when refreshed or newly
   // selected, the draft's own snapshot otherwise (a snapshot always wins over the current unit).
   const locals=await localsFor([data.patch,requestedRefresh]);
   const refreshedSources=requestedRefresh.map(sourceId=>{const source=sourcePack.sources.find(candidate=>candidate.id===sourceId)??locals.find(candidate=>candidate.id===sourceId);if(!source)throw new AuthoringError('unknown_source',`Unknown source ${sourceId}`,404);return structuredClone(source)});
   const pinnedSnapshots=requestedRefresh.length?[...inheritedSnapshots.filter(source=>!requestedRefresh.includes(source.id)),...refreshedSources]:inheritedSnapshots;
   const validationSnapshots=[...pinnedSnapshots,...locals.filter(unit=>!pinnedSnapshots.some(source=>source.id===unit.id))];
   const patch=parseEditable(data.patch,true,validationSnapshots);const merged=parseEditable({...editableOnly(current),...patch},false,validationSnapshots) as EditableDraft;
   if(requestedRefresh.length){const selected=new Set(sourceReferences(merged.content,validationSnapshots).map(reference=>reference.sourceId));for(const sourceId of requestedRefresh)if(!selected.has(sourceId))throw new AuthoringError('invalid_source_refresh','refreshSourceIds must name sources selected by patch.content',400);for(const sourceId of stalePinSources)if(selected.has(sourceId)&&!requestedRefresh.includes(sourceId))throw new AuthoringError('source_pin_mismatch',`Pinned source authority has changed for ${sourceId}; include it in refreshSourceIds or remove it from the selection`,409);const sourceSnapshots=sourceSnapshotsFor(merged.content,validationSnapshots);const sourcePin=sourcePinFor(merged.content,sourceSnapshots);const updated=await repo.updateDraft(id,expected,{...merged,sourceSnapshots,sourcePin},who);if(!updated)throw conflict();return {draft:updated,warnings:await duplicateNameWarnings(updated)}}
   // A local source newly selected by this patch has no snapshot yet, so the draft takes one now.
   const newlyLocal=sourceReferences(merged.content,validationSnapshots).some(reference=>isLocalSourceId(reference.sourceId)&&!inheritedSnapshots.some(source=>source.id===reference.sourceId));
   if(newlyLocal){const sourceSnapshots=sourceSnapshotsFor(merged.content,validationSnapshots);const sourcePin=sourcePinFor(merged.content,sourceSnapshots,current.sourceSnapshots?.length?current.sourcePin.feedSha256:undefined);const updated=await repo.updateDraft(id,expected,{...merged,sourceSnapshots,sourcePin},who);if(!updated)throw conflict();return {draft:updated,warnings:await duplicateNameWarnings(updated)}}
   const updated=await repo.updateDraft(id,expected,merged,who);if(!updated)throw conflict();return {draft:updated,warnings:await duplicateNameWarnings(updated)};
  }
  if(operation==='preview_draft'){
   keys(data,['draftId','expectedVersion']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const cue=buildCue(draft);const validation=previewValidation(cue);const preview:PreviewRecord={id:randomUUID(),draftId:draft.id,draftVersion:draft.version,cueHash:cueHash(cue),cue,validation,review:null,createdAt:Date.now(),createdBy:who};await repo.insertPreview(preview);
   const provenance=localProvenance(draft.sourceSnapshots);
   return {previewId:preview.id,draftVersion:draft.version,cue,cueHash:preview.cueHash,validation,previewPath:`/author?draft=${encodeURIComponent(draft.id)}`,fitContract:{viewport:{width:1920,height:1080},fontsReadyRequired:true,noOverflowRequired:true,browserReported:true,humanReviewRequired:true},...(provenance.length?{provenance}:{})};
  }
  // A look at content before any draft exists. With includePreviewImage the same server browser
  // fit_check_draft uses measures it and returns the frame; the verdict is stored nowhere, so it
  // can never stand in for the review a publish needs.
  if(operation==='preview_content'){
   const {includePreviewImage:rawImage,...draft}=data;const includePreviewImage=optionalBoolean(rawImage,'includePreviewImage')===true;
   const locals=await localsFor(draft.content);const preview=ephemeralCue(parseEditable(withDraftDefaults(draft),false,locals) as EditableDraft,who,undefined,locals);if(!includePreviewImage)return preview;
   const result=await serverFit(preview.cue,{includePreviewImage:true});
   if(result.verdict==='unavailable')return {...preview,fitCheck:{verdict:'unavailable',reason:result.reason,message:FIT_CHECK_UNAVAILABLE}};
   return {...preview,fitCheck:{verdict:result.verdict,fitErrors:result.fitErrors,warnings:result.warnings,fill:result.fill,artwork:result.artwork,measuredAt:result.measuredAt,rendererVersion:result.rendererVersion,stored:false},previewImage:result.previewImage??null,...(result.previewImageUnavailable?{previewImageUnavailable:result.previewImageUnavailable}:{})};
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
   // R-A2 - the frame goes with the preview it measured, so the publications page later shows
   // what the agent saw. Keeping it is best effort: a verdict never depends on the picture.
   const imageStored=includePreviewImage&&result.previewImage?await storeFitImage(repo,preview.id,result.previewImage):false;
   // A pass whose artwork never loaded on the server is still a pass - findFitErrors never
   // evaluates artwork - but it says what it did not see rather than implying it did.
   const passMessage=fitCheck.artwork==='not-loaded'?FIT_CHECK_PASSED_NO_ARTWORK:FIT_CHECK_PASSED;
   return {draftId:draft.id,draftVersion:draft.version,previewId:preview.id,cueHash:preview.cueHash,...fitCheck,...(includePreviewImage?{previewImage:result.previewImage??null,imageStored,...(result.previewImageUnavailable?{previewImageUnavailable:result.previewImageUnavailable}:{})}:{}),...(fitCheck.verdict==='pass'?{message:passMessage}:{})};
  }
  if(operation==='review_draft'){
   keys(data,['draftId','expectedVersion','previewId','browserMeasurement','humanApproved']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const preview=await requiredPreview(repo,string(data.previewId,'previewId'));if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);
   // R-A1 - calling review_draft is the approval; `humanApproved:true` is still accepted from
   // existing clients, and anything else in it is refused rather than read as a yes.
   if(data.humanApproved!==undefined&&data.humanApproved!==true)throw new AuthoringError('review_required','humanApproved can only be true. Leave it out to approve, or do not call review_draft.',400);
   // D18 - where the measurement may come from depends on who is asking.
   //
   // The web dock path (a signed-in member measuring in their own browser) is unchanged: it
   // asserts the measurement and the server trusts it, because a real browser produced it in
   // a real session. An MCP actor cannot be trusted to have rendered anything, so for it only
   // a stored, server-attested measurement counts - the one `fit_check_draft` wrote onto this
   // exact preview with a `server-chromium/` renderer. A hand-asserted measurement from an MCP
   // actor is ignored and the call is refused. The receipt says which it was (`approvedBy`).
   const measurement=isMcpActor(who)?attestedMeasurement(preview):assertedMeasurement(data);
   const review=reviewReceipt(who,{browserMeasurement:measurement});await repo.saveReview(preview.id,review);return {draftId:draft.id,draftVersion:draft.version,previewId:preview.id,cueHash:preview.cueHash,review};
  }
  // One Save on "This service", in one call: every slot of the chosen service type whose
  // text changed is republished, and nothing else is touched. No review round trip and no
  // second page — the slot's layout carries a standing approval, and the guard that replaces
  // the per-edit review is a length check whose refusal names the field and says what to do.
  //
  // Every value is checked before anything is published, so a typo in the last field cannot
  // leave half the service published and half not.
  // What save_slots reads and writes: every slot (or one service type's), its graphic, what it
  // says now and the draft version expectedVersions can pin. Nothing here writes.
  if(operation==='list_slots'){
   keys(data,['serviceType']);const {SERVICE_TYPES,SLOTS,slotsForServiceType}=await import('./slots');const {slotCueRegister}=await import('./slot-catalog');
   const serviceType=optionalString(data.serviceType,'serviceType',80);if(serviceType&&!SERVICE_TYPES.some(type=>type.id===serviceType))throw new AuthoringError('unknown_service_type',`There is no service type called ${serviceType}; they are ${SERVICE_TYPES.map(type=>type.id).join(', ')}.`,404);
   const register=slotCueRegister();
   const slots=await Promise.all((serviceType?slotsForServiceType(serviceType):SLOTS).map(async definition=>{const cueId=register.get(definition.key)??null;const draft=cueId?await repo.getDraft(cueId):null;return {key:definition.key,name:definition.name,kind:definition.kind,labels:definition.labels,cueId,minted:Boolean(draft),text:draft?.content.mode==='custom'?draft.content.text:'',version:draft?.version??null,published:Boolean(draft&&draft.activeRevision!==null)}}));
   return {serviceTypes:SERVICE_TYPES.map(type=>({id:type.id,name:type.name,slotKeys:[...type.slotKeys]})),...(serviceType?{serviceType}:{}),slots};
  }
  if(operation==='save_slots'){
   keys(data,['serviceType','values','expectedVersions']);
   const {SERVICE_TYPES,slotDefinition,slotTextProblems}=await import('./slots');
   const {slotCueRegister}=await import('./slot-catalog');
   const serviceType=string(data.serviceType,'serviceType',80);
   if(!SERVICE_TYPES.some(type=>type.id===serviceType))throw new AuthoringError('unknown_service_type','That service type does not exist',404);
   const values=object(data.values,'values');
   const register=slotCueRegister();
   // Optional, per slot: the draft version list_slots reported. Any mismatch refuses the whole
   // Save before anything publishes, so a caller never overwrites text somebody else just typed.
   if(data.expectedVersions!==undefined){const expected=object(data.expectedVersions,'expectedVersions');for(const [key,version] of Object.entries(expected)){if(!Object.hasOwn(values,key))throw new AuthoringError('invalid_input',`expectedVersions names ${key}, which values does not save; drop it or add a value for it.`);const pinned=integer(version,`expectedVersions.${key}`,1);const cueId=register.get(key);const current=cueId?await repo.getDraft(cueId):null;if(current&&current.version!==pinned)throw new AuthoringError('version_conflict',`${slotDefinition(key)?.name??key} changed since you read it (now version ${current.version}). Call list_slots and save again. Nothing was published.`,409)}}
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
    // The measurement and its frame travel with the review, so the renamed publication still
    // shows what was checked (R-A2). Best effort: the receipt above is what the gate reads.
    if(approved.fitCheck)await repo.saveFitCheck(preview.id,approved.fitCheck);
    try{const image=await repo.getFitImage(approved.id);if(image)await repo.saveFitImage(preview.id,image)}catch{/* no stored frame; publication proceeds */}
    const renamedRevision=await repo.publish(renamed.id,renamed.version,preview.id,who);
    return {revision:renamedRevision,cue:renamedRevision.cue,draft:renamed,renamedFrom:draft.name,previewId:preview.id};
   }
   const revision=await repo.publish(draft.id,draft.version,previewId,who);return {revision,cue:revision.cue};
  }
  // R-A1 - preview, server fit with its frame, attested review and publish in one call, each
  // step the operation above it. It stops, having published nothing, at the first thing a
  // person would have to decide: a name already in use (unless allowRename takes the
  // suggestion), a fit problem (the renderer's own sentences, with the frame), or a server that
  // could not open a browser. The review is always the attested one, whoever calls: the check
  // it stands on is the one this call just ran.
  if(operation==='ship_draft'){
   keys(data,['draftId','expectedVersion','allowRename']);
   const draftId=string(data.draftId,'draftId'),expectedVersion=integer(data.expectedVersion,'expectedVersion',1),allowRename=optionalBoolean(data.allowRename,'allowRename')===true;
   const draft=await versionedDraft(repo,draftId,expectedVersion);assertSourcePin(draft);
   const {publishedNames,taken}=await libraryNames(draft.id);
   if(publishedNames.has(normalizeGraphicName(draft.name))&&!allowRename){const suggestedName=suggestGraphicName(draft.name,draft.layout,taken);return {shipped:false,stoppedAt:'duplicate_name',draftId,draftVersion:draft.version,name:draft.name,suggestedName,message:`Another published graphic is already named "${draft.name}". Nothing was published. Call ship_draft again with allowRename:true to publish it as "${suggestedName}", or rename the draft first.`}}
   const preview=await execute('preview_draft',{draftId,expectedVersion},who) as {previewId:string;validation:{valid:boolean;errors:string[]}};
   if(!preview.validation.valid)return {shipped:false,stoppedAt:'validation',draftId,draftVersion:draft.version,previewId:preview.previewId,validation:preview.validation,message:`${preview.validation.errors.join(' ')} Nothing was published.`};
   const fit=await execute('fit_check_draft',{draftId,expectedVersion,previewId:preview.previewId,includePreviewImage:true},who) as Record<string,unknown>&{verdict:string};
   if(fit.verdict==='unavailable')return {shipped:false,stoppedAt:'fit_unavailable',draftId,draftVersion:draft.version,previewId:preview.previewId,verdict:'unavailable',reason:fit.reason,fitCheckUrl:fit.fitCheckUrl,message:`${FIT_CHECK_UNAVAILABLE} Nothing was published.`};
   const measured=Object.fromEntries(Object.entries(fit).filter(([key])=>!['draftId','draftVersion','previewId','cueHash'].includes(key)));
   if(fit.verdict!=='pass')return {shipped:false,stoppedAt:'fit_failed',draftId,draftVersion:draft.version,previewId:preview.previewId,...measured,message:`${(fit.fitErrors as string[]).join(' ')} Nothing was published.`};
   const checked=await requiredPreview(repo,preview.previewId);
   await repo.saveReview(checked.id,reviewReceipt(who,{browserMeasurement:attestedMeasurement(checked)}));
   const published=await execute('publish_draft',{draftId,expectedVersion,previewId:preview.previewId,...(allowRename?{confirmDuplicateName:true}:{})},who) as {revision:Revision;draft?:Draft;renamedFrom?:string;previewId?:string};
   const revision=published.revision;
   return {shipped:true,draftId,draftVersion:published.draft?.version??draft.version,name:revision.cue.name,...(published.renamedFrom?{renamedFrom:published.renamedFrom}:{}),revision:revision.revision,cueHash:revision.cueHash,previewId:published.previewId??preview.previewId,review:revision.review,...measured,message:`Published "${revision.cue.name}". ${String(measured.message??FIT_CHECK_PASSED)}`};
  }
  // R-A2 - what was published since a moment, newest first, with who approved it and whether
  // it is still the live version. Read only; rollback_draft undoes one.
  if(operation==='list_recent_publications'){
   keys(data,['since','actor','limit']);
   const since=data.since===undefined?Date.now()-7*24*60*60*1000:integer(data.since,'since',0);
   const limit=data.limit===undefined?50:integer(data.limit,'limit',1,200);
   if(data.actor!==undefined&&data.actor!=='agent'&&data.actor!=='person')throw new AuthoringError('invalid_input',"actor must be 'agent' or 'person'");
   const rows=await repo.recentPublications(since,limit,data.actor as ReviewApprover|undefined);
   const [drafts,images]=await Promise.all([Promise.all([...new Set(rows.map(row=>row.draftId))].map(id=>repo.getDraft(id))),repo.fitImageInfo(rows.flatMap(row=>row.previewId?[row.previewId]:[])).catch(()=>new Map<string,StoredFitImageInfo>())]);
   const byId=new Map(drafts.filter((item):item is Draft=>Boolean(item)).map(item=>[item.id,item]));
   return {since,publications:rows.map(row=>{const current=byId.get(row.draftId),live=current?.activeRevision===row.revision,image=row.previewId?images.get(row.previewId):undefined;const approver=row.review?.approvedBy??(row.review?.humanApproved?'person':null);return {draftId:row.draftId,name:row.name,layout:row.layout,excerpt:publicationExcerpt(row.texts),revision:row.revision,publishedAt:row.createdAt,publishedBy:isMcpActor(row.actor)?'agent':'person',approvedBy:approver,member:row.review?.member??(approver==='person'?row.review?.reviewedBy??null:null),standingApproval:Boolean(row.review?.standingApproval),current:live,archived:Boolean(current?.archivedAt),draftVersion:current?.version??null,rollbackTo:live&&row.revision>1?row.revision-1:null,previewId:row.previewId,image:image?{width:image.width,height:image.height,mimeType:image.mimeType}:null}})};
  }
  if(operation==='list_revisions'){keys(data,['draftId']);const id=string(data.draftId,'draftId');await requiredDraft(repo,id);return {revisions:await repo.revisions(id)};}
  if(operation==='rollback_draft'){keys(data,['draftId','expectedVersion','revision']);const id=string(data.draftId,'draftId');const revision=integer(data.revision,'revision',1);const selected=(await repo.revisions(id)).find(row=>row.revision===revision);if(!selected)throw new AuthoringError('unknown_revision','Unknown revision',404);assertRevisionAuthority(selected.cue,await localsFor(selected.cue.authoring?.sourceIds));const result=await repo.rollback(id,integer(data.expectedVersion,'expectedVersion',1),revision,who);return result;}
  throw new AuthoringError('unknown_operation',`Unknown authoring operation: ${operation}`,404);
 };
 return {operation:execute,publishedCues:()=>repo.published(),retiredCues:()=>repo.retiredCues()};
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
function ephemeralCue(editable:EditableDraft,who:string,cueId?:string,locals:Draft['sourceSnapshots']=[]){
 const sourceSnapshots=sourceSnapshotsFor(editable.content,locals);const now=Date.now();
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
 async setRetired(id:string,v:number,retired:boolean,actor:string){const d=this.drafts.get(id);const next=d?retirementUpdate(d,v,retired,actor,Date.now()):null;if(!next)return null;this.drafts.set(id,next);return clone(next)}
 async retiredCues(){return [...this.drafts.values()].filter(isRetiredDraft).map(d=>({id:d.id,name:d.name,retiredAt:d.retired!.retiredAt}))}
 async reorderDraftSet(setId:string,expectedIds:string[],orderedIds:string[],actor:string){const members=[...this.drafts.values()].filter(d=>d.draftSetId===setId&&!d.archivedAt).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds))throw conflict();const byId=new Map(members.map(d=>[d.id,d]));if(orderedIds.length!==members.length||new Set(orderedIds).size!==members.length||orderedIds.some(id=>!byId.has(id)))throw new AuthoringError('invalid_set_order','orderedDraftIds must be the complete draft set',400);const now=Date.now();const result=orderedIds.map((id,index)=>({...byId.get(id)!,setIndex:index+1,setCount:members.length,updatedAt:now,updatedBy:actor}));for(const draft of result)this.drafts.set(draft.id,draft);return clone(result)}
 async duplicateDraftInSet(sourceId:string,v:number,expectedIds:string[],duplicate:Draft,actor:string){const source=this.drafts.get(sourceId);if(!source||source.version!==v||!source.draftSetId)throw conflict();const members=[...this.drafts.values()].filter(d=>d.draftSetId===source.draftSetId&&!d.archivedAt).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));if(JSON.stringify(members.map(d=>d.id))!==JSON.stringify(expectedIds)||this.drafts.has(duplicate.id))throw conflict();const offset=members.findIndex(d=>d.id===sourceId);if(offset<0)throw conflict();const ordered=[...members.slice(0,offset+1),duplicate,...members.slice(offset+1)];const now=Date.now();for(const [index,draft] of ordered.entries()){draft.setIndex=index+1;draft.setCount=ordered.length;draft.updatedAt=now;draft.updatedBy=actor;this.drafts.set(draft.id,clone(draft))}return clone(ordered)}
 async insertPreview(p:PreviewRecord){this.previews.set(p.id,clone(p))} async getPreview(id:string){const p=this.previews.get(id);return p?clone(p):null} async saveReview(id:string,r:ReviewReceipt){const p=this.previews.get(id);if(!p)throw new AuthoringError('unknown_preview','Unknown preview',404);p.review=clone(r)}
 async saveFitCheck(id:string,f:ServerFitCheck){const p=this.previews.get(id);if(!p)throw new AuthoringError('unknown_preview','Unknown preview',404);p.fitCheck=clone(f)}
 async publish(id:string,v:number,previewId:string,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const p=this.previews.get(previewId);validatePublishPreview(d,p);const assetId=cueAssetId(p!.cue);if(assetId&&(!this.assets||!await this.assets.markPublished(assetId,Date.now())))throw new AuthoringError('asset_unavailable','Selected artwork is unavailable or archived',409);const rows=this.revisionRows.get(id)??[];let row=rows.find(r=>r.draftVersion===v&&r.cueHash===p!.cueHash);if(!row){row={draftId:id,revision:rows.length+1,draftVersion:v,cueHash:p!.cueHash,cue:clone(p!.cue),previewId,review:clone(p!.review!),actor,createdAt:Date.now(),sourceCommits:revisionSourceCommits(p!.cue)};rows.push(row);this.revisionRows.set(id,rows)}d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return clone(row)}
 async revisions(id:string){return clone(this.revisionRows.get(id)??[])}
 async rollback(id:string,v:number,revision:number,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const row=(this.revisionRows.get(id)??[]).find(r=>r.revision===revision);if(!row)throw new AuthoringError('unknown_revision','Unknown revision',404);d.version++;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return {draft:clone(d),revision:clone(row)}}
 async published(){return [...this.drafts.values()].filter(d=>d.activeRevision!==null).map(d=>clone((this.revisionRows.get(d.id)??[]).find(r=>r.revision===d.activeRevision)!.cue))}
 images=new Map<string,StoredFitImage>();
 async saveFitImage(id:string,image:StoredFitImage){if(!this.previews.has(id))throw new AuthoringError('unknown_preview','Unknown preview',404);this.images.set(id,{...image,data:Buffer.from(image.data)})}
 async getFitImage(id:string){const image=this.images.get(id);return image?{...image,data:Buffer.from(image.data)}:null}
 async fitImageInfo(ids:string[]){return new Map(ids.flatMap(id=>{const image=this.images.get(id);return image?[[id,{mimeType:image.mimeType,width:image.width,height:image.height,byteSize:image.data.byteLength}] as const]:[]}))}
 async recentPublications(since:number,limit:number,publisher?:ReviewApprover){return [...this.revisionRows.values()].flat().filter(row=>row.createdAt>=since&&(!publisher||(publisher==='agent')===isMcpActor(row.actor))).sort((a,b)=>b.createdAt-a.createdAt||b.revision-a.revision).slice(0,limit).map(({cue,sourceCommits:_,...row})=>{void _;return clone({...row,name:cue.name,layout:cue.layout,texts:cue.texts as Record<string,unknown>})})}
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
/**
 * Who approves, from the actor alone. An MCP actor is `mcp:<client>:member:<id>` (the member who
 * consented, lib/oauth-store.ts actorMemberId); older and test actors name no member.
 */
export function reviewApprover(actor:string):{approvedBy:ReviewApprover;member:string|null}{
 if(isMcpActor(actor))return {approvedBy:'agent',member:/^mcp:[0-9a-f]{1,64}:member:(.+)$/.exec(actor)?.[1]??null};
 return {approvedBy:'person',member:actor};
}
function reviewReceipt(who:string,fields:Pick<ReviewReceipt,'browserMeasurement'|'standingApproval'>):ReviewReceipt{
 const approver=reviewApprover(who);
 return {...approver,...(approver.approvedBy==='person'?{humanApproved:true as const}:{}),...fields,reviewedAt:Date.now(),reviewedBy:who};
}
/** Keeps a server frame with its preview when it is a bounded JPEG or PNG; never throws. */
async function storeFitImage(repo:AuthoringRepository,previewId:string,image:{mimeType:string;dataBase64:string;width:number;height:number}){
 if(image.mimeType!=='image/jpeg'&&image.mimeType!=='image/png')return false;
 const data=Buffer.from(image.dataBase64,'base64');
 if(!data.byteLength||data.byteLength>STORED_FIT_IMAGE_MAX_BYTES)return false;
 try{await repo.saveFitImage(previewId,{mimeType:image.mimeType,width:image.width,height:image.height,data});return true}catch{return false}
}
/** A publication's first words, for a list a person scans; no field names, no ids. */
function publicationExcerpt(texts:Record<string,unknown>){
 const flat=Object.entries(texts??{}).filter(([key,value])=>typeof value==='string'&&!/title/i.test(key)).map(([,value])=>String(value)).join(' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
 return flat.length>120?`${flat.slice(0,119).trimEnd()}…`:flat;
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
 await repo.saveReview(preview.id,reviewReceipt(who,{standingApproval:`slot:${key}`}));
 await repo.publish(updated.id,updated.version,preview.id,who);
 return {key,cueId,text,published:true};
}
function validatePublishPreview(draft:Draft,preview?:PreviewRecord){
 if(!preview)throw new AuthoringError('unknown_preview','Unknown preview',404);
 if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);
 if(!preview.validation.valid)throw new AuthoringError('invalid_preview','Preview validation failed',409);
 const review=preview.review;
 // A receipt from before R-A1 says humanApproved; a newer one says who approved.
 if(!review||(review.humanApproved!==true&&review.approvedBy!=='agent'&&review.approvedBy!=='person'))throw new AuthoringError('review_required','Exact-version browser fit review is required',409);
 // A standing approval stands in for the measurement, and only for a slot's text. Everything
 // else still needs a browser that actually looked at this exact version.
 if(review.standingApproval)return;
 if(!review.browserMeasurement||review.browserMeasurement.overflow||!review.browserMeasurement.fontsReady)throw new AuthoringError('review_required','Exact-version browser fit review is required',409);
}
function assertRevisionAuthority(cue:AuthoringCue,locals:Draft['sourceSnapshots']=[]){
 const value=cue as AuthoringCue&{provenance?:{liturgy?:{feedSha256?:string}}};
 if(value.authoring?.origin==='local'){if(value.authoring.feedSha256!=='local'||value.authoring.sourceIds.length)throw new AuthoringError('source_pin_mismatch','Local revision authority is invalid',409);return}
 const feed=value.authoring?.feedSha256??value.provenance?.liturgy?.feedSha256;if(feed!==sourcePack.authority.feedSha256)throw new AuthoringError('source_pin_mismatch','Revision source authority no longer matches the pinned feed',409);
 if(!value.authoring)return;
 // T2 - a local source is checked against its current unit exactly as a corpus source is.
 const sources=value.authoring.sourceIds.map(id=>sourcePack.sources.find(item=>item.id===id)??locals?.find(item=>item.id===id));if(sources.some(item=>!item))throw new AuthoringError('source_pin_mismatch','A revision source is no longer available',409);
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
// MCP plan A3: a retired draft has no active revision and remembers the one it had. Read only
// when the published signature moves, never on the per-request signature check.
export const RETIRED_CUES_SQL=`SELECT id,document->>'name' AS name,document->'retired'->>'retiredAt' AS "retiredAt"
FROM authoring_drafts
WHERE active_revision IS NULL AND document ? 'retired'
ORDER BY id`;

export class PgAuthoringRepository implements AuthoringRepository{
 private async db(){return (await import('./database')).db}
 // Retiring or restoring always moves a row in or out of the active set, so the published
 // signature changes with it and the retired list can ride in the same cached load.
 private readonly publishedCache=signatureCache(
  async()=>String((await (await this.db()).query(PUBLISHED_SIGNATURE_SQL)).rows[0]?.signature??''),
  async()=>{const db=await this.db();const [published,retired]=await Promise.all([db.query(PUBLISHED_CUES_SQL),db.query(RETIRED_CUES_SQL)]);const row=published.rows[0] as {signature:string;cues:AuthoringCue[]};return {signature:String(row.signature),value:{cues:row.cues,retired:(retired.rows as Array<{id:string;name:string|null;retiredAt:string|number|null}>).map(item=>({id:item.id,name:item.name??item.id,retiredAt:Number(item.retiredAt??0)}))}}},
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
 async published(){return (await this.publishedCache()).cues}
 async retiredCues(){return (await this.publishedCache()).retired}
 async setRetired(id:string,v:number,retired:boolean,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const row=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const current=row.rows[0]?.document as Draft|undefined;const next=current?retirementUpdate(current,v,retired,actor,Date.now()):null;if(!next){await client.query('ROLLBACK');return null}await client.query('UPDATE authoring_drafts SET document=$2,version=$3,active_revision=$4,active_draft_version=$5,updated_at=$6,updated_by=$7 WHERE id=$1',[id,next,next.version,next.activeRevision,next.activeDraftVersion,next.updatedAt,actor]);await client.query('COMMIT');return next}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 // R-A2 - frames live in their own table (db/authoring.sql), not in the preview row, so every
 // getPreview stays as small as it was. Until that table exists the reads below answer "no
 // frame" and a save fails, which the service treats as "not kept" - never as a failed check.
 async saveFitImage(id:string,image:StoredFitImage){await (await this.db()).query('INSERT INTO authoring_preview_images(preview_id,mime_type,width,height,byte_size,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(preview_id) DO UPDATE SET mime_type=EXCLUDED.mime_type,width=EXCLUDED.width,height=EXCLUDED.height,byte_size=EXCLUDED.byte_size,data=EXCLUDED.data,created_at=EXCLUDED.created_at',[id,image.mimeType,image.width,image.height,image.data.byteLength,image.data,Date.now()])}
 async getFitImage(id:string){try{const row=(await (await this.db()).query('SELECT mime_type AS "mimeType",width,height,data FROM authoring_preview_images WHERE preview_id=$1',[id])).rows[0] as StoredFitImage|undefined;return row??null}catch(error){if(missingTable(error))return null;throw error}}
 async fitImageInfo(ids:string[]){if(!ids.length)return new Map<string,StoredFitImageInfo>();try{const rows=(await (await this.db()).query('SELECT preview_id AS "previewId",mime_type AS "mimeType",width,height,byte_size AS "byteSize" FROM authoring_preview_images WHERE preview_id=ANY($1::text[])',[ids])).rows as Array<StoredFitImageInfo&{previewId:string}>;return new Map(rows.map(({previewId,...info})=>[previewId,info]))}catch(error){if(missingTable(error))return new Map<string,StoredFitImageInfo>();throw error}}
 async recentPublications(since:number,limit:number,publisher?:ReviewApprover){const filter=publisher==='agent'?" AND actor LIKE 'mcp:%'":publisher==='person'?" AND actor NOT LIKE 'mcp:%'":'';return (await (await this.db()).query(`SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",preview_id AS "previewId",review,actor,created_at AS "createdAt",cue->>'name' AS name,cue->>'layout' AS layout,COALESCE(cue->'texts','{}'::jsonb) AS texts FROM authoring_revisions WHERE created_at>=$1${filter} ORDER BY created_at DESC,revision DESC LIMIT $2`,[since,limit])).rows.map((row:PublicationRecord&{createdAt:string|number})=>({...row,createdAt:Number(row.createdAt)}))}
}
const missingTable=(error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:unknown}).code==='42P01');

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
let defaultLocalSources:LocalSourceRepository|undefined;
/** T2 - this workspace's own sources, in the same storage mode as its drafts (db/local-sources.sql). */
export function localSourceRepository(){if(defaultLocalSources)return defaultLocalSources;const workspace=authoringRepositoryMode(process.env);return defaultLocalSources=workspace.storage==='memory'?new MemoryLocalSourceRepository():new PgLocalSourceRepository()}
const defaults=()=>{if(defaultService)return defaultService;const workspace=authoringRepositoryMode(process.env);return defaultService=createAuthoringService(authoringRepository(),workspace,undefined,undefined,undefined,localSourceRepository())};
// The web's source-review inbox (/api/source-review) under MCP names. It is its own service over
// the same drafts table, reached by dynamic import because lib/source-review.ts imports this file.
export const SOURCE_REVIEW_OPERATIONS:Readonly<Record<string,'scan'|'list'|'get'|'decide'>>={scan_source_changes:'scan',list_source_changes:'list',get_source_change:'get',decide_source_change:'decide'};
export async function authoringOperation(operation:string,input:unknown,actor:string){
 const review=Object.hasOwn(SOURCE_REVIEW_OPERATIONS,operation)?SOURCE_REVIEW_OPERATIONS[operation]:undefined;
 if(review){const {sourceReviewOperation}=await import('./source-review');return sourceReviewOperation(review,input,actor)}
 // C3 - the Companion deck tools (lib/companion-deck/tools.ts): their own store, reached by dynamic import like source review.
 if(isDeckTool(operation)){const {deckToolOperation,DeckToolError}=await import('./companion-deck/tools');try{return await deckToolOperation(operation,input,actor)}catch(error){if(error instanceof DeckToolError)throw new AuthoringError(error.code,error.message,error.status);throw error}}
 const result=await defaults().operation(operation,input,actor);
 if(['publish_draft','save_slots','rollback_draft','import_cue','retire_cue','restore_cue'].includes(operation)||(operation==='ship_draft'&&(result as {shipped?:unknown}).shipped===true)||((operation==='batch_ship'||operation==='supersede_cue')&&(result as {liveCatalogChanged?:unknown}).liveCatalogChanged===true)){
  const {relayConfigured}=await import('./relay');
  if(relayConfigured()){
   try{const {syncLiveCatalog}=await import('./sync-live-catalog');await syncLiveCatalog()}
   catch{return {...(result as Record<string,unknown>),liveRefreshPending:true,warning:'Saved successfully, but the live library has not received this update. Use Sync live library in the editor after the connection recovers. Live playback continues using the last synchronized version.'}}
  }
 }
 return result;
}
export async function publishedCues():Promise<Cue[]>{return defaults().publishedCues()}
/** MCP plan A3: every retired graphic in this workspace, for the live catalog, services and deck checks. */
export async function retiredCues():Promise<RetiredCue[]>{return defaults().retiredCues()}
/** For the deck validator (plan T-C / C2): a binding to a retired cue must be flagged. */
export async function isRetired(cueId:string):Promise<boolean>{return (await retiredCues()).some(cue=>cue.id===cueId)}
