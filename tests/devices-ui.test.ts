import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  DEVICE_REVOKED_NOTICE,
  activeDevices,
  deviceKindLabel,
  deviceStandingText,
  hasNamedOutputCredential,
  isDeviceKind,
  lastConnectedText,
  readDeviceList,
  type PairedDevice,
} from '../app/access/devices-copy.ts';
import {
  OUTPUT_DEVICE_STORAGE_KEY,
  OUTPUT_LEGACY_STORAGE_KEY,
  resolveOutputCredential,
} from '../app/output/output-credential.ts';
import {
  firstUnverifiedStep,
  freshControllerCount,
  freshControllerVersion,
  freshRendererCount,
  pairingRedeemed,
  personalCheckedIn,
  stepMode,
  stepsToPersist,
  verifiedSteps,
} from '../app/setup/setup-steps.ts';
import {SETUP_FLOWS} from '../lib/setup-flow.ts';

const now = 1_800_000_000_000;
const device = (overrides: Partial<PairedDevice> = {}): PairedDevice => ({id: 'cd_one', name: 'Sanctuary PC', kind: 'output', lastSeenAt: now - 60_000, revokedAt: null, ...overrides});

/* ---------- /access "Paired devices" copy ---------- */

test('a device row names the kind an operator would recognize', () => {
  assert.equal(deviceKindLabel('companion'), 'Companion');
  assert.equal(deviceKindLabel('output'), 'Graphics output');
  assert.equal(deviceKindLabel('history_reader'), 'Service history');
  assert.equal(deviceKindLabel('something-new'), 'Device');
});

/*
 * The cue-log credential is minted by `create_history_reader` on /api/devices and the cue-log
 * return promised "one revoke button on the panel that already exists". The reader used to
 * accept only companion and output, so a minted history_reader was dropped before it reached
 * the list and could never be revoked from the panel. These two tests pin the whole path:
 * the kind is recognised, and a row carrying it survives the read.
 */
test('the reader knows exactly the three kinds a credential can hold', () => {
  assert.equal(isDeviceKind('companion'), true);
  assert.equal(isDeviceKind('output'), true);
  assert.equal(isDeviceKind('history_reader'), true);
  assert.equal(isDeviceKind('printer'), false);
  assert.equal(isDeviceKind(undefined), false);
  assert.equal(isDeviceKind(null), false);
});

test('a service-history credential reaches the panel, so it can be revoked there', () => {
  const parsed = readDeviceList({devices: [
    {id: 'cd_live', name: 'centralreform.live', kind: 'history_reader', lastSeenAt: now, revokedAt: null},
  ]});
  assert.deepEqual(parsed.map(row => row.kind), ['history_reader']);
  assert.deepEqual(activeDevices(parsed).map(row => row.id), ['cd_live']);
  assert.equal(deviceStandingText(parsed[0], now), 'Service history · Last connected just now');
  assert.equal(`Revoke ${deviceKindLabel('history_reader')} centralreform.live`, 'Revoke Service history centralreform.live');
});

test('a device row reports when it last connected, which is what the credential actually records', () => {
  assert.equal(lastConnectedText(now - 4_000, now), 'Last connected just now');
  assert.equal(lastConnectedText(now - 12 * 60_000, now), 'Last connected 12 min ago');
  assert.equal(lastConnectedText(now - 5 * 60 * 60_000, now), 'Last connected 5 h ago');
  assert.equal(lastConnectedText(now - 4 * 24 * 60 * 60_000, now), 'Last connected 4 days ago');
  assert.equal(lastConnectedText(null, now), 'Last connected never');
  assert.equal(lastConnectedText(undefined, now), 'Last connected never');
});

