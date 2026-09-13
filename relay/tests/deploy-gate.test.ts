import {describe, expect, it} from 'vitest';

// The release script stays a plain .mjs runnable by node; scripts/deploy-relays.d.mts
// gives this TypeScript project the types for its exported gate logic.
import {
	GATE_MAX_AGE_MS,
	assertUsableCloudflareCredentials,
	parseArgs,
	parseGateFile,
} from '../../scripts/deploy-relays.mjs';

const now = Date.parse('2026-09-13T20:00:00.000Z');
const idle = (checkedAt: string, renderers = 0) => ({renderers, checkedAt});
const gate = (overrides: Record<string, unknown> = {}) =>
	JSON.stringify({
		crc: idle('2026-09-13T19:58:00.000Z'),
		tbi: idle('2026-09-13T19:59:30.000Z'),
		...overrides,
	});

describe('relay release gate file', () => {
	it('accepts both workspaces idle and freshly probed', () => {
		expect(parseGateFile(gate(), {now})).toMatchObject({crc: {renderers: 0}, tbi: {renderers: 0}});
	});

	it('refuses a workspace that still has a connected renderer', () => {
		expect(() => parseGateFile(gate({crc: idle('2026-09-13T19:59:00.000Z', 1)}), {now})).toThrow(
			/crc still reports 1 connected renderer/,
		);
	});

	it('refuses a reading older than ten minutes and accepts one just inside it', () => {
		const stale = new Date(now - GATE_MAX_AGE_MS - 1000).toISOString();
		const fresh = new Date(now - GATE_MAX_AGE_MS + 1000).toISOString();
		expect(() => parseGateFile(gate({tbi: idle(stale)}), {now})).toThrow(/is \d+s old/);
		expect(parseGateFile(gate({tbi: idle(fresh)}), {now})).toBeTruthy();
	});

	it('refuses a reading stamped far in the future', () => {
		expect(() => parseGateFile(gate({crc: idle('2026-09-13T21:00:00.000Z')}), {now})).toThrow(/in the future/);
	});

	it('refuses missing workspaces, bad renderer counts and unparseable timestamps', () => {
		expect(() => parseGateFile('{"crc":{"renderers":0,"checkedAt":"2026-09-13T19:59:00.000Z"}}', {now})).toThrow(
			/missing the "tbi" workspace/,
		);
		expect(() => parseGateFile(gate({crc: {renderers: '0', checkedAt: '2026-09-13T19:59:00.000Z'}}), {now})).toThrow(
			/must be a non-negative integer/,
		);
		expect(() => parseGateFile(gate({crc: idle('not-a-date')}), {now})).toThrow(/not a parseable timestamp/);
		expect(() => parseGateFile('[]', {now})).toThrow(/keyed by workspace/);
		expect(() => parseGateFile('not json', {now})).toThrow(/not valid JSON/);
	});

	it('only requires the workspace being released when --only is used', () => {
		const crcOnly = '{"crc":{"renderers":0,"checkedAt":"2026-09-13T19:59:00.000Z"}}';
		expect(parseGateFile(crcOnly, {now, workspaces: ['crc']})).toBeTruthy();
	});
});

describe('relay release arguments and credentials', () => {
	const sha = 'a'.repeat(40);

	it('requires the commit, the production confirmation and a gate file', () => {
		expect(parseArgs(['--commit', sha, '--confirm-production', '--gate-file', 'gate.json'])).toEqual({
			commit: sha,
			gateFile: 'gate.json',
			only: null,
			dryRun: false,
		});
		expect(() => parseArgs(['--commit', sha, '--gate-file', 'gate.json'])).toThrow(/Usage:/);
		expect(() => parseArgs(['--commit', sha, '--confirm-production'])).toThrow(/Usage:/);
		expect(() => parseArgs(['--commit', 'abc', '--confirm-production', '--gate-file', 'g'])).toThrow(/full 40/);
		expect(() =>
			parseArgs(['--commit', sha, '--confirm-production', '--gate-file', 'g', '--only', 'both']),
		).toThrow(/--only/);
	});

	it('refuses an empty-looking Cloudflare token instead of silently falling back', () => {
		expect(() => assertUsableCloudflareCredentials({CLOUDFLARE_API_TOKEN: '   '})).toThrow(
			/CLOUDFLARE_API_TOKEN is set but empty/,
		);
		expect(() => assertUsableCloudflareCredentials({})).not.toThrow();
	});
});
