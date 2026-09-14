import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEVICE_REVOKED_NOTICE,
  activeDevices,
  deviceKindLabel,
  deviceStandingText,
  hasNamedOutputCredential,
  lastSeenText,
  readDeviceList,
  type PairedDevice,
} from '../app/access/devices-copy.ts';
import {
  OUTPUT_DEVICE_STORAGE_KEY,
  OUTPUT_LEGACY_STORAGE_KEY,
  resolveOutputCredential,
} from '../app/output/output-credential.ts';
import {
  BACKUP_STEP,
  COMPANION_STEP,
  OUTPUT_STEP,
  REHEARSED_STEP,
  autoVerifiedSteps,
  firstUnverifiedStep,
  freshControllerCount,
  freshRendererCount,
  stepsToPersist,
} from '../app/setup/setup-steps.ts';

const now = 1_800_000_000_000;
const device = (overrides: Partial<PairedDevice> = {}): PairedDevice => ({id: 'cd_one', name: 'Sanctuary PC', kind: 'output', lastSeenAt: now - 60_000, revokedAt: null, ...overrides});

/* ---------- /access "Paired devices" copy ---------- */

test('a device row names the kind an operator would recognize', () => {
  assert.equal(deviceKindLabel('companion'), 'Companion');
  assert.equal(deviceKindLabel('output'), 'Graphics output');
  assert.equal(deviceKindLabel('something-new'), 'Device');
});

test('last-seen wording stays plain from seconds to days and never claims a time it does not have', () => {
  assert.equal(lastSeenText(now - 4_000, now), 'Last seen just now');
  assert.equal(lastSeenText(now - 12 * 60_000, now), 'Last seen 12 min ago');
  assert.equal(lastSeenText(now - 5 * 60 * 60_000, now), 'Last seen 5 h ago');
  assert.equal(lastSeenText(now - 4 * 24 * 60 * 60_000, now), 'Last seen 4 days ago');
  assert.equal(lastSeenText(null, now), 'Last seen never');
  assert.equal(lastSeenText(undefined, now), 'Last seen never');
});

test('a revoked device says so instead of reporting a stale last-seen time', () => {
  assert.equal(deviceStandingText(device({kind: 'companion', lastSeenAt: now - 60_000}), now), 'Companion · Last seen 1 min ago');
  assert.equal(deviceStandingText(device({revokedAt: now - 1_000}), now), 'Graphics output · Revoked');
});

test('the revoke notice states what actually happens, not an instant disconnection', () => {
  assert.equal(DEVICE_REVOKED_NOTICE, 'Revoked. This device stops at its next reconnection.');
});

test('the device list drops unusable rows rather than throwing, and hides revoked devices', () => {
  const parsed = readDeviceList({devices: [
    {id: 'cd_a', name: 'Sanctuary PC', kind: 'output', lastSeenAt: now, revokedAt: null},
    {id: 'cd_b', name: 'Booth', kind: 'companion', lastSeenAt: null, revokedAt: now},
    {id: 'cd_c', name: 'Broken', kind: 'printer'},
    {name: 'No id', kind: 'output'},
    null,
  ]});
  assert.deepEqual(parsed.map(row => row.id), ['cd_a', 'cd_b']);
  assert.deepEqual(activeDevices(parsed).map(row => row.id), ['cd_a']);
  assert.deepEqual(readDeviceList({}), []);
  assert.deepEqual(readDeviceList(null), []);
});

test('a named output credential counts only while it is unrevoked', () => {
  assert.equal(hasNamedOutputCredential([device()]), true);
  assert.equal(hasNamedOutputCredential([device({revokedAt: now})]), false);
  assert.equal(hasNamedOutputCredential([device({kind: 'companion'})]), false);
  assert.equal(hasNamedOutputCredential([]), false);
});

/* ---------- /output credential precedence (D5) ---------- */

const resolution = (overrides: Partial<Parameters<typeof resolveOutputCredential>[0]> = {}) =>
  resolveOutputCredential({hash: '', preview: false, storedDevice: null, legacySessionKey: null, ...overrides});

test('the scene file wins: a device fragment beats stored and legacy credentials and is mirrored then cleared', () => {
  const result = resolution({hash: '#device=cd_fragment', storedDevice: 'cd_stored', legacySessionKey: 'legacy-key'});
  assert.equal(result.credential, 'cd_fragment');
  assert.equal(result.source, 'fragment-device');
  assert.equal(result.storeDevice, 'cd_fragment');
  assert.equal(result.clearFragment, true);
});

test('a URL opened without a fragment falls back to the mirrored device before the legacy session key', () => {
  const stored = resolution({storedDevice: 'cd_stored', legacySessionKey: 'legacy-key'});
  assert.equal(stored.credential, 'cd_stored');
  assert.equal(stored.source, 'stored-device');
  assert.equal(stored.clearFragment, false);
  const legacy = resolution({legacySessionKey: 'legacy-key'});
  assert.equal(legacy.credential, 'legacy-key');
  assert.equal(legacy.source, 'legacy-session');
});

