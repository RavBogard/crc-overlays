import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {RELAY_WORKERS, parseWranglerVersionId, runRelayRelease} from '../scripts/deploy-relays.mjs';

// The gate/version-parsing unit tests for scripts/deploy-relays.mjs live in
// relay/tests/deploy-gate.test.ts (a vitest suite run via `cd relay && npm test`).
// This file covers the record-writing and per-worker sequencing added on top of
// that: an honest work/deploy-staging/releases/<sha>/relay.json even when the
// second worker's deploy never happens. Every write here goes to a temp dir
// created with mkdtempSync(tmpdir()), never under the repo's work/.

const NOW = Date.parse('2026-09-13T20:00:00.000Z');
const idle = (checkedAt: string, renderers = 0) => ({renderers, checkedAt});
const freshGate = () =>
	JSON.stringify({
		crc: idle(new Date(NOW - 60_000).toISOString()),
		tbi: idle(new Date(NOW - 30_000).toISOString()),
	});

function tempRecord() {
	const dir = mkdtempSync(join(tmpdir(), 'deploy-relays-test-'));
	const path = join(dir, 'relay.json');
	const writeRecord = (record: unknown) => writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
	const read = () => JSON.parse(readFileSync(path, 'utf8'));
	return {writeRecord, read};
}

test('parseWranglerVersionId extracts the version id from wrangler output, or null when absent', () => {
	assert.equal(
		parseWranglerVersionId('Uploaded foo (1.2 sec)\nCurrent Version ID: 12345678-90ab-cdef-1234-567890abcdef\n'),
		'12345678-90ab-cdef-1234-567890abcdef',
	);
	assert.equal(parseWranglerVersionId('no version info in this output'), null);
	assert.equal(parseWranglerVersionId(undefined), null);
});

test('both workers deploy: record is complete with two deployed entries', () => {
	const {writeRecord, read} = tempRecord();
	const statusesWritten: string[] = [];
	const deployedIds: string[] = [];

	const {ok, record} = runRelayRelease({
		commit: 'a'.repeat(40),
		workers: RELAY_WORKERS,
		gateFile: 'gate.json',
		readGateFile: () => freshGate(),
		deployWorker: (worker) => {
			deployedIds.push(worker.id);
			return `Uploaded ${worker.name}\nCurrent Version ID: 11111111-2222-3333-4444-555555555555\n`;
		},
		writeRecord: (r) => {
			statusesWritten.push(r.status);
			writeRecord(r);
		},
		now: () => NOW,
	});

	assert.equal(ok, true);
	assert.equal(record.status, 'complete');
	assert.deepEqual(deployedIds, ['crc', 'tbi']);
	assert.equal(record.workers.crc.status, 'deployed');
	assert.equal(record.workers.tbi.status, 'deployed');
	assert.equal(record.workers.crc.versionId, '11111111-2222-3333-4444-555555555555');
	assert.equal(record.workers.tbi.versionId, '11111111-2222-3333-4444-555555555555');
	// The in-progress record must exist before either deploy is attempted.
	assert.equal(statusesWritten[0], 'in-progress');
	assert.ok(!('recovery' in record));
	assert.deepEqual(read(), record);
});

test('first worker deploys, second throws: record is partial, non-zero result, recovery present', () => {
	const {writeRecord, read} = tempRecord();
	const attempted: string[] = [];

	const {ok, record} = runRelayRelease({
		commit: 'b'.repeat(40),
		workers: RELAY_WORKERS,
		gateFile: 'gate.json',
		readGateFile: () => freshGate(),
		deployWorker: (worker) => {
			attempted.push(worker.id);
			if (worker.id === 'crc') {
				return 'Current Version ID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\n';
			}
			const error = new Error('wrangler exited with code 1') as Error & {output: string};
			error.output = 'Uploading tbi-overlays-live-relay...\nError: authentication failed\n';
			throw error;
		},
		writeRecord,
		now: () => NOW,
	});

	assert.equal(ok, false);
	assert.deepEqual(attempted, ['crc', 'tbi']);
	assert.equal(record.status, 'partial');
	assert.equal(record.workers.crc.status, 'deployed');
	assert.equal(record.workers.crc.versionId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
	assert.equal(record.workers.tbi.status, 'failed');
	assert.equal(record.workers.tbi.versionId, null);
	assert.match(record.workers.tbi.outputTail ?? '', /authentication failed/);
	assert.match(record.recovery ?? '', /tbi/);
	assert.match(record.recovery ?? '', /rollback/);
	assert.deepEqual(read(), record);
});

test('idle check fails before the second deploy: first stays deployed, second is aborted, record is partial', () => {
	const {writeRecord, read} = tempRecord();
	let gateCall = 0;
	const readGateFile = () => {
		gateCall += 1;
		// Call 1: initial validation. Call 2: refreshed check right before crc's deploy.
		// Call 3: refreshed check right before tbi's deploy - simulate a renderer reconnecting.
		if (gateCall >= 3) {
			return JSON.stringify({
				crc: idle(new Date(NOW - 60_000).toISOString()),
				tbi: idle(new Date(NOW - 5_000).toISOString(), 1),
			});
		}
		return freshGate();
	};
	const deployedIds: string[] = [];

	const {ok, record} = runRelayRelease({
		commit: 'c'.repeat(40),
		workers: RELAY_WORKERS,
		gateFile: 'gate.json',
		readGateFile,
		deployWorker: (worker) => {
			deployedIds.push(worker.id);
			return 'Current Version ID: cccccccc-cccc-cccc-cccc-cccccccccccc\n';
		},
		writeRecord,
		now: () => NOW,
	});

	assert.equal(ok, false);
	assert.deepEqual(deployedIds, ['crc']);
	assert.equal(record.status, 'partial');
	assert.equal(record.workers.crc.status, 'deployed');
	assert.equal(record.workers.tbi.status, 'aborted');
	assert.match(record.workers.tbi.reason ?? '', /connected renderer/);
	assert.match(record.recovery ?? '', /idle gate/);
	assert.deepEqual(read(), record);
});

test('gate fails before the only requested worker deploys: zero deployed, record is aborted', () => {
	const {writeRecord, read} = tempRecord();
	let gateCall = 0;
	const readGateFile = () => {
		gateCall += 1;
		if (gateCall >= 2) {
			return JSON.stringify({crc: idle(new Date(NOW - 5_000).toISOString(), 3)});
		}
		return JSON.stringify({crc: idle(new Date(NOW - 60_000).toISOString())});
	};

	const {ok, record} = runRelayRelease({
		commit: 'd'.repeat(40),
		workers: RELAY_WORKERS.filter((worker) => worker.id === 'crc'),
		gateFile: 'gate.json',
		readGateFile,
		deployWorker: () => {
			throw new Error('deployWorker must not be called once the refreshed gate check fails');
		},
		writeRecord,
		now: () => NOW,
	});

	assert.equal(ok, false);
	assert.equal(record.status, 'aborted');
	assert.equal(record.workers.crc.status, 'aborted');
	assert.match(record.recovery ?? '', /idle gate/);
	assert.deepEqual(read(), record);
});
