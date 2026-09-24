// Headline acceptance (HANDOFF-CODE-2026-09-23-mcp.md, "Headline acceptance"), one workspace per run:
//   node node_modules/tsx/dist/cli.mjs scripts/headline-acceptance.mts --workspace crc|tbi --setlist <file> [--fit-origin http://localhost:5193] [--out <file>] [--stub-fit] [--skip-archived]
//
// Drives the real MCP handler (createAuthoringMcpHandler, JSON-RPC tools/call over handler.fetch) into the
// real authoring dispatch in rehearsal (in-memory) mode. Harness setup, not counted: the in-memory stores are
// seeded with the workspace's committed catalog snapshot, and centralreform.live's get_setlist is answered from
// a file through the injected transport (liveSetlistDependencies). Every counted call goes through the handler.
// The server fit is the real one (local Chrome opening /author/fit-stage on --fit-origin); --stub-fit replaces
// it with a passing stub and says so in the output. Nothing here reads .env files, a database or the relay.
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);
const arg=(name:string,fallback?:string)=>{const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:fallback};
const WS=arg('workspace','crc')!;
if(WS!=='crc'&&WS!=='tbi')throw new Error('--workspace must be crc or tbi');
const WORKSPACE_ID=WS==='crc'?'crc':'temple-bnai-israel-kalamazoo';
const ROOT=path.resolve(import.meta.dirname,'..');
const SETLIST_FILE=arg('setlist')??process.env.HEADLINE_SETLIST_FILE;
if(!SETLIST_FILE)throw new Error('--setlist <file> is required (the get_setlist answer, as read from centralreform.live)');
const FIT_ORIGIN=arg('fit-origin','http://localhost:5193')!;
const STUB_FIT=args.includes('--stub-fit');
const SKIP_ARCHIVED=args.includes('--skip-archived');
const OUT=arg('out');

// The deployment this run stands in for: the workspace's built-in profile, in-memory rehearsal storage, no relay,
// no database. A throwaway export-signing key so export_deck_config can sign (it never leaves this process).
Object.assign(process.env,{WORKSPACE_ID,CRC_AUTHORING_REHEARSAL:'1',NODE_ENV:'development',COMPANION_EXPORT_KEY:randomBytes(32).toString('hex')});
for(const key of ['RELAY_URL','RELAY_SECRET','CONTROL_KEY','DATABASE_URL','VERCEL','PUBLIC_BASE_URL','CRC_LIVE_BASE_URL','CRC_LIVE_READ_TOKEN'])delete process.env[key];

const [{createAuthoringMcpHandler},authoring,model,{liveSetlistDependencies},{isDeckTool},{isBrandingTool},{measureCueOnServer}]=await Promise.all([
 import('../lib/mcp.ts'),import('../lib/authoring.ts'),import('../lib/authoring-model.ts'),import('../lib/service-collections.ts'),
 import('../lib/companion-deck/tool-schemas.ts'),import('../lib/branding-tools.ts'),import('../lib/server-fit.ts'),
]);
const {authoringOperation,authoringRepository,authoringRepositoryMode,localSourceRepository,createAuthoringService,MemoryAuthoringRepository,SOURCE_REVIEW_OPERATIONS}=authoring;
type ServerFitRunner=import('../lib/authoring.ts').ServerFitRunner;
type Draft=import('../lib/authoring-model.ts').Draft;

/* ------------------------------------------------------------- harness setup (not counted) --- */

