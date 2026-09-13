"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import { overlayAssetUrl } from "@/lib/overlay-assets";
import type { AccessRole } from "@/lib/access";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import { layoutLabel } from "@/lib/layout-label";
import { findFitErrors, waitForPreviewAssets } from "../preview";
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
  mainFontSizePx: number | null;
  hebrewFontSizePx: number | null;
  imageAssetId: string | null;
};

const HEBREW = /[֐-׿]/u;
const cueText = (cue: Cue) => [...Object.values(cue.texts || {}), ...(cue.contentRows || []).flatMap((row) => [row.he, row.tr, row.en])].join(" ");
const fontSizeOf = (root: HTMLElement, selector: string) => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const value = parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
};
const flagList = (row: FitRow) => [row.hasContentRows ? "Rows" : "", row.hasHebrew ? "Hebrew" : "", row.englishOnly ? "English only" : "", row.imageAssetId ? "Artwork" : ""].filter(Boolean).join(" · ") || "—";

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

  const run = useCallback(async (key: string, identity: PublicWorkspace) => {
    const root = outputRef.current;
    if (!root || runningRef.current) return;
    runningRef.current = true;
    setBusy(true); setError(""); setRows([]); setTotal(0);
    try {
      const response = await fetch("/api/catalog", { cache: "no-store", headers: key === "session" ? {} : { Authorization: `Bearer ${key}` } });
      if (!response.ok) throw Error(response.status === 401 ? "The catalog rejected this session." : "The published catalog is unavailable.");
      const cues = (await response.json() as Cue[]).filter((cue) => !cue.hidden && !cue.aliasOf);
      setTotal(cues.length);
      const branding = overlayBrandingFromWorkspace(identity);
      for (const cue of cues) {
        const player = new Player(root, [cue], branding, { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
        const fitErrors: string[] = [];
        try {
          player.render(cue, overlayAssetUrl(cue, "preview"));
          await waitForPreviewAssets(root);
          const box = root.firstElementChild;
          if (box instanceof HTMLElement) player.applyFit(box, cue);
          fitErrors.push(...findFitErrors(root));
        } catch {
          fitErrors.push("Fonts or artwork did not load in time.");
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
          fitErrors,
          mainFontSizePx: fontSizeOf(root, ".overlay .prayer"),
          hebrewFontSizePx: fontSizeOf(root, ".overlay .hebrew, .overlay .row-hebrew"),
          imageAssetId: cue.presentation?.imageAssetId || null,
        };
        player.dispose();
        setRows((current) => [...current, row]);
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
      const access = await fetch("/api/access", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      if (access?.ok) {
        const body = await access.json().catch(() => null) as { user?: { role?: string } } | null;
        if (body?.user && ["owner", "editor"].includes(body.user.role || "")) {
          setRole(body.user.role as AccessRole);
          setControlKey("session");
          setResolved(true);
          await run("session", identity);
          return;
        }
      }
      const saved = sessionStorage.getItem("crc-control-key") || "";
      setResolved(true);
      if (!saved || cancelled) return;
      setRole("owner");
      setControlKey(saved);
      await run(saved, identity);
    };
    void start().catch((value) => {
      setError(value instanceof Error ? value.message : "The fit check could not start.");
      setResolved(true);
    });
    return () => { cancelled = true; };
  }, [run]);

  const workspaceStyle = workspace ? {
    "--workspace-primary": workspace.colors.primary,
    "--workspace-deep": workspace.colors.deep,
    "--workspace-accent": workspace.colors.accent,
  } as CSSProperties : undefined;
  const failing = rows.filter((row) => row.fitErrors.length);
  const sorted = [...rows].sort((left, right) => (right.fitErrors.length ? 1 : 0) - (left.fitErrors.length ? 1 : 0));
  const report = JSON.stringify({ frame: "1920x1080", total, checked: rows.length, needsAttention: failing.length, cues: rows }, null, 2);

  return (
    <main className="author-page" style={workspaceStyle}>
      <WorkspaceHeader compact current="/author" title="Fit check" role={role} workspace={workspace} aside={<Link className="header-link" href="/author">Back to library</Link>} />
      <div className={styles.wrap}>
        <p className={styles.notice}><b>Read-only check.</b> Nothing is published or sent to output.</p>
        {resolved && !controlKey && <p className={styles.summary}>Sign in from the Library first. <Link href="/author">Open the Library</Link>, connect there, then return to this page.</p>}
        {error && <p className={styles.error}>{error}</p>}
        {controlKey && <>
          <p className={styles.summary}>
            {busy || !rows.length
              ? "Rendering every published graphic at 1920 × 1080 with the bundled fonts."
              : `${rows.length - failing.length} of ${rows.length} published graphics fit at 1920×1080 with the bundled fonts. ${failing.length} need attention.`}
          </p>
          <p className={styles.progress}>Checked {rows.length} of {total || rows.length}</p>
          <p><button onClick={() => { if (workspace) void run(controlKey, workspace); }} disabled={busy || !workspace}>{busy ? "Checking…" : "Run again"}</button></p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption>Every published cue rendered once with the real renderer and measured at true 1920 &times; 1080 CSS pixels. Graphics needing attention are listed first.</caption>
              <thead>
                <tr>
                  <th scope="col">Graphic</th>
                  <th scope="col">Layout</th>
                  <th scope="col">Flags</th>
                  <th scope="col">Title chars</th>
                  <th scope="col">Main font</th>
                  <th scope="col">Hebrew font</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} className={row.fitErrors.length ? styles.fail : undefined}>
                    <th scope="row">{row.name}</th>
                    <td>{layoutLabel(row.layout)}</td>
                    <td className={styles.flags}>{flagList(row)}</td>
                    <td>{row.titleLength}</td>
                    <td>{row.mainFontSizePx === null ? "—" : `${row.mainFontSizePx}px`}</td>
                    <td>{row.hebrewFontSizePx === null ? "—" : `${row.hebrewFontSizePx}px`}</td>
                    <td>{row.fitErrors.length
                      ? <ul className={styles.errors}>{row.fitErrors.map((item) => <li key={item}>{item}</li>)}</ul>
                      : <span className={styles.ok}>Fits</span>}</td>
                  </tr>
                ))}
                {!sorted.length && <tr><td colSpan={7}>{busy ? "Checking…" : "No published graphics were returned."}</td></tr>}
              </tbody>
            </table>
          </div>
          <details className={styles.report}>
            <summary>JSON report</summary>
            <textarea readOnly value={report} aria-label="Fit check JSON report" spellCheck={false} />
          </details>
        </>}
        <div className={styles.stageRow}>
          <div className={styles.stage}><div ref={outputRef} className={styles.output} /></div>
          <span>Measurement stage &mdash; one 1920 &times; 1080 frame, scaled for display only.</span>
        </div>
      </div>
    </main>
  );
}
