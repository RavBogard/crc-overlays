"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, BookOpenText, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, Copy, FilePlus2, History, LibraryBig, LoaderCircle, Maximize2, MoreHorizontal, PencilLine, Play, Redo2, RefreshCw, RotateCcw, Save, Search, Sparkles, Square, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Cue } from "@/lib/player";
import type { AccessRole } from "@/lib/access";
import type { PublicWorkspace } from "@/lib/workspace";
import { layoutLabel } from "@/lib/layout-label";
import { publishedVisibleCount } from "@/lib/catalog-count";
import GraphicThumbnail from "@/components/graphic-thumbnail";
import { BulkPublish } from "./bulk-publish";
import { EditorCard } from "./editor-card";
import { auditDraftSet, draftReadableText, draftThumbnailCopy, libraryEmptyMessage, type RecoveryCopy } from "./editor-state";
import { formatTime, itemName, variantCandidates, variantKey, type DraftSetReview, type LibraryItem, type LibraryTab, type VariantCandidate } from "./library-model";
import type { SharedShelfCard } from "./shared-shelf";
import type { SourceReviewSummary } from "./source-review";
import type { Draft, DraftForm, PublishedRevision, VariantChannel } from "./types";

/* W2B §5.6 - the seventeen presentational components that closed `page.tsx`, moved verbatim. They
   hold no state the editor depends on; every one of them is driven entirely by its props. */

export function AccessCard({ productName, style, error }: { productName: string; style?: CSSProperties; error: string }) {
  return <main className="author-page access-page" style={style}><div className="access-card"><div className="brand-mark"><BookOpenText size={22} /></div><span className="eyebrow">{productName}</span><h1>Open the library</h1><p>Sign in to edit graphics.</p><Link className="access-link" href="/access">Sign in</Link>{error && <p role="alert" className="inline-error">{error}</p>}</div></main>;
}