// 1. Seed the in-memory authoring store with the workspace's published catalog, as last read from production.
type SnapshotRow={id:string;name:string;title?:string;layout:string|null;activeRevision?:number|null;archived?:boolean};
const snapshotFile=WS==='crc'?'docs/planning/2026-09-23-overlay-consistency/companion/catalog-snapshot-2026-09-23.json':'tests/fixtures/tbi-catalog-2026-09-15.json';
const snapshot=JSON.parse(fs.readFileSync(path.join(ROOT,snapshotFile),'utf8')) as {drafts?:SnapshotRow[];cues?:SnapshotRow[]};
const rows:SnapshotRow[]=snapshot.drafts??snapshot.cues??[];
const repo=authoringRepository();
if(!(repo instanceof MemoryAuthoringRepository))throw new Error('expected the in-memory rehearsal repository');
const templateFor=(layout:string)=>model.baselineCues.find(cue=>cue.layout===(layout==='corner'?'bottom':layout)&&!cue.hidden)??model.baselineCues.find(cue=>cue.layout==='bottom'&&!cue.hidden)!;
const SEEDER='harness:seed',SEEDED_AT=Date.parse('2026-09-01T00:00:00Z');
let seeded=0,seededArchived=0,seededUnpublished=0;
for(const row of rows){
 const layout=(['bottom','left','right','corner'].includes(row.layout??'')?row.layout:'bottom') as Draft['layout'];
 const content={mode:'custom' as const,text:row.title||row.name};
 // Dated before either deck's last sync, so "changed since the deck was last synced" means this run's work only.
 const at=SEEDED_AT;
 const draft:Draft={name:row.name.slice(0,80),title:(row.title||row.name).slice(0,100),layout,templateCueId:templateFor(layout).id,content,presentation:{},id:row.id,version:1,sourcePin:model.sourcePinFor(content),activeRevision:null,activeDraftVersion:null,createdAt:at,updatedAt:at,createdBy:SEEDER,updatedBy:SEEDER};
 const published=row.activeRevision!==null;
 if(published){
  await repo.insertImportedDraft(draft,model.buildCue(draft),SEEDER);
  // Keep production's revision number, so the deck's catalog stamps don't read as revised.
  const revision=typeof row.activeRevision==='number'?row.activeRevision:1,stored=repo.drafts.get(row.id)!,revisionRow=repo.revisionRows.get(row.id)![0];
  stored.activeRevision=revision;revisionRow.revision=revision;revisionRow.createdAt=at;stored.updatedAt=at;
 }else{await repo.insertDraft(draft);seededUnpublished++}
 if(row.archived){await repo.setArchived(row.id,(await repo.getDraft(row.id))!.version,true,SEEDER);repo.drafts.get(row.id)!.updatedAt=at;seededArchived++}
 seeded++;
}

// 2. centralreform.live: the deployed server reads it with CRC_LIVE_READ_TOKEN. Here get_setlist is answered from
//    the file read earlier through the centralreform.live MCP; the importer and matcher are the real ones.
const setlist=JSON.parse(fs.readFileSync(SETLIST_FILE,'utf8')) as {id:string;name:string;book?:string;tracks:unknown[]};
const transportCalls:string[]=[];
liveSetlistDependencies.availability=()=>({available:true,reason:'ok'});
liveSetlistDependencies.createTransport=()=>async(tool,input)=>{
 transportCalls.push(`${tool}(${JSON.stringify(input)})`);
 if(tool==='get_setlist'&&input.id===setlist.id)return structuredClone(setlist);
 throw new Error(`the harness transport answers only get_setlist for ${setlist.id}`);
};

// 3. The server fit. Real: the same measureCueOnServer the deployment runs, pointed at a local dev server
//    (the deployment's own origin must be https, so the default runner's canonicalOrigin() can't name localhost).
const fits:Array<{name:string;verdict:string;fitErrors?:string[];warnings?:string[];fill?:number|null;rendererVersion?:string;ms:number}>=[];
const realFit:ServerFitRunner=async(cue,options)=>{
 const started=Date.now();
 const result=await measureCueOnServer(cue as never,{origin:FIT_ORIGIN,includePreviewImage:options?.includePreviewImage,...(options?.artworkUrl?{artworkUrl:options.artworkUrl}:{}),...(options?.layouts?{layouts:options.layouts}:{})});
 fits.push({name:cue.name,verdict:result.verdict,...('fitErrors' in result?{fitErrors:result.fitErrors,warnings:result.warnings,fill:result.fill,rendererVersion:result.rendererVersion}:{reason:(result as {reason?:string}).reason}),ms:Date.now()-started} as never);
 return result;
};
const stubFit:ServerFitRunner=async(cue,options)=>{fits.push({name:cue.name,verdict:'pass (stub)',ms:0});return {verdict:'pass',fitErrors:[],warnings:[],fill:0.4,artwork:'none',measuredAt:Date.now(),rendererVersion:'server-chromium/stub',...(options?.includePreviewImage?{previewImage:{mimeType:'image/jpeg',dataBase64:'',width:1920,height:1080}}:{})} as never};

