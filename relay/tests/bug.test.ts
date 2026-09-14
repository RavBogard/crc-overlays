import {describe,expect,it} from 'vitest';
import {MAX_BUG_BYTES,MAX_CUE_PAYLOAD_BYTES,MAX_SNAPSHOT_BYTES,MAX_CONTROLLERS,MAX_CONTROLLER_BYTES,jsonBytes,nextState,parseCommand,parseInitialState,validBugPage,type BugState,type Command,type LiveState} from '../src/protocol';

const live=(overrides:Partial<LiveState>={}):LiveState=>({revision:4,cue:'cue-a',mode:'animate',updated:1_700_000_000_000,cuePayload:{id:'cue-a',name:'Shown'},catalogVersion:'catalog-v1',...overrides});
const withBug=(bug:BugState=({on:true,page:'128'}))=>live({bug});
const command=(overrides:Partial<Record<string,unknown>>={})=>({action:'bug',cue:null,bug:{on:true,page:'128'},commandId:'command_12345678',clientId:null,sequence:null,...overrides});
const bugCommand=(bug:BugState|null):Command=>parseCommand(command({bug}))!;

describe('validBugPage',()=>{
 it('accepts null, a single character and a full 12-character label',()=>{
  expect(validBugPage(null)).toBe(true);
  expect(validBugPage('1')).toBe(true);
  expect(validBugPage('123456789012')).toBe(true);
  expect(validBugPage('p. 128')).toBe(true);
  expect(validBugPage('128–129')).toBe(true);
  expect(validBugPage('Kaddish, 12')).toBe(true);
 });

 it('refuses an empty page, a 13th character and anything outside the allowed set',()=>{
  expect(validBugPage('')).toBe(false);
  expect(validBugPage('1234567890123')).toBe(false);
  for(const page of ['<b>','p/128','128\n','א','128;','128"',7,true,undefined,{},['128']])expect(validBugPage(page)).toBe(false);
 });
});

