"use client";

import { useEffect, useState } from "react";
import { BookOpenText, ChevronLeft, ChevronRight, FilePlus2, LoaderCircle, Search } from "lucide-react";
import { fetchBookUnits, groupUnits, hasHebrew, visibleUnits } from "@/lib/siddur-shelf";
import { blocksForMode, sourceDisplayCopy, sourceHeadline } from "./editor-state";
import type {
  BookUnit,
  BookUnitsResult,
  CanonicalContentMode,
  DraftForm,
  Source,
  SourceEnglishRole,
  SourceFacet,
  SourceSummary,
} from "./types";
import "./siddur-editor.css";

const SHOW_NOTES_LABEL = "Show instructions and notes";

/** `selectSource` chooses a mode from the canonical kinds; a paired translation is not one. */
function canonicalKinds(kinds: BookUnit["kinds"]): CanonicalContentMode[] {
  return kinds.filter((kind): kind is CanonicalContentMode => kind !== "translation-en");
}

const englishRoleLabel: Record<SourceEnglishRole, string> = {
  translation: "Translation",
  interpretation: "Interpretation",
  "translation-interpretation": "Translation / interpretation",
  reading: "Reading",
  kavannah: "Kavannah",
  rubric: "Service direction",
  note: "Source note",
  unclassified: "English text",
};

export type SiddurEditorProps = {
  query: string; setQuery: (value: string) => void; results: SourceSummary[]; source: Source | null; form: DraftForm;
  truncated: boolean;
  books: SourceFacet[]; services: SourceFacet[]; bookFilter: string; serviceFilter: string;
  setBookFilter: (value: string) => void; setServiceFilter: (value: string) => void; search: () => void;
  selectSource: (item: Pick<SourceSummary, "id" | "name" | "kinds">) => void; clearSource: () => void; eligibleBlocks: Source["blocks"];
  selectedIds: Set<string>; activeGroup: number; setActiveGroup: (index: number) => void;
  chooseWholePrayer: () => void; toggleBlock: (id: string, checked: boolean) => void; addPanel: () => void; removePanel: () => void;
  makeSlidesFromWholePrayer: () => void;
  changeMode: (mode: CanonicalContentMode) => void; changeForm: (patch: Partial<DraftForm>) => void; busy: string;
  controlKey: string;
  /** X2: the Panels row is shown only when the selection needs more than one panel (or already has one). Default true. */
  showPanels?: boolean;
};

