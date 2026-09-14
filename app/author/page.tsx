"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, BookOpenText, Check, ChevronLeft, ChevronRight, CircleAlert, Clock3, Copy, FilePlus2, History, LibraryBig, LoaderCircle, Maximize2, MoreHorizontal, PencilLine, Play, Redo2, RotateCcw, Save, Search, Sparkles, Square, Undo2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import type { AccessRole } from "@/lib/access";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import { layoutLabel } from "@/lib/layout-label";
import { publishedVisibleCount } from "@/lib/catalog-count";
import { overlayAssetUrl, waitForRenderedOverlayAssets } from "@/lib/overlay-assets";
import { AuthoringApiError, authoringCall } from "./api";
import {
  draftHasUnpublishedWork,
  auditDraftSet,
  draftReadableText,
  draftThumbnailCopy,
  blocksForMode,
  editableFromForm,
  emptyForm,
  formFromDraft,
  formReady,
  libraryEmptyMessage,
  moveDraftId,
  parseRecovery,
  recoveryKey,
  routeForDraft,
  selectWholeSource,
  shouldShowPanels,
  type RecoveryCopy,
} from "./editor-state";
import { findFitErrors, findFitWarnings } from "./preview";
import type {
  BrowserMeasurement,
  CatalogCue,
  Draft,
  DraftForm,
  DuplicateNameWarning,
  EphemeralPreviewResult,
  PreviewResult,
  PublishedRevision,
  ReviewReceipt,
  Source,
  SourceDisplay,
  SourceFacet,
  SourceSummary,
  TemplateSummary,
  VariantChannel,
} from "./types";
import { SiddurEditor } from "./siddur-editor";
import { LookDrawer, densityOptions, type WorkspaceAsset } from "./look-drawer";
import { CustomTextEditor, DetailsEditor } from "./custom-editor";
import { EditorCard } from "./editor-card";
import "./author.css";
import GraphicThumbnail from "@/components/graphic-thumbnail";
import SharedShelf, { expectedCueHashes, groupSharedEntries, matchesShelfQuery, shelfBadgeCount, type SharedComparison, type SharedShelfCard, type SharedShelfEntry } from "./shared-shelf";

type LibraryTab = "published" | "drafts" | "archived" | "shared";
type EditorKind = "siddur" | "custom" | "edit";
type LibraryItem = { kind: "catalog"; cue: CatalogCue } | { kind: "draft"; draft: Draft };
type SharedCue = SharedShelfEntry;
type SharedLibraryState = { available: boolean; cues: SharedCue[]; stale: boolean; refreshedAt: number | null; error: string | null };
type DraftSetReview = { status: "complete" | "needs-review" | "unknown"; message: string; issues: Array<{ kind: "missing" | "duplicated" | "unknown" | "out-of-order"; selections: unknown[] }> };