export function LibrarySidebar(props: {
  publishedItems: LibraryItem[]; draftItems: LibraryItem[]; archivedItems: LibraryItem[]; visibleLibrary: LibraryItem[];
  allDrafts: Draft[];
  apiKey: string; workspace: PublicWorkspace | null; refreshAfterPublish: () => Promise<void>;
  libraryTab: LibraryTab; setLibraryTab: (tab: LibraryTab) => void; libraryQuery: string; setLibraryQuery: (query: string) => void;
  sharedEnabled: boolean; sharedLabel: string; sharedItems: SharedShelfCard[]; sharedBadge: number; sharedSelectedId: string | null; selectShared: (id: string) => void;
  activeDraftId: string | null; beginSiddur: () => void; beginCustom: () => void;
  openItem: (item: LibraryItem) => void; duplicateItem: (item: LibraryItem) => void; archiveItem: (item: LibraryItem) => void; restoreItem: (item: Draft) => void;
  role: AccessRole | undefined;
  sourceItems: SourceReviewSummary[]; sourceCount: number; sourceSelectedId: string | null;
  openSourceReview: (id: string) => void; checkSources: () => void; checkingSources: boolean;
}) {
  const tabCount = 3 + (props.sharedEnabled ? 1 : 0);
  // U5 - the one "published, visible" number, the same helper the console footer and health use.
  const publishedCount = publishedVisibleCount(props.publishedItems.flatMap((item) => item.kind === "catalog" ? [item.cue] : []));
  const hasQuery = Boolean(props.libraryQuery.trim());
  return <aside className="library-sidebar">
    <div className="create-stack"><button className="siddur-button" onClick={props.beginSiddur}><BookOpenText size={19} /><span><strong>Add from siddur</strong><small>Find a prayer or reading</small></span></button><button className="secondary-create" onClick={props.beginCustom}><FilePlus2 size={17} /> New custom graphic</button></div>
    <div className={`library-tabs tabs-${tabCount}`} role="tablist" aria-label="Library">
      <button role="tab" aria-selected={props.libraryTab === "published"} className={props.libraryTab === "published" ? "active" : ""} onClick={() => props.setLibraryTab("published")}>Published <span title="published, visible">{publishedCount}</span></button>
      <button role="tab" aria-selected={props.libraryTab === "drafts"} className={props.libraryTab === "drafts" ? "active" : ""} onClick={() => props.setLibraryTab("drafts")}>Drafts <span>{props.draftItems.length}</span></button>
      <button role="tab" aria-selected={props.libraryTab === "archived"} className={props.libraryTab === "archived" ? "active" : ""} onClick={() => props.setLibraryTab("archived")}>Archived <span>{props.archivedItems.length}</span></button>
      {props.sharedEnabled && <button role="tab" aria-selected={props.libraryTab === "shared"} className={props.libraryTab === "shared" ? "active" : ""} onClick={() => props.setLibraryTab("shared")}>{props.sharedLabel}{props.sharedBadge > 0 && <span title="new and updated from CRC">{props.sharedBadge}</span>}</button>}
      {/* D3: a filter only while there is something in it. */}
      {props.sourceCount > 0 && <button role="tab" className={`tab-wide ${props.libraryTab === "sources" ? "active" : ""}`} aria-selected={props.libraryTab === "sources"} onClick={() => props.setLibraryTab("sources")}>Source changes <span title="source changes waiting for review">{props.sourceCount}</span></button>}
    </div>
    <div className="library-find">
      <label className="library-search"><Search size={16} /><input aria-label={searchLabel(props.libraryTab)} value={props.libraryQuery} onChange={(event) => props.setLibraryQuery(event.target.value)} placeholder={searchLabel(props.libraryTab)} /></label>
      <RailOverflow items={[{ key: "check-sources", label: "Check sources", icon: props.checkingSources ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />, disabled: props.checkingSources, run: props.checkSources }]} />
    </div>
    <div className="library-list">
      {props.libraryTab === "sources" ? props.sourceItems.map((record) => <article key={record.id} className={`library-card review-card ${props.sourceSelectedId === record.id ? "active" : ""}`}>
        <button className="library-card-main" onClick={() => props.openSourceReview(record.id)}>
          <span className={`review-status ${record.status}`}>{record.status}</span>
          <span><strong>{record.sourceName}</strong><small>{record.comparison === "unavailable" ? "Historical text unavailable" : `${record.changeCount} text change${record.changeCount === 1 ? "" : "s"}`}{record.paginationMayChange ? " · slide breaks may change" : ""}</small><small>{record.affected.draftName}{record.affected.published ? " · currently published" : ""}</small></span>
        </button>
      </article>) : props.libraryTab === "shared" ? props.sharedItems.map((card) => <article key={card.key} className={`library-card shared-card ${card.members.some((entry) => entry.id === props.sharedSelectedId) ? "active" : ""}`}><button className="library-card-main" onClick={() => props.selectShared(card.lead.id)}><GraphicThumbnail layout={card.layout} title={card.title} /><span><strong>{card.title}</strong><small>CRC published · {layoutLabel(card.layout)}</small></span></button></article>) : props.visibleLibrary.map((item) => {
        const id = item.kind === "draft" ? item.draft.id : item.cue.id;
        const active = item.kind === "draft" ? props.activeDraftId === item.draft.id : props.activeDraftId === item.cue.draftId;
        const layout = item.kind === "draft" ? item.draft.layout : item.cue.layout;
        const subtitle = item.kind === "draft" ? item.draft.content.mode === "local-variant" ? `Local variant · version ${item.draft.version}` : item.draft.activeRevision ? `Published · changes in version ${item.draft.version}` : `Draft version ${item.draft.version}` : `${item.cue.origin === "canonical" ? "Siddur" : item.cue.origin === "variant" ? "Local variant" : "Custom"} · ${layoutLabel(layout)}`;
        const authoredDraft = item.kind === "catalog" && item.cue.draftId ? props.allDrafts.find((candidate) => candidate.id === item.cue.draftId) : undefined;
        const copy = item.kind === "draft" ? draftThumbnailCopy(item.draft) : authoredDraft ? draftThumbnailCopy(authoredDraft) : { title: item.cue.title, body: "", accent: undefined };
        if (props.libraryTab === "archived" && item.kind === "draft") return <article key={`archived-${id}`} className="library-card archived-card"><button className="library-card-main" onClick={() => props.restoreItem(item.draft)}><GraphicThumbnail layout={layout} {...copy} /><span><strong>{item.draft.draftSetId ? item.draft.title : itemName(item)}</strong><small>{item.draft.draftSetId ? `${item.draft.setCount || "Multiple"} slides · ` : ""}Archived {formatTime(item.draft.archivedAt)}</small></span></button><button className="icon-button card-action" aria-label={`Restore ${item.draft.draftSetId ? item.draft.title : itemName(item)}`} title="Restore" onClick={() => props.restoreItem(item.draft)}><ArchiveRestore size={14} /></button></article>;
        const archiveDraft = item.kind === "draft" ? item.draft : authoredDraft;
        const canArchive = item.kind === "draft" || Boolean(item.cue.draftId && archiveDraft);
        return <article key={`${item.kind}-${id}`} className={`library-card ${active ? "active" : ""}`}><button className="library-card-main" onClick={() => props.openItem(item)}><GraphicThumbnail layout={layout} {...copy} /><span><strong>{itemName(item)}</strong><small>{subtitle}</small></span></button><span className="card-actions"><button className="icon-button card-action" aria-label={`Duplicate ${itemName(item)}`} title="Duplicate" onClick={() => props.duplicateItem(item)}><Copy size={14} /></button>{canArchive && <button className="icon-button card-action" aria-label={`Archive ${itemName(item)}`} title="Archive" onClick={() => props.archiveItem(item)}><Archive size={14} /></button>}</span></article>;
      })}
      {/* The publish path (2026-09-14, part 2): an import lands its drafts here, and this is
          where the person looking at them can put the whole batch on air in one click. */}
      {props.libraryTab === "drafts" && props.workspace && <BulkPublish apiKey={props.apiKey} drafts={props.allDrafts} workspace={props.workspace} onFinished={props.refreshAfterPublish} />}
      {!(props.libraryTab === "sources" ? props.sourceItems.length : props.libraryTab === "shared" ? props.sharedItems.length : props.visibleLibrary.length) && <div className="library-empty"><LibraryBig size={24} /><p>{props.libraryTab === "sources" ? (hasQuery ? "No source change matches this search." : "No source changes need review.") : libraryEmptyMessage(props.libraryTab, hasQuery)}</p></div>}
    </div>
    {/* Layout pass (handoff #2, D4): prepared services left the top navigation for the library
        rail, where the work it belongs to is. It is preparation, so operators never see it. */}
    {(props.role === "owner" || props.role === "editor") && <nav className="library-elsewhere" aria-label="More library work">
      <Link href="/services">Prepared services</Link>
      <Link href="/author/wording-changes">Wording changes</Link>
      <Link href="/author/publications">Recent publications</Link>
    </nav>}
  </aside>;
}


