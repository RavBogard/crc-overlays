import {isLayoutId,layoutChoices,layoutDefinition,type LayoutId} from './layout-registry';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import type {Cue} from './player';
import {loadSourceLibrary} from './source-library.ts';
import {templateLayoutFor} from './layout-label.ts';
import {layoutMotion} from './layout-definitions.ts';
import {markItalics} from './inline-italics.ts';

const require=createRequire(import.meta.url);
const sourceMapJson=require('../content/legacy-crc-shabbat-morning.sources.json');
const baselineCueJson=require('./cues.json');

export type Layout=LayoutId;
export type Presentation={hebrewFontSize?:number;transliterationFontSize?:number;translationFontSize?:number;titleFontSize?:number;hebrewLineHeight?:number;transliterationLineHeight?:number;translationLineHeight?:number;titleLineHeight?:number;hebrewLetterSpacing?:number;transliterationLetterSpacing?:number;translationLetterSpacing?:number;titleLetterSpacing?:number;hebrewFontFamily?:'noto-sans'|'david-libre'|'frank-ruhl-libre';bottomLayout?:'columns'|'stacked';bottomSplit?:number;verticalAlignment?:'top'|'center'|'bottom';legacyTitleWatermark?:boolean;keepHyphenatedWords?:boolean;largePrint?:boolean;alignment?:'start'|'center';lineSpacing?:'compact'|'spacious';imageAssetId?:string;latinLineBreaks?:'preserve'|'paragraphs'|'phrases'};
export type SourceGroup={sourceId:string;blockIds:string[]};
/**
 * C6: which text layers a graphic shows, and how they are arranged. `layers` and `arrangement`
 * are written only when they differ from what `includeTranslation` alone already implies, so
 * every graphic authored before this change keeps its exact stored shape, its pin and its hash.
 */
export type TextLayer='he'|'tr'|'en';
export type TextArrangement='together'|'blocks';
export const LAYER_ORDER=['he','tr','en'] as const;
export type BilingualContent={mode:'bilingual';hebrewGroups:SourceGroup[];transliterationGroups:SourceGroup[];includeTranslation?:boolean;layers?:TextLayer[];arrangement?:TextArrangement;rowOrder?:TextLayer[];preserveGroups?:true};
export function textLayers(content:BilingualContent):TextLayer[]{
 if(content.layers?.length)return LAYER_ORDER.filter(layer=>content.layers!.includes(layer));
 return content.includeTranslation?['he','tr','en']:['he','tr'];
}
export function textArrangement(content:BilingualContent):TextArrangement{return content.arrangement==='blocks'?'blocks':'together'}
/**
 * The order the three layers stack in on a side panel, set per graphic. Hebrew, transliteration,
 * translation is the default and is never stored, so a graphic that keeps it keeps its hash.
 */
export function textRowOrder(content:Pick<BilingualContent,'rowOrder'>):TextLayer[]{return content.rowOrder?.length===3?[...content.rowOrder]:[...LAYER_ORDER]}
export function parseRowOrder(value:unknown,field='rowOrder'):TextLayer[]|undefined{
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length!==3||new Set(value).size!==3||!value.every(item=>item==='he'||item==='tr'||item==='en'))throw new AuthoringError('invalid_input',`${field} must list he, tr and en exactly once each`);
 return JSON.stringify(value)===JSON.stringify(LAYER_ORDER)?undefined:[...value] as TextLayer[];
}
/** The stored form: the default pair (or trio) is left implicit, so old drafts never gain a field. */
export function layerFields(layers:TextLayer[],arrangement:TextArrangement,rowOrder?:TextLayer[]){
 const ordered=LAYER_ORDER.filter(layer=>layers.includes(layer));
 const translation=ordered.includes('en');
 const implicit=translation?['he','tr','en']:['he','tr'];
 return {
  ...(translation?{includeTranslation:true as const}:{}),
  ...(JSON.stringify(ordered)===JSON.stringify(implicit)?{}:{layers:ordered}),
  ...(arrangement==='blocks'?{arrangement:'blocks' as const}:{}),
  ...(rowOrder&&JSON.stringify(rowOrder)!==JSON.stringify(LAYER_ORDER)?{rowOrder:[...rowOrder]}:{}),
 };
}
export type OriginalEnglishContent={mode:'original-en';englishGroups:SourceGroup[]};
export type SourceEnglishContent={mode:'source-en';englishGroups:SourceGroup[]};
export type CanonicalContent=BilingualContent|OriginalEnglishContent|SourceEnglishContent;
export type VariantChannel='he'|'tr'|'en';
export type LocalVariantOverride={sourceId:string;blockId:string;channel:VariantChannel;sourceText:string;localText:string};
export type LocalVariantContent={mode:'local-variant';label:string;reason?:string;base:CanonicalContent;overrides:LocalVariantOverride[]};
/**
 * Custom text is the congregation's own words. `text` is one plain block. `rows` (set instead) are
 * typed lines laid out like a siddur passage: each row a Hebrew line, its transliteration and an
 * optional translation, built into the same channels and panel rows a source-backed graphic gets.
 * A draft without rows stores no `rows` key, so every existing custom graphic keeps its hash.
 */
export type CustomRow={he:string;tr:string;en:string};
export type CustomContent={mode:'custom';text:string;rows?:CustomRow[];rowOrder?:TextLayer[]};
export const CUSTOM_ROW_LIMIT=24;
/** The rows of a custom draft that carry any text, or none. */
export function customRows(content:DraftContent):CustomRow[]{return content.mode==='custom'?(content.rows??[]).filter(row=>row.he||row.tr||row.en):[]}
/**
 * One layer of the congregation's own words as a cue carries it. Every break typed is deliberate,
 * so it travels as U+2028, which Latin paragraph/phrase reflow leaves alone (the local wording
 * precedent; the Player turns it back into a line). `*words*` becomes italic (lib/inline-italics.ts).
 */
export function customLayer(text:string):string{return markItalics(text).replace(/\r\n?|\n/g,' ')}
export type DraftContent=CanonicalContent|LocalVariantContent|CustomContent;
export type EditableDraft={name:string;title:string;accentTitle?:string;layout:Layout;templateCueId:string;content:DraftContent;presentation:Presentation};
export type SourceAuthorityPin={id:string;feedSha256:string;unitSha256:string;sourceSha256:string};
export type SourcePin={feedSha256:string;unitSha256:Record<string,string>;blockSha256:Record<string,string>;sourceAuthority?:Record<string,SourceAuthorityPin>};
export type EnglishRole='translation'|'interpretation'|'translation-interpretation'|'kavannah'|'reading'|'rubric'|'note'|'unclassified';
export type SourceBlock={id:string;index:number;kind:'bilingual'|'original-en'|'source-en'|'translation-en';pairedBlockIds?:string[];parallelBlockIds?:string[];he?:string;tr?:string;en?:string;role?:'original';englishRole?:EnglishRole;automatic?:boolean;noteLike?:boolean;sourceLabel?:string;sourceBlockSha256:string;canonicalParentBlockId?:string;canonicalParentBlockSha256?:string};
export type SourceBoundary={block:number;endAfter:string};
export type AuthoringSource={id:string;name:string;section:string|number|null;unitSha256:string;blocks:SourceBlock[];sourceBoundaries?:{en:SourceBoundary[]};origin?:string;sourceSha256?:string;book?:string;service?:string;aliases?:string[];openingWords?:string[];metadata?:Record<string,unknown>;authority?:{id:string;repository:string;repositoryCommit:string;feed:string;feedSha256:string;unitId:string;unitSha256:string}};
export type SharedCueCopySpec=EditableDraft&{sourcePin:SourcePin;sourceSnapshots?:AuthoringSource[]};
/**
 * What a TBI graphic remembers about the CRC graphic it was copied from. `upstream` is the
 * CRC wording as it read at import — a few KB — so a later CRC change can be shown
 * side by side without keeping a second copy of the whole library.
 */
