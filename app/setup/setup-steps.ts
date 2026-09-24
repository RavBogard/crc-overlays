/**
 * The `/setup` checklist's self-verification (D10), for any workspace's flow (lib/setup-flow.ts).
 *
 * A step the system can see for itself is never a box to tick: Companion and the graphics browser
 * report presence in `/api/state`, the personal file's device token reports its first check-in in
 * `/api/devices`, and a rendered Companion press comes from `/api/state` too. A verified step is
 * rendered as verified text, and a returning installer lands on the first step still unverified.
 *
 * Pure and DOM-free so the verification rules can be unit-tested without React or a network.
 */
import type {SetupFlow, SetupStep} from '@/lib/setup-flow';

/** The same 30-second window `lib/operations-health.ts` uses for renderers and controllers. */
export const PRESENCE_FRESHNESS_MS = 30_000;

type Presence = {seen?: unknown; client?: unknown};

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
 * counted as fresh: the relay only lists an attachment while it holds the socket.
 */
function fresh(list: Presence[], clock: number): Presence[] {
  return list.filter((item) => typeof item.seen !== "number" || (clock - item.seen >= 0 && clock - item.seen <= PRESENCE_FRESHNESS_MS));
}

/** A live Companion is present in `/api/state` right now (a row that names another client is not one). */
export function freshControllerCount(state: unknown, now: number): number {
  if (!state || typeof state !== "object" || !Array.isArray((state as Record<string, unknown>).controllers)) return 0;
  return fresh(presenceList(state, "controllers"), serverClock(state, now)).filter((item) => item.client === undefined || item.client === "companion").length;
}

/** The module version a fresh Companion reports, when one does. */
export function freshControllerVersion(state: unknown, now: number): string | null {
  const row = fresh(presenceList(state, "controllers"), serverClock(state, now)).find((item) => item.client === "companion" && typeof (item as {version?: unknown}).version === "string");
  return row ? String((row as {version: string}).version) : null;
}

/** A live graphics browser is present in `/api/state` right now. */
export function freshRendererCount(state: unknown, now: number): number {
  return fresh(presenceList(state, "renderers"), serverClock(state, now)).length;
}

/** True once the probe has answered but the body cannot report that kind of presence. */
export function presenceListMissing(state: unknown, field: "renderers" | "controllers"): boolean {
  if (!state || typeof state !== "object") return false;
  return !Array.isArray((state as Record<string, unknown>)[field]);
}

export type SetupSignals = {
  /** The parsed `/api/state` body, or null when the probe did not answer. */
  state: unknown;
  now: number;
  /** The personal file's device token (or a code paired from this page) has checked in. */
  personalCheckedIn: boolean;
  /** The graphics URL exists (minted from this page). */
  graphicsUrl: boolean;
  /** A Companion press rendered while this page watched. */
  pressRendered: boolean;
};

/**
 * The steps this page can confirm for itself. Only `true` is ever returned: verification adds
 * evidence, it never un-ticks something the installer already recorded, and a relay that cannot be
 * reached must not read as a regression.
 */
export function verifiedSteps(flow: SetupFlow, signals: SetupSignals): Record<string, true> {
  const verified: Record<string, true> = {};
  for (const step of flow.steps) {
    const ok = step.verify === "companion" ? freshControllerCount(signals.state, signals.now) > 0
      : step.verify === "personal-checkin" ? signals.personalCheckedIn
        : step.verify === "renderer" ? signals.graphicsUrl && freshRendererCount(signals.state, signals.now) > 0
          : step.verify === "press" ? signals.pressRendered
            : false;
    if (ok) verified[step.key] = true;
  }
  return verified;
}

/**
 * How a self-verifying step renders. `manual` is the escape hatch for a deployment whose `/api/state`
 * cannot report that presence at all (the legacy snapshot path has no `controllers`), so the
 * installer is never stranded on a step that can never tick. A body that carries the list - even an
 * empty one - is authoritative and stays `pending` until presence appears.
 */
export type StepMode = "verified" | "pending" | "manual";

export function stepMode(step: SetupStep, steps: Record<string, boolean>, state: unknown): StepMode {
  if (steps[step.key] === true) return "verified";
  if (step.verify === "manual" || step.verify === "download") return "manual";
  if (step.verify === "companion" && presenceListMissing(state, "controllers")) return "manual";
  if (step.verify === "renderer" && presenceListMissing(state, "renderers")) return "manual";
  return "pending";
}

/** What still needs writing back to `PUT /api/setup-progress`, given what is already stored. */
export function stepsToPersist(stored: Record<string, boolean>, verified: Record<string, true>): Record<string, boolean> {
  const pending: Record<string, boolean> = {};
  for (const [step, value] of Object.entries(verified)) if (value === true && stored[step] !== true) pending[step] = true;
  return pending;
}

/** Where a returning installer lands: the first step still to do. Null once every step is done. */
export function firstUnverifiedStep(flow: SetupFlow, steps: Record<string, boolean>): string | null {
  return flow.steps.find((step) => step.verify !== "none" && steps[step.key] !== true)?.key ?? null;
}

type DeviceRow = {name?: unknown; kind?: unknown; lastSeenAt?: unknown; revokedAt?: unknown};

/** The operator's Companion token (downloaded or paired from this page) has checked in at least once. */
export function personalCheckedIn(devices: unknown, operator: string): boolean {
  const list = devices && typeof devices === "object" && Array.isArray((devices as {devices?: unknown}).devices) ? (devices as {devices: DeviceRow[]}).devices : [];
  const prefix = `${operator}’s Companion`;
  return list.some((row) => row && row.kind === "companion" && typeof row.name === "string" && row.name.startsWith(prefix) && typeof row.lastSeenAt === "number" && row.revokedAt == null);
}

/** A pairing code from this page has been redeemed: its credential carries the code's name. */
export function pairingRedeemed(devices: unknown, name: string): boolean {
  const list = devices && typeof devices === "object" && Array.isArray((devices as {devices?: unknown}).devices) ? (devices as {devices: DeviceRow[]}).devices : [];
  return list.some((row) => row && row.kind === "companion" && row.name === name);
}
