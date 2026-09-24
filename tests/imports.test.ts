import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {IMPORT_LIMITS,MemoryImportRepository,PgImportRepository,appendDrop,beginDrop,checkImportContent,csvRows,dropzoneFor,finishDrop,imageInfo,readImportJson,type ImportRepository} from '../lib/imports';
import {importToolOperation,type ImportToolDeps} from '../lib/import-tools';
import {importDropPost} from '../lib/import-http';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {deckConversionOperation,DeckConversionError,type DeckConversionDeps} from '../lib/companion-deck/convert';
import {MemoryCompanionDeckRepository} from '../lib/companion-deck/repository';
import {MemorySingularReferenceRepository,normaliseSingularExtract,SINGULAR_EXTRACT} from '../lib/companion-deck/singular-references';

// TBI redo G1: the dropzone store, its token-gated intake, the tools that read it, and
// import_singular_extract by importId in the flat shape. Everything runs on the memory store.
const T0=1_800_000_000_000;
const ORIGIN='https://overlays.example.org';
const deps=(repository:ImportRepository,now=()=>T0):ImportToolDeps=>({repository,workspaceId:'temple-bnai-israel-kalamazoo',shortName:'TBI',origin:ORIGIN,now});
const tokenOf=(url:string)=>url.slice(`${ORIGIN}/import/`.length);
type Opened={importId:string;url:string;linkExpiresAt:number;kind:string;maxBytes:number;next:string};
async function open(repository:ImportRepository,kind:string,now=()=>T0){return await importToolOperation('open_import_dropzone',{kind},'member:daniel',deps(repository,now)) as Opened}
async function drop(repository:ImportRepository,token:string,bytes:Uint8Array,now=T0,fileName='file.json'){
 await beginDrop(repository,token,{fileName,mediaType:'application/json',totalBytes:bytes.byteLength},now);
 for(let index=0,offset=0;offset<bytes.byteLength;index++,offset+=IMPORT_LIMITS.chunkBytes)await appendDrop(repository,token,index,bytes.subarray(offset,offset+IMPORT_LIMITS.chunkBytes),now);
 return finishDrop(repository,token,now);
}
const utf8=(value:unknown)=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));
const MARKER='Lecha dodi likrat kalah MARKER-TEXT';
/** A synthetic extract in the recovered file's flat shape: two apps, three compositions. */
const flatExtract=()=>({source:'synthetic test fixture',extractedAt:'2026-09-24T00:00:00.000Z',
 apps:[{label:'kab',compositionRefId:1,rootName:'Kabbalat Shabbat',topLevelSubs:2},{label:'morn',compositionRefId:2,rootName:'Morning',topLevelSubs:1}],
 subcompositions:[
  {id:'c1',name:'Lecha Dodi 1',parentApp:'kab',path:'Kabbalat Shabbat/Lecha Dodi 1',layer:'Lower',fieldSignature:'title|text',fields:{title:{index:0,title:'Title',type:'text',value:'Lecha Dodi'},text:{index:1,title:'Text',type:'textarea',value:MARKER}}},
  {id:'c2',name:'Shalom Aleichem',parentApp:'kab',path:'x',layer:null,fieldSignature:'title',fields:{title:{index:0,title:'Title',type:'text',value:'Shalom Aleichem'}}},
  {id:'c3',name:'Modeh Ani',parentApp:'morn',path:'y',layer:'Full',fieldSignature:'',fields:{}},
 ]});
const png=(width:number,height:number)=>{const b=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(b,0);b.writeUInt32BE(13,8);b.write('IHDR',12,'latin1');b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return new Uint8Array(b)};

