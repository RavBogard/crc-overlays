/**
 * Wording edits made inside the siddur picker (Daniel + Michael, 2026-09-23). The graphic uses the
 * edited words; the exact siddur words stay recorded beside each one, and the siddur itself is
 * never changed. A draft with at least one edit is saved as `local-variant` content over its
 * canonical selection; a draft with none stays plain canonical content, byte for byte.
 *
 * The server's rules (lib/authoring-model.ts parseContent) are mirrored here: an edit targets a
 * selected block, `sourceText` is the exact pinned text, `localText` is 1-4000 characters, and a
 * channel of a block is edited at most once. An edit equal to the siddur is not an edit.
 */
import type { CanonicalDraftContent, DraftForm, LocalVariantOverride, Source, SourceBlock, VariantChannel } from "./types";

/** The label every picker-made local wording carries unless the draft already has one. */
export const DEFAULT_WORDING_LABEL = "Local wording";
export const MAX_WORDING_EDITS = 96;

/**
 * An edit as the form holds it. `passageId` is the selected passage an English edit belongs to:
 * English is keyed by its translation block, which is never itself a selected passage.
 */
export type WordingEdit = LocalVariantOverride & { passageId?: string };
/** One editable line of a selected passage. */
export type WordingField = { sourceId: string; blockId: string; passageId: string; channel: VariantChannel; sourceText: string };

export function wordingKey(item: Pick<LocalVariantOverride, "sourceId" | "blockId" | "channel">) {
  return `${item.sourceId}\u0000${item.blockId}\u0000${item.channel}`;
}

/** The authorized English whose run starts at this passage, when the source carries one. */
export function translationFor(source: Pick<Source, "blocks">, blockId: string): SourceBlock | undefined {
  return source.blocks.find((block) => block.kind === "translation-en" && block.pairedBlockIds?.[0] === blockId && Boolean(block.en));
}

/** The lines this graphic shows for one passage, each with its exact siddur text. */
export function passageWordingFields(form: Pick<DraftForm, "mode" | "layers">, source: Pick<Source, "id" | "blocks">, block: SourceBlock): WordingField[] {
  const field = (channel: VariantChannel, target: SourceBlock): WordingField[] => {
    const sourceText = target[channel];
    return typeof sourceText === "string" && sourceText ? [{ sourceId: source.id, blockId: target.id, passageId: block.id, channel, sourceText }] : [];
  };
  if (form.mode === "bilingual") {
    const fields = [...(form.layers.includes("he") ? field("he", block) : []), ...(form.layers.includes("tr") ? field("tr", block) : [])];
    const translation = form.layers.includes("en") ? translationFor(source, block.id) : undefined;
    return translation ? [...fields, ...field("en", translation)] : fields;
  }
  if (form.mode === "source-en" || form.mode === "original-en") return field("en", block);
  return [];
}

export function findWordingEdit(edits: readonly WordingEdit[], field: Pick<WordingField, "sourceId" | "blockId" | "channel">) {
  const key = wordingKey(field);
  return edits.find((item) => wordingKey(item) === key);
}

/** Typing the siddur's exact words back removes the edit; anything else records it. */
export function setWordingEdit(edits: readonly WordingEdit[], field: WordingField, localText: string): WordingEdit[] {
  const key = wordingKey(field);
  const others = edits.filter((item) => wordingKey(item) !== key);
  if (localText === field.sourceText) return others;
  return [...others, { sourceId: field.sourceId, blockId: field.blockId, channel: field.channel, sourceText: field.sourceText, localText, ...(field.passageId !== field.blockId ? { passageId: field.passageId } : {}) }];
}

export function revertWordingEdit(edits: readonly WordingEdit[], field: Pick<WordingField, "sourceId" | "blockId" | "channel">): WordingEdit[] {
  const key = wordingKey(field);
  return edits.filter((item) => wordingKey(item) !== key);
}

/**
 * The edits the graphic actually carries: only for passages still selected and channels still
 * shown, never one equal to the siddur. The form keeps the rest, so unchecking and rechecking a
 * passage before saving brings its edit back.
 */
export function activeWordingEdits(form: Pick<DraftForm, "mode" | "layers" | "groups" | "variantOverrides">): LocalVariantOverride[] {
  if (form.mode !== "bilingual" && form.mode !== "source-en" && form.mode !== "original-en") return [];
  const selected = new Set(form.groups.flatMap((group) => group.blockIds.map((blockId) => `${group.sourceId}\u0000${blockId}`)));
  const isSelected = (sourceId: string, blockId: string) => selected.has(`${sourceId}\u0000${blockId}`);
  const seen = new Set<string>();
  return (form.variantOverrides as WordingEdit[]).flatMap((item) => {
    const key = wordingKey(item);
    if (seen.has(key) || item.localText.trim() === item.sourceText.trim()) return [];
    const kept = form.mode === "bilingual"
      ? item.channel === "en"
        ? form.layers.includes("en") && (!item.passageId || isSelected(item.sourceId, item.passageId))
        : form.layers.includes(item.channel) && isSelected(item.sourceId, item.blockId)
      : item.channel === "en" && isSelected(item.sourceId, item.blockId);
    if (!kept) return [];
    seen.add(key);
    return [{ sourceId: item.sourceId, blockId: item.blockId, channel: item.channel, sourceText: item.sourceText, localText: item.localText.trim() }];
  });
}

/** Canonical content stays canonical; with edits it becomes a labeled local wording over it. */
export function withWordingEdits(form: Pick<DraftForm, "mode" | "layers" | "groups" | "variantOverrides" | "variantLabel" | "variantReason">, base: CanonicalDraftContent) {
  const overrides = activeWordingEdits(form);
  if (!overrides.length) return base;
  return {
    mode: "local-variant" as const,
    label: form.variantLabel.trim() || DEFAULT_WORDING_LABEL,
    ...(form.variantReason.trim() ? { reason: form.variantReason.trim() } : {}),
    base,
    overrides,
  };
}

/** A blank edit cannot be saved (the server refuses empty local text); Revert restores the siddur. */
export function wordingEditsReady(form: Pick<DraftForm, "mode" | "layers" | "groups" | "variantOverrides">) {
  const edits = activeWordingEdits(form);
  return edits.length <= MAX_WORDING_EDITS && edits.every((item) => item.localText.length > 0);
}

/** English edits load with the passage that anchors them, found in the draft's source snapshots. */
export function loadWordingEdits(overrides: readonly LocalVariantOverride[], snapshots: readonly Pick<Source, "id" | "blocks">[] = []): WordingEdit[] {
  return overrides.map((item) => {
    if (item.channel !== "en") return { ...item };
    const block = snapshots.find((source) => source.id === item.sourceId)?.blocks.find((candidate) => candidate.id === item.blockId);
    const passageId = block?.kind === "translation-en" ? block.pairedBlockIds?.[0] : undefined;
    return passageId ? { ...item, passageId } : { ...item };
  });
}
