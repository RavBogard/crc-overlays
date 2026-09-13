import {randomUUID} from 'node:crypto';
import type {Cue} from './player';
import {AuthoringError,assertSourcePin,baselineCues,buildCue,cueHash,editableFromBaseline,newDraftId,parseEditable,previewValidation,sourcePack,sourcePinFor,type AuthoringCue,type Draft,type DraftContent,type EditableDraft,type Layout,type SourceBlock} from './authoring-model';
import {sharedLibraryClient,type SharedLibrarySnapshot} from './shared-library';

export type BrowserMeasurement={viewportWidth:number;viewportHeight:number;fontsReady:true;overflow:false;rendererVersion:string;measuredAt:number};
export type ReviewReceipt={humanApproved:true;browserMeasurement:BrowserMeasurement;reviewedAt:number;reviewedBy:string};
export type PreviewRecord={id:string;draftId:string;draftVersion:number;cueHash:string;cue:AuthoringCue;validation:ReturnType<typeof previewValidation>;review:ReviewReceipt|null;createdAt:number;createdBy:string};
export type Revision={draftId:string;revision:number;draftVersion:number;cueHash:string;cue:AuthoringCue;previewId:string|null;review:ReviewReceipt|null;actor:string;createdAt:number};

export interface AuthoringRepository{
 listDrafts():Promise<Draft[]>; getDraft(id:string):Promise<Draft|null>; insertDraft(draft:Draft):Promise<Draft>; insertDraftSet(drafts:Draft[]):Promise<Draft[]>; insertImportedDraft(draft:Draft,cue:AuthoringCue,actor:string):Promise<Draft>;
 updateDraft(id:string,expectedVersion:number,editable:EditableDraft,actor:string):Promise<Draft|null>;
 insertPreview(preview:PreviewRecord):Promise<void>; getPreview(id:string):Promise<PreviewRecord|null>; saveReview(id:string,review:ReviewReceipt):Promise<void>;
 publish(id:string,expectedVersion:number,previewId:string,actor:string):Promise<Revision>;
 revisions(id:string):Promise<Revision[]>; rollback(id:string,expectedVersion:number,revision:number,actor:string):Promise<{draft:Draft;revision:Revision}>;
 published():Promise<AuthoringCue[]>;
}

const object=(value:unknown,label='input')=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new AuthoringError('invalid_input',`${label} must be an object`);return value as Record<string,unknown>};
const keys=(value:Record<string,unknown>,allowed:string[],label='input')=>{const extra=Object.keys(value).filter(k=>!allowed.includes(k));if(extra.length)throw new AuthoringError('invalid_input',`${label} contains unsupported fields: ${extra.join(', ')}`)};
const string=(value:unknown,label:string,max=160)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new AuthoringError('invalid_input',`${label} must be 1-${max} characters`);return value.trim()};
const integer=(value:unknown,label:string,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isInteger(value)||(value as number)<min||(value as number)>max)throw new AuthoringError('invalid_input',`${label} must be an integer`);return value as number};
const optionalString=(value:unknown,label:string,max=160)=>value===undefined||value===''?undefined:string(value,label,max);
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
const searchRank=(source:SearchSource,query:string)=>{if(!query)return 0;const name=normalized(source.name),opening=normalized((source.openingWords??[]).join(' ')),body=normalized(source.blocks.flatMap(block=>[block.he,block.tr,block.en]).join(' ')),metadata=normalized([source.id,source.section,...(source.aliases??[]),sourceBook(source).value,sourceBook(source).label,source.service].join(' '));if(name===query)return 0;if(name.startsWith(query))return 1;if(name.includes(query))return 2;if(opening.includes(query))return 3;if(body.includes(query))return 4;if(metadata.includes(query))return 5;return null};
const PANEL_BLOCK_LIMIT=3;
const PANEL_CHAR_BUDGET=600;

function blockCharacters(block:SourceBlock,mode:'bilingual'|'original-en'|'source-en'){
 return mode==='bilingual'?(block.he?.length??0)+(block.tr?.length??0):(block.en?.length??0);
}
function sourceSetSegments(source:SearchSource,mode:'bilingual'|'original-en'|'source-en',includeTranslation:boolean){
 const blocks=source.blocks.filter(block=>mode==='source-en'?(block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en)))&&block.automatic!==false:block.kind===(mode==='bilingual'?'bilingual':'original-en'));
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
 if(layout==='bottom')return segments.flatMap(segment=>segment.map(block=>[block]));
 const pages:SourceBlock[][]=[];let page:SourceBlock[]=[];let characters=0;
 for(const segment of segments){
  const translationCharacters=includeTranslation?(source.blocks.find(block=>block.kind==='translation-en'&&block.pairedBlockIds?.[0]===segment[0].id)?.en?.length??0):0;
  const nextCharacters=segment.reduce((sum,block)=>sum+blockCharacters(block,mode),translationCharacters);
  if(page.length&&(page.length+segment.length>PANEL_BLOCK_LIMIT||characters+nextCharacters>PANEL_CHAR_BUDGET)){pages.push(page);page=[];characters=0}
  page.push(...segment);characters+=nextCharacters;
 }
 if(page.length)pages.push(page);
 return pages;
}

