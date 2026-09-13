import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import type {Cue} from './player';
import {loadSourceLibrary} from './source-library.ts';

const require=createRequire(import.meta.url);
const sourceMapJson=require('../content/legacy-crc-shabbat-morning.sources.json');
const baselineCueJson=require('./cues.json');

export type Layout='bottom'|'left'|'right';
export type Presentation={hebrewFontSize?:number;transliterationFontSize?:number;titleFontSize?:number;alignment?:'start'|'center';lineSpacing?:'compact'|'spacious';imageAssetId?:string};
export type SourceGroup={sourceId:string;blockIds:string[]};
export type BilingualContent={mode:'bilingual';hebrewGroups:SourceGroup[];transliterationGroups:SourceGroup[];includeTranslation?:boolean};
export type OriginalEnglishContent={mode:'original-en';englishGroups:SourceGroup[]};
export type SourceEnglishContent={mode:'source-en';englishGroups:SourceGroup[]};
export type CanonicalContent=BilingualContent|OriginalEnglishContent|SourceEnglishContent;
export type VariantChannel='he'|'tr'|'en';
export type LocalVariantOverride={sourceId:string;blockId:string;channel:VariantChannel;sourceText:string;localText:string};
export type LocalVariantContent={mode:'local-variant';label:string;reason?:string;base:CanonicalContent;overrides:LocalVariantOverride[]};
export type CustomContent={mode:'custom';text:string};
export type DraftContent=CanonicalContent|LocalVariantContent|CustomContent;
export type EditableDraft={name:string;title:string;accentTitle?:string;layout:Layout;templateCueId:string;content:DraftContent;presentation:Presentation};
export type SourceAuthorityPin={id:string;feedSha256:string;unitSha256:string;sourceSha256:string};
export type SourcePin={feedSha256:string;unitSha256:Record<string,string>;blockSha256:Record<string,string>;sourceAuthority?:Record<string,SourceAuthorityPin>};
export type EnglishRole='translation'|'interpretation'|'translation-interpretation'|'kavannah'|'reading'|'rubric'|'note'|'unclassified';
export type SourceBlock={id:string;index:number;kind:'bilingual'|'original-en'|'source-en'|'translation-en';pairedBlockIds?:string[];parallelBlockIds?:string[];he?:string;tr?:string;en?:string;role?:'original';englishRole?:EnglishRole;automatic?:boolean;noteLike?:boolean;sourceLabel?:string;sourceBlockSha256:string};
export type AuthoringSource={id:string;name:string;section:string|number|null;unitSha256:string;blocks:SourceBlock[];origin?:string;sourceSha256?:string;book?:string;service?:string;aliases?:string[];openingWords?:string[];metadata?:Record<string,unknown>;authority?:{id:string;repository:string;repositoryCommit:string;feed:string;feedSha256:string;unitId:string;unitSha256:string}};
export type SharedCueCopySpec=EditableDraft&{sourcePin:SourcePin;sourceSnapshots?:AuthoringSource[]};
export type SharedCueOrigin={workspaceId:'crc';cueId:string;cueHash:string};
export type DraftSetSelection={sourceId:string;blockId:string;channels:VariantChannel[]};
export type DraftSetManifest={version:1;selections:DraftSetSelection[]};
export type Draft=EditableDraft&{id:string;version:number;sourcePin:SourcePin;activeRevision:number|null;activeDraftVersion:number|null;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string;draftSetId?:string;setIndex?:number;setCount?:number;draftSetManifest?:DraftSetManifest;sourceSnapshots?:AuthoringSource[];sharedFrom?:SharedCueOrigin;archivedAt?:number;archivedBy?:string};
export type AuthoringCue=Cue&{presentation?:Presentation;authoring:{draftId:string;draftVersion:number;origin:'canonical'|'variant'|'local';sourceIds:string[];feedSha256:string;unitSha256:Record<string,string>;sourceAuthority?:Record<string,SourceAuthorityPin>;copySpec?:SharedCueCopySpec}};
export type SourcePack={schemaVersion:number;authority:{repository:string;repositoryCommit:string;feed:string;feedSha256:string;license:unknown;printing:unknown};sources:AuthoringSource[];authorities?:unknown[];library?:unknown};

export const sourcePack=loadSourceLibrary();
export const baselineCues=baselineCueJson as AuthoringCue[];

