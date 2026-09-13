// Types for the relay release script, so relay/tests can unit-test its gate logic
// while the script itself stays a dependency-free .mjs runnable by plain node.

export declare const GATE_MAX_AGE_MS: number;
export declare const GATE_MAX_SKEW_MS: number;
export declare const RELAY_WORKERS: readonly {id: string; name: string; env: string; wranglerEnv: string}[];

export declare function parseGateFile(
	text: string,
	options?: {now?: number; workspaces?: readonly string[]},
): Record<string, {renderers: number; checkedAt: string}>;

export declare function assertUsableCloudflareCredentials(env: Record<string, string | undefined>): void;

export declare function parseArgs(argv: readonly string[]): {
	commit: string;
	gateFile: string;
	only: string | null;
	dryRun: boolean;
};

export declare function parseWranglerVersionId(output: unknown): string | null;

export type RelayWorkerStatus = 'pending' | 'deployed' | 'failed' | 'aborted';

export interface RelayWorkerRecord {
	name: string;
	env: string;
	status: RelayWorkerStatus;
	versionId?: string | null;
	at?: string;
	outputTail?: string;
	reason?: string;
}

export interface RelayReleaseRecord {
	version: number;
	status: 'in-progress' | 'complete' | 'partial' | 'aborted' | 'failed';
	commit: string;
	gate: Record<string, {renderers: number; checkedAt: string}>;
	workers: Record<string, RelayWorkerRecord>;
	startedAt: string;
	completedAt?: string;
	recovery?: string;
}

export declare function runRelayRelease(options: {
	commit: string;
	workers: readonly {id: string; name: string; env: string; wranglerEnv: string}[];
	gateFile: string;
	readGateFile: () => string;
	deployWorker: (worker: {id: string; name: string; env: string; wranglerEnv: string}) => string;
	writeRecord: (record: RelayReleaseRecord) => void;
	now?: () => number;
}): {ok: boolean; record: RelayReleaseRecord};