test('a dropzone opens, receives a file in order, and is ready with its sha256; results never carry content',async()=>{
 const repo=new MemoryImportRepository(),opened=await open(repo,'singular-extract');
 assert.match(opened.importId,/^import_[a-f0-9]{32}$/);
 assert.ok(opened.url.startsWith(`${ORIGIN}/import/`));
 assert.equal(opened.linkExpiresAt,T0+30*60_000);
 assert.equal(opened.maxBytes,2*1024*1024);
 const stored=await repo.get(opened.importId);
 assert.equal(stored!.tokenSha256,createHash('sha256').update(tokenOf(opened.url)).digest('hex'),'only the token hash is stored');
 assert.ok(!JSON.stringify(stored).includes(tokenOf(opened.url)));
 const bytes=utf8(flatExtract());
 const done=await drop(repo,tokenOf(opened.url),bytes);
 assert.equal(done.status,'ready');
 assert.equal(done.sha256,createHash('sha256').update(bytes).digest('hex'));
 const got=await importToolOperation('get_import',{importId:opened.importId},'member:daniel',deps(repo)) as Record<string,unknown>;
 assert.deepEqual([got.status,got.kind,got.bytes,got.fileName,got.mediaType],['ready','singular-extract',bytes.byteLength,'file.json','application/json']);
 assert.deepEqual(got.summary,{shape:'flat',apps:[{app:'kab',compositions:2},{app:'morn',compositions:1}],total:3});
 const listed=await importToolOperation('list_imports',{},'member:daniel',deps(repo));
 for(const result of [opened,got,listed])assert.ok(!JSON.stringify(result).includes('MARKER-TEXT'),'no tool result carries file content');
 assert.ok(!JSON.stringify(got).includes(tokenOf(opened.url))&&!JSON.stringify(listed).includes(tokenOf(opened.url)),'nor the token');
 // Dropped again while the link is open, the file is replaced.
 const again=await drop(repo,tokenOf(opened.url),utf8({apps:[{label:'kab',subcompositions:[{id:'a',name:'A',layer:null,fields:{}}]}]}));
 assert.equal(again.status,'ready');
 assert.deepEqual((await importToolOperation('get_import',{importId:opened.importId},'m',deps(repo)) as {summary:unknown}).summary,{shape:'nested',apps:[{app:'kab',compositions:1}],total:1});
});

test('a link works only until it expires, and only by its own token',async()=>{
 const repo=new MemoryImportRepository(),opened=await open(repo,'local-sources'),token=tokenOf(opened.url);
 assert.ok(await dropzoneFor(repo,token,T0+1));
 assert.equal(await dropzoneFor(repo,token,opened.linkExpiresAt),null);
 assert.equal(await dropzoneFor(repo,`${token.slice(0,-1)}${token.endsWith('A')?'B':'A'}`,T0),null);
 assert.equal(await dropzoneFor(repo,'short',T0),null);
 await assert.rejects(beginDrop(repo,token,{fileName:'a.json',totalBytes:10},opened.linkExpiresAt+1),(e:Error&{code?:string})=>e.code==='link_closed'&&/expired or is not valid\. Ask for a new link\./.test(e.message));
 const got=await importToolOperation('get_import',{importId:opened.importId},'m',deps(repo,()=>opened.linkExpiresAt+1)) as {status:string;next:string};
 assert.equal(got.status,'waiting');assert.match(got.next,/link expired before a file arrived/);
 // Kept 7 days, then gone.
 await assert.rejects(importToolOperation('get_import',{importId:opened.importId},'m',deps(repo,()=>T0+IMPORT_LIMITS.keepMs)),/no such import in TBI, or it has expired/);
});

test('parts must arrive in order and within the size caps',async()=>{
 const repo=new MemoryImportRepository(),opened=await open(repo,'deck-plan'),token=tokenOf(opened.url);
 await assert.rejects(appendDrop(repo,token,0,utf8('x'),T0),(e:Error&{code?:string})=>e.code==='not_receiving');
 await assert.rejects(beginDrop(repo,token,{fileName:'big.csv',totalBytes:IMPORT_LIMITS.jsonBytes+1},T0),(e:Error&{code?:string})=>e.code==='too_large'&&/larger than 2 MB/.test(e.message));
 await assert.rejects(beginDrop(repo,token,{fileName:'none.csv',totalBytes:0},T0),/empty/);
 await beginDrop(repo,token,{fileName:'C:\\Users\\x\\plan.csv',totalBytes:6},T0);
 assert.equal((await repo.get(opened.importId))!.fileName,'plan.csv','the path is dropped from the file name');
 await assert.rejects(appendDrop(repo,token,1,utf8('abc'),T0),(e:Error&{code?:string})=>e.code==='out_of_order'&&/part 0 was expected/.test(e.message));
 await appendDrop(repo,token,0,utf8('a,b\n'),T0);
 await assert.rejects(finishDrop(repo,token,T0),(e:Error&{code?:string})=>e.code==='incomplete');
 await assert.rejects(appendDrop(repo,token,1,utf8('1,2,3'),T0),/lost its place/,'more than totalBytes is refused');
 await appendDrop(repo,token,1,utf8('1,'),T0);
 assert.equal((await finishDrop(repo,token,T0)).status,'ready');
 await assert.rejects(appendDrop(repo,token,2,new Uint8Array(IMPORT_LIMITS.chunkBytes+1),T0),/Start the upload again/);
 const image=await open(repo,'asset');
 await assert.rejects(beginDrop(repo,tokenOf(image.url),{fileName:'x.png',totalBytes:IMPORT_LIMITS.imageBytes+1},T0),/larger than 5 MB/);
});

