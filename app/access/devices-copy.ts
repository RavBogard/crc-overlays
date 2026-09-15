/**
 * Pure helpers for the "Paired devices" panel on `/access`. Kept out of the page so the
 * labels, the last-seen wording and the revoke notice can be unit-tested without React.
 *
 * A paired device is a Companion installation, a graphics output, or a service-history
 * connection - each holds its own credential. Revocation is not instant: the relay keeps
 * an already-open socket, so the notice says what actually happens rather than promising
 * an immediate disconnection.
 */

export type DeviceKind = "companion" | "output" | "history_reader";

export type PairedDevice = {
  id: string;
  name: string;
  kind: DeviceKind;
  createdBy?: string;
  createdAt?: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
};

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  companion: "Companion",
  output: "Graphics output",
  history_reader: "Service history",
};

/** Shown once, after a successful revoke. */
export const DEVICE_REVOKED_NOTICE = "Revoked. This device stops at its next reconnection.";

/**
 * The three kinds this panel knows, in one place. `readDeviceList` and `deviceKindLabel`
 * read it rather than each repeating the literals: they disagreed once, and a kind the
 * reader dropped was a credential the operator could not see and therefore could not
 * revoke - which is exactly what the cue-log return promised would be revocable here.
 */
const DEVICE_KINDS: readonly DeviceKind[] = ["companion", "output", "history_reader"];

export function isDeviceKind(value: unknown): value is DeviceKind {
  return typeof value === "string" && (DEVICE_KINDS as readonly string[]).includes(value);
}

/** An unrecognised kind is named rather than guessed at, so a new kind never renders blank. */
export function deviceKindLabel(kind: string): string {
  return isDeviceKind(kind) ? DEVICE_KIND_LABEL[kind] : "Device";
}

/**
 * "Last connected 12 min ago" - the whole phrase, including the words "Last connected".
 *
 * `last_seen_at` is written when a credential is verified against the store, which now
 * happens on every new live connection (a realtime ticket verifies afresh), not while a
 * socket is merely open. So the honest label is when the device last connected, not when
 * it was last heard from.
 */
export function lastConnectedText(lastSeenAt: number | null | undefined, now: number): string {
  if (typeof lastSeenAt !== "number" || !Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return "Last connected never";
  const minutes = Math.max(0, Math.round((now - lastSeenAt) / 60_000));
  if (minutes < 1) return "Last connected just now";
  if (minutes < 60) return `Last connected ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Last connected ${hours} h ago`;
  return `Last connected ${Math.round(hours / 24)} days ago`;
}

/** The full standing line under a device row: kind, then when it last connected. */
export function deviceStandingText(device: PairedDevice, now: number): string {
  const kind = deviceKindLabel(device.kind);
  if (typeof device.revokedAt === "number" && device.revokedAt > 0) return `${kind} · Revoked`;
  return `${kind} · ${lastConnectedText(device.lastSeenAt, now)}`;
}

/** Revoked devices stay out of the list; the panel is about what can still connect. */
export function activeDevices(devices: readonly PairedDevice[]): PairedDevice[] {
  return devices.filter((device) => !(typeof device.revokedAt === "number" && device.revokedAt > 0));
}

/** True when a named output connection exists that has not been revoked (D10 `output-connected`). */
export function hasNamedOutputCredential(devices: readonly PairedDevice[]): boolean {
  return activeDevices(devices).some((device) => device.kind === "output");
}

/** Reads `GET /api/devices` defensively: an unusable row is dropped, never thrown. */
export function readDeviceList(body: unknown): PairedDevice[] {
  const rows = body && typeof body === "object" && Array.isArray((body as {devices?: unknown}).devices)
    ? (body as {devices: unknown[]}).devices
    : [];
  const devices: PairedDevice[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    if (typeof value.id !== "string" || typeof value.name !== "string") continue;
    if (!isDeviceKind(value.kind)) continue;
    devices.push({
      id: value.id,
      name: value.name,
      kind: value.kind,
      lastSeenAt: typeof value.lastSeenAt === "number" ? value.lastSeenAt : null,
      revokedAt: typeof value.revokedAt === "number" ? value.revokedAt : null,
    });
  }
  return devices;
}
