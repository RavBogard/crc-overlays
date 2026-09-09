"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Player } from "@/lib/player";
import { authoringCall } from "./api";
import { findFitErrors, waitForPreviewAssets } from "./preview";
import type {
  BrowserMeasurement,
  Draft,
  DraftForm,
  Layout,
  PreviewResult,
  PublishedRevision,
  ReviewReceipt,
  Source,
  SourceSummary,
  TemplateSummary,
} from "./types";
import "./author.css";

const PAGE_SIZE = 12;
const emptyForm: DraftForm = {
  name: "",
  title: "",
  accentTitle: "",
  layout: "bottom",
  templateCueId: "",
  mode: "bilingual",
  groups: [],
  presentation: {},
};

function formFromDraft(draft: Draft): DraftForm {
  const groups =
    draft.content.mode === "bilingual"
      ? draft.content.hebrewGroups
      : draft.content.englishGroups;
  return {
    name: draft.name,
    title: draft.title,
    accentTitle: draft.accentTitle || "",
    layout: draft.layout,
    templateCueId: draft.templateCueId,
    mode: draft.content.mode,
    includeTranslation: draft.content.mode === "bilingual" && draft.content.includeTranslation,
    groups: structuredClone(groups),
    presentation: { ...draft.presentation },
  };
}

function editable(form: DraftForm) {
  const groups = form.groups.filter((group) => group.blockIds.length);
  const content =
    form.mode === "bilingual"
      ? {
          mode: "bilingual" as const,
          hebrewGroups: groups,
          transliterationGroups: structuredClone(groups),
          ...(form.includeTranslation ? { includeTranslation: true } : {}),
        }
      : { mode: "original-en" as const, englishGroups: groups };
  return {
    name: form.name,
    title: form.title,
    accentTitle: form.accentTitle || undefined,
    layout: form.layout,
    templateCueId: form.templateCueId,
    content,
    presentation: form.presentation,
  };
}

const formatTime = (value?: number) =>
  value ? new Date(value).toLocaleString() : "";

