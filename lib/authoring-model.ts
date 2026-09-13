import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import type {Cue} from './player';
import {loadSourceLibrary} from './source-library.ts';

const require=createRequire(import.meta.url);
const sourceMapJson=require('../content/legacy-crc-shabbat-morning.sources.json');
const baselineCueJson=require('./cues.json');

export type Layout='bottom'|'left'|'right';
export type Presentation={hebrewFontSize?:number;transliterationFontSize?:number;titleFontSize?:number};
export type SourceGroup={sourceId:string;blockIds:string[]};
export type BilingualContent={mode:'bilingual';hebrewGroups:SourceGroup[];transliterationGroups:SourceGroup[];includeTranslation?:boolean};
export type OriginalEnglishContent={mode:'original-en';englishGroups:SourceGroup[]};
export type SourceEnglishContent={mode:'source-en';englishGroups:SourceGroup[]};
export type CustomContent={mode:'custom';text:string};
export type DraftContent=BilingualContent|OriginalEnglishContent|SourceEnglishContent|CustomContent;
export type EditableDraft={name:string;title:string;accentTitle?:string;layout:Layout;templateCueId:string;content:DraftContent;presentation:Presentation};
export type SourceAuthorityPin={id:string;feedSha256:string;unitSha256:string;sourceSha256:string};
export type SourcePin={feedSha256:string;unitSha256:Record<string,string>;blockSha256:Record<string,string>;sourceAuthority?:Record<string,SourceAuthorityPin>};
export type EnglishRole='translation'|'interpretation'|'translation-interpretation'|'kavannah'|'reading'|'rubric'|'note'|'unclassified';
export type SourceBlock={id:string;index:number;kind:'bilingual'|'original-en'|'source-en'|'translation-en';pairedBlockIds?:string[];parallelBlockIds?:string[];he?:string;tr?:string;en?:string;role?:'original';englishRole?:EnglishRole;automatic?:boolean;noteLike?:boolean;sourceLabel?:string;sourceBlockSha256:string};
export type AuthoringSource={id:string;name:string;section:string|number|null;unitSha256:string;blocks:SourceBlock[];origin?:string;sourceSha256?:string;book?:string;service?:string;aliases?:string[];openingWords?:string[];metadata?:Record<string,unknown>;authority?:{id:string;repository:string;repositoryCommit:string;feed:string;feedSha256:string;unitId:string;unitSha256:string}};
export type SharedCueCopySpec=EditableDraft&{sourcePin:SourcePin;sourceSnapshots?:AuthoringSource[]};
export type SharedCueOrigin={workspaceId:'crc';cueId:string;cueHash:string};
export type Draft=EditableDraft&{id:string;version:number;sourcePin:SourcePin;activeRevision:number|null;activeDraftVersion:number|null;createdAt:number;updatedAt:number;createdBy:string;updatedBy:string;draftSetId?:string;setIndex?:number;setCount?:number;sourceSnapshots?:AuthoringSource[];sharedFrom?:SharedCueOrigin};
export type AuthoringCue=Cue&{presentation?:Presentation;authoring:{draftId:string;draftVersion:number;origin:'canonical'|'local';sourceIds:string[];feedSha256:string;unitSha256:Record<string,string>;sourceAuthority?:Record<string,SourceAuthorityPin>;copySpec?:SharedCueCopySpec}};
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
 if(input.mode==='custom'){
  onlyKeys(input,['mode','text'],'content');
  return {mode:'custom',text:text(input.text,'content.text',4000)!};
 }
 throw new AuthoringError('invalid_input','content.mode must be bilingual, original-en, source-en, or custom');
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
  onlyKeys(p,['hebrewFontSize','transliterationFontSize','titleFontSize'],'presentation');
  const presentation:Presentation={};
  if(p.hebrewFontSize!==undefined)presentation.hebrewFontSize=integer(p.hebrewFontSize,'hebrewFontSize',24,52);
  if(p.transliterationFontSize!==undefined)presentation.transliterationFontSize=integer(p.transliterationFontSize,'transliterationFontSize',20,48);
  if(p.titleFontSize!==undefined)presentation.titleFontSize=integer(p.titleFontSize,'titleFontSize',20,42);
  result.presentation=presentation;
 }
 if(!partial){
  const template=baselineCues.find(cue=>cue.id===result.templateCueId)!;
  if(template.layout!==result.layout)throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
 }
 return result;
}

function renderGroup(group:SourceGroup,channel:'he'|'tr'|'en',snapshots:AuthoringSource[]=[]){
 const selected=source(group.sourceId,snapshots);
 return group.blockIds.map(id=>{
  const value=selected.blocks.find(block=>block.id===id)?.[channel];
  if(typeof value!=='string'||!value)throw new AuthoringError('missing_source_channel',`Source block ${id} lacks ${channel}`);
  return value;
 }).join(' ');
}

