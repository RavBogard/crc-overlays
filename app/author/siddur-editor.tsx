"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpenText, ChevronLeft, ChevronRight, CircleAlert, FilePlus2, LoaderCircle, PencilLine, RotateCcw, Search } from "lucide-react";
import { fetchBookUnits, groupUnits, hasHebrew, visibleUnits } from "@/lib/siddur-shelf";
import { LAYER_NAMES, LAYER_ORDER, ROW_ORDERS, blocksForMode, formRowOrder, sourceDisplayCopy, sourceHeadline } from "./editor-state";
import type {
  BookUnit,
  BookUnitsResult,
  CanonicalContentMode,
  DraftForm,
  Source,
  SourceEnglishRole,
  SourceFacet,
  SourceSummary,
  TextLayer,
} from "./types";
import { EditorCard } from "./editor-card";
import { insertLineBreak, keepSelectionTogether } from "./manual-wording";
import { slideHolding } from "./passage-selection";
import { activeWordingEdits, findWordingEdit, passageWordingFields, revertWordingEdit, setWordingEdit, wordingKey, type WordingField } from "./wording-edits";
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
  createSlidesFromGroups: () => void;
  changeMode: (mode: CanonicalContentMode) => void; changeForm: (patch: Partial<DraftForm>) => void; busy: string;
  controlKey: string;
  /** C6: the same one-line fit status the preview shows, repeated where the layers are chosen. */
  fitErrors: string[];
  /** X2: the Groups row is shown only when the selection needs more than one group (or already has one). Default true.
   *  Daniel, 2026-09-23: these are Groups inside one graphic (Slide means a separate graphic in a set); "panel" now
   *  means only the layout (Left panel / Right panel). The prop and state names are unchanged. */
  showPanels?: boolean;
};

