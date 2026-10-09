/**
 * Line height is a multiple of each role's own font size, so the same number gives Hebrew and
 * transliteration different spacing (46px x 1.15 = 53px, 38px x 1.15 = 44px). The editor shows
 * each role's spacing in pixels, read from the live preview, and can set transliteration or
 * translation to the line height that matches the Hebrew's spacing.
 *
 * Pure; the preview's computed styles are handed in.
 */

export type LineRole = "he" | "tr" | "en";
export type ComputedLine = { fontSize: string; lineHeight: string };

/** Pixels from one line to the next, or null when the style says nothing usable. */
export function linePitchPx(style: ComputedLine | null | undefined): number | null {
  if (!style) return null;
  const font = parseFloat(style.fontSize);
  if (!Number.isFinite(font) || font <= 0) return null;
  // `normal` is the font's own spacing; browsers use about 1.2.
  const line = style.lineHeight === "normal" ? font * 1.2 : parseFloat(style.lineHeight);
  return Number.isFinite(line) && line > 0 ? line : null;
}

/** The line height (a multiple of fontPx) closest to `targetPitch`, on the control's 0.05 steps. */
export function matchingLineHeight(targetPitch: number, fontPx: number, min = 0.9, max = 2, step = 0.05): number | null {
  if (!(targetPitch > 0) || !(fontPx > 0)) return null;
  const exact = targetPitch / fontPx;
  const stepped = Math.round(exact / step) * step;
  return Math.min(max, Math.max(min, Number(stepped.toFixed(2))));
}

/** The first rendered element of each role in the preview (side-panel rows, or lower-third and card channels). */
export const ROLE_SELECTORS: Record<LineRole, string> = {
  he: ".row-hebrew, .prayer.hebrew",
  tr: ".row-transliteration, .prayer.english",
  en: ".row-translation, .prayer.translation",
};
