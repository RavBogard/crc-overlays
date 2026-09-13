#!/usr/bin/env node
// Releases the two Cloudflare relay workers (CRC and TBI) from one clean commit.
// Web deploys (scripts/deploy-workspaces.mjs) and relay deploys are separate events:
// a relay release may ship from a commit that never produced a web release.
// See docs/RELAY-RELEASE.md for the operator procedure.

import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';

export const GATE_MAX_AGE_MS = 10 * 60 * 1000;
// Tolerated clock skew on the probing machine; a gate stamped further ahead is rejected.
export const GATE_MAX_SKEW_MS = 60 * 1000;

export const RELAY_WORKERS = [
	{id: 'crc', name: 'crc-live-relay', env: 'default', wranglerEnv: ''},
	{id: 'tbi', name: 'tbi-overlays-live-relay', env: 'tbi', wranglerEnv: 'tbi'},
];

const USAGE =
	'Usage: node scripts/deploy-relays.mjs --commit <full-sha> --confirm-production --gate-file <path> [--only crc|tbi] [--dry-run]';

/**
 * Validates the read-only idle gate written by the operator before a relay release.
 * The gate file is the only evidence this script accepts that no renderer is live;
 * the script never holds a control key and never probes production itself.
 */
export function parseGateFile(text, {now = Date.now(), workspaces = ['crc', 'tbi']} = {}) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('Gate file is not valid JSON');
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Gate file must be a JSON object keyed by workspace');
	}
	for (const workspace of workspaces) {
		const entry = parsed[workspace];
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error(`Gate file is missing the "${workspace}" workspace`);
		}
		if (!Number.isInteger(entry.renderers) || entry.renderers < 0) {
			throw new Error(`Gate file "${workspace}.renderers" must be a non-negative integer`);
		}
		if (entry.renderers !== 0) {
			throw new Error(
				`Gate refuses the release: ${workspace} still reports ${entry.renderers} connected renderer(s)`,
			);
		}
		if (typeof entry.checkedAt !== 'string') {
			throw new Error(`Gate file "${workspace}.checkedAt" must be an ISO timestamp string`);
		}
		const checkedAt = Date.parse(entry.checkedAt);
		if (Number.isNaN(checkedAt)) {
			throw new Error(`Gate file "${workspace}.checkedAt" is not a parseable timestamp`);
		}
		const age = now - checkedAt;
		if (age > GATE_MAX_AGE_MS) {
			throw new Error(
				`Gate reading for ${workspace} is ${Math.round(age / 1000)}s old; re-probe within ${GATE_MAX_AGE_MS / 60000} minutes of the deploy`,
			);
		}
		if (age < -GATE_MAX_SKEW_MS) {
			throw new Error(`Gate reading for ${workspace} is timestamped in the future`);
		}
	}
	return parsed;
}

/** Rejects a half-configured token rather than letting wrangler fall back to a stale session. */
export function assertUsableCloudflareCredentials(env) {
	for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY']) {
		if (key in env && String(env[key] ?? '').trim() === '') {
			throw new Error(`${key} is set but empty; unset it or provide a real token (value never printed)`);
		}
	}
}

export function parseArgs(argv) {
	const value = (flag) => {
		const at = argv.indexOf(flag);
		return at >= 0 ? argv[at + 1] : undefined;
	};
	const commit = value('--commit');
	const gateFile = value('--gate-file');
	const only = value('--only');
	if (!commit || !argv.includes('--confirm-production') || !gateFile) throw new Error(USAGE);
	if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('--commit must be a full 40-character sha');
	if (only !== undefined && !RELAY_WORKERS.some((worker) => worker.id === only)) {
		throw new Error('--only must be "crc" or "tbi"');
	}
	return {commit, gateFile, only: only ?? null, dryRun: argv.includes('--dry-run')};
}

function main(argv) {
	const {commit, gateFile, only, dryRun} = parseArgs(argv);
	const repoRoot = resolve(import.meta.dirname, '..');
	const relayRoot = resolve(repoRoot, 'relay');
	assertUsableCloudflareCredentials(process.env);

	const run = (file, args, {cwd = repoRoot, capture = false} = {}) =>
		execFileSync(file, args, {cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit'});
	const git = (...args) => run('git', args, {capture: true}).trim();

	const head = git('rev-parse', 'HEAD');
	if (head !== commit) throw new Error(`Checked-out commit ${head} does not match the requested release commit`);
	if (git('status', '--porcelain', '--untracked-files=all')) {
		throw new Error('Relay release checkout must be clean so both workers ship one exact source revision');
	}

	const npmCli = resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
	run(process.execPath, [npmCli, 'test'], {cwd: relayRoot});
	run(process.execPath, [npmCli, 'run', 'check'], {cwd: relayRoot});

	const workers = RELAY_WORKERS.filter((worker) => only === null || worker.id === only);
	const gate = parseGateFile(readFileSync(resolve(process.cwd(), gateFile), 'utf8'), {
		workspaces: workers.map((worker) => worker.id),
	});

	const wrangler = resolve(relayRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
	const scratch = dryRun ? mkdtempSync(resolve(tmpdir(), 'relay-dryrun-')) : null;
	try {
		for (const worker of workers) {
			const args = ['deploy', '--env', worker.wranglerEnv];
			if (dryRun) args.push('--dry-run', '--outdir', resolve(scratch, worker.id));
			console.log(`\n== ${dryRun ? 'dry run' : 'deploy'}: ${worker.name} (env ${worker.env}) ==`);
			run(process.execPath, [wrangler, ...args], {cwd: relayRoot});
		}
	} finally {
		if (scratch) rmSync(scratch, {recursive: true, force: true});
	}

	if (dryRun) {
		console.log('\nDry run complete; no worker was deployed and no relay.json was written.');
		return;
	}

	const releaseRoot = resolve(repoRoot, 'work', 'deploy-staging', 'releases', head);
	mkdirSync(releaseRoot, {recursive: true});
	writeFileSync(
		resolve(releaseRoot, 'relay.json'),
		JSON.stringify(
			{
				version: 1,
				status: 'deployed',
				commit: head,
				workers: workers.map((worker) => ({name: worker.name, env: worker.env})),
				gate,
				completedAt: new Date().toISOString(),
			},
			null,
			2,
		) + '\n',
	);
	console.log(`\nRelay workers deployed from ${head}; recorded in work/deploy-staging/releases/${head}/relay.json.`);
}

if (import.meta.main) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
