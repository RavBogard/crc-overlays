"use client";

import { ArrowDown, ArrowUp, CircleAlert, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { CUSTOM_TEMPLATES, type CustomTemplate } from "@/lib/custom-templates";
import { templateLayoutFor } from "@/lib/layout-label";
import { EditorCard } from "./editor-card";
import type { CustomRow, DraftForm, DuplicateNameWarning, TemplateSummary } from "./types";

/** Matches the server's limit (CUSTOM_ROW_LIMIT in lib/authoring-model.ts). */
const LINE_LIMIT = 24;
const emptyLine = (): CustomRow => ({ he: "", tr: "", en: "" });

/**
 * Lines: the congregation's own Hebrew, set like a siddur passage. Each line is a Hebrew line, its
 * transliteration and an optional translation; they build into the same channels and panel rows a
 * source-backed graphic gets, so Hebrew no siddur holds still reads right to left in its own face.
 */
function CustomLinesEditor({ rows, onChange }: { rows: CustomRow[]; onChange: (rows: CustomRow[]) => void }) {
  const set = (index: number, patch: Partial<CustomRow>) => onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const move = (index: number, by: number) => { const next = [...rows]; const [row] = next.splice(index, 1); next.splice(index + by, 0, row); onChange(next); };
  return <div className="custom-lines">
    {rows.map((row, index) => <fieldset key={index} className="custom-line">
      <legend>Line {index + 1}</legend>
      <div className="custom-line-actions">
        <button type="button" aria-label={`Move line ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13} /></button>
        <button type="button" aria-label={`Move line ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13} /></button>
        <button type="button" aria-label={`Remove line ${index + 1}`} disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, at) => at !== index))}><Trash2 size={13} /></button>
      </div>
      <label>Hebrew<textarea dir="rtl" lang="he" rows={2} maxLength={1000} value={row.he} onChange={(event) => set(index, { he: event.target.value })} placeholder="בָּרוּךְ אַתָּה" /></label>
      <label>Transliteration<textarea rows={2} maxLength={1000} value={row.tr} onChange={(event) => set(index, { tr: event.target.value })} placeholder="Baruch atah" /></label>
      <label>Translation <span>optional</span><textarea rows={2} maxLength={1000} value={row.en} onChange={(event) => set(index, { en: event.target.value })} placeholder="Blessed are you" /></label>
    </fieldset>)}
    <button type="button" className="custom-line-add" disabled={rows.length >= LINE_LIMIT} onClick={() => onChange([...rows, emptyLine()])}><Plus size={14} />Add line</button>
    <p className="guided-note">Each line shows its Hebrew right to left, with the transliteration and translation in their own styles. A side panel shows one row per line; a lower third shows the Hebrew and transliteration as its two columns.</p>
  </div>;
}

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
    const baseline = templates.find((item) => item.layout === templateLayoutFor(template.layout));
    composeInto(template, {}, { layout: template.layout, templateCueId: baseline?.id || form.templateCueId });
  };

  return <EditorCard number={1} title="Text" lede="For announcements, welcome messages, names, and community-specific readings." className="custom-section">
    <div className="start-from" role="group" aria-label="Kind of text"><span className="start-from-label">Kind of text</span><div className="start-from-options"><button type="button" aria-pressed={!form.customRows} className={!form.customRows ? "active" : ""} onClick={() => changeForm({ customRows: null })}>Plain text</button><button type="button" aria-pressed={Boolean(form.customRows)} className={form.customRows ? "active" : ""} onClick={() => { setActiveId(""); changeForm({ customRows: form.customRows ?? [emptyLine()] }); }}>Hebrew lines</button></div></div>
    {form.customRows ? <CustomLinesEditor rows={form.customRows} onChange={(rows) => changeForm({ customRows: rows })} /> : <>
    <div className="start-from" role="group" aria-label="Start from"><span className="start-from-label">Start from</span><div className="start-from-options"><button type="button" aria-pressed={!active} className={!active ? "active" : ""} onClick={() => chooseTemplate(null)}>Blank</button>{CUSTOM_TEMPLATES.map((template) => <button key={template.id} type="button" aria-pressed={activeId === template.id} className={activeId === template.id ? "active" : ""} title={template.description} onClick={() => chooseTemplate(template)}>{template.label}</button>)}</div></div>
    {active ? <div className="guided-fields"><p className="guided-note">{active.description}</p>{active.fields.map((field) => <label key={field.key}>{field.label}<input value={values[field.key] || ""} dir={field.dir} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => { const next = { ...values, [field.key]: event.target.value }; setValues(next); composeInto(active, next); }} /></label>)}<p className="guided-note">Choose <strong>Blank</strong> to edit these words directly.</p></div>
      : <label>Custom text <span>{form.customText.length} / 4000</span><textarea value={form.customText} maxLength={4000} onChange={(event) => changeForm({ customText: event.target.value })} placeholder="Type the words that should appear on screen…" /></label>}
    </>}
    <div className="provenance-note"><Sparkles size={17} /><span><strong>{active ? `${active.label} · ` : ""}Custom congregation text</strong><small>This text is separate from the authorized siddur library.</small></span></div></EditorCard>;
}

export function DetailsEditor({ form, changeForm, nameWarning, useSuggestedName }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void; nameWarning: DuplicateNameWarning | null; useSuggestedName: () => void }) {
  return <EditorCard number={2} title="Name" lede="Names help the operator find the right graphic." className="details-section"><label>Library name<input value={form.name} maxLength={80} onChange={(event) => changeForm({ name: event.target.value })} placeholder="Example: Welcome to Shabbat" /></label>{nameWarning && <p className="name-warning"><CircleAlert size={15} /><span>Another graphic is already named this. Suggested: “{nameWarning.suggestedName}”.</span><button type="button" onClick={useSuggestedName}>Use suggested name</button></p>}<div className="field-pair"><label>On-screen title<input value={form.title} maxLength={100} onChange={(event) => changeForm({ title: event.target.value })} /></label><label>Hebrew accent <span>optional</span><input dir="rtl" value={form.accentTitle} maxLength={60} onChange={(event) => changeForm({ accentTitle: event.target.value })} /></label></div></EditorCard>;
}