export type AuthoringWorkspace={rehearsal:boolean;storage:'memory'|'postgres';label:string|null};
type SharedLibraryReader={get(force?:boolean):Promise<SharedLibrarySnapshot>};
export function createAuthoringService(repo:AuthoringRepository,workspace:AuthoringWorkspace={rehearsal:false,storage:'postgres',label:null},shared:SharedLibraryReader=sharedLibraryClient){
 const operation=async(operation:string,input:unknown,actor:string):Promise<unknown>=>{
  const who=string(actor,'actor',80); const data=object(input);
  if(operation==='get_workspace'){keys(data,[]);return {workspace};}
  if(operation==='list_shared_library'){
   keys(data,['query','limit','refresh']);const query=normalized(optionalString(data.query,'query',100));const limit=data.limit===undefined?1000:integer(data.limit,'limit',1,1000);if(data.refresh!==undefined&&typeof data.refresh!=='boolean')throw new AuthoringError('invalid_input','refresh must be boolean');const snapshot=await shared.get(data.refresh===true);
   if(!snapshot.available)return snapshot;const matches=snapshot.payload.cues.filter(entry=>!query||normalized([entry.name,entry.title].join(' ')).includes(query));const cues=matches.slice(0,limit).map(({id,name,title,layout,sourceIds,cueHash})=>({id,name,title,layout,sourceIds,cueHash}));return {available:true,configured:true,stale:snapshot.stale,refreshedAt:snapshot.refreshedAt,total:matches.length,truncated:cues.length<matches.length,cues};
  }
  if(operation==='preview_shared_cue'){
   keys(data,['cueId','refresh']);const cueId=string(data.cueId,'cueId',160);if(data.refresh!==undefined&&typeof data.refresh!=='boolean')throw new AuthoringError('invalid_input','refresh must be boolean');const snapshot=await shared.get(data.refresh===true);if(!snapshot.available)return snapshot;const entry=snapshot.payload.cues.find(item=>item.id===cueId);if(!entry)throw new AuthoringError('unknown_shared_cue','This CRC library item is no longer available',404);return {available:true,configured:true,stale:snapshot.stale,refreshedAt:snapshot.refreshedAt,cueHash:entry.cueHash,cue:structuredClone(entry.cue)};
  }
  if(operation==='customize_shared_cue'){
   keys(data,['cueId','expectedCueHash']);const cueId=string(data.cueId,'cueId',160);const expectedCueHash=string(data.expectedCueHash,'expectedCueHash',64);if(!/^[a-f0-9]{64}$/.test(expectedCueHash))throw new AuthoringError('invalid_input','expectedCueHash must be a SHA-256 hash');const snapshot=await shared.get();if(!snapshot.available)throw new AuthoringError('shared_library_unavailable',snapshot.error,503);const entry=snapshot.payload.cues.find(item=>item.id===cueId);if(!entry)throw new AuthoringError('unknown_shared_cue','This CRC library item is no longer available',404);if(entry.cueHash!==expectedCueHash)throw new AuthoringError('shared_cue_changed','This CRC graphic changed after you opened it. Refresh the CRC library and review the current version before customizing.',409);
   const sourceSnapshots=entry.sourceIds.map(id=>snapshot.payload.sources.find(source=>source.id===id)).filter((source):source is NonNullable<typeof source>=>Boolean(source)).map(source=>structuredClone(source));if(sourceSnapshots.length!==entry.sourceIds.length)throw new AuthoringError('shared_library_invalid','CRC source snapshots are incomplete',503);
   const {sourcePin:sharedPin,...sharedEditable}=entry.copySpec;const editable=parseEditable(sharedEditable,false,sourceSnapshots) as EditableDraft;const pin=sourcePinFor(editable.content,sourceSnapshots,sharedPin.feedSha256);if(JSON.stringify(pin)!==JSON.stringify(sharedPin))throw new AuthoringError('shared_library_invalid','CRC source authority could not be verified',503);
   const now=Date.now();const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:pin,activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,...(sourceSnapshots.length?{sourceSnapshots}:{}),sharedFrom:{workspaceId:'crc',cueId:entry.id,cueHash:entry.cueHash}};assertSourcePin(draft);return {draft:await repo.insertDraft(draft),sharedFrom:draft.sharedFrom};
  }
  if(operation==='source_facets'||operation==='list_source_facets'){
   keys(data,[]);return {books:sourceFacets('book'),services:sourceFacets('service')};
  }
  if(operation==='search_sources'){
   keys(data,['query','book','service','limit']);const query=normalized(optionalString(data.query,'query',100));const book=normalized(optionalString(data.book,'book',100));const service=normalized(optionalString(data.service,'service',100));const limit=data.limit===undefined?20:integer(data.limit,'limit',1,50);
   const matches=browsableSources.map((raw,index)=>{const source=raw as SearchSource,rank=searchRank(source,query);return {source,index,rank}}).filter(item=>item.rank!==null&&(!book||[sourceBook(item.source).value,sourceBook(item.source).label].some(value=>normalized(value)===book))&&(!service||[sourceService(item.source).value,sourceService(item.source).label].some(value=>normalized(value)===service))).sort((a,b)=>a.rank!-b.rank!||a.index-b.index);const summaries=[];for(const {source} of matches){const {blocks,...summary}=source;if(summaries.length>=limit)break;const sourceEnglish=(block:SourceBlock)=>block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en));const coverage={bilingual:blocks.filter(block=>block.kind==='bilingual').length,originalEnglish:blocks.filter(block=>block.kind==='original-en').length,sourceEnglish:blocks.filter(sourceEnglish).length,automaticSourceEnglish:blocks.filter(block=>sourceEnglish(block)&&block.automatic!==false).length,noteLikeEnglish:blocks.filter(block=>block.noteLike===true).length};const candidate={...summary,bookValue:sourceBook(source).value,bookLabel:sourceBook(source).label,blockCount:blocks.length,kinds:[...new Set(blocks.map(b=>b.kind))],coverage};if(jsonBytes({authority:sourcePack.authority,sources:[...summaries,candidate]})>MAX_SOURCE_RESPONSE_BYTES)break;summaries.push(candidate)}return {authority:sourcePack.authority,sources:summaries,truncated:summaries.length<matches.length};
  }
  if(operation==='get_source'){keys(data,['sourceId']);const id=string(data.sourceId,'sourceId');const source=sourcePack.sources.find(s=>s.id===id);if(!source)throw new AuthoringError('unknown_source','Unknown authoring source',404);const result={authority:sourcePack.authority,source};if(jsonBytes(result)>MAX_SOURCE_RESPONSE_BYTES)throw new AuthoringError('source_too_large','This source is too large for direct browser authoring',413);return result;}
  if(operation==='list_templates'){keys(data,[]);return {templates:baselineCues.filter(cue=>!cue.hidden).map(cue=>{let importable=true;try{editableFromBaseline(cue.id)}catch{importable=false}return {id:cue.id,name:cue.name,layout:cue.layout,importable}})};}
  if(operation==='list_catalog'){
   keys(data,[]);const [drafts,published]=await Promise.all([repo.listDrafts(),repo.published()]);const active=new Map(baselineCues.map(cue=>[cue.id,cue]));for(const cue of published)active.set(cue.id,cue);const byId=new Map(drafts.map(draft=>[draft.id,draft]));
   return {cues:[...active.values()].map(cue=>{const draft=byId.get(cue.id);let origin:'canonical'|'local'|'legacy'='legacy';const authoredOrigin=(cue as AuthoringCue).authoring?.origin;if(authoredOrigin)origin=authoredOrigin;if(origin==='legacy')try{editableFromBaseline(cue.id);origin='canonical'}catch{}const editAction=draft?'open':origin==='canonical'?'import':'duplicate';return {id:cue.id,name:cue.name,title:cue.texts.textTitle,layout:cue.layout,hidden:Boolean(cue.hidden),origin,draftId:draft?.id??null,draftVersion:draft?.version??null,activeRevision:draft?.activeRevision??null,canEdit:true,editAction,canDuplicate:true}})};
  }
  if(operation==='list_drafts'){keys(data,[]);return {drafts:await repo.listDrafts()};}
  if(operation==='get_draft'){keys(data,['draftId']);const draft=await requiredDraft(repo,string(data.draftId,'draftId'));return {draft};}
  if(operation==='create_source_draft_set'){
   keys(data,['sourceId','mode','includeTranslation','layout','templateCueId']);
   const sourceId=string(data.sourceId,'sourceId');const source=sourcePack.sources.find(item=>item.id===sourceId) as SearchSource|undefined;if(!source)throw new AuthoringError('unknown_source','Unknown authoring source',404);
   if(data.mode!=='bilingual'&&data.mode!=='original-en'&&data.mode!=='source-en')throw new AuthoringError('invalid_input','mode must be bilingual, original-en, or source-en');const mode=data.mode;
   if(data.includeTranslation!==undefined&&typeof data.includeTranslation!=='boolean')throw new AuthoringError('invalid_input','includeTranslation must be boolean');
   const includeTranslation=data.includeTranslation===true;if(mode!=='bilingual'&&includeTranslation)throw new AuthoringError('invalid_input','includeTranslation is available only for bilingual sources');
   if(!['bottom','left','right'].includes(String(data.layout)))throw new AuthoringError('invalid_input','layout must be bottom, left, or right');const layout=data.layout as Layout;
   if(includeTranslation&&layout==='bottom')throw new AuthoringError('translation_layout','Use a left or right panel for translated blessing rows');
   const templateCueId=string(data.templateCueId,'templateCueId',80);const template=baselineCues.find(cue=>cue.id===templateCueId);if(!template)throw new AuthoringError('unknown_template','Unknown baseline cue template',404);if(template.layout!==layout)throw new AuthoringError('template_layout_mismatch','Template cue layout must match the draft layout');
   const pages=sourceSetPages(source,mode,includeTranslation,layout);const setId=randomUUID();const count=pages.length;const width=Math.max(2,String(count).length);const now=Date.now();
   const drafts=pages.map((page,index)=>{
    const groups=page.map(block=>({sourceId,blockIds:[block.id]}));
    const content:DraftContent=mode==='bilingual'?{mode,hebrewGroups:groups,transliterationGroups:structuredClone(groups),...(includeTranslation?{includeTranslation:true}:{})}:{mode,englishGroups:groups};
    const editable=parseEditable({name:`${source.name} — ${String(index+1).padStart(width,'0')} of ${String(count).padStart(width,'0')}`,title:source.name,layout,templateCueId,content,presentation:{}}) as EditableDraft;
    return {...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,draftSetId:setId,setIndex:index+1,setCount:count} satisfies Draft;
   });
   const inserted=await repo.insertDraftSet(drafts);return {drafts:inserted,set:{id:setId,name:source.name,count,draftIds:inserted.map(draft=>draft.id)}};
  }
  if(operation==='create_draft'){
   const editable=parseEditable(data) as EditableDraft; const now=Date.now(); const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
   return {draft:await repo.insertDraft(draft)};
  }
  if(operation==='duplicate_draft'){
   keys(data,['draftId','cueId','name']);const draftId=optionalString(data.draftId,'draftId');const cueId=optionalString(data.cueId,'cueId');if(Boolean(draftId)===Boolean(cueId))throw new AuthoringError('invalid_input','Provide exactly one of draftId or cueId');
   let editable:EditableDraft;let sourceKind:'draft'|'cue';let sourceId:string;let sourceSnapshots:Draft['sourceSnapshots'];let sharedFrom:Draft['sharedFrom'];let pinnedFeedSha256:string|undefined;
   if(draftId){const sourceDraft=await requiredDraft(repo,draftId);assertSourcePin(sourceDraft);editable=editableOnly(sourceDraft);sourceSnapshots=structuredClone(sourceDraft.sourceSnapshots);sharedFrom=structuredClone(sourceDraft.sharedFrom);pinnedFeedSha256=sourceDraft.sourcePin.feedSha256;sourceKind='draft';sourceId=draftId}
   else{sourceId=cueId!;sourceKind='cue';const authored=await repo.getDraft(sourceId);if(authored){assertSourcePin(authored);editable=editableOnly(authored)}else editable=editableFromCatalogCue(sourceId)}
   const requestedName=optionalString(data.name,'name',80);const copyName=requestedName??copyLabel(editable.name);const now=Date.now();const duplicate:Draft={...structuredClone(editable),name:copyName,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content,sourceSnapshots,pinnedFeedSha256),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who,...(sourceSnapshots?{sourceSnapshots}:{}),...(sharedFrom?{sharedFrom}:{})};
   return {draft:await repo.insertDraft(duplicate),duplicatedFrom:{kind:sourceKind,id:sourceId}};
  }
  if(operation==='import_cue'){
   keys(data,['cueId']);const cueId=string(data.cueId,'cueId',80);const existing=await repo.getDraft(cueId);if(existing)return {draft:existing,created:false};
   const editable=editableFromBaseline(cueId);const now=Date.now();const draft:Draft={...editable,id:cueId,version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};
   const baseline=baselineCues.find(cue=>cue.id===cueId)!;
   try{return {draft:await repo.insertImportedDraft(draft,structuredClone(baseline),who),created:true}}catch(error){const raced=await repo.getDraft(cueId);if(raced)return {draft:raced,created:false};throw error}
  }
  if(operation==='update_draft'){
   keys(data,['draftId','expectedVersion','patch']);const id=string(data.draftId,'draftId');const expected=integer(data.expectedVersion,'expectedVersion',1);const current=await requiredDraft(repo,id);if(current.version!==expected)throw conflict();assertSourcePin(current);
   const patch=parseEditable(data.patch,true,current.sourceSnapshots);const merged=parseEditable({...editableOnly(current),...patch},false,current.sourceSnapshots) as EditableDraft;
   const updated=await repo.updateDraft(id,expected,merged,who);if(!updated)throw conflict();return {draft:updated};
  }
  if(operation==='preview_draft'){
   keys(data,['draftId','expectedVersion']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const cue=buildCue(draft);const validation=previewValidation(cue);const preview:PreviewRecord={id:randomUUID(),draftId:draft.id,draftVersion:draft.version,cueHash:cueHash(cue),cue,validation,review:null,createdAt:Date.now(),createdBy:who};await repo.insertPreview(preview);
   return {previewId:preview.id,draftVersion:draft.version,cue,cueHash:preview.cueHash,validation,previewPath:`/author?draft=${encodeURIComponent(draft.id)}`,fitContract:{viewport:{width:1920,height:1080},fontsReadyRequired:true,noOverflowRequired:true,browserReported:true,humanReviewRequired:true}};
  }
  if(operation==='preview_content'){
   const editable=parseEditable(data) as EditableDraft;const now=Date.now();const draft:Draft={...editable,id:newDraftId(),version:1,sourcePin:sourcePinFor(editable.content),activeRevision:null,activeDraftVersion:null,createdAt:now,updatedAt:now,createdBy:who,updatedBy:who};const cue=buildCue(draft);const validation=previewValidation(cue);
   return {cue,validation,ephemeral:true,fitContract:{viewport:{width:1920,height:1080},fontsReadyRequired:true,noOverflowRequired:true,browserReported:true,humanReviewRequired:true}};
  }
  if(operation==='review_draft'){
   keys(data,['draftId','expectedVersion','previewId','browserMeasurement','humanApproved']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const preview=await requiredPreview(repo,string(data.previewId,'previewId'));if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);if(data.humanApproved!==true)throw new AuthoringError('review_required','Human approval is required',400);
   const m=object(data.browserMeasurement,'browserMeasurement');keys(m,['viewportWidth','viewportHeight','fontsReady','overflow','rendererVersion','measuredAt'],'browserMeasurement');if(m.viewportWidth!==1920||m.viewportHeight!==1080||m.fontsReady!==true||m.overflow!==false)throw new AuthoringError('fit_failed','Preview must be measured at 1920x1080 with loaded fonts and no overflow',409);const measurement:BrowserMeasurement={viewportWidth:1920,viewportHeight:1080,fontsReady:true,overflow:false,rendererVersion:string(m.rendererVersion,'rendererVersion',80),measuredAt:integer(m.measuredAt,'measuredAt',1)};const review:ReviewReceipt={humanApproved:true,browserMeasurement:measurement,reviewedAt:Date.now(),reviewedBy:who};await repo.saveReview(preview.id,review);return {draftId:draft.id,draftVersion:draft.version,previewId:preview.id,cueHash:preview.cueHash,review};
  }
  if(operation==='publish_draft'){
   keys(data,['draftId','expectedVersion','previewId']);const draft=await versionedDraft(repo,string(data.draftId,'draftId'),integer(data.expectedVersion,'expectedVersion',1));assertSourcePin(draft);const revision=await repo.publish(draft.id,draft.version,string(data.previewId,'previewId'),who);return {revision,cue:revision.cue};
  }
  if(operation==='list_revisions'){keys(data,['draftId']);const id=string(data.draftId,'draftId');await requiredDraft(repo,id);return {revisions:await repo.revisions(id)};}
  if(operation==='rollback_draft'){keys(data,['draftId','expectedVersion','revision']);const id=string(data.draftId,'draftId');const revision=integer(data.revision,'revision',1);const selected=(await repo.revisions(id)).find(row=>row.revision===revision);if(!selected)throw new AuthoringError('unknown_revision','Unknown revision',404);assertRevisionAuthority(selected.cue);const result=await repo.rollback(id,integer(data.expectedVersion,'expectedVersion',1),revision,who);return result;}
  throw new AuthoringError('unknown_operation',`Unknown authoring operation: ${operation}`,404);
 };
 return {operation,publishedCues:()=>repo.published()};
}

