import { Player, type Cue } from "@/lib/player";
import { overlayAssetUrl } from "@/lib/overlay-assets";
import type { OverlayBranding } from "@/lib/branding";
import type { ServerFitArtwork, StageMeasurement } from "@/lib/server-fit-contract";
import { findFitErrors, findFitWarnings, panelFillRatio, waitForPreviewAssets } from "./preview";

// D17 — one render/measure sequence, shared by everything that measures a graphic in a browser:
// the inert stage a headless Chromium opens (app/author/fit-stage), and the Library's bulk
// publish run. Written once so a server verdict and a browser verdict cannot drift: one
// Player.render, the shared asset wait, applyFit, then findFitErrors / findFitWarnings /
// panelFillRatio. Nothing here reads a credential or issues a command.

// D-R2/A4 — what this browser could see of the cue's artwork. A headless server browser has no
// author authorization, so artwork usually does not arrive and a `pass` says nothing about it.
// This reports what actually happened rather than leaving it unsaid; it is a label, never a
// gate, because findFitErrors does not evaluate artwork.
export function artworkState(root: HTMLElement, cue: Cue): ServerFitArtwork {
  if (!cue.presentation?.imageAssetId) return "none";
  const image = root.querySelector<HTMLImageElement>("img.logo");
  return image && image.complete && Boolean(image.naturalWidth) && image.getAttribute("src") === overlayAssetUrl(cue, "preview")
    ? "loaded"
    : "not-loaded";
}

export async function measureCue(root: HTMLElement, cue: Cue, branding: OverlayBranding): Promise<StageMeasurement> {
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
}
