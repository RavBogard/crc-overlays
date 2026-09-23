"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { AccessRole } from "@/lib/access";
import { fetchAccessUser } from "@/lib/access-client";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import SignInCard from "@/components/sign-in-card";
import { authoringCall } from "../api";
import { routeForDraft } from "../editor-state";
import { formatTime } from "../library-model";
import { groupWordingChanges, wordDiff, type WordingChangeRow } from "./wording-changes-model";
import "../author.css";
import styles from "./wording-changes.module.css";

const CHANNEL: Record<WordingChangeRow["channel"], string> = { he: "Hebrew", tr: "Transliteration", en: "English" };

/**
 * Wording changes: every siddur line an editor changed on a graphic, the exact source text beside
 * the edited text. It is a list to work from when correcting the source; nothing here edits a
 * graphic or the siddur.
 */
export default function WordingChangesClient() {
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [controlKey, setControlKey] = useState("");
  const [resolved, setResolved] = useState(false);
  const [rows, setRows] = useState<WordingChangeRow[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const identityResponse = await fetch("/api/workspace", { cache: "no-store" });
      if (!identityResponse.ok) throw Error("Workspace identity is unavailable.");
      const identity = await identityResponse.json() as PublicWorkspace;
      if (cancelled) return;
      setWorkspace(identity);
      const user = await fetchAccessUser().catch(() => null);
      if (cancelled) return;
      let key = "";
      if (user && ["owner", "editor"].includes(user.role)) { setRole(user.role as AccessRole); key = "session"; }
      else {
        const saved = sessionStorage.getItem("crc-control-key") || "";
        if (saved) { setRole("owner"); key = saved; }
      }
      setResolved(true);
      if (!key) return;
      setControlKey(key);
      const result = await authoringCall<{ changes: WordingChangeRow[] }>(key, "list_wording_changes");
      if (!cancelled) setRows(result.changes || []);
    };
    void start().catch((value) => {
      if (cancelled) return;
      setError(value instanceof Error ? value.message : "Wording changes could not be loaded.");
      setResolved(true);
    });
    return () => { cancelled = true; };
  }, []);

  const workspaceStyle = workspace ? {
    "--workspace-primary": workspace.colors.primary,
    "--workspace-deep": workspace.colors.deep,
    "--workspace-accent": workspace.colors.accent,
  } as CSSProperties : undefined;
  const visible = (rows || []).filter((row) => showArchived || !row.archived);
  const archivedCount = (rows || []).filter((row) => row.archived).length;
  const groups = groupWordingChanges(visible);

  return (
    <main className="author-page" style={workspaceStyle}>
      <WorkspaceHeader current="/author/wording-changes" title="Wording changes" role={role} workspace={workspace} aside={<Link className="header-link" href="/author">Back to library</Link>} />
      <div className={styles.wrap}>
        <p className={styles.notice}><b>Read-only list.</b> Each line is siddur text an editor changed on a graphic. The graphic uses the edited words; the siddur source is never changed from here.</p>
        {resolved && !controlKey && <SignInCard description="Wording changes list this congregation’s graphics, so it needs an account with editor access." />}
        {error && <p className={styles.error}>{error}</p>}
        {controlKey && rows === null && !error && <p className={styles.summary}>Loading wording changes…</p>}
        {rows !== null && <>
          <div className={styles.controls}>
            <p className={styles.summary}>{visible.length === 1 ? "1 changed line" : `${visible.length} changed lines`} in {groups.length === 1 ? "1 source" : `${groups.length} sources`}.</p>
            {archivedCount > 0 && <label className={styles.toggle}><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Include archived graphics ({archivedCount})</label>}
          </div>
          {!visible.length && <p className={styles.empty}>No wording changes yet. When an editor edits a passage’s wording in the siddur picker, it appears here beside the exact source text.</p>}
          {groups.map((group) => <section key={group.sourceId} className={styles.group}>
            <header><h2>{group.sourceName}</h2><small>{[group.book, group.folio].filter(Boolean).join(" · ")}</small></header>
            {group.rows.map((row) => {
              const hebrew = row.channel === "he";
              const parts = wordDiff(row.sourceText, row.localText);
              return <article key={`${row.draftId}-${row.blockId}-${row.channel}`} className={styles.row}>
                <div className={styles.meta}>
                  <span>{row.blockNumber ? `Passage ${row.blockNumber}` : "Passage"} · {CHANNEL[row.channel]}</span>
                  <Link href={routeForDraft(row.draftId)}>{row.draftName}</Link>
                  <em className={row.published ? styles.published : styles.draft}>{row.archived ? "Archived" : row.published ? "Published" : "Draft"}</em>
                  <small>{formatTime(row.updatedAt)}{row.updatedBy ? ` · ${row.updatedBy}` : ""}</small>
                </div>
                <div className={styles.compare}>
                  <div><span>Siddur</span><p lang={hebrew ? "he" : undefined} dir={hebrew ? "rtl" : undefined}>{parts.filter((part) => part.kind !== "added").map((part, index) => part.kind === "removed" ? <del key={index}>{part.text}</del> : <span key={index}>{part.text}</span>)}</p></div>
                  <div><span>Edited</span><p lang={hebrew ? "he" : undefined} dir={hebrew ? "rtl" : undefined}>{parts.filter((part) => part.kind !== "removed").map((part, index) => part.kind === "added" ? <ins key={index}>{part.text}</ins> : <span key={index}>{part.text}</span>)}</p></div>
                </div>
                {row.reason && <p className={styles.reason}>Why: {row.reason}</p>}
              </article>;
            })}
          </section>)}
        </>}
      </div>
    </main>
  );
}
