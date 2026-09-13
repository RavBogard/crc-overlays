"use client";

import { CircleAlert, Sparkles } from "lucide-react";
import type { DraftForm, DuplicateNameWarning } from "./types";

export function CustomTextEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <section className="form-section custom-section"><div className="section-heading"><span>1</span><div><h3>Write the graphic</h3><p>For announcements, welcome messages, names, and community-specific readings.</p></div></div><label>Custom text <span>{form.customText.length} / 4000</span><textarea value={form.customText} maxLength={4000} onChange={(event) => changeForm({ customText: event.target.value })} placeholder="Type the words that should appear on screen…" /></label><div className="provenance-note"><Sparkles size={17} /><span><strong>Custom congregation text</strong><small>This text is separate from the authorized siddur library.</small></span></div></section>;
}

export function DetailsEditor({ form, changeForm, nameWarning, useSuggestedName }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void; nameWarning: DuplicateNameWarning | null; useSuggestedName: () => void }) {
  return <section className="form-section details-section"><div className="section-heading"><span>2</span><div><h3>Name and title</h3><p>Names help the operator find the right graphic.</p></div></div><label>Library name<input value={form.name} maxLength={80} onChange={(event) => changeForm({ name: event.target.value })} placeholder="Example: Welcome to Shabbat" /></label>{nameWarning && <p className="name-warning"><CircleAlert size={15} /><span>Another graphic is already named this. Suggested: “{nameWarning.suggestedName}”.</span><button type="button" onClick={useSuggestedName}>Use suggested name</button></p>}<div className="field-pair"><label>On-screen title<input value={form.title} maxLength={100} onChange={(event) => changeForm({ title: event.target.value })} /></label><label>Hebrew accent <span>optional</span><input dir="rtl" value={form.accentTitle} maxLength={60} onChange={(event) => changeForm({ accentTitle: event.target.value })} /></label></div></section>;
}
