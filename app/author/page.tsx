"use client";

import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
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
  PencilLine,
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
import type { AccessRole } from "@/lib/access";
import type { PublicWorkspace } from "@/lib/workspace";
import WorkspaceNav from "@/components/workspace-nav";
import { overlayAssetUrl } from "@/lib/overlay-assets";
import { authoringCall } from "./api";
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
  moveDraftId,
  parseRecovery,
  recoveryKey,
  routeForDraft,
  selectWholeSource,
  type RecoveryCopy,
} from "./editor-state";
import { findFitErrors, waitForPreviewAssets } from "./preview";
import type {
  BrowserMeasurement,
  CanonicalContentMode,
  CatalogCue,
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
  VariantChannel,
} from "./types";
import "./author.css";

type LibraryTab = "published" | "drafts" | "archived" | "shared";
type EditorKind = "siddur" | "custom" | "edit";
type LibraryItem = { kind: "catalog"; cue: CatalogCue } | { kind: "draft"; draft: Draft };
type SharedCue = { id: string; name: string; title: string; layout: Layout; sourceIds: string[]; cueHash: string };
type SharedLibraryState = { available: boolean; cues: SharedCue[]; stale: boolean; refreshedAt: number | null; error: string | null };
type WorkspaceAsset = { id: string; name: string; altText: string; mimeType: string; bytes: number; width: number; height: number; version: number; archived: boolean; published: boolean; privatePreviewUrl: string; publicUrl?: string };
type DraftSetReview = { status: "complete" | "needs-review" | "unknown"; message: string; issues: Array<{ kind: "missing" | "duplicated" | "unknown" | "out-of-order"; selections: unknown[] }> };

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
  const [role, setRole] = useState<AccessRole | undefined>(undefined);
  const [keyInput, setKeyInput] = useState("");
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
      setSharedPreviewHash(null);
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
      history.replaceState(null, "", routeForDraft(next.id));
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
          setRole(body.user.role as AccessRole);
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
    if (animate) player.set({ cue: cue.id, revision: ++animationRevision.current, mode: "animate" });
    else player.render(cue, overlayAssetUrl(cue, "preview"));
    await waitForPreviewAssets(root);
    if (current !== previewSequence.current) return;
    if (!animate) {
      const box = root.firstElementChild;
      if (box instanceof HTMLElement) player.applyFit(box, cue);
    }
    setAssetsReady(true);
    setFitErrors(findFitErrors(root));
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
  const archivedItems = useMemo<LibraryItem[]>(() => {
    const seenSets = new Set<string>();
    return archivedDrafts.filter((item) => {
      if (!item.draftSetId) return true;
      if (seenSets.has(item.draftSetId)) return false;
      seenSets.add(item.draftSetId); return true;
    }).map((item) => ({ kind: "draft", draft: item }));
  }, [archivedDrafts]);
  const visibleLibrary = (libraryTab === "published" ? publishedItems : libraryTab === "archived" ? archivedItems : draftItems).filter((item) => itemName(item).toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));
  const visibleShared = sharedLibrary.cues.filter((item) => `${item.name} ${item.title}`.toLocaleLowerCase().includes(libraryQuery.trim().toLocaleLowerCase()));
  const selectedShared = visibleShared.find((item) => item.id === sharedSelectedId) || null;
  const eligibleBlocks = blocksForMode(source, form.mode);
  const selectedIds = new Set(form.groups[activeGroup]?.blockIds || []);
  const previewCue = formReady(form) ? exactPreview?.cue || workingPreview?.cue || null : null;
  const reviewCurrent = !!draft && !dirty && exactPreview?.draftVersion === draft.version;
  const exactPreviewCurrent = reviewCurrent && assetsReady && !fitErrors.length;
  const fitBlocked = reviewCurrent && fitErrors.length > 0;
  const selectedDensity = densityOptions.find((option) => JSON.stringify(option.value) === JSON.stringify({
    ...(form.presentation.hebrewFontSize !== undefined ? { hebrewFontSize: form.presentation.hebrewFontSize } : {}),
    ...(form.presentation.transliterationFontSize !== undefined ? { transliterationFontSize: form.presentation.transliterationFontSize } : {}),
    ...(form.presentation.titleFontSize !== undefined ? { titleFontSize: form.presentation.titleFontSize } : {}),
  }))?.id || "custom";
  const draftSet = draft?.draftSetId ? drafts.filter((item) => item.draftSetId === draft.draftSetId).sort((a, b) => (a.setIndex || 0) - (b.setIndex || 0)) : [];
  const draftSetPosition = draft ? draftSet.findIndex((item) => item.id === draft.id) : -1;

  async function connect() {
    setBusy("connect"); setError("");
    try {
      await refreshLists(keyInput);
      sessionStorage.setItem("crc-control-key", keyInput);
      setRole("owner");
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
    previewSequence.current += 1;
    playerRef.current?.dispose(); playerRef.current = null;
    outputRef.current?.replaceChildren();
    setWorkingPreview(null); resetReview(); resetHistory(); setRevisions([]); setShowHistory(false);
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
      history.replaceState(null, "", routeForDraft(response.draft.id));
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
    if (!confirm(`Archive ${subject}? ${setMembers.length ? "The prayer set" : "It"} will leave this editor library until restored. Any published Companion cue and the graphic already on screen remain unchanged.`)) return;
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
      history.replaceState(null, "", routeForDraft(response.draft.id));
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
        ? await authoringCall<{ draft: Draft }>(key, "update_draft", { draftId: draft.id, expectedVersion: draft.version, patch: editableFromForm(form) })
        : await authoringCall<{ draft: Draft }>(key, "create_draft", editableFromForm(form));
      if (!draft) localStorage.removeItem(recoveryKey(null));
      localStorage.removeItem(recoveryKey(response.draft.id));
      applyLoadedDraft(response.draft);
      setDrafts((items) => [response.draft, ...items.filter((item) => item.id !== response.draft.id)]);
      history.replaceState(null, "", routeForDraft(response.draft.id));
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
        <div className="header-actions"><span className="safety-note"><span /> Editing is isolated from live output</span><Link href="/author/fit-check">Fit check</Link><WorkspaceNav current="/author" className="author-workspace-nav" role={role} /></div>
      </header>
      {workspaceLabel && <div className="workspace-banner"><CircleAlert size={16} />{workspaceLabel}</div>}

      <div className="author-shell">
        <LibrarySidebar
          publishedItems={publishedItems} draftItems={draftItems} archivedItems={archivedItems} visibleLibrary={visibleLibrary}
          allDrafts={drafts}
          libraryTab={libraryTab} setLibraryTab={chooseLibraryTab} libraryQuery={libraryQuery} setLibraryQuery={setLibraryQuery}
          sharedEnabled={Boolean(workspace?.sharedLibrary.enabled)} sharedLabel={workspace?.sharedLibrary.label || "CRC library"}
          sharedItems={visibleShared} sharedTotal={sharedLibrary.cues.length} sharedSelectedId={sharedSelectedId} selectShared={(id) => { setSharedPreview(null); setSharedPreviewHash(null); setSharedSelectedId(id); }}
          activeDraftId={draft?.id || null} beginSiddur={beginSiddur} beginCustom={beginCustom}
          openItem={(item) => {
            if (item.kind === "draft") { if (canLeave()) void openDraft(key, item.draft.id); }
            else void openCatalogCue(item.cue);
          }}
          duplicateItem={(item) => void duplicateItem(item)}
          archiveItem={(item) => void archiveItem(item)} restoreItem={(item) => void restoreArchived(item)}
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
        /> : libraryTab === "archived" ? <ArchivedPanel drafts={archivedItems.flatMap((item) => item.kind === "draft" ? [item.draft] : [])} query={libraryQuery} busy={busy} restore={(item) => void restoreArchived(item)} /> : !editorKind ? <WelcomePanel beginSiddur={beginSiddur} beginCustom={beginCustom} /> : (
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
                    changeMode={(mode) => changeForm({ mode, groups: [], includeTranslation: false })}
                    changeForm={changeForm} busy={busy}
                  />
                ) : <CustomTextEditor form={form} changeForm={changeForm} />}

                <DetailsEditor form={form} changeForm={changeForm} />
                <AppearanceEditor form={form} templates={templates} selectedDensity={selectedDensity} changeForm={changeForm}
                  workspace={workspace} assets={assets} assetError={assetError} busy={busy} uploadAsset={uploadAsset}
                  setAssetArchived={(asset, archived) => void setAssetArchived(asset, archived)}
                  showArchivedAssets={showArchivedAssets} setShowArchivedAssets={setShowArchivedAssets} />
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
              ready={formReady(form)} exactPreviewCurrent={exactPreviewCurrent} fitBlocked={fitBlocked}
              save={() => void save()} review={() => void reviewSavedVersion()} publish={() => void publishReviewedVersion()}
            />
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

function AccessCard({ productName, style, keyInput, setKeyInput, connect, busy, error }: { productName: string; style?: CSSProperties; keyInput: string; setKeyInput: (value: string) => void; connect: () => void; busy: string; error: string }) {
  return <main className="author-page access-page" style={style}><div className="access-card"><div className="brand-mark"><BookOpenText size={22} /></div><span className="eyebrow">{productName}</span><h1>Open the editor</h1><p>Sign in to create and prepare graphics without changing what is live.</p><Link className="access-link" href="/access">Sign in</Link><div className="access-divider"><span>or use the existing admin key</span></div><form onSubmit={(event) => { event.preventDefault(); connect(); }}><label>Control key<input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} required /></label><button className="primary-button" disabled={busy === "connect"}>{busy === "connect" ? <><LoaderCircle className="spin" size={18} /> Opening…</> : "Open graphics library"}</button></form>{error && <p role="alert" className="inline-error">{error}</p>}</div></main>;
}

