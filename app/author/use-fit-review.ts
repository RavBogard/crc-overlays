"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import type { PublicWorkspace } from "@/lib/workspace";
import { overlayAssetUrl, waitForRenderedOverlayAssets } from "@/lib/overlay-assets";
import { findFitErrors, findFitWarnings } from "./preview";
import type { EphemeralPreviewResult, PreviewResult } from "./types";

/* W2B §5.4 - the preview stage and everything measured off it. The refs travel with `showCue`
   because it is the only thing that renders into them: the stage, the player, the sequence number
   that lets a late render lose to a newer one, and the animation revision. */
export function useFitReview(workspace: PublicWorkspace | null, workingPreview: EphemeralPreviewResult | null, editorKind: string | null) {
  const [exactPreview, setExactPreview] = useState<PreviewResult | null>(null);
  const [fitErrors, setFitErrors] = useState<string[]>([]);
  const [fitWarnings, setFitWarnings] = useState<string[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [assetsReady, setAssetsReady] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const previewSequence = useRef(0);
  const animationRevision = useRef(0);

  const resetReview = useCallback(() => {
    setExactPreview(null);
    setFitErrors([]);
    setFitWarnings([]);
    setPreviewWarnings([]);
    setAssetsReady(false);
  }, []);

  const showCue = useCallback(async (cue: Cue, animate = false) => {
    const root = outputRef.current;
    if (!root || !workspace) return;
    const current = ++previewSequence.current;
    playerRef.current?.dispose();
    const player = new Player(root, [cue], overlayBrandingFromWorkspace(workspace), { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
    playerRef.current = player;
    setAssetsReady(false);
    setFitErrors([]);
    setFitWarnings([]);
    if (animate) player.set({ cue: cue.id, revision: ++animationRevision.current, mode: "animate" });
    else player.render(cue, overlayAssetUrl(cue, "preview"));
    // T3 - the book-face stage waits on the book faces, so the fit measured here is the one that ships.
    await waitForRenderedOverlayAssets(root, undefined, workspace.bookFaces ? "book" : "default");
    if (current !== previewSequence.current) return;
    if (!animate) {
      const box = root.firstElementChild;
      if (box instanceof HTMLElement) player.applyFit(box, cue);
    }
    setAssetsReady(true);
    setFitErrors(findFitErrors(root));
    setFitWarnings(findFitWarnings(root));
  }, [workspace]);

  // Leaving the editor drops the player and empties the stage, and burns a sequence number so a
  // render already in flight cannot paint into the cleared frame.
  const clearStage = useCallback(() => {
    previewSequence.current += 1;
    playerRef.current?.dispose();
    playerRef.current = null;
    outputRef.current?.replaceChildren();
  }, []);

  const playOut = useCallback(() => {
    playerRef.current?.set({ cue: null, revision: ++animationRevision.current, mode: "animate" });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const output = outputRef.current;
    if (!viewport || !output) return;
    const resize = () => {
      const scale = Math.min(viewport.clientWidth / 1920, viewport.clientHeight / 1080);
      output.style.transform = `scale(${scale})`;
      output.style.left = `${(viewport.clientWidth - 1920 * scale) / 2}px`;
      output.style.top = `${(viewport.clientHeight - 1080 * scale) / 2}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [workingPreview, exactPreview, editorKind]);

  useEffect(() => () => playerRef.current?.dispose(), []);

  return {
    exactPreview, setExactPreview, fitErrors, fitWarnings, previewWarnings, setPreviewWarnings, assetsReady,
    viewportRef, outputRef, previewSequence, resetReview, showCue, clearStage, playOut,
  };
}
