"use client";

import { useState, type ReactNode } from "react";
import { CircleAlert, Columns2, FilePlus2, LibraryBig, LoaderCircle, PencilLine, RotateCcw, Sparkles } from "lucide-react";
import { layoutLabel } from "@/lib/layout-label";
import type { SharedCompareResult } from "./types";
import GraphicThumbnail from "@/components/graphic-thumbnail";
import {
  compareFlags,
  compareRows,
  compareSummary,
  groupSharedEntries,
  localDraftsForCard,
  matchesShelfQuery,
  newestLocalDraft,
  partitionShelf,
  wholePrayerLabel,
  type SharedLocalDraft,
  type SharedShelfCard,
  type SharedShelfEntry,
  type SharedShelfState,
} from "./shared-shelf-model";
import "./shared-shelf.css";

export * from "./shared-shelf-model";

export type SharedShelfFeed = { available: boolean; entries: SharedShelfEntry[]; stale: boolean; refreshedAt: number | null; error: string | null };
/** The client reads the server's compare_shared_cue result (SharedCompareResult); the lines are rebuilt client-side by compareRows. */
export type SharedComparison = Pick<SharedCompareResult, "before" | "after" | "changed" | "beforeAvailable">;

const CHIP_LABEL: Record<SharedShelfState, string> = { new: "New from CRC", updated: "Updated from CRC", customized: "In your library" };
const formatTime = (value?: number | null) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";

/**
 * WB-C - the CRC shelf a TBI author reads top to bottom: what is new, what CRC changed
 * since they customized it, and what already lives in their own library. Nothing here
 * edits an existing draft; every action makes a new independent one.
 */
export default function SharedShelf(props: {
  label: string;
  feed: SharedShelfFeed;
  query: string;
  busy: string;
  selectedId: string | null;
  selectCard: (card: SharedShelfCard) => void;
  refresh: () => void;
  customize: (card: SharedShelfCard) => void;
  startUpdateDraft: (card: SharedShelfCard) => void;
  compare: (cueId: string, draftId: string) => Promise<SharedComparison>;
  openDraft: (draftId: string) => void;
  preview: ReactNode;
}) {
  const cards = groupSharedEntries(props.feed.entries).filter((card) => matchesShelfQuery(card, props.query));
  const sections = partitionShelf(cards);
  const selected = cards.find((card) => card.members.some((entry) => entry.id === props.selectedId)) || null;

  if (!props.feed.available && !props.feed.entries.length) return <section className="shared-shelf shared-shelf-down"><p>CRC library is temporarily unavailable. Your graphics are unaffected.</p></section>;

  return (
    <section className="shared-shelf">
      <header className="shared-shelf-header">
        <div>
          <span className="eyebrow">READ-ONLY STARTING POINTS</span>
          <h2>{props.label}</h2>
          <p>Choose any current CRC graphic, then make an independent copy for your congregation.</p>
        </div>
        <div className="shared-shelf-refresh">
          <span>{props.feed.stale ? "Showing the most recent saved list" : props.feed.refreshedAt ? `Updated ${formatTime(props.feed.refreshedAt)}` : "Ready to refresh"}</span>
          <button type="button" onClick={props.refresh} disabled={props.busy === "shared-refresh"}>{props.busy === "shared-refresh" ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />} Refresh</button>
          <small>New CRC graphics appear within a minute, or use Refresh.</small>
        </div>
      </header>
      {props.feed.error && <div className="shared-warning"><CircleAlert size={17} />{props.feed.error}</div>}

      <div className="shared-shelf-body">
        <div className="shared-shelf-sections">
          <ShelfSection title="New from CRC" note="CRC published these. You have not customized them yet." cards={sections.fresh} selectedId={props.selectedId} select={props.selectCard} empty="Nothing new from CRC right now." />
          <ShelfSection title="Updated from CRC" note="CRC changed these after you customized them. Your drafts are untouched." cards={sections.updated} selectedId={props.selectedId} select={props.selectCard} empty="No CRC updates are waiting." />
          <ShelfSection title="In your library" note="Graphics you have already customized for your congregation." cards={sections.mine} selectedId={props.selectedId} select={props.selectCard} empty="Nothing customized yet." />
        </div>

        <div className="shared-shelf-detail">
          {selected ? <ShelfDetail
            key={selected.key} card={selected} busy={props.busy} available={props.feed.available}
            customize={props.customize} startUpdateDraft={props.startUpdateDraft} compare={props.compare} openDraft={props.openDraft}
          /> : <div className="shared-empty"><LibraryBig size={28} /><h3>{props.query.trim() ? "No CRC graphics match this search." : "The CRC library is empty right now."}</h3><p>{props.query.trim() ? "Clear the search or refresh the library." : "Refresh the library to look again."}</p></div>}
          <div className="shared-shelf-preview">{props.preview}</div>
        </div>
      </div>
    </section>
  );
}

function ShelfSection(props: { title: string; note: string; cards: SharedShelfCard[]; selectedId: string | null; select: (card: SharedShelfCard) => void; empty: string }) {
  return (
    <section className="shelf-section">
      <header><h3>{props.title} <span className="shelf-count">{props.cards.length}</span></h3><p>{props.note}</p></header>
      {props.cards.length
        ? <div className="shelf-grid">{props.cards.map((card) => <ShelfCard key={card.key} card={card} selected={card.members.some((entry) => entry.id === props.selectedId)} select={props.select} />)}</div>
        : <p className="shelf-section-empty">{props.empty}</p>}
    </section>
  );
}

