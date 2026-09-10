#!/usr/bin/env node
/**
 * Destructive integration check for the loopback CRC website and its live relay.
 *
 * Usage (Node 24):
 *   SITE_URL=http://127.0.0.1:5180 SITE_CONTROL_KEY=... SITE_OUTPUT_KEY=... \
 *     node scripts/check-live-site.mts
 *
 * The check selects a catalog cue and finishes clear. It refuses every non-loopback
 * site before issuing a request so production cannot be mutated accidentally.
 */

import { randomUUID } from "node:crypto";

const REQUEST_TIMEOUT_MS = 4_000;
const EVENT_TIMEOUT_MS = 4_000;
const IDLE_OBSERVATION_MS = 20_250;
const HEARTBEAT_MS = 10_000;
const MAX_SNAPSHOT_BYTES = 256 * 1024;

type JsonRecord = Record<string, unknown>;
type Renderer = { id: string; revision: number; cue: string | null; phase: string; seen: number };
type Snapshot = {
  revision: number;
  cue: string | null;
  mode: string;
  catalogVersion: string;
  renderers: Renderer[];
  [key: string]: unknown;
};
type FetchRecord = { method: string; path: string; status: number; started: number };
type SocketEntry = { message: JsonRecord; bytes: number; index: number };

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  const parts = host.split(".");
  return parts.length === 4
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
    && Number(parts[0]) === 127;
}

function siteOrigin(raw: string | undefined): URL {
  check(raw, "SITE_URL is required");
  let supplied: URL;
  try {
    supplied = new URL(raw);
  } catch {
    throw new Error("SITE_URL must be an absolute URL");
  }
  check(["http:", "https:"].includes(supplied.protocol), "SITE_URL must use HTTP or HTTPS");
  check(loopback(supplied.hostname), "SITE_URL must use a loopback host");
  check(!supplied.username && !supplied.password, "SITE_URL must not contain credentials");
  check(!supplied.search && !supplied.hash, "SITE_URL must not contain a query or fragment");
  check(supplied.pathname === "/", "SITE_URL path must be /");
  return supplied;
}

function requiredSecret(name: "SITE_CONTROL_KEY" | "SITE_OUTPUT_KEY"): string {
  const value = process.env[name];
  check(typeof value === "string" && value.length > 0, `${name} is required`);
  return value;
}

