/**
 * Checking a passage in the siddur picker. Two rules the server enforces are applied here, so a
 * click never produces a selection the preview then refuses:
 *
 * - With the English layer on, an authorized translation covers a whole run of passages (a
 *   blessing is "Baruch atah..." plus its closing line). Checking or unchecking one passage of that
 *   run checks or unchecks the whole run; half a blessing has no English to show.
 * - A passage belongs to one slide of a graphic. Checking a passage that another slide already
 *   holds moves it to the slide being edited instead of selecting it twice.
 */
export type PickerGroup = { sourceId: string; blockIds: string[] };
export type PickerBlock = { id: string; kind?: string; pairedBlockIds?: string[] };

export type PassageToggle = {
  groups: PickerGroup[];
  /** Passages the click checked or unchecked, the clicked one included. */
  changed: string[];
  /** Other slides (0-based, before removal) that gave up a passage to the active slide. */
  movedFrom: number[];
  /** The active slide's index afterwards: a slide emptied by a move is removed. */
  activeGroup: number;
};

/** The passages one click acts on: the clicked passage, widened to its translation run. */
export function passageRun(blocks: readonly PickerBlock[], blockId: string, withTranslation: boolean): string[] {
  if (!withTranslation) return [blockId];
  const pair = blocks.find((block) => block.kind === "translation-en" && block.pairedBlockIds?.includes(blockId));
  return pair?.pairedBlockIds?.length ? [...pair.pairedBlockIds] : [blockId];
}

export function togglePassage(input: {
  groups: readonly PickerGroup[];
  activeGroup: number;
  sourceId: string;
  blocks: readonly PickerBlock[];
  blockId: string;
  checked: boolean;
  withTranslation: boolean;
}): PassageToggle {
  const groups = input.groups.map((group) => ({ ...group, blockIds: [...group.blockIds] }));
  const index = Math.min(input.activeGroup, Math.max(0, groups.length - 1));
  const active = groups[index] || { sourceId: input.sourceId, blockIds: [] };
  const run = passageRun(input.blocks, input.blockId, input.withTranslation);
  const order = new Map(input.blocks.map((block, position) => [block.id, position]));
  const movedFrom: number[] = [];
  if (input.checked) {
    groups.forEach((group, position) => {
      if (position === index || group.sourceId !== input.sourceId) return;
      const kept = group.blockIds.filter((id) => !run.includes(id));
      if (kept.length !== group.blockIds.length) { group.blockIds = kept; movedFrom.push(position); }
    });
    active.blockIds = [...new Set([...active.blockIds, ...run])];
  } else {
    active.blockIds = active.blockIds.filter((id) => !run.includes(id));
  }
  active.blockIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  groups[index] = active;
  const kept = groups.filter((group, position) => position === index || group.blockIds.length > 0);
  return { groups: kept, changed: run, movedFrom, activeGroup: kept.indexOf(active) };
}

/** The other slide (0-based) that holds this passage, if any, for the picker's "On slide N" tag. */
export function slideHolding(groups: readonly PickerGroup[], activeGroup: number, sourceId: string, blockId: string): number {
  return groups.findIndex((group, position) => position !== activeGroup && group.sourceId === sourceId && group.blockIds.includes(blockId));
}
