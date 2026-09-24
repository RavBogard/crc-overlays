import {describe,expect,it} from 'vitest';
import {HISTORY_KEYS,HISTORY_WINDOW_MS,MAX_HISTORY_BYTES,MAX_HISTORY_PAGE,MAX_HISTORY_SOURCE_IDS,collectionFromNamesCue,historyPage,historyRow,historyWindowStart,librarySourceIds,parseCommand,parseHistoryRange,type HistoryRow} from '../src/protocol';

/**
 * The relay's half of the cue log. The worker's SQL is exercised from the web repository against
 * the rehearsal port; what lives here is every rule the two implementations share, so neither can
 * drift from the ruling: these keys and no more, a bounded window, a source that defaults to
 * plain live control for every client that has never heard of this field, and source ids kept
 * rather than a resolved position, because the relay holds no siddur library.
 */

const row=(seq:number,extra:Partial<HistoryRow>={}):HistoryRow=>historyRow({seq,at:1_800_000_000_000+seq,action:'in',cueId:'cue-a',source:'control',serviceRef:null,...extra});
const COLLECTION='0b2b5f42-6d3a-4a51-9e0f-2f6ad2e8f3c1';

describe('the cue log',()=>{
 it('builds a row of exactly the permitted keys',()=>{
  const built=historyRow({seq:1,at:2,action:'in',cueId:'cue-a',source:'companion',serviceRef:COLLECTION,sourceIds:['library:barechu']});
  expect(Object.keys(built).sort()).toEqual([...HISTORY_KEYS].sort());
  // `commandId` joined the permitted keys under the 2026-09-23 ruling 10 (a correlation id only);
  // a row built without one carries an explicit null rather than omitting the key.
  expect(built).toEqual({seq:1,at:2,action:'in',cueId:'cue-a',source:'companion',serviceRef:COLLECTION,sourceIds:['library:barechu'],commandId:null});
  expect(historyRow({seq:1,at:2,action:'clear',cueId:null,source:'control',serviceRef:null}).sourceIds).toEqual([]);
 });

 it('treats a command that says nothing about itself as plain live control',()=>{
  const base={action:'in',cue:'cue-a',commandId:'command_12345678',clientId:null,sequence:null};
  expect(parseCommand(base)).toMatchObject({source:'control',serviceRef:null});
  expect(parseCommand({...base,source:'companion',serviceRef:COLLECTION})).toMatchObject({source:'companion',serviceRef:COLLECTION});
  expect(parseCommand({...base,source:'stage'})).toBeNull();
  expect(parseCommand({...base,serviceRef:'not-a-collection'})).toBeNull();
 });

 it('keeps the source ids of the graphic that was pinned, and nothing else about it',()=>{
  const payload={id:'cue-a',name:'Barechu',texts:{textTitle:'Barechu'},authoring:{sourceIds:['library:barechu','custom:notes','library:second']}};
  expect(librarySourceIds(payload)).toEqual(['library:barechu','custom:notes','library:second']);
  // A cue published with a bare unit id and no `library:` prefix still names a real position.
  // Dropping it here is what logged four days of null liturgy, so it is kept verbatim now and
  // the web side, which is the only side holding the library, decides what resolves.
  expect(librarySourceIds({id:'cue-b',authoring:{sourceIds:['shma.barchu@legacy-shabbat-morning']}}))
   .toEqual(['shma.barchu@legacy-shabbat-morning']);
  expect(librarySourceIds({id:'cue-c'})).toEqual([]);
  expect(librarySourceIds(null)).toEqual([]);
  expect(librarySourceIds({id:'cue-e',authoring:{sourceIds:['',`library:${'y'.repeat(200)}`]}})).toEqual([]);
  expect(librarySourceIds({id:'cue-d',authoring:{sourceIds:Array.from({length:40},(_,index)=>`library:${index}`)}}).length).toBe(MAX_HISTORY_SOURCE_IDS);
 });

 it('reads a prepared service out of a names panel, which is the one surface that names one',()=>{
  expect(collectionFromNamesCue(`names:${COLLECTION}:03`)).toBe(COLLECTION);
  expect(collectionFromNamesCue('names:not-a-uuid:03')).toBeNull();
  expect(collectionFromNamesCue('cue-a')).toBeNull();
  expect(collectionFromNamesCue(null)).toBeNull();
 });

 it('reads a range in milliseconds and refuses anything it cannot read exactly',()=>{
  const now=1_800_000_000_000;
  expect(parseHistoryRange(null,null,null,now)).toEqual({since:historyWindowStart(now),until:now,after:0,limit:MAX_HISTORY_PAGE});
  expect(historyWindowStart(now)).toBe(now-HISTORY_WINDOW_MS);
  expect(parseHistoryRange('100','200','5',now,'10')).toEqual({since:100,until:200,after:5,limit:10});
  expect(parseHistoryRange(null,null,null,now,'9000')?.limit).toBe(MAX_HISTORY_PAGE);
  expect(parseHistoryRange(null,null,null,now,'0')).toBeNull();
  expect(parseHistoryRange('200','100',null,now)).toBeNull();
  expect(parseHistoryRange('-1',null,null,now)).toBeNull();
  expect(parseHistoryRange('1.5',null,null,now)).toBeNull();
  expect(parseHistoryRange('yesterday',null,null,now)).toBeNull();
 });

 it('pages inside 256 KiB and reports the cursor to resume from',()=>{
  // A full page of realistic rows fits the cap with room to spare - which is why 500 is the
  // page size - so truncation is shown with four times that many.
  expect(historyPage(Array.from({length:MAX_HISTORY_PAGE},(_,index)=>row(index+1))).nextAfter).toBeNull();
  const wide=Array.from({length:MAX_HISTORY_PAGE*4},(_,index)=>row(index+1,{cueId:`cue-${'x'.repeat(140)}-${index}`,sourceIds:[`library:${'y'.repeat(140)}`]}));
  const page=historyPage(wide);
  expect(page.rows.length).toBeLessThan(wide.length);
  expect(JSON.stringify({workspace:'crc',rows:page.rows,nextAfter:page.nextAfter}).length).toBeLessThanOrEqual(MAX_HISTORY_BYTES);
  expect(page.nextAfter).toBe(page.rows[page.rows.length-1].seq);
  expect(historyPage([row(1),row(2)])).toEqual({rows:[row(1),row(2)],nextAfter:null});
  // One row larger than the whole cap is still answered rather than silently lost.
  expect(historyPage([row(1,{cueId:'x'.repeat(160)})],64).rows.length).toBe(1);
 });
});
