import test from 'node:test';
import assert from 'node:assert/strict';
import {withPinnedCue} from '../lib/playback-snapshot.ts';

test('publication cannot replace the selected graphic, even on a fresh output', () => {
  const old = {id: 'prayer', text: 'reviewed revision'};
  const latest = [{id: 'prayer', text: 'new revision'}, {id: 'other', text: 'other'}];
  const result = withPinnedCue(latest, 'prayer', old);
  assert.deepEqual(result.find(c => c.id === 'prayer'), old);
  assert.equal(latest[0].text, 'new revision');
  assert.deepEqual(withPinnedCue(latest, 'prayer', latest[0]), [latest[1], latest[0]]);
});

test('cleared or mismatched state cannot substitute a different cue', () => {
  const catalog = [{id: 'a', text: 'a'}];
  assert.equal(withPinnedCue(catalog, null, catalog[0]), catalog);
  assert.equal(withPinnedCue(catalog, 'a', {id: 'b', text: 'b'}), catalog);
  assert.equal(withPinnedCue(catalog, 'a', null), catalog);
});