test('a revoked device says so instead of reporting a stale connection time', () => {
  assert.equal(deviceStandingText(device({kind: 'companion', lastSeenAt: now - 60_000}), now), 'Companion · Last connected 1 min ago');
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
    {id: 'cd_d', name: 'centralreform.live', kind: 'history_reader', lastSeenAt: null, revokedAt: null},
    {name: 'No id', kind: 'output'},
    null,
  ]});
  assert.deepEqual(parsed.map(row => row.id), ['cd_a', 'cd_b', 'cd_d']);
  assert.deepEqual(activeDevices(parsed).map(row => row.id), ['cd_a', 'cd_d']);
  assert.deepEqual(readDeviceList({}), []);
  assert.deepEqual(readDeviceList(null), []);
});

test('a named output credential counts only while it is unrevoked', () => {
  assert.equal(hasNamedOutputCredential([device()]), true);
  assert.equal(hasNamedOutputCredential([device({revokedAt: now})]), false);
  assert.equal(hasNamedOutputCredential([device({kind: 'companion'})]), false);
  assert.equal(hasNamedOutputCredential([device({kind: 'history_reader'})]), false, 'a cue-log credential is not a graphics output');
  assert.equal(hasNamedOutputCredential([]), false);
});

/* ---------- what the /access devices panel actually renders ---------- */

/* Layout pass (handoff #2, D2): the devices panel moved out of Account and onto System > People. */
const accessPage = readFileSync(fileURLToPath(new URL('../app/access/people-panels.tsx', import.meta.url)), 'utf8');

