"use client";

import { useEffect, useRef } from "react";

export function FitIssueDialog({ issues, cancel, confirm }: { issues: string[]; cancel: () => void; confirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labels: Record<string, string> = { textMainEng: "Transliteration", textMainheb: "Hebrew", textTranslation: "English", textTitle: "Title", accentTextTitle: "Hebrew title", textMain: "Text" };
  const description = issues.map((issue) => {
    const text = issue.replace(/\.$/, "").replace(/\b(textMainEng|textMainheb|textTranslation|textTitle|accentTextTitle|textMain)\b/g, (role) => labels[role]);
    return `overlapping blocks (${text.replace(" overlaps ", " and ")})`;
  }).join("; ");
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="fit-issue-dialog duplicate-name-dialog" aria-labelledby="fit-issue-title" onCancel={cancel}>
    <header><h3 id="fit-issue-title">Publish anyway?</h3></header>
    <p>This overlay has {description}. Publish anyway?</p>
    <footer><button type="button" autoFocus onClick={cancel}>Cancel</button><button type="button" className="primary-button" onClick={confirm}>Publish</button></footer>
  </dialog>;
}
