import {describe,expect,it} from 'vitest';
import {HISTORY_KEYS,commandPreconditionFailure,decideCommand,historyRow,lastPressFrom,parseCommand,type Command,type CommandReceipt,type LiveState} from '../src/protocol';

/**
 * MCP plan V1: what the relay did with a command, the commandId on the cue log, the optional
 * preconditions and the press time per controller class. The worker and the rehearsal port both
 * call decideCommand, so every branch is pinned here on plain data; the rehearsal port's own test
 * drives the same branches over HTTP.
 */

const live=(overrides:Partial<LiveState>={}):LiveState=>({revision:4,cue:'cue-a',mode:'animate',updated:1_700_000_000_000,cuePayload:{id:'cue-a'},catalogVersion:'catalog-v1',...overrides});
const raw=(overrides:Record<string,unknown>={})=>({action:'in',cue:'cue-b',commandId:'command_12345678',clientId:null,sequence:null,...overrides});
const parsed=(overrides:Record<string,unknown>={}):Command=>{const command=parseCommand(raw(overrides));if(!command)throw Error('fixture did not parse');return command};
const decide=(command:Command,{current=live(),receipt=null as CommandReceipt|null,cueKnown=true,priorSequence=-1}={})=>decideCommand({command,current,receipt,cueKnown,priorSequence});

describe('parseCommand with the V1 fields',()=>{
 it('leaves a command without them exactly as before',()=>{
  expect(parseCommand(raw())).toEqual({action:'in',cue:'cue-b',bug:null,logo:null,commandId:'command_12345678',clientId:null,sequence:null,source:'control',serviceRef:null});
  expect(Object.keys(parseCommand(raw())!)).not.toContain('ifRevision');
  expect(Object.keys(parseCommand(raw())!)).not.toContain('ifCue');
 });

 it('reads ifRevision as a non-negative integer and ifCue as a cue id or null',()=>{
  expect(parseCommand(raw({ifRevision:0}))?.ifRevision).toBe(0);
  expect(parseCommand(raw({ifRevision:12}))?.ifRevision).toBe(12);
  expect(parseCommand(raw({ifCue:'cue-a'}))?.ifCue).toBe('cue-a');
  // null is a real condition ("only if nothing is pinned"), not the same as leaving it out.
  const empty=parseCommand(raw({ifCue:null}));
  expect(empty&&'ifCue' in empty).toBe(true);
  expect(empty?.ifCue).toBeNull();
 });

 it('refuses a malformed precondition rather than ignoring it',()=>{
  for(const ifRevision of [-1,1.5,'4',null,true,{}])expect(parseCommand(raw({ifRevision}))).toBeNull();
  for(const ifCue of ['',`x${'y'.repeat(160)}`,7,false,{}])expect(parseCommand(raw({ifCue}))).toBeNull();
 });
});

describe('decideCommand outcomes',()=>{
 it('applies a new command from a caller with no controller sequence',()=>{
  expect(decide(parsed())).toEqual({kind:'applied'});
 });

 it('applies a new command whose sequence is above the controller\'s last one',()=>{
  expect(decide(parsed({clientId:'controller_1',sequence:8}),{priorSequence:7})).toEqual({kind:'applied'});
  expect(decide(parsed({clientId:'controller_1',sequence:0}),{priorSequence:-1})).toEqual({kind:'applied'});
 });

 it('supersedes a new command whose sequence a newer press from the same controller already passed',()=>{
  expect(decide(parsed({clientId:'controller_1',sequence:7}),{priorSequence:7})).toEqual({kind:'superseded'});
  expect(decide(parsed({clientId:'controller_1',sequence:3}),{priorSequence:7})).toEqual({kind:'superseded'});
 });

 it('replays a commandId it already holds, and says what the first delivery did',()=>{
  const command=parsed();
  expect(decide(command,{receipt:{action:'in',cue:'cue-b',outcome:'applied'}})).toEqual({kind:'replayed',originalOutcome:'applied'});
  expect(decide(command,{receipt:{action:'in',cue:'cue-b',outcome:'superseded'}})).toEqual({kind:'replayed',originalOutcome:'superseded'});
  // A receipt written by an earlier worker build carries no outcome.
  expect(decide(command,{receipt:{action:'in',cue:'cue-b',outcome:null}})).toEqual({kind:'replayed',originalOutcome:null});
 });

 it('replays before checking a precondition, so a retry of a command that moved the state is not refused',()=>{
  // The first delivery took revision 4 to 5; the retry still says ifRevision 4.
  expect(decide(parsed({ifRevision:4}),{current:live({revision:5,cue:'cue-b'}),receipt:{action:'in',cue:'cue-b',outcome:'applied'}})).toEqual({kind:'replayed',originalOutcome:'applied'});
 });

 it('keeps the existing refusals exactly: a reused commandId and an unknown cue',()=>{
  expect(decide(parsed(),{receipt:{action:'out',cue:'cue-b',outcome:'applied'}})).toEqual({kind:'refused',status:409,error:'Command ID already used for a different command'});
  expect(decide(parsed(),{cueKnown:false})).toEqual({kind:'refused',status:400,error:'Unknown cue'});
  // clear/cut/bug/logo carry no cue, so an unknown cue never applies to them.
  expect(decide(parsed({action:'clear',cue:null}),{cueKnown:false})).toEqual({kind:'applied'});
 });
});

