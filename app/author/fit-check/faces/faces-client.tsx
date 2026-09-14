"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import { overlayAssetUrl, waitForRenderedOverlayAssets } from "@/lib/overlay-assets";
import type { AccessRole } from "@/lib/access";
import { fetchAccessUser } from "@/lib/access-client";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import SignInCard from "@/components/sign-in-card";
import { layoutLabel } from "@/lib/layout-label";
import { findFitErrors } from "../../preview";
import "../../author.css";
import styles from "./faces.module.css";

// This page is the T3 counterpart to ../fit-check-client.tsx: same identity/catalog
// resolution, but it renders every visible graphic twice — once with the production
// faces, once with the trial "book faces" pairing (WORKSPACE_BOOK_FACES) — so a human
// can eyeball the difference. It also serves a query mode
// (?cue=<id>&faces=default|book&frame=1920|480) that renders a single bare stage and
// stamps data-ready="1" once it has settled; scripts/t3-stills.mjs screenshots that mode.
// Read-only: no write operation and no /api/command call anywhere in this file.

type Faces = "default" | "book";
type FrameWidth = 1920 | 480;

type FitResult = { fitErrors: string[]; titlePx: number | null; hebrewPx: number | null };

type QueryMode = { cueId: string; faces: Faces; frame: FrameWidth } | null;

const fontSizeOf = (root: HTMLElement, selector: string) => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) return null;
  const value = parseFloat(getComputedStyle(element).fontSize);
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
};

