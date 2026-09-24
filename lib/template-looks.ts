/**
 * X2b - the editor names a template by the look it produces, never by the prayer whose
 * baseline cue happens to carry that look. An operator choosing a starting point should read
 * "Left panel · Hebrew + transliteration", not "Mah Tovu", because the name of a prayer in a
 * template tile reads as a claim about the content they are about to make.
 *
 * Client-safe and pure: it takes the `list_templates` summaries the editor already holds and
 * returns at most one tile per layout, keyed to the first importable baseline of that layout in
 * catalog order.
 */
import { layoutLabel, templateLayoutFor } from "./layout-label";
import { layoutDefinition, layoutIds, type LayoutId } from "./layout-registry";

export type TemplateLookLayout = LayoutId;
/** Every content mode the editor can be in; only the canonical three change the descriptor. */
export type TemplateLookMode = "bilingual" | "source-en" | "original-en" | "local-variant" | "custom";
/** The shape of a `list_templates` row this module needs. */
export type TemplateLookSummary = { id: string; layout: TemplateLookLayout; importable: boolean };
export type TemplateLook = { id: string; layout: TemplateLookLayout; label: string };


/**
 * R-A6 - the editor's named text sizes (app/author/look-drawer.tsx densityOptions), so an agent
 * asks for "large" instead of knowing 42/35/34. Comfortable is the template's own sizes, stored
 * as absent. tests/mcp-a1.test.ts holds the two lists equal.
 */
export const TEXT_SIZE_PRESETS = {
  comfortable: { label: "Comfortable", sizes: {} },
  large: { label: "Large print", sizes: { hebrewFontSize: 42, transliterationFontSize: 35, titleFontSize: 34 } },
  compact: { label: "Compact", sizes: { hebrewFontSize: 34, transliterationFontSize: 28, titleFontSize: 28 } },
} as const;
export type TextSizePreset = keyof typeof TEXT_SIZE_PRESETS;
export const TEXT_SIZE_IDS = Object.keys(TEXT_SIZE_PRESETS) as TextSizePreset[];
type TextSizes = { hebrewFontSize?: number; transliterationFontSize?: number; titleFontSize?: number };
/** The presentation with a preset's three sizes in place of whatever sizes it had; nothing else moves. */
export function withTextSize<T extends TextSizes>(presentation: T, preset: TextSizePreset): T {
  const { hebrewFontSize, transliterationFontSize, titleFontSize, ...rest } = presentation;
  void hebrewFontSize; void transliterationFontSize; void titleFontSize;
  return { ...rest, ...TEXT_SIZE_PRESETS[preset].sizes } as T;
}

/** What this look puts on screen, in the operator's words. Never a cue name. */
export function lookDescriptor(mode: TemplateLookMode, layout: TemplateLookLayout): string {
  if (mode === "custom") return layoutDefinition(layout)?.capabilities.oneBlockPerSlide ? "one line" : "custom text";
  if (mode === "source-en" || mode === "original-en") return "English reading";
  return "Hebrew + transliteration";
}

/**
 * At most four tiles, one per layout. A template contributes only its layout, motion and
 * duration, so a baseline that cannot be imported as content (a custom graphic such as the
 * right panel's "Thank you") is still a valid template; importable baselines are preferred.
 */
export function templateLooks(templates: readonly TemplateLookSummary[], mode: TemplateLookMode): TemplateLook[] {
  const looks: TemplateLook[] = [];
  // Catalog order for the tiles themselves (lib/layout-registry.ts): the lower third first, then the two panels, then the corner card.
  for (const layout of layoutIds()) {
    // A corner card has no baseline of its own; it takes a lower third's (templateLayoutFor).
    const from = templateLayoutFor(layout);
    const baseline = templates.find((item) => item.layout === from && item.importable) ?? templates.find((item) => item.layout === from);
    if (!baseline) continue;
    looks.push({ id: baseline.id, layout, label: `${layoutLabel(layout)} · ${lookDescriptor(mode, layout)}` });
  }
  return looks;
}
