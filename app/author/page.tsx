"use client";

import Link from "next/link";
import {
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  FilePlus2,
  History,
  LibraryBig,
  LoaderCircle,
  Maximize2,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Square,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Player, type Cue } from "@/lib/player";
import { overlayBrandingFromWorkspace } from "@/lib/branding";
import type { PublicWorkspace } from "@/lib/workspace";
import { authoringCall } from "./api";
import {
  draftHasUnpublishedWork,
  blocksForMode,
  editableFromForm,
  emptyForm,
  formFromDraft,
  formReady,
  parseRecovery,
  recoveryKey,
  selectWholeSource,
  type RecoveryCopy,
} from "./editor-state";
import { findFitErrors, waitForPreviewAssets } from "./preview";
import type {
  BrowserMeasurement,
  CatalogCue,
  ContentMode,
  Draft,
  DraftForm,
  EphemeralPreviewResult,
  Layout,
  PreviewResult,
  PublishedRevision,
  ReviewReceipt,
  Source,
  SourceFacet,
  SourceEnglishRole,
  SourceSummary,
  TemplateSummary,
} from "./types";
import "./author.css";

type LibraryTab = "published" | "drafts" | "shared";
type EditorKind = "siddur" | "custom" | "edit";
type LibraryItem = { kind: "catalog"; cue: CatalogCue } | { kind: "draft"; draft: Draft };
type SharedCue = { id: string; name: string; title: string; layout: Layout; sourceIds: string[]; cueHash: string };
type SharedLibraryState = { available: boolean; cues: SharedCue[]; stale: boolean; refreshedAt: number | null; error: string | null };

const densityOptions = [
  { id: "comfortable", label: "Comfortable", value: {} },
  { id: "large", label: "Large print", value: { hebrewFontSize: 42, transliterationFontSize: 35, titleFontSize: 34 } },
  { id: "compact", label: "Compact", value: { hebrewFontSize: 34, transliterationFontSize: 28, titleFontSize: 28 } },
] as const;

