import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsRevision,effectFrames,incomingStillDesired,measuredBottomTextHeight,textParts,tracksFor,type AnimationTrack} from '../lib/player-motion.ts';
import {panelRowChannels,panelRowGap,panelStackGeometry,usesPanelRows,type ContentRow} from '../lib/player.ts';

test('scale y and translate tracks keep their actual transform axis',()=>{
 assert.deepEqual(effectFrames({effect:'scale',property:'y'},'In'),[{transform:'scaleY(0)'},{transform:'scale(1)'}]);
 assert.deepEqual(effectFrames({effect:'translate',property:'up'},'Out',40),[{transform:'translate(0, 0)'},{transform:'translateY(40px)'}]);
});

test('panel bilingual stack places Hebrew immediately after measured transliteration',()=>{
 assert.deepEqual(panelStackGeometry(337.2,431.1),{englishTop:209,englishHeight:338,gap:19,hebrewTop:566,hebrewHeight:432});
 assert.deepEqual(panelStackGeometry(120,180),{englishTop:410,englishHeight:120,gap:88,hebrewTop:618,hebrewHeight:180});
});

test('structured rows use bounded inter-row spacing that preserves four-row fit',()=>{
 assert.equal(panelRowGap([190,190,190,190]),16);
 assert.equal(panelRowGap([100,100]),56);
 assert.equal(panelRowGap([420,420]),4);
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

test('combined and lone language cues receive full-width single-channel treatment',()=>{
 assert.deepEqual(textParts({textMain:'English only'}),[
  {classes:'prayer combined single-channel',text:'English only',element:'textMain'},
 ]);
 assert.deepEqual(textParts({textMainEng:'Transliteration only'}),[
  {classes:'prayer english single-channel',text:'Transliteration only',element:'textMainEng'},
 ]);
 assert.equal(textParts({textMainEng:'Transliteration',textMainheb:'Hebrew'}).some(part=>part.classes.includes('single-channel')),false);
});

test('bottom height follows unscaled measured content with a crest-safe minimum',()=>{
 assert.equal(measuredBottomTextHeight([128,167.2]),168);
 assert.equal(measuredBottomTextHeight([0,44]),84);
 assert.equal(measuredBottomTextHeight([]),84);
});

test('structured source rows replace aggregate panel text without changing lower thirds',()=>{
 const contentRows:ContentRow[]=[{he:'עברית',tr:'Transliteration',en:'Translation'}];
 assert.equal(usesPanelRows({layout:'left',contentRows}),true);
 assert.equal(usesPanelRows({layout:'right',contentRows}),true);
 assert.equal(usesPanelRows({layout:'bottom',contentRows}),false);
 assert.equal(usesPanelRows({layout:'left'}),false);
 assert.deepEqual(panelRowChannels(contentRows[0]).map(({element,animationElement,text})=>({element,animationElement,text})),[
  {element:'textMainheb',animationElement:'textMainheb',text:'עברית'},
  {element:'textMainEng',animationElement:'textMainEng',text:'Transliteration'},
  {element:'textTranslation',animationElement:'textMainEng',text:'Translation'},
 ]);
});
