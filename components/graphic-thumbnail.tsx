"use client";
import "./graphic-thumbnail.css";

/** Miniature 1920x1080 frame showing where a graphic sits (Left panel, Right panel, Lower third).
 *  Shared by the library cards and the console status block. */
export default function GraphicThumbnail({ layout, title, body = "", accent, className = "" }: { layout: string; title: string; body?: string; accent?: string; className?: string }) {
  return <span className={`mini-frame ${layout} ${className}`.trim()} aria-hidden="true"><span className="mini-graphic-content">{accent && <i>{accent}</i>}<b>{title}</b>{body && <small>{body}</small>}</span></span>;
}
