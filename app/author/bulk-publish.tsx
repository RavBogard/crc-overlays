"use client";

import { useRef, useState } from "react";
import { LoaderCircle, UploadCloud } from "lucide-react";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import type { PublicWorkspace } from "@/lib/workspace";
import { AuthoringApiError, authoringCall } from "./api";
import { measureCue } from "./measure-cue";
import type { BrowserMeasurement, Draft, PreviewResult, PublishedRevision, ReviewReceipt } from "./types";

// The publish path (handoff 2026-09-14, part 2). An import leaves a hundred-odd drafts standing,
// every one of which then needs preview, measure, review and publish by hand. This does that run
// in one click: the click is the approval, so there is no dialog and no per-draft confirmation.
//
// Every draft is measured here, in this browser, at 1920x1080 by the shared sequence
// (app/author/measure-cue.ts) - the same lines the headless server stage runs. A draft whose
// measurement reports fit problems is never reviewed and never published: it stays a draft and
// is listed with what is wrong with it. The run does not stop at the first failure.
//
// Drafts go one at a time on purpose: authoringCall gives each request 12 s, and a parallel fan
// of previews would starve them.

export type BulkResult = { id: string; name: string; status: "published" | "skipped" | "failed"; detail: string };

const RENDERER_VERSION = "crc-author-bulk-v1";

/** Never published, not archived: the drafts a bulk publish is for. A retired graphic is not
 *  "never published" - publishing it would silently put it back on the deck (MCP plan A3). */
export function bulkCandidates(drafts: Draft[]) {
  return drafts.filter((draft) => !draft.archivedAt && !draft.retired && draft.activeRevision === null);
}

export function BulkPublish({ apiKey, drafts, workspace, onFinished }: {
  apiKey: string;
  drafts: Draft[];
  workspace: PublicWorkspace;
  onFinished: () => void | Promise<void>;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BulkResult[]>([]);
  const candidates = bulkCandidates(drafts);

  async function publishOne(draft: Draft, branding: ReturnType<typeof overlayBrandingFromWorkspace>): Promise<BulkResult> {
    const name = draft.name || draft.title;
    const stage = stageRef.current;
    if (!stage) return { id: draft.id, name, status: "failed", detail: "The measurement stage is not ready." };
    const preview = await authoringCall<PreviewResult>(apiKey, "preview_draft", { draftId: draft.id, expectedVersion: draft.version });
    if (!preview.validation?.valid) return { id: draft.id, name, status: "skipped", detail: (preview.validation?.errors || []).join(" - ") || "The draft did not validate." };
    const measurement = await measureCue(stage, preview.cue, branding);
    if (measurement.fitErrors.length) return { id: draft.id, name, status: "skipped", detail: measurement.fitErrors.join(" - ") };
    const browserMeasurement: BrowserMeasurement = { viewportWidth: 1920, viewportHeight: 1080, fontsReady: true, overflow: false, rendererVersion: RENDERER_VERSION, measuredAt: Date.now() };
    await authoringCall<ReviewReceipt>(apiKey, "review_draft", { draftId: draft.id, expectedVersion: draft.version, previewId: preview.previewId, browserMeasurement, humanApproved: true });
    const publish = (extra: object = {}) => authoringCall<{ revision: PublishedRevision; draft?: Draft; renamedFrom?: string }>(
      apiKey, "publish_draft", { draftId: draft.id, expectedVersion: draft.version, previewId: preview.previewId, ...extra },
    );
    try {
      const response = await publish();
      return { id: draft.id, name, status: "published", detail: response.draft?.name || name };
    } catch (value) {
      // R6 - a name already in the library is not a reason to stop: publish under the free name
      // the server offers, and say which one it used.
      if (value instanceof AuthoringApiError && value.code === "duplicate_name" && value.suggestedName) {
        const response = await publish({ confirmDuplicateName: true });
        return { id: draft.id, name, status: "published", detail: `Published as “${response.draft?.name || value.suggestedName}”` };
      }
      throw value;
    }
  }

  async function run() {
    if (running || !candidates.length) return;
    setRunning(true);
    setResults([]);
    const branding = overlayBrandingFromWorkspace(workspace);
    for (const draft of candidates) {
      let result: BulkResult;
      try {
        result = await publishOne(draft, branding);
      } catch (value) {
        result = { id: draft.id, name: draft.name || draft.title, status: "failed", detail: value instanceof Error ? value.message : "The publish failed." };
      }
      setResults((items) => [...items, result]);
    }
    setRunning(false);
    await onFinished();
  }

  if (!candidates.length && !results.length) return null;
  const published = results.filter((item) => item.status === "published").length;
  return <section className="bulk-publish" aria-label="Publish reviewed drafts">
    {candidates.length > 0 && <button className="bulk-publish-button" onClick={() => void run()} disabled={running}>
      {running ? <LoaderCircle className="spin" size={16} /> : <UploadCloud size={16} />}
      {running ? `Publishing ${Math.min(results.length + 1, candidates.length)} of ${candidates.length}…` : `Publish ${candidates.length} reviewed draft${candidates.length === 1 ? "" : "s"}`}
    </button>}
    {results.length > 0 && <>
      <p className="bulk-publish-count">{published} published, {results.length - published} left as drafts</p>
      <ul className="bulk-publish-list">
        {results.map((item) => <li key={item.id} className={`bulk-${item.status}`}>
          <strong>{item.name}</strong>
          <small>{item.status === "published" && item.detail === item.name ? "Published" : item.detail}</small>
        </li>)}
      </ul>
    </>}
    {/* An off-screen 1920x1080 stage, the same shape app/author/fit-stage renders into, so a
        measurement here and a measurement there describe the same frame. */}
    <div ref={stageRef} aria-hidden className="bulk-publish-stage" />
  </section>;
}
