import assert from "node:assert/strict";
import test from "node:test";
import { AuthoringError, editableFromBaseline, parseEditable } from "../lib/authoring-model.ts";
import { NEW_OVERLAY_PRESENTATION_DEFAULTS } from "../lib/overlay-presentation-defaults";
import { createAuthoringService, MemoryAuthoringRepository } from "../lib/authoring.ts";

const TEMPLATE = "efa9fad4-f7d5-4091-a708-82103028861b";
const ASSET_ID = `asset_${"a".repeat(64)}`;

test("bounded presentation fields round-trip into a compiled preview cue", async () => {
  const service = createAuthoringService(new MemoryAuthoringRepository());
  const editable = editableFromBaseline(TEMPLATE);
  editable.presentation = { alignment: "center", lineSpacing: "spacious", imageAssetId: ASSET_ID };
  const draft = (await service.operation("create_draft", editable, "tester") as { draft: { id: string; version: number } }).draft;
  const preview = await service.operation("preview_draft", { draftId: draft.id, expectedVersion: draft.version }, "tester") as { cue: { presentation?: unknown } };
  assert.deepEqual(preview.cue.presentation, { ...NEW_OVERLAY_PRESENTATION_DEFAULTS, ...editable.presentation });
});

test("presentation rejects arbitrary URLs and values outside the bounded choices", () => {
  const editable = editableFromBaseline(TEMPLATE);
  assert.throws(() => parseEditable({ ...editable, presentation: { imageAssetUrl: "https://example.test/image.png" } }), (error: unknown) => error instanceof AuthoringError && error.code === "invalid_input");
  assert.throws(() => parseEditable({ ...editable, presentation: { alignment: "right" } }), (error: unknown) => error instanceof AuthoringError && error.code === "invalid_input");
  assert.throws(() => parseEditable({ ...editable, presentation: { imageAssetId: "not-an-asset" } }), (error: unknown) => error instanceof AuthoringError && error.code === "invalid_input");
});
