"use client";

import { useEffect, useRef } from "react";
import type { Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import type { PublicWorkspace } from "@/lib/workspace";
import type { ServerFitArtwork, StageMeasurement, StageMeasureOptions } from "@/lib/server-fit-contract";
import type { ResolvedLayouts } from "@/lib/layout-registry";
import { prepareCueMeasurement } from "../measure-cue";
import styles from "./fit-stage.module.css";

// D17 — the inert measurement stage for the server-side fit check.
//
// The overlay CSS (`app/globals.css` and `app/overlay-faces.css`) and the bundled fonts
// arrive with the root layout, so a headless browser that opens this page gets exactly the
// stylesheet, font faces and renderer the editor dock and /author/fit-check use. The page
// itself holds no cue, fetches no catalog, reads no credential and offers no navigation:
// the cue is handed in through `window.__measureCue`, measured, and thrown away. With it may
// come a signed read link for the cue's own artwork, which is the stage's only way to load it.

export type { ServerFitArtwork, StageMeasurement, StageMeasureOptions };

declare global {
  interface Window {
    __measureCue?: (cue: Cue, options?: StageMeasureOptions) => Promise<StageMeasurement>;
    __disposeMeasuredCue?: () => void;
  }
}

export default function FitStageClient({ workspace }: { workspace: PublicWorkspace }) {
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const branding = overlayBrandingFromWorkspace(workspace);
    let dispose: (() => void) | undefined;
    // measureCue is the shared sequence (app/author/measure-cue.ts): the server verdict, the
    // editor verdict and the Library's bulk run all come from the same lines.
    window.__measureCue = async (cue: Cue, options: StageMeasureOptions = {}): Promise<StageMeasurement> => {
      dispose?.();dispose=undefined;
      const root = outputRef.current;
      if (!root) return { fitErrors: ["The graphic did not render."], warnings: [], fill: null, artwork: cue.presentation?.imageAssetId ? "not-loaded" : "none" };
      // The only credential this page ever sees: a signed, minutes-long read link for this cue's
      // one asset (R-B1), handed in with the cue and dropped with it.
      const prepared = await prepareCueMeasurement(root, cue, branding, { artworkUrl: options.artworkUrl, layouts: options.layouts as ResolvedLayouts | undefined });
      if (options.retainRenderedCue) dispose = prepared.dispose;
      else prepared.dispose();
      return prepared.measurement;
    };
    window.__disposeMeasuredCue = () => { dispose?.();dispose=undefined; };
    return () => { dispose?.();delete window.__measureCue;delete window.__disposeMeasuredCue; };
  }, [workspace]);

  return (
    <main className={styles.page}>
      <div ref={outputRef} className={styles.output} data-fit-stage="ready" />
    </main>
  );
}
