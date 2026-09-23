"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import type { AccessRole } from "@/lib/access";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceHeader from "@/components/workspace-header";
import { AuthoringApiError, authoringCall } from "./api";
import {
  draftHasUnpublishedWork,
  blocksForMode,
  editableFromForm,
  emptyForm,
  formFromDraft,
  formReady,
  moveDraftId,
  parseRecovery,
  recoveryKey,
  routeForDraft,
  selectWholeSource,
  shouldShowPanels,
  type RecoveryCopy,
} from "./editor-state";
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
  SourceFacet,
  SourceSummary,
  TemplateSummary,
} from "./types";
import { SiddurEditor } from "./siddur-editor";
import { LookDrawer, densityOptions, type WorkspaceAsset } from "./look-drawer";
import { CustomTextEditor, DetailsEditor } from "./custom-editor";
import "./author.css";
import SharedShelf, { expectedCueHashes, groupSharedEntries, matchesShelfQuery, shelfBadgeCount, type SharedComparison, type SharedShelfCard } from "./shared-shelf";
import { SourceReviewPanel, useSourceReview } from "./source-review";
import { itemName, sourceReviewName, variantCandidates, variantKey, type DraftSetReview, type EditorKind, type LibraryItem, type LibraryTab } from "./library-model";
import {
  AccessCard, ArchivedPanel, DuplicateNameDialog, EditorTitle, HistoryDrawer, LibrarySidebar,
  PreviewColumn, PublishDock, RecoveryBanner, SetOverview, SlideStrip, VariantCreator, VariantEditor, WelcomePanel,
} from "./panels";
import { sourceGroups, useSourceSearch } from "./use-source-search";
import { useSharedLibrary } from "./use-shared-library";
import { useWorkspaceAssets } from "./use-workspace-assets";
import { useFitReview } from "./use-fit-review";
import { togglePassage } from "./passage-selection";
import { useToasts } from "./use-toasts";