export class AuthoringError extends Error{
 code:string;status:number;
 constructor(code:string,message:string,status=400){super(message);this.code=code;this.status=status}
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
function integer(value:unknown,label:string,min:number,max:number){
 if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw new AuthoringError('invalid_input',`${label} must be an integer from ${min} to ${max}`);
 return value as number;
}
function source(id:string,snapshots:AuthoringSource[]=[]){
 const found=snapshots.find(item=>item.id===id)??sourcePack.sources.find(item=>item.id===id);
 if(!found)throw new AuthoringError('unknown_source',`Unknown authoring source: ${id}`,404);
 return found;
}
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
   const matches=kind==='source-en'?(block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en))):block.kind===kind;
   if(!matches)throw new AuthoringError('invalid_channel',`Block ${blockId} is not ${kind}`);
  }
  return {sourceId,blockIds};
 });
}

export function parseContent(value:unknown,snapshots:AuthoringSource[]=[]):DraftContent{
 const input=record(value,'content');
 if(input.mode==='bilingual'){
  onlyKeys(input,['mode','hebrewGroups','transliterationGroups','includeTranslation'],'content');
  const hebrewGroups=parseGroups(input.hebrewGroups,'content.hebrewGroups','bilingual',snapshots);
  const transliterationGroups=parseGroups(input.transliterationGroups,'content.transliterationGroups','bilingual',snapshots);
  const sequence=(groups:SourceGroup[])=>groups.flatMap(group=>group.blockIds.map(blockId=>`${group.sourceId}\u0000${blockId}`));
  const hebrewSequence=sequence(hebrewGroups);
  const transliterationSequence=sequence(transliterationGroups);
  if(new Set(hebrewSequence).size!==hebrewSequence.length||new Set(transliterationSequence).size!==transliterationSequence.length)throw new AuthoringError('repeated_source_block','A source block may be selected only once per language');
  if(JSON.stringify(hebrewSequence)!==JSON.stringify(transliterationSequence))throw new AuthoringError('mismatched_source_coverage','Hebrew and transliteration must select the same ordered source blocks');
  if(input.includeTranslation!==undefined&&typeof input.includeTranslation!=='boolean')throw new AuthoringError('invalid_input','includeTranslation must be boolean');
  const content:BilingualContent={mode:'bilingual',hebrewGroups,transliterationGroups,...(input.includeTranslation?{includeTranslation:true}:{})};
  if(content.includeTranslation)translationSelections(content,snapshots);
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
  const overrides=input.overrides.map((raw,index)=>{const item=record(raw,`content.overrides[${index}]`);onlyKeys(item,['sourceId','blockId','channel','sourceText','localText'],`content.overrides[${index}]`);const sourceId=text(item.sourceId,`content.overrides[${index}].sourceId`,160)!,blockId=text(item.blockId,`content.overrides[${index}].blockId`,220)!,channel=String(item.channel) as VariantChannel;if(!['he','tr','en'].includes(channel))throw new AuthoringError('invalid_input',`content.overrides[${index}].channel must be he, tr, or en`);if(!selected.has(JSON.stringify([sourceId,blockId])))throw new AuthoringError('invalid_variant_target','A local deviation must target a selected canonical source block');const key=JSON.stringify([sourceId,blockId,channel]);if(seen.has(key))throw new AuthoringError('repeated_variant_override','A source channel may be overridden only once');seen.add(key);const canonical=source(sourceId,snapshots).blocks.find(block=>block.id===blockId)?.[channel];if(typeof canonical!=='string'||!canonical)throw new AuthoringError('missing_source_channel',`Source block ${blockId} lacks ${channel}`);const sourceText=text(item.sourceText,`content.overrides[${index}].sourceText`,4000)!,localText=text(item.localText,`content.overrides[${index}].localText`,4000)!;if(sourceText!==canonical)throw new AuthoringError('variant_source_changed','The recorded source text no longer matches its pinned source');return {sourceId,blockId,channel,sourceText,localText}});
  return {mode:'local-variant',label:text(input.label,'content.label',80)!,reason:text(input.reason,'content.reason',500,true),base,overrides};
 }
 if(input.mode==='custom'){
  onlyKeys(input,['mode','text'],'content');
  return {mode:'custom',text:text(input.text,'content.text',4000)!};
 }
 throw new AuthoringError('invalid_input','content.mode must be bilingual, original-en, source-en, local-variant, or custom');
}

