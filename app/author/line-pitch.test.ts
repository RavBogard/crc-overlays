import assert from "node:assert/strict";
import test from "node:test";
import { linePitchPx, matchingLineHeight } from "./line-pitch.ts";

test("line spacing is read in pixels, with normal taken as 1.2", () => {
  assert.equal(linePitchPx({ fontSize: "46px", lineHeight: "52.9px" }), 52.9);
  assert.equal(linePitchPx({ fontSize: "40px", lineHeight: "normal" }), 48);
  assert.equal(linePitchPx({ fontSize: "", lineHeight: "52px" }), null);
  assert.equal(linePitchPx(null), null);
});

test("matching the Hebrew's spacing gives the line height for this role's own size", () => {
  // Birkat Kohanim: Hebrew 46px x 1.15 = 52.9px; transliteration is 38px.
  assert.equal(matchingLineHeight(52.9, 38), 1.4);
  assert.equal(matchingLineHeight(52.9, 46), 1.15);
  assert.equal(matchingLineHeight(120, 30), 2, "kept within the control's range");
  assert.equal(matchingLineHeight(20, 40), 0.9);
  assert.equal(matchingLineHeight(0, 38), null);
});