export function SiddurEditor(props: SiddurEditorProps) {
  /** Off by default: a siddur's instructions and notes are not what a leader puts on screen. */
  const [showNotes, setShowNotes] = useState(false);
  /** A search only takes over from the shelf once it has actually been run. */
  const [searchedQuery, setSearchedQuery] = useState("");
  const searching = searchedQuery !== "" && props.query.trim() !== "";
  function runSearch() {
    setSearchedQuery(props.query.trim());
    props.search();
  }
  const hidesNotes = props.form.mode === "source-en" && !showNotes;
  const visibleBlocks = hidesNotes ? props.eligibleBlocks.filter((block) => !block.noteLike) : props.eligibleBlocks;
  const noteLikeBlocks = props.form.mode === "source-en"
    ? props.eligibleBlocks.filter((block) => block.noteLike).length
    : 0;
  const omittedFromAutomatic = props.form.mode === "source-en"
    ? visibleBlocks.filter((block) => block.automatic === false).length
    : 0;
  return <section className="form-section siddur-section"><div className="section-heading"><span>1</span><div><h3>Choose from the siddur</h3><p>Search by prayer, Hebrew, common spelling, or opening words.</p></div></div>
    <div className="siddur-search-row"><label className="source-search"><span className="sr-only">Search siddur library</span><Search size={17} /><input aria-label="Search siddur library" value={props.query} onChange={(event) => props.setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); runSearch(); } }} placeholder="Search prayers and readings" /></label><button onClick={runSearch} disabled={props.busy === "search"}>{props.busy === "search" ? <LoaderCircle className="spin" size={17} /> : "Search"}</button></div>
    {(props.books.length > 0 || props.services.length > 0) && <div className="source-filters"><label>Book<select value={props.bookFilter} onChange={(event) => props.setBookFilter(event.target.value)}><option value="">All books</option>{props.books.map((book) => <option key={book.value} value={book.value}>{book.label} ({book.count})</option>)}</select></label><label>Service<select value={props.serviceFilter} onChange={(event) => props.setServiceFilter(event.target.value)}><option value="">All services</option>{props.services.map((service) => <option key={service.value} value={service.value}>{service.label} ({service.count})</option>)}</select></label></div>}
    {!props.source ? (!searching ? <SiddurShelf books={props.books} bookFilter={props.bookFilter} setBookFilter={props.setBookFilter} controlKey={props.controlKey} selectSource={props.selectSource} showNotes={showNotes} setShowNotes={setShowNotes} /> : <div className="source-results">{props.truncated &&<p className="results-note">Showing the first {props.results.length}. Choose a book or service, or search to narrow the list.</p>}{props.results.map((item) => { const display = sourceDisplayCopy(item); return <button key={item.id} onClick={() => props.selectSource(item)}><span className="source-book"><BookOpenText size={18} /></span><span><strong>{item.name}</strong><small>{sourceHeadline(display)}</small>{display.sectionTitle && <small className="source-section">{display.sectionTitle}</small>}{item.openingWords?.[0] && <em>{item.openingWords[0]}</em>}</span><ChevronRight size={17} /></button>; })}{!props.results.length && <div className="source-empty"><BookOpenText size={24} /><p>Nothing matched that search. Clear it to browse the shelf.</p></div>}</div>) : <div className="passage-picker">
      <div className="passage-header"><button className="icon-button" title="Back to results" onClick={props.clearSource}><ChevronLeft size={17} /></button><div><small>{sourceHeadline(sourceDisplayCopy(props.source))}</small><h4>{props.source.name}</h4></div><div className="whole-prayer-actions"><button onClick={props.chooseWholePrayer}>Select all</button><button className="primary-button" onClick={props.makeSlidesFromWholePrayer} disabled={props.busy === "make-set"}>{props.busy === "make-set" ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />} Add all as slides</button></div></div>
      <SourceProvenance source={props.source} />
      <div className="content-mode-toggle">{props.source.blocks.some((block) => block.kind === "bilingual") && <button className={props.form.mode === "bilingual" ? "active" : ""} onClick={() => props.changeMode("bilingual")}>Hebrew + transliteration</button>}{blocksForMode(props.source, "source-en").length > 0 && <button className={props.form.mode === "source-en" ? "active" : ""} onClick={() => props.changeMode("source-en")}>English from siddur</button>}{props.source.blocks.some((block) => block.kind === "original-en") && <button className={props.form.mode === "original-en" ? "active" : ""} onClick={() => props.changeMode("original-en")}>Original English reading</button>}</div>
      {props.source.blocks.some((block) => block.kind === "translation-en") && props.form.mode === "bilingual" && <label className="translation-choice"><input type="checkbox" checked={!!props.form.includeTranslation} onChange={(event) => props.changeForm({ includeTranslation: event.target.checked })} /> Include approved English where available</label>}
      {omittedFromAutomatic > 0 && <p className="source-mode-note">{omittedFromAutomatic} service {omittedFromAutomatic === 1 ? "note is" : "notes are"} available for manual selection below. Automatic slides use the prayer and reading text.</p>}
      {props.showPanels !== false && <div className="panel-tabs">{props.form.groups.map((group, index) => <button key={`${group.sourceId}-${index}`} className={props.activeGroup === index ? "active" : ""} onClick={() => props.setActiveGroup(index)}>Panel {index + 1}<small>{group.blockIds.length} passages</small></button>)}<button onClick={props.addPanel}>+ Add panel</button></div>}
      {noteLikeBlocks > 0 && <label className="shelf-toggle"><input type="checkbox" checked={showNotes} onChange={(event) => setShowNotes(event.target.checked)} /> {SHOW_NOTES_LABEL}</label>}
      <div className="passage-list">{visibleBlocks.map((block) => <label key={block.id} className={props.selectedIds.has(block.id) ? "selected" : ""}><input type="checkbox" checked={props.selectedIds.has(block.id)} onChange={(event) => props.toggleBlock(block.id, event.target.checked)} /><span className="passage-number">{block.index + 1}</span><span>{props.form.mode === "bilingual" ? <><b lang="he" dir="rtl">{block.he}</b><small>{block.tr}</small></> : <><b>{block.en}</b>{props.form.mode === "source-en" && <small className="passage-meta">{englishRoleLabel[block.englishRole || "unclassified"]}{block.automatic === false ? " · manual selection" : ""}</small>}</>}</span></label>)}</div>
      {props.showPanels !== false && props.form.groups.length > 1 && <button className="remove-panel" onClick={props.removePanel}>Remove panel {props.activeGroup + 1}</button>}
    </div>}
  </section>;
}

type SiddurShelfProps = {
  books: SourceFacet[];
  /** The shelf's open book and the Book select are the same choice, so one follows the other. */
  bookFilter: string;
  setBookFilter: (value: string) => void;
  controlKey: string;
  selectSource: (item: Pick<SourceSummary, "id" | "name" | "kinds">) => void;
  showNotes: boolean;
  setShowNotes: (value: boolean) => void;
};