export function SiddurEditor(props: SiddurEditorProps) {
  /** Off by default: a siddur's instructions and notes are not what a leader puts on screen. */
  const [showNotes, setShowNotes] = useState(false);
  const [manualGroupsOpen, setManualGroupsOpen] = useState<boolean | null>(null);
  /** Passages whose wording editor is open. Closing one keeps its edits. */
  const [editingPassages, setEditingPassages] = useState<Set<string>>(() => new Set());
  /** A search only takes over from the shelf once it has actually been run. */
  const [searchedQuery, setSearchedQuery] = useState("");
  const searching = searchedQuery !== "" && props.query.trim() !== "";
  /* C2: the search runs as you type rather than waiting for a button. The round trip is still a
     round trip, so it is debounced and never fires on a single character; Enter runs it at once. */
  const latestSearch = useRef(props.search);
  useEffect(() => { latestSearch.current = props.search; });
  const typed = props.query.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    const timer = setTimeout(() => { setSearchedQuery(typed); latestSearch.current(); }, 350);
    return () => clearTimeout(timer);
  }, [typed]);
  function runSearch() {
    setSearchedQuery(typed);
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
  const wordingEdits = activeWordingEdits(props.form);
  const groupsVisible = manualGroupsOpen ?? props.showPanels !== false;
  const populatedGroups = props.form.groups.filter((group) => group.blockIds.length);
  const canCreateSlides = populatedGroups.length > 1 && new Set(populatedGroups.map((group) => group.sourceId)).size === 1;
  const editedKeys = new Set(wordingEdits.map(wordingKey));
  const toggleEditing = (blockId: string) => setEditingPassages((current) => {
    const next = new Set(current);
    if (next.has(blockId)) next.delete(blockId); else next.add(blockId);
    return next;
  });
  return <EditorCard number={1} title="Text" lede="Search by prayer, Hebrew, common spelling, or opening words." className="siddur-section">
    <div className="siddur-search-row"><label className="source-search"><span className="sr-only">Search siddur library</span><Search size={17} /><input aria-label="Search siddur library" value={props.query} onChange={(event) => props.setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); runSearch(); } }} placeholder="Search prayers and readings" />{props.busy === "search" && <LoaderCircle className="spin" size={16} />}</label></div>
    {(props.books.length > 0 || props.services.length > 0) && <div className="source-filters"><label>Source<select value={props.serviceFilter ? `service:${props.serviceFilter}` : props.bookFilter ? `book:${props.bookFilter}` : ""} onChange={(event) => {
      const separator = event.target.value.indexOf(":");
      const kind = separator < 0 ? "" : event.target.value.slice(0, separator);
      const value = separator < 0 ? "" : event.target.value.slice(separator + 1);
      props.setBookFilter(kind === "book" ? value : "");
      props.setServiceFilter(kind === "service" ? value : "");
    }}><option value="">Everything</option>{props.books.length > 0 && <optgroup label="Books">{props.books.map((book) => <option key={book.value} value={`book:${book.value}`}>{book.label} ({book.count})</option>)}</optgroup>}{props.services.length > 0 && <optgroup label="Services">{props.services.map((service) => <option key={service.value} value={`service:${service.value}`}>{service.label} ({service.count})</option>)}</optgroup>}</select></label></div>}
    {!props.source ? (!searching ? <SiddurShelf books={props.books} bookFilter={props.bookFilter} setBookFilter={props.setBookFilter} controlKey={props.controlKey} selectSource={props.selectSource} showNotes={showNotes} setShowNotes={setShowNotes} /> : <div className="source-results">{props.truncated &&<p className="results-note">Showing the first {props.results.length}. Choose a book or service, or search to narrow the list.</p>}{props.results.map((item) => { const display = sourceDisplayCopy(item); return <button key={item.id} onClick={() => props.selectSource(item)}><span className="source-book"><BookOpenText size={18} /></span><span><strong>{item.name}</strong><small>{sourceHeadline(display)}</small>{display.sectionTitle && <small className="source-section">{display.sectionTitle}</small>}{item.openingWords?.[0] && <em>{item.openingWords[0]}</em>}</span><ChevronRight size={17} /></button>; })}{!props.results.length && <div className="source-empty"><BookOpenText size={24} /><p>Nothing matched that search. Clear it to browse the shelf.</p></div>}</div>) : <div className="passage-picker">
      <div className="passage-header"><button className="icon-button" title="Back to results" onClick={props.clearSource}><ChevronLeft size={17} /></button><div><small>{sourceHeadline(sourceDisplayCopy(props.source))}</small><h4>{props.source.name}</h4></div><div className="whole-prayer-actions"><button onClick={props.chooseWholePrayer}>Select all</button><button className="primary-button" onClick={props.makeSlidesFromWholePrayer} disabled={props.busy === "make-set"}>{props.busy === "make-set" ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />} Add all as slides</button></div></div>
      <SourceProvenance source={props.source} />
      <div className="content-mode-toggle">{props.source.blocks.some((block) => block.kind === "bilingual") && <button className={props.form.mode === "bilingual" ? "active" : ""} onClick={() => props.changeMode("bilingual")}>Hebrew + transliteration</button>}{blocksForMode(props.source, "source-en").length > 0 && <button className={props.form.mode === "source-en" ? "active" : ""} onClick={() => props.changeMode("source-en")}>English from siddur</button>}{props.source.blocks.some((block) => block.kind === "original-en") && <button className={props.form.mode === "original-en" ? "active" : ""} onClick={() => props.changeMode("original-en")}>Original English reading</button>}</div>
      {omittedFromAutomatic > 0 && <p className="source-mode-note">{omittedFromAutomatic} service {omittedFromAutomatic === 1 ? "note is" : "notes are"} available for manual selection below. Automatic slides use the prayer and reading text.</p>}
      <section className="passage-grouping" aria-label="Passage groups">
        <button type="button" className="grouping-toggle" aria-expanded={groupsVisible} onClick={() => setManualGroupsOpen(!groupsVisible)}>Groups within this graphic</button>
        {groupsVisible && <><p>Put passages in groups within one graphic. Together and In blocks arrange languages. Create slides from groups makes a separate graphic for each populated group.</p>
          <div className="panel-tabs">{props.form.groups.map((group, index) => <button key={`${group.sourceId}-${index}`} className={props.activeGroup === index ? "active" : ""} onClick={() => props.setActiveGroup(index)}>Group {index + 1}<small>{group.blockIds.length} passages</small></button>)}<button onClick={props.addPanel}>+ Add group</button></div>
          {props.form.mode === "bilingual" && <label className="grouping-preserve"><input type="checkbox" checked={Boolean(props.form.preserveGroups)} disabled={props.form.layout !== "left" && props.form.layout !== "right"} onChange={(event) => props.changeForm({ preserveGroups: event.target.checked })} /> Show each group separately within this graphic <small>{props.form.layout === "left" || props.form.layout === "right" ? "Keeps each group's passages together in the chosen language arrangement." : "Available on a left or right panel."}</small></label>}
          {props.form.groups.length > 1 && <div className="grouping-actions"><button type="button" className="remove-panel" onClick={props.removePanel}>Remove group {props.activeGroup + 1}</button><button type="button" className="primary-button" disabled={!canCreateSlides || Boolean(props.busy)} onClick={props.createSlidesFromGroups}>{props.busy === "make-group-set" ? <LoaderCircle className="spin" size={15} /> : <FilePlus2 size={15} />} Create slides from groups</button></div>}
        </>}
      </section>
      {noteLikeBlocks > 0 && <label className="shelf-toggle"><input type="checkbox" checked={showNotes} onChange={(event) => setShowNotes(event.target.checked)} /> {SHOW_NOTES_LABEL}</label>}
      {props.form.mode === "bilingual" && <TextLayerControls form={props.form} source={props.source} changeForm={props.changeForm} fitErrors={props.fitErrors} />}
      {wordingEdits.length > 0 && <WordingSummary count={wordingEdits.length} reason={props.form.variantReason} setReason={(value) => props.changeForm({ variantReason: value })} />}
      <div className="passage-list">{visibleBlocks.map((block) => {
        const selected = props.selectedIds.has(block.id);
        const fields = selected ? passageWordingFields(props.form, props.source!, block) : [];
        const edited = fields.some((field) => editedKeys.has(wordingKey(field)));
        const shown = (channel: "he" | "tr" | "en", fallback?: string) => {
          const field = fields.find((item) => item.channel === channel && item.blockId === block.id);
          return (field && editedKeys.has(wordingKey(field)) && findWordingEdit(props.form.variantOverrides, field)?.localText) || fallback;
        };
        const open = editingPassages.has(block.id) && fields.length > 0;
        return <div key={block.id} className={`passage-row${selected ? " selected" : ""}${edited ? " edited" : ""}`}>
          <label className={selected ? "selected" : ""}><input type="checkbox" checked={selected} onChange={(event) => props.toggleBlock(block.id, event.target.checked)} /><span className="passage-number">{block.index + 1}</span><span>{props.form.mode === "bilingual" && block.kind === "bilingual" ? <><b lang="he" dir="rtl">{shown("he", block.he)}</b><small>{shown("tr", block.tr)}</small></> : <><b>{shown("en", block.en)}</b>{(props.form.mode === "source-en" || block.kind === "source-en" || block.kind === "original-en") && <small className="passage-meta">{englishRoleLabel[block.englishRole || "unclassified"]}{block.automatic === false ? " · manual selection" : ""}</small>}</>}</span>{groupsVisible && (() => { const holder = slideHolding(props.form.groups, props.activeGroup, props.source!.id, block.id); return holder >= 0 ? <small className="passage-elsewhere" title="Checking it here moves it to this group">In group {holder + 1}</small> : null; })()}{edited && <small className="passage-edited" title="This graphic uses edited wording. The siddur text is kept beside it.">Edited</small>}</label>
          {fields.length > 0 && <button type="button" className={open ? "passage-edit-toggle on" : "passage-edit-toggle"} aria-expanded={open} aria-label={`Edit wording for passage ${block.index + 1}`} title="Edit wording" onClick={() => toggleEditing(block.id)}><PencilLine size={14} aria-hidden="true" /><span>Edit text</span></button>}
          {open && <WordingFields fields={fields} passageNumber={block.index + 1} mode={props.form.mode} edits={props.form.variantOverrides} change={(variantOverrides) => props.changeForm({ variantOverrides })} insertBreak={(variantOverrides, channel) => props.changeForm({ variantOverrides, ...(channel !== "he" ? { presentation: { ...props.form.presentation, latinLineBreaks: "preserve" } } : {}) })} />}
        </div>;
      })}</div>
    </div>}
  </EditorCard>;
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
/**
 * C6. Two decisions the old "Include approved English" checkbox hid: which layers a graphic
 * shows, and how they sit on the slide. The layers stack Hebrew - Transliteration - Translation
 * unless this graphic sets another order; the order applies in both arrangements on a left or
 * right panel, and is stored only when it differs from that default. The last lit chip simply
 * stays lit rather than raising an error. Translation is offered where the siddur actually carries authorized English for these
 * passages, which today is rare, and it needs the room of a left or right panel.
 */
