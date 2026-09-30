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
export const itemId = (item: LibraryItem) => item.kind === "draft" ? item.draft.id : item.cue.id;
export type LibrarySort = "az" | "newest" | "oldest";
export type FolderFilter = "all" | "unfiled" | string;
const nameOrder = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Built-in catalog entries have no creation time; they always follow dated drafts. */
export function organizedLibraryItems(items: LibraryItem[], drafts: Draft[], assignments: Record<string, string>, folder: FolderFilter, query: string, sort: LibrarySort): LibraryItem[] {
  const draftDates = new Map(drafts.map((draft) => [draft.id, draft.createdAt]));
  const createdAt = (item: LibraryItem) => item.kind === "draft" ? item.draft.createdAt : item.cue.draftId ? draftDates.get(item.cue.draftId) : undefined;
  const search = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const assigned = assignments[itemId(item)];
    return (!search || itemName(item).toLocaleLowerCase().includes(search)) && (folder === "all" || (folder === "unfiled" ? !assigned : assigned === folder));
  }).sort((a, b) => {
    if (sort !== "az") {
      const left = createdAt(a), right = createdAt(b);
      if (left !== undefined && right === undefined) return -1;
      if (left === undefined && right !== undefined) return 1;
      if (left !== undefined && right !== undefined && left !== right) return sort === "newest" ? right - left : left - right;
    }
    const byName = nameOrder.compare(itemName(a), itemName(b));
    if (byName) return byName;
    return itemId(a) < itemId(b) ? -1 : itemId(a) > itemId(b) ? 1 : 0;
  });
}
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
