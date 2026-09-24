import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import type {AuthInfo} from '@modelcontextprotocol/server';
import {createAuthoringMcpHandler} from '../lib/mcp';
import {MemoryAuthoringRepository,createAuthoringService,type ServerFitRunner} from '../lib/authoring';
import type {AuthoringCue} from '../lib/authoring-model';
import {MemoryBuildKeyRepository} from '../lib/build-keys';
import {MemoryImportRepository,bytesSha256,newImportId,type ImportRecord} from '../lib/imports';
import {MemoryLocalSourceRepository,localBlockSha256,localSourceOperation,localSourceUnit,localSourcesAt,type LocalSourceDeps,type LocalSourceRecord} from '../lib/local-sources';
import {panelRowChannels} from '../lib/player';
import {textParts} from '../lib/player-motion';

// Packet G3 (TBI redo): sources with a kind and no printed page, no credit, transliteration-only
// lines, and import_local_sources. Every text below is synthetic; none of it is a real prayer book's.
const authInfo={token:'test',clientId:'client',scopes:['crc.authoring'],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://crc.example/api/mcp'),extra:{actor:'mcp:test-actor'}} satisfies AuthInfo;
// Tool results are parsed JSON whose shape each test asserts as it reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Output=Record<string,any>;
const fit:ServerFitRunner=async()=>({verdict:'pass',fitErrors:[],warnings:[],fill:0.5,artwork:'none',measuredAt:1,rendererVersion:'server-chromium/test'});

function wired(){
 const repo=new MemoryAuthoringRepository(),locals=new MemoryLocalSourceRepository(),imports=new MemoryImportRepository(),buildKeys=new MemoryBuildKeyRepository();
 const service=createAuthoringService(repo,undefined,undefined,async()=>undefined,fit,locals,undefined,undefined,undefined,{imports,buildKeys});
 const handler=createAuthoringMcpHandler((operation,input,actor)=>service.operation(operation,input,actor));
 let id=0;
 const call=async(name:string,args:Record<string,unknown>={}):Promise<{isError:boolean;text:string;output:Output}>=>{
  const response=await handler.fetch(new Request('https://crc.example/api/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:{...args,workspace:'crc'}}})}),{authInfo});
  const raw=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?raw:raw.split(/\r?\n/).find(line=>line.startsWith('data: '))?.slice(6);
  const body=JSON.parse(data??'{}') as {result?:{isError?:boolean;content:Array<{text?:string}>};error?:{message:string}};
  if(body.error)return {isError:true,text:body.error.message,output:{}};
  const text=body.result!.content[0]?.text??'';let output:Output={};try{output=JSON.parse(text)}catch{}
  return {isError:body.result!.isError===true,text,output};
 };
 const op=(operation:string,input:Record<string,unknown>)=>service.operation(operation,input,'tester') as Promise<Output>;
 return {repo,locals,imports,buildKeys,service,call,op};
}
const deps=(overrides:Partial<LocalSourceDeps>={}):LocalSourceDeps=>{let n=0;return {sources:new MemoryLocalSourceRepository(),drafts:async()=>[],workspaceId:'crc',now:()=>1000,newId:()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`,buildKeys:new MemoryBuildKeyRepository(),imports:new MemoryImportRepository(),...overrides}};

const SONG={name:'Harvest Round',kind:'song setting',service:'Friday evening',blocks:[{tr:'Lai la lai, lai la lai',en:'Sing, and sing again'},{tr:'Ya ba bam'},{he:'שִׁירוּ שִׁיר',tr:'Shiru shir',en:'Sing a song'}]};
const TEXT={name:'Welcome at Dusk',kind:'tbi text',attribution:'Written for the congregation',blocks:[{en:'We gather as the light goes.'}]};

test('a song setting and a congregation text need no book, page or credit, and are found by name, text and kind',async()=>{
 const {call,op}=wired();
 const song=await call('add_local_source',SONG);assert.equal(song.isError,false,song.text);
 const source=song.output.source;
 assert.equal(source.kind,'song setting');assert.equal(source.book,null);assert.equal(source.page,null);assert.equal(source.bookValue,null);
 assert.equal(source.attribution,null);assert.equal(source.credit,'not credited','no credit is ever invented');
 assert.deepEqual(source.blocks.map((block:{kind:string})=>block.kind),['bilingual','translation-en','bilingual','bilingual','translation-en']);
 const text=await call('add_local_source',TEXT);assert.equal(text.isError,false,text.text);assert.equal(text.output.source.kind,'tbi text');assert.equal(text.output.source.credit,undefined);
 // Found by name, by its words, and by its kind; never on a page, in a book facet or an outline.
 for(const query of ['harvest round','ya ba bam','song setting']){const found=await call('search_sources',{query,includeBlocks:true});assert.ok(found.output.sources.some((item:Output)=>item.id===source.id),query)}
 const found=(await call('search_sources',{query:'harvest round'})).output.sources.find((item:Output)=>item.id===source.id);
 assert.equal(found.folio,null);assert.equal(found.bookValue,'');assert.equal(found.kind,'song setting');assert.equal(found.credit,'not credited');
 assert.equal((await call('search_sources',{query:'harvest round',page:1})).output.sources.length,0);
 const facets=await op('list_source_facets',{});assert.ok(!facets.books.some((book:{value:string})=>book.value===''));
 const got=await call('get_source',{sourceId:source.id});assert.equal(got.output.local.attribution,null);assert.equal(got.output.local.credit,'not credited');assert.equal(got.output.local.book,null);assert.equal(got.output.display.bookTitle,'Song setting');assert.equal(got.output.display.folio,null);
 assert.deepEqual(localSourcesAt([got.output.source],"Mishkan T'filah",1),[]);
 const listed=await call('list_local_sources',{kind:'song setting'});assert.deepEqual(listed.output.sources.map((item:Output)=>item.id),[source.id]);
 // A graphic built on it carries no credit line: its provenance says not credited.
 const groups=[{sourceId:source.id,blockIds:[source.blocks[0].id]}];
 const draft=await call('create_draft',{name:'Harvest Round',title:'Harvest Round',layout:'left',content:{mode:'bilingual',hebrewGroups:groups,transliterationGroups:groups}});
 assert.equal(draft.isError,false,draft.text);assert.deepEqual(draft.output.provenance.map((item:Output)=>[item.attribution,item.credit,item.kind,item.book,item.page]),[[null,'not credited','song setting',null,null]]);
});

test('page needs book, a prayer-book reading from a named book needs its page, and names are unique per page or per kind',async()=>{
 const {call}=wired();
 assert.match((await call('add_local_source',{...SONG,page:12})).text,/A page needs its book\. Add book/);
 assert.match((await call('add_local_source',{name:'Evening Psalm',book:"Mishkan T'filah",blocks:[{en:'x'}]})).text,/needs its printed page\. Add page, or set kind to 'song setting'/);
 assert.equal((await call('add_local_source',{name:'Evening Psalm',book:"Mishkan T'filah",kind:'song setting',blocks:[{en:'x'}]})).isError,false,'a song printed in a book may have no page');
 assert.equal((await call('add_local_source',{name:'Evening Psalm',blocks:[{en:'x'}]})).isError,false,'a prayer-book reading with no book at all is allowed');
 const first=await call('add_local_source',SONG);assert.equal(first.isError,false);
 const again=await call('add_local_source',{...SONG,blocks:[{en:'other words'}]});
 assert.equal(again.isError,true);assert.match(again.text,/already has a song setting with no printed page named "Harvest Round".*update_local_source/);
 assert.equal((await call('add_local_source',{...SONG,kind:'tbi text'})).isError,false,'the same name as another kind is its own source');
 assert.equal((await call('add_local_source',{...SONG,book:"Mishkan T'filah",page:40})).isError,false,'and so is the same name on a printed page');
 // update: a page can be cleared from a song, not from a reading of a named book.
 const reading=await call('add_local_source',{name:'Morning Reading',book:"Mishkan T'filah",page:7,attribution:'A. Author',blocks:[{en:'Morning comes.'}]});
 const cleared=await call('update_local_source',{sourceId:reading.output.source.id,expectedVersion:1,page:null});
 assert.equal(cleared.isError,true);assert.match(cleared.text,/needs its printed page.*Nothing was changed/);
 const credit=await call('update_local_source',{sourceId:reading.output.source.id,expectedVersion:1,attribution:null});
 assert.equal(credit.isError,false,credit.text);assert.equal(credit.output.source.attribution,null);assert.equal(credit.output.source.credit,'not credited');assert.equal(credit.output.wordingChanged,true);
 assert.match((await call('add_local_source',{...TEXT,name:'Blank credit',attribution:'   '})).text,/attribution .* is empty\. Give the credit as it should read, or leave attribution out/);
});

test('a record that uses none of the new fields keeps the unit hash and block hashes it was pinned by',async()=>{
 const d=deps();
 // Computed with lib/local-sources.ts as it stood at c68d357, before G3.
 await localSourceOperation('add_local_source',{name:'Shalom Rav (TBI)',book:"Mishkan T'filah",page:98,section:'Amidah',attribution:'Traditional',licence:'By permission.',blocks:[{he:'שָׁלוֹם רָב',tr:'Shalom rav',en:'Abundant peace'},{en:'May peace come.'}]},'tester',d);
 const [record]=await d.sources.list();
 assert.equal(record.kind,undefined,'no kind is stored when none is given');
 assert.equal(record.unitSha256,'8bf13114b01206723e801c837ae170c22c75f08084be15768fabdc69cab244f2');
 assert.deepEqual(localSourceUnit(record).blocks.map(block=>block.sourceBlockSha256),['bb6ea09b3fa99592b5fdcd24e6d1cf339d3df7e887f6fa980732aa6742d695fd','8764c9a6e34d4fa2eec69ce48018635ba2c401f7226edabc52e1167332dcdebf','442b7422ad90164f99fc6a5cd2155ab2b51ef4f4bbd857da6c8aa5be6bb54d6a']);
 // A stored pre-G3 record (no kind key at all) reads as a prayer-book reading.
 const legacy:LocalSourceRecord=JSON.parse(JSON.stringify(record));assert.equal(localSourceUnit(legacy).metadata?.localKind,'prayer-book reading');
 // The new field joins the hash when present.
 const withKind=deps();
 await localSourceOperation('add_local_source',{name:'Shalom Rav (TBI)',kind:'prayer-book reading',book:"Mishkan T'filah",page:98,section:'Amidah',attribution:'Traditional',licence:'By permission.',blocks:[{he:'שָׁלוֹם רָב',tr:'Shalom rav',en:'Abundant peace'},{en:'May peace come.'}]},'tester',withKind);
 assert.notEqual((await withKind.sources.list())[0].unitSha256,record.unitSha256);
});

test('a transliteration-only line renders as a transliteration row, never an empty Hebrew row, with its English as the translation',async()=>{
 const {call,op}=wired();
 const source=(await call('add_local_source',SONG)).output.source;
 const ids=source.blocks.filter((block:Output)=>block.kind==='bilingual').map((block:Output)=>block.id);
 const groups=[{sourceId:source.id,blockIds:ids}];
 let made=0;
 const build=async(layout:string,content:Record<string,unknown>,selected=groups)=>{const created=await op('create_draft',{name:`Harvest Round ${++made}`,title:'Harvest Round',layout,applyDefaults:false,content:{mode:'bilingual',hebrewGroups:selected,transliterationGroups:selected,...content}});const preview=await op('preview_draft',{draftId:created.draft.id,expectedVersion:created.draft.version});return preview.cue as AuthoringCue};
 // Together, with translation: one row per line; the sung line has no Hebrew channel at all.
 const translated=[{sourceId:source.id,blockIds:[ids[0],ids[2]]}];
 const together=await build('left',{includeTranslation:true,arrangement:'together'},translated);
 assert.deepEqual(together.contentRows,[{he:'',tr:'Lai la lai, lai la lai',en:'Sing, and sing again'},{he:'שִׁירוּ שִׁיר',tr:'Shiru shir',en:'Sing a song'}]);
 const rendered=together.contentRows!.map(row=>panelRowChannels(row,together.rowOrder).map(item=>item.classes));
 assert.deepEqual(rendered[0],['row-transliteration','row-translation'],'styled as transliteration, its English as the translation');
 assert.equal(together.texts.textMainheb,'שִׁירוּ שִׁיר','only the real Hebrew reaches the Hebrew channel');
 // Together, without translation: the middle line (tr alone, no en) is a row too.
 const plain=await build('left',{arrangement:'together'});
 assert.deepEqual(plain.contentRows,[{he:'',tr:'Lai la lai, lai la lai',en:''},{he:'',tr:'Ya ba bam',en:''},{he:'שִׁירוּ שִׁיר',tr:'Shiru shir',en:''}]);
 assert.deepEqual(plain.contentRows!.map(row=>panelRowChannels(row).map(item=>item.classes)),[['row-transliteration'],['row-transliteration'],['row-hebrew','row-transliteration']]);
 // In blocks: the Hebrew row holds only Hebrew, and no row is empty.
 const blocks=await build('right',{arrangement:'blocks'});
 assert.deepEqual(blocks.contentRows,[{he:'שִׁירוּ שִׁיר',tr:'',en:''},{he:'',tr:'Lai la lai, lai la lai Ya ba bam Shiru shir',en:''}]);
 // A lower third of the sung lines alone draws the transliteration column by itself.
 const sungOnly=[{sourceId:source.id,blockIds:ids.slice(0,2)}];
 const created=await op('create_draft',{name:'Round lower third',title:'Harvest Round',layout:'bottom',applyDefaults:false,content:{mode:'bilingual',hebrewGroups:sungOnly,transliterationGroups:sungOnly}});
 const bottom=(await op('preview_draft',{draftId:created.draft.id,expectedVersion:created.draft.version})).cue as AuthoringCue;
 assert.equal(bottom.texts.textMainheb,undefined,'no empty Hebrew text');
 assert.deepEqual(textParts(bottom.texts).map(part=>[part.element,part.classes]),[['textMainEng','prayer english single-channel']]);
 assert.equal((await op('preview_draft',{draftId:created.draft.id,expectedVersion:created.draft.version})).validation.valid,true);
});

const sha=(block:{he?:string|null;tr?:string|null;en?:string|null})=>createHash('sha256').update(JSON.stringify([block.he?.trim()||null,block.tr?.trim()||null,block.en?.trim()||null])).digest('hex');
const ITEMS=[
 {key:'song-harvest-round',name:'Harvest Round',book:null,page:null,kind:'song setting',section:'Song',service:'Friday evening',attribution:null,licence:null,aliases:['Round'],blocks:[{he:null,tr:'Lai la lai',en:'Sing again'},{tr:'Ya ba bam'}],title:'Harvest Round',layout:'right',panels:[{comp:'x',blocks:[0,1]}],buttons:['1:1:1'],changes:[],missing:[],rowConfidence:'ok',notes:'synthetic'},
 {key:'mt12-evening-psalm',name:'Evening Psalm (MT 12)',book:"Mishkan T'filah",page:12,kind:'prayer-book reading',section:'Evening',service:'Friday evening',attribution:'A. Author',licence:null,aliases:[],blocks:[{en:'Evening falls.'},{he:'עֶרֶב',tr:'Erev',en:'Evening'}],folds:[],stripped:[]},
 {key:'text-welcome',name:'Welcome at Dusk',book:null,page:null,kind:'tbi text',section:null,service:null,attribution:'The congregation',licence:null,aliases:[],blocks:[{en:'We gather.'}],accentTitle:'x'},
];

test('import_local_sources is idempotent by key, reports each block\'s sha256, and a dry run writes nothing',async()=>{
 const d=deps();
 const dry=await localSourceOperation('import_local_sources',{sources:ITEMS,dryRun:true},'tester',d) as Output;
 assert.deepEqual(dry.items.map((item:Output)=>item.status),['would-create','would-create','would-create']);
 assert.equal((await d.sources.list()).length,0,'a dry run writes no source');assert.equal((await d.buildKeys!.list()).length,0,'and no key');
 assert.deepEqual(dry.ignored,['accentTitle','buttons','changes','folds','layout','missing','notes','panels','rowConfidence','stripped','title'],'planning fields are listed once, not refused');
 const first=await localSourceOperation('import_local_sources',{sources:ITEMS},'tester',d) as Output;
 assert.deepEqual(first.totals,{items:3,created:3,updated:0,unchanged:0,refused:0,wouldCreate:0,wouldUpdate:0});
 for(const [index,item] of first.items.entries()){
  assert.deepEqual(item.blockSha256,ITEMS[index].blocks.map(sha),'every block round-trips byte for byte');
  assert.equal(first.keys[ITEMS[index].key],item.sourceId);
 }
 const stored=await d.sources.list();
 for(const record of stored)assert.deepEqual(first.items.find((item:Output)=>item.sourceId===record.id).blockSha256,record.blocks.map(localBlockSha256));
 const song=stored.find(record=>record.name==='Harvest Round')!;assert.equal(song.book,null);assert.equal(song.attribution,null);assert.deepEqual(song.blocks,[{tr:'Lai la lai',en:'Sing again'},{tr:'Ya ba bam'}]);
 const second=await localSourceOperation('import_local_sources',{sources:ITEMS},'tester',d) as Output;
 assert.deepEqual(second.items.map((item:Output)=>item.status),['unchanged','unchanged','unchanged'],'a second run changes nothing');
 assert.deepEqual(second.keys,first.keys);assert.equal((await d.sources.list()).length,3);
 // One changed item updates the same source; a dry run says so first.
 const edited=ITEMS.map(item=>item.key==='text-welcome'?{...item,blocks:[{en:'We gather, again.'}]}:item);
 assert.deepEqual((await localSourceOperation('import_local_sources',{sources:edited,dryRun:true},'tester',d) as Output).items.map((item:Output)=>item.status),['unchanged','unchanged','would-update']);
 const third=await localSourceOperation('import_local_sources',{sources:edited},'tester',d) as Output;
 assert.equal(third.items[2].status,'updated');assert.equal(third.items[2].sourceId,first.keys['text-welcome']);assert.equal(third.items[2].version,2);
 // A key whose source is gone makes a new one and moves the key.
 await d.buildKeys!.put({workspaceId:'crc',kind:'local-source',key:'song-harvest-round',targetId:'local:missing',createdBy:'x',createdAt:1,updatedAt:1});
 const renamed=ITEMS.map(item=>item.key==='song-harvest-round'?{...item,name:'Harvest Round (new)'}:item);
 const moved=await localSourceOperation('import_local_sources',{sources:renamed},'tester',d) as Output;
 assert.equal(moved.items[0].status,'created');assert.equal(moved.items[0].movedKey,true);assert.equal((await d.buildKeys!.get('local-source','song-harvest-round'))!.targetId,moved.items[0].sourceId);
});

test('one bad item never stops the rest, and a normalised block is reported',async()=>{
 const d=deps();
 const items=[
  {key:'good-one',name:'Good One',kind:'tbi text',blocks:[{en:'  Padded line.\r\nSecond line.  '}]},
  {key:'bad-page',name:'Bad Page',kind:'song setting',page:5,blocks:[{en:'x'}]},
  {key:'Not A Key',name:'Bad Key',blocks:[{en:'x'}]},
  'not an object',
  {key:'good-one',name:'Twice',kind:'tbi text',blocks:[{en:'x'}]},
  {key:'good-two',name:'Good Two',kind:'song setting',blocks:[{tr:'La la'}]},
  {key:'good-three',name:'Good One',kind:'tbi text',blocks:[{en:'duplicate name'}]},
 ];
 const result=await localSourceOperation('import_local_sources',{sources:items},'tester',d) as Output;
 assert.deepEqual(result.items.map((item:Output)=>item.status),['created','refused','refused','refused','refused','created','refused']);
 assert.match(result.items[1].reason,/A page needs its book/);
 assert.match(result.items[2].reason,/Item 3's key must be 1-120 characters of lowercase/);
 assert.match(result.items[3].reason,/Item 4 is not an object.*Nothing was changed for it/);
 assert.match(result.items[4].reason,/"good-one" is used by an earlier item/);
 assert.match(result.items[6].reason,/already has a tbi text with no printed page named "Good One".*Nothing was changed for this item/);
 assert.equal(result.totals.created,2);assert.equal(result.totals.refused,5);
 assert.deepEqual(result.items[0].normalised,[{block:0,channel:'en',change:'line endings changed to LF; surrounding whitespace trimmed'}]);
 assert.deepEqual((await d.sources.list()).find(record=>record.name==='Good One')!.blocks,[{en:'Padded line.\nSecond line.'}]);
 assert.equal(result.items[0].blockSha256[0],createHash('sha256').update(JSON.stringify([null,null,'Padded line.\nSecond line.'])).digest('hex'));
 assert.deepEqual(Object.keys(result.keys).sort(),['good-one','good-two']);
});

test('import_local_sources reads a dropped local-sources file by importId through the MCP tool',async()=>{
 const {call,imports,locals}=wired();
 const bytes=new TextEncoder().encode(JSON.stringify({items:ITEMS}));
 const record:ImportRecord={id:newImportId(),workspaceId:'crc',kind:'local-sources',tokenSha256:'0'.repeat(64),linkExpiresAt:Date.now()+60_000,status:'ready',fileName:'local-sources-test.json',mediaType:'application/json',totalBytes:bytes.byteLength,receivedBytes:0,nextChunk:0,sha256:bytesSha256(bytes),refusal:null,note:null,createdBy:'tester',createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+3_600_000};
 await imports.insert(record);await imports.append(record.id,0,bytes,Date.now());
 const dry=await call('import_local_sources',{importId:record.id,dryRun:true});
 assert.equal(dry.isError,false,dry.text);assert.equal(dry.output.totals.wouldCreate,3);assert.equal((await locals.list()).length,0);
 assert.equal(dry.output.from.sha256,record.sha256);
 const real=await call('import_local_sources',{importId:record.id});
 assert.equal(real.output.totals.created,3);assert.deepEqual(real.output.items[0].blockSha256,ITEMS[0].blocks.map(sha),'the receipt survives the MCP result shaping');
 assert.equal((await call('import_local_sources',{importId:record.id})).output.totals.unchanged,3);
 const wrong=await imports.insert({...record,id:newImportId(),kind:'deck-plan'});
 const refused=await call('import_local_sources',{importId:wrong.id});assert.equal(refused.isError,true);assert.match(refused.text,/That import is a deck-plan file, not local-sources/);
 const both=await call('import_local_sources',{importId:record.id,sources:[ITEMS[0]]});assert.equal(both.isError,true);assert.match(both.text,/not both\. Nothing was changed/);
});
