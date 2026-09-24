import {randomUUID} from 'node:crypto';
import type {z} from 'zod/v4';
import {friendlyCueName} from './cue-search';
import {namesPages,type NamesList} from './names-list';
import {ServicesError,ServicesManager,servicesOperation,type CollectionEntry,type CoverageItem,type CoverageStatus,type PreparedService,type ServiceOrigin,type ServiceRow,type ServicesLoaders,type ServicesRepository} from './service-collections';
import {isServiceTool,serviceToolSchemas,type ServiceToolName} from './service-tool-schemas';

/**
 * S2 (R-S2, R-S3) - the prepared-services MCP tools. Every change is computed here from the
 * service as stored and written through `ServicesManager.updateCollection` (or, for names and
 * archiving, through `servicesOperation`, which also refreshes the live library), so the web's
 * validation, its optimistic version and its on-air refusal apply unchanged. `rows[]` is the
 * spine the tools address; entries and coverage follow the rows' order when written.
 *
 * Nothing here publishes a graphic or issues a live command.
 */
export {isServiceTool};
export type ServiceToolContext={repository?:ServicesRepository;loaders?:ServicesLoaders};
export type Readiness='covered'|'needs-review'|'needs-a-graphic'|'not-needed';

type Row=ServiceRow;
type CueInfo={id:string;name:string};
const UNRESOLVED:CoverageStatus[]=['needs-cue','needs-review','intentional-fallback'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const refuse=(message:string,code='invalid_input',status=400)=>new ServicesError(code,message,status);
const plainEntry=({id,type,label,cueIds}:CollectionEntry):CollectionEntry=>({id,type,label,cueIds:[...cueIds]});
function plainCoverage(item:CoverageItem):CoverageItem{const {id,label,status,cueId,sourceId,owner,reason}=item;return {id,label,status,...(cueId?{cueId}:{}),...(sourceId?{sourceId}:{}),...(owner?{owner}:{}),...(reason?{reason}:{})}}
const plainRow=(row:Row):Row=>({...row,candidateCueIds:[...row.candidateCueIds]});

/** Which state a row is in and the one thing to do next, from the stored decision and what is published now. */
function readinessOf(row:Row,entry:CollectionEntry|undefined,item:CoverageItem|undefined,published:Map<string,CueInfo>):{readiness:Readiness;next:string|null}{
 const missing=[...(entry?.cueIds??[]),...(item?.cueId?[item.cueId]:[])].filter(id=>!published.has(id));
 if(item){
  if(item.status==='covered'){if(!missing.length)return {readiness:'covered',next:null};return {readiness:'needs-review',next:`Its graphic ${missing[0]} is no longer published. Pick another with swap_graphic or resolve_coverage_row.`}}
  if(item.status==='needs-review')return {readiness:'needs-review',next:row.candidateCueIds.length?`Choose one of its ${row.candidateCueIds.length} candidates with resolve_coverage_row (rowId '${row.id}', cueId).`:'Pick a published graphic with resolve_coverage_row, or record that none is needed with set_coverage_row (status not-needed and a reason).'};
  if(item.status==='needs-cue')return {readiness:'needs-a-graphic',next:'No published graphic covers this. Make one (search_sources, create_draft, then publish it) and attach it with resolve_coverage_row; or record that none is needed with set_coverage_row (status not-needed and a reason).'};
  return {readiness:'not-needed',next:null};
 }
 if(entry&&missing.length)return {readiness:'needs-review',next:`Its graphic ${missing[0]} is no longer published. Replace it with swap_graphic or remove it with remove_entry.`};
 return {readiness:'covered',next:null};
}

type Loaded={current:PreparedService;published:Map<string,CueInfo>;manager:ServicesManager};
async function load(manager:ServicesManager,serviceId:string):Promise<Loaded>{
 const [current,{cues}]=await Promise.all([manager.requireService(serviceId),manager.publishedEvidence()]);
 return {current,manager,published:new Map(cues.map(cue=>[cue.id,{id:cue.id,name:friendlyCueName(cue.name)}]))};
}
function checkVersion(current:PreparedService,expected:number){
 if(current.version!==expected)throw refuse(`This service is at version ${current.version}, not ${expected}; it changed since you read it. Nothing was changed. Call get_service for the current version and try again.`,'version_conflict',409);
}

function namesSummary(names:NamesList|null|undefined){return names?{title:names.title,layout:names.layout,perPanel:names.perPanel,count:names.rows.length,panels:namesPages(names).length}:null}
function counts(service:PreparedService,published:Map<string,CueInfo>){
 const tally={rows:service.rows.length,covered:0,needsReview:0,needsAGraphic:0,notNeeded:0};
 const entries=new Map(service.entries.map(entry=>[entry.id,entry])),coverage=new Map(service.coverage.map(item=>[item.id,item]));
 for(const row of service.rows){const {readiness}=readinessOf(row,row.entryId?entries.get(row.entryId):undefined,row.coverageId?coverage.get(row.coverageId):undefined,published);if(readiness==='covered')tally.covered++;else if(readiness==='needs-review')tally.needsReview++;else if(readiness==='needs-a-graphic')tally.needsAGraphic++;else tally.notNeeded++}
 return tally;
}
function compactRows(service:PreparedService,published:Map<string,CueInfo>){
 const entries=new Map(service.entries.map(entry=>[entry.id,entry])),coverage=new Map(service.coverage.map(item=>[item.id,item]));
 const cue=(id:string)=>({cueId:id,name:published.get(id)?.name??id,available:published.has(id)});
 return service.rows.map((row,index)=>{
  const entry=row.entryId?entries.get(row.entryId):undefined,item=row.coverageId?coverage.get(row.coverageId):undefined,{readiness,next}=readinessOf(row,entry,item,published);
  return {rowId:row.id,index,label:row.label,readiness,...(next?{next}:{}),
   ...(entry?{entry:{entryId:entry.id,type:entry.type,graphics:entry.cueIds.map(cue)}}:{}),
   ...(item?{coverage:{coverageId:item.id,status:item.status,...(item.cueId?{cueId:item.cueId}:{}),...(item.sourceId?{sourceId:item.sourceId}:{}),...(item.owner?{owner:item.owner}:{}),...(item.reason?{reason:item.reason}:{})}}:{}),
   ...(row.candidateCueIds.length?{candidates:row.candidateCueIds.map(cue)}:{}),
   ...(row.setlistPosition!==undefined?{setlistPosition:row.setlistPosition}:{}),...(row.trackId?{trackId:row.trackId}:{}),
   ...(row.buttonLabel?{buttonLabel:row.buttonLabel}:{}),...(row.camera?{camera:row.camera}:{}),...(row.note?{note:row.note}:{})};
 });
}
/** R-S3 - what a deck button generated from this service sends as `serviceRef`, so the cue log attributes it. The command route accepts a UUID only. */
const serviceRef=(service:PreparedService)=>UUID.test(service.id)?service.id:null;
function header(service:PreparedService){return {serviceId:service.id,version:service.version,name:service.name,service:service.service,archived:service.archived,serviceRef:serviceRef(service),origin:service.origin,updatedAt:service.updatedAt}}

/* ---------- editing helpers ---------- */

function insertIndex(rows:Row[],position:{beforeRowId?:string;afterRowId?:string;index?:number}|undefined){
 if(!position)return rows.length;
 const given=[position.beforeRowId,position.afterRowId,position.index].filter(value=>value!==undefined);
 if(given.length!==1)throw refuse('Give position exactly one of beforeRowId, afterRowId or index.');
 const at=(id:string)=>{const found=rows.findIndex(row=>row.id===id);if(found<0)throw refuse(`This service has no row ${id}. Call get_service for its row ids.`,'unknown_row',404);return found};
 if(position.beforeRowId!==undefined)return at(position.beforeRowId);
 if(position.afterRowId!==undefined)return at(position.afterRowId)+1;
 return Math.min(position.index!,rows.length);
}
function findRow(rows:Row[],rowId:string){const row=rows.find(item=>item.id===rowId);if(!row)throw refuse(`This service has no row ${rowId}. Call get_service for its row ids.`,'unknown_row',404);return row}
type Details={buttonLabel?:string|null;camera?:string|null;note?:string|null};
function applyDetails(row:Row,details:Details){for(const key of ['buttonLabel','camera','note'] as const){const value=details[key];if(value===null)delete row[key];else if(value!==undefined)row[key]=value}}
function entryType(cueIds:string[],type:CollectionEntry['type']|undefined):CollectionEntry['type']{
 const chosen=type??(cueIds.length===1?'cue':'alternates');
 if(chosen==='cue'&&cueIds.length!==1)throw refuse('A single graphic takes exactly one cueId. For several, use type alternates or multipart.');
 if(chosen!=='cue'&&cueIds.length<2)throw refuse('Alternates and multipart sequences take 2 to 30 cueIds. For one graphic, use type cue.');
 if(new Set(cueIds).size!==cueIds.length)throw refuse('A graphic may appear only once in the same entry.','duplicate_cue');
 return chosen;
}
function defaultLabel(cueIds:string[],type:CollectionEntry['type'],published:Map<string,CueInfo>){return type==='cue'?published.get(cueIds[0])?.name??cueIds[0]:type==='alternates'?'Alternates':'Multipart sequence'}
/** A coverage decision the web would accept, refused here with the sentence that says what is missing. Unresolved rows default their owner to Unassigned, as the importer does. */
function coverageFields(status:CoverageStatus,fields:{cueId?:string;owner?:string;reason?:string}){
 if(status==='covered'&&!fields.cueId)throw refuse('A covered row needs the published graphic that covers it: pass cueId.');
 if(status!=='covered'&&!fields.reason)throw refuse(status==='not-needed'?'Say why no graphic is needed: pass a reason.':'Say what is missing or why: pass a reason.');
 return {...fields,...(UNRESOLVED.includes(status)&&!fields.owner?{owner:'Unassigned'}:{})};
}

type Draft={entries:CollectionEntry[];coverage:CoverageItem[];rows:Row[]};
const draftOf=(service:PreparedService):Draft=>({entries:service.entries.map(plainEntry),coverage:service.coverage.map(plainCoverage),rows:service.rows.map(plainRow)});
async function write(loaded:Loaded,draft:Draft,actor:string,change:string,extra:{rowId?:string;origin?:ServiceOrigin}={}){
 const {manager,current,published}=loaded;
 // updateCollection returns the saved service enriched for the web; the extra fields are ignored here.
 const saved=await manager.updateCollection({id:current.id,expectedVersion:current.version,entries:draft.entries,coverage:draft.coverage},actor,{rows:draft.rows,...(extra.origin?{origin:extra.origin}:{})}) as unknown as PreparedService;
 const row=extra.rowId?compactRows(saved,published).find(item=>item.rowId===extra.rowId):undefined;
 return {serviceId:saved.id,version:saved.version,change,...(row?{row}:{}),counts:counts(saved,published)};
}

/* ---------- the operations ---------- */

type Input<T extends ServiceToolName>=z.infer<(typeof serviceToolSchemas)[T]>;
export async function serviceToolOperation(operation:string,raw:unknown,actor:string,context:ServiceToolContext={}):Promise<unknown>{
 if(!isServiceTool(operation))throw new ServicesError('unknown_operation',`Unknown services operation: ${operation}`,404);
 const parsed=serviceToolSchemas[operation].safeParse(raw);
 if(!parsed.success)throw refuse(`The ${operation} input is not valid: ${parsed.error.issues.map(issue=>`${issue.path.join('.')||'input'} ${issue.message}`).join('; ')}.`);
 const manager=new ServicesManager(context.repository,context.loaders);
 const newId=context.loaders?.id??randomUUID,now=context.loaders?.now??Date.now;
 const input=parsed.data as Record<string,unknown>;
 switch(operation){
  case'list_services':{
   const {includeArchived,query,limit}=input as Input<'list_services'>;
   const [services,{cues}]=await Promise.all([manager.listServices(includeArchived===true),manager.publishedEvidence()]);
   const published=new Map(cues.map(cue=>[cue.id,{id:cue.id,name:cue.name}])),needle=query?.toLocaleLowerCase();
   const matches=services.filter(service=>!needle||[service.name,service.service].some(value=>value.toLocaleLowerCase().includes(needle)));
   const shown=matches.slice(0,limit??50);
   return {total:matches.length,truncated:shown.length<matches.length,services:shown.map(service=>({...header(service),names:Boolean(service.names),counts:counts(service,published)}))};
  }
  case'get_service':{
   const {serviceId,view}=input as Input<'get_service'>;
   const {current,published}=await load(manager,serviceId);
   if(view==='full')return {serviceRef:serviceRef(current),service:await manager.enriched(current)};
   return {...header(current),names:namesSummary(current.names),counts:counts(current,published),rows:compactRows(current,published),fullRecord:"get_service with view:'full'"};
  }
  case'service_readiness':{
   const {serviceId}=input as Input<'service_readiness'>;
   const {current,published}=await load(manager,serviceId);
   const tally=counts(current,published),rows=compactRows(current,published).map(({rowId,index,label,readiness,next,candidates})=>({rowId,index,label,readiness,...(next?{next}:{}),...(candidates?{candidates}:{})}));
   const ready=tally.needsReview===0&&tally.needsAGraphic===0;
   return {serviceId:current.id,version:current.version,name:current.name,ready,summary:ready?'Every row is covered or needs no graphic.':`${tally.needsAGraphic} row(s) need a graphic and ${tally.needsReview} need review.`,counts:tally,rows};
  }
  case'list_live_setlists':{
   const result=await servicesOperation('list_live_setlists',{},actor,context.repository,context.loaders) as {available:boolean};
   if(!result.available)return {available:false,message:'Importing from centralreform.live is not set up for this congregation.'};
   return {...result,next:'Pass a setlist id to prepare_service_from_setlist to prepare it.'};
  }
  case'create_service':{
   const {name,service,from,rows:specs}=input as Input<'create_service'>;
   if(from==='library'){if(specs)throw refuse("Give rows or from:'library', not both.");const created=await manager.createFromLibrary({name,service},actor);return {serviceId:created.id,version:created.version,change:`Created ${name} with one row per published graphic.`,rowCount:created.rows.length}}
   const {cues}=await manager.publishedEvidence(),published=new Map(cues.map(cue=>[cue.id,{id:cue.id,name:friendlyCueName(cue.name)}]));
   const draft:Draft={entries:[],coverage:[],rows:[]};
   (specs??[]).forEach((spec,index)=>{
    if(!spec.cueIds&&!spec.status)throw refuse(`Row ${index+1} needs cueIds, a status, or both.`);
    const row:Row={id:newId(),label:'',candidateCueIds:spec.candidateCueIds??[]};
    let label=spec.label;
    if(spec.cueIds){const type=entryType(spec.cueIds,spec.type);label??=defaultLabel(spec.cueIds,type,published);const entry={id:newId(),type,label,cueIds:spec.cueIds};draft.entries.push(entry);row.entryId=entry.id}
    else if(spec.type)throw refuse(`Row ${index+1} gives a type but no cueIds.`);
    if(spec.status){if(!label)throw refuse(`Row ${index+1} needs a label: the service moment it records.`);const fields=coverageFields(spec.status,{cueId:spec.cueId??(spec.status==='covered'&&spec.cueIds?.length===1?spec.cueIds[0]:undefined),owner:spec.owner,reason:spec.reason});const item:CoverageItem={id:newId(),label,status:spec.status,...fields,...(spec.sourceId?{sourceId:spec.sourceId}:{})};draft.coverage.push(item);row.coverageId=item.id}
    applyDetails(row,spec);draft.rows.push(row);
   });
   const created=await manager.createCollection({name,service,entries:draft.entries,coverage:draft.coverage},actor,undefined,{rows:draft.rows});
   return {serviceId:created.id,version:created.version,change:`Created ${name} with ${created.rows.length} row(s).`,rowCount:created.rows.length};
  }
  case'rename_service':{
   const {serviceId,expectedVersion,name,service}=input as Input<'rename_service'>;
   if(name===undefined&&service===undefined)throw refuse('Pass a new name, a new service, or both.');
   const {current}=await load(manager,serviceId);checkVersion(current,expectedVersion);
   const saved=await manager.updateCollection({id:current.id,expectedVersion,...(name!==undefined?{name}:{}),...(service!==undefined?{service}:{})},actor);
   return {serviceId:saved.id,version:saved.version,name:saved.name,service:saved.service,change:'Renamed.'};
  }
  case'add_entry':{
   const {serviceId,expectedVersion,cueIds,type,label,rowId,position,...details}=input as Input<'add_entry'>;
   const loaded=await load(manager,serviceId);checkVersion(loaded.current,expectedVersion);
   const kind=entryType(cueIds,type),draft=draftOf(loaded.current);
   const entry:CollectionEntry={id:newId(),type:kind,label:label??'',cueIds};
   let row:Row;
   if(rowId!==undefined){
    if(position)throw refuse('Give rowId or position, not both: rowId attaches graphics to a row that already has its place.');
    row=findRow(draft.rows,rowId);
    if(row.entryId)throw refuse(`Row ${rowId} already has graphics. Use swap_graphic to replace one, or remove_entry first.`,'row_has_entry',409);
    entry.label=label??(row.label||defaultLabel(cueIds,kind,loaded.published));
   }else{
    entry.label=label??defaultLabel(cueIds,kind,loaded.published);
    row={id:newId(),label:'',candidateCueIds:[]};
    draft.rows.splice(insertIndex(draft.rows,position),0,row);
   }
   row.entryId=entry.id;applyDetails(row,details);draft.entries.push(entry);
   return write(loaded,draft,actor,`Added ${entry.label}.`,{rowId:row.id});
  }
  case'remove_entry':{
   const {serviceId,expectedVersion,rowId,entryId}=input as Input<'remove_entry'>;
   if((rowId===undefined)===(entryId===undefined))throw refuse('Give exactly one of rowId or entryId.');
   const loaded=await load(manager,serviceId);checkVersion(loaded.current,expectedVersion);
   const draft=draftOf(loaded.current);
   const row=rowId!==undefined?findRow(draft.rows,rowId):draft.rows.find(item=>item.entryId===entryId);
   if(!row)throw refuse(`This service has no entry ${entryId}. Call get_service for its entries.`,'unknown_entry',404);
   if(!row.entryId)throw refuse(`Row ${row.id} has no graphics to remove. To remove its coverage decision use set_coverage_row with clear:true.`,'row_has_no_entry',409);
   const removed=draft.entries.find(item=>item.id===row.entryId)!;
   draft.entries=draft.entries.filter(item=>item.id!==row.entryId);delete row.entryId;
   if(!row.coverageId)draft.rows=draft.rows.filter(item=>item.id!==row.id);
   return write(loaded,draft,actor,row.coverageId?`Removed ${removed.label}; the row keeps its coverage decision.`:`Removed ${removed.label} and its row.`,{rowId:row.coverageId?row.id:undefined});
  }
  case'reorder_entries':{
   const {serviceId,expectedVersion,orderedRowIds,rowId,toIndex}=input as Input<'reorder_entries'>;
   const byList=orderedRowIds!==undefined,byMove=rowId!==undefined||toIndex!==undefined;
   if(byList===byMove)throw refuse('Give orderedRowIds (every row, in the new order), or rowId with toIndex, not both.');
   const loaded=await load(manager,serviceId);checkVersion(loaded.current,expectedVersion);
   const draft=draftOf(loaded.current);
   if(byList){
    const known=new Map(draft.rows.map(row=>[row.id,row]));
    if(orderedRowIds!.length!==draft.rows.length||new Set(orderedRowIds).size!==orderedRowIds!.length||orderedRowIds!.some(id=>!known.has(id)))throw refuse(`orderedRowIds must list each of this service's ${draft.rows.length} row ids exactly once. Call get_service for them.`);
    draft.rows=orderedRowIds!.map(id=>known.get(id)!);
    return write(loaded,draft,actor,'Reordered the service.');
   }
   if(rowId===undefined||toIndex===undefined)throw refuse('Moving one row takes both rowId and toIndex.');
   const row=findRow(draft.rows,rowId);draft.rows=draft.rows.filter(item=>item!==row);draft.rows.splice(Math.min(toIndex,draft.rows.length),0,row);
   return write(loaded,draft,actor,`Moved ${row.label||'the row'} to position ${Math.min(toIndex,draft.rows.length-1)}.`,{rowId});
  }
  case'swap_graphic':{
   const {serviceId,expectedVersion,rowId,cueId,replaceCueId}=input as Input<'swap_graphic'>;
   const loaded=await load(manager,serviceId);checkVersion(loaded.current,expectedVersion);
   const draft=draftOf(loaded.current),row=findRow(draft.rows,rowId);
   const entry=row.entryId?draft.entries.find(item=>item.id===row.entryId):undefined;
   if(!entry)throw refuse(`Row ${rowId} has no graphic yet. Use add_entry or resolve_coverage_row to give it one.`,'row_has_no_entry',409);
   const old=entry.type==='cue'?entry.cueIds[0]:replaceCueId;
   if(!old)throw refuse(`Row ${rowId} holds ${entry.type==='alternates'?'alternates':'a multipart sequence'}; say which graphic to replace with replaceCueId.`);
   if(!entry.cueIds.includes(old))throw refuse(`Row ${rowId} does not use ${old}. Its graphics are ${entry.cueIds.join(', ')}.`);
   if(old===cueId)throw refuse(`Row ${rowId} already uses ${cueId}. Nothing was changed.`,'no_change',409);
   if(entry.cueIds.includes(cueId))throw refuse(`Row ${rowId} already uses ${cueId}; a graphic may appear only once in the same entry.`,'duplicate_cue',409);
   entry.cueIds=entry.cueIds.map(id=>id===old?cueId:id);
   const item=row.coverageId?draft.coverage.find(candidate=>candidate.id===row.coverageId):undefined;
   if(item?.cueId===old)item.cueId=cueId;
   return write(loaded,draft,actor,`Replaced ${loaded.published.get(old)?.name??old} with ${loaded.published.get(cueId)?.name??cueId}.`,{rowId});
  }
  case'resolve_coverage_row':{
   const {serviceId,expectedVersion,rowId,cueId,reason}=input as Input<'resolve_coverage_row'>;
   const loaded=await load(manager,serviceId);checkVersion(loaded.current,expectedVersion);
   const draft=draftOf(loaded.current),row=findRow(draft.rows,rowId),wasCandidate=row.candidateCueIds.includes(cueId);
   const label=row.label||loaded.published.get(cueId)?.name||cueId;
   const entry=row.entryId?draft.entries.find(item=>item.id===row.entryId):undefined;
   if(entry){entry.type='cue';entry.cueIds=[cueId]}
   else{const created={id:newId(),type:'cue' as const,label,cueIds:[cueId]};draft.entries.push(created);row.entryId=created.id}
   const decided=reason??(wasCandidate?'Chosen from the candidates for this row.':'Resolved to this published graphic.');
   const item=row.coverageId?draft.coverage.find(candidate=>candidate.id===row.coverageId):undefined;
   if(item){item.status='covered';item.cueId=cueId;item.reason=decided}
   else{const created:CoverageItem={id:newId(),label,status:'covered',cueId,reason:decided};draft.coverage.push(created);row.coverageId=created.id}
   row.candidateCueIds=[];
   return write(loaded,draft,actor,`${label} is covered by ${loaded.published.get(cueId)?.name??cueId}${wasCandidate?', one of its candidates':''}.`,{rowId});
  }
  case'set_coverage_row':{
   const {serviceId,expectedVersion,rowId,position,label,status,cueId,sourceId,owner,reason,clear,...details}=input as Input<'set_coverage_row'>;
   const loaded=await load(manager,serviceId);checkVersion(loaded.current,expectedVersion);
   const draft=draftOf(loaded.current);
   if(clear){
    if(rowId===undefined)throw refuse('clear:true takes the rowId whose coverage decision to remove.');
    if([position,label,status,cueId,sourceId,owner,reason,details.buttonLabel,details.camera,details.note].some(value=>value!==undefined))throw refuse('clear:true takes only rowId; it removes the coverage decision and changes nothing else.');
    const row=findRow(draft.rows,rowId);
    if(!row.coverageId)throw refuse(`Row ${rowId} has no coverage decision to remove.`,'row_has_no_coverage',409);
    draft.coverage=draft.coverage.filter(item=>item.id!==row.coverageId);delete row.coverageId;
    if(!row.entryId)draft.rows=draft.rows.filter(item=>item.id!==row.id);
    return write(loaded,draft,actor,row.entryId?'Removed the coverage decision; the row keeps its graphics.':'Removed the coverage decision and its row.',{rowId:row.entryId?row.id:undefined});
   }
   let row:Row;
   if(rowId===undefined){
    if(!label||!status)throw refuse('A new coverage row needs a label (the service moment) and a status.');
    row={id:newId(),label:'',candidateCueIds:[]};draft.rows.splice(insertIndex(draft.rows,position),0,row);
   }else{
    if(position)throw refuse('position places a new row; to move an existing one use reorder_entries.');
    row=findRow(draft.rows,rowId);
   }
   const entry=row.entryId?draft.entries.find(item=>item.id===row.entryId):undefined;
   const existing=row.coverageId?draft.coverage.find(item=>item.id===row.coverageId):undefined;
   const touchesCoverage=[label,status,cueId,sourceId,owner,reason].some(value=>value!==undefined);
   if(touchesCoverage){
    if(!existing&&!status)throw refuse(`Row ${row.id} has no coverage decision yet; pass a status to record one.`);
    const nextStatus=status??existing!.status;
    const pick=<T>(value:T|null|undefined,prior:T|undefined)=>value===null?undefined:value===undefined?prior:value;
    const fields=coverageFields(nextStatus,{cueId:pick(cueId,existing?.cueId)??(nextStatus==='covered'&&entry?.cueIds.length===1?entry.cueIds[0]:undefined),owner:pick(owner,existing?.owner),reason:pick(reason,existing?.reason)});
    const nextSource=pick(sourceId,existing?.sourceId);
    const item:CoverageItem={id:existing?.id??newId(),label:label??existing?.label??(row.label||entry?.label||''),status:nextStatus,...(fields.cueId?{cueId:fields.cueId}:{}),...(nextSource?{sourceId:nextSource}:{}),...(fields.owner?{owner:fields.owner}:{}),...(fields.reason?{reason:fields.reason}:{})};
    if(!item.label)throw refuse('Give the row a label: the service moment it records.');
    if(existing)draft.coverage=draft.coverage.map(candidate=>candidate.id===existing.id?item:candidate);else{draft.coverage.push(item);row.coverageId=item.id}
    if(nextStatus==='covered')row.candidateCueIds=[];
   }else if(!Object.values(details).some(value=>value!==undefined))throw refuse('Nothing to change: pass a status, a coverage field, or a buttonLabel, camera or note.');
   applyDetails(row,details);
   return write(loaded,draft,actor,existing||!touchesCoverage?'Updated the row.':'Recorded the coverage decision.',{rowId:row.id});
  }
  case'set_names':{
   const {serviceId,expectedVersion,names}=input as Input<'set_names'>;
   const {current}=await load(manager,serviceId);checkVersion(current,expectedVersion);
   const result=await servicesOperation('set_names',{id:serviceId,expectedVersion,names:{...names,rows:names.rows.map(row=>({he:row.he??'',en:row.en??''}))}},actor,context.repository,context.loaders) as {collection:PreparedService;warning?:string};
   return {serviceId,version:result.collection.version,names:namesSummary(result.collection.names),change:'Saved the names list; its panels are in the live library as names graphics.',...(result.warning?{warning:result.warning}:{})};
  }
  case'clear_names':{
   const {serviceId,expectedVersion}=input as Input<'clear_names'>;
   const {current}=await load(manager,serviceId);checkVersion(current,expectedVersion);
   if(!current.names)return {serviceId,version:current.version,names:null,change:'This service has no names list. Nothing was changed.'};
   const result=await servicesOperation('clear_names',{id:serviceId,expectedVersion},actor,context.repository,context.loaders) as {collection:PreparedService;warning?:string};
   return {serviceId,version:result.collection.version,names:null,change:'Removed the names list.',...(result.warning?{warning:result.warning}:{})};
  }
  case'archive_service':
  case'restore_service':{
   const {serviceId,expectedVersion}=input as Input<'archive_service'>;
   const archive=operation==='archive_service';
   const {current}=await load(manager,serviceId);checkVersion(current,expectedVersion);
   if(current.archived===archive)return {serviceId,version:current.version,archived:archive,change:`This service is already ${archive?'archived':'active'}. Nothing was changed.`};
   const result=await servicesOperation(archive?'archive_collection':'restore_collection',{id:serviceId,expectedVersion},actor,context.repository,context.loaders) as {collection:PreparedService;warning?:string};
   return {serviceId,version:result.collection.version,archived:archive,change:archive?`Archived.${current.names?' Its names list was removed with it.':''} restore_service brings it back.`:'Restored.',...(result.warning?{warning:result.warning}:{})};
  }
  case'refresh_from_setlist':{
   const {serviceId,expectedVersion,dryRun,removeMissing}=input as Input<'refresh_from_setlist'>;
   const loaded=await load(manager,serviceId);checkVersion(loaded.current,expectedVersion);
   if(!loaded.current.origin)throw refuse('This service was not imported from centralreform.live, so there is no setlist to refresh it from. Use prepare_service_from_setlist to import one.','no_origin',409);
   const imported=await manager.matchLiveSetlist(loaded.current.origin.setlistId);
   const plan=refreshPlan(loaded.current,imported,removeMissing===true);
   const summary={added:0,updated:0,kept:0,missing:0,removed:0,unchanged:0};for(const change of plan.changes)summary[change.change]++;summary.unchanged=plan.unchanged;
   if(dryRun!==false)return {serviceId,version:loaded.current.version,dryRun:true,setlistId:loaded.current.origin.setlistId,summary,changes:plan.changes,next:'Nothing was written. Run again with dryRun:false and the same expectedVersion to apply.'};
   const origin:ServiceOrigin={setlistId:imported.setlist.id,trackIds:imported.rows.flatMap(row=>row.trackId?[row.trackId]:[]),eventDate:imported.setlist.eventDate??imported.setlist.date,importedAt:now()};
   const written=await write(loaded,plan.draft,actor,`Refreshed from the setlist: ${summary.added} added, ${summary.updated} updated, ${summary.kept} decisions kept, ${summary.missing} no longer on the setlist, ${summary.removed} removed.`,{origin});
   return {...written,dryRun:false,summary,changes:plan.changes};
  }
 }
}

type RefreshChange={change:'added'|'updated'|'kept'|'missing'|'removed';rowId:string;label:string;from?:string;to?:string;why?:string};
/**
 * The re-import merge. Rows are matched by setlist track id (then, for a track with no id, by
 * label among imported rows). A human decision - covered, not needed, intentional fallback, or
 * graphics attached to a row without coverage - is never overwritten; a row still waiting on a
 * decision (needs a graphic, needs review) takes the new match. New setlist rows are inserted
 * in setlist order; rows added by hand keep their place after the row they followed.
 */
function refreshPlan(current:PreparedService,imported:{entries:CollectionEntry[];coverage:CoverageItem[];rows:Row[]},removeMissing:boolean){
 const draft=draftOf(current),changes:RefreshChange[]=[];let unchanged=0;
 const importedEntries=new Map(imported.entries.map(entry=>[entry.id,entry])),importedCoverage=new Map(imported.coverage.map(item=>[item.id,item]));
 const coverageById=new Map(draft.coverage.map(item=>[item.id,item]));
 const fromSetlist=(row:Row)=>Boolean(row.trackId)||row.setlistPosition!==undefined;
 const byTrack=new Map(draft.rows.filter(row=>row.trackId).map(row=>[row.trackId!,row])),used=new Set<string>();
 const sequence:{row:Row;matchedId?:string}[]=[];
 for(const incoming of imported.rows){
  let match=incoming.trackId?byTrack.get(incoming.trackId):undefined;
  if(match&&used.has(match.id))match=undefined;
  if(!match&&!incoming.trackId)match=draft.rows.find(row=>!used.has(row.id)&&!row.trackId&&row.setlistPosition!==undefined&&row.label===incoming.label);
  const nextItem=incoming.coverageId?importedCoverage.get(incoming.coverageId):undefined,nextEntry=incoming.entryId?importedEntries.get(incoming.entryId):undefined;
  if(!match){
   const row=plainRow(incoming);
   if(nextEntry)draft.entries.push(plainEntry(nextEntry));
   if(nextItem)draft.coverage.push(plainCoverage(nextItem));
   sequence.push({row});changes.push({change:'added',rowId:row.id,label:incoming.label,...(nextItem?{to:nextItem.status}:{})});continue;
  }
  used.add(match.id);
  const item=match.coverageId?coverageById.get(match.coverageId):undefined;
  const decided=item?!['needs-cue','needs-review'].includes(item.status):Boolean(match.entryId);
  if(incoming.setlistPosition!==undefined)match.setlistPosition=incoming.setlistPosition;
  if(incoming.trackId)match.trackId=incoming.trackId;
  sequence.push({row:match,matchedId:match.id});
  const sameCandidates=[...match.candidateCueIds].sort().join('\0')===[...incoming.candidateCueIds].sort().join('\0');
  const differs=!nextItem||!item||item.status!==nextItem.status||!sameCandidates||item.label!==nextItem.label||(nextItem.cueId??'')!==(item.cueId??'');
  if(!differs){unchanged++;continue}
  if(decided){
   if(nextItem&&item&&item.status!==nextItem.status)changes.push({change:'kept',rowId:match.id,label:item.label,from:item.status,to:nextItem.status,why:'A person decided this row; the new setlist match was not applied.'});else unchanged++;
   continue;
  }
  // Waiting on a decision: take the new match, keeping the row, its ids and a named owner.
  if(nextItem){
   const owner=item?.owner&&item.owner!=='Unassigned'&&nextItem.status!=='covered'?item.owner:nextItem.owner;
   const replaced:CoverageItem=plainCoverage({...nextItem,id:item?.id??nextItem.id,...(owner?{owner}:{})});
   if(item)draft.coverage=draft.coverage.map(candidate=>candidate.id===item.id?replaced:candidate);else{draft.coverage.push(replaced);match.coverageId=replaced.id}
  }
  if(nextEntry){
   const entry=plainEntry({...nextEntry,id:match.entryId??nextEntry.id});
   if(match.entryId)draft.entries=draft.entries.map(candidate=>candidate.id===match!.entryId?entry:candidate);else{draft.entries.push(entry);match.entryId=entry.id}
  }else if(match.entryId){const gone=match.entryId;draft.entries=draft.entries.filter(candidate=>candidate.id!==gone);delete match.entryId}
  match.candidateCueIds=[...incoming.candidateCueIds];
  changes.push({change:'updated',rowId:match.id,label:nextItem?.label??match.label,...(item?{from:item.status}:{}),...(nextItem?{to:nextItem.status}:{})});
 }
 // Rows the new setlist no longer has, and rows added by hand: anchored after the row they followed.
 const anchored=new Map<string,Row[]>();let anchor='';
 for(const row of draft.rows){
  if(used.has(row.id)){anchor=row.id;continue}
  if(fromSetlist(row)){
   if(removeMissing){
    changes.push({change:'removed',rowId:row.id,label:row.label});
    if(row.entryId)draft.entries=draft.entries.filter(entry=>entry.id!==row.entryId);
    if(row.coverageId)draft.coverage=draft.coverage.filter(item=>item.id!==row.coverageId);
    continue;
   }
   changes.push({change:'missing',rowId:row.id,label:row.label,why:'No longer on the setlist; kept. Pass removeMissing:true to remove such rows.'});
  }
  anchored.set(anchor,[...(anchored.get(anchor)??[]),row]);
 }
 const rows:Row[]=[...(anchored.get('')??[])];
 for(const {row,matchedId} of sequence){rows.push(row);if(matchedId)rows.push(...(anchored.get(matchedId)??[]))}
 draft.rows=rows;
 return {draft,changes,unchanged};
}
