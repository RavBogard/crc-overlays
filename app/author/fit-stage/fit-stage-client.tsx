"use client";

import { useEffect, useRef } from "react";
import type { Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import type { PublicWorkspace } from "@/lib/workspace";
import type { ServerFitArtwork, StageMeasurement } from "@/lib/server-fit-contract";
import { measureCue } from "../measure-cue";
import styles from "./fit-stage.module.css";

// D17 — the inert measurement stage for the server-side fit check.
//
// The overlay CSS (`app/globals.css` and `app/overlay-faces.css`) and the bundled fonts
// arrive with the root layout, so a headless browser that opens this page gets exactly the
// stylesheet, font faces and renderer the editor dock and /author/fit-check use. The page
// itself holds no cue, fetches no catalog, reads no credential and offers no navigation:
// the cue is handed in through `window.__measureCue`, measured, and thrown away.

export type { ServerFitArtwork, StageMeasurement };

declare global {
  interface Window {
    __measureCue?: (cue: Cue) => Promise<StageMeasurement>;
  }
}

export default function FitStageClient({ workspace }: { workspace: PublicWorkspace }) {
  const outputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const branding = overlayBrandingFromWorkspace(workspace);
    // measureCue is the shared sequence (app/author/measure-cue.ts): the server verdict, the
    // editor verdict and the Library's bulk run all come from the same lines.
    window.__measureCue = async (cue: Cue): Promise<StageMeasurement> => {
      const root = outputRef.current;
      if (!root) return { fitErrors: ["The graphic did not render."], warnings: [], fill: null, artwork: cue.presentation?.imageAssetId ? "not-loaded" : "none" };
      return measureCue(root, cue, branding);
    };
    return () => { delete window.__measureCue; };
  }, [workspace]);

  return (
    <main className={styles.page}>
      <div ref={outputRef} className={styles.output} data-fit-stage="ready" />
    </main>
  );
}
