import assert from "node:assert/strict";
import test from "node:test";
import { organizedLibraryItems, itemId, type LibraryItem } from "./library-model.ts";
import type { CatalogCue, Draft } from "./types.ts";

const draft = (id: string, name: string, createdAt: number): Draft => ({ id, name, createdAt, title: name, layout: "left", templateCueId: "template", content: { mode: "custom", text: name }, presentation: {}, version: 1, activeRevision: null, activeDraftVersion: null, updatedAt: createdAt });
const catalog = (id: string, name: string, draftId: string | null): CatalogCue => ({ id, name, title: name, layout: "left", hidden: false, origin: "canonical", draftId, draftVersion: null, activeRevision: null, canEdit: true, canDuplicate: true, editAction: "open" });

test("folder filter and A–Z use name then stable id without changing input", () => {
  const drafts = [draft("d2", "Same", 20), draft("d1", "Same", 10)];
  const items: LibraryItem[] = [{ kind: "draft", draft: drafts[0] }, { kind: "catalog", cue: catalog("built-in", "Alpha", null) }, { kind: "draft", draft: drafts[1] }];
  const assignments = { d1: "music", "built-in": "music" };
  assert.deepEqual(organizedLibraryItems(items, drafts, assignments, "all", "", "az").map(itemId), ["built-in", "d1", "d2"]);
  assert.deepEqual(organizedLibraryItems(items, drafts, assignments, "music", "", "az").map(itemId), ["built-in", "d1"]);
  assert.deepEqual(organizedLibraryItems(items, drafts, assignments, "unfiled", "sam", "az").map(itemId), ["d2"]);
  assert.deepEqual(items.map(itemId), ["d2", "built-in", "d1"]);
});

test("date sorting uses draft creation time for published catalog and leaves undated built-ins last", () => {
  const drafts = [draft("old", "Alpha", 10), draft("new", "Beta", 30), draft("same", "Aardvark", 30)];
  const items: LibraryItem[] = [
    { kind: "catalog", cue: catalog("built-in", "Ancient", null) },
    { kind: "catalog", cue: catalog("published", "Beta", "new") },
    { kind: "draft", draft: drafts[0] },
    { kind: "draft", draft: drafts[2] },
  ];
  assert.deepEqual(organizedLibraryItems(items, drafts, {}, "all", "", "newest").map(itemId), ["same", "published", "old", "built-in"]);
  assert.deepEqual(organizedLibraryItems(items, drafts, {}, "all", "", "oldest").map(itemId), ["old", "same", "published", "built-in"]);
});
