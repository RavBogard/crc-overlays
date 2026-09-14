"use client";

/* D3 of the 2026-09-14 layout pass (handoff #2): source review left the top navigation and
   became a filter in the library rail, shown only while something is waiting. The inbox is the
   rail list, the side-by-side comparison is the editor's centre column, and "Check sources"
   is in the rail's overflow menu. The unopened-baseline line shows once per message, not on
   every visit — it is a coverage note, not an alarm. */

import { Check, Clock3, ShieldCheck, X } from "lucide-react";
import { useCallback, useState } from "react";

export type SourceReviewStatus = "pending" | "deferred" | "rejected" | "accepted";
export type SourceReviewSummary = {
  id: string; version: number; status: SourceReviewStatus; comparison: "exact" | "unavailable";
  sourceName: string; book: string; service: string; detectedAt: number; changeCount: number;
  paginationMayChange: boolean; blockedReason?: string;
  affected: { draftName: string; published: boolean; layout: string; sharedFrom: "crc" | "workspace"; serviceCollections: Array<{ id: string; name: string; service: string; archived: boolean }> };
};
export type SourceReviewChange = { blockId: string; blockIndex: number; channel: "he" | "tr" | "en"; role: string; priorText: string | null; proposedText: string | null; pairedBlockIds: string[]; paginationMayChange: boolean };
export type SourceReviewDetail = SourceReviewSummary & {
  fromFeedSha256: string; toFeedSha256: string; fromUnitSha256: string; toUnitSha256: string;
  changes: SourceReviewChange[];
  decision?: { kind: SourceReviewStatus; reason: string | null; actor: string; at: number; createdDraftId: string | null };
};

class SourceReviewRequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "SourceReviewRequestError"; this.status = status; }
}

async function operation<T>(name: string, input: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/source-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation: name, input }) });
  const body = await response.json().catch(() => ({ error: "The server returned an unreadable response." }));
  if (!response.ok) throw new SourceReviewRequestError(body.error ?? "Source review unavailable", response.status);
  return body as T;
}

const COVERAGE_SEEN = "crc-source-coverage-seen";
const failureText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export type SourceReviewState = ReturnType<typeof useSourceReview>;

