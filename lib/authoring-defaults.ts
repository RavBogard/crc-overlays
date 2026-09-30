import {AuthoringError,LAYER_ORDER,type DraftContent,type EditableDraft,type Presentation,type TextArrangement,type TextLayer} from './authoring-model';
import {TEXT_SIZE_IDS,largePrintSizes,withTextSize,type TextSizePreset} from './template-looks';

/**
 * Creation-only default for a submitted canonical selection. Call it only when the raw request
 * did not explicitly name an arrangement: parsing normalizes `together` away. It never belongs on update, import,
 * duplicate, rollback, or read paths: omitted arrangement on an existing draft still means the
 * historical `together` rendering.
 */
export function withCreateDefaultBilingualBlocks(content:DraftContent):DraftContent{
 const base=content.mode==='local-variant'?content.base:content;
 if(base.mode!=='bilingual'||base.arrangement!==undefined)return content;
 const nextBase={...base,arrangement:'blocks' as const};
 return content.mode==='local-variant'?{...content,base:nextBase}:nextBase;
}

// T1 - a workspace's house defaults: how its new graphics look unless a call says otherwise.
// They apply when a graphic is made (create_draft, compose_custom_draft, create_source_draft_set)
// and when one is copied from the shared library (customize_shared_cue, _set, _batch). Nothing
// already stored changes when they change. With none stored every path behaves exactly as before.
export type FontSizes={hebrewFontSize?:number;transliterationFontSize?:number;translationFontSize?:number;titleFontSize?:number};
/** "More than two lower thirds becomes a left sequence": a lower-third set longer than maxLowerThirds is made on sequenceLayout instead. */
export type LayoutRule={maxLowerThirds:number;sequenceLayout:'left'|'right'};
export type AuthoringDefaults={
 textSize?:TextSizePreset;
 fontSizes?:FontSizes;
 lineSpacing?:'compact'|'spacious';
 latinLineBreaks?:'preserve'|'paragraphs'|'phrases';
 rowOrder?:TextLayer[];
 translation?:'include'|'omit';
 arrangement?:TextArrangement;
 layoutRule?:LayoutRule;
};
export type StoredAuthoringDefaults={version:number;defaults:AuthoringDefaults;updatedAt:number;updatedBy:string};
export const DEFAULT_FIELDS=['textSize','fontSizes','lineSpacing','latinLineBreaks','rowOrder','translation','arrangement','layoutRule'] as const;
type DefaultField=(typeof DEFAULT_FIELDS)[number];
/** Where the defaults take effect, as get_authoring_defaults reports it. */
export const DEFAULTS_APPLY_ON=['create_draft','compose_custom_draft','create_source_draft_set','customize_shared_cue','customize_shared_set','customize_shared_batch'] as const;

const FONT_LIMITS:Record<keyof FontSizes,[number,number]>={hebrewFontSize:[24,52],transliterationFontSize:[20,48],translationFontSize:[20,48],titleFontSize:[20,42]};
const invalid=(message:string)=>new AuthoringError('invalid_input',message);
const isRecord=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const oneOf=<T extends string>(value:unknown,allowed:readonly T[],field:string):T=>{if(typeof value!=='string'||!allowed.includes(value as T))throw invalid(`${field} must be ${allowed.join(', ')}`);return value as T};

function parseField(field:DefaultField,value:unknown):unknown{
 switch(field){
  case 'textSize':return oneOf(value,TEXT_SIZE_IDS,'textSize');
  case 'fontSizes':{
   if(!isRecord(value))throw invalid('fontSizes must be an object of hebrewFontSize, transliterationFontSize, translationFontSize and titleFontSize');
   const sizes:FontSizes={};
   for(const [key,size] of Object.entries(value)){
    const limits=FONT_LIMITS[key as keyof FontSizes];if(!limits)throw invalid(`fontSizes has no ${key}; use hebrewFontSize, transliterationFontSize, translationFontSize or titleFontSize`);
    if(!Number.isInteger(size)||(size as number)<limits[0]||(size as number)>limits[1])throw invalid(`fontSizes.${key} must be a whole number from ${limits[0]} to ${limits[1]}`);
    sizes[key as keyof FontSizes]=size as number;
   }
   if(!Object.keys(sizes).length)throw invalid('fontSizes names no size; pass null to clear it');
   return sizes;
  }
  case 'lineSpacing':return oneOf(value,['compact','spacious'] as const,'lineSpacing');
  case 'latinLineBreaks':return oneOf(value,['preserve','paragraphs','phrases'] as const,'latinLineBreaks');
  case 'rowOrder':{if(!Array.isArray(value)||value.length!==3||new Set(value).size!==3||!value.every(item=>item==='he'||item==='tr'||item==='en'))throw invalid('rowOrder must list he, tr and en exactly once each');return [...value]}
  case 'translation':return oneOf(value,['include','omit'] as const,'translation');
  case 'arrangement':return oneOf(value,['together','blocks'] as const,'arrangement');
  case 'layoutRule':{
   if(!isRecord(value))throw invalid('layoutRule must be {maxLowerThirds, sequenceLayout}');
   const extra=Object.keys(value).filter(key=>key!=='maxLowerThirds'&&key!=='sequenceLayout');if(extra.length)throw invalid(`layoutRule has unsupported fields: ${extra.join(', ')}`);
   if(!Number.isInteger(value.maxLowerThirds)||(value.maxLowerThirds as number)<1||(value.maxLowerThirds as number)>20)throw invalid('layoutRule.maxLowerThirds must be a whole number from 1 to 20');
   return {maxLowerThirds:value.maxLowerThirds as number,sequenceLayout:oneOf(value.sequenceLayout??'left',['left','right'] as const,'layoutRule.sequenceLayout')};
  }
 }
}

