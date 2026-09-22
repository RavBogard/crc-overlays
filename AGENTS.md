# CRC / TBI overlays: working guide

This is the active overlays checkout. Start by checking the branch and working-tree status; preserve others' tracked and untracked work. Older handoffs contain obsolete branch names. Verify the current checkout instead of switching branches based on history.

## Read only what the task needs

1. Read the current summary and relevant sections of RELEASE-STATE.md for deployed state. Its historical sections are not a mandatory full read on each turn.
2. Read CLAUDE-HANDOFF.md for operating constraints and the relevant current order/return in docs/planning/. Current release evidence and newer explicit user decisions supersede old status statements.
3. Search the affected code and tests. Open historical deploy records, other products, or large source files only when needed to answer a concrete question.

## Astra direction and bounded implementation

Keep Astra responsible for product decisions, cross-product contracts, acceptance criteria, and final integration. For significant changes, maintain one short current plan/state note under docs/planning/<date>-<topic>/ with the goal, decisions, next work packet, evidence, and unresolved questions. Link detailed history instead of copying it. Do not re-audit the entire ecosystem at every phase.

When delegation is authorized, assign one independent bounded packet per worker, with file ownership and acceptance checks. Terra/medium is the implementation default; Astra handles difficult design/review decisions. Workers must preserve others' changes. Do not spawn a separate agent for every check or layer of review.

## Verification and release

Run relevant tests during implementation. At an integration/release boundary run the required checks for the affected areas; baseline commands include TypeScript checking, npm test, npm run lint, and npm run build. Stop a shared dev server before a build. Companion changes also need scripts/audit-companion-packages.mjs. Browser-visible changes need focused browser verification; real hardware acceptance cannot be claimed from automated tests.

Production is separate from local completion. A push to main can deploy CRC automatically; TBI uses the staged CLI release. Follow the current release instructions and verify both workspace SHAs. This configuration task does not authorize deployment. Never expose or commit .env files, access links, tokens, or work/access/. Rehearsal database mutations require verifying the intended schema first.
