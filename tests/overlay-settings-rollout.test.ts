import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSettingsOnly, needsRollout, settingsOnly, stableDigest} from '../lib/overlay-settings-rollout';
import type {AuthoringCue} from '../lib/authoring-model';

test('rollout preserves exact published text, manual breaks, groups and unrelated presentation', () => {
  const cue = {id:'test', texts:{textMain:'Edited…\n\nnext',textTranslation:'Custom translation'},contentRows:[{he:'א\nב',tr:'A\nB',en:'edited'}],presentation:{titleFontSize:41,latinLineBreaks:'preserve',largePrint:true}} as unknown as AuthoringCue;
  const after = settingsOnly(cue);
  assertSettingsOnly(cue, after);
  assert.deepEqual(after.texts, cue.texts);
  assert.deepEqual(after.contentRows, cue.contentRows);
  assert.equal(after.presentation?.titleFontSize,41);
  assert.equal(after.presentation?.latinLineBreaks,'preserve');
  assert.equal(needsRollout(after.presentation),false);
  assert.equal(needsRollout(cue.presentation),true);
  after.texts.textMain='changed';
  assert.throws(()=>assertSettingsOnly(cue,after));
});

test('optimistic snapshot digest ignores database JSON key ordering, but detects edits', () => {
  assert.equal(stableDigest({b:2,a:{z:1,y:2}}),stableDigest({a:{y:2,z:1},b:2}));
  assert.notEqual(stableDigest({text:'a\n'}),stableDigest({text:'a'}));
});
