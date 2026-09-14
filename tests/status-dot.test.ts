import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {readSnapshot} from '../lib/output-presence.ts';

/* Layout pass (handoff #2, D1): the header dot is the whole operator-facing health readout.
   Green means a graphics output acknowledged within the last 30 seconds — measured against
   the relay's own clock, so a client whose clock is wrong does not turn the dot amber. */

const NOW = 1_700_000_000_000;
const snapshot = (over: Record<string, unknown> = {}) => ({serverTime: NOW, renderers: [], controllers: [], ...over});

test('a fresh output turns the dot green', () => {
  const {state, line} = readSnapshot(snapshot({renderers: [{seen: NOW - 4_000}]}));
  assert.equal(state, 'connected');
  assert.equal(line, 'Output connected');
});

test('Companion is named only when it is actually there', () => {
  assert.equal(readSnapshot(snapshot({renderers: [{seen: NOW}], controllers: [{client: 'companion'}]})).line, 'Output connected · Companion connected');
  assert.equal(readSnapshot(snapshot({renderers: [{seen: NOW}], controllers: [{client: 'browser'}]})).line, 'Output connected');
});

test('an output last seen more than 30 seconds ago is not connected', () => {
  const {state, line} = readSnapshot(snapshot({renderers: [{seen: NOW - 31_000}]}));
  assert.equal(state, 'waiting');
  assert.equal(line, 'No output seen in the last 30 seconds');
  assert.equal(readSnapshot(snapshot({renderers: [{seen: NOW - 30_000}]})).state, 'connected', 'exactly 30 seconds still counts');
});

test('no answer at all is unknown, never a claim that nothing is connected', () => {
  const {state, line} = readSnapshot(null);
  assert.equal(state, 'unknown');
  assert.equal(line, 'Checking the output…');
});

test('the note the dot sends carries the time, the graphic on air and the connection state', () => {
  const dot = readFileSync(fileURLToPath(new URL('../components/status-dot.tsx', import.meta.url)), 'utf8');
  assert.ok(dot.includes("operation: 'record_feedback'"), 'it uses the existing log write');
  assert.ok(dot.includes('context: `On air: ${onAir} · ${line}`'), 'the context is attached, not typed');
  assert.ok(dot.includes('cueId: snapshot?.cue'), 'and the graphic on air is named');
  assert.ok(!dot.includes('<select'), 'no kind, impact or graphic dropdown to fill in mid-service');
});
