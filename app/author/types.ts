import type { Cue } from "@/lib/player";

export type Layout = "bottom" | "left" | "right";
export type CanonicalContentMode = "bilingual" | "source-en" | "original-en";
export type ContentMode = CanonicalContentMode | "local-variant" | "custom";
export type SourceEnglishRole = "translation" | "interpretation" | "translation-interpretation" | "reading" | "kavannah" | "rubric" | "note" | "unclassified";
export type Presentation = {
  hebrewFontSize?: number;
  transliterationFontSize?: number;
  titleFontSize?: number;
  alignment?: "start" | "center";
  lineSpacing?: "compact" | "spacious";
  imageAssetId?: string;
};
export type SourceGroup = { sourceId: string; blockIds: string[] };
/** Printed provenance for one source, as `search_sources` / `get_source` return it (lib/source-library.ts). */
export type SourceDisplay = { bookTitle: string; folio: string | null; sectionTitle: string | null; edition: string | null };
/** A save-time warning that another library graphic already carries this name (R6). */
export type DuplicateNameWarning = { code: "duplicate-name"; suggestedName: string };
export type CanonicalDraftContent =
  | {
      mode: "bilingual";
      hebrewGroups: SourceGroup[];
      transliterationGroups: SourceGroup[];
      includeTranslation?: boolean;
    }
  | { mode: "source-en" | "original-en"; englishGroups: SourceGroup[] };
export type VariantChannel = "he" | "tr" | "en";
export type LocalVariantOverride = {
  sourceId: string;
  blockId: string;
  channel: VariantChannel;
  sourceText: string;
  localText: string;
};
export type DraftContent =
  | CanonicalDraftContent
  | { mode: "local-variant"; label: string; reason?: string; base: CanonicalDraftContent; overrides: LocalVariantOverride[] }
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
  sourceSnapshots?: Source[];
  sharedFrom?: { workspaceId: string; cueId: string; cueHash: string };
  archivedAt?: number;
  archivedBy?: string;
  updatedAt: number;
};
export type SourceBlock = {
  id: string;
  index: number;
  kind: CanonicalContentMode | "translation-en";
  pairedBlockIds?: string[];
  he?: string;
  tr?: string;
  en?: string;
  role?: "original";
  englishRole?: SourceEnglishRole;
  automatic?: boolean;
  parallelBlockIds?: string[];
  noteLike?: boolean;
  sourceLabel?: string;
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
  unitSha256?: string;
  sourceSha256?: string;
  metadata?: {
    bookTitle?: string;
    familyLabel?: string;
    sectionTitle?: string;
    folios?: Array<string | number>;
  };
  display?: SourceDisplay;
  authority?: {
    repository?: string;
    repositoryCommit?: string;
    feed?: string;
    unitId?: string;
    unitSha256?: string;
  };
  blocks: SourceBlock[];
};
export type SourceSummary = Omit<Source, "blocks"> & {
  blockCount: number;
  kinds: CanonicalContentMode[];
  coverage?: {
    bilingual: number;
    originalEnglish: number;
    sourceEnglish: number;
    automaticSourceEnglish: number;
    noteLikeEnglish: number;
  };
};
export type SourceDisplayResult = { source: Source; display?: SourceDisplay };
export type SourceFacet = { value: string; label: string; count: number };
/** A book as the facet list names it, without the count. */
export type BookRef = { value: string; label: string };
/** One unit in a book outline (`list_book_units`): enough to choose by, never the text itself. */
export type BookUnit = {
  id: string;
  name: string;
  folio: string | null;
  kinds: SourceBlock["kind"][];
  blockCount: number;
  /** Only source English a siddur prints as a note — never prayer text to lead from. */
  noteLikeOnly: boolean;
};
/** A printed section of a book; `title` is null for a book that prints no section names. */
export type BookUnitSection = { index: number; title: string | null; units: BookUnit[] };
/** The printed outline of one book, in printed order. `noteLikeOnly` counts note-only units. */
export type BookUnitsResult = {
  book: BookRef;
  service: string | null;
  sections: BookUnitSection[];
  total: number;
  noteLikeOnly: number;
};
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
/** `preview_baseline_cue` returns the same stored-nothing shape as `preview_content`. */
export type BaselinePreviewResult = EphemeralPreviewResult;
export type CatalogCue = {
  id: string;
  name: string;
  title: string;
  layout: Layout;
  hidden: boolean;
  origin: "canonical" | "local" | "legacy" | "variant";
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
  variantLabel: string;
  variantReason: string;
  variantBase?: CanonicalDraftContent;
  variantOverrides: LocalVariantOverride[];
  presentation: Presentation;
};
