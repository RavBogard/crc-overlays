import {createHash} from 'node:crypto';
import {AuthoringError,buildCue,cueHash,isRetiredDraft,normalizeGraphicName,previewValidation,type AuthoringCue,type Draft} from './authoring-model';
import {hygieneToolSchemas,ISSUE_KINDS,type HygieneToolName,type IssueKind} from './catalog-hygiene-schemas';
import {baselineCatalogForWorkspace} from './workspace-catalog';
import {missingCueRefusal,notPublishedRefusal} from './retire-rules';
import type {AuthoringRepository} from './authoring';
import type {CompanionDeck,DeckWorkspace} from './companion-deck/model.ts';
import type {CompanionDeckRepository} from './companion-deck/repository.ts';
import type {CollectionEntry,CoverageItem,PreparedService,ServicesLoaders,ServicesRepository} from './service-collections';

/**
 * A5 (R-H1-H3) - catalog hygiene: find what is wrong with the library, and fix many drafts at
 * once through the operations that already exist. Nothing here writes a draft directly: every
 * change is update_draft, style_draft, archive_draft, ship_draft or retire_cue run through `run`,
 * so versions, source pins, name checks and the publish gate are exactly the single-tool ones.
 * Services and the deck are reached through their own repositories. Service code is imported
 * lazily because lib/service-collections imports the authoring catalog (the service-tools cycle).
 */
export type DeckSource={repository:CompanionDeckRepository;workspace:DeckWorkspace};
export type HygieneContext={
 repo:Pick<AuthoringRepository,'listDrafts'|'getDraft'|'published'|'revisions'>;
 /** The authoring service's own operation runner (update_draft, ship_draft, retire_cue ...). */
 run:(operation:string,input:unknown,actor:string)=>Promise<unknown>;
 services?:{repository?:ServicesRepository;loaders?:ServicesLoaders};
 /** The stored Companion deck (C3's store, via deckSourceForDeployment); null or absent when this congregation has none. */
 deck?:DeckSource|null;
 now?:()=>number;
};

type GraphicRef={id:string;name:string;version?:number;published:boolean;builtIn?:true};
export type CatalogIssue={kind:IssueKind;graphics:GraphicRef[];message:string;suggestedFix:{tool:string;how:string};services?:{serviceId:string;name:string;version:number}[];buttons?:{page:number;pageName:string;row:number;col:number;label:string}[]};
type ItemResult={index:number;draftId:string;ok:boolean;status:string;[key:string]:unknown};

const refuse=(message:string,code='invalid_input',status=400)=>new AuthoringError(code,message,status);
function failure(error:unknown){const e=error as {code?:unknown;message?:unknown};return {code:typeof e?.code==='string'?e.code:'error',message:typeof e?.message==='string'?e.message:String(error)}}
const quoted=(names:string[])=>names.map(name=>`"${name}"`).join(', ');

/* ---------- names and content ---------- */

// "Copy of Copy of Thank you (2)" and "Thank you copy" read as the same graphic to a person.
export function nameBase(name:string){
 let value=String(name??'').trim(),previous='';
 while(value!==previous){previous=value;value=value.replace(/^copy of\s+/i,'').replace(/\s*\((?:\d+|copy)\)\s*$/i,'').replace(/\s+copy(?:\s+\d+)?$/i,'').replace(/\s+·\s+\d+$/,'').trim()}
 return normalizeGraphicName(value);
}
const STOP_WORDS=new Set(['the','of','and','for','a','an','to','in','on','copy','part']);
const words=(text:string)=>new Set(normalizeGraphicName(text).split(' ').filter(word=>word.length>=2&&!STOP_WORDS.has(word)));
const overlaps=(a:Set<string>,b:Set<string>)=>[...a].some(word=>b.has(word));
// What cueHash would hash, less the id, the name and the authoring pins: what the audience sees.
function contentKey(cue:Pick<AuthoringCue,'layout'|'texts'|'contentRows'>){return createHash('sha256').update(JSON.stringify([cue.layout,Object.entries(cue.texts??{}).filter(([,value])=>typeof value==='string'&&value.trim()).sort(([a],[b])=>a.localeCompare(b)),cue.contentRows??null])).digest('hex')}
function cueOf(draft:Draft):AuthoringCue|null{try{return buildCue(draft)}catch{return null}}
const onScreen=(cue:AuthoringCue)=>JSON.stringify([cue.name,cue.layout,cue.texts,cue.contentRows??null,cue.rowOrder??null,cue.presentation??null,cue.template??null]);
const differsFromLive=(current:AuthoringCue|null,live:AuthoringCue|undefined)=>!current||!live||onScreen(current)!==onScreen(live);
const isPublished=(draft:Draft)=>draft.activeRevision!==null;
const draftRef=(draft:Draft):GraphicRef=>({id:draft.id,name:draft.name,version:draft.version,published:isPublished(draft)});

// Every name a person can see in the library, as ship_draft measures it (lib/authoring.ts libraryNames).
async function libraryNames(ctx:HygieneContext,drafts:Draft[]){
 const published=await ctx.repo.published();const archived=new Set(drafts.filter(draft=>draft.archivedAt).map(draft=>draft.id));
 const live=published.filter(cue=>!archived.has(cue.id)),overridden=new Set([...live.map(cue=>cue.id),...drafts.filter(isRetiredDraft).map(draft=>draft.id)]);
 const builtIns=baselineCatalogForWorkspace().filter(cue=>!cue.hidden&&!cue.aliasOf&&!overridden.has(cue.id));
 return {live,builtIns,publishedNames:(excludeId:string)=>new Set([...builtIns,...live].filter(cue=>cue.id!==excludeId).map(cue=>normalizeGraphicName(cue.name))),draftNames:(excludeId:string)=>new Set(drafts.filter(draft=>!draft.archivedAt&&draft.id!==excludeId).map(draft=>normalizeGraphicName(draft.name)))};
}

async function servicesManager(ctx:HygieneContext){const {ServicesManager}=await import('./service-collections');return new ServicesManager(ctx.services?.repository,ctx.services?.loaders)}
const cueButtons=(deck:CompanionDeck)=>deck.pages.flatMap(page=>page.buttons.flatMap(button=>button.spec.kind==='cue'?[{page,button,spec:button.spec}]:[]));

/* ---------- find_catalog_issues ---------- */