export function buildCue(draft:Draft):AuthoringCue{
 assertSourcePin(draft);
 const template=baselineCues.find(cue=>cue.id===draft.templateCueId);
 if(!template)throw new AuthoringError('unknown_template','Draft template is unavailable',409);
 if(template.layout!==draft.layout)throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
 if(draft.content.mode==='bilingual'&&draft.content.includeTranslation&&draft.layout==='bottom')throw new AuthoringError('translation_layout','Use a left or right panel for translated blessing rows');
 const texts:Record<string,string>={textTitle:draft.title};
 if(draft.accentTitle)texts.accentTextTitle=draft.accentTitle;
 const groups=draft.content.mode==='bilingual'
  ?[...draft.content.hebrewGroups,...draft.content.transliterationGroups]
  :draft.content.mode==='original-en'||draft.content.mode==='source-en'?draft.content.englishGroups:[];
 if(draft.content.mode==='bilingual'){
  texts.textMainheb=draft.content.hebrewGroups.map(group=>renderGroup(group,'he',draft.sourceSnapshots)).join('\n');
  texts.textMainEng=draft.content.transliterationGroups.map(group=>renderGroup(group,'tr',draft.sourceSnapshots)).join('\n');
 }else if(draft.content.mode==='original-en'||draft.content.mode==='source-en')texts.textMain=draft.content.englishGroups.map(group=>renderGroup(group,'en',draft.sourceSnapshots)).join('\n');
 else texts.textMain=draft.content.text;
 const sourceIds=[...new Set(groups.map(group=>group.sourceId))].sort();
 const animations=structuredClone(template.animations);
 if(draft.content.mode==='bilingual'&&!animations.some(track=>track.element==='textMainheb'||track.element==='textMainEng')){
  const combined=animations.filter(track=>track.element==='textMain');
  if(combined.length){
   for(let index=animations.length-1;index>=0;index--)if(animations[index].element==='textMain')animations.splice(index,1);
   animations.push(...combined.flatMap(track=>[{...structuredClone(track),element:'textMainheb'},{...structuredClone(track),element:'textMainEng'}]));
  }
 }else if(draft.content.mode!=='bilingual'&&!animations.some(track=>track.element==='textMain')){
  const single=animations.filter(track=>track.element==='textMainEng');
  const fallback=single.length?single:animations.filter(track=>track.element==='textMainheb');
  if(fallback.length){
   for(let index=animations.length-1;index>=0;index--)if(animations[index].element==='textMainheb'||animations[index].element==='textMainEng')animations.splice(index,1);
   animations.push(...fallback.map(track=>({...structuredClone(track),element:'textMain'})));
  }
 }
 return {
  id:draft.id,name:draft.name,layout:draft.layout,texts,
  ...(draft.content.mode==='bilingual'&&draft.content.includeTranslation
   ?{contentRows:translationSelections(draft.content,draft.sourceSnapshots).map(({sourceId,block,pairIds})=>({he:renderGroup({sourceId,blockIds:pairIds},'he',draft.sourceSnapshots),tr:renderGroup({sourceId,blockIds:pairIds},'tr',draft.sourceSnapshots),en:block.en!}))}
   :draft.content.mode==='bilingual'&&draft.draftSetId&&(draft.layout==='left'||draft.layout==='right')
    ?{contentRows:draft.content.hebrewGroups.flatMap(group=>group.blockIds.map(blockId=>({he:renderGroup({sourceId:group.sourceId,blockIds:[blockId]},'he',draft.sourceSnapshots),tr:renderGroup({sourceId:group.sourceId,blockIds:[blockId]},'tr',draft.sourceSnapshots),en:''})))}
    :{}),
  animations,duration:structuredClone(template.duration),
  ...(template.template?{template:structuredClone(template.template)}:{}),
  ...(Object.keys(draft.presentation).length?{presentation:structuredClone(draft.presentation)}:{}),
  authoring:{
   draftId:draft.id,draftVersion:draft.version,origin:draft.content.mode==='custom'?'local':'canonical',sourceIds,feedSha256:draft.content.mode==='custom'?'local':draft.sourcePin.feedSha256,
   unitSha256:Object.fromEntries(sourceIds.map(id=>[id,source(id,draft.sourceSnapshots).unitSha256])),
   ...(draft.sourcePin.sourceAuthority?{sourceAuthority:structuredClone(draft.sourcePin.sourceAuthority)}:{}),
   copySpec:{...structuredClone(editableOnly(draft)),sourcePin:structuredClone(draft.sourcePin),...(sourceIds.length?{sourceSnapshots:sourceIds.map(id=>structuredClone(source(id,draft.sourceSnapshots)))}:{})},
  },
 };
}

function editableOnly(draft:Draft):EditableDraft{return {name:draft.name,title:draft.title,accentTitle:draft.accentTitle,layout:draft.layout,templateCueId:draft.templateCueId,content:structuredClone(draft.content),presentation:structuredClone(draft.presentation)}}
function selectedPairs(content:DraftContent,snapshots:AuthoringSource[]=[]){
 if(content.mode==='custom')return [];
 const groups=content.mode==='bilingual'?content.hebrewGroups:content.englishGroups;
 const pairs=groups.flatMap(group=>group.blockIds.map(blockId=>({sourceId:group.sourceId,blockId})));
 if(content.mode==='bilingual'&&content.includeTranslation)pairs.push(...translationSelections(content,snapshots).map(({sourceId,block})=>({sourceId,blockId:block.id})));
 return pairs;
}
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
export function assertSourcePin(draft:Draft){
 const current=sourcePinFor(draft.content,draft.sourceSnapshots,draft.sourceSnapshots?.length?draft.sourcePin.feedSha256:undefined);
 if(JSON.stringify(current)!==JSON.stringify(draft.sourcePin))throw new AuthoringError('source_pin_mismatch','Pinned source authority has changed; explicit source rebase and review are required',409);
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