export default function AuthorPage() {
  const [key, setKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [form, setForm] = useState<DraftForm>(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceSummary[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [activeGroup, setActiveGroup] = useState(0);
  const [sourcePage, setSourcePage] = useState(0);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [fitErrors, setFitErrors] = useState<string[]>([]);
  const [assetsReady, setAssetsReady] = useState(false);
  const [review, setReview] = useState<ReviewReceipt | null>(null);
  const [revisions, setRevisions] = useState<PublishedRevision[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  const fail = useCallback((value: unknown) => {
    setError(value instanceof Error ? value.message : "Something went wrong.");
    setMessage("");
  }, []);
  const clearApproval = useCallback(() => {
    setPreview(null);
    setFitErrors([]);
    setAssetsReady(false);
    setReview(null);
  }, []);
  const changeForm = useCallback(
    (patch: Partial<DraftForm>) => {
      setForm((current) => ({ ...current, ...patch }));
      setDirty(true);
      clearApproval();
    },
    [clearApproval],
  );

  const refreshLists = useCallback(async (controlKey: string) => {
    const [draftResponse, templateResponse] = await Promise.all([
      authoringCall<{ drafts: Draft[] }>(controlKey, "list_drafts"),
      authoringCall<{ templates: TemplateSummary[] }>(
        controlKey,
        "list_templates",
      ),
    ]);
    setDrafts(draftResponse.drafts || []);
    setTemplates(templateResponse.templates || []);
  }, []);

  const loadSource = useCallback(
    async (controlKey: string, sourceId: string) => {
      const response = await authoringCall<{ source: Source }>(
        controlKey,
        "get_source",
        { sourceId },
      );
      setSource(response.source);
      setSourcePage(0);
    },
    [],
  );

  const openDraft = useCallback(
    async (controlKey: string, draftId: string) => {
      setBusy("load");
      setError("");
      try {
        const response = await authoringCall<{ draft: Draft }>(
          controlKey,
          "get_draft",
          { draftId },
        );
        const next = response.draft;
        setDraft(next);
        setForm(formFromDraft(next));
        setDirty(false);
        setActiveGroup(0);
        clearApproval();
        setRevisions([]);
        const first =
          next.content.mode === "bilingual"
            ? next.content.hebrewGroups[0]
            : next.content.englishGroups[0];
        if (first) await loadSource(controlKey, first.sourceId);
        history.replaceState(
          null,
          "",
          `/author?draft=${encodeURIComponent(next.id)}`,
        );
        setMessage(`Loaded “${next.name}” version ${next.version}.`);
      } catch (value) {
        fail(value);
      } finally {
        setBusy("");
      }
    },
    [clearApproval, fail, loadSource],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem("crc-control-key") || "";
    if (!saved) return;
    const timer = setTimeout(() => {
      void refreshLists(saved)
        .then(() => {
          setKey(saved);
          const id = new URLSearchParams(location.search).get("draft");
          if (id) return openDraft(saved, id);
        })
        .catch(fail);
    }, 0);
    return () => clearTimeout(timer);
  }, [fail, openDraft, refreshLists]);

  useEffect(() => {
    const viewport = viewportRef.current,
      output = outputRef.current;
    if (!viewport || !output) return;
    const resize = () => {
      output.style.transform = `scale(${viewport.clientWidth / 1920})`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [preview]);
  useEffect(() => () => playerRef.current?.dispose(), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const eligibleBlocks = useMemo(
    () => source?.blocks.filter((block) => block.kind === form.mode) || [],
    [form.mode, source],
  );
  const pageCount = Math.max(1, Math.ceil(eligibleBlocks.length / PAGE_SIZE));
  const visibleBlocks = useMemo(
    () =>
      eligibleBlocks.slice(
        sourcePage * PAGE_SIZE,
        (sourcePage + 1) * PAGE_SIZE,
      ),
    [eligibleBlocks, sourcePage],
  );
  const selectedIds = new Set(form.groups[activeGroup]?.blockIds || []);
  const previewIsCurrent =
    !!draft && !dirty && preview?.draftVersion === draft.version;
  const reviewIsCurrent =
    previewIsCurrent &&
    review?.draftId === draft.id &&
    review.draftVersion === draft.version &&
    review.previewId === preview.previewId;

  async function connect() {
    setBusy("connect");
    setError("");
    try {
      await refreshLists(keyInput);
      sessionStorage.setItem("crc-control-key", keyInput);
      setKey(keyInput);
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  async function search() {
    if (!query.trim()) {
      setError("Enter a prayer name or section to search.");
      return;
    }
    setBusy("search");
    setError("");
    try {
      const response = await authoringCall<{ sources: SourceSummary[] }>(
        key,
        "search_sources",
        { query: query.trim(), limit: 40 },
      );
      setResults(response.sources || []);
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  async function selectSource(sourceId: string) {
    setBusy("source");
    setError("");
    try {
      await loadSource(key, sourceId);
      if (!form.groups.length)
        changeForm({ groups: [{ sourceId, blockIds: [] }] });
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  function toggleBlock(blockId: string, checked: boolean) {
    if (!source) return;
    const groups = structuredClone(form.groups);
    const group = groups[activeGroup] || { sourceId: source.id, blockIds: [] };
    if (group.sourceId !== source.id) {
      setError(
        "This group belongs to another source. Add a group for the open source.",
      );
      return;
    }
    const order = new Map(
      source.blocks.map((block, index) => [block.id, index]),
    );
    group.blockIds = (
      checked
        ? [...group.blockIds, blockId]
        : group.blockIds.filter((id) => id !== blockId)
    ).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    groups[activeGroup] = group;
    changeForm({ groups });
  }

  function addGroup() {
    if (source) {
      const groups = [...form.groups, { sourceId: source.id, blockIds: [] }];
      changeForm({ groups });
      setActiveGroup(groups.length - 1);
    }
  }
  function removeGroup() {
    const groups = form.groups.filter((_, index) => index !== activeGroup);
    changeForm({ groups });
    setActiveGroup(Math.max(0, Math.min(activeGroup, groups.length - 1)));
  }
  function changeMode(mode: DraftForm["mode"]) {
    changeForm({ mode, groups: [], includeTranslation: false });
    setActiveGroup(0);
    setSourcePage(0);
  }

  async function importCue(cueId: string) {
    setBusy("import");
    setError("");
    try {
      const response = await authoringCall<{ draft: Draft; created: boolean }>(
        key,
        "import_cue",
        { cueId },
      );
      const next = response.draft;
      setDraft(next);
      setForm(formFromDraft(next));
      setDirty(false);
      clearApproval();
      setDrafts((current) => [
        next,
        ...current.filter((item) => item.id !== next.id),
      ]);
      const first =
        next.content.mode === "bilingual"
          ? next.content.hebrewGroups[0]
          : next.content.englishGroups[0];
      if (first) await loadSource(key, first.sourceId);
      history.replaceState(
        null,
        "",
        `/author?draft=${encodeURIComponent(next.id)}`,
      );
      setMessage(
        `${response.created ? "Imported" : "Opened"} “${next.name}” with its existing cue ID.`,
      );
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    setError("");
    const current = draft;
    if (current)
      setDraft({
        ...current,
        ...editable(form),
        version: current.version + 1,
        updatedAt: Date.now(),
      });
    try {
      const response = current
        ? await authoringCall<{ draft: Draft }>(key, "update_draft", {
            draftId: current.id,
            expectedVersion: current.version,
            patch: editable(form),
          })
        : await authoringCall<{ draft: Draft }>(
            key,
            "create_draft",
            editable(form),
          );
      const next = response.draft;
      setDraft(next);
      setForm(formFromDraft(next));
      setDirty(false);
      setActiveGroup(0);
      clearApproval();
      setDrafts((list) => [
        next,
        ...list.filter((item) => item.id !== next.id),
      ]);
      history.replaceState(
        null,
        "",
        `/author?draft=${encodeURIComponent(next.id)}`,
      );
      setMessage(`Saved version ${next.version}.`);
    } catch (value) {
      if (current) setDraft(current);
      fail(value);
    } finally {
      setBusy("");
    }
  }

  async function renderPreview() {
    if (!draft || dirty) return;
    setBusy("preview");
    setError("");
    setReview(null);
    setFitErrors([]);
    setAssetsReady(false);
    try {
      const response = await authoringCall<PreviewResult>(
        key,
        "preview_draft",
        { draftId: draft.id, expectedVersion: draft.version },
      );
      setPreview(response);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const root = outputRef.current!;
      playerRef.current?.dispose();
      playerRef.current = new Player(root, [response.cue]);
      playerRef.current.render(response.cue);
      await waitForPreviewAssets(root);
      setAssetsReady(true);
      const errors = [
        ...(response.validation?.errors || []),
        ...findFitErrors(root),
      ];
      setFitErrors([...new Set(errors)]);
      setMessage(
        errors.length
          ? "Preview ready with fit issues to resolve."
          : "Preview ready at 1920×1080.",
      );
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  async function approvePreview() {
    if (!draft || !preview || fitErrors.length || !assetsReady) return;
    setBusy("review");
    setError("");
    const browserMeasurement: BrowserMeasurement = {
      viewportWidth: 1920,
      viewportHeight: 1080,
      fontsReady: true,
      overflow: false,
      rendererVersion: "crc-author-preview-v1",
      measuredAt: Date.now(),
    };
    try {
      const response = await authoringCall<ReviewReceipt>(key, "review_draft", {
        draftId: draft.id,
        expectedVersion: draft.version,
        previewId: preview.previewId,
        browserMeasurement,
        humanApproved: true,
      });
      setReview(response);
      setMessage(`Review recorded for exact saved version ${draft.version}.`);
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (!draft || !preview || !reviewIsCurrent) return;
    setBusy("publish");
    setError("");
    try {
      const response = await authoringCall<{ revision: PublishedRevision }>(
        key,
        "publish_draft",
        {
          draftId: draft.id,
          expectedVersion: draft.version,
          previewId: preview.previewId,
        },
      );
      const latest = (
        await authoringCall<{ draft: Draft }>(key, "get_draft", {
          draftId: draft.id,
        })
      ).draft;
      setDraft(latest);
      setDrafts((list) => [
        latest,
        ...list.filter((item) => item.id !== latest.id),
      ]);
      setMessage(
        `Published revision ${response.revision.revision} from reviewed draft version ${response.revision.draftVersion}.`,
      );
      await showRevisions(latest);
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  async function showRevisions(target = draft) {
    if (target)
      try {
        const response = await authoringCall<{
          revisions: PublishedRevision[];
        }>(key, "list_revisions", { draftId: target.id });
        setRevisions(response.revisions || []);
      } catch (value) {
        fail(value);
      }
  }
  async function activateRevision(revision: number) {
    if (!draft) return;
    setBusy(`rollback-${revision}`);
    setError("");
    try {
      const response = await authoringCall<{ draft: Draft }>(
        key,
        "rollback_draft",
        { draftId: draft.id, expectedVersion: draft.version, revision },
      );
      setDraft(response.draft);
      setForm(formFromDraft(response.draft));
      setDirty(false);
      clearApproval();
      setDrafts((list) => [
        response.draft,
        ...list.filter((item) => item.id !== response.draft.id),
      ]);
      await showRevisions(response.draft);
      setMessage(
        `Published revision ${revision} is now active. The latest editable content is still available.`,
      );
    } catch (value) {
      fail(value);
    } finally {
      setBusy("");
    }
  }

  if (!key)
    return (
      <main className="author-page access-page">
        <form
          className="access-card"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <span className="eyebrow">CRC OVERLAY AUTHORING</span>
          <h1>Open the cue editor</h1>
          <p>Use the production control key. It stays in this browser tab.</p>
          <label>
            Control key
            <input
              autoFocus
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              required
            />
          </label>
          <button disabled={busy === "connect"}>
            {busy === "connect" ? "Connecting…" : "Open editor"}
          </button>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
        </form>
      </main>
    );

  return (
    <main className="author-page">
      <header className="author-header">
        <div>
          <span className="eyebrow">CRC OVERLAY AUTHORING</span>
          <h1>Overlay editor</h1>
          <p>
            Build from CRC’s authorized text, inspect the broadcast frame, and
            publish an exact reviewed version.
          </p>
        </div>
        <Link href="/">Live control</Link>
      </header>
      <nav className="stepbar" aria-label="Authoring workflow">
        <span className="active">1 Content</span>
        <span>2 Appearance</span>
        <span>3 Preview</span>
        <span>4 Publish</span>
      </nav>
      <div className="workspace-grid">
        <aside className="panel library-panel">
          <PanelHeading eyebrow="DRAFTS" title="Saved work">
            <button
              className="small-button"
              onClick={() => {
                setDraft(null);
                setForm(emptyForm);
                setDirty(false);
                setSource(null);
                clearApproval();
                history.replaceState(null, "", "/author");
              }}
            >
              New
            </button>
          </PanelHeading>
          <div className="draft-list">
            {drafts.map((item) => (
              <button
                key={item.id}
                className={draft?.id === item.id ? "selected" : ""}
                onClick={() => void openDraft(key, item.id)}
              >
                <strong>{item.name}</strong>
                <small>
                  Version {item.version}
                  {item.activeRevision
                    ? ` · Published revision ${item.activeRevision}`
                    : ""}
                </small>
                <small>{formatTime(item.updatedAt)}</small>
              </button>
            ))}
            {!drafts.length && <p className="empty">No saved drafts yet.</p>}
          </div>
          <details>
            <summary>Import an existing cue</summary>
            <p>Keep the published cue ID and begin with its source mapping.</p>
            <select
              aria-label="Existing cue"
              value=""
              onChange={(event) =>
                event.target.value && void importCue(event.target.value)
              }
            >
              <option value="">Choose a cue…</option>
              {templates.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={!item.importable}
                >
                  {item.name}
                  {item.importable ? "" : " · unavailable"}
                </option>
              ))}
            </select>
          </details>
        </aside>

        <section className="panel source-panel">
          <span className="step-label">1 · CONTENT</span>
          <h2>Choose authorized text</h2>
          <div className="search-row">
            <label className="grow">
              Search the CRC source library
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
                placeholder="Prayer name or section"
              />
            </label>
            <button onClick={() => void search()} disabled={busy === "search"}>
              Search
            </button>
          </div>
          {!!results.length && (
            <div className="search-results">
              {results
                .filter((item) => item.kinds.includes(form.mode))
                .map((item) => (
                  <button
                    key={item.id}
                    className={source?.id === item.id ? "selected" : ""}
                    onClick={() => void selectSource(item.id)}
                  >
                    <strong>{item.name}</strong>
                    <small>
                      {item.section ?? "CRC source"} · {item.blockCount} lines
                    </small>
                  </button>
                ))}
            </div>
          )}
          <div className="mode-row">
            <button
              className={form.mode === "bilingual" ? "selected" : ""}
              onClick={() => changeMode("bilingual")}
            >
              Hebrew + transliteration
            </button>
            <button
              className={form.mode === "original-en" ? "selected" : ""}
              onClick={() => changeMode("original-en")}
            >
              Original English reading
            </button>
          </div>
          {source && (
            <div className="source-editor">
              <div className="source-title">
                <div>
                  <h3>{source.name}</h3>
                  <p>
                    {source.section ?? "CRC source"} · One selection keeps
                    paired text together.
                  </p>
                </div>
                <span>
                  {sourcePage + 1} / {pageCount}
                </span>
              </div>
              <div className="group-tabs">
                {form.groups.map((group, index) => (
                  <button
                    key={`${group.sourceId}-${index}`}
                    className={activeGroup === index ? "selected" : ""}
                    onClick={() => {
                      setActiveGroup(index);
                      if (group.sourceId !== source.id)
                        void loadSource(key, group.sourceId);
                    }}
                  >
                    Group {index + 1}
                    <small>{group.blockIds.length} lines</small>
                  </button>
                ))}
                <button onClick={addGroup}>+ Group</button>
              </div>
              <div className="block-list">
                {visibleBlocks.map((block) => (
                  <label
                    key={block.id}
                    className={selectedIds.has(block.id) ? "selected" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(block.id)}
                      onChange={(event) =>
                        toggleBlock(block.id, event.target.checked)
                      }
                    />
                    <span className="line-number">{block.index + 1}</span>
                    <span>
                      {form.mode === "bilingual" ? (
                        <>
                          <b lang="he" dir="rtl">
                            {block.he}
                          </b>
                          <small>{block.tr}</small>
                        </>
                      ) : (
                        <b>{block.en}</b>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <div className="pagination">
                <button
                  disabled={sourcePage === 0}
                  onClick={() => setSourcePage((page) => page - 1)}
                >
                  Previous lines
                </button>
                <button
                  disabled={sourcePage >= pageCount - 1}
                  onClick={() => setSourcePage((page) => page + 1)}
                >
                  Next lines
                </button>
              </div>
              {form.groups.length > 1 && (
                <button
                  className="text-button danger-button"
                  onClick={removeGroup}
                >
                  Remove group {activeGroup + 1}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel settings-panel">
          <span className="step-label">2 · APPEARANCE</span>
          {form.mode === "bilingual" && (form.includeTranslation || source?.blocks.some(block => block.kind === "translation-en")) && <label><input type="checkbox" checked={!!form.includeTranslation} onChange={e => changeForm({includeTranslation:e.target.checked})} /> Include authorized English for complete Birchot Hashachar blessings</label>}
          <h2>Title and layout</h2>
          <label>
            Draft name
            <input
              value={form.name}
              maxLength={80}
              onChange={(event) => changeForm({ name: event.target.value })}
            />
          </label>
          <label>
            On-screen title
            <input
              value={form.title}
              maxLength={100}
              onChange={(event) => changeForm({ title: event.target.value })}
            />
          </label>
          <label>
            Hebrew accent title <span>(optional)</span>
            <input
              dir="rtl"
              value={form.accentTitle}
              maxLength={60}
              onChange={(event) =>
                changeForm({ accentTitle: event.target.value })
              }
            />
          </label>
          <label>
            Layout
            <select
              value={form.layout}
              onChange={(event) =>
                changeForm({
                  layout: event.target.value as Layout,
                  templateCueId: "",
                })
              }
            >
              <option value="bottom">Lower third</option>
              <option value="left">Left panel</option>
              <option value="right">Right panel</option>
            </select>
          </label>
          <label>
            Motion template
            <select
              value={form.templateCueId}
              onChange={(event) =>
                changeForm({ templateCueId: event.target.value })
              }
            >
              <option value="">Choose a matching template…</option>
              {templates
                .filter((item) => item.layout === form.layout)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset>
            <legend>
              Type size <span>(pixels)</span>
            </legend>
            <div className="font-grid">
              <NumberField
                label="Hebrew"
                value={form.presentation.hebrewFontSize}
                min={24}
                max={52}
                onChange={(value) =>
                  changeForm({
                    presentation: {
                      ...form.presentation,
                      hebrewFontSize: value,
                    },
                  })
                }
              />
              <NumberField
                label={
                  form.mode === "original-en" ? "English" : "Transliteration"
                }
                value={form.presentation.transliterationFontSize}
                min={20}
                max={48}
                onChange={(value) =>
                  changeForm({
                    presentation: {
                      ...form.presentation,
                      transliterationFontSize: value,
                    },
                  })
                }
              />
              <NumberField
                label="Title"
                value={form.presentation.titleFontSize}
                min={20}
                max={42}
                onChange={(value) =>
                  changeForm({
                    presentation: {
                      ...form.presentation,
                      titleFontSize: value,
                    },
                  })
                }
              />
            </div>
          </fieldset>
          <button
            className="primary-button"
            disabled={
              !!busy ||
              !form.name ||
              !form.title ||
              !form.templateCueId ||
              !form.groups.some((group) => group.blockIds.length)
            }
            onClick={() => void save()}
          >
            {busy === "save"
              ? "Saving…"
              : draft
                ? `Save version ${draft.version + 1}`
                : "Save new draft"}
          </button>
          {draft && (
            <p className="version-note">
              Saved version {draft.version}
              {dirty
                ? " · Unsaved changes"
                : draft.activeRevision
                  ? ` · Published revision ${draft.activeRevision}`
                  : " · Not published"}
            </p>
          )}
        </section>

        <section className="panel preview-panel">
          <PanelHeading eyebrow="3 · PREVIEW" title="Broadcast frame">
            <span className="frame-size">1920 × 1080</span>
          </PanelHeading>
          <p className="helper">
            This isolated preview renders only the saved draft. It never reads
            or controls the live overlay.
          </p>
          <div ref={viewportRef} className="preview-viewport">
            <div ref={outputRef} id="output" className="author-output" />
          </div>
          {preview && (
            <div
              className={
                fitErrors.length
                  ? "fit-report fit-error"
                  : "fit-report fit-good"
              }
              role="status"
            >
              <strong>
                {fitErrors.length
                  ? "Fit check needs attention"
                  : "Everything fits the broadcast frame"}
              </strong>
              {fitErrors.map((item) => (
                <span key={item}>{item}</span>
              ))}
              <small>
                {assetsReady
                  ? "Fonts and logo ready"
                  : "Waiting for fonts and logo"}
              </small>
            </div>
          )}
          <div className="preview-actions">
            <button
              disabled={!draft || dirty || !!busy}
              onClick={() => void renderPreview()}
            >
              {busy === "preview" ? "Rendering…" : "Render saved version"}
            </button>
            <button
              className="primary-button"
              disabled={
                !previewIsCurrent ||
                !assetsReady ||
                !!fitErrors.length ||
                !!busy
              }
              onClick={() => void approvePreview()}
            >
              {busy === "review"
                ? "Recording…"
                : reviewIsCurrent
                  ? `Reviewed version ${review!.draftVersion}`
                  : "Approve this exact preview"}
            </button>
          </div>
        </section>

        <section className="panel publish-panel">
          <span className="step-label">4 · PUBLISH</span>
          <h2>Published revisions</h2>
          <p className="helper">
            Publishing is available only for the saved version whose exact
            preview you reviewed.
          </p>
          <button
            className="publish-button"
            disabled={!reviewIsCurrent || !!busy}
            onClick={() => void publish()}
          >
            {busy === "publish" ? "Publishing…" : "Publish reviewed version"}
          </button>
          <button
            className="text-button"
            disabled={!draft}
            onClick={() => void showRevisions()}
          >
            Refresh revision history
          </button>
          <div className="revision-list">
            {revisions.map((item) => (
              <div
                key={item.revision}
                className={
                  draft?.activeRevision === item.revision
                    ? "active-revision"
                    : ""
                }
              >
                <span>
                  <strong>Revision {item.revision}</strong>
                  <small>
                    Draft version {item.draftVersion} ·{" "}
                    {formatTime(item.createdAt)}
                  </small>
                </span>
                {draft?.activeRevision === item.revision ? (
                  <em>Current publication</em>
                ) : (
                  <button
                    disabled={!!busy}
                    onClick={() => void activateRevision(item.revision)}
                  >
                    {busy === `rollback-${item.revision}`
                      ? "Switching…"
                      : "Use this published revision"}
                  </button>
                )}
              </div>
            ))}
            {draft && !revisions.length && (
              <p className="empty">
                Refresh to view earlier published revisions.
              </p>
            )}
          </div>
        </section>
      </div>
      <div className="notice-stack" aria-live="polite">
        {message && <p className="notice success">{message}</p>}
        {error && (
          <p role="alert" className="notice error">
            {error}
            {error.toLowerCase().includes("version") && draft && (
              <button onClick={() => void openDraft(key, draft.id)}>
                Load latest
              </button>
            )}
          </p>
        )}
      </div>
    </main>
  );
}

function PanelHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <span className="step-label">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value?: number;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        placeholder="Auto"
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : Number(event.target.value),
          )
        }
      />
    </label>
  );
}