// Only whole, explicitly paired canonical blessings can gain a translation.
function translationSelections(content:BilingualContent,snapshots:AuthoringSource[]=[]){
 const pairs=content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId})));
 const result:Array<{sourceId:string;block:SourceBlock;pairIds:string[]}>=[];
 for(let offset=0;offset<pairs.length;){
  const first=pairs[offset];
  const matches=source(first.sourceId,snapshots).blocks.filter(block=>block.kind==='translation-en'&&block.pairedBlockIds?.[0]===first.blockId);
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
  if(!['bottom','left','right'].includes(String(input.layout)))throw new AuthoringError('invalid_input','layout must be bottom, left, or right');
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
  onlyKeys(p,['hebrewFontSize','transliterationFontSize','titleFontSize','alignment','lineSpacing','imageAssetId'],'presentation');
  const presentation:Presentation={};
  if(p.hebrewFontSize!==undefined)presentation.hebrewFontSize=integer(p.hebrewFontSize,'hebrewFontSize',24,52);
  if(p.transliterationFontSize!==undefined)presentation.transliterationFontSize=integer(p.transliterationFontSize,'transliterationFontSize',20,48);
  if(p.titleFontSize!==undefined)presentation.titleFontSize=integer(p.titleFontSize,'titleFontSize',20,42);
  if(p.alignment!==undefined){if(p.alignment!=='start'&&p.alignment!=='center')throw new AuthoringError('invalid_input','alignment must be start or center');presentation.alignment=p.alignment}
  if(p.lineSpacing!==undefined){if(p.lineSpacing!=='compact'&&p.lineSpacing!=='spacious')throw new AuthoringError('invalid_input','lineSpacing must be compact or spacious');presentation.lineSpacing=p.lineSpacing}
  if(p.imageAssetId!==undefined){if(typeof p.imageAssetId!=='string'||!/^asset_[a-f0-9]{64}$/.test(p.imageAssetId))throw new AuthoringError('invalid_input','imageAssetId must identify a workspace asset');presentation.imageAssetId=p.imageAssetId}
  result.presentation=presentation;
 }
 if(!partial){
  const template=baselineCues.find(cue=>cue.id===result.templateCueId)!;
  if(template.layout!==result.layout)throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
 }
 return result;
}

function renderGroup(group:SourceGroup,channel:'he'|'tr'|'en',snapshots:AuthoringSource[]=[],overrides:LocalVariantOverride[]=[]){
 const selected=source(group.sourceId,snapshots);
 return group.blockIds.map(id=>{
  const value=overrides.find(item=>item.sourceId===group.sourceId&&item.blockId===id&&item.channel===channel)?.localText??selected.blocks.find(block=>block.id===id)?.[channel];
  if(typeof value!=='string'||!value)throw new AuthoringError('missing_source_channel',`Source block ${id} lacks ${channel}`);
  return value;
 }).join(' ');
}