/** A patch of defaults: a field replaces the stored one, null clears it, absent leaves it. */
export function mergeDefaultsPatch(current:AuthoringDefaults,patch:Record<string,unknown>):{defaults:AuthoringDefaults;changed:DefaultField[]}{
 const unknown=Object.keys(patch).filter(key=>!(DEFAULT_FIELDS as readonly string[]).includes(key));if(unknown.length)throw invalid(`Unknown default: ${unknown.join(', ')}. The defaults are ${DEFAULT_FIELDS.join(', ')}.`);
 const next:Record<string,unknown>={...structuredClone(current)},changed:DefaultField[]=[];
 for(const field of DEFAULT_FIELDS){
  if(!Object.hasOwn(patch,field)||patch[field]===undefined)continue;
  const value=patch[field]===null?undefined:parseField(field,patch[field]);
  if(JSON.stringify(value)===JSON.stringify(next[field]))continue;
  if(value===undefined)delete next[field];else next[field]=value;
  changed.push(field);
 }
 return {defaults:next as AuthoringDefaults,changed};
}

/** Stored documents are re-validated on read, so a hand-edited row can never reach a draft. */
export function parseStoredDefaults(value:unknown):AuthoringDefaults{return isRecord(value)?mergeDefaultsPatch({},Object.fromEntries(Object.entries(value).filter(([key])=>(DEFAULT_FIELDS as readonly string[]).includes(key)))).defaults:{}}

const hasExplicitSize=(presentation:Record<string,unknown>)=>Object.keys(presentation).some(key=>key.endsWith('FontSize'));
function typography(presentation:Presentation,defaults:AuthoringDefaults):Presentation{
 let next={...presentation};
 if(defaults.textSize)next=withTextSize(next,defaults.textSize);
 if(defaults.fontSizes)next={...next,...defaults.fontSizes};
 if(defaults.textSize==='large')next=largePrintSizes(next);
 return next;
}
const layerLabel:Record<TextLayer,string>={he:'Hebrew',tr:'transliteration',en:'translation'};
export type DefaultsReport={applied:string[];skipped:string[]};

/**
 * The house defaults on the raw input of create_draft, before the strict parser. Whatever the call
 * names wins: a textSize or any explicit font size keeps the caller's typography, and a content
 * arrangement, rowOrder, includeTranslation or layers keeps the caller's choice. `withoutTranslation`
 * is the same input minus the translation default, for a source whose translation coverage is incomplete.
 */
