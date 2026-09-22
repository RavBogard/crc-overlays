import {describe,expect,it} from 'vitest';
import {MAX_LOGO_BYTES,jsonBytes,nextState,parseCommand,parseInitialState,parseLogoState,type Command,type LiveState} from '../src/protocol';

const base=(overrides:Partial<LiveState>={}):LiveState=>({revision:4,cue:null,mode:'animate',updated:100,cuePayload:null,catalogVersion:'v1',...overrides});
const command=(overrides:Partial<Command>={}):Command=>({action:'logo',cue:null,bug:null,logo:{on:true},commandId:'command_12345678',clientId:null,sequence:null,source:'control',serviceRef:null,...overrides});

describe('parseCommand for the resting logo',()=>{
 it('accepts a logo command carrying a null cue and nothing else',()=>{
  expect(parseCommand({action:'logo',cue:null,logo:{on:true},commandId:'command_12345678',clientId:null,sequence:null}))
   .toEqual({action:'logo',cue:null,bug:null,logo:{on:true},commandId:'command_12345678',clientId:null,sequence:null,source:'control',serviceRef:null});
  expect(parseCommand({action:'logo',cue:null,logo:{on:false},commandId:'command_12345678',clientId:null,sequence:null})).toMatchObject({logo:{on:false}});
 });

 it('refuses a logo command that is missing, malformed or carries a cue',()=>{
  expect(parseCommand({action:'logo',cue:null,commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
  expect(parseCommand({action:'logo',cue:null,logo:{on:'yes'},commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
  expect(parseCommand({action:'logo',cue:'cue-a',logo:{on:true},commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
 });

 it('drops unknown keys, so MAX_LOGO_BYTES bounds the field',()=>{
  const parsed=parseLogoState({on:true,page:'128',src:'/somewhere-else.png',size:9999});
  expect(parsed).toEqual({on:true});
  expect(jsonBytes(parsed)).toBeLessThan(MAX_LOGO_BYTES);
 });

 /* The two features never travel together on the wire. A caller that mixes them is refused
    rather than half-applied, which is what keeps a logo press from ever showing a QR card. */
 it('keeps the scan card and the resting logo on separate commands',()=>{
  expect(parseCommand({action:'logo',cue:null,logo:{on:true},bug:{on:true,page:null},commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
  expect(parseCommand({action:'bug',cue:null,bug:{on:true,page:null},logo:{on:true},commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
  for(const action of ['in','out','clear','cut'] as const){
   const cue=action==='in'||action==='out'?'cue-a':null;
   expect(parseCommand({action,cue,logo:{on:true},commandId:'command_12345678',clientId:null,sequence:null})).toBeNull();
  }
 });
});

describe('the resting logo in live state',()=>{
 it('stores an enabled logo and stores off as an absent field',()=>{
  const on=nextState(base(),command(),null,200);
  expect(on).toMatchObject({revision:5,updated:200,logo:{on:true}});
  const off=nextState(on,command({logo:{on:false},commandId:'command_87654321'}),null,300);
  expect(off.revision).toBe(6);
  expect(Object.hasOwn(off,'logo')).toBe(false);
 });

 it('touches nothing but itself',()=>{
  const current=base({cue:'cue-a',cuePayload:{id:'cue-a'},mode:'cut',bug:{on:true,page:'128'}});
  const next=nextState(current,command(),null,200);
  expect(next).toMatchObject({cue:'cue-a',cuePayload:{id:'cue-a'},mode:'cut',bug:{on:true,page:'128'},logo:{on:true}});
 });

 /* A graphic going up, coming down, or being cleared normally never changes the operator's
    setting. Suppressing the mark under a cue is the renderer's job, and the relay does not
    know or care that it happened. */
 it('a cue in, out or clear carries the preference through untouched',()=>{
  const enabled=nextState(base(),command(),null,200);
  const shown=nextState(enabled,command({action:'in',cue:'cue-a',logo:null,commandId:'command_aaaaaaaa'}),{id:'cue-a'},300);
  expect(shown.logo).toEqual({on:true});
  const out=nextState(shown,command({action:'out',cue:'cue-a',logo:null,commandId:'command_bbbbbbbb'}),{id:'cue-a'},400);
  expect(out.logo).toEqual({on:true});
  const cleared=nextState(out,command({action:'clear',logo:null,commandId:'command_cccccccc'}),null,500);
  expect(cleared.logo).toEqual({on:true});
 });

 /* Clear now blanks every layer AND turns the setting off, so the mark cannot come back on
    its own the moment the output is empty again. It waits for a deliberate press. */
 it('a cut blanks the cue, the scan card and the resting logo, and disables the preference',()=>{
  const busy=base({cue:'cue-a',cuePayload:{id:'cue-a'},bug:{on:true,page:'128'},logo:{on:true}});
  const next=nextState(busy,command({action:'cut',logo:null,commandId:'command_dddddddd'}),null,600);
  expect(next.cue).toBeNull();
  expect(next.mode).toBe('cut');
  expect(Object.hasOwn(next,'bug')).toBe(false);
  expect(Object.hasOwn(next,'logo')).toBe(false);
  // ...and the empty output that follows still shows nothing, because the setting is gone.
  const stillEmpty=nextState(next,command({action:'clear',logo:null,commandId:'command_eeeeeeee'}),null,700);
  expect(Object.hasOwn(stillEmpty,'logo')).toBe(false);
 });
});

describe('surviving a restart',()=>{
 /* The worker keeps live state in the Durable Object's SQL storage as one JSON row, written
    on every accepted command and read back on boot. An evicted or redeployed worker therefore
    finds the preference exactly as it left it — this is the round trip that guarantees it. */
 it('the persisted state row carries the preference across a worker restart',()=>{
  const enabled=nextState(base(),command(),null,200);
  const reread=JSON.parse(JSON.stringify(enabled)) as LiveState;
  expect(reread.logo).toEqual({on:true});
  const disabled=nextState(enabled,command({logo:{on:false},commandId:'command_ffffffff'}),null,300);
  expect(JSON.parse(JSON.stringify(disabled)).logo).toBeUndefined();
 });

 /* A row written by a worker build that predates the feature has no `logo` key at all, and
    reads as "the operator has not turned it on" — the quiet startup, not a broken field. */
 it('a state row written before the feature reads as off',()=>{
  const stored={revision:1,cue:null,mode:'animate',updated:12,cuePayload:null};
  const parsed=parseInitialState(stored,'catalog-v1')!;
  expect(Object.hasOwn(parsed,'logo')).toBe(false);
  expect(Object.hasOwn(parseInitialState({...stored,logo:null},'catalog-v1')!,'logo')).toBe(false);
  expect(Object.hasOwn(parseInitialState({...stored,logo:{on:false}},'catalog-v1')!,'logo')).toBe(false);
  expect(parseInitialState({...stored,logo:{on:true}},'catalog-v1')).toMatchObject({logo:{on:true}});
  expect(parseInitialState({...stored,logo:{on:'yes'}},'catalog-v1')).toBeNull();
 });
});