async function findIssues(ctx:HygieneContext,input:{kinds?:IssueKind[];limit?:number}){
 const wanted=new Set<IssueKind>(input.kinds??ISSUE_KINDS),limit=input.limit??100;
 const drafts=await ctx.repo.listDrafts();const {live,builtIns}=await libraryNames(ctx,drafts);
 const active=drafts.filter(draft=>!draft.archivedAt&&!isRetiredDraft(draft)),cues=new Map(active.map(draft=>[draft.id,cueOf(draft)]));
 const issues:CatalogIssue[]=[];
 type Named={ref:GraphicRef;name:string;title:string};
 const population:Named[]=[...active.map(draft=>({ref:draftRef(draft),name:draft.name,title:draft.title})),...builtIns.map(cue=>({ref:{id:cue.id,name:cue.name,published:true,builtIn:true as const},name:cue.name,title:cue.texts?.textTitle??cue.name}))];

 if(wanted.has('duplicate_content')){
  const groups=new Map<string,Draft[]>();for(const draft of active){const cue=cues.get(draft.id);if(!cue)continue;const key=contentKey(cue);groups.set(key,[...(groups.get(key)??[]),draft])}
  for(const group of groups.values()){if(group.length<2)continue;const publishedCount=group.filter(isPublished).length;
   issues.push({kind:'duplicate_content',graphics:group.map(draftRef),message:`${group.length} graphics read exactly the same on screen: ${quoted(group.map(draft=>draft.name))}. Keep one.`,suggestedFix:publishedCount>1?{tool:'supersede_cue',how:'Supersede each extra published copy onto the one you keep (its services and deck keys move with it), then archive the unpublished ones with batch_update.'}:{tool:'batch_update',how:'Archive the copies you do not need (action archive).'}})}
 }
 if(wanted.has('duplicate_name')||wanted.has('near_duplicate_name')){
  const groups=new Map<string,Named[]>();for(const item of population){const key=nameBase(item.name);if(key)groups.set(key,[...(groups.get(key)??[]),item])}
  for(const group of groups.values()){if(group.length<2)continue;const exact=new Set(group.map(item=>normalizeGraphicName(item.name))).size===1,kind:IssueKind=exact?'duplicate_name':'near_duplicate_name';if(!wanted.has(kind))continue;
   issues.push({kind,graphics:group.map(item=>item.ref),message:exact?`${group.length} graphics share the name "${group[0].name}", so a person picking one by name cannot tell them apart.`:`${group.length} graphics are copies of one name: ${quoted(group.map(item=>item.name))}.`,suggestedFix:{tool:'batch_update',how:'Rename the ones you keep so each name says what it is (action rename), and archive the copies you do not need (action archive).'}})}
 }
 if(wanted.has('inherited_title')){
  for(const draft of active){
   const title=normalizeGraphicName(draft.title),titleWords=words(draft.title);if(!title||!titleWords.size||overlaps(words(nameBase(draft.name)),titleWords))continue;
   const cue=cues.get(draft.id),text=normalizeGraphicName(Object.entries(cue?.texts??{}).filter(([key])=>key!=='textTitle').map(([,value])=>value).join(' '));if(text.includes(title))continue;
   const owners=population.filter(item=>item.ref.id!==draft.id&&(nameBase(item.name)===title||(normalizeGraphicName(item.title)===title&&overlaps(words(nameBase(item.name)),titleWords))));if(!owners.length)continue;
   issues.push({kind:'inherited_title',graphics:[draftRef(draft),...owners.slice(0,3).map(item=>item.ref)],message:`"${draft.name}" shows the title "${draft.title}", which is the title of "${owners[0].name}" and matches neither its own name nor its text. It was probably copied from that graphic and kept its title.`,suggestedFix:{tool:'batch_update',how:`Give it its own title (action rename with title), then ship it again if it is published.`}});
  }
 }
 if(wanted.has('archived_but_published'))for(const draft of drafts.filter(item=>item.archivedAt&&isPublished(item)))
  issues.push({kind:'archived_but_published',graphics:[draftRef(draft)],message:`"${draft.name}" is archived in the editor but still published: it is in the live library, Companion's picker and the relay.`,suggestedFix:{tool:'batch_retire',how:'Retire it to take it out of use (batchRetire in this result is the batch_retire input for every one found; retire_cue does one), or restore_draft to see it in the editor again.'}});
 const retired=new Map(drafts.filter(isRetiredDraft).map(draft=>[draft.id,draft]));
 const checked:{drafts:number;builtIns:number;services:{checked:boolean;count?:number;message?:string};deck:{checked:boolean;version?:number;message?:string}}={drafts:drafts.length,builtIns:builtIns.length,services:{checked:false},deck:{checked:false}};
 if(wanted.has('retired_in_service')){
  try{
   const [manager,{retiredBindings}]=await Promise.all([servicesManager(ctx),import('./service-collections')]);const services=await manager.listServices(false);checked.services={checked:true,count:services.length};
   const byCue=new Map<string,{serviceId:string;name:string;version:number}[]>();
   for(const service of services){const bound=retiredBindings(service,retired);for(const cueId of new Set([...bound.entries.flatMap(entry=>entry.cueIds),...bound.coverage.map(row=>row.cueId)]))byCue.set(cueId,[...(byCue.get(cueId)??[]),{serviceId:service.id,name:service.name,version:service.version}])}
   for(const [cueId,list] of byCue){const draft=retired.get(cueId)!;issues.push({kind:'retired_in_service',graphics:[draftRef(draft)],services:list,message:`"${draft.name}" is retired but ${list.length===1?`the service "${list[0].name}" still uses it`:`${list.length} services still use it: ${quoted(list.map(item=>item.name))}`}.`,suggestedFix:{tool:'supersede_cue',how:'Supersede it with its replacement (every service and deck key moves over), or swap_graphic row by row.'}})}
  }catch(error){checked.services={checked:false,message:`Prepared services could not be read (${failure(error).message}), so retired graphics in services were not checked.`}}
 }
 if(wanted.has('retired_on_deck')){
  if(!ctx.deck)checked.deck={checked:false,message:'No Companion deck is stored for this congregation yet, so deck keys were not checked.'};
  else{
   const stored=await ctx.deck.repository.get(ctx.deck.workspace);
   if(!stored)checked.deck={checked:false,message:'No Companion deck is stored for this congregation yet, so deck keys were not checked.'};
   else{
    checked.deck={checked:true,version:stored.version};
    const {catalogCueLookups}=await import('./companion-deck/validate.ts');const lookups=catalogCueLookups(drafts.map(draft=>({id:draft.id,name:draft.name,archived:Boolean(draft.archivedAt),activeRevision:draft.activeRevision,retired:isRetiredDraft(draft)})));
    const byCue=new Map<string,NonNullable<CatalogIssue['buttons']>>();
    for(const {page,button,spec} of cueButtons(stored.deck))if(lookups.isRetired(spec.cueId))byCue.set(spec.cueId,[...(byCue.get(spec.cueId)??[]),{page:page.number,pageName:page.name,row:button.row,col:button.col,label:spec.label}]);
    for(const [cueId,buttons] of byCue){const draft=retired.get(cueId)!;issues.push({kind:'retired_on_deck',graphics:[draftRef(draft)],buttons,message:`"${draft.name}" is retired but ${buttons.length===1?`a deck key still fires it (page ${buttons[0].page} "${buttons[0].pageName}", row ${buttons[0].row} column ${buttons[0].col})`:`${buttons.length} deck keys still fire it`}. Pressing it does nothing.`,suggestedFix:{tool:'supersede_cue',how:'Supersede it with its replacement so the keys fire the new graphic.'}})}
   }
  }
 }
 if(wanted.has('restored_name_clash')){
  const liveDrafts=new Map(drafts.filter(draft=>isPublished(draft)&&!draft.archivedAt).map(draft=>[draft.id,draft]));
  const groups=new Map<string,AuthoringCue[]>();for(const cue of live){if(!liveDrafts.has(cue.id))continue;const key=normalizeGraphicName(cue.name);groups.set(key,[...(groups.get(key)??[]),cue])}
  for(const group of groups.values()){if(group.length<2)continue;
   const dated=await Promise.all(group.map(async cue=>{const draft=liveDrafts.get(cue.id)!;const revision=(await ctx.repo.revisions(cue.id)).find(row=>row.revision===draft.activeRevision);return {cue,draft,publishedAt:revision?.createdAt??draft.updatedAt}}));dated.sort((a,b)=>a.publishedAt-b.publishedAt);
   const [older,...newer]=dated;
   issues.push({kind:'restored_name_clash',graphics:dated.map(item=>({...draftRef(item.draft),name:item.cue.name})),message:`${dated.length} live graphics are called "${older.cue.name}". The one published first came back (restored or rolled back) after ${newer.length===1?'another was':'others were'} published under the same name, so Companion's picker and the operators see two graphics with one name.`,suggestedFix:{tool:'batch_update',how:'Rename one (action rename) and ship it again with batch_ship, or retire the one you do not need (retire_cue).'}});
  }
 }
 // A version bump alone is not a change: retire and restore move the version and leave the graphic as it was.
 const liveById=new Map(live.map(cue=>[cue.id,cue]));
 if(wanted.has('unpublished_changes'))for(const draft of active.filter(item=>isPublished(item)&&item.activeDraftVersion!==item.version&&differsFromLive(cues.get(item.id)??null,liveById.get(item.id))))
  issues.push({kind:'unpublished_changes',graphics:[draftRef(draft)],message:`"${draft.name}" has changes since it was published (draft version ${draft.version}, live version ${draft.activeDraftVersion}); the live graphic does not show them yet.`,suggestedFix:{tool:'batch_ship',how:'Ship it (batch_ship or ship_draft) to publish the changes, or rollback_draft to drop them.'}});

 const order=new Map(ISSUE_KINDS.map((kind,index)=>[kind,index]));
 issues.sort((a,b)=>order.get(a.kind)!-order.get(b.kind)!||a.graphics[0].name.localeCompare(b.graphics[0].name));
 const counts=Object.fromEntries(ISSUE_KINDS.filter(kind=>wanted.has(kind)).map(kind=>[kind,issues.filter(issue=>issue.kind===kind).length]));
 const shown=issues.slice(0,limit);
 // G8 - every archived-but-published graphic as batch_retire items, whatever limit cut from issues.
 const toRetire=issues.filter(issue=>issue.kind==='archived_but_published').map(issue=>({draftId:issue.graphics[0].id,expectedVersion:issue.graphics[0].version!}));
 return {total:issues.length,truncated:shown.length<issues.length,counts,issues:shown,...(toRetire.length?{batchRetire:{items:toRetire}}:{}),checked,message:issues.length?`Found ${issues.length} issue${issues.length===1?'':'s'} in the library. Nothing was changed; each issue names the tool that fixes it.`:'No issues found. Nothing was changed.'};
}

