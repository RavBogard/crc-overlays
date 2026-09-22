"use client";
/* eslint-disable react-hooks/set-state-in-effect -- `refreshAssets` is async and writes no
   state before its first await; the fetch-on-key effect is unchanged from AuthorPage. */

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceAsset } from "./look-drawer";

/* W2B §5.3 - the artwork library. `refreshAssets` keeps its explicit control-key argument so the
   callers that already hold one (the archive/restore round trip) read the same as before. */
export function useWorkspaceAssets(controlKey: string) {
  const [assets, setAssets] = useState<WorkspaceAsset[]>([]);
  const [assetError, setAssetError] = useState("");
  const [showArchivedAssets, setShowArchivedAssets] = useState(false);

  const refreshAssets = useCallback(async (key: string, includeArchived = false) => {
    try {
      const response = await fetch(includeArchived ? "/api/assets?includeArchived=true" : "/api/assets", { cache: "no-store", headers: key === "session" ? {} : { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
      const body = await response.json().catch(() => null) as { assets?: WorkspaceAsset[]; error?: string } | null;
      if (!response.ok) throw Error(body?.error || "Artwork library is unavailable.");
      setAssets((body?.assets || []).filter((item) => includeArchived || !item.archived)); setAssetError("");
    } catch (value) { setAssetError(value instanceof Error ? value.message : "Artwork library is unavailable."); }
  }, []);

  useEffect(() => { if (controlKey) void refreshAssets(controlKey, showArchivedAssets); }, [controlKey, refreshAssets, showArchivedAssets]);

  return { assets, setAssets, assetError, setAssetError, showArchivedAssets, setShowArchivedAssets, refreshAssets };
}