export function WelcomePanel() {
  return <section className="welcome-panel"><div className="welcome-art"><BookOpenText size={42} /></div><h2>Choose a graphic, or start a new one.</h2><p>Start with an authorized passage from the siddur library, or open a published graphic to edit or duplicate it.</p></section>;
}

export function ArchivedPanel({ drafts, query, busy, restore }: { drafts: Draft[]; query: string; busy: string; restore: (draft: Draft) => void }) {
  const visible = drafts.filter((draft) => draft.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="archived-panel"><header><div><span className="eyebrow">RECOVERABLE LIBRARY</span><h2>Archived graphics</h2><p>Archived drafts stay here until restored. Published Companion cues and live output are unchanged.</p></div><span>{drafts.length} archived</span></header>{visible.length ? <div className="archived-grid">{visible.map((draft) => <article key={draft.id}><GraphicThumbnail layout={draft.layout} {...draftThumbnailCopy(draft)} /><div><strong>{draft.draftSetId ? draft.title : draft.name}</strong><small>{draft.draftSetId ? `${draft.setCount || "Multiple"} slides · ` : ""}Archived {formatTime(draft.archivedAt)}</small><p>{draft.draftSetId ? "Whole prayer set" : draft.title}</p></div><button onClick={() => restore(draft)} disabled={busy === "restore"}><ArchiveRestore size={16} /> Restore {draft.draftSetId ? "set" : "to library"}</button></article>)}</div> : <div className="shared-empty"><Archive size={28} /><h3>{query ? "No archived graphics match this search." : "Nothing is archived."}</h3><p>{query ? "Clear the search to see all archived graphics." : "Graphics you archive can be recovered here."}</p></div>}</section>;
}

export function EditorTitle(props: { form: DraftForm; draft: Draft | null; dirty: boolean; busy: string; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; duplicate: () => void; archive: () => void; createVariant: () => void; history: () => void; setPosition: number; setCount: number; previousSlide: () => void; nextSlide: () => void }) {
  return <div className="editor-titlebar"><div><div className="editor-status-line"><span className={`status-chip ${props.draft?.activeRevision ? "published" : "draft"}`}>{props.draft?.activeRevision ? "Published" : "Draft"}</span>{props.dirty ? <span className="unsaved-dot">Unsaved changes</span> : props.draft ? <span>Saved version {props.draft.version}</span> : <span>New graphic</span>}{props.form.mode === "local-variant" && <span className="variant-chip">Local variant</span>}{props.setCount > 1 && <span className="set-position">Slide {props.setPosition + 1} of {props.setCount}</span>}</div><h2>{props.form.name || (props.form.mode === "custom" ? "New custom graphic" : "Add from siddur")}</h2>{!props.draft?.activeRevision && <p>Publish makes this version available to the operator.</p>}</div><div className="editor-tools">{props.setCount > 1 && <><button onClick={props.previousSlide} disabled={props.setPosition <= 0 || !!props.busy}><ChevronLeft size={16} /> Previous</button><button onClick={props.nextSlide} disabled={props.setPosition >= props.setCount - 1 || !!props.busy}>Next <ChevronRight size={16} /></button></>}<button className="icon-button" onClick={props.undo} disabled={!props.canUndo} title="Undo"><Undo2 size={17} /></button><button className="icon-button" onClick={props.redo} disabled={!props.canRedo} title="Redo"><Redo2 size={17} /></button>{props.draft && <EditorOverflow items={[
    ...(props.setCount <= 1 ? [{ key: "duplicate", label: "Duplicate", icon: <Copy size={16} />, disabled: props.busy === "duplicate", run: props.duplicate }] : []),
    ...(props.draft.content.mode !== "custom" && props.draft.content.mode !== "local-variant" ? [{ key: "variant", label: "Local wording\u2026", icon: <PencilLine size={16} />, disabled: !!props.busy || props.dirty, run: props.createVariant }] : []),
    { key: "history", label: "History", icon: <History size={16} />, disabled: false, run: props.history },
    ...(props.setCount <= 1 ? [{ key: "archive", label: "Archive", icon: <Archive size={16} />, disabled: !!props.busy || props.dirty, run: props.archive }] : []),
  ]} />}</div></div>;
}

const searchLabel = (tab: LibraryTab) => tab === "sources" ? "Search source changes" : `Search ${tab}`;

/* D3: the rail's own overflow. Checking sources is a whole-library action that belongs beside
   the filters, not on a page of its own, and it is rare enough to sit behind the menu. */
function RailOverflow({ items }: { items: Array<{ key: string; label: string; icon: ReactNode; disabled: boolean; run: () => void }> }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="rail-overflow" ref={wrapper}>
    <button className="icon-button" aria-label="More library actions" aria-expanded={open} title="More library actions" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button>
    {open && <div className="editor-overflow-menu" role="menu">
      {items.map((item) => <button key={item.key} role="menuitem" disabled={item.disabled} onClick={() => { setOpen(false); item.run(); }}>{item.icon} {item.label}</button>)}
    </div>}
  </div>;
}

/* C4: Duplicate and Archive are already hover actions on the library cards, and History and
   Local wording are rare. The toolbar keeps undo and redo; everything else is one menu. */
function EditorOverflow({ items }: { items: Array<{ key: string; label: string; icon: ReactNode; disabled: boolean; run: () => void }> }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!items.length) return null;
  return <div className="editor-overflow" ref={wrapper}>
    <button className="icon-button" aria-label="More actions" aria-expanded={open} title="More actions" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button>
    {open && <div className="editor-overflow-menu" role="menu">
      {items.map((item) => <button key={item.key} role="menuitem" disabled={item.disabled} onClick={() => { setOpen(false); item.run(); }}>{item.icon} {item.label}</button>)}
    </div>}
  </div>;
}