export type SharedCueUpstream={layout:Layout;texts:Record<string,string>;contentRows?:Cue['contentRows'];presentation?:Presentation};
export type SharedCueOrigin={workspaceId:'crc';cueId:string;cueHash:string;importedAt?:number;upstream?:SharedCueUpstream};
export type DraftSetSelection={sourceId:string;blockId:string;channels:VariantChannel[]};
export type DraftSetManifest={version:1;selections:DraftSetSelection[]};
export type DraftSplitOrigin={draftId:string;draftVersion:number};
export type Draft=EditableDraft&{id:string;version:number;sourcePin:SourcePin;activeRevision:number|null;activeDraftVersion:number|null;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string;draftSetId?:string;setIndex?:number;setCount?:number;draftSetManifest?:DraftSetManifest;splitFrom?:DraftSplitOrigin;sourceSnapshots?:AuthoringSource[];sharedFrom?:SharedCueOrigin;archivedAt?:number;archivedBy?:string;retired?:DraftRetirement;reference?:DraftReference;houseDefaultsVersion?:number};
/** T3 - what the old deck showed (a Singular composition's text), kept beside the draft for review; never part of the cue. */
export type DraftReference={origin:string;app?:string;comp?:string;text:string;imageAssetId?:string};
/**
 * MCP plan A3 - retire is not archive. Archive tidies the editor library and leaves the published
 * graphic playing. Retire withdraws the published graphic from every live surface (the catalog,
 * Companion's picker, the relay) by clearing activeRevision, and remembers here which revision was
 * live so restore_cue brings exactly that one back without a new review. A draft is retired only
 * while this is set AND activeRevision is null: publishing or rolling back puts it back on air.
 */
export type DraftRetirement={revision:number;draftVersion:number;retiredAt:number;retiredBy:string};
export const isRetiredDraft=(draft:Pick<Draft,'retired'|'activeRevision'>)=>Boolean(draft.retired)&&draft.activeRevision===null;
export type AuthoringCue=Cue&{presentation?:Presentation;authoring:{draftId:string;draftVersion:number;origin:'canonical'|'variant'|'local';sourceIds:string[];feedSha256:string;unitSha256:Record<string,string>;sourceAuthority?:Record<string,SourceAuthorityPin>;copySpec?:SharedCueCopySpec}};
export type SourcePack={schemaVersion:number;authority:{repository:string;repositoryCommit:string;feed:string;feedSha256:string;license:unknown;printing:unknown};sources:AuthoringSource[];authorities?:unknown[];library?:unknown};

export const sourcePack=loadSourceLibrary();
export const baselineCues=baselineCueJson as AuthoringCue[];

export class AuthoringError extends Error{
 code:string;status:number;details:Record<string,unknown>;
 constructor(code:string,message:string,status=400,details:Record<string,unknown>={}){super(message);this.code=code;this.status=status;this.details=details}
}

/**
 * Only these error details cross the wire. AuthoringError carries a free-form details bag,
 * so without an allowlist a future thrower could leak an unreviewed field into an HTTP body.
 */
export const PUBLIC_ERROR_DETAILS=['suggestedName'] as const;
export function publicErrorDetails(details:Record<string,unknown>):Record<string,unknown>{
 return Object.fromEntries(PUBLIC_ERROR_DETAILS.filter(key=>Object.hasOwn(details,key)).map(key=>[key,details[key]]));
}

/**
 * Library names are compared the way a person reads them (R6): surrounding and repeated
 * whitespace, letter case, punctuation, and Hebrew niqqud never make two graphics distinct.
 * This mirrors normalizeCueSearch so the duplicate warning agrees with what search finds.
 */
export function normalizeGraphicName(name:unknown):string{
 return String(name??'').normalize('NFKD').replace(/[֑-ׇ\p{M}]/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

function record(value:unknown,label:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AuthoringError('invalid_input',`${label} must be an object`);
 return value as Record<string,unknown>;
}
function onlyKeys(value:Record<string,unknown>,allowed:string[],label:string){
 const extra=Object.keys(value).filter(key=>!allowed.includes(key));
 if(extra.length)throw new AuthoringError('invalid_input',`${label} contains unsupported fields: ${extra.join(', ')}`);
}
function text(value:unknown,label:string,max:number,optional=false){
 if(optional&&(value===undefined||value===''))return undefined;
 if(typeof value!=='string'||!value.trim()||value.length>max)throw new AuthoringError('invalid_input',`${label} must be 1-${max} characters`);
 return value.trim();
}
/** Local wording is exact text. Whitespace at a block edge can carry an intentional line break. */
function verbatimText(value:unknown,label:string,max:number){
 if(typeof value!=='string'||!value.trim()||value.length>max)throw new AuthoringError('invalid_input',`${label} must be 1-${max} characters`);
 return value;
}
function integer(value:unknown,label:string,min:number,max:number){
 if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw new AuthoringError('invalid_input',`${label} must be an integer from ${min} to ${max}`);
 return value as number;
}
function rawSource(id:string,snapshots:AuthoringSource[]=[]){
 const found=snapshots.find(item=>item.id===id)??sourcePack.sources.find(item=>item.id===id);
 if(!found)throw new AuthoringError('unknown_source',`Unknown authoring source: ${id}`,404);
 return found;
}
function boundaryError(message:string){return new AuthoringError('invalid_source_boundary',message,409)}
function derivedBlockHash(parent:SourceBlock,ordinal:number,en:string){return createHash('sha256').update(JSON.stringify(canonicalValue({canonicalParentBlockId:parent.id,canonicalParentBlockSha256:parent.sourceBlockSha256,ordinal,en}))).digest('hex')}
/** Boundaries are pointers in the pack; children are resolved from canonical text at read time. */
export function resolveSourceBoundaries(value:AuthoringSource):AuthoringSource{
 const pointers=value.sourceBoundaries?.en;
 if(!pointers?.length)return value;
 const byBlock=new Map<number,SourceBoundary[]>();
 for(const pointer of pointers){
  if(!pointer||typeof pointer!=='object'||typeof pointer.block!=='number'||!Number.isInteger(pointer.block)||typeof pointer.endAfter!=='string'||!pointer.endAfter)throw boundaryError(`Source ${value.id} has an invalid source boundary pointer`);
  const group=byBlock.get(pointer.block)??[];group.push(pointer);byBlock.set(pointer.block,group);
 }
 const derived:SourceBlock[]=[];
 for(const [index,cuts] of byBlock){
  const parent=value.blocks.find(block=>block.index===index);
  if(!parent||parent.kind!=='original-en'||typeof parent.en!=='string'||!parent.en)throw boundaryError(`Source ${value.id} boundary block ${index} is not canonical original English`);
  let start=0;const parts:string[]=[];
  for(const cut of cuts){
   const first=parent.en.indexOf(cut.endAfter);
   if(first<0||first!==parent.en.lastIndexOf(cut.endAfter))throw boundaryError(`Source ${value.id} boundary anchor must occur exactly once in block ${index}`);
   const end=first+cut.endAfter.length;
   if(end<=start||end>=parent.en.length)throw boundaryError(`Source ${value.id} boundaries for block ${index} must be ordered interior cuts`);
   parts.push(parent.en.slice(start,end));start=end;
  }
  parts.push(parent.en.slice(start));
  if(parts.some(part=>!part)||parts.join('')!==parent.en)throw boundaryError(`Source ${value.id} boundaries for block ${index} do not form a lossless partition`);
  parts.forEach((en,ordinal)=>derived.push({...parent,id:`${parent.id}/slice-${ordinal}`,en,sourceBlockSha256:derivedBlockHash(parent,ordinal,en),canonicalParentBlockId:parent.id,canonicalParentBlockSha256:parent.sourceBlockSha256}));
 }
 return {...value,blocks:[...value.blocks,...derived]};
}
function source(id:string,snapshots:AuthoringSource[]=[]){return resolveSourceBoundaries(rawSource(id,snapshots))}
/**
 * G9 - an English passage that is not a translation (original-en, or a source's own source-en)
 * may stand in a bilingual selection beside Hebrew and transliteration blocks, in block order: an
 * English reading followed by its Hebrew chatimah. It adds nothing to the Hebrew or transliteration
 * channel and always shows, as an English row of its own; the translation layer governs only the
 * translations of the Hebrew blocks. A selection with no such passage renders exactly as before.
 */
export const englishOnly=(block:SourceBlock|undefined)=>block?.kind==='original-en'||block?.kind==='source-en';
function selectedBlock(sourceId:string,blockId:string,snapshots:AuthoringSource[]=[]){return source(sourceId,snapshots).blocks.find(block=>block.id===blockId)}
/** Whether a bilingual selection holds an English-only passage (G9). */
export function hasEnglishOnly(content:Pick<BilingualContent,'hebrewGroups'>,snapshots:AuthoringSource[]=[]){return content.hebrewGroups.some(group=>group.blockIds.some(blockId=>englishOnly(selectedBlock(group.sourceId,blockId,snapshots))))}
function parseGroups(value:unknown,label:string,kind:SourceBlock['kind'],snapshots:AuthoringSource[]=[]){
 if(!Array.isArray(value)||value.length<1||value.length>24)throw new AuthoringError('invalid_input',`${label} must contain 1-24 groups`);
 return value.map((raw,index)=>{
  const item=record(raw,`${label}[${index}]`);
  onlyKeys(item,['sourceId','blockIds'],`${label}[${index}]`);
  const sourceId=text(item.sourceId,`${label}[${index}].sourceId`,160)!;
  const selected=source(sourceId,snapshots);
  if(!Array.isArray(item.blockIds)||item.blockIds.length<1||item.blockIds.length>48)throw new AuthoringError('invalid_input',`${label}[${index}].blockIds must contain 1-48 IDs`);
  const blockIds=item.blockIds.map((id,blockIndex)=>text(id,`${label}[${index}].blockIds[${blockIndex}]`,220)!);
  for(const blockId of blockIds){
   const block=selected.blocks.find(candidate=>candidate.id===blockId);
   if(!block)throw new AuthoringError('unknown_block',`Block ${blockId} does not belong to ${sourceId}`,400);
   const matches=kind==='source-en'?(block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en))):kind==='bilingual'?block.kind==='bilingual'||englishOnly(block):block.kind===kind;
   if(!matches)throw new AuthoringError('invalid_channel',`Block ${blockId} is not ${kind}`);
  }
  return {sourceId,blockIds};
 });
}

