import type { CatalogCue, Draft, VariantChannel } from "./types";
import type { SourceReviewSummary } from "./source-review";

/* W2B §5.6 - the names the page and its panels both use. They were declared above AuthorPage and
   are moved here rather than into `panels.tsx` so neither file has to import a type from the other. */
export type LibraryTab = "published" | "drafts" | "archived" | "shared" | "sources";
export type EditorKind = "siddur" | "custom" | "edit";
export type LibraryItem = { kind: "catalog"; cue: CatalogCue } | { kind: "draft"; draft: Draft };
export type DraftSetReview = { status: "complete" | "needs-review" | "unknown"; message: string; issues: Array<{ kind: "missing" | "duplicated" | "unknown" | "out-of-order"; selections: unknown[] }> };
export type VariantCandidate = { sourceId: string; blockId: string; channel: VariantChannel; sourceText: string; sourceName: string; blockNumber: number };

export const formatTime = (value?: number) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
export const itemName = (item: LibraryItem) => item.kind === "draft" ? item.draft.name : item.cue.name;
export const sourceReviewName = (record: SourceReviewSummary) => `${record.sourceName} ${record.affected.draftName}`;
export const variantKey = (item: Pick<VariantCandidate, "sourceId" | "blockId" | "channel">) => `${item.sourceId}\u0000${item.blockId}\u0000${item.channel}`;

export function variantCandidates(draft: Draft): VariantCandidate[] {
  if (draft.content.mode === "custom" || draft.content.mode === "local-variant") return [];
  const snapshots = draft.sourceSnapshots || [];
  const groups = draft.content.mode === "bilingual" ? draft.content.hebrewGroups : draft.content.englishGroups;
  const selected = new Map(groups.flatMap((group) => group.blockIds.map((blockId) => [`${group.sourceId}\u0000${blockId}`, { sourceId: group.sourceId, blockId }] as const)));
  const result: VariantCandidate[] = [];
  for (const { sourceId, blockId } of selected.values()) {
    const source = snapshots.find((item) => item.id === sourceId);
    const block = source?.blocks.find((item) => item.id === blockId);
    if (!source || !block) continue;
    const channels: VariantChannel[] = draft.content.mode === "bilingual" ? ["he", "tr"] : ["en"];
    for (const channel of channels) if (block[channel]) result.push({ sourceId, blockId, channel, sourceText: block[channel]!, sourceName: source.name, blockNumber: block.index + 1 });
  }
  if (draft.content.mode === "bilingual" && draft.content.includeTranslation) {
    for (const source of snapshots) for (const block of source.blocks) {
      if (block.kind !== "translation-en" || !block.en || !block.pairedBlockIds?.every((id) => selected.has(`${source.id}\u0000${id}`))) continue;
      result.push({ sourceId: source.id, blockId: block.id, channel: "en", sourceText: block.en, sourceName: source.name, blockNumber: block.index + 1 });
    }
  }
  return result;
}
