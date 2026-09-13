import test from "node:test";
import assert from "node:assert/strict";
import { BOOK_UNITS_OPERATION, fetchBookUnits, groupUnits, hasHebrew, visibleUnits } from "../lib/siddur-shelf.ts";

type Unit = { id: string; name: string; folio: string | null; blockCount: number; noteLikeOnly: boolean };

function unit(id: string, noteLikeOnly = false): Unit {
  return { id, name: id, folio: "p. 1", blockCount: 3, noteLikeOnly };
}

test("visibleUnits hides note-only units until the reader asks for notes", () => {
  const units = [unit("barchu"), unit("rubric-1", true), unit("shema")];
  assert.deepEqual(visibleUnits(units, false).map((item) => item.id), ["barchu", "shema"]);
  assert.deepEqual(visibleUnits(units, true).map((item) => item.id), ["barchu", "rubric-1", "shema"]);
  assert.deepEqual(visibleUnits(undefined, false), []);
});

test("groupUnits keeps printed section order and library order inside each section", () => {
  const groups = groupUnits({
    sections: [
      { index: 2, title: "Torah service", units: [unit("torah-a"), unit("torah-b")] },
      { index: 0, title: "Morning blessings", units: [unit("blessing-a"), unit("blessing-b")] },
      { index: 1, title: "Shema and its blessings", units: [unit("shema")] },
      { index: 3, title: "Concluding prayers", units: [] },
    ],
  });
  assert.deepEqual(groups.map((group) => group.title), ["Morning blessings", "Shema and its blessings", "Torah service"]);
  assert.deepEqual(groups[0].units.map((item) => item.id), ["blessing-a", "blessing-b"]);
  assert.deepEqual(groups[2].units.map((item) => item.id), ["torah-a", "torah-b"]);
  assert.equal(new Set(groups.map((group) => group.key)).size, groups.length);
});

test("a book that prints no section names renders as one unnamed group", () => {
  const single = groupUnits({ sections: [{ index: 0, title: null, units: [unit("kol-nidre")] }] });
  assert.equal(single.length, 1);
  assert.equal(single[0].title, null);
  assert.deepEqual(single[0].units.map((item) => item.id), ["kol-nidre"]);
  const blankTitles = groupUnits({
    sections: [
      { index: 0, title: "  ", units: [unit("one")] },
      { index: 1, title: null, units: [unit("two")] },
    ],
  });
  assert.equal(blankTitles.length, 1);
  assert.equal(blankTitles[0].title, null);
  assert.deepEqual(blankTitles[0].units.map((item) => item.id), ["one", "two"]);
  assert.deepEqual(groupUnits(null), []);
});

test("fetchBookUnits sends the authoring request shape and returns the outline", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return { ok: true, status: 200, json: async () => ({ book: { value: "shabbat-shacharit", label: "Shabbat Shacharit" }, sections: [], total: 0, noteLikeOnly: 0 }) } as unknown as Response;
  }) as unknown as typeof fetch;
  const outcome = await fetchBookUnits<{ total: number }>("control-key", "shabbat-shacharit", undefined, fake);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.result.total, 0);
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, "/api/authoring");
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.deepEqual(init.headers, { "Content-Type": "application/json", Authorization: "Bearer control-key" });
  assert.equal(init.body, JSON.stringify({ operation: BOOK_UNITS_OPERATION, input: { book: "shabbat-shacharit" } }));
  assert.equal(init.signal, undefined);
});

test("fetchBookUnits omits the bearer header for a session key", async () => {
  let headers: unknown;
  const fake = (async (_url: string, init: RequestInit) => {
    headers = init.headers;
    return { ok: true, status: 200, json: async () => ({ sections: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
  await fetchBookUnits("session", "crc-kol-nidre", undefined, fake);
  assert.deepEqual(headers, { "Content-Type": "application/json" });
});

test("an unknown book comes back as a message, never as a throw", async () => {
  const fake = (async () => ({ ok: false, status: 404, json: async () => ({ error: "Unknown authoring source book", code: "unknown_source" }) } as unknown as Response)) as unknown as typeof fetch;
  const outcome = await fetchBookUnits("control-key", "no-such-book", undefined, fake);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.error, "unknown_source");
  assert.match(outcome.ok === false ? outcome.message : "", /not in the library/);
});

test("a network failure and an aborted load are reported, not thrown", async () => {
  const failing = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const failed = await fetchBookUnits("control-key", "shabbat-shacharit", undefined, failing);
  assert.equal(failed.ok, false);
  assert.equal(failed.ok === false && failed.error, "network");
  assert.ok(failed.ok === false && failed.message.length > 0);
  const controller = new AbortController();
  controller.abort();
  const aborted = await fetchBookUnits("control-key", "shabbat-shacharit", controller.signal, failing);
  assert.equal(aborted.ok === false && aborted.error, "aborted");
});

test("hasHebrew only marks Hebrew names for lang and direction", () => {
  assert.equal(hasHebrew("שמע"), true);
  assert.equal(hasHebrew("Sh'ma"), false);
  assert.equal(hasHebrew(null), false);
});
