#!/usr/bin/env node
/**
 * Destructive integration check for a local CRC live relay.
 *
 * Usage (Node 24):
 *   RELAY_URL=http://127.0.0.1:8787 RELAY_SECRET=... node scripts/check-live-relay.mjs
 *
 * RELAY_URL must identify a loopback origin, optionally ending in /connect.
 * The check installs two synthetic catalog cues, sends commands, and leaves it clear.
 */

import { createHmac, randomUUID } from "node:crypto";

const REQUEST_TIMEOUT_MS = 3_000;
const EVENT_TIMEOUT_MS = 3_000;
const IDLE_OBSERVATION_MS = 1_200;
const MAX_SNAPSHOT_BYTES = 256 * 1024;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function loopback(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  const parts = host.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    Number(parts[0]) === 127
  );
}

function endpoints(raw) {
  check(raw, "RELAY_URL is required");
  let supplied;
  try {
    supplied = new URL(raw);
  } catch {
    throw new Error("RELAY_URL must be an absolute URL");
  }
  check(["http:", "https:", "ws:", "wss:"].includes(supplied.protocol), "unsupported relay URL scheme");
  check(loopback(supplied.hostname), "RELAY_URL must use a loopback host");
  check(!supplied.username && !supplied.password, "RELAY_URL must not contain credentials");
  check(!supplied.search && !supplied.hash, "RELAY_URL must not contain a query or fragment");
  check(["/", "/connect"].includes(supplied.pathname), "RELAY_URL path must be / or /connect");

  const httpBase = new URL(supplied);
  httpBase.protocol = ["https:", "wss:"].includes(supplied.protocol) ? "https:" : "http:";
  httpBase.pathname = "/";
  const socket = new URL(httpBase);
  socket.protocol = httpBase.protocol === "https:" ? "wss:" : "ws:";
  socket.pathname = "/connect";
  return { httpBase, socket };
}