const formatTime = (value?: number) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
const sourceLabel = (item: SourceSummary | Source) => {
  const seen = new Set<string>();
  const parts = [item.bookLabel, item.service, item.section, item.book].filter((value): value is string | number => value !== undefined && value !== null && String(value).trim() !== "");
  const unique = parts.filter((value) => {
    const key = String(value).toLocaleLowerCase().replace(/^crc\b/, "").replace(/[^\p{L}\p{N}]+/gu, "").trim();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return unique.join(" · ") || "Siddur library";
};
const itemName = (item: LibraryItem) => item.kind === "draft" ? item.draft.name : item.cue.name;
const layoutLabel = (layout: Layout) => layout === "bottom" ? "Lower third" : layout === "left" ? "Left panel" : "Right panel";
const sourceGroups = (draft: Draft) => draft.content.mode === "bilingual"
  ? draft.content.hebrewGroups
  : draft.content.mode === "source-en" || draft.content.mode === "original-en" ? draft.content.englishGroups : [];
const englishRoleLabel: Record<SourceEnglishRole, string> = {
  translation: "Translation",
  interpretation: "Interpretation",
  "translation-interpretation": "Translation / interpretation",
  reading: "Reading",
  kavannah: "Kavannah",
  rubric: "Service direction",
  note: "Source note",
  unclassified: "English text",
};

export default function AuthorPage() {
  const [key, setKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<PublicWorkspace | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [catalog, setCatalog] = useState<CatalogCue[]>([]);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("published");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [sharedLibrary, setSharedLibrary] = useState<SharedLibraryState>({ available: false, cues: [], stale: false, refreshedAt: null, error: null });
  const [sharedSelectedId, setSharedSelectedId] = useState<string | null>(null);
  const [sharedPreview, setSharedPreview] = useState<Cue | null>(null);
  const [sharedPreviewHash, setSharedPreviewHash] = useState<string | null>(null);
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
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [assetsReady, setAssetsReady] = useState(false);
  const [revisions, setRevisions] = useState<PublishedRevision[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryCopy | null>(null);
  const [recoveryStoredAt, setRecoveryStoredAt] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const viewportRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const previewSequence = useRef(0);
  const animationRevision = useRef(0);

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const fail = useCallback((value: unknown) => {
    setError(value instanceof Error ? value.message : "Something went wrong.");
    setMessage("");
  }, []);

  const resetReview = useCallback(() => {
    setExactPreview(null);
    setFitErrors([]);
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
  }, [resetHistory, resetReview]);

  const refreshLists = useCallback(async (controlKey: string) => {
    const [draftResponse, templateResponse, catalogResponse, workspaceResponse, facetsResponse] = await Promise.all([
      authoringCall<{ drafts: Draft[] }>(controlKey, "list_drafts"),
      authoringCall<{ templates: TemplateSummary[] }>(controlKey, "list_templates"),
      authoringCall<{ cues: CatalogCue[] }>(controlKey, "list_catalog"),
      authoringCall<{ workspace: { rehearsal: boolean; label: string | null } }>(controlKey, "get_workspace"),
      authoringCall<{ books: SourceFacet[]; services: SourceFacet[] }>(controlKey, "source_facets"),
    ]);
    setDrafts(draftResponse.drafts || []);
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
      setSharedPreviewHash(null);
      setSharedLibrary({ available: response.available, cues, stale: Boolean(response.stale), refreshedAt: response.refreshedAt || Date.now(), error: response.error || null });
      setSharedSelectedId((current) => current && cues.some((cue) => cue.id === current) ? current : cues[0]?.id || null);
    } catch (value) {
      setSharedLibrary((current) => ({ ...current, available: false, stale: current.cues.length > 0, error: value instanceof Error ? value.message : "CRC library is temporarily unavailable." }));
    } finally { setBusy(""); }
  }, []);

  const loadSource = useCallback(async (controlKey: string, sourceId: string) => {
    const response = await authoringCall<{ source: Source }>(controlKey, "get_source", { sourceId });
    setSource(response.source);
    return response.source;
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
    try {
      const response = await authoringCall<{ draft: Draft }>(controlKey, "get_draft", { draftId });
      const next = response.draft;
      applyLoadedDraft(next);
      const first = sourceGroups(next)[0];
      if (first) {
        const snapshot = next.sourceSnapshots?.find((item) => item.id === first.sourceId);
        if (snapshot) setSource(snapshot); else await loadSource(controlKey, first.sourceId);
      }
      else setSource(null);
      checkRecovery(next);
      history.replaceState(null, "", `/author?draft=${encodeURIComponent(next.id)}`);
      setMessage(`Opened “${next.name}”. Published output is unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }, [applyLoadedDraft, checkRecovery, fail, loadSource]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      await loadWorkspace();
      if (cancelled) return;
      const access = await fetch("/api/access", { cache: "no-store" }).catch(() => null);
      if (access?.ok) {
        const body = await access.json().catch(() => null) as { user?: { role?: string } } | null;
        if (body?.user && ["owner", "editor"].includes(body.user.role || "")) {
          await refreshLists("session");
          if (cancelled) return;
          setKey("session");
          const id = new URLSearchParams(location.search).get("draft");
          if (id) await openDraft("session", id);
          return;
        }
      }
      const saved = sessionStorage.getItem("crc-control-key") || "";
      if (!saved) return;
      await refreshLists(saved);
      if (cancelled) return;
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
    const player = new Player(root, [cue], overlayBrandingFromWorkspace(workspace));
    playerRef.current = player;
    setAssetsReady(false);
    setFitErrors([]);
    if (animate) player.set({ cue: cue.id, revision: ++animationRevision.current, mode: "animate" });
    else player.render(cue);
    await waitForPreviewAssets(root);
    if (current !== previewSequence.current) return;
    setAssetsReady(true);
    setFitErrors(findFitErrors(root));
  }, [workspace]);

  useEffect(() => {
    if (!key || !workspace?.sharedLibrary.enabled) return;
    void refreshSharedLibrary(key);
  }, [key, refreshSharedLibrary, workspace?.sharedLibrary.enabled]);

  useEffect(() => {
    if (!key || libraryTab !== "shared" || !sharedSelectedId) return;
    let cancelled = false;
    setBusy("shared-preview");
    void authoringCall<{ available: boolean; stale?: boolean; refreshedAt?: number; cue?: Cue; cueHash?: string; error?: string }>(key, "preview_shared_cue", { cueId: sharedSelectedId })
      .then((response) => {
        if (cancelled) return;
        if (!response.available || !response.cue || !response.cueHash) throw Error(response.error || "CRC library is temporarily unavailable.");
        setSharedPreview(response.cue);
        setSharedPreviewHash(response.cueHash);
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
  const visibleLibrary = (libraryTab === "published" ? publishedItems : draftItems).filter((item) => itemName(item).toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));
  const visibleShared = sharedLibrary.cues.filter((item) => `${item.name} ${item.title}`.toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));
  const selectedShared = visibleShared.find((item) => item.id === sharedSelectedId) || null;
  const eligibleBlocks = blocksForMode(source, form.mode);
  const selectedIds = new Set(form.groups[activeGroup]?.blockIds || []);
  const previewCue = formReady(form) ? exactPreview?.cue || workingPreview?.cue || null : null;
  const exactPreviewCurrent = !!draft && !dirty && exactPreview?.draftVersion === draft.version && assetsReady && !fitErrors.length;
  const selectedDensity = densityOptions.find((option) => JSON.stringify(option.value) === JSON.stringify(form.presentation))?.id || "custom";
  const draftSet = draft?.draftSetId ? drafts.filter((item) => item.draftSetId === draft.draftSetId).sort((a, b) => (a.setIndex || 0) - (b.setIndex || 0)) : [];
  const draftSetPosition = draft ? draftSet.findIndex((item) => item.id === draft.id) : -1;

  async function connect() {
    setBusy("connect"); setError("");
    try {
      await refreshLists(keyInput);
      sessionStorage.setItem("crc-control-key", keyInput);
      setKey(keyInput);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

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
    setWorkingPreview(null); resetReview(); resetHistory(); setRevisions([]); setShowHistory(false);
    history.replaceState(null, "", "/author"); checkRecovery(null);
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

  async function openCatalogCue(cue: CatalogCue) {
    if (!canLeave()) return;
    if (cue.editAction === "open" && cue.draftId) return openDraft(key, cue.draftId);
    if (cue.editAction === "duplicate") return duplicateItem({ kind: "catalog", cue });
    setBusy("import"); setError("");
    try {
      const response = await authoringCall<{ draft: Draft }>(key, "import_cue", { cueId: cue.id });
      applyLoadedDraft(response.draft);
      const first = sourceGroups(response.draft)[0];
      if (first) await loadSource(key, first.sourceId);
      setDrafts((items) => [response.draft, ...items.filter((item) => item.id !== response.draft.id)]);
      history.replaceState(null, "", `/author?draft=${encodeURIComponent(response.draft.id)}`);
      setMessage(`Opened “${response.draft.name}” for editing. Its Companion cue remains linked.`);
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
      setDrafts((items) => [response.draft, ...items.filter((entry) => entry.id !== response.draft.id)]);
      setLibraryTab("drafts");
      history.replaceState(null, "", `/author?draft=${encodeURIComponent(response.draft.id)}`);
      setMessage(`Created “${response.draft.name}”. The original is unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function customizeSharedCue() {
    if (!sharedSelectedId || !sharedPreviewHash || !canLeave()) return;
    setBusy("shared-customize"); setError("");
    try {
      const response = await authoringCall<{ draft: Draft; sharedFrom: { workspaceId: string; cueId: string; cueHash: string } }>(key, "customize_shared_cue", { cueId: sharedSelectedId, expectedCueHash: sharedPreviewHash });
      applyLoadedDraft(response.draft);
      const firstGroup = sourceGroups(response.draft)[0];
      setSource(firstGroup ? response.draft.sourceSnapshots?.find((item) => item.id === firstGroup.sourceId) || null : null);
      setDrafts((items) => [response.draft, ...items.filter((item) => item.id !== response.draft.id)]);
      setLibraryTab("drafts");
      history.replaceState(null, "", `/author?draft=${encodeURIComponent(response.draft.id)}`);
      setMessage(`Created an independent draft from “${response.draft.name}”. Future CRC updates will not overwrite your changes.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function selectSource(item: SourceSummary) {
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
    if (group.sourceId !== source.id) return setError("Open the source assigned to this panel first.");
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

  async function save() {
    if (!formReady(form)) return setError("Add a name, title, template, and content before saving.");
    setBusy("save"); setError("");
    try {
      const response = draft
        ? await authoringCall<{ draft: Draft }>(key, "update_draft", { draftId: draft.id, expectedVersion: draft.version, patch: editableFromForm(form) })
        : await authoringCall<{ draft: Draft }>(key, "create_draft", editableFromForm(form));
      if (!draft) localStorage.removeItem(recoveryKey(null));
      localStorage.removeItem(recoveryKey(response.draft.id));
      applyLoadedDraft(response.draft);
      setDrafts((items) => [response.draft, ...items.filter((item) => item.id !== response.draft.id)]);
      history.replaceState(null, "", `/author?draft=${encodeURIComponent(response.draft.id)}`);
      setMessage(`Draft saved as version ${response.draft.version}. Published output is unchanged.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function reviewSavedVersion() {
    if (!draft || dirty) return;
    setBusy("review"); setError(""); resetReview();
    try {
      const response = await authoringCall<PreviewResult>(key, "preview_draft", { draftId: draft.id, expectedVersion: draft.version });
      setExactPreview(response); setPreviewWarnings(response.validation?.warnings || []);
      await showCue(response.cue);
      setMessage(`Reviewing exact saved version ${draft.version}. Nothing has been published yet.`);
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }

  async function publishReviewedVersion() {
    if (!draft || !exactPreview || !exactPreviewCurrent) return;
    setBusy("publish"); setError("");
    const browserMeasurement: BrowserMeasurement = { viewportWidth: 1920, viewportHeight: 1080, fontsReady: true, overflow: false, rendererVersion: "crc-author-preview-v2", measuredAt: Date.now() };
    try {
      await authoringCall<ReviewReceipt>(key, "review_draft", { draftId: draft.id, expectedVersion: draft.version, previewId: exactPreview.previewId, browserMeasurement, humanApproved: true });
      const response = await authoringCall<{ revision: PublishedRevision; warning?: string }>(key, "publish_draft", { draftId: draft.id, expectedVersion: draft.version, previewId: exactPreview.previewId });
      const latest = (await authoringCall<{ draft: Draft }>(key, "get_draft", { draftId: draft.id })).draft;
      applyLoadedDraft(latest);
      setDrafts((items) => [latest, ...items.filter((item) => item.id !== latest.id)]);
      await refreshLists(key);
      setMessage(response.warning || `Published reviewed version ${response.revision.draftVersion}. The graphic already on screen is unchanged.`);
    } catch (value) { fail(value); }
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
    setLibraryTab(tab);
  }

  const workspaceStyle = workspace ? {
    "--workspace-primary": workspace.colors.primary,
    "--workspace-deep": workspace.colors.deep,
    "--workspace-accent": workspace.colors.accent,
  } as CSSProperties : undefined;

  if (!key) return <AccessCard productName={workspace?.productName || "Overlays"} style={workspaceStyle} keyInput={keyInput} setKeyInput={setKeyInput} connect={() => void connect()} busy={busy} error={error} />;

  return (
    <main className="author-page" style={workspaceStyle}>
      <header className="author-header">
        <div className="brand-lockup"><div className="brand-mark"><BookOpenText size={21} /></div><div><span className="eyebrow">{workspace?.productName || "OVERLAYS"}</span><h1>Graphics library</h1></div></div>
        <div className="header-actions"><span className="safety-note"><span /> Editing is isolated from live output</span><Link href="/">Live control</Link></div>
      </header>
      {workspaceLabel && <div className="workspace-banner"><CircleAlert size={16} />{workspaceLabel}</div>}

      <div className="author-shell">
        <LibrarySidebar
          publishedItems={publishedItems} draftItems={draftItems} visibleLibrary={visibleLibrary}
          libraryTab={libraryTab} setLibraryTab={chooseLibraryTab} libraryQuery={libraryQuery} setLibraryQuery={setLibraryQuery}
          sharedEnabled={Boolean(workspace?.sharedLibrary.enabled)} sharedLabel={workspace?.sharedLibrary.label || "CRC library"}
          sharedItems={visibleShared} sharedTotal={sharedLibrary.cues.length} sharedSelectedId={sharedSelectedId} selectShared={(id) => { setSharedPreview(null); setSharedPreviewHash(null); setSharedSelectedId(id); }}
          activeDraftId={draft?.id || null} beginSiddur={beginSiddur} beginCustom={beginCustom}
          openItem={(item) => {
            if (item.kind === "draft") { if (canLeave()) void openDraft(key, item.draft.id); }
            else void openCatalogCue(item.cue);
          }}
          duplicateItem={(item) => void duplicateItem(item)}
        />

        {libraryTab === "shared" ? <SharedLibraryPanel
          state={sharedLibrary} selected={selectedShared} previewCue={sharedPreview} busy={busy}
          canCustomize={Boolean(sharedPreview && sharedPreviewHash)}
          refreshedAt={sharedLibrary.refreshedAt} refresh={() => void refreshSharedLibrary(key, true)} customize={() => void customizeSharedCue()}
          returnLocal={() => setLibraryTab("published")}
          setViewport={(node) => { viewportRef.current = node; }} setOutput={(node) => { outputRef.current = node; }}
          play={() => { if (sharedPreview) void showCue(sharedPreview, true); }}
          out={() => playerRef.current?.set({ cue: null, revision: ++animationRevision.current, mode: "animate" })}
          fullscreen={() => void viewportRef.current?.requestFullscreen().catch(fail)}
          fitErrors={fitErrors} warnings={previewWarnings} assetsReady={assetsReady}
        /> : !editorKind ? <WelcomePanel beginSiddur={beginSiddur} beginCustom={beginCustom} /> : (
          <section className="editor-workspace">
            <EditorTitle
              form={form} draft={draft} dirty={dirty} busy={busy} undo={undo} redo={redo}
              canUndo={historyAvailability.canUndo} canRedo={historyAvailability.canRedo}
              duplicate={() => void duplicateItem()} history={() => void loadRevisions()}
              setPosition={draftSetPosition} setCount={draftSet.length}
              previousSlide={() => { const previous = draftSet[draftSetPosition - 1]; if (previous) void openDraft(key, previous.id); }}
              nextSlide={() => { const next = draftSet[draftSetPosition + 1]; if (next) void openDraft(key, next.id); }}
            />
            {recovery && <RecoveryBanner recovery={recovery} restore={restoreRecovery} discard={discardRecovery} />}

            <div className="editing-grid">
              <div className="form-column">
                {editorKind === "siddur" || (form.mode !== "custom" && editorKind === "edit") ? (
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
                    changeMode={(mode) => changeForm({ mode, groups: [], includeTranslation: false })}
                    changeForm={changeForm} busy={busy}
                  />
                ) : <CustomTextEditor form={form} changeForm={changeForm} />}

                <DetailsEditor form={form} changeForm={changeForm} />
                <AppearanceEditor form={form} templates={templates} selectedDensity={selectedDensity} changeForm={changeForm} />
              </div>

              <PreviewColumn
                setViewport={(node) => { viewportRef.current = node; }} setOutput={(node) => { outputRef.current = node; }} previewCue={previewCue} exact={!!exactPreview}
                fitErrors={fitErrors} warnings={previewWarnings} assetsReady={assetsReady}
                play={() => { if (previewCue) void showCue(previewCue, true); }}
                out={() => playerRef.current?.set({ cue: null, revision: ++animationRevision.current, mode: "animate" })}
                fullscreen={() => void viewportRef.current?.requestFullscreen().catch(fail)}
              />
            </div>

            <PublishDock
              dirty={dirty} draft={draft} recoveryStoredAt={recoveryStoredAt} busy={busy}
              ready={formReady(form)} exactPreviewCurrent={exactPreviewCurrent}
              save={() => void save()} review={() => void reviewSavedVersion()} publish={() => void publishReviewedVersion()}
            />
            {showHistory && <HistoryDrawer revisions={revisions} activeRevision={draft?.activeRevision || null} close={() => setShowHistory(false)} activate={(revision) => void activateRevision(revision)} />}
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

function AccessCard({ productName, style, keyInput, setKeyInput, connect, busy, error }: { productName: string; style?: CSSProperties; keyInput: string; setKeyInput: (value: string) => void; connect: () => void; busy: string; error: string }) {
  return <main className="author-page access-page" style={style}><div className="access-card"><div className="brand-mark"><BookOpenText size={22} /></div><span className="eyebrow">{productName}</span><h1>Open the editor</h1><p>Sign in to create and prepare graphics without changing what is live.</p><Link className="access-link" href="/access">Sign in</Link><div className="access-divider"><span>or use the existing admin key</span></div><form onSubmit={(event) => { event.preventDefault(); connect(); }}><label>Control key<input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} required /></label><button className="primary-button" disabled={busy === "connect"}>{busy === "connect" ? <><LoaderCircle className="spin" size={18} /> Opening…</> : "Open graphics library"}</button></form>{error && <p role="alert" className="inline-error">{error}</p>}</div></main>;
}

function LibrarySidebar(props: {
  publishedItems: LibraryItem[]; draftItems: LibraryItem[]; visibleLibrary: LibraryItem[];
  libraryTab: LibraryTab; setLibraryTab: (tab: LibraryTab) => void; libraryQuery: string; setLibraryQuery: (query: string) => void;
  sharedEnabled: boolean; sharedLabel: string; sharedItems: SharedCue[]; sharedTotal: number; sharedSelectedId: string | null; selectShared: (id: string) => void;
  activeDraftId: string | null; beginSiddur: () => void; beginCustom: () => void;
  openItem: (item: LibraryItem) => void; duplicateItem: (item: LibraryItem) => void;
}) {
  return <aside className="library-sidebar">
    <div className="create-stack"><button className="siddur-button" onClick={props.beginSiddur}><BookOpenText size={19} /><span><strong>Add from siddur</strong><small>Find a prayer or reading</small></span></button><button className="secondary-create" onClick={props.beginCustom}><FilePlus2 size={17} /> New custom graphic</button></div>
    <div className={`library-tabs ${props.sharedEnabled ? "three-tabs" : ""}`} role="tablist" aria-label="Graphics library">
      <button role="tab" aria-selected={props.libraryTab === "published"} className={props.libraryTab === "published" ? "active" : ""} onClick={() => props.setLibraryTab("published")}>Published <span>{props.publishedItems.length}</span></button>
      <button role="tab" aria-selected={props.libraryTab === "drafts"} className={props.libraryTab === "drafts" ? "active" : ""} onClick={() => props.setLibraryTab("drafts")}>Drafts <span>{props.draftItems.length}</span></button>
      {props.sharedEnabled && <button role="tab" aria-selected={props.libraryTab === "shared"} className={props.libraryTab === "shared" ? "active" : ""} onClick={() => props.setLibraryTab("shared")}>{props.sharedLabel} <span>{props.sharedTotal}</span></button>}
    </div>
    <label className="library-search"><Search size={16} /><input aria-label={`Search ${props.libraryTab}`} value={props.libraryQuery} onChange={(event) => props.setLibraryQuery(event.target.value)} placeholder={`Search ${props.libraryTab}`} /></label>
    <div className="library-list">
      {props.libraryTab === "shared" ? props.sharedItems.map((item) => <article key={item.id} className={`library-card shared-card ${props.sharedSelectedId === item.id ? "active" : ""}`}><button className="library-card-main" onClick={() => props.selectShared(item.id)}><span className={`mini-frame ${item.layout}`}><span /></span><span><strong>{item.name}</strong><small>CRC published · {layoutLabel(item.layout)}</small></span></button></article>) : props.visibleLibrary.map((item) => {
        const id = item.kind === "draft" ? item.draft.id : item.cue.id;
        const active = item.kind === "draft" ? props.activeDraftId === item.draft.id : props.activeDraftId === item.cue.draftId;
        const layout = item.kind === "draft" ? item.draft.layout : item.cue.layout;
        const subtitle = item.kind === "draft" ? item.draft.activeRevision ? `Published · changes in version ${item.draft.version}` : `Draft version ${item.draft.version}` : `${item.cue.origin === "canonical" ? "Siddur" : "Custom"} · ${layoutLabel(layout)}`;
        return <article key={`${item.kind}-${id}`} className={`library-card ${active ? "active" : ""}`}><button className="library-card-main" onClick={() => props.openItem(item)}><span className={`mini-frame ${layout}`}><span /></span><span><strong>{itemName(item)}</strong><small>{subtitle}</small></span></button><button className="icon-button card-copy" aria-label={`Duplicate ${itemName(item)}`} title="Duplicate" onClick={() => props.duplicateItem(item)}><Copy size={14} /></button></article>;
      })}
      {!(props.libraryTab === "shared" ? props.sharedItems.length : props.visibleLibrary.length) && <div className="library-empty"><LibraryBig size={24} /><p>No matching {props.libraryTab === "shared" ? props.sharedLabel : props.libraryTab}.</p></div>}
    </div>
  </aside>;
}

function WelcomePanel({ beginSiddur, beginCustom }: { beginSiddur: () => void; beginCustom: () => void }) {
  return <section className="welcome-panel"><div className="welcome-art"><BookOpenText size={42} /></div><span className="eyebrow">READY WHEN YOU ARE</span><h2>Prepare a graphic without touching live output.</h2><p>Start with an authorized passage from the siddur library, or open a published graphic to edit or duplicate it.</p><div className="welcome-actions"><button className="primary-button" onClick={beginSiddur}><BookOpenText size={18} /> Add from siddur</button><button onClick={beginCustom}><FilePlus2 size={18} /> New custom graphic</button></div></section>;
}

function SharedLibraryPanel(props: {
  state: SharedLibraryState; selected: SharedCue | null; previewCue: Cue | null; canCustomize: boolean; busy: string; refreshedAt: number | null;
  refresh: () => void; customize: () => void; returnLocal: () => void;
  setViewport: (node: HTMLDivElement | null) => void; setOutput: (node: HTMLDivElement | null) => void;
  play: () => void; out: () => void; fullscreen: () => void; fitErrors: string[]; warnings: string[]; assetsReady: boolean;
}) {
  if (!props.state.available && !props.state.cues.length) return <section className="shared-library-panel shared-unavailable"><div className="welcome-art"><LibraryBig size={39} /></div><span className="eyebrow">CRC LIBRARY</span><h2>CRC library is temporarily unavailable.</h2><p>{props.state.error || "Your congregation’s own published graphics and drafts remain available."}</p><div className="welcome-actions"><button className="primary-button" onClick={props.refresh} disabled={props.busy === "shared-refresh"}>{props.busy === "shared-refresh" ? <LoaderCircle className="spin" size={17} /> : <RotateCcw size={17} />} Try again</button><button onClick={props.returnLocal}>Return to Published</button></div></section>;
  return <section className="shared-library-panel"><header className="shared-header"><div><span className="eyebrow">READ-ONLY STARTING POINTS</span><h2>CRC library</h2><p>Choose any current CRC graphic, then make an independent copy for your congregation.</p></div><div className="shared-refresh"><span>{props.state.stale ? "Showing the most recent saved list" : props.refreshedAt ? `Updated ${formatTime(props.refreshedAt)}` : "Ready to refresh"}</span><button onClick={props.refresh} disabled={props.busy === "shared-refresh"}>{props.busy === "shared-refresh" ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />} Refresh</button></div></header>{props.state.error && <div className="shared-warning"><CircleAlert size={17} />{props.state.error}</div>}{props.selected ? <div className="shared-detail"><div className="shared-information"><span className="status-chip published">CRC published</span><h3>{props.selected.name}</h3><p className="shared-title">{props.selected.title}</p><dl><div><dt>Layout</dt><dd>{layoutLabel(props.selected.layout)}</dd></div><div><dt>Source</dt><dd>{props.selected.sourceIds.length ? `${props.selected.sourceIds.length} referenced source${props.selected.sourceIds.length === 1 ? "" : "s"}` : "Custom CRC graphic"}</dd></div></dl><div className="shared-copy-note"><Copy size={18} /><span><strong>Your copy stays independent</strong><small>CRC additions appear here on refresh. CRC changes never overwrite the draft you customize.</small></span></div><button className="primary-button shared-customize" onClick={props.customize} disabled={!props.state.available || !props.canCustomize || props.busy === "shared-customize"}>{props.busy === "shared-customize" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} {props.canCustomize ? "Customize for our congregation" : "Loading exact preview…"}</button></div><PreviewColumn setViewport={props.setViewport} setOutput={props.setOutput} previewCue={props.previewCue} exact={true} fitErrors={props.fitErrors} warnings={props.warnings} assetsReady={props.assetsReady} play={props.play} out={props.out} fullscreen={props.fullscreen} statusLabel={props.previewCue ? "CRC published preview · read only" : "Loading CRC preview"} /></div> : <div className="shared-empty"><LibraryBig size={28} /><h3>No CRC graphics match this search.</h3><p>Clear the search or refresh the library.</p></div>}</section>;
}

function EditorTitle(props: { form: DraftForm; draft: Draft | null; dirty: boolean; busy: string; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; duplicate: () => void; history: () => void; setPosition: number; setCount: number; previousSlide: () => void; nextSlide: () => void }) {
  return <div className="editor-titlebar"><div><div className="editor-status-line"><span className={`status-chip ${props.draft?.activeRevision ? "published" : "draft"}`}>{props.draft?.activeRevision ? "Published" : "Draft"}</span>{props.dirty ? <span className="unsaved-dot">Unsaved changes</span> : props.draft ? <span>Saved version {props.draft.version}</span> : <span>New graphic</span>}{props.setCount > 1 && <span className="set-position">Slide {props.setPosition + 1} of {props.setCount}</span>}</div><h2>{props.form.name || (props.form.mode === "custom" ? "New custom graphic" : "Add from siddur")}</h2><p>{props.draft?.activeRevision ? "The published version stays available while you work." : "Publish makes this version available to the operator."}</p></div><div className="editor-tools">{props.setCount > 1 && <><button onClick={props.previousSlide} disabled={props.setPosition <= 0 || !!props.busy}><ChevronLeft size={16} /> Previous</button><button onClick={props.nextSlide} disabled={props.setPosition >= props.setCount - 1 || !!props.busy}>Next <ChevronRight size={16} /></button></>}<button className="icon-button" onClick={props.undo} disabled={!props.canUndo} title="Undo"><Undo2 size={17} /></button><button className="icon-button" onClick={props.redo} disabled={!props.canRedo} title="Redo"><Redo2 size={17} /></button>{props.draft && <button onClick={props.duplicate} disabled={props.busy === "duplicate"}><Copy size={16} /> Duplicate</button>}{props.draft && <button onClick={props.history}><History size={16} /> History</button>}</div></div>;
}

function RecoveryBanner({ recovery, restore, discard }: { recovery: RecoveryCopy; restore: () => void; discard: () => void }) {
  return <div className="recovery-banner"><RotateCcw size={19} /><div><strong>Unsaved browser changes are available</strong><small>Stored {formatTime(recovery.savedAt)}. They have not replaced the saved draft.</small></div><button onClick={restore}>Restore</button><button className="text-button" onClick={discard}>Discard</button></div>;
}

type SiddurEditorProps = {
  query: string; setQuery: (value: string) => void; results: SourceSummary[]; source: Source | null; form: DraftForm;
  truncated: boolean;
  books: SourceFacet[]; services: SourceFacet[]; bookFilter: string; serviceFilter: string;
  setBookFilter: (value: string) => void; setServiceFilter: (value: string) => void; search: () => void;
  selectSource: (item: SourceSummary) => void; clearSource: () => void; eligibleBlocks: Source["blocks"];
  selectedIds: Set<string>; activeGroup: number; setActiveGroup: (index: number) => void;
  chooseWholePrayer: () => void; toggleBlock: (id: string, checked: boolean) => void; addPanel: () => void; removePanel: () => void;
  makeSlidesFromWholePrayer: () => void;
  changeMode: (mode: Exclude<ContentMode, "custom">) => void; changeForm: (patch: Partial<DraftForm>) => void; busy: string;
};

function SiddurEditor(props: SiddurEditorProps) {
  const omittedFromAutomatic = props.form.mode === "source-en"
    ? props.eligibleBlocks.filter((block) => block.automatic === false).length
    : 0;
  return <section className="form-section siddur-section"><div className="section-heading"><span>1</span><div><h3>Choose from the siddur</h3><p>Search by prayer, Hebrew, common spelling, or opening words.</p></div></div>
    <div className="siddur-search-row"><label className="source-search"><span className="sr-only">Search siddur library</span><Search size={17} /><input aria-label="Search siddur library" value={props.query} onChange={(event) => props.setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); props.search(); } }} placeholder="Search prayers and readings" /></label><button onClick={props.search} disabled={props.busy === "search"}>{props.busy === "search" ? <LoaderCircle className="spin" size={17} /> : "Search"}</button></div>
    {(props.books.length > 0 || props.services.length > 0) && <div className="source-filters"><label>Book<select value={props.bookFilter} onChange={(event) => props.setBookFilter(event.target.value)}><option value="">All books</option>{props.books.map((book) => <option key={book.value} value={book.value}>{book.label} ({book.count})</option>)}</select></label><label>Service<select value={props.serviceFilter} onChange={(event) => props.setServiceFilter(event.target.value)}><option value="">All services</option>{props.services.map((service) => <option key={service.value} value={service.value}>{service.label} ({service.count})</option>)}</select></label></div>}
    {!props.source ? <div className="source-results">{props.truncated && <p className="results-note">Showing the first {props.results.length}. Choose a book or service, or search to narrow the list.</p>}{props.results.map((item) => <button key={item.id} onClick={() => props.selectSource(item)}><span className="source-book"><BookOpenText size={18} /></span><span><strong>{item.name}</strong><small>{sourceLabel(item)}</small>{item.openingWords?.[0] && <em>{item.openingWords[0]}</em>}</span><ChevronRight size={17} /></button>)}{!props.results.length && <div className="source-empty"><BookOpenText size={24} /><p>Browse the library or search for a prayer.</p></div>}</div> : <div className="passage-picker">
      <div className="passage-header"><button className="icon-button" title="Back to results" onClick={props.clearSource}><ChevronLeft size={17} /></button><div><small>{sourceLabel(props.source)}</small><h4>{props.source.name}</h4></div><div className="whole-prayer-actions"><button onClick={props.chooseWholePrayer}>Select all passages</button><button className="primary-button" onClick={props.makeSlidesFromWholePrayer} disabled={props.busy === "make-set"}>{props.busy === "make-set" ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />} Make slides from whole prayer</button></div></div>
      <div className="content-mode-toggle">{props.source.blocks.some((block) => block.kind === "bilingual") && <button className={props.form.mode === "bilingual" ? "active" : ""} onClick={() => props.changeMode("bilingual")}>Hebrew + transliteration</button>}{blocksForMode(props.source, "source-en").length > 0 && <button className={props.form.mode === "source-en" ? "active" : ""} onClick={() => props.changeMode("source-en")}>English from siddur</button>}{props.source.blocks.some((block) => block.kind === "original-en") && <button className={props.form.mode === "original-en" ? "active" : ""} onClick={() => props.changeMode("original-en")}>Original English reading</button>}</div>
      {props.source.blocks.some((block) => block.kind === "translation-en") && props.form.mode === "bilingual" && <label className="translation-choice"><input type="checkbox" checked={!!props.form.includeTranslation} onChange={(event) => props.changeForm({ includeTranslation: event.target.checked })} /> Include approved English where available</label>}
      {omittedFromAutomatic > 0 && <p className="source-mode-note">{omittedFromAutomatic} service {omittedFromAutomatic === 1 ? "note is" : "notes are"} available for manual selection below. Automatic slides use the prayer and reading text.</p>}
      <div className="panel-tabs">{props.form.groups.map((group, index) => <button key={`${group.sourceId}-${index}`} className={props.activeGroup === index ? "active" : ""} onClick={() => props.setActiveGroup(index)}>Section {index + 1}<small>{group.blockIds.length} passages</small></button>)}<button onClick={props.addPanel}>+ Add section</button></div>
      <div className="passage-list">{props.eligibleBlocks.map((block) => <label key={block.id} className={props.selectedIds.has(block.id) ? "selected" : ""}><input type="checkbox" checked={props.selectedIds.has(block.id)} onChange={(event) => props.toggleBlock(block.id, event.target.checked)} /><span className="passage-number">{block.index + 1}</span><span>{props.form.mode === "bilingual" ? <><b lang="he" dir="rtl">{block.he}</b><small>{block.tr}</small></> : <><b>{block.en}</b>{props.form.mode === "source-en" && <small className="passage-meta">{englishRoleLabel[block.englishRole || "unclassified"]}{block.automatic === false ? " · manual selection" : ""}</small>}</>}</span></label>)}</div>
      {props.form.groups.length > 1 && <button className="remove-panel" onClick={props.removePanel}>Remove section {props.activeGroup + 1}</button>}
    </div>}
  </section>;
}

function CustomTextEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <section className="form-section custom-section"><div className="section-heading"><span>1</span><div><h3>Write the graphic</h3><p>For announcements, welcome messages, names, and community-specific readings.</p></div></div><label>Custom text <span>{form.customText.length} / 4000</span><textarea value={form.customText} maxLength={4000} onChange={(event) => changeForm({ customText: event.target.value })} placeholder="Type the words that should appear on screen…" /></label><div className="provenance-note"><Sparkles size={17} /><span><strong>Custom congregation text</strong><small>This text is separate from the authorized siddur library.</small></span></div></section>;
}

function DetailsEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <section className="form-section details-section"><div className="section-heading"><span>2</span><div><h3>Name and title</h3><p>Names help the operator find the right graphic.</p></div></div><label>Library name<input value={form.name} maxLength={80} onChange={(event) => changeForm({ name: event.target.value })} placeholder="Example: Welcome to Shabbat" /></label><div className="field-pair"><label>On-screen title<input value={form.title} maxLength={100} onChange={(event) => changeForm({ title: event.target.value })} /></label><label>Hebrew accent <span>optional</span><input dir="rtl" value={form.accentTitle} maxLength={60} onChange={(event) => changeForm({ accentTitle: event.target.value })} /></label></div></section>;
}

function AppearanceEditor({ form, templates, selectedDensity, changeForm }: { form: DraftForm; templates: TemplateSummary[]; selectedDensity: string; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <section className="form-section appearance-section"><div className="section-heading"><span>3</span><div><h3>Choose a look</h3><p>Every option uses approved motion and safe areas.</p></div></div><div className="layout-toggle" role="group" aria-label="Graphic layout">{(["left", "bottom", "right"] as Layout[]).map((layout) => <button key={layout} className={form.layout === layout ? "active" : ""} onClick={() => { const template = templates.find((item) => item.layout === layout && item.importable); changeForm({ layout, templateCueId: template?.id || "" }); }}>{layoutLabel(layout)}</button>)}</div>{form.mode === "custom" ? <p className="automatic-style">The broadcast-safe house style is selected automatically for this layout.</p> : <div className="template-gallery">{templates.filter((item) => item.layout === form.layout && item.importable).slice(0, 6).map((item) => <button key={item.id} className={form.templateCueId === item.id ? "selected" : ""} onClick={() => changeForm({ templateCueId: item.id })}><span className={`template-thumb ${item.layout}`}><span /></span><span><strong>{item.name}</strong><small>{layoutLabel(item.layout)}</small></span>{form.templateCueId === item.id && <Check size={16} />}</button>)}</div>}<div className="density-row"><span>Text density</span><div>{densityOptions.map((option) => <button key={option.id} className={selectedDensity === option.id ? "active" : ""} onClick={() => changeForm({ presentation: { ...option.value } })}>{option.label}</button>)}</div></div></section>;
}

function PreviewColumn(props: { setViewport: (node: HTMLDivElement | null) => void; setOutput: (node: HTMLDivElement | null) => void; previewCue: Cue | null; exact: boolean; fitErrors: string[]; warnings: string[]; assetsReady: boolean; play: () => void; out: () => void; fullscreen: () => void; statusLabel?: string }) {
  // eslint-disable-next-line react-hooks/refs -- Callback refs expose the two DOM hosts required by the imperative Player renderer; no ref value is read during render.
  return <aside className="preview-column"><div className="preview-heading"><div><span className="eyebrow">ISOLATED PREVIEW</span><h3>Broadcast frame</h3></div><span>1920 × 1080</span></div><div ref={props.setViewport} className="preview-viewport"><div className="preview-stage-label">PREVIEW ONLY</div><button className="preview-fullscreen-close" aria-label="Close full-screen preview" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); }}>× <span>Close preview</span></button><div ref={props.setOutput} id="output" className="author-output" />{!props.previewCue && <div className="preview-placeholder"><Sparkles size={26} /><strong>Your graphic will appear here</strong><span>Add content, a title, and a visual template.</span></div>}</div><div className="preview-toolbar"><button onClick={props.play} disabled={!props.previewCue}><Play size={15} /> Play in</button><button onClick={props.out} disabled={!props.previewCue}><Square size={14} /> Play out</button><button onClick={props.fullscreen} disabled={!props.previewCue}><Maximize2 size={14} /> Full screen</button><span>{props.statusLabel || (props.exact ? "Exact saved preview" : props.previewCue ? "Working preview" : "Waiting for content")}</span></div><div className={`preview-readiness ${props.fitErrors.length ? "problem" : props.assetsReady ? "ready" : "waiting"}`}>{props.fitErrors.length ? <CircleAlert size={18} /> : props.assetsReady ? <Check size={18} /> : <Clock3 size={18} />}<div><strong>{props.fitErrors.length ? "Needs attention" : props.assetsReady ? "Fits this frame" : props.previewCue ? "Preparing preview" : "Waiting for content"}</strong>{props.fitErrors.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.warnings.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.assetsReady && <small>Fonts and artwork loaded. Review readability before publishing.</small>}</div></div><div className="preview-note"><span /> This preview cannot issue live commands. A graphic already on screen remains unchanged.</div></aside>;
}

function PublishDock(props: { dirty: boolean; draft: Draft | null; recoveryStoredAt: number | null; busy: string; ready: boolean; exactPreviewCurrent: boolean; save: () => void; review: () => void; publish: () => void }) {
  return <div className="publish-dock"><div className="save-state">{props.dirty ? <><CircleAlert size={18} /><span><strong>Unsaved changes</strong><small>{props.recoveryStoredAt ? `Recovery copy stored ${formatTime(props.recoveryStoredAt)}` : "A recovery copy will be stored in this browser."}</small></span></> : <><Check size={18} /><span><strong>{props.draft ? `Saved version ${props.draft.version}` : "Ready to save"}</strong><small>Published output has not changed.</small></span></>}</div><div className="publish-actions"><button onClick={props.save} disabled={!props.ready || !!props.busy || (!props.dirty && !!props.draft)}><Save size={17} /> {props.busy === "save" ? "Saving…" : props.draft ? "Save draft" : "Save new draft"}</button>{!props.exactPreviewCurrent ? <button className="review-button" onClick={props.review} disabled={!props.draft || props.dirty || !!props.busy}>{props.busy === "review" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Review saved version</button> : <button className="publish-button" onClick={props.publish} disabled={!!props.busy}>{props.busy === "publish" ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Publish this version</button>}</div></div>;
}

function HistoryDrawer({ revisions, activeRevision, close, activate }: { revisions: PublishedRevision[]; activeRevision: number | null; close: () => void; activate: (revision: number) => void }) {
  return <div className="history-drawer"><div className="history-header"><div><span className="eyebrow">REVISION HISTORY</span><h3>Published versions</h3></div><button className="icon-button" aria-label="Close history" onClick={close}>×</button></div>{revisions.map((item) => <div className="revision-row" key={item.revision}><span><strong>Revision {item.revision}</strong><small>Draft version {item.draftVersion} · {formatTime(item.createdAt)}</small></span>{activeRevision === item.revision ? <em>Current</em> : <button onClick={() => activate(item.revision)}>Use this version</button>}</div>)}{!revisions.length && <p className="empty">No published revisions yet.</p>}</div>;
}