const formatTime = (value?: number) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
const itemName = (item: LibraryItem) => item.kind === "draft" ? item.draft.name : item.cue.name;
const sourceGroups = (draft: Draft) => {
  const content = draft.content.mode === "local-variant" ? draft.content.base : draft.content;
  return content.mode === "bilingual" ? content.hebrewGroups
    : content.mode === "source-en" || content.mode === "original-en" ? content.englishGroups : [];
};
type VariantCandidate = { sourceId: string; blockId: string; channel: VariantChannel; sourceText: string; sourceName: string; blockNumber: number };
const variantKey = (item: Pick<VariantCandidate, "sourceId" | "blockId" | "channel">) => `${item.sourceId}\u0000${item.blockId}\u0000${item.channel}`;
function variantCandidates(draft: Draft): VariantCandidate[] {
  if (draft.content.mode === "custom" || draft.content.mode === "local-variant") return [];
  const snapshots = draft.sourceSnapshots || [];
  const groups = draft.content.mode === "bilingual" ? draft.content.hebrewGroups : draft.content.englishGroups;
  const selected = new Map(groups.flatMap((group) => group.blockIds.map((blockId) => [`${group.sourceId}\u0000${blockId}`, { sourceId: group.sourceId, blockId }] as const)));
  const result: VariantCandidate[] = [];
  for (const { sourceId, blockId } of selected.values()) {
    const source = snapshots.find((item) => item.id === sourceId);
    const block = source?.blocks.find((item) => item.id === blockId);
    if (!source || !block) continue;
    const channels: VariantChannel[] = draft.content.mode === "bilingual" ? ["he", "tr"] : ["en"];
    for (const channel of channels) if (block[channel]) result.push({ sourceId, blockId, channel, sourceText: block[channel]!, sourceName: source.name, blockNumber: block.index + 1 });
  }
  if (draft.content.mode === "bilingual" && draft.content.includeTranslation) {
    for (const source of snapshots) for (const block of source.blocks) {
      if (block.kind !== "translation-en" || !block.en || !block.pairedBlockIds?.every((id) => selected.has(`${source.id}\u0000${id}`))) continue;
      result.push({ sourceId: source.id, blockId: block.id, channel: "en", sourceText: block.en, sourceName: source.name, blockNumber: block.index + 1 });
    }
  }
  return result;
}
export default function AuthorPage() {
  const [key, setKey] = useState("");
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [archivedDrafts, setArchivedDrafts] = useState<Draft[]>([]);
  const [assets, setAssets] = useState<WorkspaceAsset[]>([]);
  const [assetError, setAssetError] = useState("");
  const [showArchivedAssets, setShowArchivedAssets] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [catalog, setCatalog] = useState<CatalogCue[]>([]);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("published");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [sharedLibrary, setSharedLibrary] = useState<SharedLibraryState>({ available: false, cues: [], stale: false, refreshedAt: null, error: null });
  const [sharedSelectedId, setSharedSelectedId] = useState<string | null>(null);
  const [sharedPreview, setSharedPreview] = useState<Cue | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<DraftForm>(emptyForm);
  const [editorKind, setEditorKind] = useState<EditorKind | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const undoStack = useRef<DraftForm[]>([]);
  const redoStack = useRef<DraftForm[]>([]);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });

  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<SourceSummary[]>([]);
  const [sourceTruncated, setSourceTruncated] = useState(false);
  const [sourceFacets, setSourceFacets] = useState<{ books: SourceFacet[]; services: SourceFacet[] }>({ books: [], services: [] });
  const [source, setSource] = useState<Source | null>(null);
  const [bookFilter, setBookFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [activeGroup, setActiveGroup] = useState(0);

  const [workingPreview, setWorkingPreview] = useState<EphemeralPreviewResult | null>(null);
  const [exactPreview, setExactPreview] = useState<PreviewResult | null>(null);
  const [fitErrors, setFitErrors] = useState<string[]>([]);
  const [fitWarnings, setFitWarnings] = useState<string[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [assetsReady, setAssetsReady] = useState(false);
  const [revisions, setRevisions] = useState<PublishedRevision[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSetOverview, setShowSetOverview] = useState(false);
  const [draftSetReview, setDraftSetReview] = useState<DraftSetReview | null>(null);
  const [showVariantCreator, setShowVariantCreator] = useState(false);
  const [variantLabel, setVariantLabel] = useState("");
  const [variantReason, setVariantReason] = useState("");
  const [variantValues, setVariantValues] = useState<Record<string, string>>({});
  const [recovery, setRecovery] = useState<RecoveryCopy | null>(null);
  const [recoveryStoredAt, setRecoveryStoredAt] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nameWarning, setNameWarning] = useState<DuplicateNameWarning | null>(null);
  const [duplicateNamePrompt, setDuplicateNamePrompt] = useState<{ message: string; suggestedName: string } | null>(null);
  const [publishedState, setPublishedState] = useState<{ version: number } | null>(null);
  const pathname = usePathname();

  const viewportRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const previewSequence = useRef(0);
  const animationRevision = useRef(0);

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  // X3 - a toast describes the thing that was in front of the operator when it was raised, so
  // it never survives a move to another page. The selected-graphic and library-tab cases are
  // cleared where that navigation happens (openDraft, beginNew, backToLibrary, chooseLibraryTab)
  // because those same handlers raise the next toast in the same commit.
  useEffect(() => { setMessage(""); setError(""); }, [pathname]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  const fail = useCallback((value: unknown) => {
    setError(value instanceof Error ? value.message : "Something went wrong.");
    setMessage("");
  }, []);

  const resetReview = useCallback(() => {
    setExactPreview(null);
    setFitErrors([]);
    setFitWarnings([]);
    setPreviewWarnings([]);
    setAssetsReady(false);
  }, []);

  const resetHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryAvailability({ canUndo: false, canRedo: false });
  }, []);

  const changeForm = useCallback((patch: Partial<DraftForm>) => {
    setForm((current) => {
      undoStack.current = [...undoStack.current.slice(-59), structuredClone(current)];
      redoStack.current = [];
      return { ...current, ...patch };
    });
    setHistoryAvailability({ canUndo: true, canRedo: false });
    setDirty(true);
    resetReview();
    setRecovery(null);
    setPublishedState(null);
    if (patch.name !== undefined) setNameWarning(null);
  }, [resetReview]);

  const applyLoadedDraft = useCallback((next: Draft) => {
    setDraft(next);
    setForm(formFromDraft(next));
    setDirty(false);
    setEditorKind(next.content.mode === "custom" ? "custom" : "edit");
    setActiveGroup(0);
    setWorkingPreview(null);
    resetReview();
    resetHistory();
    setRevisions([]);
    setShowHistory(false);
    setRecoveryStoredAt(null);
    setNameWarning(null);
    setPublishedState(null);
    setDuplicateNamePrompt(null);
  }, [resetHistory, resetReview]);

  const refreshLists = useCallback(async (controlKey: string) => {
    const [draftResponse, archivedResponse, templateResponse, catalogResponse, workspaceResponse, facetsResponse] = await Promise.all([
      authoringCall<{ drafts: Draft[] }>(controlKey, "list_drafts"),
      authoringCall<{ drafts: Draft[] }>(controlKey, "list_archived_drafts"),
      authoringCall<{ templates: TemplateSummary[] }>(controlKey, "list_templates"),
      authoringCall<{ cues: CatalogCue[] }>(controlKey, "list_catalog"),
      authoringCall<{ workspace: { rehearsal: boolean; label: string | null } }>(controlKey, "get_workspace"),
      authoringCall<{ books: SourceFacet[]; services: SourceFacet[] }>(controlKey, "source_facets"),
    ]);
    setDrafts(draftResponse.drafts || []);
    setArchivedDrafts(archivedResponse.drafts || []);
    setTemplates(templateResponse.templates || []);
    setCatalog((catalogResponse.cues || []).filter((cue) => !cue.hidden));
    setWorkspaceLabel(workspaceResponse.workspace.rehearsal ? workspaceResponse.workspace.label : null);
    setSourceFacets({ books: facetsResponse.books || [], services: facetsResponse.services || [] });
  }, []);

  const loadWorkspace = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) throw Error("Workspace identity is unavailable.");
    const next = await response.json() as PublicWorkspace;
    overlayBrandingFromWorkspace(next);
    setWorkspace(next);
    return next;
  }, []);

  const refreshSharedLibrary = useCallback(async (controlKey: string, force = false) => {
    setBusy("shared-refresh");
    try {
      const response = await authoringCall<{ available: boolean; cues?: SharedCue[]; total?: number; truncated?: boolean; stale?: boolean; refreshedAt?: number; error?: string }>(controlKey, "list_shared_library", { limit: 1000, ...(force ? { refresh: true } : {}) });
      const cues = response.cues || [];
      setSharedPreview(null);
      setSharedLibrary({ available: response.available, cues, stale: Boolean(response.stale), refreshedAt: response.refreshedAt || Date.now(), error: response.error || null });
      setSharedSelectedId((current) => current && cues.some((cue) => cue.id === current) ? current : cues[0]?.id || null);
    } catch (value) {
      setSharedLibrary((current) => ({ ...current, available: false, stale: current.cues.length > 0, error: value instanceof Error ? value.message : "CRC library is temporarily unavailable." }));
    } finally { setBusy(""); }
  }, []);

  const refreshAssets = useCallback(async (controlKey: string, includeArchived = false) => {
    try {
      const response = await fetch(includeArchived ? "/api/assets?includeArchived=true" : "/api/assets", { cache: "no-store", headers: controlKey === "session" ? {} : { Authorization: `Bearer ${controlKey}` }, signal: AbortSignal.timeout(5000) });
      const body = await response.json().catch(() => null) as { assets?: WorkspaceAsset[]; error?: string } | null;
      if (!response.ok) throw Error(body?.error || "Artwork library is unavailable.");
      setAssets((body?.assets || []).filter((item) => includeArchived || !item.archived)); setAssetError("");
    } catch (value) { setAssetError(value instanceof Error ? value.message : "Artwork library is unavailable."); }
  }, []);

  const loadSource = useCallback(async (controlKey: string, sourceId: string) => {
    const response = await authoringCall<{ source: Source; display?: SourceDisplay }>(controlKey, "get_source", { sourceId });
    // I5 - the printed provenance travels with the source so no view falls back to a slug.
    const next: Source = response.display ? { ...response.source, display: response.display } : response.source;
    setSource(next);
    return next;
  }, []);

  const checkRecovery = useCallback((target: Draft | null) => {
    const candidate = parseRecovery(localStorage.getItem(recoveryKey(target?.id || null)));
    if (!candidate) return setRecovery(null);
    const isRelevant = target
      ? candidate.serverVersion === target.version && candidate.savedAt > target.updatedAt
      : candidate.serverVersion === null;
    setRecovery(isRelevant ? candidate : null);
  }, []);

  const canLeave = useCallback(() => !dirtyRef.current || confirm("Leave these unsaved changes? A browser recovery copy will remain available."), []);

  // I4 - every path that opens a saved draft sets the picker source the same way, so a duplicate
  // of a source-backed graphic opens on its ticked passage list instead of the search results.
  const showDraftSource = useCallback(async (controlKey: string, next: Draft) => {
    const first = sourceGroups(next)[0];
    if (!first) return setSource(null);
    const snapshot = next.sourceSnapshots?.find((item) => item.id === first.sourceId);
    if (snapshot) setSource(snapshot); else await loadSource(controlKey, first.sourceId);
  }, [loadSource]);

  const openDraft = useCallback(async (controlKey: string, draftId: string) => {
    setBusy("load");
    setError("");
    setMessage("");
    try {
      const response = await authoringCall<{ draft: Draft }>(controlKey, "get_draft", { draftId });
      const next = response.draft;
      applyLoadedDraft(next);
      await showDraftSource(controlKey, next);
      checkRecovery(next);
      history.replaceState(null, "", routeForDraft(next.id));
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }, [applyLoadedDraft, checkRecovery, fail, showDraftSource]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      await loadWorkspace();
      if (cancelled) return;
      const access = await fetch("/api/access", { cache: "no-store" }).catch(() => null);
      if (access?.ok) {
        const body = await access.json().catch(() => null) as { user?: { role?: string } } | null;
        if (body?.user && ["owner", "editor"].includes(body.user.role || "")) {
          setRole(body.user.role as AccessRole);
          setKey("session");
          try { await refreshLists("session"); } catch (value) { fail(value); }
          if (cancelled) return;
          const id = new URLSearchParams(location.search).get("draft");
          if (id) await openDraft("session", id);
          return;
        }
      }
      const saved = sessionStorage.getItem("crc-control-key") || "";
      if (!saved) return;
      await refreshLists(saved);
      if (cancelled) return;
      setRole("owner");
      setKey(saved);
      const id = new URLSearchParams(location.search).get("draft");
      if (id) await openDraft(saved, id);
    };
    void start().catch(fail);
    return () => { cancelled = true; };
  }, [fail, loadWorkspace, openDraft, refreshLists]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const output = outputRef.current;
    if (!viewport || !output) return;
    const resize = () => {
      const scale = Math.min(viewport.clientWidth / 1920, viewport.clientHeight / 1080);
      output.style.transform = `scale(${scale})`;
      output.style.left = `${(viewport.clientWidth - 1920 * scale) / 2}px`;
      output.style.top = `${(viewport.clientHeight - 1080 * scale) / 2}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [workingPreview, exactPreview, editorKind]);

  useEffect(() => () => playerRef.current?.dispose(), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!dirty || !editorKind) return;
    const timer = setTimeout(() => {
      const copy: RecoveryCopy = { form, savedAt: Date.now(), serverVersion: draft?.version ?? null };
      localStorage.setItem(recoveryKey(draft?.id || null), JSON.stringify(copy));
      setRecoveryStoredAt(copy.savedAt);
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, draft?.id, draft?.version, editorKind, form]);

  const showCue = useCallback(async (cue: Cue, animate = false) => {
    const root = outputRef.current;
    if (!root || !workspace) return;
    const current = ++previewSequence.current;
    playerRef.current?.dispose();
    const player = new Player(root, [cue], overlayBrandingFromWorkspace(workspace), { resolveAssetUrl: (next) => overlayAssetUrl(next, "preview") });
    playerRef.current = player;
    setAssetsReady(false);
    setFitErrors([]);
    setFitWarnings([]);
    if (animate) player.set({ cue: cue.id, revision: ++animationRevision.current, mode: "animate" });
    else player.render(cue, overlayAssetUrl(cue, "preview"));
    // T3 - the book-face stage waits on the book faces, so the fit measured here is the one that ships.
    await waitForRenderedOverlayAssets(root, undefined, workspace.bookFaces ? "book" : "default");
    if (current !== previewSequence.current) return;
    if (!animate) {
      const box = root.firstElementChild;
      if (box instanceof HTMLElement) player.applyFit(box, cue);
    }
    setAssetsReady(true);
    setFitErrors(findFitErrors(root));
    setFitWarnings(findFitWarnings(root));
  }, [workspace]);

  useEffect(() => {
    if (!key || !workspace?.sharedLibrary.enabled) return;
    void refreshSharedLibrary(key);
  }, [key, refreshSharedLibrary, workspace?.sharedLibrary.enabled]);

  useEffect(() => { if (key) void refreshAssets(key, showArchivedAssets); }, [key, refreshAssets, showArchivedAssets]);

  useEffect(() => {
    if (!key || libraryTab !== "shared" || !sharedSelectedId) return;
    let cancelled = false;
    setBusy("shared-preview");
    void authoringCall<{ available: boolean; stale?: boolean; refreshedAt?: number; cue?: Cue; cueHash?: string; error?: string }>(key, "preview_shared_cue", { cueId: sharedSelectedId })
      .then((response) => {
        if (cancelled) return;
        if (!response.available || !response.cue || !response.cueHash) throw Error(response.error || "CRC library is temporarily unavailable.");
        setSharedPreview(response.cue);
        setSharedLibrary((current) => ({ ...current, available: true, stale: Boolean(response.stale), refreshedAt: response.refreshedAt || current.refreshedAt, error: null }));
        return showCue(response.cue);
      })
      .catch((value) => { if (!cancelled) setSharedLibrary((current) => ({ ...current, error: value instanceof Error ? value.message : "CRC library is temporarily unavailable." })); })
      .finally(() => { if (!cancelled) setBusy(""); });
    return () => { cancelled = true; };
  }, [key, libraryTab, sharedSelectedId, showCue]);

  useEffect(() => {
    if (!key || !editorKind || !formReady(form)) {
      return;
    }
    const requestNumber = ++previewSequence.current;
    const timer = setTimeout(() => {
      void authoringCall<EphemeralPreviewResult>(key, "preview_content", editableFromForm(form))
        .then(async (result) => {
          if (requestNumber !== previewSequence.current) return;
          setWorkingPreview(result);
          setPreviewWarnings(result.validation?.warnings || []);
          await showCue(result.cue);
        })
        .catch((value) => {
          if (requestNumber === previewSequence.current)
            setPreviewWarnings([value instanceof Error ? value.message : "Preview unavailable"]);
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [editorKind, form, key, showCue]);

  const publishedItems = useMemo<LibraryItem[]>(() => catalog
    .filter((cue) => cue.activeRevision !== null || cue.origin !== "local")
    .map((cue) => ({ kind: "catalog", cue })), [catalog]);
  const draftItems = useMemo<LibraryItem[]>(() => drafts.filter(draftHasUnpublishedWork).map((item) => ({ kind: "draft", draft: item })), [drafts]);
  const archivedItems = useMemo<LibraryItem[]>(() => {
    const seenSets = new Set<string>();
    return archivedDrafts.filter((item) => {
      if (!item.draftSetId) return true;
      if (seenSets.has(item.draftSetId)) return false;
      seenSets.add(item.draftSetId); return true;
    }).map((item) => ({ kind: "draft", draft: item }));
  }, [archivedDrafts]);
  const visibleLibrary = (libraryTab === "published" ? publishedItems : libraryTab === "archived" ? archivedItems : draftItems).filter((item) => itemName(item).toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));
  const sharedCards = groupSharedEntries(sharedLibrary.cues);
  const visibleShared = sharedCards.filter((card) => matchesShelfQuery(card, libraryQuery));
  const eligibleBlocks = blocksForMode(source, form.mode);
  const selectedIds = new Set(form.groups[activeGroup]?.blockIds || []);
  const selectedBlocks = eligibleBlocks.filter((block) => selectedIds.has(block.id));
  const showPanels = shouldShowPanels(form.groups, selectedBlocks, form.mode, form.layout);
  const previewCue = formReady(form) ? exactPreview?.cue || workingPreview?.cue || null : null;
  const reviewCurrent = !!draft && !dirty && exactPreview?.draftVersion === draft.version;
  const fitBlocked = reviewCurrent && fitErrors.length > 0;
  const selectedDensity = densityOptions.find((option) => JSON.stringify(option.value) === JSON.stringify({
    ...(form.presentation.hebrewFontSize !== undefined ? { hebrewFontSize: form.presentation.hebrewFontSize } : {}),
    ...(form.presentation.transliterationFontSize !== undefined ? { transliterationFontSize: form.presentation.transliterationFontSize } : {}),
    ...(form.presentation.titleFontSize !== undefined ? { titleFontSize: form.presentation.titleFontSize } : {}),
  }))?.id || "custom";
  const draftSet = draft?.draftSetId ? drafts.filter((item) => item.draftSetId === draft.draftSetId).sort((a, b) => (a.setIndex || 0) - (b.setIndex || 0)) : [];
  const draftSetPosition = draft ? draftSet.findIndex((item) => item.id === draft.id) : -1;

  async function browseSources(overrides: { query?: string; book?: string; service?: string } = {}) {
    const query = overrides.query ?? sourceQuery;
    const book = overrides.book ?? bookFilter;
    const service = overrides.service ?? serviceFilter;
    setBusy("search"); setError("");
    try {
      const response = await authoringCall<{ sources: SourceSummary[]; truncated?: boolean }>(key, "search_sources", {
        query: query.trim(), ...(book ? { book } : {}), ...(service ? { service } : {}), limit: 50,
      });
      setSourceResults(response.sources || []);
      setSourceTruncated(Boolean(response.truncated));
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  function beginNew(next: DraftForm, kind: EditorKind) {
    if (!canLeave()) return false;
    setDraft(null); setForm(next); setEditorKind(kind); setDirty(false); setSource(null);
    setSourceResults([]); setSourceTruncated(false); setSourceQuery(""); setBookFilter(""); setServiceFilter(""); setActiveGroup(0);
    previewSequence.current += 1;
    playerRef.current?.dispose(); playerRef.current = null;
    outputRef.current?.replaceChildren();
    setWorkingPreview(null); resetReview(); resetHistory(); setRevisions([]); setShowHistory(false);
    setNameWarning(null); setPublishedState(null); setDuplicateNamePrompt(null); setMessage(""); setError("");
    history.replaceState(null, "", routeForDraft(null)); checkRecovery(null);
    return true;
  }

  function beginSiddur() {
    const template = templates.find((item) => item.layout === "left" && item.importable) || templates[0];
    if (!beginNew({ ...emptyForm, layout: template?.layout || "left", templateCueId: template?.id || "" }, "siddur")) return;
    setLibraryTab("drafts");
    void browseSources({ query: "", book: "", service: "" });
  }

  function beginCustom() {
    const template = templates.find((item) => item.layout === "bottom" && item.importable) || templates[0];
    if (!beginNew({ ...emptyForm, layout: template?.layout || "bottom", templateCueId: template?.id || "", mode: "custom" }, "custom")) return;
    setLibraryTab("drafts");
  }

  // X3 - "Back to library" leaves the editor without touching anything published.
  function backToLibrary() {
    if (!canLeave()) return;
    const wasPublished = Boolean(draft?.activeRevision);
    setDraft(null); setEditorKind(null); setSource(null);
    setSourceResults([]); setSourceTruncated(false);
    previewSequence.current += 1;
    playerRef.current?.dispose(); playerRef.current = null;
    outputRef.current?.replaceChildren();
    setWorkingPreview(null); resetReview(); resetHistory(); setRevisions([]); setShowHistory(false);
    setNameWarning(null); setPublishedState(null); setDuplicateNamePrompt(null);
    setMessage(""); setError("");
    setLibraryTab(wasPublished ? "published" : "drafts");
    history.replaceState(null, "", routeForDraft(null));
  }

  async function openCatalogCue(cue: CatalogCue) {
    if (!canLeave()) return;
    if (cue.editAction === "open" && cue.draftId) return openDraft(key, cue.draftId);
    if (cue.editAction === "duplicate") return duplicateItem({ kind: "catalog", cue });
    setBusy("import"); setError("");
    try {
      const response = await authoringCall<{ draft: Draft }>(key, "import_cue", { cueId: cue.id });
      applyLoadedDraft(response.draft);
      await showDraftSource(key, response.draft);
      setDrafts((items) => [response.draft, ...items.filter((item) => item.id !== response.draft.id)]);
      history.replaceState(null, "", routeForDraft(response.draft.id));
      setMessage(`Opened “${response.draft.name}” for editing. Its Companion button remains linked.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function duplicateItem(item: LibraryItem | null = null) {
    if (!canLeave()) return;
    const input = item ? item.kind === "draft" ? { draftId: item.draft.id } : { cueId: item.cue.id }
      : draft ? { draftId: draft.id } : null;
    if (!input) return;
    setBusy("duplicate"); setError("");
    try {
      const response = await authoringCall<{ draft: Draft }>(key, "duplicate_draft", input);
      applyLoadedDraft(response.draft);
      await showDraftSource(key, response.draft);
      setDrafts((items) => [response.draft, ...items.filter((entry) => entry.id !== response.draft.id)]);
      setLibraryTab("drafts");
      history.replaceState(null, "", routeForDraft(response.draft.id));
      setMessage(`Created “${response.draft.name}”. The original is unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function archiveItem(item: LibraryItem | null = null) {
    const target = item?.kind === "draft" ? item.draft : item?.kind === "catalog" && item.cue.draftId
      ? drafts.find((candidate) => candidate.id === item.cue.draftId) : draft;
    if (!target || target.archivedAt) return;
    if (target.id === draft?.id && !canLeave()) return;
    const setMembers = target.draftSetId ? drafts.filter((item) => item.draftSetId === target.draftSetId).sort((a, b) => (a.setIndex || 0) - (b.setIndex || 0)) : [];
    const subject = setMembers.length ? `all ${setMembers.length} slides in “${target.title}”` : `“${target.name}”`;
    if (!confirm(`Archive ${subject}? ${setMembers.length ? "The prayer set" : "It"} will leave this editor library until restored. The published graphic and anything already on screen remain unchanged.`)) return;
    setBusy("archive"); setError("");
    try {
      if (target.draftSetId) await authoringCall(key, "archive_draft_set", { setId: target.draftSetId, expectedDraftIds: setMembers.map((item) => item.id) });
      else await authoringCall<{ draft: Draft }>(key, "archive_draft", { draftId: target.id, expectedVersion: target.version });
      await refreshLists(key);
      if (draft?.id === target.id || (target.draftSetId && draft?.draftSetId === target.draftSetId)) {
        setDraft(null); setEditorKind(null); setSource(null); setWorkingPreview(null); resetReview();
        history.replaceState(null, "", routeForDraft(null));
      }
      setLibraryTab("archived");
      setMessage(`Archived ${subject}. Published and live output remain unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function restoreArchived(target: Draft) {
    setBusy("restore"); setError("");
    try {
      const setMembers = target.draftSetId ? archivedDrafts.filter((item) => item.draftSetId === target.draftSetId).sort((a, b) => (a.setIndex || 0) - (b.setIndex || 0)) : [];
      const response = target.draftSetId
        ? await authoringCall<{ drafts: Draft[] }>(key, "restore_draft_set", { setId: target.draftSetId, expectedDraftIds: setMembers.map((item) => item.id) })
        : await authoringCall<{ draft: Draft }>(key, "restore_draft", { draftId: target.id, expectedVersion: target.version });
      await refreshLists(key);
      const restored = "draft" in response ? response.draft : response.drafts[0];
      setLibraryTab(restored?.activeRevision ? "published" : "drafts");
      setMessage(target.draftSetId ? `Restored all ${setMembers.length} slides in “${target.title}”.` : `Restored “${target.name}” to the graphics library.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  function replaceDraftSet(setId: string, nextDrafts: Draft[]) {
    setDrafts((items) => [...items.filter((item) => item.draftSetId !== setId), ...nextDrafts]);
    const current = nextDrafts.find((item) => item.id === draft?.id);
    if (current) setDraft(current);
  }

  async function moveSetSlide(direction: -1 | 1) {
    if (!draft?.draftSetId || dirty || busy) return;
    const expectedDraftIds = draftSet.map((item) => item.id);
    const index = expectedDraftIds.indexOf(draft.id), destination = index + direction;
    if (index < 0 || destination < 0 || destination >= expectedDraftIds.length) return;
    const orderedDraftIds = moveDraftId(expectedDraftIds, draft.id, direction);
    setBusy("reorder-set"); setError("");
    try {
      const response = await authoringCall<{ set: { id: string; count: number; draftIds: string[] }; drafts: Draft[] }>(key, "reorder_draft_set", { setId: draft.draftSetId, expectedDraftIds, orderedDraftIds });
      replaceDraftSet(response.set.id, response.drafts);
      setMessage(`Moved this slide to position ${destination + 1}. Published and live output remain unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function duplicateSetSlide() {
    if (!draft?.draftSetId || dirty || busy) return;
    const expectedDraftIds = draftSet.map((item) => item.id);
    setBusy("duplicate-set"); setError("");
    try {
      const response = await authoringCall<{ set: { id: string; count: number; draftIds: string[] }; drafts: Draft[]; duplicatedFrom: { draftId: string } }>(key, "duplicate_draft_in_set", { draftId: draft.id, expectedVersion: draft.version, expectedDraftIds });
      replaceDraftSet(response.set.id, response.drafts);
      const inserted = response.drafts.find((item) => !expectedDraftIds.includes(item.id));
      if (inserted) await openDraft(key, inserted.id);
      setMessage(`Duplicated slide ${draft.setIndex || ""} in “${draft.title}”. The original remains unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function reviewDraftSet() {
    if (!draft?.draftSetId || dirty) return;
    setBusy("review-set"); setError("");
    try {
      const response = await authoringCall<DraftSetReview>(key, "review_draft_set", { setId: draft.draftSetId });
      setDraftSetReview(response); setShowSetOverview(true);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  function beginLocalVariant() {
    if (!draft || draft.content.mode === "custom" || draft.content.mode === "local-variant" || !canLeave()) return;
    const candidates = variantCandidates(draft);
    setVariantLabel(`${workspace?.shortName || "Our congregation"} wording`);
    setVariantReason("");
    setVariantValues(Object.fromEntries(candidates.map((item) => [variantKey(item), item.sourceText])));
    setShowVariantCreator(true);
  }

  async function createLocalVariant() {
    if (!draft) return;
    const overrides = variantCandidates(draft).flatMap((item) => {
      const localText = variantValues[variantKey(item)]?.trim() || "";
      return localText && localText !== item.sourceText ? [{ sourceId: item.sourceId, blockId: item.blockId, channel: item.channel, localText }] : [];
    });
    if (!variantLabel.trim()) { setError("Give this local wording a clear label."); return; }
    if (!overrides.length) { setError("Change at least one source line before creating a local variant."); return; }
    setBusy("create-variant"); setError("");
    try {
      const response = await authoringCall<{ draft: Draft }>(key, "create_local_variant", { draftId: draft.id, label: variantLabel.trim(), ...(variantReason.trim() ? { reason: variantReason.trim() } : {}), overrides });
      setShowVariantCreator(false);
      applyLoadedDraft(response.draft);
      const first = sourceGroups(response.draft)[0];
      if (first) setSource(response.draft.sourceSnapshots?.find((item) => item.id === first.sourceId) || null);
      setDrafts((items) => [response.draft, ...items.filter((item) => item.id !== response.draft.id)]);
      setLibraryTab("drafts");
      history.replaceState(null, "", routeForDraft(response.draft.id));
      setMessage(`Created “${response.draft.name}” as an independent local variant. The source graphic is unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  // WB-C - the shelf never edits an existing draft: New and "Start a new draft from the update"
  // both mint an independent draft, pinned to the hash the shelf listed.
  async function customizeSharedCard(card: SharedShelfCard, name?: string) {
    if (!canLeave()) return;
    setBusy("shared-customize"); setError("");
    try {
      const created = card.kind === "set" && card.lead.set
        ? (await authoringCall<{ drafts: Draft[] }>(key, "customize_shared_set", { setId: card.lead.set.id, expectedCueHashes: expectedCueHashes(card) })).drafts
        : [(await authoringCall<{ draft: Draft; sharedFrom?: { workspaceId: string; cueId: string; cueHash: string } }>(key, "customize_shared_cue", { cueId: card.lead.id, expectedCueHash: card.lead.cueHash, ...(name ? { name } : {}) })).draft];
      const first = created[0];
      if (!first) throw Error("CRC library is temporarily unavailable.");
      applyLoadedDraft(first);
      const firstGroup = sourceGroups(first)[0];
      setSource(firstGroup ? first.sourceSnapshots?.find((item) => item.id === firstGroup.sourceId) || null : null);
      const mintedIds = new Set(created.map((item) => item.id));
      setDrafts((items) => [...created, ...items.filter((item) => !mintedIds.has(item.id))]);
      setLibraryTab("drafts");
      history.replaceState(null, "", routeForDraft(first.id));
      setMessage(`Created an independent draft from “${first.name}”. Future CRC updates will not overwrite your changes.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function selectSource(item: Pick<SourceSummary, "id" | "name" | "kinds">) {
    setBusy("source"); setError("");
    try {
      const next = await loadSource(key, item.id);
      const nextMode = item.kinds.includes("bilingual") ? "bilingual" : item.kinds.includes("source-en") ? "source-en" : "original-en";
      const template = templates.find((entry) => entry.layout === form.layout && entry.importable) || templates[0];
      const groups = form.groups.length ? [...form.groups] : [{ sourceId: item.id, blockIds: [] }];
      groups[Math.min(activeGroup, groups.length - 1)] = { sourceId: item.id, blockIds: [] };
      changeForm({ mode: nextMode, groups, name: form.name || next.name, title: form.title || next.name, templateCueId: form.templateCueId || template?.id || "" });
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  function chooseWholePrayer() {
    if (!source) return;
    const ids = blocksForMode(source, form.mode).map((block) => block.id);
    changeForm({ groups: selectWholeSource(source.id, ids) }); setActiveGroup(0);
  }

  async function makeSlidesFromWholePrayer() {
    if (!source || !form.templateCueId) return setError("Choose a prayer and visual layout first.");
    setBusy("make-set"); setError("");
    try {
      const response = await authoringCall<{ drafts: Draft[]; set: { id: string; name: string; count: number; draftIds: string[] } }>(key, "create_source_draft_set", {
        sourceId: source.id,
        mode: form.mode,
        ...(form.includeTranslation ? { includeTranslation: true } : {}),
        layout: form.layout,
        templateCueId: form.templateCueId,
      });
      const ids = new Set(response.drafts.map((item) => item.id));
      setDrafts((items) => [...response.drafts, ...items.filter((item) => !ids.has(item.id))]);
      setLibraryTab("drafts");
      await openDraft(key, response.drafts[0].id);
      setMessage(`Created ${response.set.count} unpublished slides for “${response.set.name}”. Review and publish each slide when it is ready.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  function toggleBlock(blockId: string, checked: boolean) {
    if (!source) return;
    const groups = structuredClone(form.groups);
    const index = Math.min(activeGroup, Math.max(0, groups.length - 1));
    const group = groups[index] || { sourceId: source.id, blockIds: [] };
    if (group.sourceId !== source.id) return setError("Open the source assigned to this slide first.");
    const order = new Map(source.blocks.map((block, position) => [block.id, position]));
    group.blockIds = (checked ? [...new Set([...group.blockIds, blockId])] : group.blockIds.filter((id) => id !== blockId))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    groups[index] = group; changeForm({ groups });
  }

  function addPanel() {
    if (!source) return;
    const groups = [...form.groups, { sourceId: source.id, blockIds: [] }];
    changeForm({ groups }); setActiveGroup(groups.length - 1);
  }

  function undo() {
    const previous = undoStack.current.pop(); if (!previous) return;
    redoStack.current.push(structuredClone(form)); setForm(previous); setDirty(true); resetReview();
    setHistoryAvailability({ canUndo: undoStack.current.length > 0, canRedo: true });
  }
  function redo() {
    const next = redoStack.current.pop(); if (!next) return;
    undoStack.current.push(structuredClone(form)); setForm(next); setDirty(true); resetReview();
    setHistoryAvailability({ canUndo: true, canRedo: redoStack.current.length > 0 });
  }

  async function setAssetArchived(asset: WorkspaceAsset, archived: boolean) {
    if (!confirm(archived
      ? `Archive “${asset.name}”? It leaves the artwork picker until an editor restores it. Graphics you already published keep showing it.`
      : `Restore “${asset.name}” to the artwork picker?`)) return;
    setBusy(archived ? "archive-asset" : "restore-asset"); setAssetError("");
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(asset.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(key === "session" ? {} : { Authorization: `Bearer ${key}` }) }, body: JSON.stringify({ expectedVersion: asset.version, archived }), signal: AbortSignal.timeout(10000) });
      const body = await response.json().catch(() => null) as { asset?: WorkspaceAsset; error?: string } | null;
      await refreshAssets(key, showArchivedAssets);
      if (!response.ok || !body?.asset) throw Error(body?.error || "Artwork update failed.");
      if (archived && form.presentation.imageAssetId === asset.id) {
        const presentation = { ...form.presentation };
        delete presentation.imageAssetId;
        changeForm({ presentation });
        setMessage("Artwork archived. This graphic now uses the congregation logo until you save. Graphics you already published are unaffected.");
      } else setMessage(archived
        ? `Archived “${asset.name}”. Graphics you already published are unaffected.`
        : `Restored “${asset.name}” to the artwork picker.`);
    } catch (value) { setAssetError(value instanceof Error ? value.message : "Artwork update failed."); }
    finally { setBusy(""); }
  }

  async function uploadAsset(file: File, name: string, altText: string) {
    if (file.size > 512 * 1024) throw Error("Choose a PNG, JPEG, or WebP image smaller than 512 KB.");
    setBusy("upload-asset"); setAssetError("");
    try {
      const response = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": file.type, "X-Asset-Name": encodeURIComponent(name.trim()), "X-Asset-Alt": encodeURIComponent(altText.trim()), ...(key === "session" ? {} : { Authorization: `Bearer ${key}` }) }, body: file, signal: AbortSignal.timeout(10000) });
      const body = await response.json().catch(() => null) as { asset?: WorkspaceAsset; error?: string } | null;
      if (!response.ok || !body?.asset) throw Error(body?.error || "Artwork upload failed.");
      setAssets((items) => [body.asset!, ...items.filter((item) => item.id !== body.asset!.id)]);
      changeForm({ presentation: { ...form.presentation, imageAssetId: body.asset.id } });
      setMessage(`Uploaded and selected “${body.asset.name}”. Review the upper-right artwork region in the preview.`);
      return body.asset;
    } finally { setBusy(""); }
  }

  async function save() {
    if (!formReady(form)) return setError("Add a name, title, template, and content before saving.");
    setBusy("save"); setError("");
    try {
      const response = draft
        ? await authoringCall<{ draft: Draft; warnings?: DuplicateNameWarning[] }>(key, "update_draft", { draftId: draft.id, expectedVersion: draft.version, patch: editableFromForm(form) })
        : await authoringCall<{ draft: Draft; warnings?: DuplicateNameWarning[] }>(key, "create_draft", editableFromForm(form));
      if (!draft) localStorage.removeItem(recoveryKey(null));
      localStorage.removeItem(recoveryKey(response.draft.id));
      applyLoadedDraft(response.draft);
      setDrafts((items) => [response.draft, ...items.filter((item) => item.id !== response.draft.id)]);
      history.replaceState(null, "", routeForDraft(response.draft.id));
      // R6 - a duplicate library name is a warning while drafting, never a blocked save.
      setNameWarning((response.warnings || []).find((item) => item.code === "duplicate-name") || null);
      setMessage(`Saved version ${response.draft.version}`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  /* C5: the exact saved render is what the preview shows, without being asked for. "Review saved
     version" was a step that only ever produced this, so the check now happens by default and
     Publish is one click from a saved draft. Requested once per saved version. */
  const previewedVersion = useRef<string>("");
  const loadExactPreview = useCallback(async (target: Draft) => {
    const stamp = `${target.id}:${target.version}`;
    if (previewedVersion.current === stamp) return;
    previewedVersion.current = stamp;
    try {
      const response = await authoringCall<PreviewResult>(key, "preview_draft", { draftId: target.id, expectedVersion: target.version });
      setExactPreview(response); setPreviewWarnings(response.validation?.warnings || []);
      await showCue(response.cue);
    } catch { previewedVersion.current = ""; }
  }, [key, showCue]);
  useEffect(() => { if (key && draft && !dirty) void loadExactPreview(draft); }, [key, draft, dirty, loadExactPreview]);

  async function publishReviewedVersion(confirmDuplicateName = false) {
    if (!draft || dirty || fitErrors.length) return;
    setBusy("publish"); setError("");
    const browserMeasurement: BrowserMeasurement = { viewportWidth: 1920, viewportHeight: 1080, fontsReady: true, overflow: false, rendererVersion: "crc-author-preview-v2", measuredAt: Date.now() };
    try {
      // The frame is already showing this render; take a preview only if one is not in hand.
      const preview = exactPreview?.draftVersion === draft.version
        ? exactPreview
        : await authoringCall<PreviewResult>(key, "preview_draft", { draftId: draft.id, expectedVersion: draft.version });
      if (preview !== exactPreview) { setExactPreview(preview); setPreviewWarnings(preview.validation?.warnings || []); }
      await authoringCall<ReviewReceipt>(key, "review_draft", { draftId: draft.id, expectedVersion: draft.version, previewId: preview.previewId, browserMeasurement, humanApproved: true });
      const response = await authoringCall<{ revision: PublishedRevision; draft?: Draft; renamedFrom?: string; warning?: string }>(key, "publish_draft", {
        draftId: draft.id, expectedVersion: draft.version, previewId: preview.previewId,
        ...(confirmDuplicateName ? { confirmDuplicateName: true } : {}),
      });
      setDuplicateNamePrompt(null);
      // R6 - a confirmed duplicate publishes under the suggested name and increments the draft
      // version, so the editor takes the draft the server returned rather than the held version.
      const latest = response.draft || (await authoringCall<{ draft: Draft }>(key, "get_draft", { draftId: draft.id })).draft;
      applyLoadedDraft(latest);
      setDrafts((items) => [latest, ...items.filter((item) => item.id !== latest.id)]);
      await refreshLists(key);
      setPublishedState({ version: response.revision.draftVersion });
      setMessage(response.warning
        || (response.renamedFrom ? `Published as “${latest.name}”.` : `Published version ${response.revision.draftVersion}.`));
    } catch (value) {
      if (value instanceof AuthoringApiError && value.code === "duplicate_name" && value.suggestedName) {
        setDuplicateNamePrompt({ message: value.message, suggestedName: value.suggestedName });
        setMessage("");
      } else fail(value);
    }
    finally { setBusy(""); }
  }

  async function loadRevisions() {
    if (!draft) return;
    setShowHistory(true);
    try {
      const response = await authoringCall<{ revisions: PublishedRevision[] }>(key, "list_revisions", { draftId: draft.id });
      setRevisions(response.revisions || []);
    } catch (value) { fail(value); }
  }

  async function activateRevision(revision: number) {
    if (!draft) return;
    setBusy(`rollback-${revision}`);
    try {
      const response = await authoringCall<{ draft: Draft; warning?: string }>(key, "rollback_draft", { draftId: draft.id, expectedVersion: draft.version, revision });
      applyLoadedDraft(response.draft);
      setMessage(response.warning || `Published revision ${revision} is active again.`);
      setShowHistory(false);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  function restoreRecovery() {
    if (!recovery) return;
    setForm(recovery.form); setDirty(true);
    setEditorKind(recovery.form.mode === "custom" ? "custom" : draft ? "edit" : "siddur");
    resetHistory(); resetReview(); setRecovery(null);
    setMessage("Recovered browser changes. Save the draft when they are ready.");
  }
  function discardRecovery() {
    localStorage.removeItem(recoveryKey(draft?.id || null)); setRecovery(null); setRecoveryStoredAt(null);
  }

  function chooseLibraryTab(tab: LibraryTab) {
    if (tab === "shared" && !canLeave()) return;
    if (tab !== libraryTab) { setMessage(""); setError(""); }
    setLibraryTab(tab);
  }

  const workspaceStyle = workspace ? {
    "--workspace-primary": workspace.colors.primary,
    "--workspace-deep": workspace.colors.deep,
    "--workspace-accent": workspace.colors.accent,
  } as CSSProperties : undefined;

  if (!key) return <AccessCard productName={workspace?.productName || "Overlays"} style={workspaceStyle} error={error} />;

  return (
    <main className="author-page" style={workspaceStyle}>
      <WorkspaceHeader current="/author" title="Library" role={role} workspace={workspace} aside={<Link className="header-link" href="/author/fit-check">Fit check</Link>} />
      {workspaceLabel && <div className="workspace-banner"><CircleAlert size={16} />{workspaceLabel}</div>}

      <div className="author-shell">
        <LibrarySidebar
          publishedItems={publishedItems} draftItems={draftItems} archivedItems={archivedItems} visibleLibrary={visibleLibrary}
          allDrafts={drafts}
          libraryTab={libraryTab} setLibraryTab={chooseLibraryTab} libraryQuery={libraryQuery} setLibraryQuery={setLibraryQuery}
          sharedEnabled={Boolean(workspace?.sharedLibrary.enabled)} sharedLabel={workspace?.sharedLibrary.label || "CRC library"}
          sharedItems={visibleShared} sharedBadge={shelfBadgeCount(sharedCards)} sharedSelectedId={sharedSelectedId} selectShared={(id) => { setSharedPreview(null); setSharedSelectedId(id); }}
          activeDraftId={draft?.id || null} beginSiddur={beginSiddur} beginCustom={beginCustom}
          openItem={(item) => {
            if (item.kind === "draft") { if (canLeave()) void openDraft(key, item.draft.id); }
            else void openCatalogCue(item.cue);
          }}
          duplicateItem={(item) => void duplicateItem(item)}
          archiveItem={(item) => void archiveItem(item)} restoreItem={(item) => void restoreArchived(item)}
        />

        {libraryTab === "shared" ? <SharedShelf
          label={workspace?.sharedLibrary.label || "CRC library"}
          feed={{ available: sharedLibrary.available, entries: sharedLibrary.cues, stale: sharedLibrary.stale, refreshedAt: sharedLibrary.refreshedAt, error: sharedLibrary.error }}
          query={libraryQuery} busy={busy} selectedId={sharedSelectedId}
          selectCard={(card) => { setSharedPreview(null); setSharedSelectedId(card.lead.id); }}
          refresh={() => void refreshSharedLibrary(key, true)}
          customize={(card) => void customizeSharedCard(card)}
          startUpdateDraft={(card) => void customizeSharedCard(card, `${card.lead.name} · CRC update`)}
          compare={(cueId, draftId) => authoringCall<SharedComparison>(key, "compare_shared_cue", { cueId, draftId })}
          openDraft={(draftId) => { if (canLeave()) void openDraft(key, draftId); }}
          preview={<PreviewColumn
            setViewport={(node) => { viewportRef.current = node; }} setOutput={(node) => { outputRef.current = node; }}
            previewCue={sharedPreview} exact={true} fitErrors={fitErrors} warnings={previewWarnings} assetsReady={assetsReady} bookFaces={Boolean(workspace?.bookFaces)}
            play={() => { if (sharedPreview) void showCue(sharedPreview, true); }}
            out={() => playerRef.current?.set({ cue: null, revision: ++animationRevision.current, mode: "animate" })}
            fullscreen={() => void viewportRef.current?.requestFullscreen().catch(fail)}
            statusLabel={sharedPreview ? "CRC preview with TBI branding" : "Loading CRC preview"} />}
        /> : libraryTab === "archived" ? <ArchivedPanel drafts={archivedItems.flatMap((item) => item.kind === "draft" ? [item.draft] : [])} query={libraryQuery} busy={busy} restore={(item) => void restoreArchived(item)} /> : !editorKind ? <WelcomePanel /> : (
          <section className="editor-workspace">
            <EditorTitle
              form={form} draft={draft} dirty={dirty} busy={busy} undo={undo} redo={redo}
              canUndo={historyAvailability.canUndo} canRedo={historyAvailability.canRedo}
              duplicate={() => void duplicateItem()} history={() => void loadRevisions()}
              archive={() => void archiveItem()}
              createVariant={beginLocalVariant}
              setPosition={draftSetPosition} setCount={draftSet.length}
              previousSlide={() => { const previous = draftSet[draftSetPosition - 1]; if (previous) void openDraft(key, previous.id); }}
              nextSlide={() => { const next = draftSet[draftSetPosition + 1]; if (next) void openDraft(key, next.id); }}
            />
            {draftSet.length > 1 && <SlideStrip drafts={draftSet} activeId={draft?.id || null} dirty={dirty} busy={busy}
              open={(item) => { if (canLeave()) void openDraft(key, item.id); }} moveLeft={() => void moveSetSlide(-1)} moveRight={() => void moveSetSlide(1)}
              duplicate={() => void duplicateSetSlide()} reviewAll={() => void reviewDraftSet()} />}
            {recovery && <RecoveryBanner recovery={recovery} restore={restoreRecovery} discard={discardRecovery} />}

            <div className="editing-grid">
              <div className="form-column">
                {form.mode === "local-variant" ? <VariantEditor form={form} changeForm={changeForm} /> : editorKind === "siddur" || (form.mode !== "custom" && editorKind === "edit") ? (
                  <SiddurEditor
                    query={sourceQuery} setQuery={setSourceQuery} results={sourceResults} source={source} form={form}
                    truncated={sourceTruncated}
                    books={sourceFacets.books} services={sourceFacets.services} bookFilter={bookFilter} serviceFilter={serviceFilter}
                    setBookFilter={(value) => { setBookFilter(value); void browseSources({ book: value }); }}
                    setServiceFilter={(value) => { setServiceFilter(value); void browseSources({ service: value }); }}
                    search={() => void browseSources()} selectSource={(item) => void selectSource(item)} clearSource={() => setSource(null)}
                    eligibleBlocks={eligibleBlocks} selectedIds={selectedIds} activeGroup={activeGroup}
                    setActiveGroup={(index) => { setActiveGroup(index); const group = form.groups[index]; if (group && group.sourceId !== source?.id) { const snapshot = draft?.sourceSnapshots?.find((item) => item.id === group.sourceId); if (snapshot) setSource(snapshot); else void loadSource(key, group.sourceId); } }}
                    chooseWholePrayer={chooseWholePrayer} toggleBlock={toggleBlock} addPanel={addPanel}
                    makeSlidesFromWholePrayer={() => void makeSlidesFromWholePrayer()}
                    removePanel={() => { const groups = form.groups.filter((_, index) => index !== activeGroup); changeForm({ groups }); setActiveGroup(Math.max(0, activeGroup - 1)); }}
                    changeMode={(mode) => changeForm({ mode, groups: [], includeTranslation: false, layers: ["he", "tr"], arrangement: "together" })}
                    changeForm={changeForm} busy={busy} controlKey={key} showPanels={showPanels} fitErrors={fitErrors}
                  />
                ) : <CustomTextEditor form={form} changeForm={changeForm} templates={templates} />}

                <DetailsEditor form={form} changeForm={changeForm} nameWarning={nameWarning}
                  useSuggestedName={() => { if (nameWarning) changeForm({ name: nameWarning.suggestedName }); }} />
                <LookDrawer form={form} templates={templates} selectedDensity={selectedDensity} changeForm={changeForm}
                  workspace={workspace} assets={assets} assetError={assetError} busy={busy} uploadAsset={uploadAsset}
                  setAssetArchived={(asset, archived) => void setAssetArchived(asset, archived)}
                  showArchivedAssets={showArchivedAssets} setShowArchivedAssets={setShowArchivedAssets} previewCue={previewCue} />
              </div>

              <PreviewColumn
                setViewport={(node) => { viewportRef.current = node; }} setOutput={(node) => { outputRef.current = node; }} previewCue={previewCue} exact={!!exactPreview}
                fitErrors={fitErrors} warnings={[...previewWarnings, ...fitWarnings]} assetsReady={assetsReady} bookFaces={Boolean(workspace?.bookFaces)}
                play={() => { if (previewCue) void showCue(previewCue, true); }}
                out={() => playerRef.current?.set({ cue: null, revision: ++animationRevision.current, mode: "animate" })}
                fullscreen={() => void viewportRef.current?.requestFullscreen().catch(fail)}
              />
            </div>

            <PublishDock
              dirty={dirty} draft={draft} recoveryStoredAt={recoveryStoredAt} busy={busy}
              ready={formReady(form)} fitBlocked={fitBlocked}
              publishedVersion={dirty ? null : publishedState?.version ?? null}
              duplicate={() => void duplicateItem()} backToLibrary={backToLibrary}
              save={() => void save()} publish={() => void publishReviewedVersion()}
            />
            {duplicateNamePrompt && <DuplicateNameDialog
              message={duplicateNamePrompt.message} suggestedName={duplicateNamePrompt.suggestedName} busy={busy}
              cancel={() => setDuplicateNamePrompt(null)} confirm={() => void publishReviewedVersion(true)}
            />}
            {showHistory && <HistoryDrawer revisions={revisions} activeRevision={draft?.activeRevision || null} close={() => setShowHistory(false)} activate={(revision) => void activateRevision(revision)} />}
            {showSetOverview && <SetOverview drafts={draftSet} review={draftSetReview} activeId={draft?.id || null} close={() => setShowSetOverview(false)} open={(item) => { setShowSetOverview(false); if (canLeave()) void openDraft(key, item.id); }} />}
            {showVariantCreator && draft && <VariantCreator
              draft={draft} label={variantLabel} reason={variantReason} values={variantValues} busy={busy}
              setLabel={setVariantLabel} setReason={setVariantReason}
              setValue={(candidate, value) => setVariantValues((current) => ({ ...current, [variantKey(candidate)]: value }))}
              close={() => setShowVariantCreator(false)} create={() => void createLocalVariant()}
            />}
          </section>
        )}
      </div>

      <div className="notice-stack" aria-live="polite">
        {message && <p className="notice success">{message}<button aria-label="Dismiss" onClick={() => setMessage("")}>×</button></p>}
        {error && <p role="alert" className="notice error">{error}<button aria-label="Dismiss" onClick={() => setError("")}>×</button></p>}
      </div>
    </main>
  );
}

function AccessCard({ productName, style, error }: { productName: string; style?: CSSProperties; error: string }) {
  return <main className="author-page access-page" style={style}><div className="access-card"><div className="brand-mark"><BookOpenText size={22} /></div><span className="eyebrow">{productName}</span><h1>Open the library</h1><p>Sign in to edit graphics.</p><Link className="access-link" href="/access">Sign in</Link>{error && <p role="alert" className="inline-error">{error}</p>}</div></main>;
}

function LibrarySidebar(props: {
  publishedItems: LibraryItem[]; draftItems: LibraryItem[]; archivedItems: LibraryItem[]; visibleLibrary: LibraryItem[];
  allDrafts: Draft[];
  libraryTab: LibraryTab; setLibraryTab: (tab: LibraryTab) => void; libraryQuery: string; setLibraryQuery: (query: string) => void;
  sharedEnabled: boolean; sharedLabel: string; sharedItems: SharedShelfCard[]; sharedBadge: number; sharedSelectedId: string | null; selectShared: (id: string) => void;
  activeDraftId: string | null; beginSiddur: () => void; beginCustom: () => void;
  openItem: (item: LibraryItem) => void; duplicateItem: (item: LibraryItem) => void; archiveItem: (item: LibraryItem) => void; restoreItem: (item: Draft) => void;
}) {
  const tabCount = 3 + (props.sharedEnabled ? 1 : 0);
  // U5 - the one "published, visible" number, the same helper the console footer and health use.
  const publishedCount = publishedVisibleCount(props.publishedItems.flatMap((item) => item.kind === "catalog" ? [item.cue] : []));
  const hasQuery = Boolean(props.libraryQuery.trim());
  return <aside className="library-sidebar">
    <div className="create-stack"><button className="siddur-button" onClick={props.beginSiddur}><BookOpenText size={19} /><span><strong>Add from siddur</strong><small>Find a prayer or reading</small></span></button><button className="secondary-create" onClick={props.beginCustom}><FilePlus2 size={17} /> New custom graphic</button></div>
    <div className={`library-tabs tabs-${tabCount}`} role="tablist" aria-label="Library">
      <button role="tab" aria-selected={props.libraryTab === "published"} className={props.libraryTab === "published" ? "active" : ""} onClick={() => props.setLibraryTab("published")}>Published <span title="published, visible">{publishedCount}</span></button>
      <button role="tab" aria-selected={props.libraryTab === "drafts"} className={props.libraryTab === "drafts" ? "active" : ""} onClick={() => props.setLibraryTab("drafts")}>Drafts <span>{props.draftItems.length}</span></button>
      <button role="tab" aria-selected={props.libraryTab === "archived"} className={props.libraryTab === "archived" ? "active" : ""} onClick={() => props.setLibraryTab("archived")}>Archived <span>{props.archivedItems.length}</span></button>
      {props.sharedEnabled && <button role="tab" aria-selected={props.libraryTab === "shared"} className={props.libraryTab === "shared" ? "active" : ""} onClick={() => props.setLibraryTab("shared")}>{props.sharedLabel}{props.sharedBadge > 0 && <span title="new and updated from CRC">{props.sharedBadge}</span>}</button>}
    </div>
    <label className="library-search"><Search size={16} /><input aria-label={`Search ${props.libraryTab}`} value={props.libraryQuery} onChange={(event) => props.setLibraryQuery(event.target.value)} placeholder={`Search ${props.libraryTab}`} /></label>
    <div className="library-list">
      {props.libraryTab === "shared" ? props.sharedItems.map((card) => <article key={card.key} className={`library-card shared-card ${card.members.some((entry) => entry.id === props.sharedSelectedId) ? "active" : ""}`}><button className="library-card-main" onClick={() => props.selectShared(card.lead.id)}><GraphicThumbnail layout={card.layout} title={card.title} /><span><strong>{card.title}</strong><small>CRC published · {layoutLabel(card.layout)}</small></span></button></article>) : props.visibleLibrary.map((item) => {
        const id = item.kind === "draft" ? item.draft.id : item.cue.id;
        const active = item.kind === "draft" ? props.activeDraftId === item.draft.id : props.activeDraftId === item.cue.draftId;
        const layout = item.kind === "draft" ? item.draft.layout : item.cue.layout;
        const subtitle = item.kind === "draft" ? item.draft.content.mode === "local-variant" ? `Local variant · version ${item.draft.version}` : item.draft.activeRevision ? `Published · changes in version ${item.draft.version}` : `Draft version ${item.draft.version}` : `${item.cue.origin === "canonical" ? "Siddur" : item.cue.origin === "variant" ? "Local variant" : "Custom"} · ${layoutLabel(layout)}`;
        const authoredDraft = item.kind === "catalog" && item.cue.draftId ? props.allDrafts.find((candidate) => candidate.id === item.cue.draftId) : undefined;
        const copy = item.kind === "draft" ? draftThumbnailCopy(item.draft) : authoredDraft ? draftThumbnailCopy(authoredDraft) : { title: item.cue.title, body: "", accent: undefined };
        if (props.libraryTab === "archived" && item.kind === "draft") return <article key={`archived-${id}`} className="library-card archived-card"><button className="library-card-main" onClick={() => props.restoreItem(item.draft)}><GraphicThumbnail layout={layout} {...copy} /><span><strong>{item.draft.draftSetId ? item.draft.title : itemName(item)}</strong><small>{item.draft.draftSetId ? `${item.draft.setCount || "Multiple"} slides · ` : ""}Archived {formatTime(item.draft.archivedAt)}</small></span></button><button className="icon-button card-action" aria-label={`Restore ${item.draft.draftSetId ? item.draft.title : itemName(item)}`} title="Restore" onClick={() => props.restoreItem(item.draft)}><ArchiveRestore size={14} /></button></article>;
        const archiveDraft = item.kind === "draft" ? item.draft : authoredDraft;
        const canArchive = item.kind === "draft" || Boolean(item.cue.draftId && archiveDraft);
        return <article key={`${item.kind}-${id}`} className={`library-card ${active ? "active" : ""}`}><button className="library-card-main" onClick={() => props.openItem(item)}><GraphicThumbnail layout={layout} {...copy} /><span><strong>{itemName(item)}</strong><small>{subtitle}</small></span></button><span className="card-actions"><button className="icon-button card-action" aria-label={`Duplicate ${itemName(item)}`} title="Duplicate" onClick={() => props.duplicateItem(item)}><Copy size={14} /></button>{canArchive && <button className="icon-button card-action" aria-label={`Archive ${itemName(item)}`} title="Archive" onClick={() => props.archiveItem(item)}><Archive size={14} /></button>}</span></article>;
      })}
      {!(props.libraryTab === "shared" ? props.sharedItems.length : props.visibleLibrary.length) && <div className="library-empty"><LibraryBig size={24} /><p>{libraryEmptyMessage(props.libraryTab, hasQuery)}</p></div>}
    </div>
    {/* Layout pass (handoff #2, D3 and D4): source review and prepared services left the top
        navigation. They live under the library, where the work they belong to is. */}
    <nav className="library-elsewhere" aria-label="More library work">
      <Link href="/sources-review">Source changes</Link>
      <Link href="/services">Prepared services</Link>
    </nav>
  </aside>;
}


function WelcomePanel() {
  return <section className="welcome-panel"><div className="welcome-art"><BookOpenText size={42} /></div><h2>Choose a graphic, or start a new one.</h2><p>Start with an authorized passage from the siddur library, or open a published graphic to edit or duplicate it.</p></section>;
}

function ArchivedPanel({ drafts, query, busy, restore }: { drafts: Draft[]; query: string; busy: string; restore: (draft: Draft) => void }) {
  const visible = drafts.filter((draft) => draft.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="archived-panel"><header><div><span className="eyebrow">RECOVERABLE LIBRARY</span><h2>Archived graphics</h2><p>Archived drafts stay here until restored. Published Companion cues and live output are unchanged.</p></div><span>{drafts.length} archived</span></header>{visible.length ? <div className="archived-grid">{visible.map((draft) => <article key={draft.id}><GraphicThumbnail layout={draft.layout} {...draftThumbnailCopy(draft)} /><div><strong>{draft.draftSetId ? draft.title : draft.name}</strong><small>{draft.draftSetId ? `${draft.setCount || "Multiple"} slides · ` : ""}Archived {formatTime(draft.archivedAt)}</small><p>{draft.draftSetId ? "Whole prayer set" : draft.title}</p></div><button onClick={() => restore(draft)} disabled={busy === "restore"}><ArchiveRestore size={16} /> Restore {draft.draftSetId ? "set" : "to library"}</button></article>)}</div> : <div className="shared-empty"><Archive size={28} /><h3>{query ? "No archived graphics match this search." : "Nothing is archived."}</h3><p>{query ? "Clear the search to see all archived graphics." : "Graphics you archive can be recovered here."}</p></div>}</section>;
}

function EditorTitle(props: { form: DraftForm; draft: Draft | null; dirty: boolean; busy: string; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; duplicate: () => void; archive: () => void; createVariant: () => void; history: () => void; setPosition: number; setCount: number; previousSlide: () => void; nextSlide: () => void }) {
  return <div className="editor-titlebar"><div><div className="editor-status-line"><span className={`status-chip ${props.draft?.activeRevision ? "published" : "draft"}`}>{props.draft?.activeRevision ? "Published" : "Draft"}</span>{props.dirty ? <span className="unsaved-dot">Unsaved changes</span> : props.draft ? <span>Saved version {props.draft.version}</span> : <span>New graphic</span>}{props.form.mode === "local-variant" && <span className="variant-chip">Local variant</span>}{props.setCount > 1 && <span className="set-position">Slide {props.setPosition + 1} of {props.setCount}</span>}</div><h2>{props.form.name || (props.form.mode === "custom" ? "New custom graphic" : "Add from siddur")}</h2>{!props.draft?.activeRevision && <p>Publish makes this version available to the operator.</p>}</div><div className="editor-tools">{props.setCount > 1 && <><button onClick={props.previousSlide} disabled={props.setPosition <= 0 || !!props.busy}><ChevronLeft size={16} /> Previous</button><button onClick={props.nextSlide} disabled={props.setPosition >= props.setCount - 1 || !!props.busy}>Next <ChevronRight size={16} /></button></>}<button className="icon-button" onClick={props.undo} disabled={!props.canUndo} title="Undo"><Undo2 size={17} /></button><button className="icon-button" onClick={props.redo} disabled={!props.canRedo} title="Redo"><Redo2 size={17} /></button>{props.draft && <EditorOverflow items={[
    ...(props.setCount <= 1 ? [{ key: "duplicate", label: "Duplicate", icon: <Copy size={16} />, disabled: props.busy === "duplicate", run: props.duplicate }] : []),
    ...(props.draft.content.mode !== "custom" && props.draft.content.mode !== "local-variant" ? [{ key: "variant", label: "Local wording\u2026", icon: <PencilLine size={16} />, disabled: !!props.busy || props.dirty, run: props.createVariant }] : []),
    { key: "history", label: "History", icon: <History size={16} />, disabled: false, run: props.history },
    ...(props.setCount <= 1 ? [{ key: "archive", label: "Archive", icon: <Archive size={16} />, disabled: !!props.busy || props.dirty, run: props.archive }] : []),
  ]} />}</div></div>;
}

/* C4: Duplicate and Archive are already hover actions on the library cards, and History and
   Local wording are rare. The toolbar keeps undo and redo; everything else is one menu. */
function EditorOverflow({ items }: { items: Array<{ key: string; label: string; icon: ReactNode; disabled: boolean; run: () => void }> }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  if (!items.length) return null;
  return <div className="editor-overflow" ref={wrapper}>
    <button className="icon-button" aria-label="More actions" aria-expanded={open} title="More actions" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={17} /></button>
    {open && <div className="editor-overflow-menu" role="menu">
      {items.map((item) => <button key={item.key} role="menuitem" disabled={item.disabled} onClick={() => { setOpen(false); item.run(); }}>{item.icon} {item.label}</button>)}
    </div>}
  </div>;
}

function SlideStrip(props: { drafts: Draft[]; activeId: string | null; dirty: boolean; busy: string; open: (draft: Draft) => void; moveLeft: () => void; moveRight: () => void; duplicate: () => void; reviewAll: () => void }) {
  const activeIndex = props.drafts.findIndex((draft) => draft.id === props.activeId);
  return <section className="slide-strip" aria-label="Prayer slides"><header><div><span className="eyebrow">WHOLE PRAYER</span><strong>{props.drafts[0]?.title}</strong><small>{props.drafts.length} slides · choose a slide to edit</small></div><button onClick={props.reviewAll} disabled={props.dirty || !!props.busy}>{props.busy === "review-set" ? <LoaderCircle className="spin" size={15} /> : <BookOpenText size={15} />} Review whole prayer</button></header><div className="slide-strip-track">{props.drafts.map((draft, index) => <button key={draft.id} className={draft.id === props.activeId ? "active" : ""} onClick={() => props.open(draft)}><span className="slide-number">{index + 1}</span><GraphicThumbnail layout={draft.layout} {...draftThumbnailCopy(draft)} /><span><strong>{draft.name}</strong><small>{draft.activeRevision ? "Published" : "Draft"}</small></span></button>)}</div><footer><span>Slide {activeIndex + 1} of {props.drafts.length}</span><button onClick={props.moveLeft} disabled={props.dirty || !!props.busy || activeIndex <= 0}><ChevronLeft size={15} /> Move earlier</button><button onClick={props.moveRight} disabled={props.dirty || !!props.busy || activeIndex < 0 || activeIndex >= props.drafts.length - 1}>Move later <ChevronRight size={15} /></button><button onClick={props.duplicate} disabled={props.dirty || !!props.busy}><Copy size={15} /> Duplicate slide</button></footer></section>;
}

function SetOverview(props: { drafts: Draft[]; review: DraftSetReview | null; activeId: string | null; close: () => void; open: (draft: Draft) => void }) {
  const audit = auditDraftSet(props.drafts);
  const complete = props.review?.status === "complete" || (!props.review && audit?.complete);
  return <div className="set-overview-backdrop" role="dialog" aria-modal="true" aria-labelledby="set-overview-title"><section className="set-overview"><header><div><span className="eyebrow">{complete ? "COMPLETE READING" : "SLIDE SET REVIEW"}</span><h3 id="set-overview-title">{props.drafts[0]?.title}</h3><p>Review every word and slide boundary, then open each slide for its broadcast-fit check.</p>{props.review ? <div className={`set-audit ${complete ? "complete" : "attention"}`}><strong>{props.review.message}</strong>{props.review.issues.length > 0 && <span>{props.review.issues.map((issue) => `${issue.kind.replaceAll("-", " ")} (${issue.selections.length})`).join(" · ")}</span>}</div> : audit && <div className={`set-audit ${audit.complete ? "complete" : "attention"}`}><strong>{audit.complete ? `All ${audit.expectedCount} source passages appear once and in source order.` : "This historical set differs from the source sequence available now."}</strong>{!audit.complete && <span>{audit.missingCount ? `${audit.missingCount} missing · ` : ""}{audit.duplicateCount ? `${audit.duplicateCount} duplicated · ` : ""}{audit.unexpectedCount ? `${audit.unexpectedCount} outside the automatic reading · ` : ""}{!audit.sourceOrder ? "Order differs from source" : ""}</span>}</div>}</div><button className="icon-button" aria-label="Close whole-prayer review" onClick={props.close}>×</button></header><div className="set-overview-list">{props.drafts.map((draft, index) => { const copy = draftThumbnailCopy(draft); return <button key={draft.id} className={draft.id === props.activeId ? "active" : ""} onClick={() => props.open(draft)}><span className="overview-number">{index + 1}</span><GraphicThumbnail layout={draft.layout} {...copy} /><span><strong>{draft.name}</strong><small>{draftReadableText(draft) || copy.title}</small><em>{draft.activeRevision ? "Published" : `Draft version ${draft.version}`} · Open for fit review</em></span></button>; })}</div><footer><span>Published and live output stay unchanged while you review.</span><button onClick={props.close}>Done reviewing</button></footer></section></div>;
}

function RecoveryBanner({ recovery, restore, discard }: { recovery: RecoveryCopy; restore: () => void; discard: () => void }) {
  return <div className="recovery-banner"><RotateCcw size={19} /><div><strong>Unsaved browser changes are available</strong><small>Stored {formatTime(recovery.savedAt)}. They have not replaced the saved draft.</small></div><button onClick={restore}>Restore</button><button className="text-button" onClick={discard}>Discard</button></div>;
}

const channelLabel: Record<VariantChannel, string> = { he: "Hebrew", tr: "Transliteration", en: "English" };

function VariantEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <EditorCard number={1} title="Local wording" lede="This independent copy records every change beside the exact source wording." className="variant-editor">
    <div className="variant-identity"><PencilLine size={17} /><span><strong>{form.variantLabel}</strong><small>{form.variantReason || "Congregation-specific wording"}</small></span></div>
    <div className="variant-lines">{form.variantOverrides.map((item, index) => <article key={variantKey(item)}><header><span>{channelLabel[item.channel]}</span><small>Source line {index + 1}</small></header><div className="variant-comparison"><div><span>Exact source</span><p lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined}>{item.sourceText}</p></div><label>Local wording<textarea lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined} value={item.localText} maxLength={4000} onChange={(event) => changeForm({ variantOverrides: form.variantOverrides.map((entry, offset) => offset === index ? { ...entry, localText: event.target.value } : entry) })} /></label></div></article>)}</div>
    <div className="variant-provenance"><BookOpenText size={17} /><span><strong>Source remains attached</strong><small>Publishing uses the local wording above and keeps the exact source text in its history.</small></span></div>
  </EditorCard>;
}

function VariantCreator(props: { draft: Draft; label: string; reason: string; values: Record<string, string>; busy: string; setLabel: (value: string) => void; setReason: (value: string) => void; setValue: (candidate: VariantCandidate, value: string) => void; close: () => void; create: () => void }) {
  const candidates = variantCandidates(props.draft);
  const changed = candidates.filter((item) => (props.values[variantKey(item)] || "").trim() !== item.sourceText).length;
  return <div className="variant-backdrop" role="dialog" aria-modal="true" aria-labelledby="variant-title"><section className="variant-dialog"><header><div><span className="eyebrow">EXPLICIT LOCAL COPY</span><h3 id="variant-title">Create local wording</h3><p>The original source graphic and its exact words remain unchanged.</p></div><button className="icon-button" aria-label="Close local wording editor" onClick={props.close}>×</button></header><div className="variant-dialog-body"><div className="variant-fields"><label>Variant label<input value={props.label} maxLength={80} onChange={(event) => props.setLabel(event.target.value)} placeholder="Example: Our congregation’s responsive reading" /></label><label>Reason <span>optional</span><input value={props.reason} maxLength={500} onChange={(event) => props.setReason(event.target.value)} placeholder="Why this wording is used locally" /></label></div><div className="variant-source-note"><BookOpenText size={17} /><span><strong>{props.draft.name}</strong><small>Each editable line below starts as the exact pinned source text.</small></span></div><div className="variant-candidates">{candidates.map((item) => { const value = props.values[variantKey(item)] ?? item.sourceText; const isChanged = value.trim() !== item.sourceText; return <article key={variantKey(item)} className={isChanged ? "changed" : ""}><header><span>{item.sourceName} · passage {item.blockNumber}</span><em>{channelLabel[item.channel]}</em></header><label><span className="sr-only">Local {channelLabel[item.channel]} wording for passage {item.blockNumber}</span><textarea lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined} value={value} maxLength={4000} onChange={(event) => props.setValue(item, event.target.value)} /></label><footer>{isChanged ? <span><PencilLine size={13} /> Local change</span> : <span>Matches source</span>}<button className="text-button" disabled={!isChanged} onClick={() => props.setValue(item, item.sourceText)}>Reset to source</button></footer></article>; })}</div></div><footer><span>{changed ? `${changed} changed ${changed === 1 ? "line" : "lines"}` : "Change at least one line to continue."}</span><div><button onClick={props.close}>Cancel</button><button className="primary-button" onClick={props.create} disabled={!changed || !props.label.trim() || props.busy === "create-variant"}>{props.busy === "create-variant" ? <LoaderCircle className="spin" size={17} /> : <PencilLine size={17} />} Create independent variant</button></div></footer></section></div>;
}

function PreviewColumn(props: { setViewport: (node: HTMLDivElement | null) => void; setOutput: (node: HTMLDivElement | null) => void; previewCue: Cue | null; exact: boolean; fitErrors: string[]; warnings: string[]; assetsReady: boolean; bookFaces: boolean; play: () => void; out: () => void; fullscreen: () => void; statusLabel?: string }) {
  // X4 (1) - the close affordance belongs to the full-screen preview only, so it is not in the
  // page at all otherwise; the stylesheet keeps it hidden as a second guard.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // eslint-disable-next-line react-hooks/refs -- Callback refs expose the two DOM hosts required by the imperative Player renderer; no ref value is read during render.
  return <aside className="preview-column"><div className="preview-heading"><div><span className="eyebrow">PREVIEW</span><h3>Broadcast frame</h3></div><span>1920 × 1080</span></div><div ref={props.setViewport} className="preview-viewport"><div className="preview-stage-label">PREVIEW</div>{fullscreen && <button className="preview-fullscreen-close" aria-label="Close full-screen preview" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); }}>× <span>Close preview</span></button>}<div ref={props.setOutput} id="output" className={props.bookFaces ? "author-output faces-book" : "author-output"} />{!props.previewCue && <div className="preview-placeholder"><Sparkles size={26} /><strong>Your graphic will appear here</strong><span>Add content, a title, and a visual template.</span></div>}</div><div className="preview-toolbar"><button onClick={props.play} disabled={!props.previewCue}><Play size={15} /> Play in</button><button onClick={props.out} disabled={!props.previewCue}><Square size={14} /> Play out</button><button onClick={props.fullscreen} disabled={!props.previewCue}><Maximize2 size={14} /> Full screen</button><span>{props.statusLabel || (props.previewCue ? "" : "Waiting for content")}</span></div><div className={`preview-readiness ${props.fitErrors.length ? "problem" : props.warnings.length ? "caution" : props.assetsReady ? "ready" : "waiting"}`}>{props.fitErrors.length ? <CircleAlert size={18} /> : props.assetsReady ? <Check size={18} /> : <Clock3 size={18} />}<div><strong>{props.fitErrors.length ? "Needs attention" : props.assetsReady ? "Fits this frame" : props.previewCue ? "Preparing preview" : "Waiting for content"}</strong>{props.fitErrors.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.warnings.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.assetsReady && <small>Fonts and artwork loaded. Review readability before publishing.</small>}</div></div></aside>;
}

function PublishDock(props: { dirty: boolean; draft: Draft | null; recoveryStoredAt: number | null; busy: string; ready: boolean; fitBlocked: boolean; publishedVersion: number | null; duplicate: () => void; backToLibrary: () => void; save: () => void; publish: () => void }) {
  // C5: Publish is offered whenever there is a saved version newer than the published one.
  const publishable = Boolean(props.draft) && !props.dirty && (props.draft!.version > (props.draft!.activeDraftVersion ?? 0));
  if (props.publishedVersion !== null)
    return <div className="publish-dock"><div className="save-state published"><Check size={18} /><span><strong>Published · version {props.publishedVersion} · live on next Show</strong><small>Nothing changed on screen. The operator decides when to show it.</small></span></div><div className="publish-actions"><button onClick={props.duplicate} disabled={!!props.busy}><Copy size={17} /> Duplicate</button><button className="review-button" onClick={props.backToLibrary} disabled={!!props.busy}><LibraryBig size={17} /> Back to library</button></div></div>;
  return <div className="publish-dock"><div className="save-state">{props.dirty ? <><CircleAlert size={18} /><span><strong>Unsaved changes</strong><small>{props.recoveryStoredAt ? `Recovery copy stored ${formatTime(props.recoveryStoredAt)}` : "A recovery copy will be stored in this browser."}</small></span></> : <><Check size={18} /><span><strong>{props.draft ? `Saved version ${props.draft.version}` : "Ready to save"}</strong></span></>}</div><div className="publish-actions"><button onClick={props.save} disabled={!props.ready || !!props.busy || (!props.dirty && !!props.draft)}><Save size={17} /> {props.busy === "save" ? "Saving…" : props.draft ? "Save draft" : "Save new draft"}</button>{props.fitBlocked ? <div className="publish-blocked"><button className="publish-button" disabled><CircleAlert size={17} /> Fix fit issues to publish</button><small>Publication is blocked while the preview reports fit problems.</small></div> : <button className="publish-button" onClick={props.publish} disabled={!publishable || !!props.busy}>{props.busy === "publish" ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Publish</button>}</div></div>;
}

function DuplicateNameDialog(props: { message: string; suggestedName: string; busy: string; cancel: () => void; confirm: () => void }) {
  return <div className="set-overview-backdrop" role="dialog" aria-modal="true" aria-labelledby="duplicate-name-title"><section className="duplicate-name-dialog"><header><div><span className="eyebrow">LIBRARY NAME</span><h3 id="duplicate-name-title">Another graphic uses this name</h3><p>{props.message}</p></div><button className="icon-button" aria-label="Close duplicate name confirmation" onClick={props.cancel}>×</button></header><footer><span>The graphic already on screen is unchanged.</span><div><button onClick={props.cancel}>Cancel</button><button className="primary-button" onClick={props.confirm} disabled={props.busy === "publish"}>{props.busy === "publish" ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Publish as “{props.suggestedName}”</button></div></footer></section></div>;
}

function HistoryDrawer({ revisions, activeRevision, close, activate }: { revisions: PublishedRevision[]; activeRevision: number | null; close: () => void; activate: (revision: number) => void }) {
  return <div className="history-drawer"><div className="history-header"><div><span className="eyebrow">REVISION HISTORY</span><h3>Published versions</h3></div><button className="icon-button" aria-label="Close history" onClick={close}>×</button></div>{revisions.map((item) => <div className="revision-row" key={item.revision}><span><strong>Revision {item.revision}</strong><small>Draft version {item.draftVersion} · {formatTime(item.createdAt)}</small></span>{activeRevision === item.revision ? <em>Current</em> : <button onClick={() => activate(item.revision)}>Use this version</button>}</div>)}{!revisions.length && <p className="empty">No published revisions yet.</p>}</div>;
}