let secret;
let httpBase;
let socket;
try {
  secret = process.env.RELAY_SECRET;
  check(typeof secret === "string" && secret.length > 0, "RELAY_SECRET is required");
  ({ httpBase, socket } = endpoints(process.env.RELAY_URL));
  check(typeof WebSocket === "function", "Node 24 native WebSocket is required");
} catch (error) {
  const message = error instanceof Error ? error.message : "invalid relay configuration";
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function ticket(role, signingSecret = secret) {
  const body = Buffer.from(
    JSON.stringify({ room: "crc", role, exp: Math.floor(Date.now() / 1000) + 60, jti: randomUUID() }),
  ).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function request(path, { method = "GET", body, expected = [200] } = {}) {
  const target = new URL(path.replace(/^\//, ""), httpBase);
  let response;
  try {
    response = await fetch(target, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(`relay HTTP ${method} failed`);
  }
  check(expected.includes(response.status), `relay HTTP ${method} returned unexpected status ${response.status}`);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error(`relay HTTP ${method} returned invalid JSON`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const activeClients=new Set();
class RelayClient {
  constructor(role, id) {
    this.role = role;
    this.id = id;
    this.messages = [];
    this.waiters = new Set();
    this.socket = null;
    activeClients.add(this);
  }

  async connect() {
    const ws = new WebSocket(socket, ["crc-overlays-v1", `ticket.${ticket(this.role)}`]);
    this.socket = ws;
    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const entry = { message, bytes: Buffer.byteLength(String(event.data)) };
      this.messages.push(entry);
      for (const wake of this.waiters) wake();
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${this.role} WebSocket open timed out`)), EVENT_TIMEOUT_MS);
      const done = (callback) => {
        clearTimeout(timeout);
        ws.removeEventListener("open", opened);
        ws.removeEventListener("error", failed);
        ws.removeEventListener("close", failed);
        callback();
      };
      const opened = () => done(resolve);
      const failed = () => done(() => reject(new Error(`${this.role} WebSocket was rejected`)));
      ws.addEventListener("open", opened, { once: true });
      ws.addEventListener("error", failed, { once: true });
      ws.addEventListener("close", failed, { once: true });
    });
    check(ws.protocol === "crc-overlays-v1", `${this.role} WebSocket selected the wrong protocol`);
    this.send({ type: "hello", id: this.id });
    const initial = await this.waitFor((message) => message.type === "snapshot");
    check(initial.bytes <= MAX_SNAPSHOT_BYTES, `${this.role} initial snapshot exceeds 256 KiB`);
    return initial.message.snapshot;
  }

  send(message) {
    check(this.socket?.readyState === WebSocket.OPEN, `${this.role} WebSocket is not open`);
    this.socket.send(JSON.stringify(message));
  }

  async waitFor(predicate, after = 0, timeoutMs = EVENT_TIMEOUT_MS) {
    const find = () => {
      for (let index = after; index < this.messages.length; index += 1) {
        const entry = this.messages[index];
        if (predicate(entry.message)) return { ...entry, index };
      }
      return null;
    };
    const existing = find();
    if (existing) return existing;
    return await new Promise((resolve, reject) => {
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

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close(1000, "check complete");
  }
}

async function rejectedTicket() {
  const invalid = ticket("preview", `${secret}:invalid`);
  const ws = new WebSocket(socket, ["crc-overlays-v1", `ticket.${invalid}`]);
  const opened = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 1_500);
    ws.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(true);
    }, { once: true });
    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      resolve(false);
    }, { once: true });
    ws.addEventListener("close", () => {
      clearTimeout(timeout);
      resolve(false);
    }, { once: true });
  });
  if (opened) ws.close(1000, "invalid ticket check");
  check(!opened, "relay accepted an invalid ticket");
}

/* The cue log pins the `library:` sources of the graphic that was shown, so one synthetic cue
   carries one (the id need not exist in the siddur library: the relay stores what was pinned and
   the web server is the side that resolves it) and the other carries none. */
const LIBRARY_SOURCE = "library:relay-check-source";
const COLLECTION_ID = randomUUID();

function syntheticCue(id, label, sourceIds) {
  return {
    id,
    name: label,
    layout: "bottom",
    texts: { textTitle: label, textMain: label },
    animations: [],
    duration: { in: 0, out: 0 },
    ...(sourceIds ? { authoring: { sourceIds } } : {}),
  };
}

function snapshotMessage(revision) {
  return (message) => message.type === "snapshot" && message.snapshot?.revision === revision;
}

function rendererIds(snapshot) {
  return new Set(Array.isArray(snapshot?.renderers) ? snapshot.renderers.map((renderer) => renderer.id) : []);
}

async function waitForState(predicate) {
  const deadline = Date.now() + EVENT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await request("/state");
    if (predicate(state)) return state;
    await delay(50);
  }
  throw new Error("relay state condition timed out");
}

/**
 * The cue log (2026-09-14 integration ruling 7). Fires the four live actions, reads the history
 * back, and asserts the three things the ruling actually turns on: the order is the order the
 * commands were accepted in, the library sources of the graphic ride along so the web server can
 * resolve a position (and none ride along for a graphic that has none), and no row carries
 * anything about a person. The window bound is read from the relay's own answer, and the
 * administrator's clear is exercised last - this check is destructive and refuses any host that
 * is not loopback.
 */
const HISTORY_KEYS = ["seq", "at", "action", "cueId", "source", "serviceRef", "sourceIds"];

async function checkHistory({ cueA, cueB, collectionId }) {
  const from = Date.now();
  const controller = `history-${randomUUID()}`;
  let sequence = 0;
  const fire = (action, cue, extra = {}) =>
    request("/command", {
      method: "POST",
      body: { action, cue, commandId: randomUUID(), clientId: controller, sequence: ++sequence, ...extra },
    });
  await fire("in", cueA.id, { source: "companion" });
  await fire("out", cueA.id);
  await fire("in", cueB.id);
  await fire("in", `names:${collectionId}:01`);
  await fire("cut", null);
  await fire("clear", null);

  const history = await request(`/history?since=${from}`);
  check(typeof history?.workspace === "string" && history.workspace.length > 0, "history did not name its workspace");
  check(Array.isArray(history.rows), "history did not return rows");
  check(history.window?.rows === 2000 && history.window?.days === 14, "history window is not the ruled bound");
  const mine = history.rows.filter((row) => row.at >= from);
  check(
    mine.map((row) => row.action).join(",") === "in,out,in,in,cut,clear",
    `history did not record the accepted commands in order (${mine.map((row) => row.action).join(",")})`,
  );
  check(mine.every((row, index) => index === 0 || row.seq > mine[index - 1].seq), "history sequence regressed");
  check(history.nextAfter === null, "a six-row history should not need a second page");

  const [shown, , custom, names] = mine;
  check(shown.cueId === cueA.id && shown.source === "companion", "history lost the graphic or where the command came from");
  check(
    Array.isArray(shown.sourceIds) && shown.sourceIds.length === 1 && shown.sourceIds[0] === LIBRARY_SOURCE,
    "history did not pin the library source of the graphic that was shown",
  );
  check(custom.cueId === cueB.id && custom.sourceIds.length === 0, "a graphic with no library source must pin nothing");
  check(names.serviceRef === collectionId, "a names panel must name the prepared service it belongs to");
  check(mine[4].cueId === null && mine[5].cueId === null, "cut and clear must name no graphic");
  for (const row of mine) {
    const keys = Object.keys(row).sort();
    check(keys.join(",") === [...HISTORY_KEYS].sort().join(","), `history row carried keys it must not: ${keys.join(",")}`);
    const serialized = JSON.stringify(row);
    for (const forbidden of [cueA.name, cueB.name, "Relay check"]) check(!serialized.includes(forbidden), "history row carried a graphic name");
  }

  const paged = await request(`/history?since=${from}&limit=2`);
  check(paged.rows.length === 2 && paged.nextAfter === paged.rows[1].seq, "history did not page by seq");
  const rest = await request(`/history?since=${from}&after=${paged.nextAfter}`);
  check(rest.rows.length === mine.length - 2, "the second page did not continue where the first stopped");

  const refused = await fetch(new URL("history?since=whenever", httpBase), {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  check(refused.status === 400, "history accepted a range it cannot read");

  const cleared = await request("/history/clear", { method: "POST", body: {} });
  check(cleared?.ok === true && Number.isSafeInteger(cleared.cleared), "history clear did not report what it removed");
  const afterClear = await request("/history");
  check(
    afterClear.rows.length === 1 && afterClear.rows[0].action === "history_cleared",
    "clearing the history must leave the clearing itself as the only row",
  );

  console.log(`PASS history-rows ${mine.length}`);
  console.log(`PASS history-source-pin 1`);
  console.log(`PASS history-service-ref 1`);
  console.log(`PASS history-paging 2`);
  console.log(`PASS history-forbidden-keys 0`);
  console.log(`PASS history-cleared ${cleared.cleared}`);
}

async function main() {
  let catalogVersion = `relay-check-${randomUUID()}`;
  const empty = { revision: 0, cue: null, mode: "animate", updated: 0, cuePayload: null };
  const cueA = syntheticCue(`relay-a-${randomUUID()}`, "Relay check A", [LIBRARY_SOURCE, "custom:relay-check"]);
  const cueB = syntheticCue(`relay-b-${randomUUID()}`, "Relay check B");
  const namesCue = syntheticCue(`names:${COLLECTION_ID}:01`, "Relay check names");
  await request("/initialize", {
    method: "POST",
    body: { state: empty, catalogVersion, cues: [cueA, cueB, namesCue] },
    expected: [200, 201, 409],
  });
  await request("/catalog", {
    method: "POST",
    body: { version: catalogVersion, cues: [cueA, cueB, namesCue] },
  });
  const initialCatalog = await request("/catalog");
  check(
    initialCatalog?.version === catalogVersion && initialCatalog.cues?.length === 3,
    "relay did not store the synthetic catalog",
  );
  const starting = await request("/state");
  check(starting && Number.isSafeInteger(starting.revision), "relay did not expose initialized state");
  await rejectedTicket();

  const clients = [
    new RelayClient("control", randomUUID()),
    new RelayClient("output", randomUUID()),
    new RelayClient("preview", randomUUID()),
  ];
  const initial = await Promise.all(clients.map((client) => client.connect()));
  check(initial.every((snapshot) => snapshot.revision === starting.revision), "initial snapshots disagree");

  const controller = `controller-${randomUUID()}`;
  let sequence = 10;
  const acceptedRevisions = [];

  async function command(action, cue, { commandId = randomUUID(), nextSequence = ++sequence } = {}) {
    return await request("/command", {
      method: "POST",
      body: {
        action,
        cue,
        commandId,
        clientId: controller,
        sequence: nextSequence,
      },
    });
  }

  async function accepted(action, cue) {
    const response = await command(action, cue);
    acceptedRevisions.push(response.revision);
    await Promise.all(clients.map((client) => client.waitFor(snapshotMessage(response.revision))));
    return response;
  }

  const shownA = await accepted("in", cueA.id);
  check(shownA.cue === cueA.id && shownA.cuePayload?.id === cueA.id, "in did not pin the selected cue");
  await request("/command", {
    method: "POST",
    body: {
      action: "in",
      cue: `unknown-${randomUUID()}`,
      commandId: randomUUID(),
      clientId: controller,
      sequence: sequence + 1,
    },
    expected: [400],
  });

  const publishedCueA = { ...cueA, name: "Relay check A published", texts: { ...cueA.texts, textTitle: "Published" } };
  const publicationVersion = `relay-check-published-${randomUUID()}`;
  const catalogStarts = clients.map((client) => client.messages.length);
  await request("/catalog", {
    method: "POST",
    body: { version: publicationVersion, cues: [publishedCueA, cueB, namesCue] },
  });
  await Promise.all(
    clients.map((client, index) =>
      client.waitFor(
        (message) => message.type === "catalog" && message.version === publicationVersion,
        catalogStarts[index],
      ),
    ),
  );
  const afterPublication = await request("/state");
  check(
    afterPublication.revision === shownA.revision &&
      afterPublication.cuePayload?.texts?.textTitle === cueA.texts.textTitle,
    "catalog publication changed the selected pinned payload",
  );
  await request("/catalog", {
    method:"POST",
    body:{version:`stale-${randomUUID()}`,expectedVersion:catalogVersion,cues:[cueA,cueB,namesCue]},
    expected:[409],
  });
  check((await request('/catalog')).version===publicationVersion,"stale publisher overwrote the live catalog");
  catalogVersion = publicationVersion;

  const noncurrentId = randomUUID();
  const beforeNoncurrent = shownA.revision;
  const noncurrent = await command("out", cueB.id, { commandId: noncurrentId });
  check(noncurrent.revision === beforeNoncurrent + 1, "noncurrent out did not advance revision");
  check(noncurrent.cue === cueA.id && noncurrent.cuePayload?.id === cueA.id, "noncurrent out changed the selected cue");
  acceptedRevisions.push(noncurrent.revision);
  await Promise.all(clients.map((client) => client.waitFor(snapshotMessage(noncurrent.revision))));

  const retry = await command("out", cueB.id, { commandId: noncurrentId, nextSequence: sequence });
  check(retry.revision === noncurrent.revision, "idempotent retry advanced revision");
  await request("/command", {
    method: "POST",
    body: {
      action: "clear",
      cue: null,
      commandId: noncurrentId,
      clientId: controller,
      sequence,
    },
    expected: [409],
  });

  const shownB = await accepted("in", cueB.id);
  const oldSequence = sequence - 1;
  const ignored = await command("in", cueA.id, { nextSequence: oldSequence });
  check(ignored.revision === shownB.revision && ignored.cue === cueB.id, "older controller sequence changed state");

  const cut = await accepted("cut", null);
  check(cut.cue === null && cut.cuePayload === null && cut.mode === "cut", "cut did not clear immediately");
  const cleared = await accepted("clear", null);
  check(cleared.cue === null && cleared.cuePayload === null && cleared.mode === "animate", "clear did not leave empty state");

  for (const client of clients) {
    const revisions = client.messages
      .map(({ message }) => message.type === "snapshot" ? message.snapshot?.revision : null)
      .filter(Number.isSafeInteger);
    check(revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]), `${client.role} snapshot order regressed`);
  }

  const idleStarts = clients.map((client) => client.messages.length);
  clients.forEach((client) => client.send({ type: "heartbeat" }));
  await delay(IDLE_OBSERVATION_MS);
  let idleEvents = 0;
  clients.forEach((client, clientIndex) => {
    const idle = client.messages.slice(idleStarts[clientIndex]);
    idleEvents += idle.length;
    check(!idle.some(({ message }) => message.type === "snapshot"), "idle relay emitted a full snapshot");
    check(!idle.some(({ message }) => Object.hasOwn(message, "cuePayload")), "idle relay emitted a full cue payload");
  });

  const output = clients[1];
  const ack = { id: output.id, revision: cleared.revision, cue: null, phase: "settled" };
  output.send({ type: "ack", ...ack });
  const withOutput = await waitForState((state) => rendererIds(state).has(output.id));
  clients[0].send({ type: "ack", ...ack, id: clients[0].id });
  clients[2].send({ type: "heartbeat", ack: { ...ack, id: clients[2].id } });
  await delay(150);
  const protectedState = await request("/state");
  const protectedIds = rendererIds(protectedState);
  check(protectedIds.has(output.id), "output acknowledgment did not create presence");
  check(!protectedIds.has(clients[0].id) && !protectedIds.has(clients[2].id), "non-output role spoofed renderer presence");

  output.close();
  await waitForState((state) => !rendererIds(state).has(output.id));
  const reconnected = new RelayClient("output", output.id);
  const reconnectSnapshot = await reconnected.connect();
  check(
    reconnectSnapshot.revision === cleared.revision && reconnectSnapshot.cue === null && reconnectSnapshot.mode === "animate",
    "reconnect snapshot did not match current empty state",
  );
  reconnected.close();
  clients[0].close();
  clients[2].close();

  console.log(`PASS connections ${clients.length + 1}`);
  console.log(`PASS accepted-commands ${acceptedRevisions.length}`);
  console.log(`PASS fanout-snapshots ${clients.reduce((count, client) => count + client.messages.filter(({ message }) => message.type === "snapshot").length, 0)}`);
  console.log(`PASS idle-events ${idleEvents}`);
  console.log(`PASS presence-renderers ${withOutput.renderers.length}`);
  console.log("PASS invalid-tickets 1");
  await checkHistory({ cueA, cueB, collectionId: COLLECTION_ID });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown relay check failure";
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}).finally(()=>{for(const client of activeClients)client.close()});
