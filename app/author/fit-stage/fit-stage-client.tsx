"use client";

import { useEffect, useRef } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import { overlayAssetUrl } from "@/lib/overlay-assets";
import type { PublicWorkspace } from "@/lib/workspace";
import { findFitErrors, findFitWarnings, panelFillRatio, waitForPreviewAssets } from "../preview";
import styles from "./fit-stage.module.css";

// D17 — the inert measurement stage for the server-side fit check.
//
// The overlay CSS (`app/globals.css` and `app/overlay-faces.css`) and the bundled fonts
// arrive with the root layout, so a headless browser that opens this page gets exactly the
// stylesheet, font faces and renderer the editor dock and /author/fit-check use. The page
// itself holds no cue, fetches no catalog, reads no credential and offers no navigation:
// the cue is handed in through `window.__measureCue`, measured, and thrown away.

export type StageMeasurement = { fitErrors: string[]; warnings: string[]; fill: number | null };

declare global {
  interface Window {
    __measureCue?: (cue: Cue) => Promise<StageMeasurement>;
  }
}

export default function FitStageClient({ workspace }: { workspace: PublicWorkspace }) {
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const branding = overlayBrandingFromWorkspace(workspace);
    // The same render/measure sequence app/author/fit-check/fit-check-client.tsx runs, so the
    // server verdict and the editor verdict cannot drift: one Player render, the shared asset
    // wait, applyFit, then findFitErrors / findFitWarnings / panelFillRatio.
    window.__measureCue = async (cue: Cue): Promise<StageMeasurement> => {
      const root = outputRef.current;
      if (!root) return { fitErrors: ["The graphic did not render."], warnings: [], fill: null };
      const player = new Player(root, [cue], branding, { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
      try {
        player.render(cue, overlayAssetUrl(cue, "preview"));
        await waitForPreviewAssets(root);
        const box = root.firstElementChild;
        if (box instanceof HTMLElement) player.applyFit(box, cue);
        return { fitErrors: findFitErrors(root), warnings: findFitWarnings(root), fill: panelFillRatio(root) };
      } catch {
        return { fitErrors: ["Fonts or artwork did not load in time."], warnings: [], fill: null };
      } finally {
        player.dispose();
      }
    };
    return () => { delete window.__measureCue; };
  }, [workspace]);

  return (
    <main className={styles.page}>
      <div ref={outputRef} className={styles.output} data-fit-stage="ready" />
    </main>
  );
}