// 4. The dispatch: exactly authoringOperation's routing (source review, deck conversion, branding, deck tools go
//    to authoringOperation itself); everything else to an authoring service over the same in-memory stores that
//    differs from the default one only in the server-fit origin.
const service=createAuthoringService(repo,authoringRepositoryMode(process.env),undefined,undefined,STUB_FIT?stubFit:realFit,localSourceRepository());
const viaDefault=(op:string)=>Object.hasOwn(SOURCE_REVIEW_OPERATIONS,op)||op==='seed_deck_from_export'||op==='convert_singular_deck'||op==='import_singular_extract'||isBrandingTool(op)||isDeckTool(op);
const operation=async(op:string,input:unknown,actor:string)=>viaDefault(op)?authoringOperation(op,input,actor):service.operation(op,input,actor);
const handler=createAuthoringMcpHandler(operation);

/* ------------------------------------------------------------------- counted MCP calls --- */

const ACTOR='mcp:headline-acceptance:member:harness';
const authInfo={token:'harness',clientId:'headline-acceptance',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+3600,resource:new URL('https://overlays.example/api/mcp'),extra:{actor:ACTOR}};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
type Called={isError:boolean;text:string;output:Output};
const calls:Array<{n:number;step:string;tool:string;isError:boolean;note?:string}>=[];
let rpc=0,step='1';
async function call(tool:string,input:Record<string,unknown>={},note?:string):Promise<Called>{
 const response=await handler.fetch(new Request('https://overlays.example/api/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++rpc,method:'tools/call',params:{name:tool,arguments:{...input,workspace:WORKSPACE_ID}}})}),{authInfo:authInfo as never});
 const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
 const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Array<{text?:string}>};error?:{message:string}};
 const text=body.error?body.error.message:(body.result?.content[0]?.text??'');
 let output:Output={};try{output=JSON.parse(text)}catch{/* a refusal sentence */}
 const isError=Boolean(body.error)||body.result?.isError===true;
 calls.push({n:calls.length+1,step,tool,isError,...(note?{note}:{})});
 return {isError,text,output};
}
const failures:Array<{step:string;tool:string;sentence:string}>=[];
const fail=(step:string,tool:string,result:Called)=>{failures.push({step,tool,sentence:result.output.message??result.text});return result};

type Readiness={counts:Record<string,number>;rows:Output[]};
const readinessOf=(result:Called):Readiness=>{
 const list:Output[]=result.output.rows??[];
 const counts:Record<string,number>={};
 for(const row of list){const state=String(row.state??row.status??row.readiness);counts[state]=(counts[state]??0)+1}
 return {counts:result.output.counts??counts,rows:list};
};

const report:Output={workspace:WS,workspaceId:WORKSPACE_ID,setlist:{id:setlist.id,name:setlist.name,book:setlist.book??null,tracks:setlist.tracks.length},setup:{variant:SKIP_ARCHIVED?'skip-archived':'as specified',snapshotFile,seeded,seededArchived,seededUnpublished,fit:STUB_FIT?'stub (passing)':`real Chrome via measureCueOnServer at ${FIT_ORIGIN}`}};

