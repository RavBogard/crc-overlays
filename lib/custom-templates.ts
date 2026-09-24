/**
 * F3 - the non-prayer template family.
 *
 * A congregation needs a speaker card, an announcement, a scripture citation and a start time
 * far more often than it needs another siddur graphic, and none of those belong in the catalog
 * as new baseline cues. So this module is a family of *guided forms* over the plain custom-text
 * draft the editor already stores: each one names its fields, and `compose` turns the values
 * into exactly the `{name, title, text}` a custom draft carries. Nothing new is stored, and a
 * draft made this way re-opens as ordinary custom text.
 *
 * Client-safe and pure: no server imports, no catalog ids.
 */

import type { LayoutId } from "./layout-registry";

export type CustomTemplateLayout = LayoutId;

export type CustomTemplateField = { key: string; label: string; placeholder: string; maxLength: number; dir?: "rtl" };

export type CustomTemplate = {
  id: "speaker" | "announcement" | "citation" | "service-begins" | "corner";
  label: string;
  description: string;
  layout: CustomTemplateLayout;
  fields: CustomTemplateField[];
  compose(values: Record<string, string>): { name: string; title: string; text: string };
};

/** The form a template shows, without its compose function: what `list_custom_templates` returns. */
export function describeCustomTemplate(template: CustomTemplate) {
  return { id: template.id, label: template.label, description: template.description, layout: template.layout, fields: template.fields.map((field) => ({ ...field })) };
}
export function customTemplate(id: string): CustomTemplate | undefined { return CUSTOM_TEMPLATES.find((template) => template.id === id); }
/**
 * R-A6 - what is wrong with values an agent sends to `compose_custom_draft`, one sentence per
 * problem, naming the field and what to do. Empty means the values can be composed.
 */
export function customTemplateProblems(template: CustomTemplate, values: Record<string, unknown>): string[] {
  const known = new Map(template.fields.map((field) => [field.key, field]));
  const problems: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    const field = known.get(key);
    if (!field) { problems.push(`${template.label} has no field called ${key}; its fields are ${template.fields.map((item) => item.key).join(", ")}.`); continue; }
    if (typeof value !== "string") problems.push(`${field.label} (${key}) must be text.`);
    else if (value.trim().length > field.maxLength) problems.push(`${field.label} (${key}) is ${value.trim().length} characters; shorten it to ${field.maxLength} or fewer.`);
  }
  if (!problems.length && !template.fields.some((field) => typeof values[field.key] === "string" && (values[field.key] as string).trim())) problems.push(`Fill in at least one field of ${template.label}: ${template.fields.map((item) => item.key).join(", ")}.`);
  return problems;
}

/** The editor's own library-name limit, so a composed name never arrives already too long. */
const NAME_LIMIT = 80;

const read = (values: Record<string, string>, key: string) => (values[key] || "").trim();

/** "Speaker · Rabbi Miriam Cohen" - the label, then as much of the distinguishing value as fits. */
function libraryName(label: string, value: string): string {
  const short = value.trim();
  if (!short) return label;
  const room = NAME_LIMIT - label.length - 3;
  return room <= 0 ? label.slice(0, NAME_LIMIT) : `${label} · ${short.slice(0, room)}`;
}

export const CUSTOM_TEMPLATES: readonly CustomTemplate[] = [
  {
    id: "speaker",
    label: "Speaker",
    description: "A name and the role they are speaking in.",
    layout: "bottom",
    fields: [
      { key: "name", label: "Name", placeholder: "Rabbi Miriam Cohen", maxLength: 100 },
      { key: "role", label: "Role", placeholder: "Guest speaker", maxLength: 100 },
    ],
    compose(values) {
      const name = read(values, "name");
      return { name: libraryName(this.label, name), title: name, text: read(values, "role") };
    },
  },
  {
    id: "announcement",
    label: "Announcement",
    description: "A heading and a short message for the congregation.",
    layout: "bottom",
    fields: [
      { key: "heading", label: "Heading", placeholder: "Announcement", maxLength: 100 },
      { key: "body", label: "Message", placeholder: "Kiddush follows in the social hall.", maxLength: 300 },
    ],
    compose(values) {
      const heading = read(values, "heading") || "Announcement";
      return { name: libraryName(this.label, read(values, "body")), title: heading, text: read(values, "body") };
    },
  },
  {
    id: "citation",
    label: "Scripture citation",
    description: "A passage, with the page it is printed on.",
    layout: "bottom",
    fields: [
      { key: "heading", label: "Heading", placeholder: "Torah reading", maxLength: 100 },
      { key: "passage", label: "Passage", placeholder: "Genesis 22:1–19", maxLength: 120 },
      { key: "page", label: "Page", placeholder: "70", maxLength: 12 },
    ],
    compose(values) {
      const passage = read(values, "passage");
      const page = read(values, "page");
      return {
        name: libraryName(this.label, passage),
        title: read(values, "heading") || "Torah reading",
        text: page ? `${passage} · p. ${page}` : passage,
      };
    },
  },
  {
    id: "service-begins",
    label: "Service begins at",
    description: "A start time, held on screen. Nothing counts down.",
    layout: "bottom",
    fields: [{ key: "time", label: "Time", placeholder: "10:30 AM", maxLength: 40 }],
    compose(values) {
      const time = read(values, "time");
      return { name: libraryName(this.label, time), title: "Service begins at", text: time };
    },
  },
  {
    // The small bottom-right card (the old Singular pop-up): a response such as "Vaimru Amen"
    // with its Hebrew, a name said for healing, a one-line thank-you. The Hebrew line comes
    // first; the renderer sets each line in its own direction, Hebrew right-aligned.
    id: "corner",
    label: "Corner card",
    description: "A line or two in the bottom-right corner: a response, a short prayer, a thank-you.",
    layout: "corner",
    fields: [
      { key: "heading", label: "Heading", placeholder: "Response", maxLength: 60 },
      { key: "hebrew", label: "Hebrew", placeholder: "וְאִמְרוּ אָמֵן", maxLength: 80, dir: "rtl" },
      { key: "line", label: "Line", placeholder: "Vaimru Amen", maxLength: 80 },
    ],
    compose(values) {
      const hebrew = read(values, "hebrew");
      const line = read(values, "line");
      return {
        name: libraryName(this.label, line || hebrew),
        title: read(values, "heading") || "Response",
        text: [hebrew, line].filter(Boolean).join("\n"),
      };
    },
  },
];
