"use client";

import type { Presentation } from "./types";
import { useState } from "react";
import "./typography-controls.css";

const ROLES = [
  { label: "Hebrew", size: "hebrewFontSize", height: "hebrewLineHeight", spacing: "hebrewLetterSpacing", min: 24, max: 52 },
  { label: "Transliteration", size: "transliterationFontSize", height: "transliterationLineHeight", spacing: "transliterationLetterSpacing", min: 20, max: 48 },
  { label: "Translation / English reading", size: "translationFontSize", height: "translationLineHeight", spacing: "translationLetterSpacing", min: 20, max: 48 },
  { label: "Titles", size: "titleFontSize", height: "titleLineHeight", spacing: "titleLetterSpacing", min: 20, max: 42 },
] as const;

export function TypographyControls({ presentation, change }: { presentation: Presentation; change: (value: Presentation) => void }) {
  function set(field: keyof Presentation, value: unknown) {
    const next = { ...presentation };
    if (value === undefined || value === "") delete next[field];
    else Object.assign(next, { [field]: value });
    change(next);
  }
  return <div className="typography-controls">
    <fieldset><legend>Panel position</legend>
      <label>Vertical alignment<select value={presentation.verticalAlignment || ""} onChange={(event) => set("verticalAlignment", event.target.value)}>
        <option value="">Template default</option><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option>
      </select></label>
      <label className="typography-checkbox"><input type="checkbox" checked={presentation.keepHyphenatedWords === true} onChange={(event) => set("keepHyphenatedWords", event.target.checked)} /> Keep hyphenated words together</label>
    </fieldset>
    <fieldset><legend>Hebrew appearance</legend>
      <label>Hebrew font<select value={presentation.hebrewFontFamily || ""} onChange={(event) => set("hebrewFontFamily", event.target.value)}>
        <option value="">Template default</option><option value="noto-sans">Noto Sans Hebrew</option><option value="david-libre">David Libre — serif</option><option value="frank-ruhl-libre">Frank Ruhl Libre — serif</option>
      </select></label>
      <label className="typography-checkbox"><input type="checkbox" checked={presentation.legacyTitleWatermark === true} onChange={(event) => set("legacyTitleWatermark", event.target.checked)} /> Faint Hebrew watermark behind title</label>
      <p className="control-note">Uses the Hebrew accent title without vowels. The saved wording stays intact.</p>
      <button type="button" onClick={() => change({ ...presentation, hebrewFontFamily: "david-libre", verticalAlignment: "top", legacyTitleWatermark: true })}>Apply classic panel style</button>
    </fieldset>
    <details><summary>Individual text settings</summary>
      <p className="control-note">Blank values follow the template. These controls override shared line spacing for each text role.</p>
      {ROLES.map((role) => <fieldset key={role.size}><legend>{role.label}</legend><div className="typography-role">
        <label>Size (px)<NumberSetting label={`${role.label} font size`} min={role.min} max={role.max} step={1} value={presentation[role.size]} change={(value) => set(role.size, value)} /></label>
        <label>Line height<NumberSetting label={`${role.label} line height`} min={0.9} max={2} step={0.05} value={presentation[role.height]} change={(value) => set(role.height, value)} /></label>
        <label>Letter spacing (px)<NumberSetting label={`${role.label} letter spacing`} min={-2} max={8} step={0.25} value={presentation[role.spacing]} change={(value) => set(role.spacing, value)} /></label>
      </div></fieldset>)}
    </details>
    {presentation.largePrint && <p className="control-note">Large print keeps the requested text size. If it does not fit, shorten the text or split it across slides.</p>}
  </div>;
}

function NumberSetting({ label, min, max, step, value, change }: { label: string; min: number; max: number; step: number; value?: number; change: (value?: number) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [previousValue, setPreviousValue] = useState(value);
  if (value !== previousValue) {
    setPreviousValue(value);
    setText(value === undefined ? "" : String(value));
  }
  function edit(next: string) {
    setText(next);
    if (!next.trim()) { change(undefined); return; }
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max && (step !== 1 || Number.isInteger(parsed))) change(parsed);
  }
  function commit() {
    if (!text.trim()) return change(undefined);
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return setText(value === undefined ? "" : String(value));
    const bounded = Math.min(max, Math.max(min, step === 1 ? Math.round(parsed) : parsed));
    setText(String(bounded));
    change(bounded);
  }
  return <input aria-label={label} type="number" min={min} max={max} step={step} placeholder="Default" value={text} onChange={(event) => edit(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />;
}