export function SlideStrip(props: { drafts: Draft[]; activeId: string | null; dirty: boolean; busy: string; open: (draft: Draft) => void; moveLeft: () => void; moveRight: () => void; duplicate: () => void; reviewAll: () => void }) {
  const activeIndex = props.drafts.findIndex((draft) => draft.id === props.activeId);
  return <section className="slide-strip" aria-label="Prayer slides"><header><div><span className="eyebrow">WHOLE PRAYER</span><strong>{props.drafts[0]?.title}</strong><small>{props.drafts.length} slides · choose a slide to edit</small></div><button onClick={props.reviewAll} disabled={props.dirty || !!props.busy}>{props.busy === "review-set" ? <LoaderCircle className="spin" size={15} /> : <BookOpenText size={15} />} Review whole prayer</button></header><div className="slide-strip-track">{props.drafts.map((draft, index) => <button key={draft.id} className={draft.id === props.activeId ? "active" : ""} onClick={() => props.open(draft)}><span className="slide-number">{index + 1}</span><GraphicThumbnail layout={draft.layout} {...draftThumbnailCopy(draft)} /><span><strong>{draft.name}</strong><small>{draft.activeRevision ? "Published" : "Draft"}</small></span></button>)}</div><footer><span>Slide {activeIndex + 1} of {props.drafts.length}</span><button onClick={props.moveLeft} disabled={props.dirty || !!props.busy || activeIndex <= 0}><ChevronLeft size={15} /> Move earlier</button><button onClick={props.moveRight} disabled={props.dirty || !!props.busy || activeIndex < 0 || activeIndex >= props.drafts.length - 1}>Move later <ChevronRight size={15} /></button><button onClick={props.duplicate} disabled={props.dirty || !!props.busy}><Copy size={15} /> Duplicate slide</button></footer></section>;
}

