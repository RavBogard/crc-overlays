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