/** One Player instance rendering one (cue, faces) pairing at a given frame size. */
function Stage({
  cue,
  workspace,
  faces,
  frame,
  bare,
  onSettled,
}: {
  cue: Cue;
  workspace: PublicWorkspace;
  faces: Faces;
  frame: FrameWidth;
  bare?: boolean;
  onSettled?: (result: FitResult) => void;
}) {
  const canvas = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [fit, setFit] = useState<FitResult>({ fitErrors: [], titlePx: null, hebrewPx: null });
  const heightPx = frame === 480 ? 270 : 1080;
  const scale = frame === 480 ? 0.25 : 1;

  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    setReady(false);
    let cancelled = false;
    const branding = overlayBrandingFromWorkspace(workspace);
    const player = new Player(root, [cue], branding, { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
    void (async () => {
      const box = player.render(cue, overlayAssetUrl(cue, "preview"));
      let fitErrors: string[];
      try {
        await waitForRenderedOverlayAssets(root, undefined, faces);
        if (box instanceof HTMLElement) player.applyFit(box, cue);
        fitErrors = findFitErrors(root);
      } catch {
        fitErrors = ["Fonts or artwork did not load in time."];
      }
      if (cancelled) return;
      const result: FitResult = {
        fitErrors,
        titlePx: fontSizeOf(root, ".overlay .title"),
        hebrewPx: fontSizeOf(root, ".overlay .hebrew, .overlay .row-hebrew"),
      };
      setFit(result);
      setReady(true);
      onSettled?.(result);
    })();
    return () => {
      cancelled = true;
      player.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue, workspace, faces, frame]);

  const stageClass = `${bare ? styles.bareStage : styles.stage}${faces === "book" ? " faces-book" : ""}`;
  return (
    <div className={bare ? undefined : styles.column}>
      <div
        className={stageClass}
        style={{ width: frame, height: heightPx }}
        data-ready={ready ? "1" : undefined}
        data-fit={ready ? (fit.fitErrors.length ? "fail" : "ok") : undefined}
      >
        <div
          className={bare ? styles.bareOutput : styles.output}
          ref={canvas}
          style={{ width: 1920, height: 1080, transform: `scale(${scale})` }}
        />
      </div>
      {!bare && (
        <div className={styles.meta}>
          <span className={styles.columnLabel}>{faces === "book" ? "Book faces" : "Default"}</span>
          <span>{fit.titlePx === null ? "—" : `Title ${fit.titlePx}px`}</span>
          <span>{fit.hebrewPx === null ? "—" : `Hebrew ${fit.hebrewPx}px`}</span>
          {!ready ? (
            <span>Rendering…</span>
          ) : fit.fitErrors.length ? (
            <ul className={styles.errors}>
              {fit.fitErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <span className={styles.ok}>Fits</span>
          )}
        </div>
      )}
    </div>
  );
}

function CompareRow({
  cue,
  workspace,
  onTally,
}: {
  cue: Cue;
  workspace: PublicWorkspace;
  onTally: (id: string, faces: Faces, fits: boolean) => void;
}) {
  return (
    <article className={styles.row}>
      <p className={styles.rowHead}>
        {cue.name}
        <small>{layoutLabel(cue.layout)}</small>
      </p>
      <Stage
        cue={cue}
        workspace={workspace}
        faces="default"
        frame={480}
        onSettled={(result) => onTally(cue.id, "default", result.fitErrors.length === 0)}
      />
      <Stage
        cue={cue}
        workspace={workspace}
        faces="book"
        frame={480}
        onSettled={(result) => onTally(cue.id, "book", result.fitErrors.length === 0)}
      />
    </article>
  );
}

function parseQuery(): { mode: QueryMode; requested: boolean } {
  const search = new URLSearchParams(location.search);
  const cueId = search.get("cue");
  if (!cueId) return { mode: null, requested: false };
  const faces: Faces = search.get("faces") === "book" ? "book" : "default";
  const frame: FrameWidth = search.get("frame") === "480" ? 480 : 1920;
  return { mode: { cueId, faces, frame }, requested: true };
}

export default function FacesClient() {
  const runningRef = useRef(false);
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [controlKey, setControlKey] = useState("");
  const [resolved, setResolved] = useState(false);
  const [query, setQuery] = useState<{ mode: QueryMode; requested: boolean }>({ mode: null, requested: false });
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [error, setError] = useState("");
  const [tally, setTally] = useState<Record<string, Partial<Record<Faces, boolean>>>>({});

  const onTally = useCallback((id: string, faces: Faces, fits: boolean) => {
    setTally((current) => ({ ...current, [id]: { ...current[id], [faces]: fits } }));
  }, []);

  useEffect(() => {
    // Query-mode detection reads location.search once on mount, before workspace/catalog
    // resolve — same intentional local-state-from-effect pattern as app/console.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(parseQuery());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const identityResponse = await fetch("/api/workspace", { cache: "no-store" });
      if (!identityResponse.ok) throw Error("Workspace identity is unavailable.");
      const identity = (await identityResponse.json()) as PublicWorkspace;
      overlayBrandingFromWorkspace(identity);
      if (cancelled) return;
      setWorkspace(identity);
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
      setError(value instanceof Error ? value.message : "The compare page could not start.");
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!controlKey || !workspace || runningRef.current) return;
    runningRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/catalog", {
          cache: "no-store",
          headers: controlKey === "session" ? {} : { Authorization: `Bearer ${controlKey}` },
        });
        if (!response.ok) throw Error(response.status === 401 ? "The catalog rejected this session." : "The published catalog is unavailable.");
        const all = (await response.json()) as Cue[];
        if (cancelled) return;
        setCues(all.filter((cue) => !cue.hidden && !cue.aliasOf));
      } catch (value) {
        if (!cancelled) setError(value instanceof Error ? value.message : "The compare page could not load the catalog.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [controlKey, workspace]);

  // Query mode: one bare stage, no header, no chrome — the only thing scripts/t3-stills.mjs reads.
  if (query.requested) {
    const mode = query.mode;
    if (!mode) return null;
    if (!workspace || !cues) return null;
    const cue = cues.find((item) => item.id === mode.cueId);
    if (!cue) return <p data-error="not-found">Graphic {mode.cueId} was not found in the published, visible catalog.</p>;
    return <Stage cue={cue} workspace={workspace} faces={mode.faces} frame={mode.frame} bare />;
  }

  const workspaceStyle = workspace
    ? ({
        "--workspace-primary": workspace.colors.primary,
        "--workspace-deep": workspace.colors.deep,
        "--workspace-accent": workspace.colors.accent,
      } as CSSProperties)
    : undefined;
  const ids = cues?.map((cue) => cue.id) ?? [];
  const defaultFit = ids.filter((id) => tally[id]?.default).length;
  const bookFit = ids.filter((id) => tally[id]?.book).length;

  return (
    <main className="author-page" style={workspaceStyle}>
      <WorkspaceHeader
        current="/author/fit-check/faces"
        title="Fit check — book faces"
        role={role}
        workspace={workspace}
        aside={
          <Link className="header-link" href="/author/fit-check">
            Back to fit check
          </Link>
        }
      />
      <div className={styles.wrap}>
        <p className={styles.notice}>
          <b>Read-only comparison.</b> Nothing is published or sent to output.
        </p>
        {resolved && !controlKey && (
          <SignInCard description="Comparing the book faces trial pairing renders this congregation's published graphics, so it needs an account with editor access." />
        )}
        {error && <p className={styles.error}>{error}</p>}
        {controlKey && cues && (
          <>
            <p className={styles.summary}>
              Default: {defaultFit} fit · Book faces: {bookFit} fit (of {cues.length} published, visible graphics)
            </p>
            <div className={styles.board}>
              {cues.map((cue) => (
                <CompareRow key={cue.id} cue={cue} workspace={workspace!} onTally={onTally} />
              ))}
            </div>
          </>
        )}
        {controlKey && !cues && !error && <p className={styles.summary}>Loading the published catalog…</p>}
      </div>
    </main>
  );
}