export function SetOverview(props: { drafts: Draft[]; review: DraftSetReview | null; activeId: string | null; close: () => void; open: (draft: Draft) => void }) {
  const audit = auditDraftSet(props.drafts);
  const complete = props.review?.status === "complete" || (!props.review && audit?.complete);
  return <div className="set-overview-backdrop" role="dialog" aria-modal="true" aria-labelledby="set-overview-title"><section className="set-overview"><header><div><span className="eyebrow">{complete ? "COMPLETE READING" : "SLIDE SET REVIEW"}</span><h3 id="set-overview-title">{props.drafts[0]?.title}</h3><p>Review every word and slide boundary, then open each slide for its broadcast-fit check.</p>{props.review ? <div className={`set-audit ${complete ? "complete" : "attention"}`}><strong>{props.review.message}</strong>{props.review.issues.length > 0 && <span>{props.review.issues.map((issue) => `${issue.kind.replaceAll("-", " ")} (${issue.selections.length})`).join(" · ")}</span>}</div> : audit && <div className={`set-audit ${audit.complete ? "complete" : "attention"}`}><strong>{audit.complete ? `All ${audit.expectedCount} source passages appear once and in source order.` : "This historical set differs from the source sequence available now."}</strong>{!audit.complete && <span>{audit.missingCount ? `${audit.missingCount} missing · ` : ""}{audit.duplicateCount ? `${audit.duplicateCount} duplicated · ` : ""}{audit.unexpectedCount ? `${audit.unexpectedCount} outside the automatic reading · ` : ""}{!audit.sourceOrder ? "Order differs from source" : ""}</span>}</div>}</div><button className="icon-button" aria-label="Close whole-prayer review" onClick={props.close}>×</button></header><div className="set-overview-list">{props.drafts.map((draft, index) => { const copy = draftThumbnailCopy(draft); return <button key={draft.id} className={draft.id === props.activeId ? "active" : ""} onClick={() => props.open(draft)}><span className="overview-number">{index + 1}</span><GraphicThumbnail layout={draft.layout} {...copy} /><span><strong>{draft.name}</strong><small>{draftReadableText(draft) || copy.title}</small><em>{draft.activeRevision ? "Published" : `Draft version ${draft.version}`} · Open for fit review</em></span></button>; })}</div><footer><span>Published and live output stay unchanged while you review.</span><button onClick={props.close}>Done reviewing</button></footer></section></div>;
}

