"use client";

import { useEffect, useRef } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import { overlayAssetUrl } from "@/lib/overlay-assets";
import type { PublicWorkspace } from "@/lib/workspace";
import { findFitErrors, findFitWarnings, panelFillRatio, waitForPreviewAssets } from "../preview";
import type { ServerFitArtwork, StageMeasurement } from "@/lib/server-fit-contract";
import styles from "./fit-stage.module.css";

// D17 — the inert measurement stage for the server-side fit check.
//
// The overlay CSS (`app/globals.css` and `app/overlay-faces.css`) and the bundled fonts
// arrive with the root layout, so a headless browser that opens this page gets exactly the
// stylesheet, font faces and renderer the editor dock and /author/fit-check use. The page
// itself holds no cue, fetches no catalog, reads no credential and offers no navigation:
// the cue is handed in through `window.__measureCue`, measured, and thrown away.

export type { ServerFitArtwork, StageMeasurement };

// D-R2/A4 — what the server could see of the cue's artwork. The stage loads artwork through
// /api/assets/<id>/preview, which requires author authorization; a headless browser on the
// server has none, so the artwork usually does not arrive and a `pass` says nothing about it.
// This reports what actually happened instead of leaving it unsaid. It is a label, never a
// gate: findFitErrors does not evaluate artwork, so the verdict is unchanged either way.
function artworkState(root: HTMLElement, cue: Cue): ServerFitArtwork {
  if (!cue.presentation?.imageAssetId) return "none";
  const image = root.querySelector<HTMLImageElement>("img.logo");
  return image && image.complete && Boolean(image.naturalWidth) && image.getAttribute("src") === overlayAssetUrl(cue, "preview")
    ? "loaded"
    : "not-loaded";
}

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
      if (!root) return { fitErrors: ["The graphic did not render."], warnings: [], fill: null, artwork: cue.presentation?.imageAssetId ? "not-loaded" : "none" };
      const player = new Player(root, [cue], branding, { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
      try {
        player.render(cue, overlayAssetUrl(cue, "preview"));
        await waitForPreviewAssets(root);
        const box = root.firstElementChild;
        if (box instanceof HTMLElement) player.applyFit(box, cue);
        return { fitErrors: findFitErrors(root), warnings: findFitWarnings(root), fill: panelFillRatio(root), artwork: artworkState(root, cue) };
      } catch {
        return { fitErrors: ["Fonts or artwork did not load in time."], warnings: [], fill: null, artwork: artworkState(root, cue) };
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
