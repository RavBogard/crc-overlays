import assert from "node:assert/strict";
import test from "node:test";
import { AuthoringError, buildCue, draftSetSelections, parseContent, sourcePinFor, type AuthoringSource, type BilingualContent, type Draft, type LocalVariantContent } from "../lib/authoring-model.ts";
import { createAuthoringService, MemoryAuthoringRepository } from "../lib/authoring.ts";
import { explicitSplitPages } from "../lib/split-page-groups.ts";

const source: AuthoringSource = { id: "grouped-prayer", name: "Grouped prayer", section: null, unitSha256: "grouped-unit", blocks: [
  { id: "a", index: 0, kind: "bilingual", he: "א", tr: "A", sourceBlockSha256: "a" },
  { id: "b", index: 1, kind: "bilingual", he: "ב", tr: "B", sourceBlockSha256: "b" },
  { id: "ab-en", index: 2, kind: "translation-en", en: "First translation", pairedBlockIds: ["a", "b"], sourceBlockSha256: "ab-en" },
  { id: "inline", index: 3, kind: "source-en", en: "English reading", sourceBlockSha256: "inline" },
  { id: "c", index: 4, kind: "bilingual", he: "ג", tr: "C", sourceBlockSha256: "c" },
  { id: "d", index: 5, kind: "bilingual", he: "ד", tr: "D", sourceBlockSha256: "d" },
  { id: "cd-en", index: 6, kind: "translation-en", en: "Last translation", pairedBlockIds: ["c", "d"], sourceBlockSha256: "cd-en" },
] };
const selected = ["a", "b", "inline", "c", "d"];
const groups = [{ sourceId: source.id, blockIds: selected }];
const base: BilingualContent = { mode: "bilingual", hebrewGroups: groups, transliterationGroups: structuredClone(groups), includeTranslation: true, arrangement: "blocks" };
const content: LocalVariantContent = { mode: "local-variant", label: "Local wording", base, overrides: [
  { sourceId: source.id, blockId: "ab-en", channel: "en", sourceText: "First translation", localText: "Local first" },
  { sourceId: source.id, blockId: "inline", channel: "en", sourceText: "English reading", localText: "Local reading" },
  { sourceId: source.id, blockId: "d", channel: "tr", sourceText: "D", localText: "Local D" },
] };
const draft: Draft = { id: "grouped-draft", name: "Grouped", title: "Grouped title", accentTitle: "כותרת", layout: "left", templateCueId: "bbd7c98b-f1de-41ee-9719-2bb27a30d0db", content, presentation: { titleFontSize: 42, latinLineBreaks: "preserve" }, sourceSnapshots: [source], sourcePin: sourcePinFor(content, [source]), version: 1, activeRevision: null, activeDraftVersion: null, createdAt: 1, updatedAt: 1, createdBy: "tester", updatedBy: "tester" };
const page = (...blockIds: string[]) => [{ sourceId: source.id, blockIds }];
const pages = [page("a", "b"), page("inline"), page("c", "d")];

test("explicit page plan requires exact order and keeps a translation run in one group", () => {
  const segments = [[source.blocks[0], source.blocks[1]], [source.blocks[3]], [source.blocks[4], source.blocks[5]]];
  assert.deepEqual(explicitSplitPages(pages, segments, source.id).map((item) => item.blocks.map((block) => block.id)), [["a", "b"], ["inline"], ["c", "d"]]);
  const invalid = (value: unknown) => assert.throws(() => explicitSplitPages(value, segments, source.id), (error) => (error as AuthoringError).code === "invalid_split_pages");
  invalid([page("a"), page("b", "inline", "c", "d")]);
  invalid([page("a", "b"), page("inline", "inline", "c", "d")]);
  invalid([page("a", "b"), page("c", "d")]);
});

test("show groups separately changes panel rows in both language arrangements", () => {
  const passageGroups = [page("a", "b")[0], page("c", "d")[0]];
  const baseContent: BilingualContent = { mode: "bilingual", hebrewGroups: passageGroups, transliterationGroups: structuredClone(passageGroups), layers: ["he", "tr"] };
  const rows = (content: BilingualContent) => buildCue({ ...draft, content, sourcePin: sourcePinFor(content, [source]) }).contentRows!;
  assert.equal(rows(baseContent).length, 4, "historical Together remains passage by passage");
  assert.equal(rows({ ...baseContent, preserveGroups: true }).length, 2, "Together shows one row per group");
  assert.equal(rows({ ...baseContent, arrangement: "blocks" }).length, 2, "historical In blocks remains whole-graphic language rows");
  const grouped = rows({ ...baseContent, arrangement: "blocks", preserveGroups: true });
  assert.deepEqual(grouped.map((row) => [Boolean(row.he), Boolean(row.tr)]), [[true, false], [false, true], [true, false], [false, true]]);
  assert.throws(() => parseContent({ ...baseContent, includeTranslation: true, layers: ["he", "tr", "en"], preserveGroups: true, hebrewGroups: [page("a")[0], page("b", "c", "d")[0]], transliterationGroups: [page("a")[0], page("b", "c", "d")[0]] }, [source]), (error) => (error as AuthoringError).code === "group_splits_translation");
});

test("explicit split preserves groups, local variants, metadata, and retry plan identity", async () => {
  const repo = new MemoryAuthoringRepository();
  await repo.insertDraft(structuredClone(draft));
  const service = createAuthoringService(repo);
  const result = await service.operation("split_draft_into_set", { draftId: draft.id, expectedVersion: 1, pages }, "tester") as { drafts: Draft[]; set: { id: string; draftIds: string[] }; reused: boolean };
  assert.equal(result.reused, false);
  assert.deepEqual(result.drafts.map((item) => { const base = item.content.mode === "local-variant" ? item.content.base : item.content; return base.mode === "bilingual" ? base.hebrewGroups[0].blockIds : base.mode === "source-en" || base.mode === "original-en" ? base.englishGroups[0].blockIds : []; }), [["a", "b"], ["inline"], ["c", "d"]]);
  assert.deepEqual(result.drafts.flatMap((item) => item.content.mode === "local-variant" ? item.content.overrides.map((override) => override.blockId) : []), ["ab-en", "inline", "d"]);
  assert.deepEqual(result.drafts.flatMap((item) => draftSetSelections(item.content, item.sourceSnapshots)).map((item) => item.blockId).sort(), draftSetSelections(draft.content, draft.sourceSnapshots).map((item) => item.blockId).sort());
  assert.ok(result.drafts.every((item) => item.title === draft.title && item.accentTitle === draft.accentTitle && item.presentation.titleFontSize === 42 && item.sourceSnapshots?.[0].id === source.id));
  assert.ok(Object.values(buildCue(result.drafts[1]).texts).includes("Local reading"));
  const retry = await service.operation("split_draft_into_set", { draftId: draft.id, expectedVersion: 1, pages }, "tester") as typeof result;
  assert.equal(retry.reused, true);
  assert.deepEqual(retry.set.draftIds, result.set.draftIds);
  await assert.rejects(service.operation("split_draft_into_set", { draftId: draft.id, expectedVersion: 1, pages: [page("a", "b", "inline"), page("c", "d")] }, "tester"), (error) => (error as AuthoringError).code === "split_plan_conflict");
  await assert.rejects(service.operation("split_draft_into_set", { draftId: draft.id, expectedVersion: 1 }, "tester"), (error) => (error as AuthoringError).code === "split_plan_conflict");
});