export function RecoveryBanner({ recovery, restore, discard }: { recovery: RecoveryCopy; restore: () => void; discard: () => void }) {
  return <div className="recovery-banner"><RotateCcw size={19} /><div><strong>Unsaved browser changes are available</strong><small>Stored {formatTime(recovery.savedAt)}. They have not replaced the saved draft.</small></div><button onClick={restore}>Restore</button><button className="text-button" onClick={discard}>Discard</button></div>;
}

const channelLabel: Record<VariantChannel, string> = { he: "Hebrew", tr: "Transliteration", en: "English" };

export function VariantEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <EditorCard number={1} title="Local wording" lede="This independent copy records every change beside the exact source wording." className="variant-editor">
    <div className="variant-identity"><PencilLine size={17} /><span><strong>{form.variantLabel}</strong><small>{form.variantReason || "Congregation-specific wording"}</small></span></div>
    <div className="variant-lines">{form.variantOverrides.map((item, index) => <article key={variantKey(item)}><header><span>{channelLabel[item.channel]}</span><small>Source line {index + 1}</small></header><div className="variant-comparison"><div><span>Exact source</span><p lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined}>{item.sourceText}</p></div><label>Local wording<textarea lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined} value={item.localText} maxLength={4000} onChange={(event) => changeForm({ variantOverrides: form.variantOverrides.map((entry, offset) => offset === index ? { ...entry, localText: event.target.value } : entry) })} /></label></div></article>)}</div>
    <div className="variant-provenance"><BookOpenText size={17} /><span><strong>Source remains attached</strong><small>Publishing uses the local wording above and keeps the exact source text in its history.</small></span></div>
  </EditorCard>;
}