export function parseContent(value:unknown,snapshots:AuthoringSource[]=[]):DraftContent{
 const input=record(value,'content');
 if(input.mode==='bilingual'){
  onlyKeys(input,['mode','hebrewGroups','transliterationGroups','includeTranslation','layers','arrangement','rowOrder','preserveGroups'],'content');
  const hebrewGroups=parseGroups(input.hebrewGroups,'content.hebrewGroups','bilingual',snapshots);
  const transliterationGroups=parseGroups(input.transliterationGroups,'content.transliterationGroups','bilingual',snapshots);
  const sequence=(groups:SourceGroup[])=>groups.flatMap(group=>group.blockIds.map(blockId=>`${group.sourceId}\u0000${blockId}`));
  const hebrewSequence=sequence(hebrewGroups);
  const transliterationSequence=sequence(transliterationGroups);
  if(new Set(hebrewSequence).size!==hebrewSequence.length||new Set(transliterationSequence).size!==transliterationSequence.length)throw new AuthoringError('repeated_source_block','A source block may be selected only once per language');
  if(JSON.stringify(hebrewSequence)!==JSON.stringify(transliterationSequence))throw new AuthoringError('mismatched_source_coverage','Hebrew and transliteration must select the same ordered source blocks');
  if(input.preserveGroups!==undefined&&typeof input.preserveGroups!=='boolean')throw new AuthoringError('invalid_input','preserveGroups must be boolean');
  if(input.preserveGroups===true&&JSON.stringify(hebrewGroups)!==JSON.stringify(transliterationGroups))throw new AuthoringError('mismatched_group_boundaries','Hebrew and transliteration must use the same passage groups when groups are shown separately');
  // G9 - English-only passages ride beside Hebrew; English alone is an English graphic.
  if(!hebrewGroups.some(group=>group.blockIds.some(blockId=>!englishOnly(selectedBlock(group.sourceId,blockId,snapshots)))))throw new AuthoringError('english_only_selection','Every selected block is English only. Use mode original-en (or source-en for a source\'s own English) for an English graphic.');
  if(input.includeTranslation!==undefined&&typeof input.includeTranslation!=='boolean')throw new AuthoringError('invalid_input','includeTranslation must be boolean');
  let layers:TextLayer[]=input.includeTranslation?['he','tr','en']:['he','tr'];
  if(input.layers!==undefined){
   if(!Array.isArray(input.layers))throw new AuthoringError('invalid_input','layers must be a list');
   const values=input.layers as unknown[];
   for(const value of values)if(value!=='he'&&value!=='tr'&&value!=='en')throw new AuthoringError('invalid_input','layers may only be he, tr or en');
   layers=LAYER_ORDER.filter(layer=>values.includes(layer));
   if(!layers.length)throw new AuthoringError('empty_layers','A graphic shows at least one text layer');
  }
  if(input.arrangement!==undefined&&input.arrangement!=='together'&&input.arrangement!=='blocks')throw new AuthoringError('invalid_input','arrangement must be together or blocks');
  const content:BilingualContent={mode:'bilingual',hebrewGroups,transliterationGroups,...layerFields(layers,input.arrangement==='blocks'?'blocks':'together',parseRowOrder(input.rowOrder,'content.rowOrder')),...(input.preserveGroups===true?{preserveGroups:true as const}:{})};
  if(layers.includes('en'))translationSelections(content,snapshots);
  if(content.preserveGroups&&layers.includes('en'))for(const {sourceId,pairIds} of translationSelections(content,snapshots)){
   if(!hebrewGroups.some(group=>group.sourceId===sourceId&&pairIds.every(id=>group.blockIds.includes(id))))throw new AuthoringError('group_splits_translation','Keep every paired Hebrew and English blessing in one group when showing groups separately');
  }
  return content;
 }
 if(input.mode==='original-en'){
  onlyKeys(input,['mode','englishGroups'],'content');
  const englishGroups=parseGroups(input.englishGroups,'content.englishGroups','original-en',snapshots);
  const sequence=englishGroups.flatMap(group=>group.blockIds.map(blockId=>`${group.sourceId}\u0000${blockId}`));
  if(new Set(sequence).size!==sequence.length)throw new AuthoringError('repeated_source_block','A source block may be selected only once');
  return {mode:'original-en',englishGroups};
 }
 if(input.mode==='source-en'){
  onlyKeys(input,['mode','englishGroups'],'content');
  const englishGroups=parseGroups(input.englishGroups,'content.englishGroups','source-en',snapshots);
  const sequence=englishGroups.flatMap(group=>group.blockIds.map(blockId=>`${group.sourceId}\u0000${blockId}`));
  if(new Set(sequence).size!==sequence.length)throw new AuthoringError('repeated_source_block','A source block may be selected only once');
  return {mode:'source-en',englishGroups};
 }
 if(input.mode==='local-variant'){
  onlyKeys(input,['mode','label','reason','base','overrides'],'content');
  const base=parseContent(input.base,snapshots);
  if(base.mode==='custom'||base.mode==='local-variant')throw new AuthoringError('invalid_variant_base','A local variant must retain a canonical source selection');
  if(!Array.isArray(input.overrides)||input.overrides.length<1||input.overrides.length>96)throw new AuthoringError('invalid_input','content.overrides must contain 1-96 deviations');
  const selected=new Set(selectedPairs(base,snapshots).map(pair=>JSON.stringify([pair.sourceId,pair.blockId])));const seen=new Set<string>();
  const overrides=input.overrides.map((raw,index)=>{const item=record(raw,`content.overrides[${index}]`);onlyKeys(item,['sourceId','blockId','channel','sourceText','localText'],`content.overrides[${index}]`);const sourceId=text(item.sourceId,`content.overrides[${index}].sourceId`,160)!,blockId=text(item.blockId,`content.overrides[${index}].blockId`,220)!,channel=String(item.channel) as VariantChannel;if(!['he','tr','en'].includes(channel))throw new AuthoringError('invalid_input',`content.overrides[${index}].channel must be he, tr, or en`);if(!selected.has(JSON.stringify([sourceId,blockId])))throw new AuthoringError('invalid_variant_target','A local deviation must target a selected canonical source block');const key=JSON.stringify([sourceId,blockId,channel]);if(seen.has(key))throw new AuthoringError('repeated_variant_override','A source channel may be overridden only once');seen.add(key);const canonical=source(sourceId,snapshots).blocks.find(block=>block.id===blockId)?.[channel];if(typeof canonical!=='string'||!canonical)throw new AuthoringError('missing_source_channel',`Source block ${blockId} lacks ${channel}`);const sourceText=verbatimText(item.sourceText,`content.overrides[${index}].sourceText`,4000),localText=verbatimText(item.localText,`content.overrides[${index}].localText`,4000);if(sourceText!==canonical)throw new AuthoringError('variant_source_changed','The recorded source text no longer matches its pinned source');return {sourceId,blockId,channel,sourceText,localText}});
  return {mode:'local-variant',label:text(input.label,'content.label',80)!,reason:text(input.reason,'content.reason',500,true),base,overrides};
 }
 if(input.mode==='custom'){
  onlyKeys(input,['mode','text','rows','rowOrder'],'content');
  // Empty is a real value here, and only here: a slot with nothing typed into it this week
  // publishes a graphic that draws no text at all. Every other content mode still refuses it,
  // and previewValidation still refuses an empty graphic unless the caller says it is a slot.
  const body=text(input.text,'content.text',4000,true)??'';
  if(input.rows===undefined){if(input.rowOrder!==undefined)throw new AuthoringError('invalid_input','content.rowOrder needs content.rows');return {mode:'custom',text:body}}
  if(!Array.isArray(input.rows)||input.rows.length>CUSTOM_ROW_LIMIT)throw new AuthoringError('invalid_input',`content.rows must be a list of at most ${CUSTOM_ROW_LIMIT} lines`);
  if(body)throw new AuthoringError('invalid_input','Custom text is either one block (content.text) or lines (content.rows), not both. Clear content.text to use lines.');
  // Each line keeps its own words exactly, trimmed at the edges; an empty layer is ''.
  const rows=input.rows.map((raw,index)=>{const row=record(raw,`content.rows[${index}]`);onlyKeys(row,['he','tr','en'],`content.rows[${index}]`);const layer=(key:TextLayer)=>{const value=row[key];if(value===undefined||value==='')return '';if(typeof value!=='string'||value.length>1000)throw new AuthoringError('invalid_input',`content.rows[${index}].${key} must be text of at most 1000 characters`);return value.trim()};return {he:layer('he'),tr:layer('tr'),en:layer('en')}}).filter(row=>row.he||row.tr||row.en);
  const rowOrder=parseRowOrder(input.rowOrder,'content.rowOrder');
  return {mode:'custom',text:'',rows,...(rowOrder?{rowOrder}:{})};
 }
 throw new AuthoringError('invalid_input','content.mode must be bilingual, original-en, source-en, local-variant, or custom');
}