function editableOnly(draft:Draft):EditableDraft{return {name:draft.name,title:draft.title,accentTitle:draft.accentTitle,layout:draft.layout,templateCueId:draft.templateCueId,content:draft.content,presentation:draft.presentation}}
function copyLabel(name:string){const prefix='Copy of ';return `${prefix}${name}`.slice(0,80).trim()}
function editableFromCatalogCue(cueId:string):EditableDraft{
 try{return editableFromBaseline(cueId)}catch(error){
  const cue=baselineCues.find(item=>item.id===cueId);if(!cue)throw new AuthoringError('unknown_cue','Unknown catalog cue',404);
  const body=cue.texts.textMain;if(typeof body!=='string'||!body.trim())throw error;
  return {name:cue.name,title:cue.texts.textTitle,accentTitle:cue.texts.accentTextTitle,layout:cue.layout as EditableDraft['layout'],templateCueId:cue.id,content:{mode:'custom',text:body},presentation:(cue as AuthoringCue).presentation??{}};
 }
}
const conflict=()=>new AuthoringError('version_conflict','Draft version changed; reload before editing',409);
async function requiredDraft(repo:AuthoringRepository,id:string){const draft=await repo.getDraft(id);if(!draft)throw new AuthoringError('unknown_draft','Unknown draft',404);return draft}
async function versionedDraft(repo:AuthoringRepository,id:string,version:number){const draft=await requiredDraft(repo,id);if(draft.version!==version)throw conflict();return draft}
async function requiredPreview(repo:AuthoringRepository,id:string){const preview=await repo.getPreview(id);if(!preview)throw new AuthoringError('unknown_preview','Unknown preview',404);return preview}

