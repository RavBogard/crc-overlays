// T1 — re-pagination report. Pure logic only: no DOM, no fetch, no writes.
//
// Bilingual Left/Right panels published before the pairing change carry flat
// `texts.textMainheb` / `texts.textMainEng` instead of paired `contentRows`.
// Re-building such a graphic from its own source now emits `contentRows`, so the
// question this module answers is: would that paired candidate still fit?
// Nothing here (and nothing that calls it) may publish or send to output.

import type { Cue } from "@/lib/player";
import type { Draft } from "../types";

/** Exactly the fields `preview_content` accepts (see `editableOnly` below). */
export type T1Editable = Pick<Draft, "name" | "title" | "layout" | "templateCueId" | "content" | "presentation"> & {
  accentTitle?: string;
};

/** How the paired candidate for one catalog graphic can be rebuilt, read-only. */
export type T1Candidate =
  | { kind: "baseline"; cueId: string }
  | { kind: "draft"; draftId: string };

export type T1Verdict =
  | "unchanged"
  | "needs re-pagination"
  | "cannot rebuild automatically";

export type T1RowVerdict = T1Verdict | "not applicable";

export type T1Row = { id: string; name: string; verdict: T1RowVerdict; code?: string };

export type T1Summary = {
  checked: number;
  needsRepagination: { id: string; name: string }[];
  cannotRebuild: { id: string; name: string; code: string }[];
};

/** The shape `candidateFor` needs — a published catalog cue, draft-backed or not. */
export type T1CandidateCue = Pick<Cue, "id" | "layout" | "texts" | "contentRows"> & {
  authoring?: { draftId?: string | null };
};

const filled = (value: string | undefined) => typeof value === "string" && value.trim().length > 0;

/**
 * A graphic is in scope when it is a Left/Right panel that carries both Hebrew and
 * transliteration as flat texts and has no paired rows yet. Draft-backed cues are
 * rebuilt through their draft; baseline cues through the baseline mapping.
 */
export function candidateFor(cue: T1CandidateCue): T1Candidate | null {
  if (cue.layout !== "left" && cue.layout !== "right") return null;
  if (cue.contentRows?.length) return null;
  const texts = cue.texts || {};
  if (!filled(texts.textMainheb) || !filled(texts.textMainEng)) return null;
  const draftId = cue.authoring?.draftId;
  return draftId ? { kind: "draft", draftId } : { kind: "baseline", cueId: cue.id };
}

/**
 * `pairedFits` is `{error}` when the read-only rebuild itself failed. A paired
 * candidate that does not fit is reported as needing re-pagination whether or not
 * the graphic on air fits today — the current failure is already counted separately
 * in "need attention".
 */
export function verdict(currentFits: boolean, pairedFits: boolean | { error: string }): T1Verdict {
  if (typeof pairedFits === "object") return "cannot rebuild automatically";
  if (pairedFits) return "unchanged";
  return "needs re-pagination";
}

/**
 * The exact editable fields `preview_content` accepts (lib/authoring-model.ts,
 * `parseEditable`): name, title, accentTitle, layout, templateCueId, content,
 * presentation. Everything else a stored draft carries is server-owned and is
 * stripped here: id, version, sourcePin, sourceSnapshots, activeRevision,
 * activeDraftVersion, createdAt, updatedAt, createdBy, updatedBy, draftSetId,
 * setIndex, setCount, draftSetManifest, sharedFrom, archivedAt, archivedBy.
 */
export function editableOnly(draft: Draft): T1Editable {
  const editable: T1Editable = {
    name: draft.name,
    title: draft.title,
    layout: draft.layout,
    templateCueId: draft.templateCueId,
    content: structuredClone(draft.content),
    presentation: structuredClone(draft.presentation ?? {}),
  };
  if (draft.accentTitle !== undefined) editable.accentTitle = draft.accentTitle;
  return editable;
}

export function summarizeT1(rows: T1Row[]): T1Summary {
  const considered = rows.filter((row) => row.verdict !== "not applicable");
  return {
    checked: considered.length,
    needsRepagination: considered
      .filter((row) => row.verdict === "needs re-pagination")
      .map((row) => ({ id: row.id, name: row.name })),
    cannotRebuild: considered
      .filter((row) => row.verdict === "cannot rebuild automatically")
      .map((row) => ({ id: row.id, name: row.name, code: row.code || "unknown_error" })),
  };
}

export function t1SummaryLine(summary: T1Summary): string {
  return `T1: ${summary.needsRepagination.length} of ${summary.checked} bilingual panels would need re-pagination`;
}
