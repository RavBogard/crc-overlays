import type { LayoutId } from "@/lib/layout-registry";
import type { Cue } from "@/lib/player";

export type Layout = LayoutId;
export type CanonicalContentMode = "bilingual" | "source-en" | "original-en";
export type ContentMode = CanonicalContentMode | "local-variant" | "custom";
export type SourceEnglishRole = "translation" | "interpretation" | "translation-interpretation" | "reading" | "kavannah" | "rubric" | "note" | "unclassified";
export type Presentation = {
  hebrewFontSize?: number;
  transliterationFontSize?: number;
  translationFontSize?: number;
  titleFontSize?: number;
  hebrewLineHeight?: number;
  transliterationLineHeight?: number;
  translationLineHeight?: number;
  titleLineHeight?: number;
  hebrewLetterSpacing?: number;
  transliterationLetterSpacing?: number;
  translationLetterSpacing?: number;
  titleLetterSpacing?: number;
  hebrewFontFamily?: "noto-sans" | "david-libre" | "frank-ruhl-libre";
  verticalAlignment?: "top" | "center" | "bottom";
  legacyTitleWatermark?: boolean;
  keepHyphenatedWords?: boolean;
  largePrint?: boolean;
  alignment?: "start" | "center";
  lineSpacing?: "compact" | "spacious";
  latinLineBreaks?: "preserve" | "paragraphs" | "phrases";
  imageAssetId?: string;
};
export type SourceGroup = { sourceId: string; blockIds: string[] };
/** C6: which text layers a graphic shows, and how they sit on the slide. */
export type TextLayer = "he" | "tr" | "en";
export type TextArrangement = "together" | "blocks";
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
      layers?: TextLayer[];
      arrangement?: TextArrangement;
      /** Side-panel stacking order; absent means Hebrew, transliteration, translation. */
      rowOrder?: TextLayer[];
      preserveGroups?: true;
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
  sharedFrom?: SharedCueOrigin;
  archivedAt?: number;
  archivedBy?: string;
  // MCP plan A3: set while the graphic is retired (activeRevision is then null).
  retired?: { revision: number; draftVersion: number; retiredAt: number; retiredBy: string };
  createdAt?: number;
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
  retired?: boolean;
  retiredRevision?: number;
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
  layers: TextLayer[];
  arrangement: TextArrangement;
  /** Side-panel stacking order; absent means the default Hebrew, transliteration, translation. */
  rowOrder?: TextLayer[];
  preserveGroups?: boolean;
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
  /** Wording edits; `passageId` anchors an English edit to the passage it translates (app/author/wording-edits.ts). */
  variantOverrides: (LocalVariantOverride & { passageId?: string })[];
  presentation: Presentation;
};

/** Where one CRC graphic stands in this workspace: never taken, taken and current, or changed upstream since. */
/** Where a copied graphic came from. Mirrors SharedCueOrigin in lib/authoring-model.ts: `upstream` is the CRC wording recorded at import, read server-side by compare_shared_cue. */
export type SharedCueOrigin = {
  workspaceId: string;
  cueId: string;
  cueHash: string;
  importedAt?: number;
  upstream?: SharedUpstreamSnapshot;
};
export type SharedShelfState = "new" | "updated" | "customized";
/** A CRC whole prayer travels as N graphics that name the same set. */
export type SharedShelfSetRef = { id: string; index: number; count: number; title: string };
/** What this workspace already holds for one CRC graphic (`list_shared_library`). */
export type SharedShelfLocal = {
  starterCueId?: string;
  drafts: { id: string; name: string; activeRevision: number | null; cueHash: string }[];
};
/** One row of the CRC shelf, as `list_shared_library` returns it. */
export type SharedShelfEntry = {
  id: string;
  name: string;
  title: string;
  layout: string;
  sourceIds: string[];
  cueHash: string;
  state: SharedShelfState;
  set?: SharedShelfSetRef;
  local: SharedShelfLocal;
};
export type SharedShelfList = {
  available: true;
  configured: true;
  stale: boolean;
  refreshedAt: number;
  total: number;
  truncated: boolean;
  cues: SharedShelfEntry[];
};
/** The CRC wording a graphic was copied from, and the CRC wording now. */
export type SharedUpstreamSnapshot = {
  layout: Layout;
  texts: Record<string, string>;
  contentRows?: { he: string; tr: string; en: string }[];
  presentation?: Presentation;
};
export type SharedCompareLine = { before?: string; after?: string; changed: boolean };
/** `compare_shared_cue`. `beforeAvailable` is false for graphics copied before origin wording was recorded. */
export type SharedCompareResult = {
  available: true;
  configured: true;
  stale: boolean;
  refreshedAt: number;
  cueHash: string;
  draftId: string;
  beforeAvailable: boolean;
  before: SharedUpstreamSnapshot | null;
  after: SharedUpstreamSnapshot;
  changed: { wording: boolean; layout: boolean; presentation: boolean };
  lines: SharedCompareLine[];
};
/** `customize_shared_set`: one CRC whole prayer copied into one new multipart draft. */
export type CustomizeSharedSetResult = {
  drafts: Draft[];
  set: { id: string; name: string; count: number; draftIds: string[] };
  sharedFrom: (SharedCueOrigin | undefined)[];
};
