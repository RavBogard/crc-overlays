"use client";

import { CircleAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { CUSTOM_TEMPLATES, type CustomTemplate } from "@/lib/custom-templates";
import type { DraftForm, DuplicateNameWarning, TemplateSummary } from "./types";

/**
 * F3 - "Start from" is a set of guided forms over the same plain custom-text draft. The guided
 * values live only in this component; every keystroke composes them into `{title, customText,
 * name}` through `changeForm`, so undo, redo, autosave and recovery behave exactly as they do
 * for hand-typed text, and re-opening the saved draft shows the plain editor again.
 */
export function CustomTextEditor({ form, changeForm, templates }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void; templates: TemplateSummary[] }) {
  const [activeId, setActiveId] = useState<CustomTemplate["id"] | "">("");
  const [values, setValues] = useState<Record<string, string>>({});
  const active = CUSTOM_TEMPLATES.find((item) => item.id === activeId) || null;

  const composeInto = (template: CustomTemplate, next: Record<string, string>, extra: Partial<DraftForm> = {}) => {
    const composed = template.compose(next);
    changeForm({ title: composed.title, customText: composed.text, name: composed.name, ...extra });
  };

  const chooseTemplate = (template: CustomTemplate | null) => {
    setValues({});
    setActiveId(template?.id || "");
    if (!template) return;
    // Only a draft with nothing in it yet is composed (and has its layout chosen) on pick; words
    // already typed stay until the first guided keystroke, so choosing a starter never erases them.
    const untouched = !form.customText.trim() && !form.title.trim();
    if (!untouched) return;
    const baseline = templates.find((item) => item.layout === template.layout);
    composeInto(template, {}, { layout: template.layout, templateCueId: baseline?.id || form.templateCueId });
  };

  return <section className="form-section custom-section"><div className="section-heading"><span>1</span><div><h3>Write the graphic</h3><p>For announcements, welcome messages, names, and community-specific readings.</p></div></div>
    <div className="start-from" role="group" aria-label="Start from"><span className="start-from-label">Start from</span><div className="start-from-options"><button type="button" aria-pressed={!active} className={!active ? "active" : ""} onClick={() => chooseTemplate(null)}>Blank</button>{CUSTOM_TEMPLATES.map((template) => <button key={template.id} type="button" aria-pressed={activeId === template.id} className={activeId === template.id ? "active" : ""} title={template.description} onClick={() => chooseTemplate(template)}>{template.label}</button>)}</div></div>
    {active ? <div className="guided-fields"><p className="guided-note">{active.description}</p>{active.fields.map((field) => <label key={field.key}>{field.label}<input value={values[field.key] || ""} dir={field.dir} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => { const next = { ...values, [field.key]: event.target.value }; setValues(next); composeInto(active, next); }} /></label>)}<p className="guided-note">Choose <strong>Blank</strong> to edit these words directly.</p></div>
      : <label>Custom text <span>{form.customText.length} / 4000</span><textarea value={form.customText} maxLength={4000} onChange={(event) => changeForm({ customText: event.target.value })} placeholder="Type the words that should appear on screen…" /></label>}
    <div className="provenance-note"><Sparkles size={17} /><span><strong>{active ? `${active.label} · ` : ""}Custom congregation text</strong><small>This text is separate from the authorized siddur library.</small></span></div></section>;
}

export function DetailsEditor({ form, changeForm, nameWarning, useSuggestedName }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void; nameWarning: DuplicateNameWarning | null; useSuggestedName: () => void }) {
  return <section className="form-section details-section"><div className="section-heading"><span>2</span><div><h3>Name and title</h3><p>Names help the operator find the right graphic.</p></div></div><label>Library name<input value={form.name} maxLength={80} onChange={(event) => changeForm({ name: event.target.value })} placeholder="Example: Welcome to Shabbat" /></label>{nameWarning && <p className="name-warning"><CircleAlert size={15} /><span>Another graphic is already named this. Suggested: “{nameWarning.suggestedName}”.</span><button type="button" onClick={useSuggestedName}>Use suggested name</button></p>}<div className="field-pair"><label>On-screen title<input value={form.title} maxLength={100} onChange={(event) => changeForm({ title: event.target.value })} /></label><label>Hebrew accent <span>optional</span><input dir="rtl" value={form.accentTitle} maxLength={60} onChange={(event) => changeForm({ accentTitle: event.target.value })} /></label></div></section>;
}
