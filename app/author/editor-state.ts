import { exceedsOnePanel, type PanelBlock, type PanelLayout } from "@/lib/panel-budget";
import type { ContentMode, Draft, DraftForm, Source, SourceDisplay, SourceGroup, TextArrangement, TextLayer } from "./types";
import { loadWordingEdits, wordingEditsReady, withWordingEdits } from "./wording-edits";

export const LAYER_ORDER: readonly TextLayer[] = ["he", "tr", "en"];
export const LAYER_NAMES: Record<TextLayer, string> = { he: "Hebrew", tr: "Transliteration", en: "Translation" };

/**
 * C6. The stored draft says which layers it shows only when that differs from what the older
 * translation flag already implied, so a graphic authored before this change reads back exactly
 * as it was written: Hebrew and transliteration, together, plus translation when it had it.
 */
export function layersOf(content: Draft["content"]): { layers: TextLayer[]; arrangement: TextArrangement; rowOrder?: TextLayer[]; preserveGroups?: boolean } {
  const base = content.mode === "local-variant" ? content.base : content;
  if (base.mode !== "bilingual") return { layers: ["he", "tr"], arrangement: "together" };
  const layers = base.layers?.length
    ? LAYER_ORDER.filter((layer) => base.layers!.includes(layer))
    : base.includeTranslation
      ? (["he", "tr", "en"] as TextLayer[])
      : (["he", "tr"] as TextLayer[]);
  return {
    layers,
    arrangement: base.arrangement === "blocks" ? "blocks" : "together",
    ...(isRowOrder(base.rowOrder) && !sameOrder(base.rowOrder, LAYER_ORDER) ? { rowOrder: [...base.rowOrder] } : {}),
    ...(base.preserveGroups ? { preserveGroups: true } : {}),
  };
}

function sameOrder(a: readonly TextLayer[], b: readonly TextLayer[]) {
  return a.length === b.length && a.every((layer, index) => layer === b[index]);
}

function isRowOrder(order: TextLayer[] | undefined): order is TextLayer[] {
  return order?.length === 3 && new Set(order).size === 3;
}

/** The six ways the three layers can stack on a side panel, default first. */
export const ROW_ORDERS: readonly (readonly TextLayer[])[] = [
  ["he", "tr", "en"], ["he", "en", "tr"], ["tr", "he", "en"], ["tr", "en", "he"], ["en", "he", "tr"], ["en", "tr", "he"],
];

/** The order the form stacks its layers in: the stored one, or the default. */
export function formRowOrder(form: Pick<DraftForm, "rowOrder">): TextLayer[] {
  return isRowOrder(form.rowOrder) ? [...form.rowOrder] : [...LAYER_ORDER];
}

function layerFormFields(draft: Draft) {
  return layersOf(draft.content);
}

/** Mirrors layerFields() in lib/authoring-model.ts: write nothing the default already says. */
export function layerContentFields(form: DraftForm) {
  const layers = LAYER_ORDER.filter((layer) => form.layers.includes(layer));
  const translation = layers.includes("en");
  const implicit = translation ? ["he", "tr", "en"] : ["he", "tr"];
  return {
    ...(translation ? { includeTranslation: true as const } : {}),
    ...(JSON.stringify(layers) === JSON.stringify(implicit) ? {} : { layers }),
    ...(form.arrangement === "blocks" ? { arrangement: "blocks" as const } : {}),
    ...(sameOrder(formRowOrder(form), LAYER_ORDER) ? {} : { rowOrder: formRowOrder(form) }),
  };
}

export const emptyForm: DraftForm = {
  name: "",
  title: "",
  accentTitle: "",
  layout: "left",
  templateCueId: "",
  mode: "bilingual",
  layers: ["he", "tr"],
  // Creation-only default. formFromDraft continues to read omitted historical arrangements as
  // together, so existing drafts neither change shape nor gain a new stored field on save.
  arrangement: "blocks",
  groups: [],
  customText: "",
  variantLabel: "",
  variantReason: "",
  variantOverrides: [],
  presentation: {},
};

/**
 * I5 - a person never sees a slug or a feed name. `search_sources` and `get_source` already
 * return the printed `display` block (lib/source-library.ts `sourceDisplay`); this only covers
 * the one client-side case the server cannot answer: a source snapshot stored inside an older
 * draft, which carries the same printed metadata but no `display`. The slug shape is dropped
 * rather than shown.
 */
