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

// MCP plan A3: a graphic retired while on air is missing from the next catalog an open output
// page installs. The output keeps the payload the live state carries, so the screen holds.
test('an on-air graphic that left the catalog stays renderable from the live payload', () => {
  const onAir = {id: 'retired', text: 'on air'};
  const afterRetire = [{id: 'other', text: 'other'}];
  const result = withPinnedCue(afterRetire, 'retired', onAir);
  assert.deepEqual(result, [afterRetire[0], onAir]);
  // Once it is taken out (cue null) the next catalog install drops it for good.
  assert.equal(withPinnedCue(afterRetire, null, null), afterRetire);
});
