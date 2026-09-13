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

/** Pulls the wrangler-reported version id out of deploy output, or null if it can't be found. */
export function parseWranglerVersionId(output) {
	if (typeof output !== 'string') return null;
	const match = output.match(/Version ID:\s*([0-9a-fA-F-]{8,})/);
	return match ? match[1].trim() : null;
}

function tailLines(text, maxLines = 40) {
	const str = typeof text === 'string' ? text : String(text ?? '');
	return str
		.split(/\r?\n/)
		.slice(-maxLines)
		.join('\n')
		.trim();
}

function buildRecovery({record, commit, gateFile}) {
	const entries = Object.entries(record.workers);
	const deployed = entries.filter(([, entry]) => entry.status === 'deployed');
	const notDeployed = entries.filter(([, entry]) => entry.status !== 'deployed');
	const lines = [];
	if (notDeployed.length) {
		const remaining = notDeployed.map(([id]) => id);
		lines.push(
			`Re-verify the idle gate, then finish the release: node scripts/deploy-relays.mjs --commit ${commit} ` +
				`--confirm-production --gate-file ${gateFile || '<gate-file>'} --only ${remaining[0]}` +
				(remaining.length > 1 ? ` (repeat for: ${remaining.join(', ')})` : ''),
		);
	}
	if (deployed.length) {
		for (const [id, entry] of deployed) {
			const envFlag = entry.env && entry.env !== 'default' ? ` --env ${entry.env}` : '';
			lines.push(
				`${id} (${entry.name}) is already live${entry.versionId ? ` at version ${entry.versionId}` : ''}; ` +
					`to undo it instead, run from relay/: npx wrangler rollback${envFlag}`,
			);
		}
	}
	return lines.join(' ');
}

/**
 * Runs the gated, per-worker release sequence and writes an honest progress record at every step:
 * an 'in-progress' record before any worker is touched, then each worker's own result as it lands,
 * so a failure partway through leaves evidence of exactly what shipped instead of nothing at all.
 * `deployWorker` and `readGateFile` are injected so this is unit-testable without wrangler or git.
 */
export function runRelayRelease({commit, workers, gateFile, readGateFile, deployWorker, writeRecord, now = () => Date.now()}) {
	const workspaceIds = workers.map((worker) => worker.id);
	const initialGate = parseGateFile(readGateFile(), {now: now(), workspaces: workspaceIds});

	const record = {
		version: 2,
		status: 'in-progress',
		commit,
		gate: initialGate,
		workers: Object.fromEntries(
			workers.map((worker) => [worker.id, {name: worker.name, env: worker.env, status: 'pending'}]),
		),
		startedAt: new Date(now()).toISOString(),
	};
	writeRecord(record);

	let haltReason = null;
	for (const worker of workers) {
		try {
			parseGateFile(readGateFile(), {now: now(), workspaces: [worker.id]});
		} catch (error) {
			record.workers[worker.id] = {
				...record.workers[worker.id],
				status: 'aborted',
				versionId: null,
				at: new Date(now()).toISOString(),
				reason: error instanceof Error ? error.message : String(error),
			};
			haltReason = 'gate';
			break;
		}

		try {
			const output = deployWorker(worker);
			record.workers[worker.id] = {
				...record.workers[worker.id],
				status: 'deployed',
				versionId: parseWranglerVersionId(output),
				at: new Date(now()).toISOString(),
			};
		} catch (error) {
			const output = error && typeof error.output === 'string' && error.output ? error.output : error instanceof Error ? error.message : String(error);
			record.workers[worker.id] = {
				...record.workers[worker.id],
				status: 'failed',
				versionId: null,
				at: new Date(now()).toISOString(),
				outputTail: tailLines(output),
			};
			haltReason = 'deploy';
			break;
		}

		writeRecord(record);
	}

	const deployedCount = Object.values(record.workers).filter((entry) => entry.status === 'deployed').length;
	if (deployedCount === workers.length) {
		record.status = 'complete';
	} else if (deployedCount > 0) {
		record.status = 'partial';
		record.recovery = buildRecovery({record, commit, gateFile});
	} else {
		record.status = haltReason === 'gate' ? 'aborted' : 'failed';
		record.recovery = buildRecovery({record, commit, gateFile});
	}
	record.completedAt = new Date(now()).toISOString();
	writeRecord(record);

	return {ok: record.status === 'complete', record};
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
	const gatePath = resolve(process.cwd(), gateFile);
	const readGateFile = () => readFileSync(gatePath, 'utf8');
	const wrangler = resolve(relayRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

	if (dryRun) {
		// Same gate this script would otherwise check just before deploying; a dry run still proves
		// the release would have been allowed to start, without writing any record or shipping code.
		parseGateFile(readGateFile(), {now: Date.now(), workspaces: workers.map((worker) => worker.id)});
		const scratch = mkdtempSync(resolve(tmpdir(), 'relay-dryrun-'));
		try {
			for (const worker of workers) {
				const args = ['deploy', '--env', worker.wranglerEnv, '--dry-run', '--outdir', resolve(scratch, worker.id)];
				console.log(`\n== dry run: ${worker.name} (env ${worker.env}) ==`);
				run(process.execPath, [wrangler, ...args], {cwd: relayRoot});
			}
		} finally {
			rmSync(scratch, {recursive: true, force: true});
		}
		console.log('\nDry run complete; no worker was deployed and no relay.json was written.');
		return;
	}

	const releaseRoot = resolve(repoRoot, 'work', 'deploy-staging', 'releases', head);
	mkdirSync(releaseRoot, {recursive: true});
	const recordPath = resolve(releaseRoot, 'relay.json');
	const writeRecord = (record) => writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');

	const deployWorker = (worker) => {
		const args = ['deploy', '--env', worker.wranglerEnv];
		console.log(`\n== deploy: ${worker.name} (env ${worker.env}) ==`);
		try {
			const output = run(process.execPath, [wrangler, ...args], {cwd: relayRoot, capture: true});
			console.log(output);
			return output;
		} catch (error) {
			const stdout = error && error.stdout ? String(error.stdout) : '';
			const stderr = error && error.stderr ? String(error.stderr) : '';
			const combined = [stdout, stderr].filter(Boolean).join('\n');
			if (combined) console.error(combined);
			const wrapped = new Error(
				`wrangler deploy failed for ${worker.name}: ${error instanceof Error ? error.message : String(error)}`,
			);
			wrapped.output = combined;
			throw wrapped;
		}
	};

	const {ok, record} = runRelayRelease({commit: head, workers, gateFile, readGateFile, deployWorker, writeRecord});

	if (ok) {
		console.log(`\nRelay workers deployed from ${head}; recorded in work/deploy-staging/releases/${head}/relay.json.`);
	} else {
		console.error(
			`\nRelay release ${record.status} (${head}); recorded in work/deploy-staging/releases/${head}/relay.json.` +
				(record.recovery ? `\n${record.recovery}` : ''),
		);
		process.exitCode = 1;
	}
}

if (import.meta.main) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
