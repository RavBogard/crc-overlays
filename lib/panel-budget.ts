/**
 * One panel's worth of liturgy, as both the editor and the server measure it.
 *
 * The server splits a whole prayer into panels in `sourceSetPages` (lib/authoring.ts) and the
 * editor warns before a person selects more than one panel can hold. Those two answers must
 * agree, so the limits and the character rule live here — a pure, client-safe module with no
 * server imports — and both sides read them from this file.
 */

import { layoutDefinition, type LayoutId } from "./layout-registry";

/** Never more than three canonical blocks in one panel, however short they are. */
export const PANEL_BLOCK_LIMIT = 3;
/** Hebrew plus transliteration, or original English, on a side panel. */
export const PANEL_CHAR_BUDGET = 600;
/** Source English sets in larger type, so the conservative budget is smaller. */
export const PANEL_ENGLISH_CHAR_BUDGET = 400;

export type PanelMode = "bilingual" | "original-en" | "source-en";
export type PanelLayout = LayoutId;
/** Only the text channels matter here, so any source block shape is accepted. */
export type PanelBlock = { he?: string; tr?: string; en?: string };

/**
 * The characters a block contributes in one mode: both Hebrew channels, or the English one. An
 * English-only passage in a bilingual selection (no Hebrew, no transliteration) counts its English.
 */
export function blockCharacters(block: PanelBlock, mode: PanelMode) {
  if (mode === "bilingual" && block.he === undefined && block.tr === undefined) return block.en?.length ?? 0;
  return mode === "bilingual" ? (block.he?.length ?? 0) + (block.tr?.length ?? 0) : (block.en?.length ?? 0);
}

/** The character budget one panel has in this mode. */
export function panelCharacterBudget(mode: PanelMode) {
  return mode === "source-en" ? PANEL_ENGLISH_CHAR_BUDGET : PANEL_CHAR_BUDGET;
}

/**
 * True when this selection would need more than one panel, under the same rule the server uses
 * when it splits a prayer. A bottom row, like a corner card, carries exactly one block. A single canonical block is
 * never split, so one block always fits, however long it is.
 */
export function exceedsOnePanel(blocks: readonly PanelBlock[], mode: PanelMode, layout: PanelLayout): boolean {
  if (blocks.length <= 1) return false;
  if (layoutDefinition(layout)?.capabilities.oneBlockPerSlide) return true;
  if (blocks.length > PANEL_BLOCK_LIMIT) return true;
  return blocks.reduce((sum, block) => sum + blockCharacters(block, mode), 0) > panelCharacterBudget(mode);
}
