"use client";

import { useCallback, useState } from "react";
import { authoringCall } from "./api";
import type { Draft, Source, SourceDisplay, SourceFacet, SourceSummary } from "./types";

export const sourceGroups = (draft: Draft) => {
  const content = draft.content.mode === "local-variant" ? draft.content.base : draft.content;
  return content.mode === "bilingual" ? content.hebrewGroups
    : content.mode === "source-en" || content.mode === "original-en" ? content.englishGroups : [];
};

/* W2B §5.1 - the passage picker: the search box and its facets, the source currently open, and the
   panel the operator is editing. `loadSource` and `showDraftSource` keep their explicit control-key
   argument because `openDraft` calls them with the key it was handed rather than the one in state. */
export function useSourceSearch(options: {
  controlKey: string;
  setBusy: (value: string) => void;
  setError: (value: string) => void;
  fail: (value: unknown) => void;
}) {
  const { controlKey, setBusy, setError, fail } = options;
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<SourceSummary[]>([]);
  const [sourceTruncated, setSourceTruncated] = useState(false);
  const [sourceFacets, setSourceFacets] = useState<{ books: SourceFacet[]; services: SourceFacet[] }>({ books: [], services: [] });
  const [source, setSource] = useState<Source | null>(null);
  const [bookFilter, setBookFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [activeGroup, setActiveGroup] = useState(0);

  const loadSource = useCallback(async (key: string, sourceId: string) => {
    const response = await authoringCall<{ source: Source; display?: SourceDisplay }>(key, "get_source", { sourceId });
    // I5 - the printed provenance travels with the source so no view falls back to a slug.
    const next: Source = response.display ? { ...response.source, display: response.display } : response.source;
    setSource(next);
    return next;
  }, []);

  // I4 - every path that opens a saved draft sets the picker source the same way, so a duplicate
  // of a source-backed graphic opens on its ticked passage list instead of the search results.
  const showDraftSource = useCallback(async (key: string, next: Draft) => {
    const first = sourceGroups(next)[0];
    if (!first) return setSource(null);
    const snapshot = next.sourceSnapshots?.find((item) => item.id === first.sourceId);
    if (snapshot) setSource(snapshot); else await loadSource(key, first.sourceId);
  }, [loadSource]);

  const browseSources = useCallback(async (overrides: { query?: string; book?: string; service?: string } = {}) => {
    const query = overrides.query ?? sourceQuery;
    const book = overrides.book ?? bookFilter;
    const service = overrides.service ?? serviceFilter;
    setBusy("search"); setError("");
    try {
      const response = await authoringCall<{ sources: SourceSummary[]; truncated?: boolean }>(controlKey, "search_sources", {
        query: query.trim(), ...(book ? { book } : {}), ...(service ? { service } : {}), limit: 50,
      });
      setSourceResults(response.sources || []);
      setSourceTruncated(Boolean(response.truncated));
    } catch (value) { fail(value); }
    finally { setBusy(""); }
  }, [bookFilter, controlKey, fail, serviceFilter, setBusy, setError, sourceQuery]);

  // Starting a new graphic returns the picker to its opening state; leaving the editor only drops
  // the results, because "Back to library" keeps the search the operator typed.
  const clearPicker = useCallback(() => {
    setSource(null);
    setSourceResults([]);
    setSourceTruncated(false);
    setSourceQuery("");
    setBookFilter("");
    setServiceFilter("");
    setActiveGroup(0);
  }, []);

  const clearResults = useCallback(() => {
    setSource(null);
    setSourceResults([]);
    setSourceTruncated(false);
  }, []);

  return {
    sourceQuery, setSourceQuery, sourceResults, sourceTruncated,
    sourceFacets, setSourceFacets, source, setSource,
    bookFilter, setBookFilter, serviceFilter, setServiceFilter,
    activeGroup, setActiveGroup,
    browseSources, loadSource, showDraftSource, clearPicker, clearResults,
  };
}
