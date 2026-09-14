"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * C1 of the 2026-09-14 layout pass — the three cards of the editor, given one treatment.
 *
 * Text, Name and Look were a numbered section, a numbered section and a drawer with an
 * unlabelled marker. They are now the same object: numbered, collapsible, with a real chevron.
 * A collapsed card shows its summary in place of its lede, so closing Look still tells you what
 * the look currently is.
 */
export function EditorCard({ number, title, lede, summary, className = "", defaultOpen = true, children }: {
  number: number;
  title: string;
  lede?: string;
  /** Shown instead of the lede while the card is closed. */
  summary?: string;
  className?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`form-section editor-card ${className}`.trim()}>
    <button type="button" className="card-heading" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="card-number">{number}</span>
      <span className="card-title"><h3>{title}</h3>{open ? lede && <p>{lede}</p> : summary && <p>{summary}</p>}</span>
      <ChevronDown size={18} className={open ? "card-chevron open" : "card-chevron"} />
    </button>
    {open && <div className="card-body">{children}</div>}
  </section>;
}
