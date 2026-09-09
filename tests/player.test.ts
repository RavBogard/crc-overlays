import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsRevision,effectFrames,incomingStillDesired,tracksFor,type AnimationTrack} from '../lib/player-motion.ts';

test('scale y and translate tracks keep their actual transform axis',()=>{
 assert.deepEqual(effectFrames({effect:'scale',property:'y'},'In'),[{transform:'scaleY(0)'},{transform:'scale(1)'}]);
 assert.deepEqual(effectFrames({effect:'translate',property:'up'},'Out',40),[{transform:'translate(0, 0)'},{transform:'translateY(40px)'}]);
});

test('transition state rejects stale and duplicate revisions',()=>{
 const current={cue:'a',revision:8,mode:'animate'};
 assert.equal(acceptsRevision({cue:'b',revision:7,mode:'animate'},current),false);
 assert.equal(acceptsRevision({cue:'b',revision:8,mode:'cut'},current),false);
 assert.equal(acceptsRevision({cue:'b',revision:9,mode:'animate'},current),true);
});

test('cut and rapid replacement decisions converge on the newest cue',()=>{
 const cut={cue:null,revision:11,mode:'cut'};
 assert.equal(acceptsRevision(cut,{cue:'a',revision:10,mode:'animate'}),true);
 assert.equal(incomingStillDesired('a',{cue:'b',revision:12,mode:'animate'}),false);
 assert.equal(incomingStillDesired('b',{cue:'b',revision:12,mode:'animate'}),true);
});

test('an element receives both its direct track and its archived group track',()=>{
 const tracks:AnimationTrack[]=[
  {element:'Image',direction:'In',effect:{effect:'fade'}},
  {element:'logoGroup',direction:'In',effect:{effect:'scale',property:'xAndY'}},
  {element:'logoGroup',direction:'Out',effect:{effect:'none'}},
 ];
 assert.deepEqual(tracksFor('Image','In',tracks),tracks.slice(0,2));
 assert.deepEqual(tracksFor('Image','Out',tracks),[]);
});