// Only whole, explicitly paired canonical blessings can gain a translation.
function translationSelections(content:BilingualContent,snapshots:AuthoringSource[]=[]){
 return translationRuns(content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId}))),snapshots);
}
/** Walks a run of selected blocks and returns the authorized English that covers it, or throws. */
function translationRuns(pairs:Array<{sourceId:string;blockId:string}>,snapshots:AuthoringSource[]=[]){
 const result:Array<{sourceId:string;block:SourceBlock;pairIds:string[]}>=[];
 for(let offset=0;offset<pairs.length;){
  const first=pairs[offset];
  const blocks=source(first.sourceId,snapshots).blocks;
  // G9 - an English-only passage is its own English: it is shown as it stands, never translated.
  if(englishOnly(blocks.find(block=>block.id===first.blockId))){offset++;continue}
  const matches=blocks.filter(block=>block.kind==='translation-en'&&block.pairedBlockIds?.[0]===first.blockId);
  if(matches.length!==1)throw new AuthoringError('missing_translation','Select complete blessings with authorized English translations');
  const block=matches[0], pairIds=block.pairedBlockIds!;
  if(!block.en||!pairIds.length||pairIds.some((id,index)=>pairs[offset+index]?.sourceId!==first.sourceId||pairs[offset+index]?.blockId!==id))throw new AuthoringError('partial_translation','English requires complete, ordered blessing pairs');
  result.push({sourceId:first.sourceId,block,pairIds});offset+=pairIds.length;
 }
 return result;
}