export class MemoryAuthoringRepository implements AuthoringRepository{
 drafts=new Map<string,Draft>(); previews=new Map<string,PreviewRecord>(); revisionRows=new Map<string,Revision[]>();
 async listDrafts(){return [...this.drafts.values()].map(clone).sort((a,b)=>b.updatedAt-a.updatedAt)} async getDraft(id:string){const d=this.drafts.get(id);return d?clone(d):null}
 async insertDraft(d:Draft){if(this.drafts.has(d.id))throw new AuthoringError('draft_exists','Draft already exists',409);this.drafts.set(d.id,clone(d));return clone(d)}
 async insertDraftSet(drafts:Draft[]){const ids=drafts.map(draft=>draft.id);if(new Set(ids).size!==ids.length||ids.some(id=>this.drafts.has(id)))throw new AuthoringError('draft_exists','Draft already exists',409);for(const draft of drafts)this.drafts.set(draft.id,clone(draft));return clone(drafts)}
 async insertImportedDraft(d:Draft,cue:AuthoringCue,actor:string){if(this.drafts.has(d.id))throw new AuthoringError('draft_exists','Draft already exists',409);const row:Revision={draftId:d.id,revision:1,draftVersion:1,cueHash:cueHash(cue),cue:clone(cue),previewId:null,review:null,actor,createdAt:Date.now()};d.activeRevision=1;d.activeDraftVersion=1;this.drafts.set(d.id,clone(d));this.revisionRows.set(d.id,[row]);return clone(d)}
 async updateDraft(id:string,v:number,e:EditableDraft,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)return null;const next={...d,...clone(e),version:v+1,sourcePin:sourcePinFor(e.content,d.sourceSnapshots,d.sourceSnapshots?.length?d.sourcePin.feedSha256:undefined),updatedAt:Date.now(),updatedBy:actor};this.drafts.set(id,next);return clone(next)}
 async insertPreview(p:PreviewRecord){this.previews.set(p.id,clone(p))} async getPreview(id:string){const p=this.previews.get(id);return p?clone(p):null} async saveReview(id:string,r:ReviewReceipt){const p=this.previews.get(id);if(!p)throw new AuthoringError('unknown_preview','Unknown preview',404);p.review=clone(r)}
 async publish(id:string,v:number,previewId:string,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const p=this.previews.get(previewId);validatePublishPreview(d,p);const rows=this.revisionRows.get(id)??[];let row=rows.find(r=>r.draftVersion===v&&r.cueHash===p!.cueHash);if(!row){row={draftId:id,revision:rows.length+1,draftVersion:v,cueHash:p!.cueHash,cue:clone(p!.cue),previewId,review:clone(p!.review!),actor,createdAt:Date.now()};rows.push(row);this.revisionRows.set(id,rows)}d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return clone(row)}
 async revisions(id:string){return clone(this.revisionRows.get(id)??[])}
 async rollback(id:string,v:number,revision:number,actor:string){const d=this.drafts.get(id);if(!d||d.version!==v)throw conflict();const row=(this.revisionRows.get(id)??[]).find(r=>r.revision===revision);if(!row)throw new AuthoringError('unknown_revision','Unknown revision',404);d.version++;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;return {draft:clone(d),revision:clone(row)}}
 async published(){return [...this.drafts.values()].filter(d=>d.activeRevision!==null).map(d=>clone((this.revisionRows.get(d.id)??[]).find(r=>r.revision===d.activeRevision)!.cue))}
}

