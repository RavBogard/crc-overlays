"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cue } from "@/lib/player";
import { authoringCall } from "./api";
import type { SharedShelfEntry } from "./shared-shelf";

type SharedCue = SharedShelfEntry;
export type SharedLibraryState = { available: boolean; cues: SharedCue[]; stale: boolean; refreshedAt: number | null; error: string | null };

/* W2B §5.2 - the CRC shelf: its feed, the card the operator has selected, and the preview that
   selection pulls. The preview effect stays with the state it writes, so the only thing it needs
   from the page is the stage (`showCue`) and the busy flag the dock reads. */
export function useSharedLibrary(options: {
  controlKey: string;
  sharedEnabled: boolean;
  onSharedTab: boolean;
  showCue: (cue: Cue, animate?: boolean) => Promise<void>;
  setBusy: (value: string) => void;
}) {
  const { controlKey, sharedEnabled, onSharedTab, showCue, setBusy } = options;
  const [sharedLibrary, setSharedLibrary] = useState<SharedLibraryState>({ available: false, cues: [], stale: false, refreshedAt: null, error: null });
  const [sharedSelectedId, setSharedSelectedId] = useState<string | null>(null);
  const [sharedPreview, setSharedPreview] = useState<Cue | null>(null);

  const refreshSharedLibrary = useCallback(async (key: string, force = false) => {
    setBusy("shared-refresh");
    try {
      const response = await authoringCall<{ available: boolean; cues?: SharedCue[]; total?: number; truncated?: boolean; stale?: boolean; refreshedAt?: number; error?: string }>(key, "list_shared_library", { limit: 1000, ...(force ? { refresh: true } : {}) });
      const cues = response.cues || [];
      setSharedPreview(null);
      setSharedLibrary({ available: response.available, cues, stale: Boolean(response.stale), refreshedAt: response.refreshedAt || Date.now(), error: response.error || null });
      setSharedSelectedId((current) => current && cues.some((cue) => cue.id === current) ? current : cues[0]?.id || null);
    } catch (value) {
      setSharedLibrary((current) => ({ ...current, available: false, stale: current.cues.length > 0, error: value instanceof Error ? value.message : "CRC library is temporarily unavailable." }));
    } finally { setBusy(""); }
  }, [setBusy]);

  useEffect(() => {
    if (!controlKey || !sharedEnabled) return;
    void refreshSharedLibrary(controlKey);
  }, [controlKey, refreshSharedLibrary, sharedEnabled]);

  useEffect(() => {
    if (!controlKey || !onSharedTab || !sharedSelectedId) return;
    let cancelled = false;
    setBusy("shared-preview");
    void authoringCall<{ available: boolean; stale?: boolean; refreshedAt?: number; cue?: Cue; cueHash?: string; error?: string }>(controlKey, "preview_shared_cue", { cueId: sharedSelectedId })
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
  }, [controlKey, onSharedTab, sharedSelectedId, setBusy, showCue]);

  return { sharedLibrary, sharedSelectedId, setSharedSelectedId, sharedPreview, setSharedPreview, refreshSharedLibrary };
}