export function withHouseCreateDefaults(data:Record<string,unknown>,defaults:AuthoringDefaults):{data:Record<string,unknown>;applied:string[];withoutTranslation:Record<string,unknown>|null}{
 const next=structuredClone(data),applied:string[]=[];
 const presentation=isRecord(next.presentation)?next.presentation:{};
 if((defaults.textSize||defaults.fontSizes)&&next.textSize===undefined&&!hasExplicitSize(presentation)){
  if(defaults.textSize){next.textSize=defaults.textSize;applied.push(`text size ${defaults.textSize}`)}
  if(defaults.fontSizes){Object.assign(presentation,defaults.fontSizes);applied.push('font sizes')}
  if(defaults.textSize==='large')Object.assign(presentation,largePrintSizes(presentation));
 }
 if(defaults.lineSpacing&&presentation.lineSpacing===undefined){presentation.lineSpacing=defaults.lineSpacing;applied.push(`line spacing ${defaults.lineSpacing}`)}
 if(defaults.latinLineBreaks&&presentation.latinLineBreaks===undefined){presentation.latinLineBreaks=defaults.latinLineBreaks;applied.push(`Latin line breaks ${defaults.latinLineBreaks}`)}
 if(Object.keys(presentation).length||next.presentation!==undefined)next.presentation=presentation;
 const content=isRecord(next.content)?next.content:null,base=content?.mode==='local-variant'&&isRecord(content.base)?content.base:content;
 let withoutTranslation:Record<string,unknown>|null=null;
 if(base?.mode==='bilingual'){
  if(defaults.arrangement&&!Object.hasOwn(base,'arrangement')){base.arrangement=defaults.arrangement;applied.push(`arrangement ${defaults.arrangement}`)}
  if(defaults.rowOrder&&!Object.hasOwn(base,'rowOrder')){base.rowOrder=[...defaults.rowOrder];applied.push(`row order ${defaults.rowOrder.join(', ')}`)}
  if(defaults.translation==='include'&&base.includeTranslation===undefined&&base.layers===undefined){
   withoutTranslation=structuredClone(next);base.includeTranslation=true;applied.push('translation included');
  }
 }
 return {data:next,applied,withoutTranslation};
}

/**
 * The house defaults on a whole editable graphic: a shared-library copy or a page of a source
 * set. Typography replaces the copied sizes (house defaults win over what was copied); content
 * defaults touch only a bilingual selection (or a variant's bilingual base). The result still has
 * to pass parseEditable; `translation:false` leaves the translation choice alone.
 */
export function withHouseDefaults(editable:EditableDraft,defaults:AuthoringDefaults,options:{translation:boolean}={translation:true}):{editable:EditableDraft;applied:string[]}{
 const applied:string[]=[];let presentation={...editable.presentation};
 if(defaults.textSize||defaults.fontSizes){const next=typography(presentation,defaults);if(JSON.stringify(next)!==JSON.stringify(presentation)){presentation=next;applied.push(defaults.textSize?`text size ${defaults.textSize}`:'font sizes')}}
 if(defaults.lineSpacing&&presentation.lineSpacing!==defaults.lineSpacing){presentation.lineSpacing=defaults.lineSpacing;applied.push(`line spacing ${defaults.lineSpacing}`)}
 if(defaults.latinLineBreaks&&(presentation.latinLineBreaks??'preserve')!==defaults.latinLineBreaks){presentation.latinLineBreaks=defaults.latinLineBreaks;applied.push(`Latin line breaks ${defaults.latinLineBreaks}`)}
 let content=structuredClone(editable.content);
 const base=content.mode==='local-variant'?content.base:content;
 if(base.mode==='bilingual'){
  if(defaults.arrangement&&(base.arrangement??'together')!==defaults.arrangement){if(defaults.arrangement==='blocks')base.arrangement='blocks';else delete base.arrangement;applied.push(`arrangement ${defaults.arrangement}`)}
  if(defaults.rowOrder){const current=base.rowOrder??[...LAYER_ORDER];if(JSON.stringify(current)!==JSON.stringify(defaults.rowOrder)){if(JSON.stringify(defaults.rowOrder)===JSON.stringify(LAYER_ORDER))delete base.rowOrder;else base.rowOrder=[...defaults.rowOrder];applied.push(`row order ${defaults.rowOrder.map(layer=>layerLabel[layer]).join(', ')}`)}}
  if(options.translation&&defaults.translation){
   const layers=base.layers?.length?[...base.layers]:base.includeTranslation?['he','tr','en'] as TextLayer[]:['he','tr'] as TextLayer[];
   const wanted=defaults.translation==='include'?[...new Set([...layers,'en' as const])]:layers.filter(layer=>layer!=='en');
   if(wanted.length&&wanted.length!==layers.length){
    const ordered=LAYER_ORDER.filter(layer=>wanted.includes(layer)),implicit=ordered.includes('en')?['he','tr','en']:['he','tr'];
    if(ordered.includes('en'))base.includeTranslation=true;else delete base.includeTranslation;
    if(JSON.stringify(ordered)===JSON.stringify(implicit))delete base.layers;else base.layers=ordered;
    applied.push(defaults.translation==='include'?'translation included':'translation left out');
   }
  }
  content=content.mode==='local-variant'?{...content,base}:base;
 }
 return {editable:{...editable,presentation,content},applied};
}

/** The layout rule on a lower-third source set: which layout the set is made on instead, if any. */
export function sequenceLayoutFor(layout:string,pages:number,defaults:AuthoringDefaults|null):'left'|'right'|null{
 const rule=defaults?.layoutRule;return rule&&layout==='bottom'&&pages>rule.maxLowerThirds?rule.sequenceLayout:null;
}