// Step 0 (TBI only): the deck is onboarded through the MCP first - Simone's committed 14 September export stored
// as TBI's deck, then every Covered Singular button bound to its published graphic. Counted, as step 0.
if(WS==='tbi'){
 step='0';
 const dry=await call('seed_deck_from_export',{useCommittedSeed:true},'dry run');
 const seed=await call('seed_deck_from_export',{useCommittedSeed:true,dryRun:false});
 report.tbiSeed={dryRun:dry.isError?dry.text:dry.output.next,applied:seed.isError?seed.text:{stored:seed.output.stored,seed:seed.output.seed},isError:seed.isError};
 if(seed.isError)fail('0','seed_deck_from_export',seed);
 const conv=await call('convert_singular_deck',{status:'covered'},'dry run');
 let bind:string[]=conv.output.bindable??[];
 report.tbiConvert={dryRun:conv.isError?conv.text:conv.output.counts,bindable:bind.length};
 // --skip-archived (variant): leave unbound any Covered row whose graphic's draft is archived. The conversion
 // counts such a graphic as published (it is still in the live catalog); validate_deck counts it as unpublished.
 if(SKIP_ARCHIVED){
  const archived=await call('list_archived_drafts',{},'variant: which covered rows point at archived drafts');
  const ids=new Set<string>((archived.output.drafts??archived.output.archived??[]).map((item:Output)=>String(item.id)));
  const rowsById=new Map<string,Output>((conv.output.rows??[]).map((item:Output)=>[String(item.id),item]));
  const skipped=bind.filter(id=>ids.has(String(rowsById.get(id)?.cueId)));
  bind=bind.filter(id=>!skipped.includes(id));
  report.tbiConvert.skippedArchived=skipped.map(id=>({row:id,label:rowsById.get(id)?.label,cue:rowsById.get(id)?.cue}));
  report.tbiConvert.archivedDraftsListed=ids.size;
 }
 if(conv.isError)fail('0','convert_singular_deck',conv);
 if(bind.length){
  const bound=await call('convert_singular_deck',{dryRun:false,expectedVersion:conv.output.version,bind});
  report.tbiConvert.applied=bound.isError?bound.text:{bound:bound.output.bound,version:bound.output.version,removedConnections:bound.output.removedConnections};
  if(bound.isError)fail('0','convert_singular_deck',bound);
 }
 step='1';
}

// Step 1: setlist -> prepared service -> readiness.
const prepared=await call('prepare_service_from_setlist',{setlistId:setlist.id});
report.prepare={isError:prepared.isError,summary:prepared.isError||prepared.output.ok===false?(prepared.output.message??prepared.text):undefined,serviceId:prepared.output.collection?.id??prepared.output.service?.id??prepared.output.serviceId??prepared.output.id??null,keys:Object.keys(prepared.output)};
if(prepared.isError||prepared.output.ok===false)fail('1','prepare_service_from_setlist',prepared);
const serviceId:string|null=report.prepare.serviceId;
let before:Readiness|null=null;
if(serviceId){
 const ready=await call('service_readiness',{serviceId});
 before=readinessOf(ready);report.readinessBefore={counts:before.counts,raw:args.includes('--explore')?ready.output:undefined};
}
if(args.includes('--explore')){console.log(JSON.stringify({report,calls,transportCalls},null,1));process.exit(0)}