describe('parseCommand for the scan card',()=>{
 it('accepts a bug command carrying a null cue and a bounded page',()=>{
  expect(parseCommand(command())).toEqual({action:'bug',cue:null,bug:{on:true,page:'128'},commandId:'command_12345678',clientId:null,sequence:null,source:'control',serviceRef:null});
  expect(parseCommand(command({bug:{on:false,page:null}}))).toMatchObject({action:'bug',bug:{on:false,page:null}});
  expect(parseCommand(command({bug:{on:true,page:null}}))).toMatchObject({action:'bug',bug:{on:true,page:null}});
 });

 it('drops unknown keys rather than storing them, so MAX_BUG_BYTES bounds the field',()=>{
  const parsed=parseCommand(command({bug:{on:true,page:'128',note:'x'.repeat(4000)}}));
  expect(parsed?.bug).toEqual({on:true,page:'128'});
  expect(jsonBytes(parsed?.bug)).toBeLessThan(MAX_BUG_BYTES);
 });

 it('refuses a bug command with a selected cue, a missing bug, or a page that fails validBugPage',()=>{
  expect(parseCommand(command({cue:'cue-a'}))).toBeNull();
  expect(parseCommand(command({bug:null}))).toBeNull();
  expect(parseCommand({action:'bug',cue:null,commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
  expect(parseCommand(command({bug:{on:true,page:'1234567890123'}}))).toBeNull();
  expect(parseCommand(command({bug:{on:true,page:'<script>'}}))).toBeNull();
  expect(parseCommand(command({bug:{on:true}}))).toBeNull();
  expect(parseCommand(command({bug:{on:'yes',page:'128'}}))).toBeNull();
  expect(parseCommand(command({bug:[{on:true,page:'128'}]}))).toBeNull();
 });

 it('leaves every other action carrying a null bug, and refuses one that attaches a bug',()=>{
  for(const action of ['clear','cut']){
   expect(parseCommand({action,cue:null,commandId:'command_12345678',clientId:null,sequence:null})).toEqual({action,cue:null,bug:null,commandId:'command_12345678',clientId:null,sequence:null,source:'control',serviceRef:null});
   expect(parseCommand({action,cue:null,bug:null,commandId:'command_12345678',clientId:null,sequence:null})).toMatchObject({action,bug:null});
   expect(parseCommand({action,cue:null,bug:{on:true,page:'128'},commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
  }
  expect(parseCommand({action:'in',cue:'cue-a',commandId:'command_12345678',clientId:null,sequence:null})).toMatchObject({action:'in',bug:null});
  expect(parseCommand({action:'in',cue:'cue-a',bug:{on:true,page:'128'},commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
 });
});

describe('nextState and the scan card',()=>{
 it('turns the card on with its page, bumping the revision and touching nothing else',()=>{
  const current=live();
  const next=nextState(current,bugCommand({on:true,page:'128'}),null,1_700_000_000_500);
  expect(next).toEqual({...current,revision:5,updated:1_700_000_000_500,bug:{on:true,page:'128'}});
  expect(next.cue).toBe(current.cue);
  expect(next.cuePayload).toBe(current.cuePayload);
  expect(next.mode).toBe(current.mode);
 });

 it('deletes the field when the card is turned off rather than storing an off',()=>{
  const next=nextState(withBug(),bugCommand({on:false,page:null}),null,1_700_000_000_500);
  expect(Object.hasOwn(next,'bug')).toBe(false);
  expect(JSON.parse(JSON.stringify(next)).bug).toBeUndefined();
  expect(next.revision).toBe(5);
 });

 it('carries a set card through in, out and clear untouched',()=>{
  const current=withBug();
  const selected={id:'cue-b',name:'Next'};
  const shown=nextState(current,parseCommand({action:'in',cue:'cue-b',commandId:'command_abcdefgh',clientId:null,sequence:null})!,selected,20);
  expect(shown).toMatchObject({cue:'cue-b',cuePayload:selected,bug:{on:true,page:'128'}});
  const out=nextState(current,parseCommand({action:'out',cue:'cue-b',commandId:'command_ijklmnop',clientId:null,sequence:null})!,null,30);
  expect(out.bug).toEqual({on:true,page:'128'});
  const cleared=nextState(current,parseCommand({action:'clear',cue:null,commandId:'command_qrstuvwx',clientId:null,sequence:null})!,null,40);
  expect(cleared).toMatchObject({cue:null,cuePayload:null,mode:'animate',bug:{on:true,page:'128'}});
 });

 it('removes the card on cut, so a reconnect cannot resurrect it',()=>{
  const cleared=nextState(withBug(),parseCommand({action:'cut',cue:null,commandId:'command_yzabcdef',clientId:null,sequence:null})!,null,50);
  expect(Object.hasOwn(cleared,'bug')).toBe(false);
  expect(cleared).toMatchObject({cue:null,cuePayload:null,mode:'cut',revision:5});
  expect(JSON.stringify(cleared).includes('bug')).toBe(false);
 });

 it('is idempotent for a repeated off and never mutates the state it was given',()=>{
  const current=live();
  const off=nextState(current,bugCommand({on:false,page:null}),null,60);
  expect(Object.hasOwn(off,'bug')).toBe(false);
  expect(Object.hasOwn(current,'bug')).toBe(false);
  const set=withBug();
  nextState(set,bugCommand({on:false,page:null}),null,70);
  expect(set.bug).toEqual({on:true,page:'128'});
 });
});

describe('persisted live state',()=>{
 it('deserializes a state row written without a bug as no scan card',()=>{
  const row='{"revision":3,"cue":null,"mode":"animate","updated":12,"cuePayload":null}';
  const state=parseInitialState(JSON.parse(row),'catalog-v1');
  expect(state).not.toBeNull();
  expect(Object.hasOwn(state!,'bug')).toBe(false);
  expect(state!.bug).toBeUndefined();
 });

 it('round-trips a set card through JSON, and keeps the field absent when it is off',()=>{
  const stored=JSON.parse(JSON.stringify(withBug({on:true,page:'p. 128'}))) as Record<string,unknown>;
  expect(stored.bug).toEqual({on:true,page:'p. 128'});
  expect(parseInitialState(stored,'catalog-v1')?.bug).toEqual({on:true,page:'p. 128'});
  expect(Object.hasOwn(parseInitialState({...stored,bug:{on:false,page:null}},'catalog-v1')!,'bug')).toBe(false);
  expect(Object.hasOwn(parseInitialState({...stored,bug:null},'catalog-v1')!,'bug')).toBe(false);
 });

 it('refuses an initial state whose bug is malformed rather than silently dropping it',()=>{
  const base={revision:3,cue:null,mode:'animate',updated:12,cuePayload:null};
  expect(parseInitialState({...base,bug:{on:true,page:'1234567890123'}},'catalog-v1')).toBeNull();
  expect(parseInitialState({...base,bug:{page:'128'}},'catalog-v1')).toBeNull();
  expect(parseInitialState({...base,bug:'on'},'catalog-v1')).toBeNull();
 });
});

describe('the MAX_BUG_BYTES reservation',()=>{
 it('comes out of the cue payload headroom, not out of thin air',()=>{
  expect(MAX_BUG_BYTES).toBe(192);
  expect(MAX_CUE_PAYLOAD_BYTES).toBe(MAX_SNAPSHOT_BYTES-4096-MAX_CONTROLLERS*MAX_CONTROLLER_BYTES-MAX_BUG_BYTES);
 });
});
