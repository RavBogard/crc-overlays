"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace, type OverlayBranding } from "@/lib/branding";
import { overlayAssetUrl } from "@/lib/overlay-assets";
import type { AccessRole } from "@/lib/access";
import { fetchAccessUser } from "@/lib/access-client";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import SignInCard from "@/components/sign-in-card";
import { layoutLabel } from "@/lib/layout-label";
import { publishedVisibleCount } from "@/lib/catalog-count";
import { findBugCollisions, findFitErrors, findFitWarnings, panelFillRatio, waitForPreviewAssets } from "../preview";
import { authoringCall, AuthoringApiError } from "../api";
import type { Draft, EphemeralPreviewResult } from "../types";
import { candidateFor, editableOnly, summarizeT1, t1SummaryLine, verdict, type T1CandidateCue, type T1RowVerdict } from "./t1-report";
import "../author.css";
import styles from "./fit-check.module.css";

type FitRow = {
  id: string;
  name: string;
  layout: string;
  hasContentRows: boolean;
  hasHebrew: boolean;
  englishOnly: boolean;
  titleLength: number;
  fitErrors: string[];
  bugCollisions: string[];
  mainFontSizePx: number | null;
  hebrewFontSizePx: number | null;
  imageAssetId: string | null;
  fill: number | null;
  sparse: boolean;
  t1Verdict: T1RowVerdict;
  t1Code?: string;
  pairedFits: boolean | null;
};

type Measurement = {
  fitErrors: string[];
  bugCollisions: string[];
  warnings: string[];
  fill: number | null;
  mainFontSizePx: number | null;
  hebrewFontSizePx: number | null;
};

// D-4: the column measures text boxes, not artwork. A panel or lower-third background can
// sit over the reserved corner without any text entering it, so a clear verdict here is not
// a promise that the card is visible.
const SCAN_CARD_COLUMN_HELP = "Measures text against the card's corner; a panel or lower-third background can still cover the card.";
const HEBREW = /[֐-׿]/u;
const cueText = (cue: Cue) => [...Object.values(cue.texts || {}), ...(cue.contentRows || []).flatMap((row) => [row.he, row.tr, row.en])].join(" ");
const fontSizeOf = (root: HTMLElement, selector: string) => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const value = parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
};
const flagList = (row: FitRow) => [row.hasContentRows ? "Rows" : "", row.hasHebrew ? "Hebrew" : "", row.englishOnly ? "English only" : "", row.imageAssetId ? "Artwork" : ""].filter(Boolean).join(" · ") || "—";
const fillLabel = (row: FitRow) => (row.fill === null ? "—" : `${Math.round(row.fill * 100)}%`);