export function buildCue(draft:Draft):AuthoringCue{
 assertSourcePin(draft);
 const template=baselineCues.find(cue=>cue.id===draft.templateCueId);
 if(!template)throw new AuthoringError('unknown_template','Draft template is unavailable',409);
 if(template.layout!==draft.layout)throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
 const content=draft.content.mode==='local-variant'?draft.content.base:draft.content;const overrides=draft.content.mode==='local-variant'?draft.content.overrides:[];
 if(content.mode==='bilingual'&&content.includeTranslation&&draft.layout==='bottom')throw new AuthoringError('translation_layout','Use a left or right panel for translated blessing rows');
 const texts:Record<string,string>={textTitle:draft.title};
 if(draft.accentTitle)texts.accentTextTitle=draft.accentTitle;
 const groups=content.mode==='bilingual'?[...content.hebrewGroups,...content.transliterationGroups]:content.mode==='original-en'||content.mode==='source-en'?content.englishGroups:[];
 if(content.mode==='bilingual'){
  texts.textMainheb=content.hebrewGroups.map(group=>renderGroup(group,'he',draft.sourceSnapshots,overrides)).join('\n');
  texts.textMainEng=content.transliterationGroups.map(group=>renderGroup(group,'tr',draft.sourceSnapshots,overrides)).join('\n');
 }else if(content.mode==='original-en'||content.mode==='source-en')texts.textMain=content.englishGroups.map(group=>renderGroup(group,'en',draft.sourceSnapshots,overrides)).join('\n');
 else texts.textMain=content.text;
 const sourceIds=[...new Set(groups.map(group=>group.sourceId))].sort();
 const animations=structuredClone(template.animations);
 if(content.mode==='bilingual'&&!animations.some(track=>track.element==='textMainheb'||track.element==='textMainEng')){
  const combined=animations.filter(track=>track.element==='textMain');
  if(combined.length){
   for(let index=animations.length-1;index>=0;index--)if(animations[index].element==='textMain')animations.splice(index,1);
   animations.push(...combined.flatMap(track=>[{...structuredClone(track),element:'textMainheb'},{...structuredClone(track),element:'textMainEng'}]));
  }
 }else if(content.mode!=='bilingual'&&!animations.some(track=>track.element==='textMain')){
  const single=animations.filter(track=>track.element==='textMainEng');
  const fallback=single.length?single:animations.filter(track=>track.element==='textMainheb');
  if(fallback.length){
   for(let index=animations.length-1;index>=0;index--)if(animations[index].element==='textMainheb'||animations[index].element==='textMainEng')animations.splice(index,1);
   animations.push(...fallback.map(track=>({...structuredClone(track),element:'textMain'})));
  }
 }
 return {
  id:draft.id,name:draft.name,layout:draft.layout,texts,
  ...(content.mode==='bilingual'&&content.includeTranslation
   ?{contentRows:translationSelections(content,draft.sourceSnapshots).map(({sourceId,block,pairIds})=>({he:renderGroup({sourceId,blockIds:pairIds},'he',draft.sourceSnapshots,overrides),tr:renderGroup({sourceId,blockIds:pairIds},'tr',draft.sourceSnapshots,overrides),en:overrides.find(item=>item.sourceId===sourceId&&item.blockId===block.id&&item.channel==='en')?.localText??block.en!}))}
   :content.mode==='bilingual'&&draft.draftSetId&&(draft.layout==='left'||draft.layout==='right')
    ?{contentRows:content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({he:renderGroup({sourceId:group.sourceId,blockIds:[blockId]},'he',draft.sourceSnapshots,overrides),tr:renderGroup({sourceId:group.sourceId,blockIds:[blockId]},'tr',draft.sourceSnapshots,overrides),en:''})))}
    :{}),
  animations,duration:structuredClone(template.duration),
  ...(template.template?{template:structuredClone(template.template)}:{}),
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
export function draftSetSelections(content:DraftContent,snapshots:AuthoringSource[]=[]):DraftSetSelection[]{if(content.mode==='local-variant')return draftSetSelections(content.base,snapshots);if(content.mode==='custom')return [];if(content.mode==='bilingual'){const base=content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId,channels:['he','tr'] as VariantChannel[]})));if(!content.includeTranslation)return base;const baseKeys=new Set(base.map(item=>JSON.stringify([item.sourceId,item.blockId])));return [...base,...selectedPairs(content,snapshots).filter(item=>!baseKeys.has(JSON.stringify([item.sourceId,item.blockId]))).map(item=>({...item,channels:['en'] as VariantChannel[]}))]}return content.englishGroups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId,channels:['en'] as VariantChannel[]})))}
export function sourceSnapshotsFor(content:DraftContent,snapshots:AuthoringSource[]=[]){return [...new Set(selectedPairs(content,snapshots).map(pair=>pair.sourceId))].sort().map(id=>structuredClone(source(id,snapshots)))}
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
   const block=source(sourceId,snapshots).blocks.find(item=>item.id===blockId)!;
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

export function cueHash(cue:AuthoringCue){return createHash('sha256').update(JSON.stringify(cue)).digest('hex')}
export function previewValidation(cue:AuthoringCue){
 const errors:string[]=[];
 if(cue.texts.textMainheb&&!cue.texts.textMainEng)errors.push('Hebrew requires matching transliteration');
 if(cue.texts.textMainEng&&!cue.texts.textMainheb)errors.push('Transliteration requires matching Hebrew');
 return {valid:errors.length===0,errors,warnings:[],requiresBrowserReview:true};
}

type SourceSpec={unit?:string;channel?:string;blocks?:number[]};
function groupsFromSpecs(specs:SourceSpec[]){return specs.map(spec=>({sourceId:spec.unit!,blockIds:(spec.blocks??[]).map(index=>`${spec.unit}#block-${index}`)}))}

export function editableFromBaseline(cueId:string):EditableDraft{
 const cue=baselineCues.find(item=>item.id===cueId);
 const mapping=(sourceMapJson.cues as Array<Record<string,unknown>>).find(item=>item.id===cueId) as Record<string,unknown>|undefined;
 if(!cue||!mapping)throw new AuthoringError('unknown_cue','Unknown baseline cue',404);
 if(mapping.nonLiturgical)throw new AuthoringError('unmanaged_content','Non-liturgical archive copy cannot be imported into source authoring',409);
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