function LibrarySidebar(props: {
  publishedItems: LibraryItem[]; draftItems: LibraryItem[]; archivedItems: LibraryItem[]; visibleLibrary: LibraryItem[];
  allDrafts: Draft[];
  libraryTab: LibraryTab; setLibraryTab: (tab: LibraryTab) => void; libraryQuery: string; setLibraryQuery: (query: string) => void;
  sharedEnabled: boolean; sharedLabel: string; sharedItems: SharedCue[]; sharedTotal: number; sharedSelectedId: string | null; selectShared: (id: string) => void;
  activeDraftId: string | null; beginSiddur: () => void; beginCustom: () => void;
  openItem: (item: LibraryItem) => void; duplicateItem: (item: LibraryItem) => void; archiveItem: (item: LibraryItem) => void; restoreItem: (item: Draft) => void;
}) {
  const tabCount = 3 + (props.sharedEnabled ? 1 : 0);
  return <aside className="library-sidebar">
    <div className="create-stack"><button className="siddur-button" onClick={props.beginSiddur}><BookOpenText size={19} /><span><strong>Add from siddur</strong><small>Find a prayer or reading</small></span></button><button className="secondary-create" onClick={props.beginCustom}><FilePlus2 size={17} /> New custom graphic</button></div>
    <div className={`library-tabs tabs-${tabCount}`} role="tablist" aria-label="Graphics library">
      <button role="tab" aria-selected={props.libraryTab === "published"} className={props.libraryTab === "published" ? "active" : ""} onClick={() => props.setLibraryTab("published")}>Published <span>{props.publishedItems.length}</span></button>
      <button role="tab" aria-selected={props.libraryTab === "drafts"} className={props.libraryTab === "drafts" ? "active" : ""} onClick={() => props.setLibraryTab("drafts")}>Drafts <span>{props.draftItems.length}</span></button>
      <button role="tab" aria-selected={props.libraryTab === "archived"} className={props.libraryTab === "archived" ? "active" : ""} onClick={() => props.setLibraryTab("archived")}>Archived <span>{props.archivedItems.length}</span></button>
      {props.sharedEnabled && <button role="tab" aria-selected={props.libraryTab === "shared"} className={props.libraryTab === "shared" ? "active" : ""} onClick={() => props.setLibraryTab("shared")}>{props.sharedLabel} <span>{props.sharedTotal}</span></button>}
    </div>
    <label className="library-search"><Search size={16} /><input aria-label={`Search ${props.libraryTab}`} value={props.libraryQuery} onChange={(event) => props.setLibraryQuery(event.target.value)} placeholder={`Search ${props.libraryTab}`} /></label>
    <div className="library-list">
      {props.libraryTab === "shared" ? props.sharedItems.map((item) => <article key={item.id} className={`library-card shared-card ${props.sharedSelectedId === item.id ? "active" : ""}`}><button className="library-card-main" onClick={() => props.selectShared(item.id)}><GraphicThumbnail layout={item.layout} title={item.title} /><span><strong>{item.name}</strong><small>CRC published · {layoutLabel(item.layout)}</small></span></button></article>) : props.visibleLibrary.map((item) => {
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
      {!(props.libraryTab === "shared" ? props.sharedItems.length : props.visibleLibrary.length) && <div className="library-empty"><LibraryBig size={24} /><p>No matching {props.libraryTab === "shared" ? props.sharedLabel : props.libraryTab}.</p></div>}
    </div>
  </aside>;
}

function GraphicThumbnail({ layout, title, body = "", accent }: { layout: Layout; title: string; body?: string; accent?: string }) {
  return <span className={`mini-frame ${layout}`} aria-hidden="true"><span className="mini-graphic-content">{accent && <i>{accent}</i>}<b>{title}</b>{body && <small>{body}</small>}</span></span>;
}

function WelcomePanel({ beginSiddur, beginCustom }: { beginSiddur: () => void; beginCustom: () => void }) {
  return <section className="welcome-panel"><div className="welcome-art"><BookOpenText size={42} /></div><span className="eyebrow">READY WHEN YOU ARE</span><h2>Prepare a graphic without touching live output.</h2><p>Start with an authorized passage from the siddur library, or open a published graphic to edit or duplicate it.</p><div className="welcome-actions"><button className="primary-button" onClick={beginSiddur}><BookOpenText size={18} /> Add from siddur</button><button onClick={beginCustom}><FilePlus2 size={18} /> New custom graphic</button></div></section>;
}

function ArchivedPanel({ drafts, query, busy, restore }: { drafts: Draft[]; query: string; busy: string; restore: (draft: Draft) => void }) {
  const visible = drafts.filter((draft) => draft.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="archived-panel"><header><div><span className="eyebrow">RECOVERABLE LIBRARY</span><h2>Archived graphics</h2><p>Archived drafts stay here until restored. Published Companion cues and live output are unchanged.</p></div><span>{drafts.length} archived</span></header>{visible.length ? <div className="archived-grid">{visible.map((draft) => <article key={draft.id}><GraphicThumbnail layout={draft.layout} {...draftThumbnailCopy(draft)} /><div><strong>{draft.draftSetId ? draft.title : draft.name}</strong><small>{draft.draftSetId ? `${draft.setCount || "Multiple"} slides · ` : ""}Archived {formatTime(draft.archivedAt)}</small><p>{draft.draftSetId ? "Whole prayer set" : draft.title}</p></div><button onClick={() => restore(draft)} disabled={busy === "restore"}><ArchiveRestore size={16} /> Restore {draft.draftSetId ? "set" : "to library"}</button></article>)}</div> : <div className="shared-empty"><Archive size={28} /><h3>{query ? "No archived graphics match this search." : "Nothing is archived."}</h3><p>{query ? "Clear the search to see all archived graphics." : "Graphics you archive can be recovered here."}</p></div>}</section>;
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

function EditorTitle(props: { form: DraftForm; draft: Draft | null; dirty: boolean; busy: string; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; duplicate: () => void; archive: () => void; createVariant: () => void; history: () => void; setPosition: number; setCount: number; previousSlide: () => void; nextSlide: () => void }) {
  return <div className="editor-titlebar"><div><div className="editor-status-line"><span className={`status-chip ${props.draft?.activeRevision ? "published" : "draft"}`}>{props.draft?.activeRevision ? "Published" : "Draft"}</span>{props.dirty ? <span className="unsaved-dot">Unsaved changes</span> : props.draft ? <span>Saved version {props.draft.version}</span> : <span>New graphic</span>}{props.form.mode === "local-variant" && <span className="variant-chip">Local variant</span>}{props.setCount > 1 && <span className="set-position">Slide {props.setPosition + 1} of {props.setCount}</span>}</div><h2>{props.form.name || (props.form.mode === "custom" ? "New custom graphic" : "Add from siddur")}</h2><p>{props.draft?.activeRevision ? "The published version stays available while you work." : "Publish makes this version available to the operator."}</p></div><div className="editor-tools">{props.setCount > 1 && <><button onClick={props.previousSlide} disabled={props.setPosition <= 0 || !!props.busy}><ChevronLeft size={16} /> Previous</button><button onClick={props.nextSlide} disabled={props.setPosition >= props.setCount - 1 || !!props.busy}>Next <ChevronRight size={16} /></button></>}<button className="icon-button" onClick={props.undo} disabled={!props.canUndo} title="Undo"><Undo2 size={17} /></button><button className="icon-button" onClick={props.redo} disabled={!props.canRedo} title="Redo"><Redo2 size={17} /></button>{props.draft && props.setCount <= 1 && <button onClick={props.duplicate} disabled={props.busy === "duplicate"}><Copy size={16} /> Duplicate</button>}{props.draft && props.draft.content.mode !== "custom" && props.draft.content.mode !== "local-variant" && <button onClick={props.createVariant} disabled={!!props.busy || props.dirty}><PencilLine size={16} /> Local wording</button>}{props.draft && props.setCount <= 1 && <button onClick={props.archive} disabled={!!props.busy || props.dirty}><Archive size={16} /> Archive</button>}{props.draft && <button onClick={props.history}><History size={16} /> History</button>}</div></div>;
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

type SiddurEditorProps = {
  query: string; setQuery: (value: string) => void; results: SourceSummary[]; source: Source | null; form: DraftForm;
  truncated: boolean;
  books: SourceFacet[]; services: SourceFacet[]; bookFilter: string; serviceFilter: string;
  setBookFilter: (value: string) => void; setServiceFilter: (value: string) => void; search: () => void;
  selectSource: (item: SourceSummary) => void; clearSource: () => void; eligibleBlocks: Source["blocks"];
  selectedIds: Set<string>; activeGroup: number; setActiveGroup: (index: number) => void;
  chooseWholePrayer: () => void; toggleBlock: (id: string, checked: boolean) => void; addPanel: () => void; removePanel: () => void;
  makeSlidesFromWholePrayer: () => void;
  changeMode: (mode: CanonicalContentMode) => void; changeForm: (patch: Partial<DraftForm>) => void; busy: string;
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
      <SourceProvenance source={props.source} />
      <div className="content-mode-toggle">{props.source.blocks.some((block) => block.kind === "bilingual") && <button className={props.form.mode === "bilingual" ? "active" : ""} onClick={() => props.changeMode("bilingual")}>Hebrew + transliteration</button>}{blocksForMode(props.source, "source-en").length > 0 && <button className={props.form.mode === "source-en" ? "active" : ""} onClick={() => props.changeMode("source-en")}>English from siddur</button>}{props.source.blocks.some((block) => block.kind === "original-en") && <button className={props.form.mode === "original-en" ? "active" : ""} onClick={() => props.changeMode("original-en")}>Original English reading</button>}</div>
      {props.source.blocks.some((block) => block.kind === "translation-en") && props.form.mode === "bilingual" && <label className="translation-choice"><input type="checkbox" checked={!!props.form.includeTranslation} onChange={(event) => props.changeForm({ includeTranslation: event.target.checked })} /> Include approved English where available</label>}
      {omittedFromAutomatic > 0 && <p className="source-mode-note">{omittedFromAutomatic} service {omittedFromAutomatic === 1 ? "note is" : "notes are"} available for manual selection below. Automatic slides use the prayer and reading text.</p>}
      <div className="panel-tabs">{props.form.groups.map((group, index) => <button key={`${group.sourceId}-${index}`} className={props.activeGroup === index ? "active" : ""} onClick={() => props.setActiveGroup(index)}>Section {index + 1}<small>{group.blockIds.length} passages</small></button>)}<button onClick={props.addPanel}>+ Add section</button></div>
      <div className="passage-list">{props.eligibleBlocks.map((block) => <label key={block.id} className={props.selectedIds.has(block.id) ? "selected" : ""}><input type="checkbox" checked={props.selectedIds.has(block.id)} onChange={(event) => props.toggleBlock(block.id, event.target.checked)} /><span className="passage-number">{block.index + 1}</span><span>{props.form.mode === "bilingual" ? <><b lang="he" dir="rtl">{block.he}</b><small>{block.tr}</small></> : <><b>{block.en}</b>{props.form.mode === "source-en" && <small className="passage-meta">{englishRoleLabel[block.englishRole || "unclassified"]}{block.automatic === false ? " · manual selection" : ""}</small>}</>}</span></label>)}</div>
      {props.form.groups.length > 1 && <button className="remove-panel" onClick={props.removePanel}>Remove section {props.activeGroup + 1}</button>}
    </div>}
  </section>;
}

function SourceProvenance({ source }: { source: Source }) {
  const edition = source.metadata?.bookTitle || source.bookLabel || source.service || source.book || "Maintained siddur source";
  const section = source.metadata?.sectionTitle || source.section;
  const revision = source.authority?.repositoryCommit?.slice(0, 10) || source.unitSha256?.slice(0, 10);
  return <details className="source-provenance"><summary><BookOpenText size={15} /><span><strong>{edition}</strong><small>Exact source text · view edition details</small></span></summary><dl><div><dt>Prayer or reading</dt><dd>{source.name}</dd></div>{section !== undefined && section !== null && <div><dt>Section</dt><dd>{String(section)}</dd></div>}{source.metadata?.familyLabel && <div><dt>Collection</dt><dd>{source.metadata.familyLabel}</dd></div>}{source.metadata?.folios?.length && <div><dt>Pages</dt><dd>{source.metadata.folios.join(", ")}</dd></div>}{revision && <div><dt>Source revision</dt><dd>{revision}</dd></div>}</dl><p>The selected words are copied exactly from this maintained source. Local changes require an explicitly labeled variant.</p></details>;
}

const channelLabel: Record<VariantChannel, string> = { he: "Hebrew", tr: "Transliteration", en: "English" };

function VariantEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <section className="form-section variant-editor"><div className="section-heading"><span>1</span><div><h3>Local wording</h3><p>This independent copy records every change beside the exact source wording.</p></div></div>
    <div className="variant-identity"><PencilLine size={17} /><span><strong>{form.variantLabel}</strong><small>{form.variantReason || "Congregation-specific wording"}</small></span></div>
    <div className="variant-lines">{form.variantOverrides.map((item, index) => <article key={variantKey(item)}><header><span>{channelLabel[item.channel]}</span><small>Source line {index + 1}</small></header><div className="variant-comparison"><div><span>Exact source</span><p lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined}>{item.sourceText}</p></div><label>Local wording<textarea lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined} value={item.localText} maxLength={4000} onChange={(event) => changeForm({ variantOverrides: form.variantOverrides.map((entry, offset) => offset === index ? { ...entry, localText: event.target.value } : entry) })} /></label></div></article>)}</div>
    <div className="variant-provenance"><BookOpenText size={17} /><span><strong>Source remains attached</strong><small>Publishing uses the local wording above and keeps the exact source text in its history.</small></span></div>
  </section>;
}

function VariantCreator(props: { draft: Draft; label: string; reason: string; values: Record<string, string>; busy: string; setLabel: (value: string) => void; setReason: (value: string) => void; setValue: (candidate: VariantCandidate, value: string) => void; close: () => void; create: () => void }) {
  const candidates = variantCandidates(props.draft);
  const changed = candidates.filter((item) => (props.values[variantKey(item)] || "").trim() !== item.sourceText).length;
  return <div className="variant-backdrop" role="dialog" aria-modal="true" aria-labelledby="variant-title"><section className="variant-dialog"><header><div><span className="eyebrow">EXPLICIT LOCAL COPY</span><h3 id="variant-title">Create local wording</h3><p>The original source graphic and its exact words remain unchanged.</p></div><button className="icon-button" aria-label="Close local wording editor" onClick={props.close}>×</button></header><div className="variant-dialog-body"><div className="variant-fields"><label>Variant label<input value={props.label} maxLength={80} onChange={(event) => props.setLabel(event.target.value)} placeholder="Example: Our congregation’s responsive reading" /></label><label>Reason <span>optional</span><input value={props.reason} maxLength={500} onChange={(event) => props.setReason(event.target.value)} placeholder="Why this wording is used locally" /></label></div><div className="variant-source-note"><BookOpenText size={17} /><span><strong>{props.draft.name}</strong><small>Each editable line below starts as the exact pinned source text.</small></span></div><div className="variant-candidates">{candidates.map((item) => { const value = props.values[variantKey(item)] ?? item.sourceText; const isChanged = value.trim() !== item.sourceText; return <article key={variantKey(item)} className={isChanged ? "changed" : ""}><header><span>{item.sourceName} · passage {item.blockNumber}</span><em>{channelLabel[item.channel]}</em></header><label><span className="sr-only">Local {channelLabel[item.channel]} wording for passage {item.blockNumber}</span><textarea lang={item.channel === "he" ? "he" : undefined} dir={item.channel === "he" ? "rtl" : undefined} value={value} maxLength={4000} onChange={(event) => props.setValue(item, event.target.value)} /></label><footer>{isChanged ? <span><PencilLine size={13} /> Local change</span> : <span>Matches source</span>}<button className="text-button" disabled={!isChanged} onClick={() => props.setValue(item, item.sourceText)}>Reset to source</button></footer></article>; })}</div></div><footer><span>{changed ? `${changed} changed ${changed === 1 ? "line" : "lines"}` : "Change at least one line to continue."}</span><div><button onClick={props.close}>Cancel</button><button className="primary-button" onClick={props.create} disabled={!changed || !props.label.trim() || props.busy === "create-variant"}>{props.busy === "create-variant" ? <LoaderCircle className="spin" size={17} /> : <PencilLine size={17} />} Create independent variant</button></div></footer></section></div>;
}

function CustomTextEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <section className="form-section custom-section"><div className="section-heading"><span>1</span><div><h3>Write the graphic</h3><p>For announcements, welcome messages, names, and community-specific readings.</p></div></div><label>Custom text <span>{form.customText.length} / 4000</span><textarea value={form.customText} maxLength={4000} onChange={(event) => changeForm({ customText: event.target.value })} placeholder="Type the words that should appear on screen…" /></label><div className="provenance-note"><Sparkles size={17} /><span><strong>Custom congregation text</strong><small>This text is separate from the authorized siddur library.</small></span></div></section>;
}

function DetailsEditor({ form, changeForm }: { form: DraftForm; changeForm: (patch: Partial<DraftForm>) => void }) {
  return <section className="form-section details-section"><div className="section-heading"><span>2</span><div><h3>Name and title</h3><p>Names help the operator find the right graphic.</p></div></div><label>Library name<input value={form.name} maxLength={80} onChange={(event) => changeForm({ name: event.target.value })} placeholder="Example: Welcome to Shabbat" /></label><div className="field-pair"><label>On-screen title<input value={form.title} maxLength={100} onChange={(event) => changeForm({ title: event.target.value })} /></label><label>Hebrew accent <span>optional</span><input dir="rtl" value={form.accentTitle} maxLength={60} onChange={(event) => changeForm({ accentTitle: event.target.value })} /></label></div></section>;
}

function AppearanceEditor({ form, templates, selectedDensity, changeForm, workspace, assets, assetError, busy, uploadAsset, setAssetArchived, showArchivedAssets, setShowArchivedAssets }: { form: DraftForm; templates: TemplateSummary[]; selectedDensity: string; changeForm: (patch: Partial<DraftForm>) => void; workspace: PublicWorkspace | null; assets: WorkspaceAsset[]; assetError: string; busy: string; uploadAsset: (file: File, name: string, altText: string) => Promise<WorkspaceAsset>; setAssetArchived: (asset: WorkspaceAsset, archived: boolean) => void; showArchivedAssets: boolean; setShowArchivedAssets: (value: boolean) => void }) {
  const setPresentation = (patch: Partial<DraftForm["presentation"]>) => changeForm({ presentation: { ...form.presentation, ...patch } });
  const clearField = (field: keyof DraftForm["presentation"]) => { const next = { ...form.presentation }; delete next[field]; changeForm({ presentation: next }); };
  return <section className="form-section appearance-section"><div className="section-heading"><span>3</span><div><h3>Choose a look</h3><p>Every option uses approved motion and safe areas.</p></div></div><div className="layout-toggle" role="group" aria-label="Graphic layout">{(["left", "bottom", "right"] as Layout[]).map((layout) => <button key={layout} className={form.layout === layout ? "active" : ""} onClick={() => { const template = templates.find((item) => item.layout === layout && item.importable); changeForm({ layout, templateCueId: template?.id || "" }); }}>{layoutLabel(layout)}</button>)}</div>{form.mode === "custom" ? <p className="automatic-style">The broadcast-safe house style is selected automatically for this layout.</p> : <div className="template-gallery">{templates.filter((item) => item.layout === form.layout && item.importable).slice(0, 6).map((item) => <button key={item.id} className={form.templateCueId === item.id ? "selected" : ""} onClick={() => changeForm({ templateCueId: item.id })}><span className={`template-thumb ${item.layout}`}><span><i>כותרת</i><b>{form.title || "Prayer title"}</b><small>{form.mode === "bilingual" ? "Hebrew · Transliteration" : "English reading"}</small></span></span><span><strong>{item.name}</strong><small>{layoutLabel(item.layout)}</small></span>{form.templateCueId === item.id && <Check size={16} />}</button>)}</div>}
    <div className="appearance-controls"><fieldset><legend>Text density</legend><div>{densityOptions.map((option) => <button key={option.id} type="button" aria-pressed={selectedDensity === option.id} className={selectedDensity === option.id ? "active" : ""} onClick={() => changeForm({ presentation: { ...form.presentation, ...option.value, ...(option.id === "comfortable" ? { hebrewFontSize: undefined, transliterationFontSize: undefined, titleFontSize: undefined } : {}) } })}>{option.label}</button>)}</div></fieldset><fieldset><legend>Alignment</legend><div><button type="button" aria-pressed={!form.presentation.alignment} className={!form.presentation.alignment ? "active" : ""} onClick={() => clearField("alignment")}>Template default</button><button type="button" aria-pressed={form.presentation.alignment === "start"} className={form.presentation.alignment === "start" ? "active" : ""} onClick={() => setPresentation({ alignment: "start" })}>Logical start</button><button type="button" aria-pressed={form.presentation.alignment === "center"} className={form.presentation.alignment === "center" ? "active" : ""} onClick={() => setPresentation({ alignment: "center" })}>Centered</button></div><p className="control-note">Logical start keeps Hebrew reading from the right and Latin text from the left.</p></fieldset><fieldset><legend>Line spacing</legend><div><button type="button" aria-pressed={!form.presentation.lineSpacing} className={!form.presentation.lineSpacing ? "active" : ""} onClick={() => clearField("lineSpacing")}>Template default</button><button type="button" aria-pressed={form.presentation.lineSpacing === "compact"} className={form.presentation.lineSpacing === "compact" ? "active" : ""} onClick={() => setPresentation({ lineSpacing: "compact" })}>Compact</button><button type="button" aria-pressed={form.presentation.lineSpacing === "spacious"} className={form.presentation.lineSpacing === "spacious" ? "active" : ""} onClick={() => setPresentation({ lineSpacing: "spacious" })}>Spacious</button></div></fieldset></div>
    <ArtworkPicker workspace={workspace} assets={assets} selectedId={form.presentation.imageAssetId} error={assetError} busy={busy} select={(id) => id ? setPresentation({ imageAssetId: id }) : clearField("imageAssetId")} uploadAsset={uploadAsset} setAssetArchived={setAssetArchived} showArchived={showArchivedAssets} setShowArchived={setShowArchivedAssets} />
    <button className="reset-appearance" onClick={() => changeForm({ presentation: {} })}><RotateCcw size={15} /> Reset visual settings to template</button>
  </section>;
}

function ArtworkPicker({ workspace, assets, selectedId, error, busy, select, uploadAsset, setAssetArchived, showArchived, setShowArchived }: { workspace: PublicWorkspace | null; assets: WorkspaceAsset[]; selectedId?: string; error: string; busy: string; select: (id?: string) => void; uploadAsset: (file: File, name: string, altText: string) => Promise<WorkspaceAsset>; setAssetArchived: (asset: WorkspaceAsset, archived: boolean) => void; showArchived: boolean; setShowArchived: (value: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null), [name, setName] = useState(""), [altText, setAltText] = useState(""), [uploadError, setUploadError] = useState("");
  // eslint-disable-next-line @next/next/no-img-element -- Asset thumbnails use authenticated, no-store URLs and must not pass through Next's public image optimizer.
  return <div className="artwork-picker"><div className="artwork-heading"><span><strong>Upper-right artwork</strong><small>Replaces the congregation logo only. Images stay inside the approved region.</small></span><button type="button" className="artwork-archived-toggle" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Hide archived" : "Show archived"}</button></div><div className="artwork-grid"><button className={!selectedId ? "selected" : ""} onClick={() => select()}>{workspace?.logo.src ? <img src={workspace.logo.src} alt="" /> : <span className="artwork-placeholder" />}<span><strong>Congregation logo</strong><small>Template default</small></span>{!selectedId && <Check size={15} />}</button>{assets.map((asset) => <div key={asset.id} className={`artwork-tile${selectedId === asset.id ? " selected" : ""}${asset.archived ? " archived" : ""}`}><button className="artwork-choice" onClick={() => select(asset.id)} disabled={asset.archived}><img src={asset.privatePreviewUrl} alt="" /><span><strong>{asset.name}</strong><small>{asset.archived ? "Archived · " : ""}{asset.width} × {asset.height} · {Math.ceil(asset.bytes / 1024)} KB</small></span>{selectedId === asset.id && <Check size={15} />}</button><button className="icon-button artwork-action" aria-label={`${asset.archived ? "Restore" : "Archive"} ${asset.name}`} title={asset.archived ? "Restore" : "Archive"} disabled={busy === "archive-asset" || busy === "restore-asset"} onClick={() => setAssetArchived(asset, !asset.archived)}>{asset.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button></div>)}</div>{error && <p className="asset-error">{error}</p>}<details className="asset-upload"><summary>Upload approved artwork</summary><p>PNG, JPEG, or WebP · up to 512 KB and 4096 pixels. Still images only.</p><div className="asset-upload-fields"><label>Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const next = event.target.files?.[0] || null; setFile(next); if (next && !name) setName(next.name.replace(/\.[^.]+$/, "")); }} /></label><label>Name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><label>Accessible description<input value={altText} maxLength={180} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the image itself" /></label><button className="primary-button" disabled={!file || !name.trim() || !altText.trim() || busy === "upload-asset"} onClick={() => { if (!file) return; setUploadError(""); void uploadAsset(file, name, altText).then(() => { setFile(null); setName(""); setAltText(""); }).catch((value) => setUploadError(value instanceof Error ? value.message : "Artwork upload failed.")); }}>{busy === "upload-asset" ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />} Upload and select</button></div>{uploadError && <p className="asset-error">{uploadError}</p>}</details></div>;
}

function PreviewColumn(props: { setViewport: (node: HTMLDivElement | null) => void; setOutput: (node: HTMLDivElement | null) => void; previewCue: Cue | null; exact: boolean; fitErrors: string[]; warnings: string[]; assetsReady: boolean; play: () => void; out: () => void; fullscreen: () => void; statusLabel?: string }) {
  // eslint-disable-next-line react-hooks/refs -- Callback refs expose the two DOM hosts required by the imperative Player renderer; no ref value is read during render.
  return <aside className="preview-column"><div className="preview-heading"><div><span className="eyebrow">ISOLATED PREVIEW</span><h3>Broadcast frame</h3></div><span>1920 × 1080</span></div><div ref={props.setViewport} className="preview-viewport"><div className="preview-stage-label">PREVIEW ONLY</div><button className="preview-fullscreen-close" aria-label="Close full-screen preview" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); }}>× <span>Close preview</span></button><div ref={props.setOutput} id="output" className="author-output" />{!props.previewCue && <div className="preview-placeholder"><Sparkles size={26} /><strong>Your graphic will appear here</strong><span>Add content, a title, and a visual template.</span></div>}</div><div className="preview-toolbar"><button onClick={props.play} disabled={!props.previewCue}><Play size={15} /> Play in</button><button onClick={props.out} disabled={!props.previewCue}><Square size={14} /> Play out</button><button onClick={props.fullscreen} disabled={!props.previewCue}><Maximize2 size={14} /> Full screen</button><span>{props.statusLabel || (props.exact ? "Exact saved preview" : props.previewCue ? "Working preview" : "Waiting for content")}</span></div><div className={`preview-readiness ${props.fitErrors.length ? "problem" : props.assetsReady ? "ready" : "waiting"}`}>{props.fitErrors.length ? <CircleAlert size={18} /> : props.assetsReady ? <Check size={18} /> : <Clock3 size={18} />}<div><strong>{props.fitErrors.length ? "Needs attention" : props.assetsReady ? "Fits this frame" : props.previewCue ? "Preparing preview" : "Waiting for content"}</strong>{props.fitErrors.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.warnings.map((item) => <small key={item}>{item}</small>)}{!props.fitErrors.length && props.assetsReady && <small>Fonts and artwork loaded. Review readability before publishing.</small>}</div></div><div className="preview-note"><span /> This preview cannot issue live commands. A graphic already on screen remains unchanged.</div></aside>;
}

