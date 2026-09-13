import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {loadSourceLibrary,siddurLibrary,sourceDisplay,type LibrarySource} from '../lib/source-library.ts';

const legacy=JSON.parse(readFileSync(new URL('../content/authoring-sources.json',import.meta.url),'utf8'));

test('expanded source pack preserves the complete legacy pack and appends namespaced sources',()=>{
 const merged=loadSourceLibrary() as ReturnType<typeof loadSourceLibrary>&{authorities:unknown[];library:unknown};
 assert.deepEqual(merged.authority,legacy.authority);
 for(const [index,source] of legacy.sources.entries()){
  const mergedSource=merged.sources[index] as LibrarySource;
  assert.equal(mergedSource.id,source.id);
  assert.equal(mergedSource.unitSha256,source.unitSha256);
  assert.deepEqual(mergedSource.blocks,source.blocks);
  assert.equal(mergedSource.book,'CRC Shabbat Morning Siddur');
  assert.equal(mergedSource.service,'Shabbat Morning');
 }
 assert.equal(merged.sources.length,legacy.sources.length+siddurLibrary.sources.length);
 assert.equal(new Set(merged.sources.map(source=>source.id)).size,merged.sources.length);
 assert.ok(siddurLibrary.sources.every(source=>source.id.startsWith('library:')));
});

test('every expanded block preserves exact bilingual, original English, or classified source English',()=>{
 const blockIds=new Set<string>();
 for(const source of siddurLibrary.sources){
  assert.match(source.sourceSha256,/^[0-9a-f]{64}$/);
  assert.equal(source.sourceSha256,source.unitSha256);
  assert.equal(source.authority.unitSha256,source.unitSha256);
  assert.ok(source.book);
  assert.ok(source.service);
  assert.ok(Array.isArray(source.aliases));
  assert.ok(Array.isArray(source.openingWords));
  for(const block of source.blocks){
   assert.equal(blockIds.has(block.id),false,`duplicate block ${block.id}`);
   blockIds.add(block.id);
   assert.match(block.sourceBlockSha256,/^[0-9a-f]{64}$/);
   if(block.kind==='bilingual'){
    assert.ok(block.he);
    assert.ok(block.tr);
    if(block.en!==undefined){assert.ok(block.englishRole);assert.equal(typeof block.automatic,'boolean');assert.equal(typeof block.noteLike,'boolean')}
   }else if(block.kind==='original-en'){
    assert.ok(block.en);
    assert.equal(block.role,'original');
    assert.equal(block.he,undefined);
    assert.equal(block.tr,undefined);
   }else if(block.kind==='source-en'){
    assert.ok(block.en);assert.ok(block.englishRole);assert.equal(typeof block.automatic,'boolean');assert.equal(typeof block.noteLike,'boolean');assert.notEqual(block.role,'original');
   }else assert.fail(`unexpected expanded block kind ${block.kind}`);
  }
 }
});

test('source authorities and coverage are complete and internally consistent',()=>{
 const authorityIds=new Set(siddurLibrary.authorities.map(authority=>authority.id));
 assert.equal(authorityIds.size,12);
 assert.equal(siddurLibrary.coverage.books.length,12);
 for(const source of siddurLibrary.sources as LibrarySource[]){
  assert.ok(authorityIds.has(source.origin));
  assert.equal(source.origin,source.authority.id);
  const authority=siddurLibrary.authorities.find(item=>item.id===source.origin)!;
  assert.equal(source.authority.feedSha256,authority.feedSha256);
  assert.equal(source.authority.repositoryCommit,authority.repositoryCommit);
 }

 const totals=siddurLibrary.coverage.totals as Record<string,number|Record<string,number>>;
 assert.equal(totals.books,12);
 assert.equal(totals.usableUnits,siddurLibrary.sources.length);
 assert.equal(
  totals.pairedBilingualBlocks,
  siddurLibrary.sources.flatMap(source=>source.blocks).filter(block=>block.kind==='bilingual').length,
 );
 assert.equal(
  totals.originalEnglishBlocks,
  siddurLibrary.sources.flatMap(source=>source.blocks).filter(block=>block.kind==='original-en').length,
 );
 assert.equal(totals.originalEnglishBlocks,194,'explicit original English remains distinct');
 assert.equal(
  totals.sourceEnglishBlocks,
  siddurLibrary.sources.flatMap(source=>source.blocks).filter(block=>block.kind==='source-en'||(block.kind==='bilingual'&&Boolean(block.en))).length,
 );
 assert.ok((totals.sourceEnglishBlocks as number)>2000,'previously omitted source English is retained');
 const english=siddurLibrary.sources.flatMap(source=>source.blocks).filter(block=>block.kind==='source-en');
 for(const value of ['(April 6, 2019)','~ Melody by Bonia Shur','Silently:']){
  const note=english.find(block=>block.en===value);assert.ok(note,`known note remains manually available: ${value}`);assert.equal(note.automatic,false);assert.equal(note.noteLike,true);
 }
 assert.ok(english.some(block=>block.englishRole==='unclassified'&&block.automatic===true),'neutral source English remains available automatically');
 for(const role of ['translation','interpretation','translation-interpretation','kavannah','reading','rubric'])assert.ok(english.some(block=>block.englishRole===role),`role ${role} is preserved`);
 assert.ok((totals.skipped as Record<string,number>).unpairedHebrew>0);
 assert.equal((totals.skipped as Record<string,number>).englishWithoutOriginalRole,0);
 assert.ok(siddurLibrary.coverage.books.some(book=>book.unsupportedUnits.length>0));
});