export function useSourceReview() {
  const [records, setRecords] = useState<SourceReviewSummary[]>([]);
  const [selected, setSelected] = useState<SourceReviewDetail | null>(null);
  const [coverage, setCoverage] = useState("");
  const [coverageShown, setCoverageShown] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  // A failure here is silent: the filter simply does not appear. Source review is not the work
  // an author came to the library to do, and an outage in it must not block the library.
  const load = useCallback(async () => {
    try {
      const body = await operation<{ records: SourceReviewSummary[]; coverage: { unopenedPublished: { message: string } } }>("list");
      setRecords(body.records);
      setCoverage(body.coverage.unopenedPublished.message);
      setSelected((current) => current && body.records.some((item) => item.id === current.id) ? current : null);
      return body.records.length;
    } catch { return 0; }
  }, []);

  const inspect = useCallback(async (id: string) => {
    setBusy(id); setMessage("");
    try {
      const body = await operation<{ record: SourceReviewDetail }>("get", { id });
      setSelected(body.record); setReason(body.record.decision?.reason ?? "");
    } catch (error) { setMessage(failureText(error, "Unable to open this comparison.")); }
    finally { setBusy(""); }
  }, []);

  /** Returns what to tell the author, so the answer reaches them whether or not the filter opens. */
  const scan = useCallback(async () => {
    setBusy("scan"); setMessage("");
    try {
      const body = await operation<{ records: SourceReviewSummary[]; detected: number; coverage: { unopenedPublished: { message: string } } }>("scan");
      setRecords(body.records); setCoverage(body.coverage.unopenedPublished.message);
      return { count: body.records.length, message: body.detected ? `${body.detected} affected graphic${body.detected === 1 ? "" : "s"} added to review.` : "No new changes were found among the source snapshots available for exact comparison." };
    } catch (error) { return { count: 0, message: failureText(error, "Unable to check sources.") }; }
    finally { setBusy(""); }
  }, []);

  const decide = useCallback(async (decision: "accept" | "defer" | "reject") => {
    if (!selected) return;
    setBusy(decision); setMessage("");
    try {
      const body = await operation<{ record: SourceReviewSummary; draft?: { id: string } | null }>("decide", { id: selected.id, expectedVersion: selected.version, decision, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      setMessage(decision === "accept" && body.draft ? "A new unpublished draft is ready for exact review." : "Decision saved.");
      setSelected(null);
      await load();
    } catch (error) { setMessage(failureText(error, "Unable to save this decision.")); }
    finally { setBusy(""); }
  }, [load, reason, selected]);

  /** Called when the filter is opened: the coverage line shows once per message. */
  const openFilter = useCallback(() => {
    setMessage("");
    setCoverageShown((current) => {
      if (current || !coverage) return current;
      try {
        if (localStorage.getItem(COVERAGE_SEEN) === coverage) return false;
        localStorage.setItem(COVERAGE_SEEN, coverage);
      } catch { /* a browser that refuses storage shows the line each visit rather than never */ }
      return true;
    });
  }, [coverage]);

  return { records, selected, coverage: coverageShown ? coverage : "", reason, setReason, message, busy, load, inspect, scan, decide, openFilter, clearSelection: () => setSelected(null) };
}

export function SourceReviewPanel({ state }: { state: SourceReviewState }) {
  const { selected } = state;
  return <section className="source-review-panel">
    {state.coverage && <p className="review-coverage">{state.coverage}</p>}
    {state.message && <p className="review-message">{state.message}</p>}
    {!selected ? <div className="review-empty">
      <ShieldCheck size={36} />
      <h2>Choose a source change</h2>
      <p>You&rsquo;ll see the previous source and the proposed revision side by side.</p>
    </div> : <>
      <header className="review-head">
        <div>
          <span className={`review-status ${selected.status}`}>{selected.status}</span>
          <h2>{selected.sourceName}</h2>
          <p>{selected.affected.draftName} · {selected.affected.layout} layout · {selected.affected.sharedFrom === "crc" ? "Shared CRC source" : "Workspace source"}</p>
          {selected.affected.serviceCollections.length > 0 && <p>Used in {selected.affected.serviceCollections.map((item) => item.name).join(", ")}</p>}
        </div>
        <button className="icon-button" onClick={state.clearSelection} aria-label="Close this comparison"><X size={18} /></button>
      </header>
      {selected.blockedReason && <p className="review-blocked">{selected.blockedReason}</p>}
      <div className="review-revision"><span>Prior revision <code>{selected.fromUnitSha256.slice(0, 12)}</code></span><span>Proposed <code>{selected.toUnitSha256.slice(0, 12)}</code></span></div>
      <div className="review-changes">{selected.changes.map((change) => <article key={`${change.blockId}-${change.channel}`}>
        <header><strong>{change.role}</strong><span>Source block {change.blockIndex + 1}{change.pairedBlockIds.length ? " · paired" : ""}</span></header>
        <div className="review-comparison">
          <div><label>Previous source</label><p dir={change.channel === "he" ? "rtl" : "auto"}>{change.priorText ?? "Removed or unavailable"}</p></div>
          <div><label>Proposed source</label><p dir={change.channel === "he" ? "rtl" : "auto"}>{change.proposedText ?? "Removed"}</p></div>
        </div>
        {change.paginationMayChange && <small>Wording changed; review line wrapping and slide breaks in the new draft.</small>}
      </article>)}</div>
      {selected.status !== "accepted" && selected.status !== "rejected" && <div className="review-decision">
        <label htmlFor="review-reason">Review note {selected.status === "deferred" ? "" : "(required for defer or reject)"}</label>
        <textarea id="review-reason" value={state.reason} onChange={(event) => state.setReason(event.target.value)} maxLength={500} placeholder="Why are you deferring or rejecting this revision?" />
        <div>
          <button className="review-reject" disabled={Boolean(state.busy)} onClick={() => void state.decide("reject")}><X size={16} /> Reject</button>
          <button className="review-defer" disabled={Boolean(state.busy)} onClick={() => void state.decide("defer")}><Clock3 size={16} /> Defer</button>
          <button className="review-accept" disabled={Boolean(state.busy) || Boolean(selected.blockedReason)} onClick={() => void state.decide("accept")}><Check size={16} /> Accept into new draft</button>
        </div>
      </div>}
    </>}
  </section>;
}