function ShelfCard(props: { card: SharedShelfCard; selected: boolean; select: (card: SharedShelfCard) => void }) {
  const { card } = props;
  return (
    <article className={`shelf-card ${props.selected ? "active" : ""}`.trim()}>
      <button type="button" className="shelf-card-main" aria-pressed={props.selected} onClick={() => props.select(card)}>
        <GraphicThumbnail layout={card.layout} title={card.title} />
        <span className="shelf-card-body">
          <strong>{card.title}</strong>
          <small>{layoutLabel(card.layout)}</small>
          {card.kind === "set" && <small className="shelf-slides">{wholePrayerLabel(card)}</small>}
          <span className={`shelf-chip ${card.state}`}>{CHIP_LABEL[card.state]}</span>
        </span>
      </button>
    </article>
  );
}

function ShelfDetail(props: {
  card: SharedShelfCard; busy: string; available: boolean;
  customize: (card: SharedShelfCard) => void;
  startUpdateDraft: (card: SharedShelfCard) => void;
  compare: (cueId: string, draftId: string) => Promise<SharedComparison>;
  openDraft: (draftId: string) => void;
}) {
  const { card } = props;
  const [comparison, setComparison] = useState<SharedComparison | null>(null);
  const [compareError, setCompareError] = useState("");
  const [comparing, setComparing] = useState(false);

  const drafts = localDraftsForCard(card);
  const newest = newestLocalDraft(card);
  const slides = card.kind === "set" ? card.members.length : 0;

  async function seeWhatChanged() {
    if (!newest) return;
    setComparing(true); setCompareError("");
    try { setComparison(await props.compare(card.lead.id, newest.id)); }
    catch (value) { setCompareError(value instanceof Error ? value.message : "Comparison is unavailable right now."); }
    finally { setComparing(false); }
  }

  return (
    <div className="shared-information">
      <span className={`shelf-chip ${card.state}`}>{CHIP_LABEL[card.state]}</span>
      <h3>{card.title}</h3>
      <p className="shared-title">{card.subtitle}</p>
      <dl>
        <div><dt>Layout</dt><dd>{layoutLabel(card.layout)}</dd></div>
        {card.kind === "set" && <div><dt>Slides</dt><dd>{wholePrayerLabel(card)}</dd></div>}
        <div><dt>Source</dt><dd>{card.lead.sourceIds.length ? `${card.lead.sourceIds.length} referenced source${card.lead.sourceIds.length === 1 ? "" : "s"}` : "Custom CRC graphic"}</dd></div>
      </dl>

      {card.state === "new" && <button type="button" className="primary-button shared-customize" onClick={() => props.customize(card)} disabled={!props.available || props.busy === "shared-customize"}>{props.busy === "shared-customize" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Customize</button>}

      {card.state === "updated" && <div className="shelf-update">
        <p className="shelf-update-note"><CircleAlert size={16} /> CRC changed this graphic since you customized it</p>
        <button type="button" onClick={() => void seeWhatChanged()} disabled={!newest || comparing}>{comparing ? <LoaderCircle className="spin" size={16} /> : <Columns2 size={16} />} See what changed</button>
        <button type="button" className="primary-button" onClick={() => props.startUpdateDraft(card)} disabled={!props.available || props.busy === "shared-customize"}>{props.busy === "shared-customize" ? <LoaderCircle className="spin" size={17} /> : <FilePlus2 size={17} />} Start a new draft from the update</button>
        {compareError && <p className="shelf-compare-error"><CircleAlert size={15} /> {compareError}</p>}
        {comparison && <CompareTable comparison={comparison} />}
      </div>}

      {card.state === "customized" && <div className="shelf-local">
        <h4>In your library</h4>
        {drafts.length
          ? <ul className="shelf-draft-list">{drafts.map((item: SharedLocalDraft) => <li key={item.id}><button type="button" onClick={() => props.openDraft(item.id)}><PencilLine size={15} /> {item.name}<small>{item.activeRevision ? `Published revision ${item.activeRevision}` : "Draft"}</small></button></li>)}</ul>
          : card.lead.local.starterCueId
            ? <p className="shelf-section-empty">Already published in your library.</p>
            : <p className="shelf-section-empty">Your copy is no longer in this library.</p>}
      </div>}

      {slides > 1 && <ol className="shelf-slide-list">{card.members.map((entry) => <li key={entry.id}>{entry.name}</li>)}</ol>}
    </div>
  );
}

function CompareTable(props: { comparison: SharedComparison }) {
  const { before, after, changed, beforeAvailable } = props.comparison;
  const rows = compareRows(after, beforeAvailable ? before ?? undefined : undefined);
  return (
    <div className="shelf-compare">
      <p className="shelf-compare-summary">{compareSummary(changed, beforeAvailable)}</p>
      <ul className="shelf-compare-flags">{compareFlags(changed).map((flag) => <li key={flag.key} className={flag.changed ? "changed" : ""}>{flag.label}: {flag.changed ? "changed" : "unchanged"}</li>)}</ul>
      <div className="shelf-compare-scroll">
        <table>
          <thead><tr><th scope="col">Line</th>{beforeAvailable && <th scope="col">Your draft</th>}<th scope="col">CRC now</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.key} className={row.changed ? "changed" : ""}>
              <th scope="row">{row.label}{row.changed && <span className="shelf-changed-mark">Changed</span>}</th>
              {beforeAvailable && <td>{row.before || "—"}</td>}
              <td>{row.after || "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
