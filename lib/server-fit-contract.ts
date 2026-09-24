// R7 / D17 - the contract half of the server-side fit check.
//
// This module is deliberately dependency-free: it imports nothing, and nothing it exports
// needs a browser. lib/server-fit.ts owns the half that drives Chromium - it is the only
// module in the repository allowed to reach `playwright-core` or `@sparticuz/chromium` -
// and everything that only needs to *talk about* a server fit result (lib/authoring.ts,
// and through it /api/authoring, /api/mcp, /api/now, /api/catalog and every other
// entrypoint that touches the authoring service) imports the names from here instead.
//
// The reason is the function trace, not tidiness: a single value import of
// SERVER_RENDERER_PREFIX from lib/server-fit.ts pulled playwright-core - 11.5 MB, plus the
// Chromium pack's .br archives - into the traced bundle of twenty entrypoints, including
// the public credential-free /api/now. lib/authoring.ts now reaches lib/server-fit.ts only
// through the dynamic `import('./server-fit')` inside defaultServerFitRunner, which keeps
// the browser on the one route that actually launches it.

/** `server-chromium/<playwright version>` - the attestation `review_draft` checks for. */
export const SERVER_RENDERER_PREFIX='server-chromium/';

/**
 * D-R2/A4 - what the server could say about the cue's artwork, which is a label and never a
 * gate. A headless browser on the server holds no author session, so since R-B1 the stage is
 * handed a signed read link for the cue's one asset (`StageMeasureOptions.artworkUrl`, minutes
 * long, lib/assets.ts signedAssetReadPath) and loads the artwork through it. The result says
 * what actually happened: `none` (the cue has no `presentation.imageAssetId` and there is
 * nothing to load), `loaded` (the artwork really rendered) or `not-loaded` (it did not - no
 * signing secret configured, or the image failed - and a human should confirm it in the
 * editor). `findFitErrors` never evaluates artwork, so the verdict is unaffected either way.
 */
export type ServerFitArtwork='none'|'loaded'|'not-loaded';

/** What the stage hands back; the shape of `window.__measureCue`'s resolution. */
export type StageMeasurement={fitErrors:string[];warnings:string[];fill:number|null;artwork:ServerFitArtwork};
/** Retaining the stage DOM is opt-in and only lasts until the caller captures its frame.
 * `artworkUrl` is the signed `/api/assets/<id>/signed?...` link for the cue's own asset; the
 * stage ignores one that names any other asset. */
export type StageMeasureOptions={retainRenderedCue?:boolean;artworkUrl?:string;layouts?:StageLayouts};
/**
 * L3 - the data-layout definitions a cue pins (lib/layout-registry.ts ResolvedLayouts, spelled out
 * here so this module still imports nothing). The stage holds no registry of the workspace's own
 * layouts, so a card in one is drawn and measured from exactly the definition handed in.
 */
export type StageLayouts=Record<string,{id:string;version:number;sha256:string;document:{label:string;capabilities:{sets:boolean;translation:boolean;oneBlockPerSlide:boolean};card:unknown;motion:unknown}}>;
/** An ephemeral, server-rendered preview. It is never written to a draft, preview, or revision. */
export type ServerFitPreviewImage={mimeType:'image/jpeg'|'image/png';dataBase64:string;width:number;height:number};
export type ServerFitPreviewImageUnavailable='screenshot_failed'|'screenshot_deadline'|'image_too_large';
export type ServerFitMeasured={verdict:'pass'|'fail';fitErrors:string[];warnings:string[];fill:number|null;artwork:ServerFitArtwork;measuredAt:number;rendererVersion:string;previewImage?:ServerFitPreviewImage|null;previewImageUnavailable?:ServerFitPreviewImageUnavailable};
export type ServerFitUnavailable={verdict:'unavailable';reason:string};
export type ServerFitResult=ServerFitMeasured|ServerFitUnavailable;
