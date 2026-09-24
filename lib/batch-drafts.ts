import {randomUUID} from 'node:crypto';
import type {z} from 'zod/v4';
import {AuthoringError,draftSetSelections,type AuthoringSource,type Draft,type SourceBlock} from './authoring-model';
import type {BuildKeyKind,BuildKeyRepository} from './build-keys';
import {isLocalSourceId} from './local-sources';
import {BATCH_DRAFTS_MAX_ITEMS,batchCreateDraftsSchema,type BatchDraftsInput,type Mode} from './batch-drafts-schema';

/**
 * G4 - batch_create_drafts: a build plan's drafts in one call. Each item names its own stable key
 * and becomes one draft or one set through the operations that already exist: a source draft and a
 * slide are create_draft, each panel of a set is create_draft and the panels are then stored as one
 * set (the create_source_draft_set shape: names "— 01 of 03", one manifest), and a shared-library
 * copy is customize_shared_batch with one item. So validation, pins and house defaults are theirs.
 *
 * Idempotent by key: a key recorded here (lib/build-keys.ts) whose draft or set is still live is
 * "exists", and nothing is made. Per-item results; a refused item never stops the rest. The result
 * ends with a batch_ship input naming every draft made or found, so the caller ships in one call.
 */
type Input=BatchDraftsInput;
type Item=Input['items'][number];
type SourceItem=Extract<Item,{type:'source'}>|Extract<Item,{type:'set'}>;

export type BatchDraftsDeps={
 /** The authoring service's own dispatcher (lib/authoring.ts execute). */
 run:(operation:string,input:unknown,actor:string,internal?:{dryRun?:boolean})=>Promise<unknown>;
 drafts:()=>Promise<Draft[]>;insertDraftSet:(drafts:Draft[])=>Promise<Draft[]>;
 buildKeys:BuildKeyRepository;workspaceId:string;
 /** A corpus or local source with its derived blocks, as create_draft reads it. */
 source:(sourceId:string)=>Promise<AuthoringSource|undefined>;
 now?:()=>number;
};
type Member={draftId:string;version:number};
type Result={item:number;key:string;type:Item['type'];status:'created'|'exists'|'refused'|'would-create';draftId?:string;setId?:string;version?:number;drafts?:Member[];reason?:string;warnings?:unknown[];houseDefaults?:unknown;notes?:string[]};

const refuse=(message:string):never=>{throw new AuthoringError('invalid_input',message)};
const issueText=(error:z.ZodError)=>error.issues.map(issue=>`${issue.path.length?`${issue.path.join('.')}: `:''}${issue.message}`).join('; ');
const pad=(value:number,width:number)=>String(value).padStart(width,'0');

/**
 * One panel's block ids and content, resolved against the source's actual blocks. A block id that is
 * not the named source's may name another unit by its own prefix (`<sourceId>#block-n`): create_draft
 * takes groups from several sources, so a chatimah from the next unit rides in the same graphic.
 */
