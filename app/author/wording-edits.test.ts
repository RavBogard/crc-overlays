import assert from "node:assert/strict";
import test from "node:test";
import { editableFromForm, emptyForm, formFromDraft } from "./editor-state.ts";
import { blocksForMode } from "./editor-state.ts";
import { resolveSourceBoundaries, sourcePack } from "@/lib/authoring-model";
import { activeWordingEdits, passageWordingFields, setWordingEdit, translationFor } from "./wording-edits.ts";
import type { Draft, Source } from "./types.ts";

const source: Source = {
  id: "birchot", name: "Birchot HaShachar", section: null,
  blocks: [
    { id: "opening", index: 0, kind: "bilingual", he: "ברוך", tr: "Baruch" },
    { id: "closing", index: 1, kind: "bilingual", he: "אמן", tr: "Amen" },
    { id: "translation", index: 2, kind: "translation-en", en: "Blessed are You. Amen.", pairedBlockIds: ["opening", "closing"] },
  ],
};
const group = { sourceId: source.id, blockIds: ["opening", "closing"] };
const form = { ...emptyForm, mode: "bilingual" as const, layers: ["he", "tr", "en"] as Array<"he" | "tr" | "en">, groups: [group], name: "Birchot", title: "Birchot", templateCueId: "template" };

test("a translation spanning two Hebrew blocks has exactly one wording field at the end", () => {
  assert.equal(translationFor(source, "closing")?.id, "translation");
  const first = passageWordingFields(form, source, source.blocks[0]);
  const last = passageWordingFields(form, source, source.blocks[1]);
  assert.deepEqual(first.map((field) => field.channel), ["he", "tr"]);
  assert.deepEqual(last.map((field) => field.channel), ["he", "tr", "en"]);
  assert.deepEqual(last[2], { sourceId: "birchot", blockId: "translation", passageId: "closing", channel: "en", sourceText: "Blessed are You. Amen.", pairedBlockIds: ["opening", "closing"] });
  assert.equal(passageWordingFields({ ...form, groups: [{ sourceId: source.id, blockIds: ["closing"] }] }, source, source.blocks[1]).some((field) => field.channel === "en"), false);
});

test("one edited translation saves canonical provenance and reopens beside its final passage", () => {
  const field = passageWordingFields(form, source, source.blocks[1]).find((item) => item.channel === "en")!;
  const edits = setWordingEdit([], field, "Blessed are You.\nAmen.");
  const saved = editableFromForm({ ...form, variantOverrides: edits }).content;
  assert.equal(saved.mode, "local-variant");
  if (saved.mode !== "local-variant") return;
  assert.deepEqual(saved.overrides, [{ sourceId: "birchot", blockId: "translation", channel: "en", sourceText: field.sourceText, localText: "Blessed are You.\nAmen." }]);
  const draft: Draft = { id: "draft", name: "Birchot", title: "Birchot", layout: "left", templateCueId: "template", content: saved, presentation: {}, sourceSnapshots: [source], version: 1, activeRevision: null, activeDraftVersion: null, updatedAt: 1 };
  const reopened = formFromDraft(draft);
  assert.deepEqual(activeWordingEdits(reopened), saved.overrides);
  assert.equal(reopened.variantOverrides[0].passageId, "closing");
  assert.deepEqual(editableFromForm(reopened).content, saved);
});

test("moving or hiding the paired translation keeps the form edit but excludes it from saved content", () => {
  const field = passageWordingFields(form, source, source.blocks[1]).find((item) => item.channel === "en")!;
  const edits = setWordingEdit([], field, "Local English");
  assert.equal(activeWordingEdits({ ...form, variantOverrides: edits }).length, 1);
  assert.deepEqual(activeWordingEdits({ ...form, variantOverrides: edits, groups: [{ sourceId: source.id, blockIds: ["closing"] }] }), []);
  assert.deepEqual(activeWordingEdits({ ...form, variantOverrides: edits, layers: ["he", "tr"] }), []);
  assert.equal(activeWordingEdits({ ...form, variantOverrides: edits }).length, 1);
});

test("real Birchot fourth blessing exposes both legacy translation and expanded English-only wording", () => {
  const legacy = resolveSourceBoundaries(sourcePack.sources.find((item) => item.id === "awakening.birchot-hashachar@legacy-shabbat-morning")!) as Source;
  const fourth = legacy.blocks.find((block) => block.kind === "translation-en" && block.en?.includes("eyes of the blind"))!;
  assert.equal(fourth.pairedBlockIds?.length, 2);
  const last = legacy.blocks.find((block) => block.id === fourth.pairedBlockIds?.at(-1))!;
  const legacyForm = { ...form, groups: [{ sourceId: legacy.id, blockIds: [...fourth.pairedBlockIds!] }] };
  assert.equal(passageWordingFields(legacyForm, legacy, last).find((field) => field.channel === "en")?.blockId, fourth.id);

  const expanded = resolveSourceBoundaries(sourcePack.sources.find((item) => item.id === `library:legacy-shabbat-morning:${legacy.id}`)!) as Source;
  const english = expanded.blocks.find((block) => block.kind === "source-en" && block.en?.includes("eyes of the blind"))!;
  assert.ok(blocksForMode(expanded, "bilingual").some((block) => block.id === english.id));
  const expandedForm = { ...form, groups: [{ sourceId: expanded.id, blockIds: [english.id] }], layers: ["he", "tr"] as Array<"he" | "tr" | "en"> };
  const inline = passageWordingFields(expandedForm, expanded, english);
  assert.deepEqual(inline.map((field) => field.channel), ["en"]);
  assert.equal(activeWordingEdits({ ...expandedForm, variantOverrides: setWordingEdit([], inline[0], "Local sight wording") }).length, 1);
});

test("separate groups survives editor save and reopen without changing old drafts", () => {
  const grouped = editableFromForm({ ...form, preserveGroups: true }).content;
  assert.equal(grouped.mode === "bilingual" ? grouped.preserveGroups : undefined, true);
  const reopened = formFromDraft({ id: "grouped", name: "Birchot", title: "Birchot", layout: "left", templateCueId: "template", content: grouped, presentation: {}, version: 1, activeRevision: null, activeDraftVersion: null, updatedAt: 1 });
  assert.equal(reopened.preserveGroups, true);
  assert.deepEqual(editableFromForm(reopened).content, grouped);
  const historical = editableFromForm(form).content;
  assert.equal("preserveGroups" in historical, false);
});
