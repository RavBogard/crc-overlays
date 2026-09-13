import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIndexHtml,
  buildManifest,
  DEFAULT_OUT_DIR,
  FACES,
  filesForCue,
  FRAME_WIDTHS,
  manifestEntry,
  parseArgs,
  stillUrl,
  UsageError,
  visibleCues,
} from "../scripts/t3-stills.mjs";

// Pure argument parsing — no browser, no filesystem, no network.
test("parseArgs defaults to a full run against the default output directory", () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, only: null, out: DEFAULT_OUT_DIR });
});

test("parseArgs recognizes --dry-run", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), { dryRun: true, only: null, out: DEFAULT_OUT_DIR });
});

test("parseArgs recognizes --only <id>", () => {
  assert.deepEqual(parseArgs(["--only", "cue_123"]), { dryRun: false, only: "cue_123", out: DEFAULT_OUT_DIR });
});

test("parseArgs recognizes --out <dir>", () => {
  assert.deepEqual(parseArgs(["--out", "work/tmp/stills"]), { dryRun: false, only: null, out: "work/tmp/stills" });
});

test("parseArgs combines flags in any order", () => {
  assert.deepEqual(parseArgs(["--only", "cue_1", "--dry-run", "--out", "here"]), { dryRun: true, only: "cue_1", out: "here" });
});

test("parseArgs rejects --only and --out with no value", () => {
  assert.throws(() => parseArgs(["--only"]), UsageError);
  assert.throws(() => parseArgs(["--out"]), UsageError);
});

test("parseArgs rejects an unknown flag", () => {
  assert.throws(() => parseArgs(["--bogus"]), UsageError);
});

// visibleCues — the same "published, visible" rule as lib/catalog-count.ts and the
// compare page, applied to the catalog this script fetches from /api/catalog.
test("visibleCues drops hidden and aliased entries, keeps the rest", () => {
  const cues = [
    { id: "a" },
    { id: "b", hidden: true },
    { id: "c", aliasOf: "a" },
    { id: "d", hidden: false, aliasOf: null },
  ];
  assert.deepEqual(
    visibleCues(cues).map((cue) => cue.id),
    ["a", "d"],
  );
});

test("visibleCues tolerates a non-array input", () => {
  assert.deepEqual(visibleCues(null), []);
  assert.deepEqual(visibleCues(undefined), []);
});

// URL construction for the compare page's query mode.
test("stillUrl builds the compare page query-mode URL", () => {
  assert.equal(
    stillUrl("http://localhost:5175", "cue_abc", "book", 480),
    "http://localhost:5175/author/fit-check/faces?cue=cue_abc&faces=book&frame=480",
  );
  assert.equal(
    stillUrl("http://localhost:5175", "cue_abc", "default", 1920),
    "http://localhost:5175/author/fit-check/faces?cue=cue_abc&faces=default&frame=1920",
  );
});

test("stillUrl encodes a cue id that needs it", () => {
  const url = stillUrl("http://localhost:5175", "cue with space", "default", 1920);
  assert.ok(url.includes("cue=cue%20with%20space"));
});

test("FRAME_WIDTHS and FACES are the two frames and two face sets the script visits", () => {
  assert.deepEqual(FRAME_WIDTHS, [1920, 480]);
  assert.deepEqual(FACES, ["default", "book"]);
});

// Manifest shaping.
test("filesForCue names six files per cue: two renders and one composite per frame", () => {
  const files = filesForCue("cue_1");
  assert.deepEqual(files, {
    default1920: "cue_1-default-1920.png",
    book1920: "cue_1-book-1920.png",
    sideBySide1920: "cue_1-side-by-side-1920.png",
    default480: "cue_1-default-480.png",
    book480: "cue_1-book-480.png",
    sideBySide480: "cue_1-side-by-side-480.png",
  });
});

test("manifestEntry carries id, name, layout, files, fit verdicts, and a null error by default", () => {
  const cue = { id: "cue_1", name: "Barechu", layout: "bottom" };
  const files = filesForCue(cue.id);
  const entry = manifestEntry(cue, files, { default1920: "ok", book1920: "fail" });
  assert.equal(entry.id, "cue_1");
  assert.equal(entry.name, "Barechu");
  assert.equal(entry.layout, "bottom");
  assert.equal(entry.files, files);
  assert.deepEqual(entry.fit, { default1920: "ok", book1920: "fail" });
  assert.equal(entry.error, null);
});

test("manifestEntry records a failure message when given one", () => {
  const cue = { id: "cue_2", name: "Kaddish", layout: "left" };
  const entry = manifestEntry(cue, filesForCue(cue.id), {}, "timed out waiting for data-ready");
  assert.equal(entry.error, "timed out waiting for data-ready");
});

test("buildManifest counts entries and failures and stamps a generatedAt timestamp", () => {
  const entries = [
    manifestEntry({ id: "a", name: "A", layout: "bottom" }, filesForCue("a"), { default1920: "ok" }, null),
    manifestEntry({ id: "b", name: "B", layout: "bottom" }, filesForCue("b"), {}, "boom"),
  ];
  const manifest = buildManifest(entries);
  assert.equal(manifest.count, 2);
  assert.equal(manifest.failed, 1);
  assert.equal(manifest.entries, entries);
  assert.ok(!Number.isNaN(Date.parse(manifest.generatedAt)));
});

// The HTML contact sheet: relative image paths, cue name + layout captions, escaped text.
test("buildIndexHtml references the side-by-side composites by relative path and captions each section", () => {
  const entry = manifestEntry({ id: "cue_1", name: "Barechu", layout: "bottom" }, filesForCue("cue_1"), { default1920: "ok" }, null);
  const html = buildIndexHtml([entry]);
  assert.ok(html.includes("Barechu"));
  assert.ok(html.includes("bottom"));
  assert.ok(html.includes("cue_1-side-by-side-1920.png"));
  assert.ok(html.includes("cue_1-side-by-side-480.png"));
  assert.ok(!html.includes("/work/handoffs"), "image paths must be relative, not absolute");
});

test("buildIndexHtml escapes cue names so untrusted catalog text cannot break the page", () => {
  const entry = manifestEntry({ id: "cue_1", name: '<script>alert(1)</script>', layout: "bottom" }, filesForCue("cue_1"), {}, null);
  const html = buildIndexHtml([entry]);
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("buildIndexHtml surfaces a per-cue error instead of broken images", () => {
  const entry = manifestEntry({ id: "cue_1", name: "Barechu", layout: "bottom" }, filesForCue("cue_1"), {}, "Fonts or artwork did not load in time.");
  const html = buildIndexHtml([entry]);
  assert.ok(html.includes("Fonts or artwork did not load in time."));
});