test('content is checked by kind: JSON, CSV or JSON, images by magic bytes, and credentials refused without echo',()=>{
 assert.deepEqual(checkImportContent('singular-extract',utf8({apps:[]})),{ok:true,mediaType:'application/json'});
 assert.deepEqual(checkImportContent('singular-extract',utf8('\uFEFF{"a":1}')),{ok:true,mediaType:'application/json'},'a byte-order mark is allowed');
 assert.match((checkImportContent('local-sources',utf8('a,b\n1,2')) as {refusal:string}).refusal,/not valid JSON/);
 assert.match((checkImportContent('local-sources',new Uint8Array([0xff,0xfe,0x00])) as {refusal:string}).refusal,/not UTF-8 JSON/);
 assert.deepEqual(checkImportContent('deck-plan',utf8('page,row\n1,0')),{ok:true,mediaType:'text/csv'});
 assert.deepEqual(checkImportContent('deck-plan',utf8([{page:1}])),{ok:true,mediaType:'application/json'});
 assert.deepEqual(checkImportContent('asset',png(10,20)),{ok:true,mediaType:'image/png'});
 assert.match((checkImportContent('asset',utf8('GIF89a......')) as {refusal:string}).refusal,/not a PNG, JPEG or WebP/);
 assert.match((checkImportContent('asset',new Uint8Array(IMPORT_LIMITS.imageBytes+1)) as {refusal:string}).refusal,/larger than 5 MB/);
 const secret='https://app.singular.live/apiv2/control/SECRETVALUE123';
 const json=checkImportContent('singular-extract',utf8({apps:[{label:'kab',notes:secret}]})) as {ok:false;refusal:string};
 assert.equal(json.ok,false);assert.match(json.refusal,/looks like a credential \(at file\.apps\[0\]\.notes\)/);assert.ok(!json.refusal.includes('SECRETVALUE123'));
 assert.match((checkImportContent('local-sources',utf8([{key:'a',apiKey:'x'}])) as {refusal:string}).refusal,/at file\[0\]\.apiKey/);
 const csv=checkImportContent('deck-plan',utf8(`page,row,target\n1,0,ok\n1,1,${secret}`)) as {ok:false;refusal:string};
 assert.match(csv.refusal,/at line 3/);assert.ok(!csv.refusal.includes('SECRETVALUE123'));
 assert.deepEqual(csvRows('a,"b,c",d\r\n"x ""y""",2,\n\n'),[['a','b,c','d'],['x "y"','2','']]);
 const jpeg=new Uint8Array([0xff,0xd8,0xff,0xe0,0x00,0x04,0x00,0x00,0xff,0xc0,0x00,0x0b,0x08,0x02,0x58,0x03,0x20,0x03,0x01,0x11,0x00,0xff,0xd9]);
 assert.deepEqual(imageInfo(jpeg),{mediaType:'image/jpeg',width:800,height:600});
});

