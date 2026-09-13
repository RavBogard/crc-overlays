import type { Draft, DraftForm, SourceGroup } from "./types";

export const emptyForm: DraftForm = {
  name: "",
  title: "",
  accentTitle: "",
  layout: "left",
  templateCueId: "",
  mode: "bilingual",
  groups: [],
  customText: "",
  presentation: {},
};

export function formFromDraft(draft: Draft): DraftForm {
  const groups =
    draft.content.mode === "bilingual"
      ? draft.content.hebrewGroups
      : draft.content.mode === "original-en"
        ? draft.content.englishGroups
        : [];
  return {
    name: draft.name,
    title: draft.title,
    accentTitle: draft.accentTitle || "",
    layout: draft.layout,
    templateCueId: draft.templateCueId,
    mode: draft.content.mode,
    includeTranslation:
      draft.content.mode === "bilingual" && draft.content.includeTranslation,
    groups: structuredClone(groups),
    customText: draft.content.mode === "custom" ? draft.content.text : "",
    presentation: { ...draft.presentation },
  };
}

export function editableFromForm(form: DraftForm) {
  const groups = form.groups.filter((group) => group.blockIds.length);
  const content =
    form.mode === "bilingual"
      ? {
          mode: "bilingual" as const,
          hebrewGroups: groups,
          transliterationGroups: structuredClone(groups),
          ...(form.includeTranslation ? { includeTranslation: true } : {}),
        }
      : form.mode === "original-en"
        ? { mode: "original-en" as const, englishGroups: groups }
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
      : form.groups.some((group) => group.blockIds.length);
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