/* ---------- batch_update ---------- */

type UpdateItem={action:'rename';draftId:string;expectedVersion:number;name?:string;title?:string;accentTitle?:string}|{action:'style';draftId:string;expectedVersion:number;layout?:string;arrangement?:'together'|'blocks';rowOrder?:string[];comfortableTypography?:boolean;latinLineBreaks?:'preserve'|'paragraphs'|'phrases'}|{action:'archive';draftId:string;expectedVersion:number};

async function versioned(ctx:HygieneContext,draftId:string,expectedVersion:number){
 const draft=await ctx.repo.getDraft(draftId);if(!draft)throw refuse(`No draft in this library has the id ${draftId}. Check it with list_drafts.`,'unknown_draft',404);
 if(draft.version!==expectedVersion)throw refuse(`"${draft.name}" is at version ${draft.version}, not ${expectedVersion}: it changed since you read it. Read it again and retry this item.`,'version_conflict',409);
 return draft;
}

async function updateItem(ctx:HygieneContext,item:UpdateItem,index:number,dryRun:boolean,actor:string,names:Awaited<ReturnType<typeof libraryNames>>):Promise<ItemResult>{
 const base={index,draftId:item.draftId,action:item.action};
 try{
  const draft=await versioned(ctx,item.draftId,item.expectedVersion);
  if(item.action==='rename'){
   if(item.name===undefined&&item.title===undefined&&item.accentTitle===undefined)throw refuse('Give name, title or accentTitle to rename.');
   const patch=Object.fromEntries((['name','title','accentTitle'] as const).filter(key=>item[key]!==undefined&&item[key]!==(draft[key]??'')).map(key=>[key,item[key]]));
   const change=Object.fromEntries(Object.keys(patch).map(key=>[key,{from:draft[key as 'name']??'',to:patch[key]}]));
   if(!Object.keys(patch).length)return {...base,ok:true,status:'unchanged',name:draft.name,version:draft.version,message:`"${draft.name}" already reads that way.`};
   const later=isPublished(draft)?' The live graphic keeps its old wording until it is shipped again (batch_ship).':'';
   if(dryRun){const clash=typeof patch.name==='string'&&(names.draftNames(draft.id).has(normalizeGraphicName(patch.name))||names.publishedNames(draft.id).has(normalizeGraphicName(patch.name)));return {...base,ok:true,status:'planned',name:draft.name,version:draft.version,change,...(clash?{warning:`Another graphic is already called "${patch.name}".`}:{}),message:`Would rename "${draft.name}".${later}`}}
   const updated=await ctx.run('update_draft',{draftId:draft.id,expectedVersion:draft.version,patch},actor) as {draft:Draft;warnings?:unknown[]};
   return {...base,ok:true,status:'applied',name:updated.draft.name,version:updated.draft.version,change,...(updated.warnings?.length?{warnings:updated.warnings}:{}),message:`Renamed "${draft.name}".${later}`};
  }
  if(item.action==='style'){
   const {action,draftId,expectedVersion,...options}=item;void action;
   const planned=await ctx.run('style_draft',{draftId,expectedVersion,...options,dryRun},actor) as Record<string,unknown>&{draft:{version:number};applied:boolean};
   const {draft:after,dryRun:ignored,applied,...plan}=planned;void ignored;
   return {...base,ok:true,status:dryRun?'planned':applied?'applied':'unchanged',name:draft.name,version:after.version,...plan,message:dryRun?`Would restyle "${draft.name}".`:applied?`Restyled "${draft.name}"; it is not published until it is shipped.`:`"${draft.name}" already has that style.`};
  }
  if(draft.draftSetId)throw refuse(`"${draft.name}" is one part of a multipart set. Archive the whole set with archive_draft_set.`,'set_member_archive',409);
  if(draft.archivedAt)return {...base,ok:true,status:'unchanged',name:draft.name,version:draft.version,message:`"${draft.name}" is already archived.`};
  const stays=isPublished(draft)?' Its published graphic keeps playing; retire_cue takes it out of use.':'';
  if(dryRun)return {...base,ok:true,status:'planned',name:draft.name,version:draft.version,message:`Would archive "${draft.name}".${stays}`};
  const archived=await ctx.run('archive_draft',{draftId:draft.id,expectedVersion:draft.version},actor) as {draft:Draft};
  return {...base,ok:true,status:'applied',name:draft.name,version:archived.draft.version,message:`Archived "${draft.name}".${stays}`};
 }catch(error){return {...base,ok:false,status:'failed',error:failure(error)}}
}