export function parseEditable(value:unknown,partial=false,snapshots:AuthoringSource[]=[]):Partial<EditableDraft>{
 const input=record(value,partial?'patch':'draft');
 onlyKeys(input,['name','title','accentTitle','layout','templateCueId','content','presentation'],partial?'patch':'draft');
 const result:Partial<EditableDraft>={};
 if(!partial||input.name!==undefined)result.name=text(input.name,'name',80)!;
 if(!partial||input.title!==undefined)result.title=text(input.title,'title',100)!;
 if(!partial||input.accentTitle!==undefined)result.accentTitle=text(input.accentTitle,'accentTitle',60,true);
 if(!partial||input.layout!==undefined){
  if(!isLayoutId(input.layout))throw new AuthoringError('invalid_input',`layout must be ${layoutChoices()}`);
  result.layout=input.layout as Layout;
 }
 if(!partial||input.templateCueId!==undefined){
  const templateCueId=text(input.templateCueId,'templateCueId',80)!;
  if(!baselineCues.some(cue=>cue.id===templateCueId))throw new AuthoringError('unknown_template','Unknown baseline cue template',404);
  result.templateCueId=templateCueId;
 }
 if(!partial||input.content!==undefined)result.content=parseContent(input.content,snapshots);
 if(!partial||input.presentation!==undefined){
  const p=record(input.presentation??{},'presentation');
  onlyKeys(p,['hebrewFontSize','transliterationFontSize','translationFontSize','titleFontSize','hebrewLineHeight','transliterationLineHeight','translationLineHeight','titleLineHeight','hebrewLetterSpacing','transliterationLetterSpacing','translationLetterSpacing','titleLetterSpacing','hebrewFontFamily','bottomLayout','bottomSplit','verticalAlignment','legacyTitleWatermark','keepHyphenatedWords','largePrint','alignment','lineSpacing','imageAssetId','latinLineBreaks'],'presentation');
  const presentation:Presentation={};
  if(p.hebrewFontSize!==undefined)presentation.hebrewFontSize=integer(p.hebrewFontSize,'hebrewFontSize',24,52);
  if(p.transliterationFontSize!==undefined)presentation.transliterationFontSize=integer(p.transliterationFontSize,'transliterationFontSize',20,48);
  if(p.translationFontSize!==undefined)presentation.translationFontSize=integer(p.translationFontSize,'translationFontSize',20,48);
  if(p.titleFontSize!==undefined)presentation.titleFontSize=integer(p.titleFontSize,'titleFontSize',20,42);
  for(const key of ['hebrewLineHeight','transliterationLineHeight','translationLineHeight','titleLineHeight'] as const)if(p[key]!==undefined){if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<0.9||p[key]>2)throw new AuthoringError('invalid_input',`${key} must be a number from 0.9 to 2`);presentation[key]=p[key]}
  for(const key of ['hebrewLetterSpacing','transliterationLetterSpacing','translationLetterSpacing','titleLetterSpacing'] as const)if(p[key]!==undefined){if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<-2||p[key]>8)throw new AuthoringError('invalid_input',`${key} must be a number from -2 to 8`);presentation[key]=p[key]}
  if(p.hebrewFontFamily!==undefined){if(p.hebrewFontFamily!=='noto-sans'&&p.hebrewFontFamily!=='david-libre'&&p.hebrewFontFamily!=='frank-ruhl-libre')throw new AuthoringError('invalid_input','hebrewFontFamily must be noto-sans, david-libre, or frank-ruhl-libre');presentation.hebrewFontFamily=p.hebrewFontFamily}
  if(p.bottomLayout!==undefined){if(p.bottomLayout!=='columns'&&p.bottomLayout!=='stacked')throw new AuthoringError('invalid_input','bottomLayout must be columns or stacked');presentation.bottomLayout=p.bottomLayout}
  if(p.bottomSplit!==undefined)presentation.bottomSplit=integer(p.bottomSplit,'bottomSplit',20,80);
  if(p.verticalAlignment!==undefined){if(p.verticalAlignment!=='top'&&p.verticalAlignment!=='center'&&p.verticalAlignment!=='bottom')throw new AuthoringError('invalid_input','verticalAlignment must be top, center, or bottom');presentation.verticalAlignment=p.verticalAlignment}
  for(const key of ['legacyTitleWatermark','keepHyphenatedWords','largePrint'] as const)if(p[key]!==undefined){if(typeof p[key]!=='boolean')throw new AuthoringError('invalid_input',`${key} must be boolean`);presentation[key]=p[key]}
  if(p.alignment!==undefined){if(p.alignment!=='start'&&p.alignment!=='center')throw new AuthoringError('invalid_input','alignment must be start or center');presentation.alignment=p.alignment}
  if(p.lineSpacing!==undefined){if(p.lineSpacing!=='compact'&&p.lineSpacing!=='spacious')throw new AuthoringError('invalid_input','lineSpacing must be compact or spacious');presentation.lineSpacing=p.lineSpacing}
  if(p.imageAssetId!==undefined){if(typeof p.imageAssetId!=='string'||!/^asset_[a-f0-9]{64}$/.test(p.imageAssetId))throw new AuthoringError('invalid_input','imageAssetId must identify a workspace asset');presentation.imageAssetId=p.imageAssetId}
  if(p.latinLineBreaks!==undefined){if(p.latinLineBreaks!=='preserve'&&p.latinLineBreaks!=='paragraphs'&&p.latinLineBreaks!=='phrases')throw new AuthoringError('invalid_input','latinLineBreaks must be preserve, paragraphs, or phrases');presentation.latinLineBreaks=p.latinLineBreaks}
  result.presentation=presentation;
 }
 if(!partial){
  const template=baselineCues.find(cue=>cue.id===result.templateCueId)!;
  if(template.layout!==templateLayoutFor(result.layout!))throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
 }
 return result;
}

/**
 * G3 - a sung line a congregation prints in transliteration only (lib/local-sources.ts): a
 * bilingual block with its transliteration and no Hebrew. It adds nothing to the Hebrew channel,
 * so a graphic draws it as a transliteration row and never as an empty Hebrew one.
 */
export const transliterationOnly=(block:SourceBlock|undefined)=>block?.kind==='bilingual'&&block.he===undefined&&typeof block.tr==='string'&&block.tr.length>0;
function renderGroup(group:SourceGroup,channel:'he'|'tr'|'en',snapshots:AuthoringSource[]=[],overrides:LocalVariantOverride[]=[]){
 const selected=source(group.sourceId,snapshots);
 return group.blockIds.flatMap(id=>{
  const block=selected.blocks.find(candidate=>candidate.id===id);
  const value=overrides.find(item=>item.sourceId===group.sourceId&&item.blockId===id&&item.channel===channel)?.localText??block?.[channel];
  if(channel==='he'&&value===undefined&&transliterationOnly(block))return [];
  if(channel!=='en'&&value===undefined&&englishOnly(block))return [];
  if(typeof value!=='string'||!value)throw new AuthoringError('missing_source_channel',`Source block ${id} lacks ${channel}`);
  return [value];
 }).reduce((joined,value)=>joined?`${joined}${joined.endsWith('\u2028')?'':' '}${value}`:value,'');
}

/**
 * Groups joined into one language paragraph run. Legacy selections often cut one source into
 * arbitrary contiguous slices (one transliteration line per group); those slices are not stanzas,
 * so they join with a line break. A blank line marks a real boundary only: a different source, or
 * a selection that skips a block carrying this channel.
 */
function joinGroupParagraphs(groups:SourceGroup[],channel:'he'|'tr',snapshots:AuthoringSource[]=[],overrides:LocalVariantOverride[]=[]){
 // A group with nothing in this channel (transliteration-only lines, in Hebrew) is skipped, and
 // the boundary is judged between the blocks that do carry it.
 let previous:SourceGroup|null=null;
 return groups.map(group=>{
  const text=renderGroup(group,channel,snapshots,overrides);
  if(!text)return '';
  const before=previous;previous=group;
  if(!before)return text;
  if(before.sourceId!==group.sourceId)return `\n\n${text}`;
  const order=source(group.sourceId,snapshots).blocks.filter(block=>typeof block[channel]==='string'&&block[channel]).map(block=>block.id);
  const carried=(ids:string[])=>ids.filter(id=>order.includes(id));
  const last=order.indexOf(carried(before.blockIds).at(-1)??''),next=order.indexOf(carried(group.blockIds)[0]??'');
  return `${last>=0&&next===last+1?'\n':'\n\n'}${text}`;
 }).join('');
}

/**
 * The authorized English of a selection, as runs, each tagged with the slide (group) its first
 * block sits in. A pair may span the slides an author drew, so the runs are always computed over
 * the whole selection and then attributed; computing them per slide would refuse a legal split.
 */
function englishRunTexts(content:BilingualContent,snapshots:AuthoringSource[]=[],overrides:LocalVariantOverride[]=[]){
 const groupOf=new Map<string,number>();
 content.hebrewGroups.forEach((group,index)=>group.blockIds.forEach(blockId=>{if(!groupOf.has(`${group.sourceId} ${blockId}`))groupOf.set(`${group.sourceId} ${blockId}`,index)}));
 return translationSelections(content,snapshots).map(({sourceId,block,pairIds})=>({
  group:groupOf.get(`${sourceId} ${pairIds[0]}`)??0,
  text:overrides.find(item=>item.sourceId===sourceId&&item.blockId===block.id&&item.channel==='en')?.localText??block.en!,
 }));
}

/**
 * G9 - the English a bilingual selection shows, in block order: every English-only passage and,
 * when the translation layer is lit, every translation run at its first block.
 */
function englishInOrder(content:BilingualContent,snapshots:AuthoringSource[]=[],overrides:LocalVariantOverride[]=[],withTranslation=true){
 const english=(sourceId:string,block:SourceBlock)=>overrides.find(item=>item.sourceId===sourceId&&item.blockId===block.id&&item.channel==='en')?.localText??block.en!;
 const runs=withTranslation?translationSelections(content,snapshots):[];
 return content.hebrewGroups.flatMap(group=>group.blockIds.flatMap(blockId=>{
  const block=selectedBlock(group.sourceId,blockId,snapshots);
  if(englishOnly(block))return [{sourceId:group.sourceId,pairIds:[blockId],englishOnly:true,text:english(group.sourceId,block!)}];
  const run=runs.find(item=>item.sourceId===group.sourceId&&item.pairIds[0]===blockId);
  return run?[{sourceId:run.sourceId,pairIds:run.pairIds,englishOnly:false,text:english(run.sourceId,run.block)}]:[];
 }));
}
/**
 * G9 - a bilingual selection cut where English-only passages begin and end: each English run is
 * its blocks, each Hebrew run is a bilingual selection of its own (Hebrew and transliteration
 * groups cut at the same places, so they still cover the same blocks). A selection with no
 * English-only passage is one run, the content itself.
 */