test('a refused drop says why, get_import summarises by kind, and a reader refuses the wrong kind',async()=>{
 const repo=new MemoryImportRepository();
 const bad=await open(repo,'local-sources');
 const refused=await drop(repo,tokenOf(bad.url),utf8([{key:'a',password:'hunter2'}]));
 assert.equal(refused.status,'refused');assert.ok(!refused.refusal!.includes('hunter2'));
 const view=await importToolOperation('get_import',{importId:bad.importId},'m',deps(repo)) as {status:string;refusal:string;summary?:unknown;next:string};
 assert.equal(view.status,'refused');assert.equal(view.summary,undefined);assert.match(view.next,/drop a corrected file on the same link/);
 await assert.rejects(readImportJson(repo,bad.importId,'local-sources',T0),(e:Error&{code?:string})=>e.code==='import_refused');
 const sources=await open(repo,'local-sources');
 await drop(repo,tokenOf(sources.url),utf8([{key:'a',name:'A'},{key:'b'},{name:'no key'},{key:'a'}]));
 assert.deepEqual((await importToolOperation('get_import',{importId:sources.importId},'m',deps(repo)) as {summary:unknown}).summary,{items:4,keys:2,missingKey:1,missingKeyAt:[2]});
 const plan=await open(repo,'deck-plan');
 await drop(repo,tokenOf(plan.url),utf8('page,row,col,label\n1,0,1,"Shalom, friends"\n1,0,2,Zoom\n'),T0,'deck-plan.csv');
 assert.deepEqual((await importToolOperation('get_import',{importId:plan.importId},'m',deps(repo)) as {summary:unknown}).summary,{format:'csv',rows:2,columns:['page','row','col','label']});
 const image=await open(repo,'asset');
 await drop(repo,tokenOf(image.url),png(1410,1182),T0,'qr.png');
 const imageView=await importToolOperation('get_import',{importId:image.importId},'m',deps(repo)) as {mediaType:string;summary:unknown};
 assert.equal(imageView.mediaType,'image/png');assert.deepEqual(imageView.summary,{mediaType:'image/png',width:1410,height:1182});
 await assert.rejects(readImportJson(repo,image.importId,'singular-extract',T0),(e:Error&{code?:string})=>e.code==='wrong_import_kind'&&/That import is an asset file, not singular-extract/.test(e.message));
 const waiting=await open(repo,'singular-extract');
 await assert.rejects(readImportJson(repo,waiting.importId,'singular-extract',T0),(e:Error&{code?:string})=>e.code==='import_not_ready');
 await assert.rejects(importToolOperation('get_import',{importId:'import_nope'},'m',deps(repo)),/importId must be the id open_import_dropzone returned/);
 // Another workspace's import is not this one's.
 await assert.rejects(importToolOperation('get_import',{importId:image.importId},'m',{...deps(repo),workspaceId:'crc',shortName:'CRC'}),/no such import in CRC/);
});

test('at most ten dropzones wait at once; expired imports are swept on open',async()=>{
 const repo=new MemoryImportRepository();
 for(let i=0;i<IMPORT_LIMITS.open;i++)await open(repo,'asset');
 await assert.rejects(open(repo,'asset'),(e:Error&{code?:string})=>e.code==='too_many_dropzones'&&/already has 10 dropzones waiting for a file\..*Nothing was opened\./.test(e.message));
 // Their links expire: new ones may open, and the waiting ones are still kept until their 7 days pass.
 await open(repo,'asset',()=>T0+IMPORT_LIMITS.linkTtlMs+1);
 assert.equal(repo.rows.size,11);
 await open(repo,'asset',()=>T0+IMPORT_LIMITS.keepMs+1);
 assert.equal(repo.rows.size,2,'the expired ten are swept');
 await assert.rejects(importToolOperation('open_import_dropzone',{kind:'video'},'m',deps(repo)),/kind must be one of singular-extract, local-sources, asset, deck-plan\. Nothing was opened\./);
 await assert.rejects(importToolOperation('open_import_dropzone',{kind:'asset',extra:1},'m',deps(repo)),/remove extra\. Nothing was changed\./);
});