export function VariantCreator(props: { draft: Draft; label: string; reason: string; values: Record<string, string>; busy: string; setLabel: (value: string) => void; setReason: (value: string) => void; setValue: (candidate: VariantCandidate, value: string) => void; close: () => void; create: () => void }) {
  const candidates = variantCandidates(props.draft);
  const changed = candidates.filter((item) => (props.values[variantKey(item)] || "").trim() !== item.sourceText).length;
  return <div className="variant-backdrop" role="dialog" aria-modal="true" aria-labelledby="variant-title"><section className="variant-dialog"><header><div><span className="eyebrow">EXPLICIT LOCAL COPY</span><h3 id="variant-title">Create local wording</h3><p>The original source graphic and its exact words remain unchanged.</p></div><button className="icon-button" aria-label="Close local wording editor" onClick={props.close}>×</button></header><div className="variant-dialog-body"><div className="variant-fields"><label>Variant label<input value={props.label} maxLength={80} onChange={(event) => props.setLabel(event.target.value)} placeholder="Example: Our congregation’s responsive reading" /></label><label>Reason <span>optional</span><input value={props.reason} maxLength={500} onChange={(event) => props.setReason(event.target.value)} placeholder="Why this wording is used locally" /></label></div><div className="variant-source-note"><BookOpenText size={17} /><span><strong>{props.draft.name}</strong><small>Each editable line below starts as the exact pinned source text.</small></span></div><div className="variant-candidates">{candidates.map((item) => { const value = props.values[variantKey(item)] ?? item.sourceText; const isChanged = value.trim() !== item.sourceText; return <article key={variantKey(item)} className={isChanged ? "changed" : ""}><header><span>{item.sourceName} · passage {item.blockNumber}</span><em>{channelLabel[item.channel]}</em></header><label><span className="sr-only">Local {channelLabel[item.channel]} wording for passage {item.blockNumber}</span><textarea lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined} value={value} maxLength={4000} onChange={(event) => props.setValue(item, event.target.value)} /></label><footer>{isChanged ? <span><PencilLine size={13} /> Local change</span> : <span>Matches source</span>}<button className="text-button" disabled={!isChanged} onClick={() => props.setValue(item, item.sourceText)}>Reset to source</button></footer></article>; })}</div></div><footer><span>{changed ? `${changed} changed ${changed === 1 ? "line" : "lines"}` : "Change at least one line to continue."}</span><div><button onClick={props.close}>Cancel</button><button className="primary-button" onClick={props.create} disabled={!changed || !props.label.trim() || props.busy === "create-variant"}>{props.busy === "create-variant" ? <LoaderCircle className="spin" size={17} /> : <PencilLine size={17} />} Create independent variant</button></div></footer></section></div>;
}

export function PreviewColumn(props: { setViewport: (node: HTMLDivElement | null) => void; setOutput: (node: HTMLDivElement | null) => void; previewCue: Cue | null; exact: boolean; fitErrors: string[]; warnings: string[]; assetsReady: boolean; previewError?: string; bookFaces: boolean; play: () => void; out: () => void; fullscreen: () => void; statusLabel?: string }) {
  // X4 (1) - the close affordance belongs to the full-screen preview only, so it is not in the
  // page at all otherwise; the stylesheet keeps it hidden as a second guard.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // eslint-disable-next-line react-hooks/refs -- Callback refs expose the two DOM hosts required by the imperative Player renderer; no ref value is read during render.
  return <aside className="preview-column"><div className="preview-heading"><div><span className="eyebrow">PREVIEW</span><h3>Broadcast frame</h3></div><span>1920 × 1080</span></div><div ref={props.setViewport} className={props.previewError ? "preview-viewport stale" : "preview-viewport"}><div className="preview-stage-label">PREVIEW</div>{fullscreen && <button className="preview-fullscreen-close" aria-label="Close full-screen preview" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); }}>× <span>Close preview</span></button>}<div ref={props.setOutput} id="output" className={props.bookFaces ? "author-output faces-book" : "author-output"} />{!props.previewCue && <div className="preview-placeholder"><Sparkles size={26} /><strong>Your graphic will appear here</strong><span>Add content, a title, and a visual template.</span></div>}</div><div className="preview-toolbar"><button onClick={props.play} disabled={!props.previewCue}><Play size={15} /> Play in</button><button onClick={props.out} disabled={!props.previewCue}><Square size={14} /> Play out</button><button onClick={props.fullscreen} disabled={!props.previewCue}><Maximize2 size={14} /> Full screen</button><span>{props.statusLabel || (props.previewCue ? "" : "Waiting for content")}</span></div>{props.previewError ? <div className="preview-readiness problem" role="alert"><CircleAlert size={18} /><div><strong>Preview unavailable</strong><small>{props.previewError}</small><small>The frame shows the last preview that worked. Change the selection to try again.</small></div></div> : <div className={`preview-readiness ${props.fitErrors.length ? "problem" : props.warnings.length ? "caution" : props.assetsReady ? "ready" : "waiting"}`}>{props.fitErrors.length ? <CircleAlert size={18} /> : props.assetsReady ? <Check size={18} /> : <Clock3 size={18} />}<div><strong>{props.fitErrors.length ? "Needs attention" : props.assetsReady ? "Fits this frame" : props.previewCue ? "Preparing preview" : "Waiting for content"}</strong>{props.fitErrors.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.warnings.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.assetsReady && <small>Fonts and artwork loaded. Review readability before publishing.</small>}</div></div>}</aside>;
}