function PublishDock(props: { dirty: boolean; draft: Draft | null; recoveryStoredAt: number | null; busy: string; ready: boolean; exactPreviewCurrent: boolean; fitBlocked: boolean; save: () => void; review: () => void; publish: () => void }) {
  return <div className="publish-dock"><div className="save-state">{props.dirty ? <><CircleAlert size={18} /><span><strong>Unsaved changes</strong><small>{props.recoveryStoredAt ? `Recovery copy stored ${formatTime(props.recoveryStoredAt)}` : "A recovery copy will be stored in this browser."}</small></span></> : <><Check size={18} /><span><strong>{props.draft ? `Saved version ${props.draft.version}` : "Ready to save"}</strong><small>Published output has not changed.</small></span></>}</div><div className="publish-actions"><button onClick={props.save} disabled={!props.ready || !!props.busy || (!props.dirty && !!props.draft)}><Save size={17} /> {props.busy === "save" ? "Saving…" : props.draft ? "Save draft" : "Save new draft"}</button>{props.exactPreviewCurrent ? <button className="publish-button" onClick={props.publish} disabled={!!props.busy}>{props.busy === "publish" ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Publish this version</button> : props.fitBlocked ? <div className="publish-blocked"><button className="review-button" disabled><CircleAlert size={17} /> Fix fit issues to publish</button><small>Publication is blocked while the preview reports fit problems.</small></div> : <button className="review-button" onClick={props.review} disabled={!props.draft || props.dirty || !!props.busy}>{props.busy === "review" ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Review saved version</button>}</div></div>;
}

function HistoryDrawer({ revisions, activeRevision, close, activate }: { revisions: PublishedRevision[]; activeRevision: number | null; close: () => void; activate: (revision: number) => void }) {
  return <div className="history-drawer"><div className="history-header"><div><span className="eyebrow">REVISION HISTORY</span><h3>Published versions</h3></div><button className="icon-button" aria-label="Close history" onClick={close}>×</button></div>{revisions.map((item) => <div className="revision-row" key={item.revision}><span><strong>Revision {item.revision}</strong><small>Draft version {item.draftVersion} · {formatTime(item.createdAt)}</small></span>{activeRevision === item.revision ? <em>Current</em> : <button onClick={() => activate(item.revision)}>Use this version</button>}</div>)}{!revisions.length && <p className="empty">No published revisions yet.</p>}</div>;
}