const UNTITLED_BOOK = "Unlabeled book";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

export function sourceDisplayCopy(
  source: Partial<Pick<Source, "display" | "book" | "section" | "metadata">> | null | undefined,
): SourceDisplay {
  if (source?.display) return source.display;
  const metadata = source?.metadata || {};
  const title = typeof metadata.bookTitle === "string" ? metadata.bookTitle.trim() : "";
  const book = typeof source?.book === "string" ? source.book.trim() : "";
  const bookTitle = title || (book && !SLUG.test(book) ? book : "") || UNTITLED_BOOK;
  const pages = [...new Set((metadata.folios || [])
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
  const contiguous = pages.length > 1 && pages.every((value, index) => index === 0 || value === pages[index - 1] + 1);
  const folio = !pages.length ? null
    : pages.length === 1 ? `p. ${pages[0]}`
    : contiguous ? `pp. ${pages[0]}–${pages[pages.length - 1]}`
    : `pp. ${pages.join(", ")}`;
  const section = typeof metadata.sectionTitle === "string" ? metadata.sectionTitle.trim()
    : typeof source?.section === "string" ? source.section.trim() : "";
  const edition = typeof metadata.familyLabel === "string" ? metadata.familyLabel.trim() : "";
  return { bookTitle, folio, sectionTitle: section || null, edition: edition || null };
}

/** The one-line printed provenance shown beside a source: "Mishkan T’filah · p. 70". */
export function sourceHeadline(display: SourceDisplay): string {
  return [display.bookTitle, display.folio].filter(Boolean).join(" · ");
}

export type LibraryTabName = "published" | "drafts" | "archived" | "shared";

/**
 * X4 (5) - an empty tab and a search with no hits are different things, and only the second
 * one is about the search.
 */
export function libraryEmptyMessage(tab: LibraryTabName, hasQuery: boolean): string {
  if (hasQuery)
    return tab === "published" ? "No matching published graphics"
      : tab === "drafts" ? "No matching drafts"
      : tab === "archived" ? "No matching archived graphics"
      : "No matching shared graphics";
  return tab === "published" ? "No published graphics yet"
    : tab === "drafts" ? "No drafts yet"
    : tab === "archived" ? "No archived graphics"
    : "Nothing shared yet";
}

export function routeForDraft(draftId: string | null | undefined): string {
  return draftId ? `/author?draft=${encodeURIComponent(draftId)}` : "/author";
}

/**
 * A local-variant draft opens in the siddur picker on its canonical selection, with its wording
 * edits loaded beside the passages they change (app/author/wording-edits.ts). Saving it again
 * writes the same local-variant shape; reverting every edit returns it to canonical content.
 */
export function formFromDraft(draft: Draft): DraftForm {
  const variant = draft.content.mode === "local-variant" ? draft.content : null;
  const content = variant ? variant.base : draft.content;
  const groups =
    content.mode === "bilingual"
      ? content.hebrewGroups
      : content.mode === "original-en" || content.mode === "source-en"
        ? content.englishGroups
        : [];
  return {
    name: draft.name,
    title: draft.title,
    accentTitle: draft.accentTitle || "",
    layout: draft.layout,
    templateCueId: draft.templateCueId,
    mode: content.mode,
    includeTranslation:
      content.mode === "bilingual" && content.includeTranslation,
    ...layerFormFields(draft),
    groups: structuredClone(groups),
    customText: content.mode === "custom" ? content.text : "",
    variantLabel: variant ? variant.label : "",
    variantReason: variant ? variant.reason || "" : "",
    variantOverrides: variant ? loadWordingEdits(variant.overrides, draft.sourceSnapshots) : [],
    presentation: { ...draft.presentation },
  };
}

export function editableFromForm(form: DraftForm) {
  const groups = form.groups.filter((group) => group.blockIds.length);
  const content =
    form.mode === "bilingual"
      ? withWordingEdits(form, {
          mode: "bilingual" as const,
          hebrewGroups: groups,
          transliterationGroups: structuredClone(groups),
          ...layerContentFields(form),
          ...(form.preserveGroups ? { preserveGroups: true as const } : {}),
        })
      : form.mode === "original-en" || form.mode === "source-en"
        ? withWordingEdits(form, { mode: form.mode, englishGroups: groups })
        : form.mode === "local-variant" && form.variantBase
          ? {
              mode: "local-variant" as const,
              label: form.variantLabel.trim(),
              ...(form.variantReason.trim() ? { reason: form.variantReason.trim() } : {}),
              base: structuredClone(form.variantBase),
              overrides: form.variantOverrides.map(({ sourceId, blockId, channel, sourceText, localText }) => ({ sourceId, blockId, channel, sourceText, localText })),
            }
        : { mode: "custom" as const, text: form.customText.trim() };
  return {
    name: form.name.trim(),
    title: form.title.trim(),
    accentTitle: form.accentTitle.trim() || undefined,
    layout: form.layout,
    templateCueId: form.templateCueId,
    content,
    presentation: form.presentation,
  };
}

export function formReady(form: DraftForm) {
  const hasContent =
    form.mode === "custom"
      ? Boolean(form.customText.trim())
      : form.mode === "local-variant"
        ? Boolean(form.variantBase && form.variantLabel.trim() && form.variantOverrides.length && form.variantOverrides.every((item) => item.localText.trim()))
      : form.groups.some((group) => group.blockIds.length) && wordingEditsReady(form);
  return Boolean(
    form.name.trim() &&
      form.title.trim() &&
      form.templateCueId &&
      hasContent,
  );
}

export function selectWholeSource(
  sourceId: string,
  blockIds: string[],
): SourceGroup[] {
  return blockIds.length ? [{ sourceId, blockIds: [...blockIds] }] : [];
}

export function moveDraftId(ids: string[], id: string, direction: -1 | 1) {
  const index = ids.indexOf(id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ids.length) return [...ids];
  const ordered = [...ids];
  [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
  return ordered;
}

export function blocksForMode(source: Source | null, mode: ContentMode) {
  if (!source || mode === "custom" || mode === "local-variant") return [];
  return source.blocks.filter((block) => mode === "source-en"
    ? block.kind === "source-en" || (block.kind === "bilingual" && Boolean(block.en))
    : mode === "bilingual"
      ? block.kind === "bilingual" || block.kind === "source-en" || block.kind === "original-en"
      : block.kind === mode);
}

/**
 * X2 - panels are an advanced idea, so the editor only names them once this draft actually has
 * more than one, or once the current selection could not fit in a single panel. The second half
 * is the server's own splitting rule (lib/panel-budget.ts), so the editor and the server never
 * disagree about what "one panel" holds.
 */
export function shouldShowPanels(groups: readonly unknown[], blocks: readonly PanelBlock[], mode: ContentMode, layout: PanelLayout): boolean {
  if (groups.length > 1) return true;
  if (mode === "custom" || mode === "local-variant") return false;
  return exceedsOnePanel(blocks, mode, layout);
}

function selectedBlock(draft: Draft, group: SourceGroup | undefined) {
  if (!group) return undefined;
  return draft.sourceSnapshots?.find((source) => source.id === group.sourceId)?.blocks.find((block) => block.id === group.blockIds[0]);
}

export function draftThumbnailCopy(draft: Draft) {
  if (draft.content.mode === "custom") return { title: draft.title, accent: draft.accentTitle, body: draft.content.text };
  const content = draft.content.mode === "local-variant" ? draft.content.base : draft.content;
  if (content.mode === "bilingual") {
    const block = selectedBlock(draft, content.hebrewGroups[0]);
    const override = draft.content.mode === "local-variant" ? draft.content.overrides.find((item) => item.sourceId === content.hebrewGroups[0]?.sourceId && item.blockId === content.hebrewGroups[0]?.blockIds[0] && (item.channel === "he" || item.channel === "tr")) : undefined;
    if (override) return { title: draft.title, accent: draft.accentTitle, body: override.localText };
    return { title: draft.title, accent: draft.accentTitle, body: block?.he || block?.tr || "" };
  }
  const block = selectedBlock(draft, content.englishGroups[0]);
  const override = draft.content.mode === "local-variant" ? draft.content.overrides.find((item) => item.sourceId === content.englishGroups[0]?.sourceId && item.blockId === content.englishGroups[0]?.blockIds[0] && item.channel === "en") : undefined;
  return { title: draft.title, accent: draft.accentTitle, body: override?.localText || block?.en || "" };
}

export function draftReadableText(draft: Draft) {
  if (draft.content.mode === "custom") return draft.content.text;
  const content = draft.content.mode === "local-variant" ? draft.content.base : draft.content;
  const overrideFor = (sourceId: string, blockId: string, channel: "he" | "tr" | "en", fallback?: string) =>
    draft.content.mode === "local-variant"
      ? draft.content.overrides.find((item) => item.sourceId === sourceId && item.blockId === blockId && item.channel === channel)?.localText || fallback || ""
      : fallback || "";
  const groups = content.mode === "bilingual" ? content.hebrewGroups : content.englishGroups;
  return groups.flatMap((group) => {
    const source = draft.sourceSnapshots?.find((item) => item.id === group.sourceId);
    return group.blockIds.flatMap((blockId) => {
      const block = source?.blocks.find((item) => item.id === blockId);
      if (!block) return [];
      if (content.mode === "bilingual") return [overrideFor(group.sourceId, blockId, "he", block.he), overrideFor(group.sourceId, blockId, "tr", block.tr)].filter(Boolean);
      return [overrideFor(group.sourceId, blockId, "en", block.en)];
    });
  }).filter(Boolean).join("\n");
}

export type DraftSetAudit = {
  complete: boolean;
  duplicateCount: number;
  missingCount: number;
  unexpectedCount: number;
  sourceOrder: boolean;
  selectedCount: number;
  expectedCount: number;
};

export function auditDraftSet(drafts: Draft[]): DraftSetAudit | null {
  if (!drafts.length || !drafts.every((draft) => draft.draftSetId === drafts[0].draftSetId)) return null;
  const firstContent = drafts[0].content.mode === "local-variant" ? drafts[0].content.base : drafts[0].content;
  if (firstContent.mode === "custom") return null;
  const firstGroup = firstContent.mode === "bilingual" ? firstContent.hebrewGroups[0] : firstContent.englishGroups[0];
  const source = drafts[0].sourceSnapshots?.find((item) => item.id === firstGroup?.sourceId);
  if (!source) return null;
  const expected = source.blocks.filter((block) => firstContent.mode === "bilingual"
    ? block.kind === "bilingual"
    : firstContent.mode === "source-en"
      ? (block.kind === "source-en" || (block.kind === "bilingual" && Boolean(block.en))) && block.automatic !== false
      : block.kind === "original-en").map((block) => block.id);
  const actual = drafts.flatMap((draft) => {
    const content = draft.content.mode === "local-variant" ? draft.content.base : draft.content;
    if (content.mode !== firstContent.mode) return [];
    const groups = content.mode === "bilingual" ? content.hebrewGroups : content.englishGroups;
    return groups.filter((group) => group.sourceId === source.id).flatMap((group) => group.blockIds);
  });
  const counts = new Map<string, number>();
  actual.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  const expectedSet = new Set(expected);
  const duplicateCount = [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
  const missingCount = expected.filter((id) => !counts.has(id)).length;
  const unexpectedCount = actual.filter((id) => !expectedSet.has(id)).length;
  const presentExpected = expected.filter((id) => counts.has(id));
  const sourceOrder = actual.filter((id) => expectedSet.has(id)).every((id, index) => id === presentExpected[index]);
  return { complete: !duplicateCount && !missingCount && !unexpectedCount && sourceOrder && actual.length === expected.length, duplicateCount, missingCount, unexpectedCount, sourceOrder, selectedCount: actual.length, expectedCount: expected.length };
}

export function draftHasUnpublishedWork(draft: Draft) {
  return draft.activeDraftVersion === null || draft.activeDraftVersion !== draft.version;
}

export function recoveryKey(draftId: string | null) {
  return `crc-author-recovery:${draftId || "new"}`;
}

export type RecoveryCopy = {
  form: DraftForm;
  savedAt: number;
  serverVersion: number | null;
};

export function parseRecovery(value: string | null): RecoveryCopy | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RecoveryCopy>;
    if (
      !parsed.form ||
      typeof parsed.savedAt !== "number" ||
      !(typeof parsed.serverVersion === "number" || parsed.serverVersion === null)
    )
      return null;
    return parsed as RecoveryCopy;
  } catch {
    return null;
  }
}