export function PublishDock(props: { dirty: boolean; draft: Draft | null; recoveryStoredAt: number | null; busy: string; ready: boolean; fitBlocked: boolean; publishedVersion: number | null; duplicate: () => void; backToLibrary: () => void; save: () => void; publish: () => void }) {
  // C5: Publish is offered whenever there is a saved version newer than the published one.
  const publishable = Boolean(props.draft) && !props.dirty && (props.draft!.version > (props.draft!.activeDraftVersion ?? 0));
  if (props.publishedVersion !== null)
    return <div className="publish-dock"><div className="save-state published"><Check size={18} /><span><strong>Published · version {props.publishedVersion} · live on next Show</strong><small>Nothing changed on screen. The operator decides when to show it.</small></span></div><div className="publish-actions"><button onClick={props.duplicate} disabled={!!props.busy}><Copy size={17} /> Duplicate</button><button className="review-button" onClick={props.backToLibrary} disabled={!!props.busy}><LibraryBig size={17} /> Back to library</button></div></div>;
  return <div className="publish-dock"><div className="save-state">{props.dirty ? <><CircleAlert size={18} /><span><strong>Unsaved changes</strong><small>{props.recoveryStoredAt ? `Recovery copy stored ${formatTime(props.recoveryStoredAt)}` : "A recovery copy will be stored in this browser."}</small></span></> : <><Check size={18} /><span><strong>{props.draft ? `Saved version ${props.draft.version}` : "Ready to save"}</strong></span></>}</div><div className="publish-actions"><button onClick={props.save} disabled={!props.ready || !!props.busy || (!props.dirty && !!props.draft)}><Save size={17} /> {props.busy === "save" ? "Saving…" : props.draft ? "Save draft" : "Save new draft"}</button>{props.fitBlocked ? <div className="publish-blocked"><button className="publish-button" disabled><CircleAlert size={17} /> Fix fit issues to publish</button><small>Publication is blocked while the preview reports fit problems.</small></div> : <button className="publish-button" onClick={props.publish} disabled={!publishable || !!props.busy}>{props.busy === "publish" ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Publish</button>}</div></div>;
}

export function DuplicateNameDialog(props: { message: string; suggestedName: string; busy: string; cancel: () => void; confirm: () => void }) {
  return <div className="set-overview-backdrop" role="dialog" aria-modal="true" aria-labelledby="duplicate-name-title"><section className="duplicate-name-dialog"><header><div><span className="eyebrow">LIBRARY NAME</span><h3 id="duplicate-name-title">Another graphic uses this name</h3><p>{props.message}</p></div><button className="icon-button" aria-label="Close duplicate name confirmation" onClick={props.cancel}>×</button></header><footer><span>The graphic already on screen is unchanged.</span><div><button onClick={props.cancel}>Cancel</button><button className="primary-button" onClick={props.confirm} disabled={props.busy === "publish"}>{props.busy === "publish" ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Publish as “{props.suggestedName}”</button></div></footer></section></div>;
}

export function HistoryDrawer({ revisions, activeRevision, close, activate }: { revisions: PublishedRevision[]; activeRevision: number | null; close: () => void; activate: (revision: number) => void }) {
  return <div className="history-drawer"><div className="history-header"><div><span className="eyebrow">REVISION HISTORY</span><h3>Published versions</h3></div><button className="icon-button" aria-label="Close history" onClick={close}>×</button></div>{revisions.map((item) => <div className="revision-row" key={item.revision}><span><strong>Revision {item.revision}</strong><small>Draft version {item.draftVersion} · {formatTime(item.createdAt)}</small></span>{activeRevision === item.revision ? <em>Current</em> : <button onClick={() => activate(item.revision)}>Use this version</button>}</div>)}{!revisions.length && <p className="empty">No published revisions yet.</p>}</div>;
}
