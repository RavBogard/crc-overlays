import { Player, type Cue } from "@/lib/player";
import { stageArtworkUrl } from "@/lib/overlay-assets";
import type { OverlayBranding } from "@/lib/branding";
import type { ServerFitArtwork, StageMeasurement } from "@/lib/server-fit-contract";
import { findFitErrors, findFitWarnings, panelFillRatio, waitForPreviewAssets } from "./preview";

// D17 — one render/measure sequence, shared by everything that measures a graphic in a browser:
// the inert stage a headless Chromium opens (app/author/fit-stage), and the Library's bulk
// publish run. Written once so a server verdict and a browser verdict cannot drift: one
// Player.render, the shared asset wait, applyFit, then findFitErrors / findFitWarnings /
// panelFillRatio. Nothing here reads a credential or issues a command.

// D-R2/A4 — what this browser could see of the cue's artwork. A signed-in editor loads it through
// the private preview route; the server stage, which holds no session, through the signed link it
// was handed (R-B1). This reports what actually happened; it is a label, never a gate, because
// findFitErrors does not evaluate artwork.
export function artworkState(root: HTMLElement, cue: Cue, expectedUrl = stageArtworkUrl(cue)): ServerFitArtwork {
  if (!cue.presentation?.imageAssetId) return "none";
  const image = root.querySelector<HTMLImageElement>("img.logo");
  return image && image.complete && Boolean(image.naturalWidth) && image.getAttribute("src") === expectedUrl
    ? "loaded"
    : "not-loaded";
}

export type PreparedCueMeasurement={measurement:StageMeasurement;dispose:()=>void};
export type CueMeasureOptions={artworkUrl?:string};

/** Render and fit a cue once. The caller owns disposal, which lets the inert fit stage retain
 * this exact DOM only long enough for the same Chromium page to take an opt-in screenshot. */
export async function prepareCueMeasurement(root: HTMLElement, cue: Cue, branding: OverlayBranding, options: CueMeasureOptions = {}): Promise<PreparedCueMeasurement> {
  const artworkUrl = stageArtworkUrl(cue, options.artworkUrl);
  const player = new Player(root, [cue], branding, { resolveAssetUrl: (next) => stageArtworkUrl(next, next.id === cue.id ? options.artworkUrl : undefined) });
  let disposed=false;
  const dispose=()=>{if(!disposed){disposed=true;player.dispose();}};
  try {
    player.render(cue, artworkUrl);
    await waitForPreviewAssets(root);
    const box = root.firstElementChild;
    if (box instanceof HTMLElement) player.applyFit(box, cue);
    return {measurement:{ fitErrors: findFitErrors(root), warnings: findFitWarnings(root), fill: panelFillRatio(root), artwork: artworkState(root, cue, artworkUrl) },dispose};
  } catch {
    return {measurement:{ fitErrors: ["Fonts or artwork did not load in time."], warnings: [], fill: null, artwork: artworkState(root, cue, artworkUrl) },dispose};
  }
}

/** The ordinary editor and fit paths retain the historical measure-then-dispose lifecycle. */
export async function measureCue(root: HTMLElement, cue: Cue, branding: OverlayBranding): Promise<StageMeasurement> {
 const prepared=await prepareCueMeasurement(root,cue,branding);
 try{return prepared.measurement}finally{prepared.dispose()}
}