async function batchUpdate(ctx:HygieneContext,input:{items:UpdateItem[];dryRun?:boolean},actor:string){
 const dryRun=input.dryRun??true,names=await libraryNames(ctx,await ctx.repo.listDrafts());
 const results:ItemResult[]=[];
 // One at a time and never stopping: a failed item is that item's result and the next one runs.
 for(const [index,item] of input.items.entries())results.push(await updateItem(ctx,item,index,dryRun,actor,names));
 const failed=results.filter(item=>!item.ok).length,done=results.filter(item=>item.status===(dryRun?'planned':'applied')).length;
 return {dryRun,[dryRun?'planned':'applied']:done,unchanged:results.filter(item=>item.status==='unchanged').length,failed,results,message:dryRun?`Dry run: ${done} of ${results.length} would change${failed?`, ${failed} would fail`:''}. Nothing was changed. Call again with dryRun:false to apply.`:`${done} of ${results.length} changed${failed?`, ${failed} failed (see each item's error)`:''}. Nothing was published.`};
}

/* ---------- batch_ship ---------- */

// maxDuration is 60 s. One ship_draft per item, and a new item starts only while the call is
// projected to finish inside this budget; the rest is handed back as a cursor for the next call.
export const BATCH_SHIP_BUDGET_MS=40_000;
// What a ship is assumed to take before one has been timed: a first server fit after a cold
// start measured 6.5 s locally (docs/MCP.md, A2), and a Vercel cold start was not measured.
export const BATCH_SHIP_ITEM_ESTIMATE_MS=10_000;
type ShipItem={draftId:string;expectedVersion:number;allowRename?:boolean};
const listFingerprint=(items:ShipItem[])=>createHash('sha256').update(JSON.stringify(items.map(item=>[item.draftId,item.expectedVersion,item.allowRename===true]))).digest('hex').slice(0,16);
function readCursor(cursor:string|undefined,items:ShipItem[]){
 if(cursor===undefined)return 0;
 const match=/^(\d+)\.([0-9a-f]{16})$/.exec(cursor);
 if(!match||match[2]!==listFingerprint(items))throw refuse('This cursor belongs to a different list of items. Pass exactly the items you started with, or leave cursor out to start again.','invalid_cursor');
 const index=Number(match[1]);if(index<1||index>=items.length)throw refuse('This cursor is past the end of the list: every item has been handled. Leave cursor out to start again.','invalid_cursor');
 return index;
}

async function shipDryRun(ctx:HygieneContext,items:ShipItem[]){
 const drafts=await ctx.repo.listDrafts(),names=await libraryNames(ctx,drafts),byId=new Map(drafts.map(draft=>[draft.id,draft]));
 const results:ItemResult[]=items.map((item,index)=>{
  const base={index,draftId:item.draftId},draft=byId.get(item.draftId);
  if(!draft)return {...base,ok:false,status:'failed',error:{code:'unknown_draft',message:`No draft in this library has the id ${item.draftId}.`}};
  if(draft.version!==item.expectedVersion)return {...base,ok:false,status:'failed',name:draft.name,error:{code:'version_conflict',message:`"${draft.name}" is at version ${draft.version}, not ${item.expectedVersion}.`}};
  if(isPublished(draft)&&draft.activeDraftVersion===draft.version)return {...base,ok:true,status:'already_published',name:draft.name,message:`"${draft.name}" is already live at this version; it would be skipped.`};
  const cue=cueOf(draft),validation=cue?previewValidation(cue):{valid:false,errors:['This draft cannot be built into a graphic as it stands.']};
  if(!validation.valid)return {...base,ok:true,status:'would_stop',stoppedAt:'validation',name:draft.name,message:`${validation.errors.join(' ')} It would not be published.`};
  if(names.publishedNames(draft.id).has(normalizeGraphicName(draft.name))&&!item.allowRename)return {...base,ok:true,status:'would_stop',stoppedAt:'duplicate_name',name:draft.name,message:`Another published graphic is already named "${draft.name}"; pass allowRename:true on this item to publish under a suggested name.`};
  return {...base,ok:true,status:'would_ship',name:draft.name,message:`"${draft.name}" would be fit-checked on the server and published if it passes.`};
 });
 const ready=results.filter(item=>item.status==='would_ship').length;
 return {dryRun:true,total:items.length,wouldShip:ready,results,message:`Dry run: ${ready} of ${items.length} would be fit-checked and published if they pass. Nothing was published. Call again with dryRun:false to ship.`};
}

async function batchShip(ctx:HygieneContext,input:{items:ShipItem[];cursor?:string;dryRun?:boolean},actor:string){
 const {items}=input;if(input.dryRun??true)return shipDryRun(ctx,items);
 const clock=ctx.now??Date.now,started=clock(),start=readCursor(input.cursor,items);
 const results:ItemResult[]=[];let slowest=0,next:number|null=null;
 for(let index=start;index<items.length;index++){
  const elapsed=clock()-started;
  if(index>start&&elapsed+Math.max(slowest,BATCH_SHIP_ITEM_ESTIMATE_MS)>BATCH_SHIP_BUDGET_MS){next=index;break}
  const item=items[index],base={index,draftId:item.draftId},begun=clock();
  try{
   const draft=await versioned(ctx,item.draftId,item.expectedVersion);
   // A resumed or repeated call does not publish the same version twice.
   if(isPublished(draft)&&draft.activeDraftVersion===draft.version){results.push({...base,ok:true,status:'already_published',shipped:false,name:draft.name,revision:draft.activeRevision,message:`"${draft.name}" was already live at this version; skipped.`});continue}
   const shipped=await ctx.run('ship_draft',{draftId:item.draftId,expectedVersion:item.expectedVersion,...(item.allowRename?{allowRename:true}:{})},actor) as Record<string,unknown>&{shipped:boolean};
   // The frame stays out: N images in one answer is what one ship_draft call per graphic is for.
   const {previewImage,review,...kept}=shipped;void previewImage;void review;
   results.push({...base,ok:true,status:shipped.shipped?'shipped':'stopped',...Object.fromEntries(Object.entries(kept).filter(([key])=>['shipped','stoppedAt','name','renamedFrom','revision','draftVersion','verdict','suggestedName','fitErrors','fitCheckUrl','imageStored','message'].includes(key)))});
  }catch(error){results.push({...base,ok:false,status:'failed',error:failure(error)})}
  finally{slowest=Math.max(slowest,clock()-begun)}
 }
 const shipped=results.filter(item=>item.status==='shipped').length,handled=(next??items.length)-start,remaining=items.length-(next??items.length);
 const nextCursor=next===null?null:`${next}.${listFingerprint(items)}`;
 return {dryRun:false,total:items.length,from:start,handled,shipped,stopped:results.filter(item=>item.status==='stopped').length,failed:results.filter(item=>item.status==='failed').length,remaining,done:next===null,nextCursor,liveCatalogChanged:shipped>0,results,
  message:`${shipped} of ${handled} shipped in this call${remaining?`; ${remaining} left. Call batch_ship again with the same items and cursor:'${nextCursor}' to continue`:''}. Items that stopped or failed published nothing; each says why.`};
}

/* ---------- batch_retire ---------- */

// G8 - many retire_cue calls in one: each applied item is retire_cue itself, and the dry run refuses
// with retire_cue's own sentences (lib/retire-rules.ts). A set member retires alone, as in retire_cue.
type RetireItem={draftId:string;expectedVersion:number};
type RetireStatus='retired'|'would-retire'|'already-retired'|'refused';
type RetireResult={index:number;draftId:string;expectedVersion:number;ok:boolean;status:RetireStatus;name?:string;version?:number;revision?:number|null;code?:string;reason:string;setWarning?:string};
const staleSentence=(draft:Draft,expected:number)=>`"${draft.name}" is at version ${draft.version}, not ${expected}: it changed since you read it. Read it again and retry this item.`;

async function batchRetire(ctx:HygieneContext,input:{items:RetireItem[];dryRun?:boolean},actor:string){
 const dryRun=input.dryRun??true,drafts=await ctx.repo.listDrafts(),byId=new Map(drafts.map(draft=>[draft.id,draft]));
 const listed=new Set(input.items.map(item=>item.draftId)),first=new Map<string,number>();
 const results:RetireResult[]=[];
 // One at a time and never stopping: a refused item is that item's result and the next one runs.
 for(const [index,item] of input.items.entries()){
  const base={index,draftId:item.draftId,expectedVersion:item.expectedVersion};
  const refused=(code:string,message:string,draft?:Draft):RetireResult=>({...base,ok:false,status:'refused',...(draft?{name:draft.name,version:draft.version}:{}),code,reason:`${message} Nothing was changed.`});
  if(first.has(item.draftId)){results.push(refused('duplicate_item',`This graphic is already item ${first.get(item.draftId)} of this call, and only that item runs.`));continue}
  first.set(item.draftId,index);
  try{
   // An apply reads each draft as it reaches it, so a change made meanwhile is this item's answer.
   const draft=dryRun?byId.get(item.draftId)??null:await ctx.repo.getDraft(item.draftId);
   if(!draft){const why=missingCueRefusal(item.draftId);results.push(refused(why.code,why.message));continue}
   // Already retired is done whatever version was read, so repeating an interrupted call is safe.
   if(isRetiredDraft(draft)){results.push({...base,ok:true,status:'already-retired',name:draft.name,version:draft.version,revision:draft.retired!.revision,reason:`"${draft.name}" is already retired; nothing to do.`});continue}
   if(draft.version!==item.expectedVersion){results.push(refused('version_conflict',staleSentence(draft,item.expectedVersion),draft));continue}
   if(!isPublished(draft)){const why=notPublishedRefusal(draft);results.push(refused(why.code,why.message,draft));continue}
   const others=draft.draftSetId?drafts.filter(other=>other.draftSetId===draft.draftSetId&&other.id!==draft.id&&isPublished(other)&&!listed.has(other.id)):[];
   const setWarning=others.length?{setWarning:`"${draft.name}" is part ${draft.setIndex??'?'} of a ${draft.setCount??'?'}-part set. Parts retire one at a time, and ${others.length} other published part${others.length===1?' is':'s are'} not in this call and stay${others.length===1?'s':''} live: ${quoted(others.map(other=>other.name))}. Add them to retire the whole set.`}:{};
   if(dryRun){results.push({...base,ok:true,status:'would-retire',name:draft.name,version:draft.version,revision:draft.activeRevision,...setWarning,reason:`"${draft.name}" would be retired: out of the live library, Companion's picker and the relay catalog.${draft.archivedAt?' It is archived in the editor and stays archived.':''}`});continue}
   const done=await ctx.run('retire_cue',{cueId:draft.id,expectedVersion:item.expectedVersion},actor) as {draft:Draft;cue:{revision:number|null};changed:boolean;message:string};
   results.push({...base,ok:true,status:done.changed?'retired':'already-retired',name:done.draft.name,version:done.draft.version,revision:done.cue.revision,...setWarning,reason:done.message});
  }catch(error){
   const why=failure(error),current=why.code==='version_conflict'?await ctx.repo.getDraft(item.draftId):null;
   results.push(refused(why.code,current?staleSentence(current,item.expectedVersion):why.message,current??byId.get(item.draftId)));
  }
 }
 const count=(status:RetireStatus)=>results.filter(item=>item.status===status).length;
 const done=count(dryRun?'would-retire':'retired'),already=count('already-retired'),refusedCount=count('refused'),rest=`${already?`, ${already} already retired`:''}${refusedCount?`, ${refusedCount} refused (each says why)`:''}`;
 return {dryRun,total:results.length,[dryRun?'wouldRetire':'retired']:done,alreadyRetired:already,refused:refusedCount,...(dryRun?{}:{liveCatalogChanged:done>0}),results,
  message:dryRun?`Dry run: ${done} of ${results.length} would be retired${rest}. Nothing was changed. Call again with dryRun:false to retire them.`:`${done} of ${results.length} retired${rest}. Retired graphics are out of the live library, Companion's picker and the relay catalog; one on screen now stays there until it is taken out, and restore_cue brings one back. find_catalog_issues (retired_in_service, retired_on_deck) lists services and deck keys that still use them.`};
}

/* ---------- batch_refit ---------- */

// G10 - after a branding change (typography.accentTitle, say) the stored fit verdicts of published
// graphics were measured under the old look, and batch_ship skips them as already published. This
// re-checks them without changing or publishing anything: per graphic, preview_draft and
// fit_check_draft with the frame, so a new preview carries the verdict and the frame, bound to the
// draft version and cue hash the live revision was published at. A graphic with unpublished
// changes is not the live graphic, so it is left to batch_ship.
//
// One server fit takes several seconds (6.5 s cold locally, docs/MCP.md A2) and maxDuration is 60 s,
// so an apply call measures at most BATCH_REFIT_PER_CALL graphics and starts a new one only while it
// is projected to finish inside BATCH_REFIT_BUDGET_MS; the rest come back as nextCursor. The stage
// has answered stage_unavailable after many checks in a row, so an unavailable verdict is retried
// once for that graphic before it is reported.
export const BATCH_REFIT_PER_CALL=25;
export const BATCH_REFIT_BUDGET_MS=40_000;
export const BATCH_REFIT_ITEM_ESTIMATE_MS=8_000;
type RefitItem={draftId:string;expectedVersion?:number};
type RefitInput={items?:RefitItem[];accentTitleOnly?:boolean;cursor?:string;dryRun?:boolean};
type RefitResult={index:number;draftId:string;ok:boolean;status:'would_refit'|'pass'|'fail'|'unavailable'|'skipped'|'failed';name?:string;[key:string]:unknown};
const hasAccentTitle=(draft:Draft)=>Boolean(draft.accentTitle?.trim());
const refitFingerprint=(items:RefitItem[],accentTitleOnly:boolean)=>createHash('sha256').update(JSON.stringify([accentTitleOnly,items.map(item=>[item.draftId,item.expectedVersion??null])])).digest('hex').slice(0,16);

/** The list a call works through: the items named, or every graphic whose live version is its draft, in id order. */
async function refitList(ctx:HygieneContext,input:RefitInput){
 if(input.items)return input.items;
 return (await ctx.repo.listDrafts()).filter(draft=>isPublished(draft)&&draft.activeDraftVersion===draft.version&&(!input.accentTitleOnly||hasAccentTitle(draft))).map(draft=>({draftId:draft.id})).sort((a,b)=>a.draftId<b.draftId?-1:a.draftId>b.draftId?1:0);
}

/** Why a graphic is not re-checked, or null when it is: the same sentence in a dry run and an apply. */
function refitSkip(draft:Draft|null,item:RefitItem,accentTitleOnly:boolean,live:Map<string,string>):{code:string;message:string}|null{
 if(!draft)return {code:'unknown_draft',message:`No draft in this library has the id ${item.draftId}. Check it with list_drafts.`};
 if(item.expectedVersion!==undefined&&draft.version!==item.expectedVersion)return {code:'version_conflict',message:`"${draft.name}" is at version ${draft.version}, not ${item.expectedVersion}: it changed since you read it. Read it again and retry this item.`};
 if(isRetiredDraft(draft))return {code:'retired',message:`"${draft.name}" is retired, so it is not in the live library to re-check.`};
 if(!isPublished(draft))return {code:'not_published',message:`"${draft.name}" has never been published; ship it with batch_ship, which fit-checks it first.`};
 if(draft.activeDraftVersion!==draft.version)return {code:'unpublished_changes',message:`"${draft.name}" has changes since it was published (draft version ${draft.version}, live version ${draft.activeDraftVersion}), so re-checking the draft would not check the live graphic. Ship it with batch_ship, which fit-checks what it publishes.`};
 if(accentTitleOnly&&!hasAccentTitle(draft))return {code:'no_accent_title',message:`"${draft.name}" has no accent title.`};
 // The draft is measured, so it must build into exactly the live graphic. One imported from the
 // built-in catalog (import_cue) or published by an older build may not, and batch_ship skips it.
 const cue=cueOf(draft);
 if(!cue||cueHash(cue)!==live.get(draft.id))return {code:'differs_from_live',message:`"${draft.name}" is live as a graphic that was not built from this draft as it stands (imported from the built-in catalog, or published by an older build), so re-checking the draft would not be the live graphic's verdict. Check it in the editor's Fit check instead.`};
 return null;
}

async function batchRefit(ctx:HygieneContext,input:RefitInput,actor:string){
 const dryRun=input.dryRun??true,accentTitleOnly=input.accentTitleOnly===true,items=await refitList(ctx,input),fingerprint=refitFingerprint(items,accentTitleOnly);
 // The live graphics' cue hashes, read once: what each re-check must match.
 const live=new Map((await ctx.repo.published()).map(cue=>[cue.id,cueHash(cue)]));
 if(!items.length)return {dryRun,total:0,results:[],done:true,nextCursor:null,message:`There is nothing to re-check: no published graphic${accentTitleOnly?' with an accent title':''} is live at its current draft version. Nothing was changed.`};
 let start=0;
 if(input.cursor!==undefined){
  const match=/^(\d+)\.([0-9a-f]{16})$/.exec(input.cursor);
  if(!match||match[2]!==fingerprint)throw refuse('This cursor belongs to a different list: pass exactly the items (or none) and accentTitleOnly you started with, or leave cursor out to start again. A graphic published or changed since the last call also changes the list. Nothing was changed.','invalid_cursor');
  start=Number(match[1]);if(start<1||start>=items.length)throw refuse('This cursor is past the end of the list: every graphic has been handled. Leave cursor out to start again. Nothing was changed.','invalid_cursor');
 }
 if(dryRun){
  const drafts=new Map((await ctx.repo.listDrafts()).map(draft=>[draft.id,draft]));
  const results:RefitResult[]=items.map((item,index)=>{
   const draft=drafts.get(item.draftId)??null,skip=refitSkip(draft,item,accentTitleOnly,live),base={index,draftId:item.draftId,...(draft?{name:draft.name}:{})};
   if(skip)return {...base,ok:skip.code!=='unknown_draft'&&skip.code!=='version_conflict',status:skip.code==='unknown_draft'||skip.code==='version_conflict'?'failed':'skipped',code:skip.code,message:skip.message};
   return {...base,ok:true,status:'would_refit',revision:draft!.activeRevision,message:`"${draft!.name}" would be measured again on the server; the new verdict and frame are stored with it. Nothing is published.`};
  });
  const would=results.filter(item=>item.status==='would_refit').length,skipped=results.filter(item=>item.status==='skipped').length,failed=results.filter(item=>item.status==='failed').length;
  const calls=Math.ceil(would/BATCH_REFIT_PER_CALL);
  return {dryRun:true,total:items.length,wouldRefit:would,skipped,failed,perCall:BATCH_REFIT_PER_CALL,results,
   message:`Dry run: ${would} of ${items.length} would be measured again${skipped?`, ${skipped} skipped`:''}${failed?`, ${failed} would fail`:''}. Nothing was changed. Call again with dryRun:false: each call measures up to ${BATCH_REFIT_PER_CALL} (fewer when the checks are slow, about 40 seconds a call), so ${would} take at least ${calls} call${calls===1?'':'s'} with the nextCursor each returns.`};
 }
 const clock=ctx.now??Date.now,started=clock(),results:RefitResult[]=[];
 let slowest=0,measured=0,next:number|null=null;
 for(let index=start;index<items.length;index++){
  if(measured>=BATCH_REFIT_PER_CALL||(measured>0&&clock()-started+Math.max(slowest,BATCH_REFIT_ITEM_ESTIMATE_MS)>BATCH_REFIT_BUDGET_MS)){next=index;break}
  const item=items[index],begun=clock();
  let base:{index:number;draftId:string;name?:string}={index,draftId:item.draftId};
  try{
   const draft=await ctx.repo.getDraft(item.draftId),skip=refitSkip(draft,item,accentTitleOnly,live);
   if(draft)base={...base,name:draft.name};
   if(skip){results.push({...base,ok:skip.code!=='unknown_draft'&&skip.code!=='version_conflict',status:skip.code==='unknown_draft'||skip.code==='version_conflict'?'failed':'skipped',code:skip.code,message:skip.message});continue}
   const revision=(await ctx.repo.revisions(draft!.id)).find(row=>row.revision===draft!.activeRevision);
   if(!revision){results.push({...base,ok:false,status:'failed',error:{code:'unknown_revision',message:`"${draft!.name}" names live revision ${draft!.activeRevision}, which could not be read. Nothing was changed.`}});continue}
   measured++;
   const preview=await ctx.run('preview_draft',{draftId:draft!.id,expectedVersion:draft!.version},actor) as {previewId:string;cueHash:string};
   const check=()=>ctx.run('fit_check_draft',{draftId:draft!.id,expectedVersion:draft!.version,previewId:preview.previewId,includePreviewImage:true},actor) as Promise<Record<string,unknown>&{verdict:string}>;
   let fit=await check(),retried=false;
   if(fit.verdict==='unavailable'){retried=true;fit=await check()}
   const where={revision:revision.revision,draftVersion:draft!.version,cueHash:preview.cueHash,previewId:preview.previewId,retried};
   if(fit.verdict==='unavailable'){results.push({...base,ok:false,status:'unavailable',...where,reason:fit.reason,message:`The server browser could not measure "${draft!.name}", twice. Its stored verdict is unchanged; run it again later or open Fit check.`});continue}
   results.push({...base,ok:true,status:fit.verdict==='pass'?'pass':'fail',...where,fitErrors:fit.fitErrors,warnings:fit.warnings,measuredAt:fit.measuredAt,imageStored:fit.imageStored===true,
    message:fit.verdict==='pass'?`"${draft!.name}" still fits.`:`"${draft!.name}" no longer fits: ${(fit.fitErrors as string[]).join(' ')} The live graphic is unchanged; fix the draft and ship it, or change the branding back.`});
  }catch(error){results.push({...base,ok:false,status:'failed',error:failure(error)})}
  finally{slowest=Math.max(slowest,clock()-begun)}
 }
 const count=(status:RefitResult['status'])=>results.filter(item=>item.status===status).length;
 const handled=(next??items.length)-start,remaining=items.length-(next??items.length),nextCursor=next===null?null:`${next}.${fingerprint}`;
 const [pass,fail,unavailable,skipped,failed]=[count('pass'),count('fail'),count('unavailable'),count('skipped'),count('failed')];
 return {dryRun:false,total:items.length,from:start,handled,measured:pass+fail+unavailable,pass,fail,unavailable,skipped,failed,retried:results.filter(item=>item.retried===true).length,remaining,done:next===null,nextCursor,liveCatalogChanged:false,results,
  message:`${pass+fail+unavailable} measured in this call: ${pass} pass, ${fail} fail${unavailable?`, ${unavailable} could not be measured`:''}${skipped?`; ${skipped} skipped`:''}${failed?`; ${failed} failed`:''}.${remaining?` ${remaining} left: call batch_refit again with the same items and accentTitleOnly and cursor:'${nextCursor}'.`:''} Nothing was published; each new verdict and frame is stored with the graphic's new preview.`};
}

/* ---------- supersede_cue ---------- */

const swap=(ids:string[],oldId:string,newId:string)=>[...new Set(ids.map(id=>id===oldId?newId:id))];
function repointService(service:PreparedService,oldId:string,newId:string){
 const entries:CollectionEntry[]=service.entries.map(entry=>entry.cueIds.includes(oldId)?{...entry,cueIds:swap(entry.cueIds,oldId,newId)}:entry);
 const coverage:CoverageItem[]=service.coverage.map(item=>item.cueId===oldId?{...item,cueId:newId}:item);
 const rows=service.rows.map(row=>row.candidateCueIds.includes(oldId)?{...row,candidateCueIds:swap(row.candidateCueIds,oldId,newId)}:row);
 const changes={entries:service.entries.filter(entry=>entry.cueIds.includes(oldId)).map(entry=>({entryId:entry.id,label:entry.label})),coverage:service.coverage.filter(item=>item.cueId===oldId).map(item=>({coverageId:item.id,label:item.label})),candidates:service.rows.filter(row=>row.candidateCueIds.includes(oldId)).map(row=>({rowId:row.id,label:row.label}))};
 return {entries,coverage,rows,changes,changed:Boolean(changes.entries.length||changes.coverage.length||changes.candidates.length)};
}

async function supersede(ctx:HygieneContext,input:{old:string;new:string;expectedVersion:number;dryRun?:boolean},actor:string){
 const dryRun=input.dryRun??true,oldId=input.old,newId=input.new;
 if(oldId===newId)throw refuse('old and new are the same graphic. Name the graphic being replaced as old and its replacement as new.');
 const old=await ctx.repo.getDraft(oldId);
 if(!old){if(baselineCatalogForWorkspace().some(cue=>cue.id===oldId))throw refuse(`${oldId} is a built-in graphic with no draft in this library yet. Import it first (import_cue), then supersede the imported draft.`,'not_a_draft',409);throw refuse(`No graphic in this library has the id ${oldId}. Check the id with list_catalog.`,'unknown_cue',404)}
 if(old.version!==input.expectedVersion)throw refuse(`"${old.name}" is at version ${old.version}, not ${input.expectedVersion}: it changed since you read it. Nothing was changed. Read it again and retry.`,'version_conflict',409);
 const alreadyRetired=isRetiredDraft(old);
 if(!alreadyRetired&&!isPublished(old))throw refuse(`"${old.name}" has never been published, so nothing can be bound to it. Nothing was changed. Archive it instead (archive_draft).`,'not_published',409);
 const manager=await servicesManager(ctx);
 let catalog:{id:string;name:string}[],services:PreparedService[];
 try{[{cues:catalog},services]=await Promise.all([manager.publishedEvidence(),manager.listServices(true)])}
 catch(error){throw refuse(`Prepared services could not be read (${failure(error).message}). Nothing was changed.`,'services_unavailable',503)}
 const replacement=catalog.find(cue=>cue.id===newId);
 if(!replacement)throw refuse(`${newId} is not a published graphic in the live library, so nothing can be moved onto it. Nothing was changed. Publish it first (ship_draft) or check the id with list_catalog.`,'replacement_not_published',409);
 const plans=services.map(service=>({service,...repointService(service,oldId,newId)})).filter(plan=>plan.changed);
 const stored=ctx.deck?await ctx.deck.repository.get(ctx.deck.workspace):null;
 const keys=stored?cueButtons(stored.deck).filter(({spec})=>spec.cueId===oldId).map(({page,button,spec})=>({page:page.number,pageName:page.name,row:button.row,col:button.col,label:spec.label})):[];
 const deck=stored?{checked:true,version:stored.version,buttons:keys}:{checked:false,buttons:[],message:'No Companion deck is stored for this congregation yet, so no deck keys were checked or moved.'};
 const serviceReport=plans.map(plan=>({serviceId:plan.service.id,name:plan.service.name,archived:plan.service.archived,version:plan.service.version,...plan.changes}));
 const retireStep=alreadyRetired?{needed:false,message:`"${old.name}" is already retired.`}:{needed:true};
 const summary=`${serviceReport.length} service${serviceReport.length===1?'':'s'} and ${keys.length} deck key${keys.length===1?'':'s'}`;
 if(dryRun)return {dryRun:true,old:{id:old.id,name:old.name,version:old.version,retired:alreadyRetired},new:{id:replacement.id,name:replacement.name},services:serviceReport,deck,retire:retireStep,message:`Dry run: ${summary} would move from "${old.name}" to "${replacement.name}"${alreadyRetired?'':`, then "${old.name}" would be retired`}. Row and key labels are left as they are. Nothing was changed. Call again with dryRun:false to apply.`};
 // Services first, then the deck, then the retire, as the order asks; each write takes the
 // version it was read at, so a change made meanwhile fails that write and the report says so.
 const servicesDone:unknown[]=[],problems:string[]=[];
 for(const plan of plans){
  try{const saved=await manager.updateCollection({id:plan.service.id,expectedVersion:plan.service.version,entries:plan.entries,coverage:plan.coverage},actor,{rows:plan.rows}) as unknown as PreparedService;servicesDone.push({serviceId:saved.id,name:saved.name,archived:saved.archived,version:saved.version,...plan.changes,ok:true})}
  catch(error){const why=failure(error);servicesDone.push({serviceId:plan.service.id,name:plan.service.name,ok:false,error:why});problems.push(`the service "${plan.service.name}" was not changed (${why.message})`)}
 }
 let deckDone:Record<string,unknown>=deck;
 if(stored&&keys.length){
  const next=structuredClone(stored.deck);for(const {spec} of cueButtons(next))if(spec.cueId===oldId)spec.cueId=newId;
  try{const saved=await ctx.deck!.repository.replace(ctx.deck!.workspace,next,stored.version,actor,(ctx.now??Date.now)());deckDone={...deck,ok:true,version:saved.version}}
  catch(error){const why=failure(error);deckDone={...deck,ok:false,error:why};problems.push(`the deck was not changed (${why.message})`)}
 }
 let retire:Record<string,unknown>=retireStep;
 if(!alreadyRetired){
  try{const done=await ctx.run('retire_cue',{cueId:oldId,expectedVersion:old.version},actor) as {cue:unknown;message:string};retire={needed:true,ok:true,cue:done.cue,message:done.message}}
  catch(error){const why=failure(error);retire={needed:true,ok:false,error:why};problems.push(`"${old.name}" was not retired (${why.message})`)}
 }
 return {dryRun:false,old:{id:old.id,name:old.name},new:{id:replacement.id,name:replacement.name},services:servicesDone,deck:deckDone,retire,liveCatalogChanged:retire.ok===true,complete:!problems.length,
  message:problems.length?`Partly done: ${problems.join('; ')}. Everything else moved to "${replacement.name}". Run supersede_cue again (dry run first) to finish.`:`${summary} now use "${replacement.name}"${alreadyRetired?'':`, and "${old.name}" is retired`}. Row and key labels were left as they were.`};
}

/* ---------- the one entry point ---------- */

export async function hygieneOperation(operation:HygieneToolName,raw:unknown,actor:string,ctx:HygieneContext):Promise<unknown>{
 const parsed=hygieneToolSchemas()[operation].safeParse(raw);
 if(!parsed.success)throw refuse(`The ${operation} input is not valid: ${parsed.error.issues.map(issue=>`${issue.path.join('.')||'input'} ${issue.message}`).join('; ')}.`);
 const input=parsed.data as never;
 if(operation==='find_catalog_issues')return findIssues(ctx,input);
 if(operation==='batch_update')return batchUpdate(ctx,input,actor);
 if(operation==='batch_ship')return batchShip(ctx,input,actor);
 if(operation==='batch_retire')return batchRetire(ctx,input,actor);
 if(operation==='batch_refit')return batchRefit(ctx,input,actor);
 return supersede(ctx,input,actor);
}