test('the devices panel renders only unrevoked devices, so a revoked row cannot be revoked again', () => {
  assert.ok(accessPage.includes('activeDevices(devices).map('), 'the rendered rows come from activeDevices');
  assert.ok(!/\bdevices\.map\(/.test(accessPage), 'the raw list is never rendered');
});

test('a revoke button names the kind as well as the device, so two Sanctuary PCs are distinguishable', () => {
  assert.ok(accessPage.includes('aria-label={`Revoke ${deviceKindLabel(device.kind)} ${device.name}`}'));
  assert.equal(`Revoke ${deviceKindLabel('companion')} Sanctuary PC`, 'Revoke Companion Sanctuary PC');
  assert.equal(`Revoke ${deviceKindLabel('output')} Sanctuary PC`, 'Revoke Graphics output Sanctuary PC');
});

test('a device action reports inside the devices panel rather than at the top of the page', () => {
  assert.ok(accessPage.includes('{deviceMessage && <div className={`access-device-notice ${deviceMessageKind}`} role="status" aria-live="polite">{deviceMessage}</div>}'));
  assert.ok(accessPage.includes('deviceNotice(DEVICE_REVOKED_NOTICE)'), 'the revoke confirmation is the inline notice');
  assert.ok(!accessPage.includes('notice(DEVICE_REVOKED_NOTICE)') || accessPage.includes('deviceNotice(DEVICE_REVOKED_NOTICE)'));
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

const tbi = SETUP_FLOWS.tbi, crc = SETUP_FLOWS.crc;
const signals = (overrides: Partial<Parameters<typeof verifiedSteps>[1]> = {}) => ({state: state(), now, personalCheckedIn: false, graphicsUrl: true, pressRendered: false, ...overrides});

test('a fresh controller, a fresh renderer with the page’s graphics URL, a check-in and a rendered press each tick their own step', () => {
  assert.deepEqual(verifiedSteps(crc, signals()), {pair: true, graphics: true});
  assert.deepEqual(verifiedSteps(tbi, signals()), {graphics: true}, 'TBI step 4 waits for the downloaded file itself, not any Companion');
  assert.deepEqual(verifiedSteps(tbi, signals({personalCheckedIn: true, pressRendered: true})), {import: true, graphics: true, test: true});
});

test('a renderer alone is not the graphics step, and no presence verifies nothing', () => {
  assert.equal(verifiedSteps(crc, signals({graphicsUrl: false})).graphics, undefined);
  assert.equal(verifiedSteps(crc, signals({state: state({renderers: []})})).graphics, undefined);
  assert.deepEqual(verifiedSteps(crc, signals({state: null})), {});
});

test('a stale or future controller is not present, a browser is not a Companion, and an older relay without controllers verifies nothing', () => {
  assert.equal(freshControllerCount(state({controllers: [{client: 'companion', seen: now - 31_000}]}), now), 0);
  assert.equal(freshControllerCount(state({controllers: [{client: 'companion', seen: now + 5_000}]}), now), 0);
  assert.equal(freshControllerCount(state({controllers: [{client: 'companion', seen: now - 30_000}]}), now), 1);
  assert.equal(freshControllerCount(state({controllers: [{client: 'browser', seen: now - 1_000}]}), now), 0);
  assert.equal(freshControllerVersion(state(), now), '1.4.0');
  const older = {serverTime: now, renderers: [{seen: now - 1_000}]};
  assert.equal(freshControllerCount(older, now), 0);
  assert.deepEqual(verifiedSteps(crc, signals({state: older})), {graphics: true});
});

test('an unreachable relay verifies nothing and never un-ticks a recorded step', () => {
  assert.equal(freshRendererCount(null, now), 0);
  assert.deepEqual(stepsToPersist({pair: true}, {}), {});
});

test('only newly verified steps are written back to the progress store', () => {
  const verified = verifiedSteps(crc, signals());
  assert.deepEqual(stepsToPersist({}, verified), {pair: true, graphics: true});
  assert.deepEqual(stepsToPersist({pair: true}, verified), {graphics: true});
  assert.deepEqual(stepsToPersist({pair: true, graphics: true}, verified), {});
});

test('a deployment that cannot report presence offers the step manually instead of stranding the installer', () => {
  const pair = crc.steps.find(step => step.key === 'pair')!, graphics = crc.steps.find(step => step.key === 'graphics')!;
  assert.equal(stepMode(pair, {pair: true}, state()), 'verified');
  assert.equal(stepMode(pair, {}, state({controllers: []})), 'pending');
  assert.equal(stepMode(pair, {}, {serverTime: now, renderers: [{seen: now - 1_000}]}), 'manual');
  assert.equal(stepMode(pair, {}, null), 'pending', 'a probe that never answered is not an excuse to go manual');
  assert.equal(stepMode(graphics, {}, {serverTime: now, controllers: []}), 'manual');
  assert.equal(stepMode(crc.steps[0], {}, state()), 'manual', 'a back-up is the operator’s own word');
});

test('the operator’s own token counts once it has checked in; a pairing code clears when its credential appears', () => {
  const list = (rows: unknown[]) => ({devices: rows});
  assert.equal(personalCheckedIn(list([{kind: 'companion', name: 'Simone’s Companion (downloaded 2026-09-24)', lastSeenAt: now, revokedAt: null}]), 'Simone'), true);
  assert.equal(personalCheckedIn(list([{kind: 'companion', name: 'Simone’s Companion (downloaded 2026-09-24)', lastSeenAt: null, revokedAt: null}]), 'Simone'), false);
  assert.equal(personalCheckedIn(list([{kind: 'companion', name: 'Simone’s Companion (downloaded 2026-09-24)', lastSeenAt: now, revokedAt: now}]), 'Simone'), false);
  assert.equal(personalCheckedIn(list([{kind: 'companion', name: 'Booth PC', lastSeenAt: now, revokedAt: null}]), 'Simone'), false);
  assert.equal(pairingRedeemed(list([{kind: 'companion', name: 'Simone’s Companion (paired 2026-09-24 14:05 UTC)'}]), 'Simone’s Companion (paired 2026-09-24 14:05 UTC)'), true);
  assert.equal(pairingRedeemed(list([]), 'x'), false);
});

test('a returning installer lands on the first step that is still to do', () => {
  assert.equal(firstUnverifiedStep(tbi, {}), 'backup');
  assert.equal(firstUnverifiedStep(tbi, {backup: true, module: true}), 'deck-download');
  assert.equal(firstUnverifiedStep(tbi, Object.fromEntries(tbi.steps.map(step => [step.key, true]))), null);
  assert.equal(firstUnverifiedStep(tbi, {...Object.fromEntries(tbi.steps.map(step => [step.key, true])), backup: false}), 'backup');
});
