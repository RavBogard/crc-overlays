/**
 * Layout pass (handoff #2, D1) — the one reading behind the header's status dot.
 *
 * Green when a graphics output has acknowledged within the last 30 seconds, amber when none
 * has, grey until the relay has answered at all. Freshness is measured against the relay's own
 * clock, so a booth computer whose clock is wrong does not turn the dot amber.
 */

export type DotState = 'unknown' | 'connected' | 'waiting';
export type PresenceSnapshot = {
  serverTime?: number;
  cue?: string | null;
  cuePayload?: {name?: string} | null;
  renderers?: Array<{seen?: number}>;
  controllers?: Array<{client?: string | null; seen?: number}>;
};

export const OUTPUT_FRESH_MS = 30_000;

export function readSnapshot(snapshot: PresenceSnapshot | null): {state: DotState; line: string} {
  if (!snapshot) return {state: 'unknown', line: 'Checking the output…'};
  const now = typeof snapshot.serverTime === 'number' ? snapshot.serverTime : Date.now();
  const outputs = (snapshot.renderers ?? []).filter(item => typeof item.seen === 'number' && now - item.seen <= OUTPUT_FRESH_MS).length;
  const companion = (snapshot.controllers ?? []).some(item => item.client === 'companion');
  if (!outputs) return {state: 'waiting', line: 'No output seen in the last 30 seconds'};
  return {state: 'connected', line: companion ? 'Output connected · Companion connected' : 'Output connected'};
}