test('the legacy #key= path still works and still writes only the legacy session key', () => {
  const result = resolution({hash: '#key=legacy-fragment', storedDevice: 'cd_stored'});
  assert.equal(result.credential, 'legacy-fragment');
  assert.equal(result.source, 'fragment-key');
  assert.equal(result.storeDevice, null);
  assert.equal(result.storeLegacyKey, 'legacy-fragment');
  assert.equal(result.clearFragment, true);
});

test('a preview frame keeps the signed-in session and never persists anything', () => {
  const plain = resolution({preview: true, storedDevice: 'cd_stored', legacySessionKey: 'legacy-key'});
  assert.equal(plain.credential, 'session');
  assert.equal(plain.source, 'preview');
  assert.equal(plain.storeDevice, null);
  const fragment = resolution({preview: true, hash: '#device=cd_fragment'});
  assert.equal(fragment.credential, 'cd_fragment');
  assert.equal(fragment.storeDevice, null);
});

test('nothing supplied resolves to no credential rather than to a guess', () => {
  const result = resolution({hash: '#device=%20', storedDevice: '  '});
  assert.equal(result.credential, '');
  assert.equal(result.source, 'none');
  assert.equal(OUTPUT_DEVICE_STORAGE_KEY, 'crc-output-device');
  assert.equal(OUTPUT_LEGACY_STORAGE_KEY, 'crc-output-key');
});

/* ---------- /setup self-verification (D10) ---------- */

const state = (overrides: Record<string, unknown> = {}) => ({serverTime: now, renderers: [{seen: now - 1_000}], controllers: [{id: 'c1', client: 'companion', version: '1.4.0', seen: now - 4_000}], ...overrides});

test('a fresh controller and a fresh renderer with a named output tick their own steps', () => {
  const verified = autoVerifiedSteps({state: state(), now, hasOutputCredential: true});
  assert.deepEqual(verified, {[COMPANION_STEP]: true, [OUTPUT_STEP]: true});
});

test('a named output alone is not a connected output, and a renderer alone is not a named output', () => {
  assert.equal(autoVerifiedSteps({state: state({renderers: []}), now, hasOutputCredential: true})[OUTPUT_STEP], undefined);
  assert.equal(autoVerifiedSteps({state: state(), now, hasOutputCredential: false})[OUTPUT_STEP], undefined);
});

test('a stale or future controller is not present, and an older relay without controllers verifies nothing', () => {
  assert.equal(freshControllerCount(state({controllers: [{client: 'companion', seen: now - 31_000}]}), now), 0);
  assert.equal(freshControllerCount(state({controllers: [{client: 'companion', seen: now + 5_000}]}), now), 0);
  assert.equal(freshControllerCount(state({controllers: [{client: 'companion', seen: now - 30_000}]}), now), 1);
  const older = {serverTime: now, renderers: [{seen: now - 1_000}]};
  assert.equal(freshControllerCount(older, now), 0);
  assert.deepEqual(autoVerifiedSteps({state: older, now, hasOutputCredential: true}), {[OUTPUT_STEP]: true});
});

test('an unreachable relay verifies nothing and never un-ticks a recorded step', () => {
  assert.deepEqual(autoVerifiedSteps({state: null, now, hasOutputCredential: true}), {});
  assert.equal(freshRendererCount(null, now), 0);
  assert.deepEqual(stepsToPersist({[COMPANION_STEP]: true}, {}), {});
});

test('only newly verified steps are written back to the progress store', () => {
  const verified = autoVerifiedSteps({state: state(), now, hasOutputCredential: true});
  assert.deepEqual(stepsToPersist({}, verified), {[COMPANION_STEP]: true, [OUTPUT_STEP]: true});
  assert.deepEqual(stepsToPersist({[COMPANION_STEP]: true}, verified), {[OUTPUT_STEP]: true});
  assert.deepEqual(stepsToPersist({[COMPANION_STEP]: true, [OUTPUT_STEP]: true}, verified), {});
});

test('a returning installer lands on the first step that is still unverified', () => {
  assert.equal(firstUnverifiedStep({}), BACKUP_STEP);
  assert.equal(firstUnverifiedStep({[BACKUP_STEP]: true}), COMPANION_STEP);
  assert.equal(firstUnverifiedStep({[BACKUP_STEP]: true, [COMPANION_STEP]: true}), OUTPUT_STEP);
  assert.equal(firstUnverifiedStep({[BACKUP_STEP]: true, [COMPANION_STEP]: true, [OUTPUT_STEP]: true}), REHEARSED_STEP);
  assert.equal(firstUnverifiedStep({[BACKUP_STEP]: true, [COMPANION_STEP]: true, [OUTPUT_STEP]: true, [REHEARSED_STEP]: true}), null);
  assert.equal(firstUnverifiedStep({[BACKUP_STEP]: false, [COMPANION_STEP]: true}), BACKUP_STEP);
});
