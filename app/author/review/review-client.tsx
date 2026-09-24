"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { AccessRole } from "@/lib/access";
import { fetchAccessUser } from "@/lib/access-client";
import type { PageBoard, PageItem } from "@/lib/review-board-http";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import SignInCard from "@/components/sign-in-card";
import { COPY, FILTERS, answeredLine, earlierLine, groupsOf, progressLine, shows, tally, type Filter } from "./review-model";
import "../author.css";
import styles from "./review.module.css";

type Load = { state: "loading" } | { state: "signed-out" } | { state: "missing" } | { state: "failed" } | { state: "ready"; board: PageBoard };
type SaveState = "saving" | "saved" | "failed";
type Decision = PageItem["decision"];
const NOTE_PAUSE_MS = 1200;

/**
 * T4 - the review board. One page a non-technical reviewer works down: each graphic's picture,
 * the old slide's words beside it, Approve / Needs change and a note. Every click saves at once;
 * a note saves when the reviewer pauses or leaves the box. No ids, codes or tool names are shown.
 */
export default function ReviewClient({ boardId }: { boardId: string }) {
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const itemsRef = useRef<PageItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const identity = await fetch("/api/workspace", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<PublicWorkspace> : null).catch(() => null);
      if (!cancelled && identity) setWorkspace(identity);
      const user = await fetchAccessUser().catch(() => null);
      if (!cancelled && user) setRole(user.role as AccessRole);
      const response = await fetch(`/api/review-boards?board=${encodeURIComponent(boardId)}`, { cache: "no-store" });
      if (cancelled) return;
      if (response.status === 401) return setLoad({ state: "signed-out" });
      if (response.status === 404) return setLoad({ state: "missing" });
      if (!response.ok) return setLoad({ state: "failed" });
      const board = await response.json() as PageBoard;
      if (!cancelled) setLoad({ state: "ready", board });
    };
    void start().catch(() => { if (!cancelled) setLoad({ state: "failed" }); });
    const pending = timers.current;
    return () => { cancelled = true; for (const timer of pending.values()) clearTimeout(timer); };
  }, [boardId]);

  const replaceItem = useCallback((item: PageItem) => {
    setLoad((current) => current.state === "ready" ? { state: "ready", board: { ...current.board, items: current.board.items.map((entry) => entry.key === item.key ? item : entry) } } : current);
  }, []);

  const save = useCallback(async (item: PageItem, decision: Decision, note: string) => {
    setSaves((current) => ({ ...current, [item.key]: "saving" }));
    try {
      const response = await fetch("/api/review-boards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ board: boardId, item: item.key, decision, note, revision: item.revision }) });
      if (!response.ok) throw Error();
      const body = await response.json() as { item: PageItem };
      replaceItem(body.item);
      setSaves((current) => ({ ...current, [item.key]: "saved" }));
    } catch {
      setSaves((current) => ({ ...current, [item.key]: "failed" }));
    }
  }, [boardId, replaceItem]);

  const noteFor = (item: PageItem) => notes[item.key] ?? item.note;
  const choose = (item: PageItem, decision: Exclude<Decision, null>) => {
    const pending = timers.current.get(item.key);
    if (pending) { clearTimeout(pending); timers.current.delete(item.key); }
    // Shown at once; the server's answer replaces it when the save lands.
    replaceItem({ ...item, decision, updated: false });
    void save(item, decision, noteFor(item));
  };
  // A note saves against the item as it is when the save runs, not as it was when typing began.
  const saveNote = (key: string, note: string) => {
    const pending = timers.current.get(key);
    if (pending) { clearTimeout(pending); timers.current.delete(key); }
    const item = itemsRef.current.find((entry) => entry.key === key);
    if (!item || note.trim() === item.note) return;
    void save(item, item.decision, note);
  };
  const typeNote = (item: PageItem, note: string) => {
    setNotes((current) => ({ ...current, [item.key]: note }));
    const pending = timers.current.get(item.key);
    if (pending) clearTimeout(pending);
    timers.current.set(item.key, setTimeout(() => { timers.current.delete(item.key); saveNote(item.key, note); }, NOTE_PAUSE_MS));
  };

  const workspaceStyle = workspace ? {
    "--workspace-primary": workspace.colors.primary,
    "--workspace-deep": workspace.colors.deep,
    "--workspace-accent": workspace.colors.accent,
  } as CSSProperties : undefined;
  const board = load.state === "ready" ? load.board : null;
  useEffect(() => { itemsRef.current = board?.items ?? []; }, [board]);
  const counts = board ? tally(board.items) : null;
  const visible = board ? board.items.filter((item) => shows(item, filter)) : [];

  return (
    <main className="author-page" style={workspaceStyle}>
      <WorkspaceHeader current="/author/review" title={COPY.heading} role={role} workspace={workspace} />
      <div className={styles.wrap}>
        {load.state === "loading" && <p className={styles.summary}>{COPY.loading}</p>}
        {load.state === "signed-out" && <SignInCard description={COPY.signIn} />}
        {load.state === "missing" && <p className={styles.problem} role="alert">{COPY.missing}</p>}
        {load.state === "failed" && <p className={styles.problem} role="alert">{COPY.unavailable}</p>}
        {board && counts && <>
          <header className={styles.top}>
            <h1>{board.title}</h1>
            <p className={styles.intro}>{COPY.intro}</p>
            <p className={styles.progress} aria-live="polite">{counts.answered === counts.total && counts.total > 0 ? `${progressLine(counts)}. ${COPY.allDone}` : progressLine(counts)}</p>
            <div className={styles.filters} role="group" aria-label={COPY.filterLabel}>
              {FILTERS.map((option) => <button key={option.id} type="button" aria-pressed={filter === option.id} className={styles.filter} onClick={() => setFilter(option.id)}>{option.label}</button>)}
            </div>
          </header>
          {!visible.length && <p className={styles.empty}>{COPY.nothingToShow}</p>}
          {groupsOf(visible).map((group, index) => <section key={`${group.heading}:${index}`} className={styles.group}>
            {group.heading && <h2>{group.heading} <span>{group.items.length}</span></h2>}
            {group.items.map((item) => {
              const saveState = saves[item.key];
              const note = noteFor(item);
              return <article key={item.key} className={`${styles.card} ${item.decision === "approve" ? styles.approved : item.decision === "needs-change" ? styles.flagged : ""}`}>
                <div className={styles.pictures}>
                  <figure className={styles.figure}>
                    {item.reference && <figcaption>{COPY.after}</figcaption>}
                    <div className={styles.frame}>
                      {item.image
                        // eslint-disable-next-line @next/next/no-img-element -- an authenticated, private frame; the image optimizer cannot fetch it
                        ? <img src={item.image.url} alt={item.name} width={item.image.width} height={item.image.height} loading="lazy" />
                        : <p>{COPY.noPicture}</p>}
                    </div>
                  </figure>
                  {item.reference && <figure className={styles.before}>
                    <figcaption>{COPY.before} <small>{COPY.beforeHint}</small></figcaption>
                    {item.reference.imageUrl && <div className={styles.frame}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- private artwork served by the assets route */}
                      <img src={item.reference.imageUrl} alt={`${COPY.before}: ${item.name}`} loading="lazy" />
                    </div>}
                    {item.reference.text && <blockquote dir="auto">{item.reference.text}</blockquote>}
                  </figure>}
                </div>
                <div className={styles.body}>
                  <header>
                    <h3>{item.name}</h3>
                    {item.updated && <em className={styles.updated}>{COPY.updated}</em>}
                  </header>
                  {item.updated && <p className={styles.hint}>{COPY.updatedHint}</p>}
                  {item.earlier && <p className={styles.earlier}>{earlierLine(item.earlier)}</p>}
                  {!item.available && <p className={styles.hint}>{item.archived ? COPY.archived : item.unpublished ? COPY.unpublished : COPY.gone}</p>}
                  <div className={styles.choices} role="group" aria-label={item.name}>
                    <button type="button" aria-pressed={item.decision === "approve"} className={`${styles.choice} ${styles.approve}`} onClick={() => choose(item, "approve")}>{COPY.approve}</button>
                    <button type="button" aria-pressed={item.decision === "needs-change"} className={`${styles.choice} ${styles.change}`} onClick={() => choose(item, "needs-change")}>{COPY.needsChange}</button>
                  </div>
                  <label className={styles.note}>{COPY.noteLabel}
                    <textarea value={note} maxLength={1000} rows={2} placeholder={COPY.notePlaceholder} onChange={(event) => typeNote(item, event.target.value)} onBlur={(event) => saveNote(item.key, event.target.value)} />
                  </label>
                  <p className={styles.status} aria-live="polite">
                    {saveState === "saving" && COPY.saving}
                    {saveState === "saved" && COPY.saved}
                    {saveState === "failed" && <span className={styles.failed}>{COPY.saveFailed}</span>}
                    {!saveState && answeredLine(item)}
                  </p>
                </div>
              </article>;
            })}
          </section>)}
        </>}
      </div>
    </main>
  );
}