function validatePublishPreview(draft:Draft,preview?:PreviewRecord){if(!preview)throw new AuthoringError('unknown_preview','Unknown preview',404);if(preview.draftId!==draft.id||preview.draftVersion!==draft.version)throw new AuthoringError('stale_preview','Preview does not match this draft version',409);if(!preview.validation.valid)throw new AuthoringError('invalid_preview','Preview validation failed',409);if(!preview.review?.humanApproved||preview.review.browserMeasurement.overflow||!preview.review.browserMeasurement.fontsReady)throw new AuthoringError('review_required','Exact-version browser fit review is required',409)}
function assertRevisionAuthority(cue:AuthoringCue){
 const value=cue as AuthoringCue&{provenance?:{liturgy?:{feedSha256?:string}}};
 if(value.authoring?.origin==='local'){if(value.authoring.feedSha256!=='local'||value.authoring.sourceIds.length)throw new AuthoringError('source_pin_mismatch','Local revision authority is invalid',409);return}
 const feed=value.authoring?.feedSha256??value.provenance?.liturgy?.feedSha256;if(feed!==sourcePack.authority.feedSha256)throw new AuthoringError('source_pin_mismatch','Revision source authority no longer matches the pinned feed',409);
 if(!value.authoring)return;
 const sources=value.authoring.sourceIds.map(id=>sourcePack.sources.find(item=>item.id===id));if(sources.some(item=>!item))throw new AuthoringError('source_pin_mismatch','A revision source is no longer available',409);
 const units=Object.fromEntries(sources.map(item=>[item!.id,item!.unitSha256]));if(JSON.stringify(units)!==JSON.stringify(value.authoring.unitSha256))throw new AuthoringError('source_pin_mismatch','Revision source units no longer match the pinned authority',409);
 const expanded=Object.fromEntries(sources.filter(item=>item!.id.startsWith('library:')).map(item=>{const source=item!;if(!source.authority||!source.sourceSha256)throw new AuthoringError('source_pin_mismatch','Expanded revision source authority is unavailable',409);return [source.id,{id:source.authority.id,feedSha256:source.authority.feedSha256,unitSha256:source.authority.unitSha256,sourceSha256:source.sourceSha256}]}));
 if(Object.keys(expanded).length&&JSON.stringify(expanded)!==JSON.stringify(value.authoring.sourceAuthority))throw new AuthoringError('source_pin_mismatch','Expanded revision authority no longer matches its source feed',409);
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

class PgAuthoringRepository implements AuthoringRepository{
 private async db(){return (await import('./database')).db}
 private readonly publishedCache=signatureCache(
  async()=>String((await (await this.db()).query(PUBLISHED_SIGNATURE_SQL)).rows[0]?.signature??''),
  async()=>{const row=(await (await this.db()).query(PUBLISHED_CUES_SQL)).rows[0] as {signature:string;cues:AuthoringCue[]};return {signature:String(row.signature),value:row.cues}},
 );
 async listDrafts(){return (await (await this.db()).query('SELECT document FROM authoring_drafts ORDER BY updated_at DESC')).rows.map((r:{document:Draft})=>r.document)}
 async getDraft(id:string){return (await (await this.db()).query('SELECT document FROM authoring_drafts WHERE id=$1',[id])).rows[0]?.document??null}
 async insertDraft(d:Draft){await (await this.db()).query('INSERT INTO authoring_drafts(id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$4,$5,$5)',[d.id,d,d.version,d.createdAt,d.createdBy]);return d}
 async insertDraftSet(drafts:Draft[]){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');for(const draft of drafts)await client.query('INSERT INTO authoring_drafts(id,document,version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,$3,$4,$4,$5,$5)',[draft.id,draft,draft.version,draft.createdAt,draft.createdBy]);await client.query('COMMIT');return drafts}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
 async insertImportedDraft(d:Draft,cue:AuthoringCue,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');d.activeRevision=1;d.activeDraftVersion=1;await client.query('INSERT INTO authoring_drafts(id,document,version,active_revision,active_draft_version,created_at,updated_at,created_by,updated_by) VALUES($1,$2,1,1,1,$3,$3,$4,$4)',[d.id,d,d.createdAt,actor]);await client.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,preview_id,review,actor,created_at) VALUES($1,1,1,$2,$3,NULL,NULL,$4,$5)',[d.id,cueHash(cue),cue,actor,Date.now()]);await client.query('COMMIT');return d}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async updateDraft(id:string,v:number,e:EditableDraft,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const locked=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const current=locked.rows[0]?.document as Draft|undefined;if(!current){await client.query('ROLLBACK');return null}const next:Draft={...current,...e,version:v+1,sourcePin:sourcePinFor(e.content,current.sourceSnapshots,current.sourceSnapshots?.length?current.sourcePin.feedSha256:undefined),updatedAt:Date.now(),updatedBy:actor};await client.query('UPDATE authoring_drafts SET document=$2,version=$3,updated_at=$4,updated_by=$5 WHERE id=$1',[id,next,next.version,next.updatedAt,actor]);await client.query('COMMIT');return next}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async insertPreview(p:PreviewRecord){await (await this.db()).query('INSERT INTO authoring_previews(id,draft_id,draft_version,cue_hash,cue,validation,review,created_at,created_by) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$8)',[p.id,p.draftId,p.draftVersion,p.cueHash,p.cue,p.validation,p.createdAt,p.createdBy])}
 async getPreview(id:string){const r=(await (await this.db()).query('SELECT id,draft_id AS "draftId",draft_version AS "draftVersion",cue_hash AS "cueHash",cue,validation,review,created_at AS "createdAt",created_by AS "createdBy" FROM authoring_previews WHERE id=$1',[id])).rows[0];return r??null}
 async saveReview(id:string,r:ReviewReceipt){await (await this.db()).query('UPDATE authoring_previews SET review=$2 WHERE id=$1',[id,r])}
 async publish(id:string,v:number,previewId:string,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const dr=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const d=dr.rows[0]?.document as Draft|undefined;if(!d)throw conflict();const pr=await client.query('SELECT id,draft_id AS "draftId",draft_version AS "draftVersion",cue_hash AS "cueHash",cue,validation,review,created_at AS "createdAt",created_by AS "createdBy" FROM authoring_previews WHERE id=$1',[previewId]);const p=pr.rows[0] as PreviewRecord|undefined;validatePublishPreview(d,p);let rr=await client.query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt" FROM authoring_revisions WHERE draft_id=$1 AND draft_version=$2 AND cue_hash=$3',[id,v,p!.cueHash]);if(!rr.rows[0])rr=await client.query('INSERT INTO authoring_revisions(draft_id,revision,draft_version,cue_hash,cue,preview_id,review,actor,created_at) SELECT $1,COALESCE(MAX(revision),0)+1,$2,$3,$4,$5,$6,$7,$8 FROM authoring_revisions WHERE draft_id=$1 RETURNING draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt"',[id,v,p!.cueHash,p!.cue,previewId,p!.review,actor,Date.now()]);const row=rr.rows[0] as Revision;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;await client.query('UPDATE authoring_drafts SET document=$2,active_revision=$3,active_draft_version=$4,updated_at=$5,updated_by=$6 WHERE id=$1',[id,d,row.revision,row.draftVersion,d.updatedAt,actor]);await client.query('COMMIT');return row}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async revisions(id:string){return (await (await this.db()).query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt" FROM authoring_revisions WHERE draft_id=$1 ORDER BY revision DESC',[id])).rows}
 async rollback(id:string,v:number,revision:number,actor:string){const db=await this.db();const client=await db.connect();try{await client.query('BEGIN');const dr=await client.query('SELECT document FROM authoring_drafts WHERE id=$1 AND version=$2 FOR UPDATE',[id,v]);const d=dr.rows[0]?.document as Draft|undefined;if(!d)throw conflict();const rr=await client.query('SELECT draft_id AS "draftId",revision,draft_version AS "draftVersion",cue_hash AS "cueHash",cue,preview_id AS "previewId",review,actor,created_at AS "createdAt" FROM authoring_revisions WHERE draft_id=$1 AND revision=$2',[id,revision]);const row=rr.rows[0] as Revision|undefined;if(!row)throw new AuthoringError('unknown_revision','Unknown revision',404);d.version++;d.activeRevision=row.revision;d.activeDraftVersion=row.draftVersion;d.updatedAt=Date.now();d.updatedBy=actor;await client.query('UPDATE authoring_drafts SET document=$2,version=$3,active_revision=$4,active_draft_version=$5,updated_at=$6,updated_by=$7 WHERE id=$1',[id,d,d.version,row.revision,row.draftVersion,d.updatedAt,actor]);await client.query('COMMIT');return {draft:d,revision:row}}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
 async published(){return this.publishedCache()}
}