/**
 * I3 - the library as a shelf: the twelve books, then the sections one book prints, then the
 * units inside them. A unit opens exactly the way a search result does.
 */
function SiddurShelf(props: SiddurShelfProps) {
  /** One outline per book, kept for the session so reopening a book is instant. */
  const [outlines, setOutlines] = useState<Record<string, BookUnitsResult>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const book = props.bookFilter;
  const outline = book ? outlines[book] : undefined;
  const error = book ? failures[book] || "" : "";
  const loading = Boolean(book) && !outline && !error;

  useEffect(() => {
    if (!book || outlines[book] || failures[book]) return;
    const controller = new AbortController();
    void fetchBookUnits<BookUnitsResult>(props.controlKey, book, controller.signal).then((outcome) => {
      if (controller.signal.aborted) return;
      if (outcome.ok) setOutlines((previous) => ({ ...previous, [book]: outcome.result }));
      else setFailures((previous) => ({ ...previous, [book]: outcome.message }));
    });
    return () => controller.abort();
  }, [book, props.controlKey, outlines, failures]);

  const bookLabel = props.books.find((item) => item.value === book)?.label || outline?.book.label || book;

  if (!book) {
    if (!props.books.length) return <div className="source-results"><div className="source-empty"><BookOpenText size={24} /><p>Browse the library or search for a prayer.</p></div></div>;
    return <div className="siddur-shelf">
      <p className="shelf-lead">Open a book to see it as printed, or search above.</p>
      <div className="shelf-books">{props.books.map((item) => <button key={item.value} className="shelf-book" onClick={() => props.setBookFilter(item.value)}>
        <BookOpenText size={17} />
        <strong>{item.label}</strong>
        <small>{item.count === 1 ? "1 prayer or reading" : `${item.count} prayers and readings`}</small>
      </button>)}</div>
    </div>;
  }

  const groups = groupUnits(outline);
  return <div className="siddur-shelf">
    <div className="shelf-crumb">
      <button className="icon-button" title="Back to all books" aria-label="Back to all books" onClick={() => props.setBookFilter("")}><ChevronLeft size={17} /></button>
      <div><small>All books</small><h4>{bookLabel}</h4></div>
    </div>
    {loading && <p className="shelf-note">Opening {bookLabel}…</p>}
    {error && <p className="shelf-note shelf-error">{error} <button className="shelf-retry" onClick={() => setFailures((previous) => { const next = { ...previous }; delete next[book]; return next; })}>Try again</button></p>}
    {outline && outline.noteLikeOnly > 0 && <label className="shelf-toggle"><input type="checkbox" checked={props.showNotes} onChange={(event) => props.setShowNotes(event.target.checked)} /> {SHOW_NOTES_LABEL}</label>}
    {groups.map((group) => {
      const units = visibleUnits(group.units, props.showNotes);
      if (!units.length) return null;
      return <section key={group.key} className="shelf-section">
        {group.title && <h5>{group.title}</h5>}
        <div className="shelf-units">{units.map((unit) => <button key={unit.id} className="shelf-unit" onClick={() => props.selectSource({ id: unit.id, name: unit.name, kinds: canonicalKinds(unit.kinds) })}>
          {hasHebrew(unit.name)
            ? <span className="shelf-unit-name" lang="he" dir="rtl">{unit.name}</span>
            : <span className="shelf-unit-name">{unit.name}</span>}
          {unit.folio && <small>{unit.folio}</small>}
          <ChevronRight size={16} />
        </button>)}</div>
      </section>;
    })}
    {outline && !loading && !groups.some((group) => visibleUnits(group.units, props.showNotes).length) && <p className="shelf-note">Nothing to show in this book yet.</p>}
  </div>;
}

function SourceProvenance({ source }: { source: Source }) {
  const display = sourceDisplayCopy(source);
  const revision = source.authority?.repositoryCommit?.slice(0, 10) || source.unitSha256?.slice(0, 10);
  return <details className="source-provenance"><summary><BookOpenText size={15} /><span><strong>{sourceHeadline(display)}</strong><small>Exact source text · view edition details</small></span></summary><dl><div><dt>Prayer or reading</dt><dd>{source.name}</dd></div>{display.sectionTitle && <div><dt>Section</dt><dd>{display.sectionTitle}</dd></div>}<div><dt>Book</dt><dd>{display.bookTitle}</dd></div>{display.folio && <div><dt>Pages</dt><dd>{display.folio}</dd></div>}{display.edition && <div><dt>Edition</dt><dd>{display.edition}</dd></div>}{revision && <div><dt>Source revision</dt><dd>{revision}</dd></div>}</dl><p>The selected words are copied exactly from this maintained source. Local changes require an explicitly labeled variant.</p></details>;
}