export default function AuthorPage() {
  const [key, setKey] = useState("");
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [archivedDrafts, setArchivedDrafts] = useState<Draft[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [catalog, setCatalog] = useState<CatalogCue[]>([]);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("published");
  const [libraryQuery, setLibraryQuery] = useState("");
  const sourceReview = useSourceReview();
  const loadSourceReview = sourceReview.load;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<DraftForm>(emptyForm);
  const [editorKind, setEditorKind] = useState<EditorKind | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const undoStack = useRef<DraftForm[]>([]);
  const redoStack = useRef<DraftForm[]>([]);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });

  const [workingPreview, setWorkingPreview] = useState<EphemeralPreviewResult | null>(null);
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
  const [nameWarning, setNameWarning] = useState<DuplicateNameWarning | null>(null);
  const [duplicateNamePrompt, setDuplicateNamePrompt] = useState<{ message: string; suggestedName: string } | null>(null);
  const [publishedState, setPublishedState] = useState<{ version: number } | null>(null);

  const { message, setMessage, error, setError, fail } = useToasts();
  const {
    exactPreview, setExactPreview, fitErrors, fitWarnings, previewWarnings, setPreviewWarnings, assetsReady,
    previewError, setPreviewError,
    viewportRef, outputRef, previewSequence, resetReview, showCue, clearStage, playOut,
  } = useFitReview(workspace, workingPreview, editorKind);
  const {
    sourceQuery, setSourceQuery, sourceResults, sourceTruncated, sourceFacets, setSourceFacets,
    source, setSource, bookFilter, setBookFilter, serviceFilter, setServiceFilter, activeGroup, setActiveGroup,
    browseSources, loadSource, showDraftSource, clearPicker, clearResults,
  } = useSourceSearch({ controlKey: key, setBusy, setError, fail });
  const { assets, setAssets, assetError, setAssetError, showArchivedAssets, setShowArchivedAssets, refreshAssets } = useWorkspaceAssets(key);
  const { sharedLibrary, sharedSelectedId, setSharedSelectedId, sharedPreview, setSharedPreview, refreshSharedLibrary } = useSharedLibrary({
    controlKey: key, sharedEnabled: Boolean(workspace?.sharedLibrary.enabled), onSharedTab: libraryTab === "shared", showCue, setBusy,
  });

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

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
  }, [resetHistory, resetReview, setActiveGroup]);

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
  }, [setSourceFacets]);

  const loadWorkspace = useCallback(async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) throw Error("Workspace identity is unavailable.");
    const next = await response.json() as PublicWorkspace;
    overlayBrandingFromWorkspace(next);
    setWorkspace(next);
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
  }, [applyLoadedDraft, checkRecovery, fail, setError, setMessage, showDraftSource]);

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

  // D3: the source-change filter appears only when something is waiting, so the count is read
  // once with the library rather than on a page of its own.
  useEffect(() => { if (key) void loadSourceReview(); }, [key, loadSourceReview]);

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
            setPreviewError(value instanceof Error ? value.message : "The server could not build this preview.");
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [editorKind, form, key, previewSequence, setPreviewError, setPreviewWarnings, showCue]);

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
  // The source-change filter exists only while it has something in it: deciding the last one
  // returns the rail to the library rather than leaving an empty filter lit.
  const activeLibraryTab: LibraryTab = libraryTab === "sources" && !sourceReview.records.length ? "published" : libraryTab;
  const visibleSourceReviews = sourceReview.records.filter((record) => sourceReviewName(record).toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));
  const visibleLibrary = (activeLibraryTab === "published" ? publishedItems : activeLibraryTab === "archived" ? archivedItems : draftItems).filter((item) => itemName(item).toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));
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

  function beginNew(next: DraftForm, kind: EditorKind) {
    if (!canLeave()) return false;
    setDraft(null); setForm(next); setEditorKind(kind); setDirty(false);
    clearPicker();
    clearStage();
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
    setDraft(null); setEditorKind(null);
    clearResults();
    clearStage();
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
    const index = Math.min(activeGroup, Math.max(0, form.groups.length - 1));
    const group = form.groups[index];
    if (group && group.sourceId !== source.id) return setError("Open the source assigned to this slide first.");
    // A translated blessing is checked whole, and a passage another slide holds moves here
    // (app/author/passage-selection.ts): both selections would otherwise be refused by the preview.
    const result = togglePassage({ groups: form.groups, activeGroup: index, sourceId: source.id, blocks: source.blocks, blockId, checked, withTranslation: form.mode === "bilingual" && form.layers.includes("en") });
    changeForm({ groups: result.groups });
    if (result.activeGroup !== index) setActiveGroup(result.activeGroup);
    if (result.movedFrom.length) setMessage(`Moved to slide ${result.activeGroup + 1} from slide ${result.movedFrom.map((slide) => slide + 1).join(", ")}.`);
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
    } catch (value) {
      previewedVersion.current = "";
      setPreviewError(value instanceof Error ? value.message : "The saved version could not be previewed.");
    }
  }, [key, setExactPreview, setPreviewError, setPreviewWarnings, showCue]);
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
    if ((tab === "shared" || tab === "sources") && !canLeave()) return;
    if (tab !== libraryTab) { setMessage(""); setError(""); }
    if (tab === "sources") sourceReview.openFilter();
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
          apiKey={key} workspace={workspace} refreshAfterPublish={async () => { await refreshLists(key); }}
          libraryTab={activeLibraryTab} setLibraryTab={chooseLibraryTab} libraryQuery={libraryQuery} setLibraryQuery={setLibraryQuery}
          role={role}
          sourceItems={visibleSourceReviews} sourceCount={sourceReview.records.length} sourceSelectedId={sourceReview.selected?.id || null}
          openSourceReview={(id) => void sourceReview.inspect(id)}
          checkSources={() => {
            // The menu closes as it runs and a cold scan takes a few seconds, so the notice
            // stack carries the wait as well as the answer.
            setMessage("Checking sources…");
            void sourceReview.scan().then((result) => { if (result.count) chooseLibraryTab("sources"); setMessage(result.message); });
          }} checkingSources={sourceReview.busy === "scan"}
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

        {activeLibraryTab === "sources" ? <SourceReviewPanel state={sourceReview} /> : activeLibraryTab === "shared" ? <SharedShelf
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
            out={playOut}
            fullscreen={() => void viewportRef.current?.requestFullscreen().catch(fail)}
            statusLabel={sharedPreview ? "CRC preview with TBI branding" : "Loading CRC preview"} />}
        /> : activeLibraryTab === "archived" ? <ArchivedPanel drafts={archivedItems.flatMap((item) => item.kind === "draft" ? [item.draft] : [])} query={libraryQuery} busy={busy} restore={(item) => void restoreArchived(item)} /> : !editorKind ? <WelcomePanel /> : (
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
                fitErrors={fitErrors} warnings={[...previewWarnings, ...fitWarnings]} assetsReady={assetsReady} previewError={previewError} bookFaces={Boolean(workspace?.bookFaces)}
                play={() => { if (previewCue) void showCue(previewCue, true); }}
                out={playOut}
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