step='2';
// Step 2: author and ship a graphic for each Needs-a-graphic row; settle each Needs-review row.
// The agent policy, stated so the receipt can repeat it: search the source corpus by the row's title (the
// setlist's parenthetical arranger removed); take the first source with a bilingual block, preferring a
// Shabbat-morning book, and make a lower third of its first bilingual block with the layout's default look
// (no templateCueId). With no such source, a custom title card with the row's own label. On a duplicate name,
// ship again with allowRename. A Needs-review row takes its first candidate (a person would choose).
const authored:Output[]=[];
let serviceVersion:number|null=null;
const shipped=new Map<string,string>();
if(serviceId&&before){
 const svc=await call('get_service',{serviceId});serviceVersion=svc.output.version??null;
 for(const row of before.rows.filter(item=>item.readiness==='needs-a-graphic')){
  const label=String(row.label),query=label.replace(/\s*\([^)]*\)\s*$/,'').split(' / ')[0].trim();
  const found=await call('search_sources',{query,includeBlocks:true,limit:5},`row "${label}"`);
  const sources:Output[]=found.output.sources??[];
  const withBlock=sources.filter(source=>(source.blocks??[]).some((block:Output)=>block.kind==='bilingual'));
  const source=withBlock.find(item=>/shabbat-morning|saturday|shacharit/i.test(`${item.bookValue} ${item.id}`))??withBlock[0];
  const name=label.slice(0,80);
  let draftInput:Record<string,unknown>,content:string;
  if(source){const block=(source.blocks as Output[]).find(item=>item.kind==='bilingual')!;const groups=[{sourceId:source.id,blockIds:[block.id]}];draftInput={name,title:query.slice(0,100),layout:'bottom',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:structuredClone(groups)}};content=`bilingual, first block of ${source.name} (${source.bookLabel} ${source.folio})`}
  else{draftInput={name,title:query.slice(0,100),layout:'bottom',content:{mode:'custom',text:label}};content='custom title card (no source with a bilingual block)'}
  const created=await call('create_draft',draftInput,`row "${label}"`);
  if(created.isError){fail('2','create_draft',created);authored.push({row:label,content,created:false,sentence:created.text});continue}
  const draftId=created.output.draft.id,version=created.output.draft.version;
  let ship=await call('ship_draft',{draftId,expectedVersion:version},`row "${label}"`);
  if(!ship.isError&&ship.output.stoppedAt==='duplicate_name')ship=await call('ship_draft',{draftId,expectedVersion:version,allowRename:true},`row "${label}" (rename)`);
  const entry:Output={row:label,content,draftId,shipped:ship.output.shipped===true,name:ship.output.name??name,renamedFrom:ship.output.renamedFrom,verdict:ship.output.verdict,stoppedAt:ship.output.stoppedAt,fitErrors:ship.output.fitErrors,warnings:ship.output.warnings,message:ship.isError?ship.text:ship.output.message};
  authored.push(entry);
  if(ship.isError||ship.output.shipped!==true){fail('2','ship_draft',ship);continue}
  shipped.set(String(row.rowId),draftId);
  const resolved=await call('resolve_coverage_row',{serviceId,expectedVersion:serviceVersion,rowId:row.rowId,cueId:draftId,reason:'Authored and published for this service by the assistant.'},`row "${label}"`);
  if(resolved.isError)fail('2','resolve_coverage_row',resolved);else serviceVersion=resolved.output.version??resolved.output.service?.version??serviceVersion;
  entry.resolved=!resolved.isError;
 }
 const reviewed:Output[]=[];
 for(const row of before.rows.filter(item=>item.readiness==='needs-review')){
  const pick=(row.candidates??[]).find((item:Output)=>item.available!==false);
  if(!pick){reviewed.push({row:row.label,resolved:false,why:'no available candidate'});continue}
  const resolved=await call('resolve_coverage_row',{serviceId,expectedVersion:serviceVersion,rowId:row.rowId,cueId:pick.cueId,reason:'First candidate taken by the acceptance harness; a person would choose.'},`review "${row.label}"`);
  if(resolved.isError)fail('2','resolve_coverage_row',resolved);else serviceVersion=resolved.output.version??resolved.output.service?.version??serviceVersion;
  reviewed.push({row:row.label,cueId:pick.cueId,name:pick.name,of:(row.candidates??[]).length,resolved:!resolved.isError,...(resolved.isError?{sentence:resolved.text}:{})});
 }
 report.authored=authored;report.reviewed=reviewed;
 const after=await call('service_readiness',{serviceId});
 report.readinessAfter={counts:readinessOf(after).counts,summary:after.output.summary,ready:after.output.ready};
}

