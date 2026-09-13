"use client";

import { useEffect, useRef } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import { overlayAssetUrl, waitForRenderedOverlayAssets } from "@/lib/overlay-assets";
import type { PublicWorkspace } from "@/lib/workspace";
import "./graphic-miniature.css";

const FRAME_WIDTH = 1920;

/** The stand-in a tile shows before there is anything to preview. Real type, real safe areas. */
export function sampleMiniatureCue(layout: string): Cue {
  return {
    id: `sample-${layout}`,
    name: "Sample",
    layout,
    texts: {
      textTitle: "Prayer title",
      textMainheb: "בָּרְכוּ אֶת יְיָ הַמְבֹרָךְ",
      textMainEng: "Bar’chu et Adonai hamvorach",
    },
    animations: [],
    duration: {},
  };
}

/**
 * X2b - a real render of the graphic at tile size, not a CSS sketch. Same technique as the
 * console's Inspect preview: a full 1920 x 1080 canvas the Player lays out normally, scaled
 * down by a transform so every measurement the fitter makes is the broadcast one.
 */
export default function GraphicMiniature({ cue, workspace, faces = "default", label }: { cue: Cue | null; workspace: PublicWorkspace | null; faces?: "default" | "book"; label?: string }) {
  const frame = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const resize = () => { if (frame.current && canvas.current) canvas.current.style.transform = `scale(${frame.current.clientWidth / FRAME_WIDTH})`; };
    resize();
    const observer = new ResizeObserver(resize);
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    if (!workspace || !cue) { root.replaceChildren(); return; }
    let live = true;
    const player = new Player(root, [cue], overlayBrandingFromWorkspace(workspace), { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
    const box = player.render(cue, overlayAssetUrl(cue, "preview"));
    void waitForRenderedOverlayAssets(root, undefined, faces)
      .then(() => { if (live) player.applyFit(box, cue); })
      .catch(() => {});
    return () => { live = false; player.dispose(); };
  }, [cue, faces, workspace]);

  return <span ref={frame} className={`graphic-miniature ${cue?.layout || "bottom"}`} role="img" aria-label={label || "Graphic preview"}><span className="graphic-miniature-stage"><div ref={canvas} className="graphic-miniature-canvas" /></span></span>;
}