// One render of one cue into the shared measurement stage, measured and torn down.
// The candidate pass (T1) reuses it so a rebuilt graphic is measured exactly the way
// the published one is.
async function measureCue(root: HTMLElement, branding: OverlayBranding, cue: Cue): Promise<Measurement> {
  const player = new Player(root, [cue], branding, { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
  try {
    player.render(cue, overlayAssetUrl(cue, "preview"));
    await waitForPreviewAssets(root);
    const box = root.firstElementChild;
    if (box instanceof HTMLElement) player.applyFit(box, cue);
    return {
      fitErrors: findFitErrors(root),
      // D6 - the reserved scan-card corner, measured in the same render as the fit verdict.
      bugCollisions: findBugCollisions(root),
      warnings: findFitWarnings(root),
      fill: panelFillRatio(root),
      mainFontSizePx: fontSizeOf(root, ".overlay .prayer"),
      hebrewFontSizePx: fontSizeOf(root, ".overlay .hebrew, .overlay .row-hebrew"),
    };
  } catch {
    return { fitErrors: ["Fonts or artwork did not load in time."], bugCollisions: [], warnings: [], fill: null, mainFontSizePx: null, hebrewFontSizePx: null };
  } finally {
    player.dispose();
  }
}

export default function FitCheckClient() {
  const outputRef = useRef<HTMLDivElement | null>(null);
  const runningRef = useRef(false);
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [controlKey, setControlKey] = useState("");
  const [resolved, setResolved] = useState(false);
  const [rows, setRows] = useState<FitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pairedRows, setPairedRows] = useState(true);
  // run() is created once; it reads the toggle through a ref (kept in step by the
  // checkbox handler) so flipping the toggle never restarts a check on its own.
  const pairedRowsRef = useRef(true);

  const run = useCallback(async (key: string, identity: PublicWorkspace) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true); setError(""); setRows([]); setTotal(0);
    const checkPaired = pairedRowsRef.current;
    try {
      const response = await fetch("/api/catalog", { cache: "no-store", headers: key === "session" ? {} : { Authorization: `Bearer ${key}` } });
      if (!response.ok) throw Error(response.status === 401 ? "The catalog rejected this session." : "The published catalog is unavailable.");
      const cues = (await response.json() as Cue[]).filter((cue) => !cue.hidden && !cue.aliasOf);
      // U5 - the same "published, visible" number the console footer, library tab and health show.
      setTotal(publishedVisibleCount(cues));
      // The measurement stage is mounted only while `busy`, so the ref is empty when run()
      // starts. Reading it after the await above is deliberate: by then React has committed
      // the render that setBusy(true) queued and outputRef.current points at the real node.
      const root = outputRef.current;
      if (!root) throw Error("The measurement stage is not ready.");
      const branding = overlayBrandingFromWorkspace(identity);
      for (const cue of cues) {
        const current = await measureCue(root, branding, cue);
        // T1 - rebuild this graphic read-only and measure the paired-rows candidate.
        // Both operations are read-only previews: nothing is stored, published or sent.
        let t1Verdict: T1RowVerdict = "not applicable";
        let t1Code: string | undefined;
        let pairedFits: boolean | null = null;
        const candidate = checkPaired ? candidateFor(cue as T1CandidateCue) : null;
        if (candidate) {
          try {
            const built = candidate.kind === "baseline"
              ? await authoringCall<EphemeralPreviewResult>(key, "preview_baseline_cue", { cueId: candidate.cueId })
              : await authoringCall<EphemeralPreviewResult>(
                key,
                "preview_content",
                editableOnly((await authoringCall<{ draft: Draft }>(key, "get_draft", { draftId: candidate.draftId })).draft),
              );
            const paired = await measureCue(root, branding, built.cue);
            pairedFits = !paired.fitErrors.length;
            t1Verdict = verdict(!current.fitErrors.length, pairedFits);
          } catch (value) {
            t1Verdict = "cannot rebuild automatically";
            t1Code = value instanceof AuthoringApiError && value.code ? value.code : "request_failed";
          }
        }
        const hasHebrew = HEBREW.test(cueText(cue));
        const row: FitRow = {
          id: cue.id,
          name: cue.name,
          layout: cue.layout,
          hasContentRows: Boolean(cue.contentRows?.length),
          hasHebrew,
          englishOnly: !hasHebrew,
          titleLength: (cue.texts?.textTitle || "").length,
          fitErrors: current.fitErrors,
          bugCollisions: current.bugCollisions,
          mainFontSizePx: current.mainFontSizePx,
          hebrewFontSizePx: current.hebrewFontSizePx,
          imageAssetId: cue.presentation?.imageAssetId || null,
          fill: current.fill,
          sparse: current.warnings.length > 0,
          t1Verdict,
          ...(t1Code ? { t1Code } : {}),
          pairedFits,
        };
        setRows((value) => [...value, row]);
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : "The fit check could not run.");
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const identityResponse = await fetch("/api/workspace", { cache: "no-store" });
      if (!identityResponse.ok) throw Error("Workspace identity is unavailable.");
      const identity = await identityResponse.json() as PublicWorkspace;
      overlayBrandingFromWorkspace(identity);
      if (cancelled) return;
      setWorkspace(identity);
      // One shared /api/access probe per page load (the header uses the same cache).
      const user = await fetchAccessUser().catch(() => null);
      if (cancelled) return;
      if (user && ["owner", "editor"].includes(user.role)) {
        setRole(user.role as AccessRole);
        setControlKey("session");
        setResolved(true);
        return;
      }
      const saved = sessionStorage.getItem("crc-control-key") || "";
      setResolved(true);
      if (!saved || cancelled) return;
      setRole("owner");
      setControlKey(saved);
    };
    void start().catch((value) => {
      setError(value instanceof Error ? value.message : "The fit check could not start.");
      setResolved(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!controlKey || !workspace) return;
    // Deferred by one tick: the check is started by this effect, not run inside it.
    const start = setTimeout(() => void run(controlKey, workspace), 0);
    return () => clearTimeout(start);
  }, [controlKey, run, workspace]);

  const workspaceStyle = workspace ? {
    "--workspace-primary": workspace.colors.primary,
    "--workspace-deep": workspace.colors.deep,
    "--workspace-accent": workspace.colors.accent,
  } as CSSProperties : undefined;
  const failing = rows.filter((row) => row.fitErrors.length);
  const sorted = [...rows].sort((left, right) => (right.fitErrors.length ? 1 : 0) - (left.fitErrors.length ? 1 : 0));
  const scanCardColumn = Boolean(workspace?.bug?.enabled);
  const columnCount = scanCardColumn ? 11 : 10;
  const t1 = summarizeT1(rows.map((row) => ({ id: row.id, name: row.name, verdict: row.t1Verdict, code: row.t1Code })));
  const report = JSON.stringify({ frame: "1920x1080", total, checked: rows.length, needsAttention: failing.length, t1, cues: rows }, null, 2);

  return (
    <main className="author-page" style={workspaceStyle}>
      <WorkspaceHeader compact current="/author" title="Fit check" role={role} workspace={workspace} aside={<Link className="header-link" href="/author">Back to library</Link>} />
      <div className={styles.wrap}>
        <p className={styles.notice}><b>Read-only check.</b> Nothing is published or sent to output.</p>
        {resolved && !controlKey && <SignInCard description="The fit check renders this congregation’s published graphics, so it needs an account with editor access." />}
        {error && <p className={styles.error}>{error}</p>}
        {controlKey && <>
          <p className={styles.summary}>
            {busy || !rows.length
              ? "Rendering every published graphic at 1920 × 1080 with the bundled fonts."
              : `${rows.length - failing.length} of ${rows.length} published graphics fit at 1920×1080 with the bundled fonts. ${failing.length} need attention.`}
          </p>
          {!busy && t1.checked > 0 && <p className={styles.summary}>{t1SummaryLine(t1)}.{t1.cannotRebuild.length ? ` ${t1.cannotRebuild.length} could not be rebuilt automatically.` : ""}</p>}
          <p className={styles.progress}>Checked {rows.length} of {total || rows.length}</p>
          <p className={styles.controls}>
            <button onClick={() => { if (workspace) void run(controlKey, workspace); }} disabled={busy || !workspace}>{busy ? "Checking…" : "Run again"}</button>
            <label className={styles.toggle}>
              <input type="checkbox" checked={pairedRows} onChange={(event) => { pairedRowsRef.current = event.target.checked; setPairedRows(event.target.checked); }} disabled={busy} />
              Paired rows (T1)
            </label>
            <span className={styles.hint}>Rebuilds each bilingual panel read-only to see whether paired rows would change its pagination. Run again to apply.</span>
          </p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption>Every published graphic rendered once with the real renderer and measured at true 1920 &times; 1080 CSS pixels. Graphics needing attention are listed first.</caption>
              <thead>
                <tr>
                  <th scope="col">Graphic</th>
                  <th scope="col">Layout</th>
                  <th scope="col">Flags</th>
                  <th scope="col">Fill</th>
                  <th scope="col">Title chars</th>
                  <th scope="col">Main font</th>
                  <th scope="col">Hebrew font</th>
                  <th scope="col">Current</th>
                  {scanCardColumn && <th scope="col" title={SCAN_CARD_COLUMN_HELP}>Scan card corner<span className={styles.columnHelp}>{SCAN_CARD_COLUMN_HELP}</span></th>}
                  <th scope="col">Paired rows</th>
                  <th scope="col">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} className={row.fitErrors.length ? styles.fail : undefined}>
                    <th scope="row">{row.name}</th>
                    <td>{layoutLabel(row.layout)}</td>
                    <td className={styles.flags}>{flagList(row)}</td>
                    <td>{fillLabel(row)}{row.sparse && <> <span className={styles.sparse}>Sparse</span></>}</td>
                    <td>{row.titleLength}</td>
                    <td>{row.mainFontSizePx === null ? "—" : `${row.mainFontSizePx}px`}</td>
                    <td>{row.hebrewFontSizePx === null ? "—" : `${row.hebrewFontSizePx}px`}</td>
                    <td>{row.fitErrors.length
                      ? <ul className={styles.errors}>{row.fitErrors.map((item) => <li key={item}>{item}</li>)}</ul>
                      : <span className={styles.ok}>Fits</span>}</td>
                    {scanCardColumn && <td>{row.bugCollisions.length
                      ? <ul className={styles.errors}>{row.bugCollisions.map((item) => <li key={item}>{item}</li>)}</ul>
                      : <span className={styles.ok}>Clear</span>}</td>}
                    <td>{row.t1Verdict === "not applicable"
                      ? "—"
                      : row.t1Verdict === "cannot rebuild automatically"
                        ? <span className={styles.code}>{row.t1Code}</span>
                        : row.pairedFits
                          ? <span className={styles.ok}>Fits</span>
                          : <span className={styles.needs}>Does not fit</span>}</td>
                    <td>{row.t1Verdict === "not applicable"
                      ? "—"
                      : <span className={row.t1Verdict === "unchanged" ? styles.ok : styles.needs}>{row.t1Verdict}</span>}</td>
                  </tr>
                ))}
                {!sorted.length && <tr><td colSpan={columnCount}>{busy ? "Checking…" : "No published graphics were returned."}</td></tr>}
              </tbody>
            </table>
          </div>
          <details className={styles.report}>
            <summary>JSON report</summary>
            <textarea readOnly value={report} aria-label="Fit check JSON report" spellCheck={false} />
          </details>
        </>}
        {busy && <div className={styles.stageRow}>
          <div className={styles.stage}><div ref={outputRef} className={styles.output} /></div>
          <span>Measurement stage &mdash; one 1920 &times; 1080 frame, scaled for display only.</span>
        </div>}
      </div>
    </main>
  );
}