test('provenance display names the printed book, folio, section, and edition instead of a slug',()=>{
 for(const source of siddurLibrary.sources as LibrarySource[]){
  const display=sourceDisplay(source);
  assert.ok(display.bookTitle);
  assert.equal(display.bookTitle,source.metadata.bookTitle);
  assert.notEqual(display.bookTitle,source.book,'the slug carried in book is never shown');
  assert.doesNotMatch(display.bookTitle,/^[a-z0-9]+(?:-[a-z0-9]+)+$/,`slug leaked for ${source.id}`);
  if(display.folio!==null)assert.match(display.folio,/^pp?\. /);
  assert.notEqual(display.edition,null);
 }
});

test('folios read as a citation and non-contiguous pages stay enumerated',()=>{
 const base={id:'library:x:y@x',book:'crc-kol-nidre',origin:'shireishabbat:crc-kol-nidre:dbe6d8c40137cfb0'};
 assert.equal(sourceDisplay({...base,metadata:{bookTitle:'CRC Kol Nidre',folios:[70]}}).folio,'p. 70');
 assert.equal(sourceDisplay({...base,metadata:{bookTitle:'CRC Kol Nidre',folios:[5,6]}}).folio,'pp. 5–6');
 assert.equal(sourceDisplay({...base,metadata:{bookTitle:'CRC Kol Nidre',folios:[6,7,8]}}).folio,'pp. 6–8');
 assert.equal(sourceDisplay({...base,metadata:{bookTitle:'CRC Kol Nidre',folios:[5,9]}}).folio,'pp. 5, 9');
 assert.equal(sourceDisplay({...base,metadata:{bookTitle:'CRC Kol Nidre',folios:[]}}).folio,null);
 assert.equal(sourceDisplay({...base,metadata:{bookTitle:'CRC Kol Nidre'}}).folio,null);
});

test('legacy annotated sources display their printed title and printing, never the bookSlug',()=>{
 const legacySource=(loadSourceLibrary().sources as LibrarySource[]).find(source=>!source.id.startsWith('library:'))!;
 const display=sourceDisplay(legacySource);
 assert.equal(display.bookTitle,'CRC Shabbat Morning Siddur');
 assert.equal(display.edition,'54-page printing');
 assert.notEqual(display.bookTitle,'legacy-shabbat-morning');
});

test('a source with no usable provenance is still never displayed as a slug',()=>{
 assert.deepEqual(sourceDisplay({id:'legacy-shabbat-morning',book:'legacy-shabbat-morning'}),{bookTitle:'Unlabeled book',folio:null,sectionTitle:null,edition:null});
 assert.deepEqual(sourceDisplay(undefined),{bookTitle:'Unlabeled book',folio:null,sectionTitle:null,edition:null});
 assert.equal(sourceDisplay({id:'x',book:'CRC Shabbat Morning Siddur',metadata:{bookSlug:'legacy-shabbat-morning'}}).bookTitle,'CRC Shabbat Morning Siddur');
 assert.equal(sourceDisplay({id:'x',section:'Welcome'}).sectionTitle,'Welcome');
 assert.equal(sourceDisplay({id:'x',section:3}).sectionTitle,null);
});