function englishOnlyRuns(content:BilingualContent,snapshots:AuthoringSource[]=[]):Array<{english:true;blocks:{sourceId:string;block:SourceBlock}[]}|{english:false;content:BilingualContent}>{
 if(!hasEnglishOnly(content,snapshots))return [{english:false,content}];
 const cut=(groups:SourceGroup[])=>{
  const runs:{english:boolean;groups:SourceGroup[];blocks:{sourceId:string;block:SourceBlock}[]}[]=[];
  for(const group of groups){let current:SourceGroup|null=null;for(const blockId of group.blockIds){
   const block=selectedBlock(group.sourceId,blockId,snapshots)!,english=englishOnly(block);
   let run=runs.at(-1);if(!run||run.english!==english){run={english,groups:[],blocks:[]};runs.push(run);current=null}
   if(!current){current={sourceId:group.sourceId,blockIds:[]};run.groups.push(current)}
   current.blockIds.push(blockId);run.blocks.push({sourceId:group.sourceId,block});
  }}
  return runs;
 };
 const hebrew=cut(content.hebrewGroups),transliteration=cut(content.transliterationGroups);
 return hebrew.map((run,index)=>run.english?{english:true as const,blocks:run.blocks}:{english:false as const,content:{...content,hebrewGroups:run.groups,transliterationGroups:transliteration[index].groups}});
}

/**
 * C6. A panel graphic is a list of rows, and the two arrangements are two ways of cutting the
 * same passages into rows: **Together** gives each passage its own row carrying every lit layer;
 * **In blocks** gives each slide one row per lit layer, so the whole slide's Hebrew stands
 * together, then its transliteration, then its translation. A block never spans slides because a
 * slide is a group. A lower third is not a list of rows and keeps its own two columns. The
 * graphic's row order (default Hebrew, transliteration, translation) sets the order in both.
 */
function composeContentRows(draft:Draft,content:BilingualContent,overrides:LocalVariantOverride[],layers:TextLayer[]):Array<{he:string;tr:string;en:string}>{
 if(draft.layout!=='left'&&draft.layout!=='right')return [];
 if(content.preserveGroups)return content.hebrewGroups.flatMap((group,index)=>{
  const within:BilingualContent={...content,preserveGroups:undefined,hebrewGroups:[group],transliterationGroups:[content.transliterationGroups[index]!]};
  if(textArrangement(content)==='blocks')return composeContentRows(draft,within,overrides,layers);
  const row={
   he:layers.includes('he')?renderGroup(group,'he',draft.sourceSnapshots,overrides):'',
   tr:layers.includes('tr')?renderGroup(group,'tr',draft.sourceSnapshots,overrides):'',
   en:englishInOrder(within,draft.sourceSnapshots,overrides,layers.includes('en')).map(item=>item.text).join('\n'),
  };
  return row.he||row.tr||row.en?[row]:[];
 });
 const snapshots=draft.sourceSnapshots;
 const text=(sourceId:string,blockIds:string[],channel:'he'|'tr')=>layers.includes(channel)?renderGroup({sourceId,blockIds},channel,snapshots,overrides):'';
 const english=(sourceId:string,block:SourceBlock)=>overrides.find(item=>item.sourceId===sourceId&&item.blockId===block.id&&item.channel==='en')?.localText??block.en!;
 if(textArrangement(content)==='blocks'){
  const rows:Array<{he:string;tr:string;en:string}>=[];
  // Blocks means contiguous language paragraphs, not a Hebrew/transliteration pair for every
  // selection group. Real boundaries remain visible as paragraphs; no source selection changes.
  // The rows follow the graphic's row order; the default is Hebrew, transliteration, translation.
  // G9 - an English-only passage stands as one English row where it falls; the Hebrew on either
  // side of it is arranged in blocks on its own.
  for(const part of englishOnlyRuns(content,snapshots)){
   if(part.english){rows.push({he:'',tr:'',en:part.blocks.map(({sourceId,block})=>english(sourceId,block)).join('\n\n')});continue}
   const run=part.content;
   const block:Record<TextLayer,()=>{he:string;tr:string;en:string}>={
    he:()=>({he:joinGroupParagraphs(run.hebrewGroups,'he',snapshots,overrides),tr:'',en:''}),
    tr:()=>({he:'',tr:joinGroupParagraphs(run.transliterationGroups,'tr',snapshots,overrides),en:''}),
    en:()=>({he:'',tr:'',en:englishRunTexts(run,snapshots,overrides).map(item=>item.text).join('\n\n')}),
   };
   for(const layer of textRowOrder(content))if(layers.includes(layer)){const row=block[layer]();if(row.he||row.tr||row.en)rows.push(row)}
  }
  return rows;
 }
 // G9 - Together, an English-only passage is a row of its own English, in block order.
 if(hasEnglishOnly(content,snapshots)){
  if(layers.includes('en'))return englishInOrder(content,snapshots,overrides).map(item=>item.englishOnly?{he:'',tr:'',en:item.text}:{he:text(item.sourceId,item.pairIds,'he'),tr:text(item.sourceId,item.pairIds,'tr'),en:item.text});
  return content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>{const block=selectedBlock(group.sourceId,blockId,snapshots);return englishOnly(block)?{he:'',tr:'',en:english(group.sourceId,block!)}:{he:text(group.sourceId,[blockId],'he'),tr:text(group.sourceId,[blockId],'tr'),en:''}}));
 }
 if(layers.includes('en'))return translationSelections(content,snapshots).map(({sourceId,block,pairIds})=>({he:text(sourceId,pairIds,'he'),tr:text(sourceId,pairIds,'tr'),en:english(sourceId,block)}));
 return content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({he:text(group.sourceId,[blockId],'he'),tr:text(group.sourceId,[blockId],'tr'),en:''})));
}

