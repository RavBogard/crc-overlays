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
