"use client";

import type { Presentation } from "./types";
import { useEffect, useState } from "react";
import { linePitchPx, matchingLineHeight, ROLE_SELECTORS, type LineRole } from "./line-pitch";
import "./typography-controls.css";

const ROLES = [
  { label: "Hebrew", size: "hebrewFontSize", height: "hebrewLineHeight", spacing: "hebrewLetterSpacing", min: 24, max: 52, line: "he" },
  { label: "Transliteration", size: "transliterationFontSize", height: "transliterationLineHeight", spacing: "transliterationLetterSpacing", min: 20, max: 48, line: "tr" },
  { label: "Translation / English reading", size: "translationFontSize", height: "translationLineHeight", spacing: "translationLetterSpacing", min: 20, max: 48, line: "en" },
  { label: "Titles", size: "titleFontSize", height: "titleLineHeight", spacing: "titleLetterSpacing", min: 20, max: 42, line: null },
] as const;

type Measured = { pitch: number; fontPx: number };
/** Each role's line spacing as the editor preview (#output in panels.tsx) actually draws it, kept current as the preview re-renders. */
function usePreviewLines(): Partial<Record<LineRole, Measured>> {
  const [lines, setLines] = useState<Partial<Record<LineRole, Measured>>>({});
  useEffect(() => {
    const output = document.querySelector<HTMLElement>(".author-output");
    if (!output) return;
    const measure = () => {
      const next: Partial<Record<LineRole, Measured>> = {};
      for (const role of ["he", "tr", "en"] as const) {
        const element = output.querySelector<HTMLElement>(ROLE_SELECTORS[role]);
        const style = element ? getComputedStyle(element) : null;
        const pitch = linePitchPx(style);
        if (style && pitch) next[role] = { pitch, fontPx: parseFloat(style.fontSize) };
      }
      setLines((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    measure();
    const observer = new MutationObserver(measure);
    observer.observe(output, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, []);
  return lines;
}

export function TypographyControls({ presentation, sidePanel = false, change }: { presentation: Presentation; sidePanel?: boolean; change: (value: Presentation) => void }) {
  const lines = usePreviewLines();
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
      {sidePanel && <label className="typography-checkbox"><input type="checkbox" checked={presentation.legacyTitleWatermark === true} onChange={(event) => set("legacyTitleWatermark", event.target.checked)} /> Faint Hebrew watermark behind title</label>}
      {sidePanel && <><p className="control-note">Uses the Hebrew accent title without vowels. The saved wording stays intact.</p>
      <button type="button" onClick={() => change({ ...presentation, hebrewFontFamily: "david-libre", verticalAlignment: "top", legacyTitleWatermark: true })}>Apply classic panel style</button></>}
    </fieldset>
    <details><summary>Individual text settings</summary>
      <p className="control-note">Blank values follow the template. These controls override shared line spacing for each text role.</p>
      {ROLES.map((role) => <fieldset key={role.size}><legend>{role.label}</legend><div className="typography-role">
        {sidePanel && role.size === "titleFontSize" ? <p className="control-note">Standard side-panel title: 42px, independent of text density.</p> : <label>Size (px)<NumberSetting label={`${role.label} font size`} min={role.min} max={role.max} step={1} value={presentation[role.size]} change={(value) => set(role.size, value)} /></label>}
        <label>Line height<NumberSetting label={`${role.label} line height`} min={0.9} max={2} step={0.05} value={presentation[role.height]} change={(value) => set(role.height, value)} />{role.line && lines[role.line] && <small className="line-pitch">{Math.round(lines[role.line]!.pitch)}px between lines</small>}</label>
        <label>Letter spacing (px)<NumberSetting label={`${role.label} letter spacing`} min={-2} max={8} step={0.25} value={presentation[role.spacing]} change={(value) => set(role.spacing, value)} /></label>
      </div>{(role.line === "tr" || role.line === "en") && <MatchHebrew hebrew={lines.he} own={lines[role.line]} apply={(value) => set(role.height, value)} />}</fieldset>)}
    </details>
    {presentation.largePrint && <p className="control-note">Large print keeps the requested text size. If it does not fit, shorten the text or split it across slides.</p>}
  </div>;
}

/** Sets this role's line height so its lines are as far apart as the Hebrew's in the preview. */
function MatchHebrew({ hebrew, own, apply }: { hebrew?: Measured; own?: Measured; apply: (value: number) => void }) {
  const value = hebrew && own ? matchingLineHeight(hebrew.pitch, own.fontPx) : null;
  const matched = Boolean(hebrew && own && Math.abs(hebrew.pitch - own.pitch) < 1);
  const title = !hebrew || !own ? "Shows when the preview has Hebrew and this text" : matched ? "Already spaced like the Hebrew" : `Sets line height ${value} so lines are ${Math.round(hebrew.pitch)}px apart, like the Hebrew`;
  return <button type="button" className="match-hebrew" disabled={value === null || matched} title={title} onClick={() => { if (value !== null) apply(value); }}>{matched ? "Matches Hebrew spacing" : "Match Hebrew spacing"}</button>;
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
