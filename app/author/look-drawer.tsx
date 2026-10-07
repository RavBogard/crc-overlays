"use client";

import { Archive, ArchiveRestore, Check, FilePlus2, LoaderCircle, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { layoutLabel } from "@/lib/layout-label";
import { templateLooks, withTextSize, TEXT_SIZE_PRESETS } from "@/lib/template-looks";
import GraphicMiniature, { sampleMiniatureCue } from "@/components/graphic-miniature";
import type { Cue } from "@/lib/player";
import type { PublicWorkspace } from "@/lib/workspace";
import { EditorCard } from "./editor-card";
import { TypographyControls } from "./typography-controls";
import { formRowOrder, LAYER_NAMES, ROW_ORDERS } from "./editor-state";
import type { DraftForm, Layout, TemplateSummary, TextLayer } from "./types";

export type WorkspaceAsset = { id: string; name: string; altText: string; mimeType: string; bytes: number; width: number; height: number; version: number; archived: boolean; published: boolean; privatePreviewUrl: string; publicUrl?: string };

export const densityOptions = [
  { id: "comfortable", label: "Comfortable", value: {} },
  { id: "large", label: "Large print", value: TEXT_SIZE_PRESETS.large.sizes },
  { id: "compact", label: "Compact", value: TEXT_SIZE_PRESETS.compact.sizes },
] as const;

const ALIGNMENT_LABEL = { start: "Logical start", center: "Centered" } as const;

/** The one line the closed card shows: everything the look currently is, in order. */
export function lookSummary(form: DraftForm, densityId: string, artworkName: string | null): string {
  const density = densityOptions.find((option) => option.id === densityId)?.label || "Custom density";
  const alignment = form.presentation.alignment ? ALIGNMENT_LABEL[form.presentation.alignment] : "Template alignment";
  return `${layoutLabel(form.layout)} · ${density} · ${alignment} · ${artworkName || "No artwork"}`;
}

/**
 * X2 - the look is the third card, opened by default when a graphic is opened (C1 of the
 * 2026-09-14 layout pass; it used to be a drawer closed behind an unlabelled marker). Opening or
 * closing it never changes the form, so a new draft opens on its template defaults and an
 * existing one on its own saved values; closed, its one-line summary says what the look is.
 */
export function LookDrawer({ form, templates, selectedDensity, changeForm, workspace, assets, assetError, busy, uploadAsset, setAssetArchived, showArchivedAssets, setShowArchivedAssets, previewCue }: { form: DraftForm; templates: TemplateSummary[]; selectedDensity: string; changeForm: (patch: Partial<DraftForm>) => void; workspace: PublicWorkspace | null; assets: WorkspaceAsset[]; assetError: string; busy: string; uploadAsset: (file: File, name: string, altText: string) => Promise<WorkspaceAsset>; setAssetArchived: (asset: WorkspaceAsset, archived: boolean) => void; showArchivedAssets: boolean; setShowArchivedAssets: (value: boolean) => void; previewCue: Cue | null }) {
  const setPresentation = (patch: Partial<DraftForm["presentation"]>) => changeForm({ presentation: { ...form.presentation, ...patch } });
  const clearField = (field: keyof DraftForm["presentation"]) => { const next = { ...form.presentation }; delete next[field]; changeForm({ presentation: next }); };
  const looks = useMemo(() => templateLooks(templates, form.mode), [form.mode, templates]);
  const artworkName = assets.find((item) => item.id === form.presentation.imageAssetId)?.name || null;
  const faces = workspace?.bookFaces ? "book" as const : "default" as const;
  // A lower third ignores contentRows, so re-targeting the working cue to a tile's layout is safe.
  const tileCue = (layout: Layout): Cue => previewCue ? { ...previewCue, id: `${previewCue.id}-${layout}`, layout } : sampleMiniatureCue(layout);
  return <EditorCard number={3} title="Look" summary={lookSummary(form, selectedDensity, artworkName)} className="look-card">
    <div className="look-drawer-body">
      <div className="look-tiles" role="group" aria-label="Graphic look">{looks.map((look) => <button key={look.layout} type="button" aria-pressed={form.layout === look.layout} className={form.layout === look.layout ? "selected" : ""} onClick={() => changeForm({ layout: look.layout, templateCueId: look.id })}><GraphicMiniature cue={tileCue(look.layout)} workspace={workspace} faces={faces} label={look.label} /><span className="look-tile-label"><strong>{look.label}</strong></span>{form.layout === look.layout && <Check size={15} />}</button>)}</div>
      <div className="appearance-controls"><fieldset><legend>Text density</legend><div>{densityOptions.map((option) => <button key={option.id} type="button" aria-pressed={selectedDensity === option.id} className={selectedDensity === option.id ? "active" : ""} onClick={() => changeForm({ presentation: withTextSize(form.presentation, option.id) })}>{option.label}</button>)}</div></fieldset><fieldset><legend>Alignment</legend><div><button type="button" aria-pressed={!form.presentation.alignment} className={!form.presentation.alignment ? "active" : ""} onClick={() => clearField("alignment")}>Template default</button><button type="button" aria-pressed={form.presentation.alignment === "start"} className={form.presentation.alignment === "start" ? "active" : ""} onClick={() => setPresentation({ alignment: "start" })}>Logical start</button><button type="button" aria-pressed={form.presentation.alignment === "center"} className={form.presentation.alignment === "center" ? "active" : ""} onClick={() => setPresentation({ alignment: "center" })}>Centered</button></div><p className="control-note">Logical start keeps Hebrew reading from the right and Latin text from the left.</p></fieldset><fieldset><legend>Line spacing</legend><div><button type="button" aria-pressed={!form.presentation.lineSpacing} className={!form.presentation.lineSpacing ? "active" : ""} onClick={() => clearField("lineSpacing")}>Template default</button><button type="button" aria-pressed={form.presentation.lineSpacing === "compact"} className={form.presentation.lineSpacing === "compact" ? "active" : ""} onClick={() => setPresentation({ lineSpacing: "compact" })}>Compact</button><button type="button" aria-pressed={form.presentation.lineSpacing === "spacious"} className={form.presentation.lineSpacing === "spacious" ? "active" : ""} onClick={() => setPresentation({ lineSpacing: "spacious" })}>Spacious</button></div></fieldset></div>
      {form.layout === "bottom" && <fieldset className="bottom-arrangement"><legend>Bottom panel arrangement</legend><div>
        <button type="button" aria-pressed={form.presentation.bottomLayout !== "stacked"} onClick={() => setPresentation({ bottomLayout: "columns" })}>Side by side</button>
        <button type="button" aria-pressed={form.presentation.bottomLayout === "stacked"} onClick={() => setPresentation({ bottomLayout: "stacked" })}>Stacked</button>
      </div></fieldset>}
      {form.mode === "local-variant" && form.variantBase?.mode === "bilingual" && <label className="layer-order"><span>Order</span>
        <select aria-label="Layer order, top to bottom" value={formRowOrder(form).join(",")} onChange={(event) => {
          if (form.variantBase?.mode !== "bilingual") return;
          const rowOrder = event.target.value.split(",") as TextLayer[];
          changeForm({ rowOrder, variantBase: { ...form.variantBase, rowOrder }, ...(form.layout === "bottom" ? { presentation: { ...form.presentation, bottomLayout: "stacked" } } : {}) });
        }}>{ROW_ORDERS.map((order) => <option key={order.join(",")} value={order.join(",")}>{order.map((layer) => LAYER_NAMES[layer]).join(" · ")}</option>)}</select>
      </label>}
      <TypographyControls presentation={form.presentation} sidePanel={form.layout === "left" || form.layout === "right"} change={(presentation) => changeForm({ presentation })} />
      <ArtworkPicker workspace={workspace} assets={assets} selectedId={form.presentation.imageAssetId} error={assetError} busy={busy} select={(id) => id ? setPresentation({ imageAssetId: id }) : clearField("imageAssetId")} uploadAsset={uploadAsset} setAssetArchived={setAssetArchived} showArchived={showArchivedAssets} setShowArchived={setShowArchivedAssets} />
      <button type="button" className="reset-appearance" onClick={() => changeForm({ presentation: {} })}><RotateCcw size={15} /> Reset visual settings to template</button>
    </div>
  </EditorCard>;
}

function ArtworkPicker({ workspace, assets, selectedId, error, busy, select, uploadAsset, setAssetArchived, showArchived, setShowArchived }: { workspace: PublicWorkspace | null; assets: WorkspaceAsset[]; selectedId?: string; error: string; busy: string; select: (id?: string) => void; uploadAsset: (file: File, name: string, altText: string) => Promise<WorkspaceAsset>; setAssetArchived: (asset: WorkspaceAsset, archived: boolean) => void; showArchived: boolean; setShowArchived: (value: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null), [name, setName] = useState(""), [altText, setAltText] = useState(""), [uploadError, setUploadError] = useState("");
  // eslint-disable-next-line @next/next/no-img-element -- Asset thumbnails use authenticated, no-store URLs and must not pass through Next's public image optimizer.
  return <div className="artwork-picker"><div className="artwork-heading"><span><strong>Upper-right artwork</strong><small>Replaces the congregation logo only. Images stay inside the approved region.</small></span><button type="button" className="artwork-archived-toggle" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</button></div><div className="artwork-grid"><button className={!selectedId ? "selected" : ""} onClick={() => select()}>{workspace?.logo.src ? <img src={workspace.logo.src} alt="" /> : <span className="artwork-placeholder" />}<span><strong>Congregation logo</strong><small>Template default</small></span>{!selectedId && <Check size={15} />}</button>{assets.map((asset) => <div key={asset.id} className={`artwork-tile${selectedId === asset.id ? " selected" : ""}${asset.archived ? " archived" : ""}`}><button className="artwork-choice" onClick={() => select(asset.id)} disabled={asset.archived}><img src={asset.privatePreviewUrl} alt="" /><span><strong>{asset.name}</strong><small>{asset.archived ? "Archived · " : ""}{asset.width} × {asset.height} · {Math.ceil(asset.bytes / 1024)} KB</small></span>{selectedId === asset.id && <Check size={15} />}</button><button className="icon-button artwork-action" aria-label={`${asset.archived ? "Restore" : "Archive"} ${asset.name}`} title={asset.archived ? "Restore" : "Archive"} disabled={busy === "archive-asset" || busy === "restore-asset"} onClick={() => setAssetArchived(asset, !asset.archived)}>{asset.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button></div>)}</div>{error && <p className="asset-error">{error}</p>}<details className="asset-upload"><summary>Upload approved artwork</summary><p>PNG, JPEG, or WebP · up to 512 KB and 4096 pixels. Still images only.</p><div className="asset-upload-fields"><label>Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); if (next && !name) setName(next.name.replace(/\.[^.]+$/, "")); }} /></label><label>Name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><label>Accessible description<input value={altText} maxLength={180} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the image itself" /></label><button className="primary-button" disabled={!file || !name.trim() || !altText.trim() || busy === "upload-asset"} onClick={() => { if (!file) return; setUploadError(""); void uploadAsset(file, name, altText).then(() => { setFile(null); setName(""); setAltText(""); }).catch((value) => setUploadError(value instanceof Error ? value.message : "Artwork upload failed.")); }}>{busy === "upload-asset" ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />} Upload and select</button></div>{uploadError && <p className="asset-error">{uploadError}</p>}</details></div>;
}