describe('preconditions',()=>{
 it('ifRevision holds only at exactly that revision',()=>{
  expect(decide(parsed({ifRevision:4}))).toEqual({kind:'applied'});
  const refused=decide(parsed({ifRevision:3}));
  expect(refused).toMatchObject({kind:'refused',status:409,precondition:'ifRevision'});
  expect((refused as {error:string}).error).toBe('Live state has moved on: it is at revision 4, not 3. Nothing was changed; read the live state and decide again.');
 });

 it('ifCue holds only while that graphic, or nothing for null, is pinned',()=>{
  expect(decide(parsed({ifCue:'cue-a'}))).toEqual({kind:'applied'});
  expect(decide(parsed({ifCue:null}),{current:live({cue:null,cuePayload:null})})).toEqual({kind:'applied'});
  expect(decide(parsed({ifCue:'cue-z'}))).toMatchObject({kind:'refused',status:409,precondition:'ifCue',error:'A different graphic is live now than the one this command expected. Nothing was changed; read the live state and decide again.'});
  expect(decide(parsed({ifCue:null}))).toMatchObject({precondition:'ifCue',error:'A graphic is live now, not the empty screen this command expected. Nothing was changed; read the live state and decide again.'});
  expect(decide(parsed({ifCue:'cue-a'}),{current:live({cue:null,cuePayload:null})})).toMatchObject({precondition:'ifCue',error:'Nothing is live now, not the graphic this command expected. Nothing was changed; read the live state and decide again.'});
 });

 it('refuses on a failed precondition before the sequence guard, so nothing about the controller moves',()=>{
  expect(decide(parsed({clientId:'controller_1',sequence:3,ifRevision:9}),{priorSequence:7})).toMatchObject({kind:'refused',precondition:'ifRevision'});
 });

 it('checks nothing for a command without preconditions',()=>{
  expect(commandPreconditionFailure(live(),parsed())).toBeNull();
  expect(commandPreconditionFailure(live(),parsed({ifRevision:4,ifCue:'cue-a'}))).toBeNull();
 });
});

describe('the commandId on the cue log',()=>{
 it('is one of the permitted keys and carries the caller\'s id only',()=>{
  expect(HISTORY_KEYS).toContain('commandId');
  const row=historyRow({seq:1,at:2,action:'in',cueId:'cue-a',source:'mcp',serviceRef:null,commandId:'command_12345678'});
  expect(row.commandId).toBe('command_12345678');
  expect(Object.keys(row).sort()).toEqual([...HISTORY_KEYS].sort());
 });

 it('is null for a row without one, and never stores something that is not a command id',()=>{
  expect(historyRow({seq:1,at:2,action:'history_cleared',cueId:null,source:'control',serviceRef:null}).commandId).toBeNull();
  for(const commandId of ['short','has spaces in it','x'.repeat(161),null])expect(historyRow({seq:1,at:2,action:'in',cueId:'cue-a',source:'control',serviceRef:null,commandId}).commandId).toBeNull();
 });
});

describe('last press per controller class',()=>{
 it('always answers all three classes, null for one that has not pressed',()=>{
  expect(lastPressFrom([])).toEqual({control:null,companion:null,mcp:null});
  expect(lastPressFrom([{source:'companion',at:1_800_000_000_000}])).toEqual({control:null,companion:1_800_000_000_000,mcp:null});
 });

 it('keeps the latest time per class and ignores anything it does not recognise',()=>{
  expect(lastPressFrom([{source:'mcp',at:5},{source:'mcp',at:9},{source:'control',at:3},{source:'stage',at:99}])).toEqual({control:3,companion:null,mcp:9});
 });
});
