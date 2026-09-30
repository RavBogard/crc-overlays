import assert from "node:assert/strict";
import test from "node:test";
import { insertLineBreak } from "../app/author/manual-wording.ts";
import { buildCue, parseContent, sourcePack, sourcePinFor, type Draft, type LocalVariantContent } from "../lib/authoring-model.ts";
import { displayPresentationText } from "../lib/player.ts";

const source = sourcePack.sources.find((item) => item.id === "library:legacy-shabbat-evening:opening.angels-shalom-aleichem@legacy-shabbat-evening")!;

test("Shalom Aleichem local wording keeps a break after ellipsis through parse and cue building", () => {
  const first = source.blocks.find((block) => block.id.endsWith("#block-0"))!;
  const next = source.blocks.find((block) => block.id.endsWith("#block-1"))!;
  const group = { sourceId: source.id, blockIds: [first.id, next.id] };
  const local = insertLineBreak("Shalom aleichem...", "Shalom aleichem...".length, "Shalom aleichem...".length).text;
  const requested: LocalVariantContent = { mode: "local-variant", label: "Shalom Aleichem all", base: { mode: "bilingual", hebrewGroups: [group], transliterationGroups: [group], layers: ["he", "tr"] }, overrides: [{ sourceId: source.id, blockId: first.id, channel: "tr", sourceText: first.tr!, localText: local }] };
  const content = parseContent(requested, [source]);
  assert.equal(content.mode, "local-variant");
  if (content.mode !== "local-variant") return;
  assert.equal(content.overrides[0].localText, local);
  assert.equal(content.overrides[0].sourceText, first.tr);
  const draft: Draft = { id: "shalom-break", name: "Shalom Aleichem all", title: "Shalom Aleichem", layout: "left", templateCueId: "bbd7c98b-f1de-41ee-9719-2bb27a30d0db", content, presentation: { latinLineBreaks: "preserve" }, sourceSnapshots: [source], sourcePin: sourcePinFor(content, [source]), version: 1, activeRevision: null, activeDraftVersion: null, createdAt: 1, updatedAt: 1, createdBy: "test", updatedBy: "test" };
  const cue = buildCue(draft);
  assert.ok(cue.texts.textMainEng.includes(`Shalom aleichem...\u2028${next.tr}`));
  assert.ok(cue.contentRows?.some((row) => row.tr.includes("Shalom aleichem...\u2028")));
  for (const latinLineBreaks of ["preserve", "paragraphs", "phrases"] as const) {
    const display = displayPresentationText(cue.texts.textMainEng, "textMainEng", { latinLineBreaks });
    assert.ok(display.includes(`Shalom aleichem...\n${next.tr}`), latinLineBreaks);
    assert.equal(display.includes("\u2028"), false);
  }
});