step='3';
const syncView=(result:Called)=>result.isError?{sentence:result.text}:{summary:result.output.summary,placed:(result.output.placed??[]).map((item:Output)=>({name:item.name,page:item.page,pageName:item.pageName,row:item.row,column:item.column,why:item.why})),unplaced:(result.output.unplaced??[]).map((item:Output)=>({name:item.name,reason:item.reason,candidatePages:item.candidatePages})),flagged:(result.output.flagged??[]).map((item:Output)=>({cueId:item.cueId,page:item.page,row:item.row,column:item.column,reason:item.reason})),revised:result.output.revised?.length,relabelled:result.output.relabelled?.length,removed:result.output.removed?.length};
// 3a. What the grammar does on its own (default scope: everything published since the deck's last sync).
const drySync=await call('sync_deck_with_catalog',{},'dry run, grammar alone');
report.syncDryRun=syncView(drySync);
// 3b. Placements for what the grammar could not place. Policy: take check_service_on_deck's wouldGo where it
// has one (it reads the service's name as a hint, which sync does not); otherwise the standing page of the
// nearest earlier row of this service that is already on the deck, within the page chain holding most of the
// service's placed graphics, moving along the chain while a page has no free cell. The grammar picks the cell.
const placements:Array<{cueId:string;page:number;row?:number;column?:number}>=[];
const grammarPlaced=new Set<string>((drySync.output.placed??[]).map((item:Output)=>item.cueId));
let cueIds:string[]=[];
if(serviceId){
 // The service's own missing graphics are the scope (check_service_on_deck's next step says so); on a deck that
 // was never synced the default scope is the whole catalog.
 const pre=await call('check_service_on_deck',{serviceId},'before sync: what is missing, and wouldGo');
 const missingList:Output[]=pre.output.missing??[];
 cueIds=missingList.map(item=>String(item.cueId));
 report.checkBeforeSync={placed:pre.output.placedCount,missing:missingList.length,wouldGo:missingList.filter(item=>item.wouldGo).length};
 const needPlacement=missingList.filter(item=>!grammarPlaced.has(item.cueId));
 if(needPlacement.length){
  const deckInfo=await call('get_deck',{},'pages, free cells and chains');
  const pages:Output[]=deckInfo.output.pages??[],chains:number[][]=deckInfo.output.chains??[];
  report.deckPages=pages.map(page=>`${page.page} ${page.name} (${page.template ?? '-'}; ${page.cueKeys} cue keys, ${page.free} free)`);
  report.deckChains=chains;
  const free=new Map<number,number>(pages.map(page=>[page.page,page.free]));
  const placedOn=new Map<string,number[]>();for(const item of pre.output.placed??[])placedOn.set(item.row,(item.on??[]).map((cell:Output)=>cell.page));
  const chainScore=chains.map(chain=>[...placedOn.values()].filter(on=>on.some(page=>chain.includes(page))).length);
  // No chains (TBI's built-in navigation): the pages already holding this service's graphics, in page order.
  const chain=chains.length&&Math.max(...chainScore)>0?chains[chainScore.indexOf(Math.max(...chainScore))]:[...new Set([...placedOn.values()].flat())].sort((a,b)=>a-b);
  const svc=await call('get_service',{serviceId},'row order');
  const order:string[]=(svc.output.rows??[]).map((row:Output)=>String(row.label));
  for(const missing of needPlacement){
   if(missing.wouldGo){placements.push({cueId:missing.cueId,page:missing.wouldGo.page,row:missing.wouldGo.row,column:missing.wouldGo.column});free.set(missing.wouldGo.page,(free.get(missing.wouldGo.page)??1)-1);continue}
   const at=order.indexOf(missing.row);
   let anchor:number|undefined;
   for(let i=at-1;i>=0&&anchor===undefined;i--){const on=placedOn.get(order[i]);anchor=on?.find(page=>chain.includes(page))}
   const start=anchor===undefined?0:chain.indexOf(anchor);
   const page=[...chain.slice(start),...chain.slice(0,start).reverse()].find(candidate=>(free.get(candidate)??0)>0);
   if(page===undefined)continue;
   placements.push({cueId:missing.cueId,page});free.set(page,(free.get(page)??1)-1);
   placedOn.set(missing.row,[page]);
  }
  report.placementPolicy={chain,placements:placements.map(item=>({...item,name:missingList.find(m=>m.cueId===item.cueId)?.name}))};
 }
}
let planned=cueIds.length?await call('sync_deck_with_catalog',{cueIds,...(placements.length?{placements}:{})},'dry run, service scope'):drySync;
// Any placement the grammar still refuses (a page page with no free cell after all): move it one page along.
for(let attempt=0;attempt<2&&cueIds.length&&(planned.output.unplaced??[]).length;attempt++){
 const pagesInfo=await call('get_deck',{},'free cells');const byNumber=(pagesInfo.output.pages??[]) as Output[];
 for(const item of planned.output.unplaced??[]){const p=placements.find(entry=>entry.cueId===item.cueId);if(!p)continue;delete p.row;delete p.column;const next=byNumber.find(page=>page.page>p.page&&page.free>0&&page.cueKeys>0);if(next)p.page=next.page}
 planned=await call('sync_deck_with_catalog',{cueIds,placements},'dry run, placements moved');
}
report.syncPlanned=syncView(planned);
const deckRead=await call('get_deck',{},'version');
const deckVersion=deckRead.output.deckVersion??deckRead.output.version;
const sync=await call('sync_deck_with_catalog',{dryRun:false,expectedVersion:deckVersion,...(cueIds.length?{cueIds}:{}),...(placements.length?{placements}:{})});
report.sync={...syncView(sync),deckVersionAfter:sync.output.deckVersion??sync.output.version};
if(sync.isError)fail('3','sync_deck_with_catalog',sync);
if(serviceId){
 const check=await call('check_service_on_deck',{serviceId});
 report.checkService=check.isError?{sentence:check.text}:{...check.output,workspaceId:undefined,shortName:undefined,host:undefined};
 if(check.isError||check.output.ready!==true)fail('3','check_service_on_deck',check.isError?check:{...check,output:{message:`${check.output.missingCount} of ${check.output.needed} needed graphics are not on the deck.`}});
}
const validate=await call('validate_deck',{});
report.validate=validate.isError?{sentence:validate.text}:{ok:validate.output.ok,summary:validate.output.summary,errors:(validate.output.errors??[]).map((item:Output)=>item.message),warningCount:(validate.output.warnings??[]).length};
if(validate.isError||validate.output.ok===false)fail('3','validate_deck',validate);
const exported=await call('export_deck_config',{scope:'full'});
// Only that a signed link was produced and when it expires; never the link or its signature.
report.export=exported.isError?{sentence:exported.text}:{linkProduced:typeof(exported.output.url??exported.output.link??exported.output.downloadUrl)==='string',expiresAt:exported.output.expiresAt??null,sha256:exported.output.sha256??null,connectionLabels:exported.output.connectionLabels??exported.output.connections??null,keys:Object.keys(exported.output)};
if(exported.isError)fail('3','export_deck_config',exported);

const write=()=>{const out={...report,calls,stepCounts:calls.reduce((m:Record<string,number>,c)=>{m[c.step]=(m[c.step]??0)+1;return m},{}),callCounts:calls.reduce((m:Record<string,number>,c)=>{m[c.tool]=(m[c.tool]??0)+1;return m},{}),totalCalls:calls.length,fits,failures,transportCalls};const text=JSON.stringify(out,null,1);if(OUT)fs.writeFileSync(OUT,text);console.log(text)};
write();