async function panelContent(item:SourceItem,source:AuthoringSource,selection:{blockIds?:string[];blocks?:number[]},label:string,lookup:(sourceId:string)=>Promise<AuthoringSource|undefined>){
 if((selection.blockIds===undefined)===(selection.blocks===undefined))refuse(`${label} needs exactly one of blockIds (ids from search_sources) or blocks (a local source's block positions).`);
 let ids=selection.blockIds;
 if(selection.blocks){
  if(!isLocalSourceId(source.id))refuse(`${label} names blocks by position, which works for a local source only. For ${source.id} pass blockIds from search_sources (includeBlocks:true).`);
  const stored=new Set(source.blocks.flatMap(block=>/#block-(\d+)$/.exec(block.id)?.[1]??[]));
  ids=selection.blocks.map(position=>{const blockId=`${source.id}#block-${position}`;if(!source.blocks.some(block=>block.id===blockId))refuse(`${label} names block ${position}, but "${source.name}" has blocks 0 to ${stored.size-1}. Nothing was created for this item.`);return blockId});
 }
 const selected:{sourceId:string;block:SourceBlock}[]=[];
 for(const blockId of ids!){
  const own=source.blocks.find(block=>block.id===blockId);if(own){selected.push({sourceId:source.id,block:own});continue}
  const prefix=blockId.slice(0,blockId.lastIndexOf('#')),other=prefix&&prefix!==source.id?await lookup(prefix):undefined,found=other?.blocks.find(block=>block.id===blockId);
  if(!other||!found)refuse(`Block ${blockId} does not belong to ${source.id}. search_sources with includeBlocks:true lists its block ids. Nothing was created for this item.`);
  selected.push({sourceId:other!.id,block:found!});
 }
 // A translation block rides with the blocks it translates: naming one asks for the translation.
 const primary=selected.filter(({block})=>block.kind!=='translation-en'),translated=primary.length<selected.length;
 if(!primary.length)refuse(`${label} names only translation blocks. Name the Hebrew blocks they translate, with includeTranslation:true.`);
 const kinds=[...new Set(primary.map(({block})=>block.kind))];
 const mode:Mode=item.mode??(kinds.length===1&&kinds[0]==='bilingual'?'bilingual':kinds.length===1&&kinds[0]==='original-en'?'original-en':kinds.length===1&&kinds[0]==='source-en'?'source-en':refuse(`${label} mixes ${kinds.map(kind=>kind==='bilingual'?'paired Hebrew and transliteration':kind==='original-en'?'English-only':kind==='source-en'?'source English':kind).join(' and ')} blocks, and one graphic shows one kind. Split them into separate panels (a set), or pass mode. Nothing was created for this item.`));
 // Consecutive blocks of one source share a group, in the order given.
 const groups:{sourceId:string;blockIds:string[]}[]=[];for(const {sourceId,block} of primary){const last=groups.at(-1);if(last?.sourceId===sourceId)last.blockIds.push(block.id);else groups.push({sourceId,blockIds:[block.id]})}
 if(mode==='bilingual'){const includeTranslation=item.includeTranslation??(translated||undefined);return {mode,content:{mode,hebrewGroups:groups,transliterationGroups:structuredClone(groups),...(includeTranslation!==undefined?{includeTranslation}:{}),...(item.arrangement?{arrangement:item.arrangement}:{}),...(item.rowOrder?{rowOrder:item.rowOrder}:{})}}}
 if(item.includeTranslation||item.arrangement||item.rowOrder)refuse(`${label} is ${mode} text; includeTranslation, arrangement and rowOrder apply to Hebrew and transliteration only. Leave them out for this item.`);
 const englishGroups=primary.length<=24?primary.map(({sourceId,block})=>({sourceId,blockIds:[block.id]})):groups;
 return {mode,content:{mode,englishGroups}};
}

const draftFieldsOf=(item:Exclude<Item,{type:'customize_shared'}>,name:string)=>({name,title:item.title,...(item.accentTitle!==undefined?{accentTitle:item.accentTitle}:{}),layout:item.layout,...(item.templateCueId?{templateCueId:item.templateCueId}:{}),...(item.textSize?{textSize:item.textSize}:{})});

export async function batchCreateDrafts(data:Record<string,unknown>,who:string,deps:BatchDraftsDeps){
 const now=deps.now??Date.now;
 const extra=Object.keys(data).filter(field=>!['items','applyDefaults','dryRun'].includes(field));if(extra.length)refuse(`batch_create_drafts takes items, applyDefaults and dryRun, not ${extra.join(', ')}. Nothing was changed.`);
 if(!Array.isArray(data.items)||!data.items.length)refuse(`items must list 1 to ${BATCH_DRAFTS_MAX_ITEMS} drafts to make, each with a key and a type (source, set, slide or customize_shared). Nothing was changed.`);
 const rawItems=data.items as unknown[];
 if(rawItems.length>BATCH_DRAFTS_MAX_ITEMS)throw new AuthoringError('batch_too_large',`batch_create_drafts makes at most ${BATCH_DRAFTS_MAX_ITEMS} items per call, and this one has ${rawItems.length}. Nothing was changed. Send the first ${BATCH_DRAFTS_MAX_ITEMS}, then the rest in another call; keys already made are reported as exists, so sending one twice is safe.`,400);
 if(data.dryRun!==undefined&&typeof data.dryRun!=='boolean')refuse('dryRun must be true or false. Nothing was changed.');
 if(data.applyDefaults!==undefined&&typeof data.applyDefaults!=='boolean')refuse('applyDefaults must be true or false. Nothing was changed.');
 const dryRun=data.dryRun!==false,applyAll=data.applyDefaults as boolean|undefined;
 const itemSchema=batchCreateDraftsSchema().shape.items.element;
 const drafts=await deps.drafts(),live=(draftId:string)=>drafts.find(draft=>draft.id===draftId&&!draft.archivedAt);
 const liveSet=(setId:string)=>drafts.filter(draft=>draft.draftSetId===setId&&!draft.archivedAt).sort((a,b)=>(a.setIndex??0)-(b.setIndex??0));
 const results:Result[]=[],seen=new Map<string,number>();let keyFailure:string|null=null;
 for(const [index,raw] of rawItems.entries()){
  const rawKey=(raw as {key?:unknown}|null)?.key,rawType=(raw as {type?:unknown}|null)?.type;
  const head={item:index+1,key:typeof rawKey==='string'?rawKey:'',type:(typeof rawType==='string'?rawType:'') as Item['type']};
  const refused=(reason:string)=>{results.push({...head,status:'refused',reason})};
  const parsed=itemSchema.safeParse(raw);
  if(!parsed.success){refused(`Item ${index+1} is not a draft this tool can make (${issueText(parsed.error)}). Nothing was created for it.`);continue}
  const item=parsed.data;
  const repeated=seen.get(item.key);if(repeated!==undefined){refused(`This repeats item ${repeated}'s key "${item.key}"; each key makes one thing. Nothing was created for it.`);continue}seen.set(item.key,index+1);
  if(keyFailure){refused(keyFailure);continue}
  const kind:BuildKeyKind=item.type==='set'||(item.type==='customize_shared'&&item.setId!==undefined)?'draft-set':'draft',other:BuildKeyKind=kind==='draft'?'draft-set':'draft';
  try{
   // Idempotency first: a live target under this key is the answer, whatever the item now says.
   const [recorded,crossed]=await Promise.all([deps.buildKeys.get(kind,item.key),deps.buildKeys.get(other,item.key)]);
   if(crossed&&(other==='draft'?live(crossed.targetId):liveSet(crossed.targetId).length)){refused(`The key "${item.key}" already names a ${other==='draft'?'single graphic':'set'} here (${crossed.targetId}), and this item makes a ${kind==='draft'?'single graphic':'set'}. Use another key, or archive that one first. Nothing was created for this item.`);continue}
   if(recorded){
    if(kind==='draft'){const draft=live(recorded.targetId);if(draft){results.push({...head,status:'exists',draftId:draft.id,version:draft.version});continue}}
    else{const members=liveSet(recorded.targetId);if(members.length){results.push({...head,status:'exists',setId:recorded.targetId,drafts:members.map(draft=>({draftId:draft.id,version:draft.version}))});continue}}
   }
   const applyDefaults=item.applyDefaults??applyAll;
   const record=async(targetId:string)=>{if(dryRun)return;try{await deps.buildKeys.put({workspaceId:deps.workspaceId,kind,key:item.key,targetId,createdBy:who,createdAt:now(),updatedAt:now()})}catch(error){if(!(error instanceof AuthoringError))throw error;keyFailure=`${error.message} Items after the first failure were not attempted, so no draft was made without its key.`;return error.message}};
   if(item.type==='customize_shared'){
    if((item.cueId===undefined)===(item.setId===undefined)){refused('A customize_shared item needs exactly one of cueId (one graphic) or setId (a whole multipart prayer). Nothing was created for this item.');continue}
    const copy={...(item.cueId?{cueId:item.cueId}:{setId:item.setId}),...(item.expectedCueHash?{expectedCueHash:item.expectedCueHash}:{}),...(item.expectedCueHashes?{expectedCueHashes:item.expectedCueHashes}:{}),...(item.name?{name:item.name}:{})};
    const batch=await deps.run('customize_shared_batch',{items:[copy],dryRun,...(applyDefaults!==undefined?{applyDefaults}:{})},who) as {items:{status:string;reason?:string;draftIds?:string[];setId?:string;houseDefaults?:unknown;notes?:string[]}[]};
    const copied=batch.items[0],extras={...(copied.houseDefaults?{houseDefaults:copied.houseDefaults}:{}),...(copied.notes?.length?{notes:copied.notes}:{})};
    if(copied.status==='refused'){refused(`${copied.reason} Nothing was created for this item.`);continue}
    if(copied.status==='would-create'){results.push({...head,status:'would-create',...extras});continue}
    // created, or already-copied from this exact upstream version: either way this key now names it.
    const made=copied.status==='created',ids=copied.draftIds??[];
    const found=made?null:ids.map(draftId=>live(draftId)).filter((draft):draft is Draft=>Boolean(draft));
    const setId=kind==='draft-set'?copied.setId??found?.[0]?.draftSetId:undefined,versions=(draftIds:string[])=>draftIds.map(draftId=>({draftId,version:found?.find(draft=>draft.id===draftId)?.version??1}));
    const failure=await record(setId??ids[0]);
    results.push({...head,status:made?'created':'exists',...(kind==='draft'?{draftId:ids[0],version:versions(ids)[0].version}:{setId,drafts:versions(ids)}),...extras,...(failure?{reason:`Made, but its key was not recorded: ${failure}`}:{})});
    continue;
   }
   const name=item.name??item.title.slice(0,80).trim();
   if(item.type==='slide'){
    const created=await deps.run('create_draft',{...draftFieldsOf(item,name),content:{mode:'custom',text:item.text},presentation:{...item.presentation,...(item.imageAssetId?{imageAssetId:item.imageAssetId}:{})},...(applyDefaults!==undefined?{applyDefaults}:{})},who,{dryRun}) as {draft:Draft;warnings?:unknown[];houseDefaults?:unknown};
    const failure=await record(created.draft.id);
    results.push({...head,status:dryRun?'would-create':'created',...(dryRun?{}:{draftId:created.draft.id,version:created.draft.version}),...(created.warnings?.length?{warnings:created.warnings}:{}),...(created.houseDefaults?{houseDefaults:created.houseDefaults}:{}),...(failure?{reason:`Made, but its key was not recorded: ${failure}`}:{})});
    continue;
   }
   // A source draft or a set: the source by id or by its local-source key.
   if((item.sourceId===undefined)===(item.sourceKey===undefined)){refused('Name the source with sourceId (a corpus id or local: id) or sourceKey (the key import_local_sources recorded), not both. Nothing was created for this item.');continue}
   let sourceId=item.sourceId;
   if(item.sourceKey){const local=await deps.buildKeys.get('local-source',item.sourceKey);if(!local){refused(`No local source has the key "${item.sourceKey}" here. Import it with import_local_sources first, or pass its sourceId. Nothing was created for this item.`);continue}sourceId=local.targetId}
   const source=await deps.source(sourceId!);
   if(!source){refused(`There is no source ${sourceId} here. search_sources or list_local_sources names them. Nothing was created for this item.`);continue}
   const create=(content:unknown,draftName:string,dry:boolean)=>deps.run('create_draft',{...draftFieldsOf(item,draftName),content,...(item.presentation?{presentation:item.presentation}:{}),...(applyDefaults!==undefined?{applyDefaults}:{})},who,{dryRun:dry}) as Promise<{draft:Draft;warnings?:unknown[];houseDefaults?:unknown}>;
   if(item.type==='source'){
    const created=await create((await panelContent(item,source,item,'This item',deps.source)).content,name,dryRun);
    const failure=await record(created.draft.id);
    results.push({...head,status:dryRun?'would-create':'created',...(dryRun?{}:{draftId:created.draft.id,version:created.draft.version}),...(created.warnings?.length?{warnings:created.warnings}:{}),...(created.houseDefaults?{houseDefaults:created.houseDefaults}:{}),...(failure?{reason:`Made, but its key was not recorded: ${failure}`}:{})});
    continue;
   }
   // A set: every panel is built and checked by create_draft without storing it, then all of them are stored as one set or none.
   const count=item.panels.length,width=Math.max(2,String(count).length),setId=randomUUID();
   const built=[];for(const [position,panel] of item.panels.entries()){const {content}=await panelContent(item,source,panel,`Panel ${position+1}`,deps.source);built.push(await create(content,`${name.slice(0,80-(width*2+6)).trimEnd()} — ${pad(position+1,width)} of ${pad(count,width)}`,true))}
   let members=built.map((result,position)=>({...result.draft,draftSetId:setId,setIndex:position+1,setCount:count}) satisfies Draft);
   const draftSetManifest={version:1 as const,selections:members.flatMap(draft=>draftSetSelections(draft.content,draft.sourceSnapshots))};members=members.map(draft=>({...draft,draftSetManifest:structuredClone(draftSetManifest)}));
   const warnings=built.flatMap(result=>result.warnings??[]),report=built.find(result=>result.houseDefaults)?.houseDefaults;
   if(dryRun){results.push({...head,status:'would-create',...(warnings.length?{warnings}:{}),...(report?{houseDefaults:report}:{})});continue}
   const inserted=await deps.insertDraftSet(members);
   const failure=await record(setId);
   results.push({...head,status:'created',setId,drafts:inserted.map(draft=>({draftId:draft.id,version:draft.version})),...(warnings.length?{warnings}:{}),...(report?{houseDefaults:report}:{}),...(failure?{reason:`Made, but its key was not recorded: ${failure}`}:{})});
  }catch(error){if(error instanceof AuthoringError){refused(/Nothing was (changed|created)/.test(error.message)?error.message:`${error.message.replace(/\.?$/,'.')} Nothing was created for this item.`);continue}throw error}
 }
 const count=(status:Result['status'])=>results.filter(result=>result.status===status).length,made=count(dryRun?'would-create':'created'),exists=count('exists'),refusedCount=count('refused');
 const ship=results.flatMap(result=>result.drafts??(result.draftId?[{draftId:result.draftId,version:result.version!}]:[])).map(member=>({draftId:member.draftId,expectedVersion:member.version}));
 const chunks:{items:typeof ship;dryRun:false}[]=[];for(let offset=0;offset<ship.length;offset+=200)chunks.push({items:ship.slice(offset,offset+200),dryRun:false});
 const message=dryRun?`Dry run: ${made} would be created, ${exists} already ${exists===1?'exists':'exist'}, ${refusedCount} refused. Nothing was changed. To create them, call again with the same items and dryRun:false.`:`${made} created as unpublished drafts, ${exists} already existed, ${refusedCount} refused. Nothing was published; pass batchShip to batch_ship to publish them.`;
 return {dryRun,message,counts:{[dryRun?'wouldCreate':'created']:made,exists,refused:refusedCount},items:results,...(chunks.length?{batchShip:chunks[0]}:{}),...(chunks.length>1?{batchShipMore:chunks.slice(1)}:{}),...(dryRun&&chunks.length?{note:'batchShip names only the drafts that already exist; run with dryRun:false for the rest.'}:{})};
}