function TextLayerControls(props: { form: DraftForm; source: Source; changeForm: (patch: Partial<DraftForm>) => void; fitErrors: string[] }) {
  const panel = props.form.layout === "left" || props.form.layout === "right";
  const hasEnglish = props.source.blocks.some((block) => block.kind === "translation-en");
  const lit = LAYER_ORDER.filter((layer) => props.form.layers.includes(layer));
  const reason = (layer: TextLayer) =>
    layer !== "en" || hasEnglish ? "" : "This siddur has no paired translation for the Hebrew. English reading passages appear on their own rows.";
  const toggle = (layer: TextLayer) => {
    const next = lit.includes(layer) ? lit.filter((item) => item !== layer) : LAYER_ORDER.filter((item) => item === layer || lit.includes(item));
    if (!next.length) return;
    props.changeForm({ layers: next });
  };
  const order = formRowOrder(props.form).join(",");
  const orderLabel = (value: readonly TextLayer[]) => value.map((layer) => LAYER_NAMES[layer]).join(" · ");
  return <div className="text-layers">
    <div className="layer-chips" role="group" aria-label="Text layers">
      {LAYER_ORDER.map((layer) => {
        const blocked = reason(layer);
        const on = lit.includes(layer);
        return <button key={layer} type="button" className={on ? "chip on" : "chip"} aria-pressed={on} disabled={Boolean(blocked) && !on}
          title={blocked || (on && lit.length === 1 ? "A graphic shows at least one layer." : "")}
          onClick={() => toggle(layer)}>{LAYER_NAMES[layer]}</button>;
      })}
    </div>
    {lit.length > 1 && <div className="layer-arrangement" role="group" aria-label="Arrangement">
      {([["together", "Together"], ["blocks", "In blocks"]] as const).map(([value, label]) =>
        <button key={value} type="button" className={props.form.arrangement === value ? "chip on" : "chip"} aria-pressed={props.form.arrangement === value}
          disabled={!panel} title={panel ? "" : "A lower third keeps its two columns side by side."}
          onClick={() => props.changeForm({ arrangement: value })}>{label}</button>)}
    </div>}
    {lit.length > 1 && <label className="layer-order" title={panel ? "The order the layers stack in, top to bottom." : "A lower third keeps its two columns side by side."}>
      <span>Order</span>
      <select aria-label="Layer order, top to bottom" value={order} disabled={!panel}
        onChange={(event) => props.changeForm({ rowOrder: event.target.value.split(",") as TextLayer[] })}>
        {ROW_ORDERS.map((value) => <option key={value.join(",")} value={value.join(",")}>{orderLabel(value)}</option>)}
      </select>
    </label>}
    {props.fitErrors.length > 0 && <p className="layer-fit"><CircleAlert size={15} /> {props.fitErrors[0]}</p>}
  </div>;
}

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
  return <details className="source-provenance"><summary><BookOpenText size={15} /><span><strong>{sourceHeadline(display)}</strong><small>Exact source text · view edition details</small></span></summary><dl><div><dt>Prayer or reading</dt><dd>{source.name}</dd></div>{display.sectionTitle && <div><dt>Section</dt><dd>{display.sectionTitle}</dd></div>}<div><dt>Book</dt><dd>{display.bookTitle}</dd></div>{display.folio && <div><dt>Pages</dt><dd>{display.folio}</dd></div>}{display.edition && <div><dt>Edition</dt><dd>{display.edition}</dd></div>}{revision && <div><dt>Source revision</dt><dd>{revision}</dd></div>}</dl><p>The selected words are copied exactly from this maintained source. Wording you edit here is kept beside the exact words and listed under Wording changes; the source itself never changes.</p></details>;
}

