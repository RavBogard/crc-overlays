import {describe,expect,it} from 'vitest';
import {commandPayload,decideCommand,librarySourceIds,nextState,outOfPinnedCue,parseCommand,type Command,type LiveState} from '../src/protocol';

/**
 * MCP plan A3: retiring a graphic drops it from the approved catalog on the next sync. The
 * catalog POST never touches live_state, so a graphic that is on air when it is retired keeps
 * its payload in the relay and stays on screen (an open output page also keeps its pinned copy:
 * lib/playback-snapshot.ts withPinnedCue). What the relay must still allow is taking it out:
 * before A3 an 'out' naming a cue missing from the catalog was 'Unknown cue', so the operator's
 * own Out button for that graphic stopped working mid-service and only Clear/Cut could remove it.
 *
 * Rule: an 'out' naming the pinned cue is accepted whether or not the catalog still has it.
 * Everything else about unknown cues is unchanged; an 'in' of a retired graphic is refused.
 */

const retired={id:'cue-retired',authoring:{sourceIds:['library:unit-1']}};
const live=(overrides:Partial<LiveState>={}):LiveState=>({revision:7,cue:'cue-retired',mode:'animate',updated:1_700_000_000_000,cuePayload:retired,catalogVersion:'catalog-v2',...overrides});
const parsed=(overrides:Record<string,unknown>={}):Command=>{const command=parseCommand({action:'out',cue:'cue-retired',commandId:'command_12345678',clientId:null,sequence:null,...overrides});if(!command)throw Error('fixture did not parse');return command};
const decide=(command:Command,current=live(),cueKnown=false)=>decideCommand({command,current,receipt:null,cueKnown,priorSequence:-1});

describe('an on-air graphic that left the catalog',()=>{
 it('can be taken out with its own Out, which then clears the screen',()=>{
  expect(decide(parsed())).toEqual({kind:'applied'});
  const next=nextState(live(),parsed(),null,1_700_000_001_000);
  expect(next).toMatchObject({revision:8,cue:null,cuePayload:null,mode:'animate'});
 });

 it('cannot be put on air again',()=>{
  expect(decide(parsed({action:'in'}))).toEqual({kind:'refused',status:400,error:'Unknown cue'});
 });

 it('does not open a hole for any other unknown cue',()=>{
  expect(decide(parsed({cue:'cue-other'}))).toEqual({kind:'refused',status:400,error:'Unknown cue'});
  // Nothing pinned: an out for the retired id is unknown like any other.
  expect(decide(parsed(),live({cue:null,cuePayload:null}))).toEqual({kind:'refused',status:400,error:'Unknown cue'});
  expect(outOfPinnedCue(live({cue:'cue-retired',cuePayload:null}),parsed())).toBe(false);
 });

 it('still honours the controller sequence and preconditions on that Out',()=>{
  expect(decideCommand({command:parsed({clientId:'controller_1',sequence:3}),current:live(),receipt:null,cueKnown:false,priorSequence:5})).toEqual({kind:'superseded'});
  expect(decide(parsed({ifRevision:6}))).toMatchObject({kind:'refused',precondition:'ifRevision'});
 });

 it('is still named in the cue log with the source ids of the payload the relay held',()=>{
  expect(librarySourceIds(commandPayload(live(),parsed(),null))).toEqual(['library:unit-1']);
  // A cue the catalog still has logs the catalog's copy, as before.
  const catalogCopy={id:'cue-retired',authoring:{sourceIds:['library:unit-2']}};
  expect(commandPayload(live(),parsed(),catalogCopy)).toBe(catalogCopy);
  expect(commandPayload(live(),parsed({action:'in'}),null)).toBeNull();
 });

 it('leaves clear and cut exactly as they were',()=>{
  expect(decide(parsed({action:'clear',cue:null}))).toEqual({kind:'applied'});
  expect(nextState(live(),parsed({action:'cut',cue:null}),null,1)).toMatchObject({cue:null,cuePayload:null,mode:'cut'});
 });
});
