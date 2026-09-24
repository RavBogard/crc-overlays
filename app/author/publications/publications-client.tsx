"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { AccessRole } from "@/lib/access";
import { fetchAccessUser } from "@/lib/access-client";
import { layoutLabel } from "@/lib/layout-label";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import SignInCard from "@/components/sign-in-card";
import { authoringCall } from "../api";
import { routeForDraft } from "../editor-state";
import { formatTime } from "../library-model";
import { RANGES, imageUrl, publicationStatus, publishedByLine, rollbackOffer, type PublicationRow, type RangeId } from "./publications-model";
import "../author.css";
import styles from "./publications.module.css";

async function fetchPublications(range: RangeId, assistantOnly: boolean): Promise<PublicationRow[]> {
  const since = Date.now() - (RANGES.find((item) => item.id === range)?.ms ?? RANGES[1].ms);
  const response = await fetch(`/api/authoring/publications?since=${since}${assistantOnly ? "&who=agent" : ""}`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as { publications?: PublicationRow[]; error?: string } | null;
  if (!response.ok) throw Error(body?.error || "Recent publications could not be loaded.");
  return body?.publications || [];
}

/**
 * Recent publications (R-A2): every graphic published lately, with the picture the server
 * checked before it went out, so a person can look over what an assistant published and put
 * back the previous version in one click.
 */
export default function PublicationsClient() {
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [signedIn, setSignedIn] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [rows, setRows] = useState<PublicationRow[] | null>(null);
  const [range, setRange] = useState<RangeId>("week");
  const [assistantOnly, setAssistantOnly] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reloads, setReloads] = useState(0);

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
      if (user && ["owner", "editor"].includes(user.role)) { setRole(user.role as AccessRole); setSignedIn(true); }
      setResolved(true);
    };
    void start().catch((value) => {
      if (cancelled) return;
      setError(value instanceof Error ? value.message : "Recent publications could not be loaded.");
      setResolved(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetchPublications(range, assistantOnly).then(
      (list) => { if (!cancelled) setRows(list); },
      (value) => { if (!cancelled) setError(value instanceof Error ? value.message : "Recent publications could not be loaded."); },
    );
    return () => { cancelled = true; };
  }, [signedIn, range, assistantOnly, reloads]);

  const goBack = async (row: PublicationRow) => {
    if (row.rollbackTo === null || row.draftVersion === null) return;
    const key = `${row.draftId}:${row.revision}`;
    setBusy(key); setNotice(""); setError("");
    try {
      await authoringCall("session", "rollback_draft", { draftId: row.draftId, expectedVersion: row.draftVersion, revision: row.rollbackTo });
      setNotice(`${row.name} is back to its previous version.`);
      setReloads((count) => count + 1);
    } catch (value) {
      setError(value instanceof Error ? `${row.name} could not go back: ${value.message}` : `${row.name} could not go back.`);
    } finally { setBusy(null); }
  };

  const workspaceStyle = workspace ? {
    "--workspace-primary": workspace.colors.primary,
    "--workspace-deep": workspace.colors.deep,
    "--workspace-accent": workspace.colors.accent,
  } as CSSProperties : undefined;
  const rangeLabel = RANGES.find((item) => item.id === range)?.label.toLowerCase() ?? "";

  return (
    <main className="author-page" style={workspaceStyle}>
      <WorkspaceHeader current="/author/publications" title="Recent publications" role={role} workspace={workspace} aside={<Link className="header-link" href="/author">Back to library</Link>} />
      <div className={styles.wrap}>
        <p className={styles.notice}><b>Look over what was published.</b> Each graphic shows the picture that was checked on the server before it went out. If one is wrong, <b>Go back</b> puts the previous version back in use. Nothing here puts anything on screen.</p>
        {resolved && !signedIn && <SignInCard description="Recent publications list this congregation’s graphics, so it needs an account with editor access." />}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.done} role="status">{notice}</p>}
        {signedIn && <div className={styles.controls}>
          <label className={styles.field}>Show
            <select value={range} onChange={(event) => { setError(""); setRange(event.target.value as RangeId); }}>
              {RANGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className={styles.toggle}><input type="checkbox" checked={assistantOnly} onChange={(event) => { setError(""); setAssistantOnly(event.target.checked); }} /> Only what an assistant published</label>
        </div>}
        {(!resolved || signedIn) && rows === null && !error && <p className={styles.summary}>Loading recent publications…</p>}
        {rows !== null && <>
          <p className={styles.summary}>{rows.length === 1 ? "1 publication" : `${rows.length} publications`} in the {rangeLabel}.</p>
          {!rows.length && <p className={styles.empty}>{assistantOnly ? `Nothing was published by an assistant in the ${rangeLabel}.` : `Nothing was published in the ${rangeLabel}.`}</p>}
          <div className={styles.list}>
            {rows.map((row) => {
              const status = publicationStatus(row);
              const offer = rollbackOffer(row);
              const key = `${row.draftId}:${row.revision}`;
              return <article key={key} className={styles.card}>
                <div className={styles.frame}>
                  {row.image && row.previewId
                    // eslint-disable-next-line @next/next/no-img-element -- an authenticated, private frame; the image optimizer cannot fetch it
                    ? <img src={imageUrl(row.previewId)} alt={`The checked picture of ${row.name}`} width={row.image.width} height={row.image.height} loading="lazy" />
                    : <p>No picture was kept for this one.</p>}
                </div>
                <div className={styles.body}>
                  <header>
                    <h2>{row.name}</h2>
                    <em className={styles[status.tone]}>{status.label}</em>
                  </header>
                  <p className={styles.meta}>{layoutLabel(row.layout)} · {formatTime(row.publishedAt)}</p>
                  <p className={styles.meta}>{publishedByLine(row)}</p>
                  {row.excerpt && <p className={styles.excerpt}>{row.excerpt}</p>}
                  <div className={styles.actions}>
                    {offer.available && <button type="button" className={styles.back} disabled={busy !== null} onClick={() => void goBack(row)}>{busy === key ? "Going back…" : "Go back to the previous version"}</button>}
                    {!offer.available && offer.reason && <small>{offer.reason}</small>}
                    <Link href={routeForDraft(row.draftId)}>Open in the library</Link>
                  </div>
                </div>
              </article>;
            })}
          </div>
        </>}
      </div>
    </main>
  );
}