const WORDING_CHANNEL: Record<"he" | "tr" | "en", string> = { he: "Hebrew", tr: "Transliteration", en: "Translation" };

/**
 * The inline wording editor for one selected passage: one field per line this graphic shows, the
 * exact siddur text under any line that differs, and a way back to it.
 */
function WordingFields(props: { fields: WordingField[]; passageNumber: number; mode: DraftForm["mode"]; edits: DraftForm["variantOverrides"]; change: (edits: DraftForm["variantOverrides"]) => void; insertBreak: (edits: DraftForm["variantOverrides"], channel: WordingField["channel"]) => void }) {
  return <div className="wording-fields">{props.fields.map((field) => {
    const edit = findWordingEdit(props.edits, field);
    const value = edit ? edit.localText : field.sourceText;
    const changed = Boolean(edit) && value !== field.sourceText;
    const hebrew = field.channel === "he";
    const name = field.channel === "en" && props.mode !== "bilingual" ? "English" : WORDING_CHANNEL[field.channel];
    return <WordingFieldEditor key={wordingKey(field)} field={field} passageNumber={props.passageNumber} name={name} value={value} changed={changed} edit={Boolean(edit)} edits={props.edits} change={props.change} insertBreak={props.insertBreak} hebrew={hebrew} />;
  })}</div>;
}

