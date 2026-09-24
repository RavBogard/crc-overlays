import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {liveSetlistDependencies,MemoryServicesRepository,preparedService,ServicesManager,type ServiceCollection,type ServicesLoaders} from '../lib/service-collections.ts';
import {reconcileRows,type ServiceRow} from '../lib/service-rows.ts';
import {matchSetlist,type LiveSetlist,type LiveSetlistTransport} from '../lib/live-setlists.ts';
import type {LiturgyRef} from '../lib/liturgy-index.ts';
import type {Cue} from '../lib/player.ts';

/* S1 (R-S1) - the ordered `rows[]` spine and its lazy migration. Every stored document here is
   hand-written test data in the pre-S1 shape (tests/fixtures/services/); nothing is read from
   any real database. */

const json=<T,>(path:string):T=>JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${path}`,import.meta.url)),'utf8')) as T;
const library=json<{cues:Cue[];liturgy:Record<string,LiturgyRef>}>('setlists/catalog.json');
const NO_LITURGY:LiturgyRef={unitId:null,momentId:null,book:null,folio:null};
const preImported=()=>json<{document:ServiceCollection}>('services/pre-s1-imported.json').document;
const preManual=()=>json<{document:ServiceCollection}>('services/pre-s1-manual.json').document;

function fixture(documents:ServiceCollection[]=[]){
 const repository=new MemoryServicesRepository();let now=5000,id=0;
 for(const document of documents)repository.collections.set(document.id,structuredClone(document));
 const catalog={cues:structuredClone(library.cues),version:'v1'};
 const loaders:ServicesLoaders={catalog:async()=>structuredClone(catalog),sources:()=>[{id:'source:mah',name:'Mah Tovu source',blocks:[{}]}],now:()=>++now,id:()=>`id-${++id}`,liveCue:async()=>null};
 return {repository,catalog,manager:new ServicesManager(repository,loaders)};
}
// The request bodies app/services/page.tsx sends: entries and coverage stripped of enrichment.
const webEntries=(value:{entries:{id:string;type:string;label:string;cueIds:string[]}[]})=>value.entries.map(({id,type,label,cueIds})=>({id,type,label,cueIds}));
const webCoverage=(value:{coverage:Record<string,unknown>[]})=>value.coverage.map(({id,label,status,cueId,sourceId,owner,reason})=>({id,label,status,cueId,sourceId,owner,reason}));
const shape=(rows:ServiceRow[])=>rows.map(row=>[row.label,row.status??null,row.entryId??null,row.coverageId??null]);

/* ---------- migration on read ---------- */

test('a pre-S1 imported service opens with its entries, coverage and names untouched, plus rows in setlist order',async()=>{
 const stored=preImported();
 const {manager,repository}=fixture([stored]);
 const {collections:[opened]}=await manager.dashboard({});
 // Everything the web shows is exactly what was stored.
 for(const key of ['id','name','service','version','archived','names','createdAt','updatedAt','createdBy','updatedBy'] as const)assert.deepEqual(opened[key],stored[key],key);
 assert.deepEqual(webEntries(opened),stored.entries);
 assert.deepEqual(webCoverage(opened).map(row=>Object.fromEntries(Object.entries(row).filter(([,value])=>value!==undefined))),stored.coverage);
 assert.deepEqual(opened.coverage.map(row=>row.computedStatus),['not-needed','covered','needs-cue','needs-review','covered']);
 assert.ok(opened.entries.every(entry=>entry.available));
 // Rows: the coverage order is the setlist order, and each graphic joins its moment.
 assert.deepEqual(shape(opened.rows),[
  ['Zog Nit Keyn Mol','not-needed',null,'c-zog-nit'],
  ['Barechu','covered','e-barechu','c-barechu'],
  ['Hashkiveinu','needs-cue',null,'c-hashkiveinu'],
  ['Mi Chamocha','needs-review','e-mi-chamocha','c-mi-chamocha'],
  ['Oseh Shalom','covered','e-oseh-shalom','c-oseh-shalom'],
 ]);
 assert.deepEqual(opened.rows[3].candidateCueIds,['cue-mi-chamocha-klepper','cue-mi-chamocha-friedman'],'a choice left for review carries its candidates');
 assert.ok(opened.rows.filter((_,index)=>index!==3).every(row=>row.candidateCueIds.length===0));
 assert.equal(opened.origin,null,'provenance that was never stored is not invented');
 // Reading is not writing: the stored document is byte-for-byte what it was, and a second read gives the same row ids.
 assert.deepEqual(repository.collections.get(stored.id),stored);
 const again=await manager.dashboard({});
 assert.deepEqual(again.collections[0].rows,opened.rows);
});

test('a hand-built pre-S1 service keeps both orders: coverage leads, unpaired entries sit before the next paired one',()=>{
 const stored=preManual();
 const {rows}=preparedService(stored);
 assert.deepEqual(rows.map(row=>row.id),['row-c-c-candles','row-e-e-welcome','row-c-c-barechu','row-c-c-kiddush','row-e-e-closing']);
 assert.deepEqual(shape(rows),[
  ['Candle lighting','intentional-fallback',null,'c-candles'],
  ['Welcome',null,'e-welcome',null],
  ['Barechu','covered','e-barechu','c-barechu'],
  ['Kiddush','needs-cue',null,'c-kiddush'],
  ['Closing sequence',null,'e-closing',null],
 ]);
 // Every entry and every coverage item is linked exactly once.
 assert.deepEqual(rows.flatMap(row=>row.entryId?[row.entryId]:[]).sort(),stored.entries.map(entry=>entry.id).sort());
 assert.deepEqual(rows.flatMap(row=>row.coverageId?[row.coverageId]:[]).sort(),stored.coverage.map(item=>item.id).sort());
});

test('an empty pre-S1 service has no rows, and unreadable stored rows are dropped instead of failing the read',()=>{
 assert.deepEqual(preparedService({...preManual(),entries:[],coverage:[]}).rows,[]);
 const stored=preManual();
 const rows=reconcileRows([null,'x',{label:'no id'},{id:'kept',label:'Pause',candidateCueIds:['cue-shma','cue-shma',7],note:'Silent'},{id:'dangling',label:'Gone',entryId:'e-deleted'},{id:'dup',label:'A',coverageId:'c-barechu'},{id:'dup',label:'B',coverageId:'c-kiddush'}],stored.entries,stored.coverage);
 assert.deepEqual(rows[0],{id:'kept',label:'Pause',candidateCueIds:['cue-shma'],note:'Silent'},'a row stored without links is kept as it is');
 assert.ok(!rows.some(row=>row.id==='dangling'),'a row whose only link is gone is dropped');
 assert.equal(rows.find(row=>row.id==='dup')?.coverageId,'c-barechu','a repeated row id is read once');
 assert.equal(rows.filter(row=>row.coverageId==='c-kiddush').length,1,'the item the repeated row pointed at still gets exactly one row');
});

/* ---------- the web's operations on the new shape ---------- */

test('moving an entry on /services reorders only rows with a graphic; moments without one keep their place',async()=>{
 const {manager,repository}=fixture([preImported()]);
 const {collections:[opened]}=await manager.dashboard({});
 // moveEntry(2,-1): Oseh Shalom above Mi Chamocha, then Oseh Shalom above Barechu.
 const entries=webEntries(opened);[entries[1],entries[2]]=[entries[2],entries[1]];[entries[0],entries[1]]=[entries[1],entries[0]];
 const saved=await manager.updateCollection({id:opened.id,expectedVersion:opened.version,entries,coverage:webCoverage(opened)},'member:editor');
 assert.deepEqual(saved.entries.map(entry=>entry.id),['e-oseh-shalom','e-barechu','e-mi-chamocha']);
 assert.deepEqual(saved.rows.map(row=>row.label),['Zog Nit Keyn Mol','Oseh Shalom','Hashkiveinu','Barechu','Mi Chamocha']);
 assert.deepEqual(saved.coverage.map(row=>row.id),opened.coverage.map(row=>row.id),'coverage is untouched');
 // The first write of a pre-S1 document stores the migrated shape, and only that document.
 const written=repository.collections.get(opened.id)!;
 assert.equal(written.version,4);
 assert.deepEqual(written.rows,saved.rows);
 assert.equal(written.origin,null);
 assert.deepEqual(written.names,preImported().names,'the names list rides along unchanged');
});

test('removing a graphic keeps its moment in place; removing the moment too removes the row',async()=>{
 const {manager}=fixture([preImported()]);
 let current=(await manager.dashboard({})).collections[0];
 current=await manager.updateCollection({id:current.id,expectedVersion:current.version,entries:webEntries(current).filter(entry=>entry.id!=='e-barechu'),coverage:webCoverage(current)},'member:editor');
 assert.deepEqual(shape(current.rows)[1],['Barechu','covered',null,'c-barechu'],'the moment stays second with no graphic linked');
 current=await manager.updateCollection({id:current.id,expectedVersion:current.version,entries:webEntries(current),coverage:webCoverage(current).filter(row=>row.id!=='c-barechu')},'member:editor');
 assert.deepEqual(current.rows.map(row=>row.label),['Zog Nit Keyn Mol','Hashkiveinu','Mi Chamocha','Oseh Shalom']);
});

test('adding and editing on /services: new entries and coverage get rows at the end, edits flow into the row',async()=>{
 const {manager}=fixture([preImported()]);
 let current=(await manager.dashboard({})).collections[0];
 const keptIds=current.rows.map(row=>row.id);
 // addSelection('cue') and addCoverage, exactly as the page sends them (new items have no id).
 current=await manager.updateCollection({id:current.id,expectedVersion:current.version,entries:[...webEntries(current),{type:'cue',label:'Shma',cueIds:['cue-shma']}],coverage:webCoverage(current)},'member:editor');
 current=await manager.updateCollection({id:current.id,expectedVersion:current.version,entries:webEntries(current),coverage:[...webCoverage(current),{label:'Kiddush',status:'needs-cue',owner:'Daniel',reason:'Make one.'}]},'member:editor');
 assert.deepEqual(current.rows.slice(0,5).map(row=>row.id),keptIds,'existing rows keep their ids');
 assert.deepEqual(shape(current.rows.slice(5)),[['Shma',null,current.entries[3].id,null],['Kiddush','needs-cue',null,current.coverage[5].id]]);
 // Resolving the review on the coverage form: the row mirrors the new status and label.
 const coverage=webCoverage(current).map(row=>row.id==='c-mi-chamocha'?{...row,label:'Mi Chamocha (Klepper)',status:'covered',cueId:'cue-mi-chamocha-klepper',owner:undefined}:row);
 current=await manager.updateCollection({id:current.id,expectedVersion:current.version,entries:webEntries(current),coverage},'member:editor');
 const row=current.rows.find(item=>item.coverageId==='c-mi-chamocha')!;
 assert.equal(row.status,'covered');assert.equal(row.label,'Mi Chamocha (Klepper)');assert.equal(row.entryId,'e-mi-chamocha');
 assert.equal(current.rows.indexOf(row),3,'still fourth');
});

test('names, archive and restore on a pre-S1 service keep rows and return the migrated shape',async()=>{
 const {manager,repository}=fixture([preImported()]);
 const opened=(await manager.dashboard({})).collections[0];
 const cleared=await manager.clearNames({id:opened.id,expectedVersion:opened.version},'member:editor');
 assert.deepEqual(cleared.rows,opened.rows);
 const archived=await manager.setCollectionArchived({id:opened.id,expectedVersion:cleared.version},'member:editor',true);
 const restored=await manager.setCollectionArchived({id:opened.id,expectedVersion:archived.version},'member:editor',false);
 assert.deepEqual(restored.rows,opened.rows);
 assert.deepEqual(repository.collections.get(opened.id)?.entries,preImported().entries);
});

/* ---------- the importer writes the new shape ---------- */

function deps(){let n=0;return {cues:library.cues,liturgyFor:(cue:Cue)=>library.liturgy[cue.id]??NO_LITURGY,id:()=>`m-${++n}`}}

test('the matcher writes one row per performance row, in setlist order, including rows with no graphic',()=>{
 const {entries,coverage,rows}=matchSetlist(json<LiveSetlist>('setlists/mixed-order.json'),deps());
 assert.deepEqual(rows.map(row=>[row.trackId,row.setlistPosition,row.label,row.status]),[
  ['t-zog-nit',2,'Zog Nit Keyn Mol','not-needed'],
  ['t-barechu',3,'Barechu','covered'],
  ['t-hashkiveinu',4,'Hashkiveinu','needs-cue'],
  ['t-mi-chamocha',5,'Mi Chamocha','needs-review'],
  ['t-oseh-shalom',7,'Oseh Shalom','covered'],
 ]);
 assert.deepEqual(rows.map(row=>row.coverageId),coverage.map(item=>item.id),'every row links its own coverage item');
 assert.deepEqual(rows.flatMap(row=>row.entryId?[row.entryId]:[]),entries.map(entry=>entry.id),'rows with a graphic link their entry, in the same order');
 assert.deepEqual(rows[3].candidateCueIds.sort(),['cue-mi-chamocha-friedman','cue-mi-chamocha-klepper']);
 assert.equal(new Set([...entries.map(e=>e.id),...coverage.map(c=>c.id),...rows.map(r=>r.id)]).size,entries.length+coverage.length+rows.length,'ids never collide');
});

test('a single plausible candidate is recorded on the row even though no alternates entry is made',()=>{
 const setlist:LiveSetlist={id:'s',name:'s',tracks:[{id:'t-1',title:'Shalom',type:'song'}]};
 const {entries,coverage,rows}=matchSetlist(setlist,deps());
 assert.equal(entries.length,0,'one candidate is not a choice between alternates');
 assert.deepEqual(rows.map(row=>[row.status,row.candidateCueIds,row.coverageId]),[['needs-review',['cue-oseh-shalom'],coverage[0].id]]);
 assert.ok(coverage[0].reason?.includes('Oseh Shalom'),'the reason still names it');
});

test('import_setlist stores rows and origin, keeps setlist order, and the web sees the same entries and coverage as before',async()=>{
 const setlist=json<LiveSetlist>('setlists/mixed-order.json');
 const original={...liveSetlistDependencies};
 const calls:string[]=[];
 const transport:LiveSetlistTransport=async(tool,args)=>{calls.push(`${tool}:${String(args.id)}`);return structuredClone(setlist)};
 Object.assign(liveSetlistDependencies,{availability:()=>({available:true,reason:'ok'}),createTransport:()=>transport,liturgyFor:(cue:Cue)=>library.liturgy[cue.id]??NO_LITURGY});
 try{
  const {repository,manager}=fixture();
  const result=await manager.importSetlist({setlistId:'setlist-mixed-order'},'member:editor');
  assert.deepEqual(calls,['get_setlist:setlist-mixed-order']);
  const {collection}=result;
  assert.deepEqual(collection.rows.map(row=>[row.label,row.status,Boolean(row.entryId)]),[
   ['Zog Nit Keyn Mol','not-needed',false],
   ['Barechu','covered',true],
   ['Hashkiveinu','needs-cue',false],
   ['Mi Chamocha','needs-review',true],
   ['Oseh Shalom','covered',true],
  ]);
  assert.deepEqual(collection.origin,{setlistId:'setlist-mixed-order',trackIds:['t-zog-nit','t-barechu','t-hashkiveinu','t-mi-chamocha','t-oseh-shalom'],eventDate:'2026-10-02T23:30:00.000Z',importedAt:collection.origin!.importedAt});
  assert.equal(typeof collection.origin!.importedAt,'number');
  // What the page renders is what the pre-S1 importer produced for the same setlist.
  const before=preImported();
  assert.deepEqual(collection.entries.map(({type,label,cueIds})=>({type,label,cueIds})),before.entries.map(({type,label,cueIds})=>({type,label,cueIds})));
  assert.deepEqual(collection.coverage.map(({label,status,cueId,owner})=>({label,status,cueId,owner})),before.coverage.map(({label,status,cueId,owner})=>({label,status,cueId,owner})));
  // The same decisions; since the unit-id match a liturgy row's reason names the unit it matched on.
  assert.deepEqual(collection.coverage.map(row=>row.reason),before.coverage.map(row=>row.reason==='Matched page 12 of shabbat-evening in the published library.'?'Matched opening.barechu@legacy-shabbat-evening in the published library.':row.reason?.replace('Two graphics match this page.','Several graphics carry geulah.mi-chamocha@legacy-shabbat-evening.')));
  assert.deepEqual(result.unmatched.map(row=>row.trackId),['t-zog-nit','t-hashkiveinu','t-mi-chamocha']);
  // Stored as written; reading it back changes nothing.
  const stored=repository.collections.get(collection.id)!;
  assert.deepEqual(stored.rows,collection.rows);
  assert.deepEqual(preparedService(stored).rows,stored.rows);
 }finally{Object.assign(liveSetlistDependencies,original)}
});

test('services created on the web get rows for what they hold and no origin',async()=>{
 const {manager}=fixture();
 const created=await manager.createCollection({name:'Friday',service:'Evening',entries:[{id:'one',type:'cue',label:'Barechu',cueIds:['cue-barechu']}],coverage:[{id:'c-one',label:'Barechu',status:'covered',cueId:'cue-barechu'}]},'member:editor');
 assert.deepEqual(shape(created.rows),[['Barechu','covered','one','c-one']]);
 assert.equal(created.origin,null);
 await assert.rejects(()=>manager.createCollection({name:'x',service:'y',rows:[],origin:{setlistId:'forged'}},'member:editor'),/unsupported fields: rows, origin/);
});
