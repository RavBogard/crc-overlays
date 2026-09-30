import { AuthoringError, type SourceBlock, type SourceGroup } from "./authoring-model";

export type ExplicitSplitPage = { groups: SourceGroup[]; blocks: SourceBlock[] };

/** Validate an explicit page plan against the draft's selected order and translation runs. */
export function explicitSplitPages(value: unknown, segments: readonly (readonly SourceBlock[])[], sourceId: string): ExplicitSplitPage[] {
  const invalid = (message: string): never => { throw new AuthoringError("invalid_split_pages", message, 409); };
  if (!Array.isArray(value)) return invalid("Choose at least two and no more than 96 slides.");
  if (value.length < 2 || value.length > 96) return invalid("Choose at least two and no more than 96 slides.");
  const pages: ExplicitSplitPage[] = value.map((rawPage, pageIndex) => {
    if (!Array.isArray(rawPage)) return invalid(`Slide ${pageIndex + 1} needs one or more passage groups.`);
    if (!rawPage.length || rawPage.length > 96) return invalid(`Slide ${pageIndex + 1} needs one or more passage groups.`);
    const groups: SourceGroup[] = rawPage.map((rawGroup, groupIndex) => {
      if (!rawGroup || typeof rawGroup !== "object" || Array.isArray(rawGroup)) return invalid(`Group ${groupIndex + 1} on slide ${pageIndex + 1} is invalid.`);
      const group = rawGroup as Record<string, unknown>;
      if (Object.keys(group).some((key) => key !== "sourceId" && key !== "blockIds") || group.sourceId !== sourceId || !Array.isArray(group.blockIds) || !group.blockIds.length || group.blockIds.some((id) => typeof id !== "string" || !id)) return invalid(`Group ${groupIndex + 1} on slide ${pageIndex + 1} must contain selected passages from this source.`);
      return { sourceId, blockIds: [...group.blockIds] as string[] };
    });
    return { groups, blocks: [] };
  });
  const selected = segments.flat().map((block) => block.id);
  const planned = pages.flatMap((page) => page.groups.flatMap((group) => group.blockIds));
  if (planned.length !== selected.length || planned.some((id, index) => id !== selected[index])) invalid("Slide groups must contain every selected passage exactly once, in source order.");
  const byId = new Map(segments.flat().map((block) => [block.id, block]));
  for (const page of pages) for (const group of page.groups) page.blocks.push(...group.blockIds.map((id) => byId.get(id)!));
  const groupOf = new Map<string, string>();
  pages.forEach((page, pageIndex) => page.groups.forEach((group, groupIndex) => group.blockIds.forEach((id) => groupOf.set(id, `${pageIndex}:${groupIndex}`))));
  if (segments.some((segment) => segment.some((block) => groupOf.get(block.id) !== groupOf.get(segment[0].id)))) invalid("Keep each paired Hebrew and English blessing together in one group on one slide.");
  return pages;
}