function WordingFieldEditor(props: { field: WordingField; passageNumber: number; name: string; value: string; changed: boolean; edit: boolean; edits: DraftForm["variantOverrides"]; change: (edits: DraftForm["variantOverrides"]) => void; insertBreak: (edits: DraftForm["variantOverrides"], channel: WordingField["channel"]) => void; hebrew: boolean }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const selected = props.value.slice(selection.start, selection.end);
  const canKeepTogether = /[ \t-]/.test(selected);
  const restoreSelection = (start: number, end = start) => requestAnimationFrame(() => {
    textarea.current?.focus();
    textarea.current?.setSelectionRange(start, end);
  });
  const changeText = (value: string, start: number, end = start, manualBreak = false) => {
    if (value.length > 4000) return;
    const edits = setWordingEdit(props.edits, props.field, value);
    if (manualBreak) props.insertBreak(edits, props.field.channel); else props.change(edits);
    setSelection({ start, end });
    restoreSelection(start, end);
  };
  return <div className={props.changed ? "wording-field changed" : "wording-field"}>
    <header><span>{props.name}</span>{props.edit && <button type="button" className="text-button" onClick={() => props.change(revertWordingEdit(props.edits, props.field))}><RotateCcw size={13} /> Revert to siddur</button>}</header>
    <textarea ref={textarea} aria-label={`${props.name} wording for passage ${props.passageNumber}`} lang={props.hebrew ? "he" : undefined} dir={props.hebrew ? "rtl" : undefined} value={props.value} maxLength={4000} rows={Math.min(6, Math.max(2, Math.ceil(props.value.length / 60)))} onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} onChange={(event) => { const edits = setWordingEdit(props.edits, props.field, event.target.value); if (!props.hebrew && event.target.value.includes("\n")) props.insertBreak(edits, props.field.channel); else props.change(edits); }} />
    <div className="wording-actions">
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { const el = textarea.current; if (!el) return; const next = insertLineBreak(el.value, el.selectionStart, el.selectionEnd); changeText(next.text, next.cursor, next.cursor, true); }}>Insert line break</button>
      <button type="button" disabled={!canKeepTogether} onMouseDown={(event) => event.preventDefault()} onClick={() => { const el = textarea.current; if (!el) return; const next = keepSelectionTogether(el.value, el.selectionStart, el.selectionEnd); if (next) changeText(next.text, next.start, next.end); }}>Keep selection together</button>
    </div>
    <small className="wording-actions-hint">Select words first to keep their spaces and hyphens on one line.</small>
    {props.edit && !props.value.trim() && <p className="wording-warning"><CircleAlert size={13} /> Blank wording can’t be saved. Revert to siddur to restore it.</p>}
    {props.changed && <p className="wording-source"><span>Siddur</span><span lang={props.hebrew ? "he" : undefined} dir={props.hebrew ? "rtl" : undefined}>{props.field.sourceText}</span></p>}
  </div>;
}

function WordingSummary(props: { count: number; reason: string; setReason: (value: string) => void }) {
  return <div className="wording-summary">
    <PencilLine size={16} />
    <div>
      <strong>{props.count === 1 ? "1 wording edit on this graphic" : `${props.count} wording edits on this graphic`}</strong>
      <small>The graphic uses the edited words. The exact siddur text is kept beside each edit and listed under <Link href="/author/wording-changes">Wording changes</Link> so the source can be corrected later.</small>
      <label>Why? <span>optional</span><input value={props.reason} maxLength={500} onChange={(event) => props.setReason(event.target.value)} placeholder="Example: misspelled in the siddur" /></label>
    </div>
  </div>;
}
