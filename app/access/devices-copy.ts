/**
 * Pure helpers for the "Paired devices" panel on `/access`. Kept out of the page so the
 * labels, the last-seen wording and the revoke notice can be unit-tested without React.
 *
 * A paired device is a Companion installation or a graphics output that holds its own
 * credential. Revocation is not instant: the relay keeps an already-open socket, so the
 * notice says what actually happens rather than promising an immediate disconnection.
 */

export type DeviceKind = "companion" | "output";

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
};

/** Shown once, after a successful revoke. */
export const DEVICE_REVOKED_NOTICE = "Revoked. This device stops at its next reconnection.";

/** An unrecognised kind is named rather than guessed at, so a new kind never renders blank. */
export function deviceKindLabel(kind: string): string {
  return kind === "companion" || kind === "output" ? DEVICE_KIND_LABEL[kind] : "Device";
}

/** "Last seen 12 min ago" — the whole phrase, including the words "Last seen". */
export function lastSeenText(lastSeenAt: number | null | undefined, now: number): string {
  if (typeof lastSeenAt !== "number" || !Number.isFinite(lastSeenAt) || lastSeenAt <= 0) return "Last seen never";
  const minutes = Math.max(0, Math.round((now - lastSeenAt) / 60_000));
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Last seen ${hours} h ago`;
  return `Last seen ${Math.round(hours / 24)} days ago`;
}

/** The full standing line under a device row: kind, then when it was last heard from. */
export function deviceStandingText(device: PairedDevice, now: number): string {
  const kind = deviceKindLabel(device.kind);
  if (typeof device.revokedAt === "number" && device.revokedAt > 0) return `${kind} · Revoked`;
  return `${kind} · ${lastSeenText(device.lastSeenAt, now)}`;
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
    if (value.kind !== "companion" && value.kind !== "output") continue;
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