export function authoringRepositoryMode(env:Partial<Pick<NodeJS.ProcessEnv,'CRC_AUTHORING_REHEARSAL'|'NODE_ENV'|'RELAY_URL'>>):AuthoringWorkspace{
 if(env.CRC_AUTHORING_REHEARSAL!=='1')return {rehearsal:false,storage:'postgres',label:null};
 if(env.NODE_ENV!=='development'||Boolean(env.RELAY_URL))throw new AuthoringError('unsafe_rehearsal_config','In-memory authoring is allowed only in development with no live relay configured',503);
 return {rehearsal:true,storage:'memory',label:'Local rehearsal — changes are temporary'};
}
let defaultService:ReturnType<typeof createAuthoringService>|undefined;
const defaults=()=>{if(defaultService)return defaultService;const workspace=authoringRepositoryMode(process.env);return defaultService=createAuthoringService(workspace.storage==='memory'?new MemoryAuthoringRepository():new PgAuthoringRepository(),workspace)};
export async function authoringOperation(operation:string,input:unknown,actor:string){
 const result=await defaults().operation(operation,input,actor);
 if(['publish_draft','rollback_draft','import_cue'].includes(operation)){
  const {relayConfigured}=await import('./relay');
  if(relayConfigured()){
   try{const {syncLiveCatalog}=await import('./sync-live-catalog');await syncLiveCatalog()}
   catch{return {...(result as Record<string,unknown>),liveRefreshPending:true,warning:'Saved successfully, but the live library has not received this update. Use Sync live library in the editor after the connection recovers. Live playback continues using the last synchronized version.'}}
  }
 }
 return result;
}
export async function publishedCues():Promise<Cue[]>{return defaults().publishedCues()}