export function buildCue(draft:Draft):AuthoringCue{
 assertSourcePin(draft);
 const template=baselineCues.find(cue=>cue.id===draft.templateCueId);
 if(!template)throw new AuthoringError('unknown_template','Draft template is unavailable',409);
 if(template.layout!==templateLayoutFor(draft.layout))throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
 const content=draft.content.mode==='local-variant'?draft.content.base:draft.content;
 // A local line break is authored as a literal newline. Mark it only in the built cue so
 // Latin paragraph/phrase reflow can distinguish it from source line wrapping.
 const overrides=draft.content.mode==='local-variant'?draft.content.overrides.map(item=>item.channel==='he'?item:{...item,localText:item.localText.replace(/\r\n?|\n/g,'\u2028')}):[];
 // A corner card holds a line or two: Hebrew and its transliteration, or one English line. It
 // has no room for a third, translated layer, and dropping a lit layer silently would not do.
 const lines=customRows(content).map(row=>({he:customLayer(row.he),tr:customLayer(row.tr),en:customLayer(row.en)}));
 if(layoutDefinition(draft.layout)?.capabilities.translation===false&&lines.some(row=>row.en))throw new AuthoringError('corner_translation_unsupported',`A ${layoutDefinition(draft.layout)!.label.toLowerCase()} shows Hebrew and transliteration only. Clear the translation lines, or use a lower third or a panel.`,409);
 if(layoutDefinition(draft.layout)?.capabilities.translation===false&&content.mode==='bilingual'&&textLayers(content).includes('en'))throw new AuthoringError('corner_translation_unsupported','A corner card shows Hebrew and transliteration only. Turn off Translation, or use a lower third or a panel.',409);
 if(content.mode==='bilingual'&&content.preserveGroups&&draft.layout!=='left'&&draft.layout!=='right')throw new AuthoringError('group_layout_unsupported','Separate passage groups within one graphic need a left or right panel.',409);
 // G9 - an English-only passage beside Hebrew is a panel row or a lower third's English line; no other card has a place for it.
 const englishPassage=content.mode==='bilingual'&&hasEnglishOnly(content,draft.sourceSnapshots);
 if(englishPassage&&draft.layout!=='left'&&draft.layout!=='right'&&draft.layout!=='bottom')throw new AuthoringError('english_passage_unsupported','This graphic has an English passage beside its Hebrew, which only a side panel or a lower third can show. Use layout left, right or bottom.',409);
 const texts:Record<string,string>={textTitle:draft.title};
 if(draft.accentTitle)texts.accentTextTitle=draft.accentTitle;
 const groups=content.mode==='bilingual'?[...content.hebrewGroups,...content.transliterationGroups]:content.mode==='original-en'||content.mode==='source-en'?content.englishGroups:[];
 const layers=content.mode==='bilingual'?textLayers(content):[];
 if(content.mode==='bilingual'){
  if(layers.includes('he')){const hebrew=content.hebrewGroups.map(group=>renderGroup(group,'he',draft.sourceSnapshots,overrides)).filter(Boolean).join('\n');if(hebrew)texts.textMainheb=hebrew}
  if(layers.includes('tr')){const transliteration=content.transliterationGroups.map(group=>renderGroup(group,'tr',draft.sourceSnapshots,overrides));texts.textMainEng=(englishPassage?transliteration.filter(Boolean):transliteration).join('\n')}
  // A lower third is two columns and cannot be arranged, so its translation is a third
  // line beneath them rather than a row in a list. Ruled available, not default (Daniel,
  // 2026-09-14): the chip is dark unless an author lights it.
  // G9 - on a lower third an English-only passage joins that line, in block order.
  if(englishPassage&&draft.layout==='bottom')texts.textTranslation=englishInOrder(content,draft.sourceSnapshots,overrides,layers.includes('en')).map(item=>item.text).join(' ');
  else if(layers.includes('en')&&draft.layout==='bottom')texts.textTranslation=englishRunTexts(content,draft.sourceSnapshots,overrides).map(item=>item.text).join(' ');
 }else if(content.mode==='original-en'||content.mode==='source-en')texts.textMain=content.englishGroups.map(group=>renderGroup(group,'en',draft.sourceSnapshots,overrides)).join('\n');
 // Typed lines build exactly as a passage's: Hebrew and transliteration channels, a lower third's
 // translation line, and (below) one panel row per line.
 else if(lines.length){
  const join=(key:TextLayer,separator:string)=>lines.map(row=>row[key]).filter(Boolean).join(separator);
  const hebrew=join('he',' '),transliteration=join('tr',' ');
  if(hebrew)texts.textMainheb=hebrew;
  if(transliteration)texts.textMainEng=transliteration;
  if(draft.layout==='bottom'&&join('en',' '))texts.textTranslation=join('en',' ');
 }
 // An empty custom text writes no main layer at all, so the renderer draws the title bar and
 // nothing else. `textParts` already skips a falsy channel; leaving the key out keeps the
 // published cue free of an empty string nobody reads.
 else if(content.mode==='custom'&&content.text)texts.textMain=customLayer(content.text);
 const sourceIds=[...new Set(groups.map(group=>group.sourceId))].sort();
 // MCP plan L2: a data layout pins its published definition and takes that definition's own
 // motion (R-L5); only the built-in four still clone their template cue's, unchanged.
 const dataLayout=layoutDefinition(draft.layout)?.ref?layoutDefinition(draft.layout):undefined;
 const motion=dataLayout?.motion?layoutMotion(dataLayout.motion):null;
 const animations=motion?motion.animations:structuredClone(template.animations);
 const layered=content.mode==='bilingual'||lines.length>0;
 if(motion){/* the definition's motion already names every text element */}else if(layered&&!animations.some(track=>track.element==='textMainheb'||track.element==='textMainEng')){
  const combined=animations.filter(track=>track.element==='textMain');
  if(combined.length){
   for(let index=animations.length-1;index>=0;index--)if(animations[index].element==='textMain')animations.splice(index,1);
   animations.push(...combined.flatMap(track=>[{...structuredClone(track),element:'textMainheb'},{...structuredClone(track),element:'textMainEng'}]));
  }
 }else if(!layered&&!animations.some(track=>track.element==='textMain')){
  const single=animations.filter(track=>track.element==='textMainEng');
  const fallback=single.length?single:animations.filter(track=>track.element==='textMainheb');
  if(fallback.length){
   for(let index=animations.length-1;index>=0;index--)if(animations[index].element==='textMainheb'||animations[index].element==='textMainEng')animations.splice(index,1);
   animations.push(...fallback.map(track=>({...structuredClone(track),element:'textMain'})));
  }
 }
 if(texts.textTranslation&&!animations.some(track=>track.element==='textTranslation')){
  animations.push(...animations.filter(track=>track.element==='textMainEng').map(track=>({...structuredClone(track),element:'textTranslation'})));
 }
 return {
  id:draft.id,name:draft.name,layout:draft.layout,...(dataLayout?.ref?{layoutRef:{...dataLayout.ref}}:{}),texts,
  ...(content.mode==='bilingual'?(rows=>rows.length?{contentRows:rows}:{})(composeContentRows(draft,content,overrides,layers)):{}),
  ...(lines.length?{contentRows:lines.map(row=>({...row}))}:{}),
  ...((content.mode==='bilingual'||lines.length)&&content.mode!=='original-en'&&content.mode!=='source-en'&&content.rowOrder?{rowOrder:textRowOrder(content)}:{}),
  animations,duration:motion?motion.duration:structuredClone(template.duration),
  ...(!motion&&template.template?{template:structuredClone(template.template)}:{}),
  ...(Object.keys(draft.presentation).length?{presentation:structuredClone(draft.presentation)}:{}),
  authoring:{
   draftId:draft.id,draftVersion:draft.version,origin:draft.content.mode==='custom'?'local':draft.content.mode==='local-variant'?'variant':'canonical',sourceIds,feedSha256:draft.content.mode==='custom'?'local':draft.sourcePin.feedSha256,
   unitSha256:Object.fromEntries(sourceIds.map(id=>[id,source(id,draft.sourceSnapshots).unitSha256])),
   ...(draft.sourcePin.sourceAuthority?{sourceAuthority:structuredClone(draft.sourcePin.sourceAuthority)}:{}),
   copySpec:{...structuredClone(editableOnly(draft)),sourcePin:structuredClone(draft.sourcePin),...(sourceIds.length?{sourceSnapshots:sourceIds.map(id=>structuredClone(source(id,draft.sourceSnapshots)))}:{})},
  },
 };
}