let baseUrl: URL;
let controlKey: string;
let outputKey: string;
try {
  baseUrl = siteOrigin(process.env.SITE_URL);
  controlKey = requiredSecret("SITE_CONTROL_KEY");
  outputKey = requiredSecret("SITE_OUTPUT_KEY");
  check(typeof WebSocket === "function", "Node 24 native WebSocket is required");
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : "invalid site configuration"}`);
  process.exit(1);
}

const fetchRecords: FetchRecord[] = [];
async function trackedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(path.replace(/^\//, ""), baseUrl);
  check(target.origin === baseUrl.origin, "request escaped SITE_URL origin");
  const method = String(init.method ?? "GET").toUpperCase();
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(target, {
      ...init,
      method,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`site HTTP ${method} ${target.pathname} failed`);
  }
  fetchRecords.push({ method, path: `${target.pathname}${target.search}`, status: response.status, started });
  return response;
}

async function jsonRequest(
  path: string,
  key: string,
  { method = "GET", body, expected = [200] }: { method?: string; body?: unknown; expected?: number[] } = {},
): Promise<{ response: Response; value: unknown }> {
  const response = await trackedFetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  check(expected.includes(response.status), `${method} ${path} returned unexpected status ${response.status}`);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(`${method} ${path} returned invalid JSON`);
  }
  return { response, value };
}

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rendererList(value: unknown): Renderer[] {
  check(Array.isArray(value), "snapshot or presence lacks renderer list");
  for (const renderer of value) {
    check(record(renderer), "renderer presence is invalid");
    check(typeof renderer.id === "string", "renderer presence lacks id");
    check(Number.isSafeInteger(renderer.revision), "renderer presence lacks revision");
    check(renderer.cue === null || typeof renderer.cue === "string", "renderer presence has invalid cue");
    check(typeof renderer.phase === "string", "renderer presence lacks phase");
    check(typeof renderer.seen === "number" && Number.isFinite(renderer.seen), "renderer presence lacks seen time");
  }
  return value as Renderer[];
}

function snapshot(value: unknown): Snapshot {
  check(record(value), "snapshot payload is invalid");
  check(Number.isSafeInteger(value.revision) && Number(value.revision) >= 0, "snapshot lacks revision");
  check(value.cue === null || typeof value.cue === "string", "snapshot has invalid cue");
  check(typeof value.mode === "string", "snapshot lacks mode");
  check(typeof value.catalogVersion === "string", "snapshot lacks catalog version");
  rendererList(value.renderers);
  return value as Snapshot;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const activeClients = new Set<SiteClient>();
class SiteClient {
  readonly role: "control" | "output" | "preview";
  readonly id: string;
  readonly key: string;
  readonly messages: SocketEntry[] = [];
  readonly waiters = new Set<() => void>();
  socket: WebSocket | null = null;
  sentBytes = 0;
  receivedBytes = 0;
  snapshotCount = 0;
  renderers: Renderer[] = [];
  bootstrapTicket = "";

  constructor(role: "control" | "output" | "preview", id: string, key: string) {
    this.role = role;
    this.id = id;
    this.key = key;
    activeClients.add(this);
  }

  async connect(): Promise<Snapshot> {
    const { value } = await jsonRequest(`/api/realtime?role=${this.role}`, this.key);
    check(record(value), `${this.role} realtime bootstrap is invalid`);
    check(typeof value.url === "string" && typeof value.ticket === "string", `${this.role} realtime bootstrap lacks connection data`);
    check(value.protocol === 1, `${this.role} realtime bootstrap has unsupported protocol`);
    const socketUrl = new URL(value.url);
    check(socketUrl.protocol === "ws:" || socketUrl.protocol === "wss:", `${this.role} realtime URL is invalid`);
    check(socketUrl.protocol === "wss:" || loopback(socketUrl.hostname), `${this.role} plaintext realtime URL is not loopback`);
    this.bootstrapTicket = value.ticket;

    const ws = new WebSocket(socketUrl, ["crc-overlays-v1", `ticket.${value.ticket}`]);
    this.socket = ws;
    ws.addEventListener("message", (event) => {
      const text = String(event.data);
      this.receivedBytes += Buffer.byteLength(text);
      let message: unknown;
      try { message = JSON.parse(text); } catch { return; }
      if (!record(message)) return;
      if (message.type === "snapshot") {
        this.snapshotCount += 1;
        this.renderers = snapshot(message.snapshot).renderers;
      } else if (message.type === "presence") {
        this.renderers = rendererList(message.renderers);
      }
      const entry = { message, bytes: Buffer.byteLength(text), index: this.messages.length };
      this.messages.push(entry);
      for (const wake of this.waiters) wake();
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => done(() => reject(new Error(`${this.role} WebSocket open timed out`))), EVENT_TIMEOUT_MS);
      const opened = () => done(resolve);
      const failed = () => done(() => reject(new Error(`${this.role} WebSocket was rejected`)));
      const done = (callback: () => void) => {
        clearTimeout(timeout);
        ws.removeEventListener("open", opened);
        ws.removeEventListener("error", failed);
        ws.removeEventListener("close", failed);
        callback();
      };
      ws.addEventListener("open", opened, { once: true });
      ws.addEventListener("error", failed, { once: true });
      ws.addEventListener("close", failed, { once: true });
    });
    check(ws.protocol === "crc-overlays-v1", `${this.role} WebSocket selected the wrong protocol`);
    this.send({ type: "hello", id: this.id });
    const initial = await this.waitFor((message) => message.type === "snapshot");
    check(initial.bytes <= MAX_SNAPSHOT_BYTES, `${this.role} initial snapshot exceeds 256 KiB`);
    return snapshot(initial.message.snapshot);
  }

  send(message: JsonRecord): void {
    check(this.socket?.readyState === WebSocket.OPEN, `${this.role} WebSocket is not open`);
    const encoded = JSON.stringify(message);
    this.sentBytes += Buffer.byteLength(encoded);
    this.socket.send(encoded);
  }

  async waitFor(predicate: (message: JsonRecord) => boolean, after = 0, timeoutMs = EVENT_TIMEOUT_MS): Promise<SocketEntry> {
    const find = (): SocketEntry | null => {
      for (let index = after; index < this.messages.length; index += 1) {
        const entry = this.messages[index]!;
        if (predicate(entry.message)) return entry;
      }
      return null;
    };
    const existing = find();
    if (existing) return existing;
    return await new Promise<SocketEntry>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(wake);
        reject(new Error(`${this.role} WebSocket event timed out`));
      }, timeoutMs);
      const wake = () => {
        const found = find();
        if (!found) return;
        clearTimeout(timeout);
        this.waiters.delete(wake);
        resolve(found);
      };
      this.waiters.add(wake);
    });
  }

  async close(reason = "check complete"): Promise<void> {
    const ws = this.socket;
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      activeClients.delete(this);
      return;
    }
    const closed = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1_000);
      ws.addEventListener("close", () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    if (ws.readyState === WebSocket.OPEN) ws.close(1000, reason);
    else ws.close();
    await closed;
    activeClients.delete(this);
  }
}

function samePlayback(left: Snapshot, right: Snapshot): boolean {
  return left.revision === right.revision
    && left.cue === right.cue
    && left.mode === right.mode
    && left.catalogVersion === right.catalogVersion;
}

function revisionMessage(revision: number): (message: JsonRecord) => boolean {
  return (message) => message.type === "snapshot"
    && record(message.snapshot)
    && message.snapshot.revision === revision;
}

function presenceHas(id: string, expected: boolean): (message: JsonRecord) => boolean {
  return (message) => message.type === "presence"
    && Array.isArray(message.renderers)
    && message.renderers.some((item) => record(item) && item.id === id) === expected;
}

async function main(): Promise<void> {
  const page = await trackedFetch("/");
  check(page.status === 200, `GET / returned unexpected status ${page.status}`);
  check(page.headers.get("content-type")?.includes("text/html"), "GET / did not return the website");
  await page.body?.cancel();

  const catalogResult = await jsonRequest("/api/catalog", controlKey);
  check(Array.isArray(catalogResult.value) && catalogResult.value.length > 0, "catalog has no selectable cues");
  const catalogVersion = catalogResult.response.headers.get("X-CRC-Catalog-Version");
  check(catalogVersion, "catalog response lacks X-CRC-Catalog-Version");
  const cue = catalogResult.value.find((item) => record(item) && typeof item.id === "string" && !item.hidden);
  check(record(cue) && typeof cue.id === "string", "catalog has no valid visible cue");

  const clients = [
    new SiteClient("control", randomUUID(), controlKey),
    new SiteClient("output", randomUUID(), outputKey),
    new SiteClient("preview", randomUUID(), outputKey),
  ];
  const initial = await Promise.all(clients.map((client) => client.connect()));
  check(initial.every((current) => samePlayback(current, initial[0]!)), "initial role snapshots disagree");
  check(initial.every((current) => current.catalogVersion === catalogVersion), "initial snapshot and catalog versions disagree");
  const initialBootstrapEnd = fetchRecords.length;

  const controllerId = randomUUID();
  let sequence = 0;
  async function command(action: "in" | "out" | "clear" | "cut", selectedCue?: string): Promise<Snapshot> {
    const body = {
      commandId: randomUUID(),
      clientId: controllerId,
      sequence: ++sequence,
      action,
      ...(selectedCue === undefined ? {} : { cue: selectedCue }),
    };
    const { value } = await jsonRequest("/api/command", controlKey, { method: "POST", body });
    check(record(value), `${action} command response is invalid`);
    return snapshot(value);
  }

  await jsonRequest("/api/command", outputKey, {
    method: "POST",
    body: { commandId: randomUUID(), clientId: randomUUID(), sequence: 1, action: "cut" },
    expected: [401],
  });

  const shown = await command("in", cue.id);
  check(shown.cue === cue.id, "in command did not select the catalog cue");
  await Promise.all(clients.map((client) => client.waitFor(revisionMessage(shown.revision))));

  const output = clients[1]!;
  const presenceStarts = clients.map((client) => client.messages.length);
  output.send({ type: "ack", id: output.id, revision: shown.revision, cue: shown.cue, phase: "settled" });
  await Promise.all(clients.map((client, index) => client.waitFor(presenceHas(output.id, true), presenceStarts[index])));
  check(clients.every((client) => client.renderers.some((renderer) => renderer.id === output.id
    && renderer.revision === shown.revision && renderer.cue === shown.cue && renderer.phase === "settled")),
  "valid output acknowledgment did not appear in presence");

  const cleared = await command("clear");
  check(cleared.cue === null && cleared.mode === "animate", "clear did not request an animated empty state");
  await Promise.all(clients.map((client) => client.waitFor(revisionMessage(cleared.revision))));
  const cut = await command("cut");
  check(cut.cue === null && cut.mode === "cut", "cut did not request an immediate empty state");
  await Promise.all(clients.map((client) => client.waitFor(revisionMessage(cut.revision))));

  const afterCommands = fetchRecords.length;
  const idleBefore = clients.map((client) => ({
    receivedBytes: client.receivedBytes,
    sentBytes: client.sentBytes,
    snapshots: client.snapshotCount,
  }));
  const heartbeat = setInterval(() => {
    for (const client of clients) client.send({ type: "heartbeat" });
  }, HEARTBEAT_MS);
  try {
    await delay(IDLE_OBSERVATION_MS);
  } finally {
    clearInterval(heartbeat);
  }
  const idleFetches = fetchRecords.slice(afterCommands);
  check(idleFetches.length === 0, `idle subscription issued ${idleFetches.length} HTTP request(s)`);
  const idleDeltas = clients.map((client, index) => ({
    receivedBytes: client.receivedBytes - idleBefore[index]!.receivedBytes,
    sentBytes: client.sentBytes - idleBefore[index]!.sentBytes,
    snapshots: client.snapshotCount - idleBefore[index]!.snapshots,
  }));
  check(idleDeltas.every((delta) => delta.snapshots === 0), "idle heartbeat traffic emitted a snapshot");
  check(idleDeltas.every((delta) => delta.sentBytes > 0 && delta.receivedBytes > 0), "idle heartbeat traffic did not remain bidirectional");
  check(fetchRecords.slice(initialBootstrapEnd, afterCommands).every((item) => item.path === "/api/command"),
    "post-bootstrap operation used an unexpected HTTP endpoint");

  const removalStarts = [clients[0]!.messages.length, clients[2]!.messages.length];
  await output.close("reconnect exercise");
  await Promise.all([clients[0]!, clients[2]!].map((client, index) => client.waitFor(presenceHas(output.id, false), removalStarts[index])));

  const reconnected = new SiteClient("output", output.id, outputKey);
  const reconnectSnapshot = await reconnected.connect();
  check(reconnected.bootstrapTicket !== output.bootstrapTicket, "reconnect reused its realtime ticket");
  check(samePlayback(reconnectSnapshot, cut), "reconnect snapshot did not match current state");
  const reconnectPresenceStarts = [clients[0]!.messages.length, clients[2]!.messages.length];
  reconnected.send({ type: "ack", id: reconnected.id, revision: cut.revision, cue: null, phase: "settled" });
  await Promise.all([clients[0]!, clients[2]!].map((client, index) => client.waitFor(presenceHas(reconnected.id, true), reconnectPresenceStarts[index])));
  const finalRemovalStarts = [clients[0]!.messages.length, clients[2]!.messages.length];
  await reconnected.close();
  await Promise.all([clients[0]!, clients[2]!].map((client, index) => client.waitFor(presenceHas(reconnected.id, false), finalRemovalStarts[index])));

  const unexpectedReadPaths = fetchRecords.filter((item) => ["/api/state", "/api/ack"].includes(item.path)
    || (item.path === "/api/catalog" && item.started > fetchRecords[1]!.started));
  check(unexpectedReadPaths.length === 0, "check polled state, acknowledgment, or catalog endpoints");
  check(fetchRecords.slice(afterCommands).every((item) => item.path === "/api/realtime?role=output"),
    "reconnect used an unexpected HTTP endpoint");

  await Promise.all([clients[0]!.close(), clients[2]!.close()]);
  console.log(`PASS initial-clients ${clients.length}`);
  console.log(`PASS catalog ${catalogResult.value.length} cues version ${catalogVersion}`);
  console.log(`PASS command-fanout in-clear-cut revisions ${shown.revision},${cleared.revision},${cut.revision}`);
  console.log(`PASS output-auth-denied 1 presence-reconnect 1`);
  console.log(`PASS idle ${IDLE_OBSERVATION_MS}ms HTTP ${idleFetches.length} snapshots ${idleDeltas.reduce((sum, item) => sum + item.snapshots, 0)}`);
  console.log(`PASS idle-ws-bytes sent ${idleDeltas.reduce((sum, item) => sum + item.sentBytes, 0)} received ${idleDeltas.reduce((sum, item) => sum + item.receivedBytes, 0)}`);
  console.log(`PASS tracked-http ${fetchRecords.length}`);
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : "unknown live-site check failure"}`);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.allSettled([...activeClients].map((client) => client.close("check cleanup")));
});