test('the flat extract normalises into the nested shape, grouped by parentApp',()=>{
 const normalised=normaliseSingularExtract(flatExtract());
 assert.equal(normalised.ok,true);
 const parsed=SINGULAR_EXTRACT.parse((normalised as {extract:unknown}).extract);
 assert.deepEqual(parsed.apps.map(app=>[app.label,app.name,app.id,app.subcompositions.map(c=>c.id)]),[['kab','Kabbalat Shabbat','1',['c1','c2']],['morn','Morning','2',['c3']]]);
 assert.deepEqual(parsed.apps[0].subcompositions[0].fields.title,{title:'Title',type:'text',value:'Lecha Dodi'},'index, path and fieldSignature are dropped');
 // A parentApp apps[] does not describe still becomes an app; an unknown key is a shape problem.
 const extra=flatExtract();extra.subcompositions.push({...extra.subcompositions[2],id:'c4',parentApp:'hhd'});
 assert.deepEqual((SINGULAR_EXTRACT.parse((normaliseSingularExtract(extra) as {extract:unknown}).extract)).apps.map(a=>a.label),['kab','morn','hhd']);
 const wrong=normaliseSingularExtract({subcompositions:[{id:'x',name:'X',layer:null,fields:{}}]});
 assert.equal(wrong.ok,false);assert.deepEqual((wrong as {issue:{path:unknown[]}}).issue.path,['subcompositions',0,'parentApp']);
});

test('import_singular_extract reads a ready import by importId, in the flat shape, and refuses the wrong kind',async()=>{
 const imports=new MemoryImportRepository(),references=new MemorySingularReferenceRepository();
 const conversion:DeckConversionDeps={workspace:'tbi',repository:new MemoryCompanionDeckRepository(),cues:async()=>[],committedSeed:async()=>{throw new Error('unused')},now:()=>T0,references,imports};
 const run=(input:unknown)=>deckConversionOperation('import_singular_extract',input,'mcp:tester',conversion) as Promise<Record<string,unknown>>;
 const opened=await open(imports,'singular-extract');
 await drop(imports,tokenOf(opened.url),utf8(flatExtract()));
 const dry=await run({importId:opened.importId});
 assert.deepEqual([dry.dryRun,dry.total,dry.shape],[true,3,'flat']);
 assert.deepEqual((dry.apps as {app:string;compositions:number}[]).map(a=>[a.app,a.compositions]),[['kab',2],['morn',1]]);
 assert.deepEqual(dry.from,{importId:opened.importId,sha256:createHash('sha256').update(utf8(flatExtract())).digest('hex'),bytes:utf8(flatExtract()).byteLength});
 assert.ok(!JSON.stringify(dry).includes('MARKER-TEXT'));
 assert.equal(await references.get('tbi'),null);
 const stored=await run({importId:opened.importId,dryRun:false});
 assert.deepEqual(stored.stored,{version:1,apps:['kab','morn']});
 assert.equal((await references.get('tbi'))!.document.apps[0].compositions[0].text,`Lecha Dodi\n${MARKER}`);
 // The flat shape inline works the same way.
 assert.equal((await run({extract:flatExtract()})).total,3);
 await assert.rejects(run({extract:flatExtract(),importId:opened.importId}),/Pass either extract .* or importId .*not both/);
 await assert.rejects(run({}),/not both and not neither/);
 const image=await open(imports,'asset');
 await drop(imports,tokenOf(image.url),png(4,4));
 await assert.rejects(run({importId:image.importId}),(e:unknown)=>e instanceof DeckConversionError&&e.code==='wrong_import_kind');
 await assert.rejects(deckConversionOperation('import_singular_extract',{importId:opened.importId},'m',{...conversion,imports:null}),(e:unknown)=>e instanceof DeckConversionError&&e.code==='imports_unavailable');
 const shapeless=await open(imports,'singular-extract');
 await drop(imports,tokenOf(shapeless.url),utf8({subcompositions:[{id:'x',name:'X',layer:null,fields:{}}]}));
 await assert.rejects(run({importId:shapeless.importId}),/in neither expected shape.*at file\.subcompositions\.0\.parentApp/);
});

