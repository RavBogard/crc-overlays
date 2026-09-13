import type { Cue } from "@/lib/player";

export type Layout = "bottom" | "left" | "right";
export type ContentMode = "bilingual" | "original-en" | "custom";
export type Presentation = {
  hebrewFontSize?: number;
  transliterationFontSize?: number;
  titleFontSize?: number;
};
export type SourceGroup = { sourceId: string; blockIds: string[] };
export type DraftContent =
  | {
      mode: "bilingual";
      hebrewGroups: SourceGroup[];
      transliterationGroups: SourceGroup[];
      includeTranslation?: boolean;
    }
  | { mode: "original-en"; englishGroups: SourceGroup[] }
  | { mode: "custom"; text: string };
export type Draft = {
  id: string;
  name: string;
  title: string;
  accentTitle?: string;
  layout: Layout;
  templateCueId: string;
  content: DraftContent;
  presentation: Presentation;
  version: number;
  activeRevision: number | null;
  activeDraftVersion: number | null;
  draftSetId?: string;
  setIndex?: number;
  setCount?: number;
  updatedAt: number;
};
export type SourceBlock = {
  id: string;
  index: number;
  kind: Exclude<ContentMode, "custom"> | "translation-en";
  pairedBlockIds?: string[];
  he?: string;
  tr?: string;
  en?: string;
  role?: "original";
};
export type Source = {
  id: string;
  name: string;
  section: string | number | null;
  book?: string;
  bookValue?: string;
  bookLabel?: string;
  service?: string;
  origin?: string;
  aliases?: string[];
  openingWords?: string[];
  blocks: SourceBlock[];
};
export type SourceSummary = Omit<Source, "blocks"> & {
  blockCount: number;
  kinds: Exclude<ContentMode, "custom">[];
};
export type SourceFacet = { value: string; label: string; count: number };
export type TemplateSummary = {
  id: string;
  name: string;
  layout: Layout;
  importable: boolean;
};
export type PreviewResult = {
  previewId: string;
  draftVersion: number;
  cue: Cue;
  validation: { valid: boolean; errors: string[]; warnings: string[] };
};
export type EphemeralPreviewResult = {
  cue: Cue;
  validation: { valid: boolean; errors: string[]; warnings: string[] };
  ephemeral: true;
};
export type CatalogCue = {
  id: string;
  name: string;
  title: string;
  layout: Layout;
  hidden: boolean;
  origin: "canonical" | "local" | "legacy";
  draftId: string | null;
  draftVersion: number | null;
  activeRevision: number | null;
  canEdit: boolean;
  canDuplicate: boolean;
  editAction: "open" | "import" | "duplicate";
};
export type BrowserMeasurement = {
  viewportWidth: 1920;
  viewportHeight: 1080;
  fontsReady: true;
  overflow: false;
  rendererVersion: string;
  measuredAt: number;
};
export type ReviewReceipt = {
  draftId: string;
  draftVersion: number;
  previewId: string;
  cueHash: string;
};
export type PublishedRevision = {
  revision: number;
  draftVersion: number;
  createdAt: number;
  actor: string;
};
export type DraftForm = {
  includeTranslation?: boolean;
  name: string;
  title: string;
  accentTitle: string;
  layout: Layout;
  templateCueId: string;
  mode: ContentMode;
  groups: SourceGroup[];
  customText: string;
  presentation: Presentation;
};