function editableOnly(draft:Draft):EditableDraft{return {name:draft.name,title:draft.title,accentTitle:draft.accentTitle,layout:draft.layout,templateCueId:draft.templateCueId,content:structuredClone(draft.content),presentation:structuredClone(draft.presentation)}}
function selectedPairs(content:DraftContent,snapshots:AuthoringSource[]=[]){
 if(content.mode==='custom')return [];
 if(content.mode==='local-variant')return selectedPairs(content.base,snapshots);
 const groups=content.mode==='bilingual'?content.hebrewGroups:content.englishGroups;
 const pairs=groups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId})));
 if(content.mode==='bilingual'&&content.includeTranslation)pairs.push(...translationSelections(content,snapshots).map(({sourceId,block})=>({sourceId,blockId:block.id})));
 return pairs;
}
export function sourceReferences(content:DraftContent,snapshots:AuthoringSource[]=[]){return selectedPairs(content,snapshots)}
export function draftSetSelections(content:DraftContent,snapshots:AuthoringSource[]=[]):DraftSetSelection[]{if(content.mode==='local-variant')return draftSetSelections(content.base,snapshots);if(content.mode==='custom')return [];if(content.mode==='bilingual'){const base=content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId,channels:(englishOnly(selectedBlock(group.sourceId,blockId,snapshots))?['en']:['he','tr']) as VariantChannel[]})));if(!content.includeTranslation)return base;const baseKeys=new Set(base.map(item=>JSON.stringify([item.sourceId,item.blockId])));return [...base,...selectedPairs(content,snapshots).filter(item=>!baseKeys.has(JSON.stringify([item.sourceId,item.blockId]))).map(item=>({...item,channels:['en'] as VariantChannel[]}))]}return content.englishGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId,channels:['en'] as VariantChannel[]})))}
export function sourceSnapshotsFor(content:DraftContent,snapshots:AuthoringSource[]=[]){return [...new Set(selectedPairs(content,snapshots).map(pair=>pair.sourceId))].sort().map(id=>structuredClone(rawSource(id,snapshots)))}
export function sourceBlockFor(sourceId:string,blockId:string,snapshots:AuthoringSource[]=[]){const block=source(sourceId,snapshots).blocks.find(item=>item.id===blockId);if(!block)throw new AuthoringError('unknown_block',`Block ${blockId} does not belong to ${sourceId}`,400);return block}
export function sourcePinFor(content:DraftContent,snapshots:AuthoringSource[]=[],feedSha256=sourcePack.authority.feedSha256):SourcePin{
 if(content.mode==='custom')return {feedSha256:'local',unitSha256:{},blockSha256:{}};
 const pairs=selectedPairs(content,snapshots);
 const sourceIds=[...new Set(pairs.map(pair=>pair.sourceId))].sort();
 const sourceAuthority=Object.fromEntries(sourceIds.filter(id=>id.startsWith('library:')).map(id=>{
  const selected=source(id,snapshots);const authority=selected.authority;
  if(!authority||!selected.sourceSha256)throw new AuthoringError('invalid_source_authority',`Expanded source authority is unavailable for ${id}`,409);
  return [id,{id:authority.id,feedSha256:authority.feedSha256,unitSha256:authority.unitSha256,sourceSha256:selected.sourceSha256} satisfies SourceAuthorityPin];
 }));
 return {
  feedSha256,
  unitSha256:Object.fromEntries(sourceIds.map(id=>[id,source(id,snapshots).unitSha256])),
  blockSha256:Object.fromEntries(pairs.map(({sourceId,blockId})=>{
   const block=sourceBlockFor(sourceId,blockId,snapshots);
   return [JSON.stringify([sourceId,blockId]),block.sourceBlockSha256];
  })),
  ...(Object.keys(sourceAuthority).length?{sourceAuthority}:{}),
 };
}
function canonicalValue(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonicalValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map(key=>[key,canonicalValue((value as Record<string,unknown>)[key])]));
 return value;
}
export function sameStructuredValue(left:unknown,right:unknown){return JSON.stringify(canonicalValue(left))===JSON.stringify(canonicalValue(right))}
export function assertSourcePin(draft:Draft){
 const current=sourcePinFor(draft.content,draft.sourceSnapshots,draft.sourceSnapshots?.length?draft.sourcePin.feedSha256:undefined);
 if(!sameStructuredValue(current,draft.sourcePin))throw new AuthoringError('source_pin_mismatch','Pinned source authority has changed; explicit source rebase and review are required',409);
}

/**
 * Sources whose stored pin no longer matches what the draft's own selection produces. Used to allow
 * the explicit rebase a stale pin asks for: every other edit of a stale draft is still refused.
 */
export function staleSourceIds(draft:Draft):string[]{
 const stored=draft.sourcePin,ids=Object.keys(stored.unitSha256??{});
 let current:SourcePin;
 try{current=sourcePinFor(draft.content,draft.sourceSnapshots,draft.sourceSnapshots?.length?stored.feedSha256:undefined)}catch{return ids}
 if(current.feedSha256!==stored.feedSha256)return [...new Set([...ids,...Object.keys(current.unitSha256)])];
 const blocksOf=(pin:SourcePin,id:string)=>Object.entries(pin.blockSha256).filter(([key])=>JSON.parse(key)[0]===id).sort(([a],[b])=>a.localeCompare(b));
 const authorityOf=(pin:SourcePin,id:string)=>pin.sourceAuthority?.[id];
 return [...new Set([...ids,...Object.keys(current.unitSha256)])].filter(id=>current.unitSha256[id]!==stored.unitSha256[id]||!sameStructuredValue(authorityOf(current,id),authorityOf(stored,id))||!sameStructuredValue(blocksOf(current,id),blocksOf(stored,id)));
}

export function cueHash(cue:AuthoringCue){return createHash('sha256').update(JSON.stringify(cue)).digest('hex')}
export function previewValidation(cue:AuthoringCue,allowEmptyText=false){
 const errors:string[]=[];
 // C6: any combination of layers is authored deliberately, so a single channel is no longer an
 // error. What is still an error is a graphic with nothing to read on it -- except a slot left
 // blank for this service, which is deliberately a graphic with nothing on it.
 if(!allowEmptyText&&!cue.texts.textMain&&!cue.texts.textMainheb&&!cue.texts.textMainEng&&!cue.contentRows?.length)errors.push('This graphic has no text yet');
 return {valid:errors.length===0,errors,warnings:[],requiresBrowserReview:true};
}

type SourceSpec={unit?:string;channel?:string;blocks?:number[]};
function groupsFromSpecs(specs:SourceSpec[]){return specs.map(spec=>({sourceId:spec.unit!,blockIds:(spec.blocks??[]).map(index=>`${spec.unit}#block-${index}`)}))}

export function editableFromBaseline(cueId:string):EditableDraft{
 const cue=baselineCues.find(item=>item.id===cueId);
 const mapping=(sourceMapJson.cues as Array<Record<string,unknown>>).find(item=>item.id===cueId) as Record<string,unknown>|undefined;
 if(!cue||!mapping)throw new AuthoringError('unknown_cue','Unknown baseline cue',404);
 if(mapping.nonLiturgical){
  // Archive-only announcements have no prayer-source blocks to pin. They can still use the
  // authoring custom-text path when every visible channel is representable there; reject any
  // other channel before import so an archive graphic is never silently reduced.
  const supported=new Set(['textTitle','accentTextTitle','textMain']);
  const unsupported=Object.keys(cue.texts).filter(key=>!supported.has(key));
  if(unsupported.length)throw new AuthoringError('unmanaged_content','Non-liturgical baseline has unsupported text channels: '+unsupported.join(', '),409);
  const exact=(value:unknown,label:string,optional=false)=>{
   if(optional&&value===undefined)return undefined;
   if(typeof value!=='string'||!value||value!==value.trim())throw new AuthoringError('unmanaged_content','Non-liturgical baseline '+label+' cannot be imported without changing its archive text',409);
   return value;
  };
  const content={mode:'custom' as const,text:exact(cue.texts.textMain,'textMain')!};
  return parseEditable({name:cue.name,title:exact(cue.texts.textTitle,'textTitle')!,accentTitle:exact(cue.texts.accentTextTitle,'accentTextTitle',true),layout:cue.layout,templateCueId:cue.id,content,presentation:(cue as AuthoringCue).presentation??{}}) as EditableDraft;
 }
 const fields=mapping.fields as Record<string,SourceSpec[]>;
 const specs=Object.values(fields).flat();
 let content:DraftContent;
 if(mapping.originalReading){
  content={mode:'original-en',englishGroups:groupsFromSpecs(specs.filter(spec=>spec.channel==='en'))};
 }else{
  content={
   mode:'bilingual',
   hebrewGroups:groupsFromSpecs(specs.filter(spec=>spec.channel==='he')),
   transliterationGroups:groupsFromSpecs(specs.filter(spec=>spec.channel==='tr')),
   ...(cue.contentRows?.length?{includeTranslation:true}:{}),
  };
 }
 content=parseContent(content);
 return {
  name:cue.name,title:cue.texts.textTitle,accentTitle:cue.texts.accentTextTitle,
  layout:cue.layout as Layout,templateCueId:cue.id,content,presentation:(cue as AuthoringCue).presentation??{},
 };
}

export function newDraftId(){return randomUUID()}