test('the chunk route: public by token, raw bytes in parts, headers that keep the link private',async()=>{
 const repo=new MemoryImportRepository(),opened=await open(repo,'singular-extract'),token=tokenOf(opened.url);
 const post=(query:string,body:BodyInit,type='application/json')=>importDropPost(new Request(`${ORIGIN}/api/imports/${token}?${query}`,{method:'POST',headers:{'content-type':type},body}),token,repo,T0);
 const bytes=utf8(flatExtract());
 const begun=await post('step=begin',JSON.stringify({fileName:'extract.json',mediaType:'application/json',totalBytes:bytes.byteLength}));
 assert.equal(begun.status,200);
 for(const [key,value] of Object.entries({'cache-control':'no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'}))assert.equal(begun.headers.get(key),value);
 assert.deepEqual(await begun.json(),{status:'receiving',receivedBytes:0,totalBytes:bytes.byteLength,refusal:null,chunkBytes:IMPORT_LIMITS.chunkBytes});
 assert.equal((await post('step=chunk&index=0',bytes,'text/plain')).status,415);
 assert.equal((await post('step=chunk&index=0',new Uint8Array(IMPORT_LIMITS.chunkBytes+1),'application/octet-stream')).status,413);
 assert.equal((await post('step=chunk&index=0',bytes,'application/octet-stream')).status,200);
 const finished=await post('step=finish','{}');
 assert.deepEqual(await finished.json(),{status:'ready',receivedBytes:bytes.byteLength,totalBytes:bytes.byteLength,refusal:null});
 const stranger=await importDropPost(new Request(`${ORIGIN}/api/imports/x?step=begin`,{method:'POST',body:'{}'}),'A'.repeat(32),repo,T0);
 assert.equal(stranger.status,404);assert.match((await stranger.json() as {error:string}).error,/expired or is not valid/);
});

test('Postgres: rows are one workspace\'s, chunks append in SQL, and a missing table is a sentence',async()=>{
 const calls:{sql:string;values:unknown[]}[]=[];
 const repo=new PgImportRepository('tbi-ws',{query:async(sql,values=[])=>{calls.push({sql,values});return {rows:[],rowCount:0}}});
 assert.equal(await repo.append('import_x',2,utf8('ab'),T0),null);
 assert.match(calls[0].sql,/SET data=data\|\|\$4,received_bytes=received_bytes\+\$5,next_chunk=next_chunk\+1.*WHERE id=\$1 AND workspace_id=\$2 AND next_chunk=\$3/);
 assert.deepEqual(calls[0].values.slice(0,3),['import_x','tbi-ws',2]);
 await repo.update('import_x',{status:'receiving',totalBytes:9,resetData:true});
 assert.match(calls[1].sql,/SET status=\$3,total_bytes=\$4,data=''::bytea,received_bytes=0,next_chunk=0 WHERE id=\$1 AND workspace_id=\$2/);
 const missing=new PgImportRepository('tbi-ws',{query:async()=>{throw Object.assign(new Error('relation does not exist'),{code:'42P01'})}});
 assert.equal(await missing.get('import_x'),null);
 assert.deepEqual(await missing.list(T0),[]);
 await assert.rejects(missing.sweep(T0),(e:Error&{code?:string;status?:number})=>e.code==='imports_unavailable'&&e.status===503&&/not set up in this workspace's database yet \(db\/imports\.sql\)\. Nothing was saved/.test(e.message));
});

test('over the MCP: the three tools, open needs the workspace, and results name the congregation',async()=>{
 const repo=new MemoryImportRepository();
 const handler=createAuthoringMcpHandler(async(operation,input,actor)=>importToolOperation(operation,input,actor,{...deps(repo),workspaceId:'crc',shortName:'CRC'}));
 const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:x:member:m'}} satisfies AuthInfo;
 let id=0;
 const call=async(name:string,args:Record<string,unknown>)=>{const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}})}),{authInfo});const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);const body=JSON.parse(data??'{}') as {result:{isError?:boolean;content:{text:string}[]}};return {isError:body.result.isError===true,text:body.result.content[0].text}};
 const refused=await call('open_import_dropzone',{kind:'asset'});
 assert.equal(refused.isError,true);
 const opened=await call('open_import_dropzone',{kind:'asset',workspace:'crc'});
 assert.equal(opened.isError,false,opened.text);
 const output=JSON.parse(opened.text) as {workspaceId:string;importId:string;url:string};
 assert.equal(output.workspaceId,'crc');
 const got=await call('get_import',{importId:output.importId});
 assert.equal(JSON.parse(got.text).status,'waiting');
 assert.equal(JSON.parse((await call('list_imports',{})).text).count,1);
});
