/**
 * The `/setup` checklist, as data (D10 / S3).
 *
 * Two of the four steps verify themselves against `/api/state` and `/api/devices`, so the
 * installer is never asked to tick a box the system can already see. A verified step is
 * rendered as verified text, never as an editable checkbox, and a returning installer lands
 * on the first step that is still unverified.
 *
 * Pure and DOM-free so the verification rules can be unit-tested without React or a network.
 */

/** The same 30-second window `lib/operations-health.ts` uses for renderers and controllers. */
export const PRESENCE_FRESHNESS_MS = 30_000;

export const BACKUP_STEP = "backup-confirmed";
export const COMPANION_STEP = "companion-confirmed";
export const OUTPUT_STEP = "output-connected";
export const REHEARSED_STEP = "rehearsed";

/** Checklist order; also the order a returning installer is walked through. */
export const SETUP_STEPS = [BACKUP_STEP, COMPANION_STEP, OUTPUT_STEP, REHEARSED_STEP] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];

/** The two steps the page can confirm for itself; these never render as a checkbox once true. */
export const AUTO_STEPS: readonly SetupStepKey[] = [COMPANION_STEP, OUTPUT_STEP];
export const isAutoStep = (step: string): step is SetupStepKey => (AUTO_STEPS as readonly string[]).includes(step);

type Presence = {seen?: unknown};

function presenceList(state: unknown, field: "renderers" | "controllers"): Presence[] {
  if (!state || typeof state !== "object") return [];
  const value = (state as Record<string, unknown>)[field];
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as Presence[]) : [];
}

function serverClock(state: unknown, now: number): number {
  const value = state && typeof state === "object" ? (state as Record<string, unknown>).serverTime : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : now;
}

/**
 * Fresh means seen within the window and not in the future. A row with no `seen` at all is
 * counted as fresh: the relay only lists an attachment while it holds the socket, and the
 * existing step-4 check already reads it that way.
 */
function freshCount(list: Presence[], clock: number): number {
  return list.filter((item) => typeof item.seen !== "number" || (clock - item.seen >= 0 && clock - item.seen <= PRESENCE_FRESHNESS_MS)).length;
}

/** A live Companion (or any control attachment) is present in `/api/state` right now. */
export function freshControllerCount(state: unknown, now: number): number {
  if (!state || typeof state !== "object" || !Array.isArray((state as Record<string, unknown>).controllers)) return 0;
  return freshCount(presenceList(state, "controllers"), serverClock(state, now));
}

/** A live graphics browser is present in `/api/state` right now. */
export function freshRendererCount(state: unknown, now: number): number {
  return freshCount(presenceList(state, "renderers"), serverClock(state, now));
}

export type VerificationInput = {
  /** The parsed `/api/state` body, or null when the probe did not answer. */
  state: unknown;
  now: number;
  /** True when `GET /api/devices` lists a named, unrevoked output connection. */
  hasOutputCredential: boolean;
};

/**
 * The steps this page can confirm for itself. Only `true` is ever returned: verification
 * adds evidence, it never un-ticks something the installer already recorded, and a relay
 * that cannot be reached must not read as a regression.
 */
export function autoVerifiedSteps(input: VerificationInput): Partial<Record<SetupStepKey, true>> {
  const verified: Partial<Record<SetupStepKey, true>> = {};
  if (freshControllerCount(input.state, input.now) > 0) verified[COMPANION_STEP] = true;
  if (input.hasOutputCredential && freshRendererCount(input.state, input.now) > 0) verified[OUTPUT_STEP] = true;
  return verified;
}

/** What still needs writing back to `PUT /api/setup-progress`, given what is already stored. */
export function stepsToPersist(stored: Record<string, boolean>, verified: Partial<Record<SetupStepKey, true>>): Record<string, boolean> {
  const pending: Record<string, boolean> = {};
  for (const [step, value] of Object.entries(verified)) if (value === true && stored[step] !== true) pending[step] = true;
  return pending;
}

/** Where a returning installer lands. Null once every step is done. */
export function firstUnverifiedStep(steps: Record<string, boolean>): SetupStepKey | null {
  return SETUP_STEPS.find((step) => steps[step] !== true) ?? null;
}
