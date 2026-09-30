"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LibrarySort } from "./library-model";

export type LibraryFolder = { id: string; name: string };
export type LibraryFolders = { version: number; folders: LibraryFolder[]; assignments: Record<string, string> };
export type FolderChange = { operation: "create"; name: string } | { operation: "rename"; folderId: string; name: string } | { operation: "move"; cueId: string; folderId: string | null } | { operation: "delete"; folderId: string };
const emptyFolders: LibraryFolders = { version: 0, folders: [], assignments: {} };
const validSort = (value: string | null): LibrarySort => value === "newest" || value === "oldest" ? value : "az";
const sortKey = (workspaceId: string) => `crc-author-library-sort:${workspaceId}`;

export function useLibraryFolders(key: string, workspaceId: string | undefined) {
  const [state, setState] = useState<LibraryFolders>(emptyFolders);
  const [folderSelection, setFolderSelection] = useState<{ workspaceId: string; value: string } | null>(null);
  const [sortChoice, setSortChoice] = useState<{ workspaceId: string; value: LibrarySort } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const savedSort = useMemo(() => {
    if (!workspaceId || typeof window === "undefined") return "az";
    try { return validSort(localStorage.getItem(sortKey(workspaceId))); } catch { return "az"; }
  }, [workspaceId]);
  const sort = sortChoice && sortChoice.workspaceId === workspaceId ? sortChoice.value : savedSort;
  const chosenFolder = folderSelection && folderSelection.workspaceId === workspaceId ? folderSelection.value : "all";
  const folderFilter = chosenFolder === "all" || chosenFolder === "unfiled" || state.folders.some((folder) => folder.id === chosenFolder) ? chosenFolder : "all";
  const setFolderFilter = (value: string) => { if (workspaceId) setFolderSelection({ workspaceId, value }); };

  const request = useCallback(async (body?: Record<string, unknown>): Promise<LibraryFolders> => {
    const response = await fetch("/api/authoring/folders", {
      method: body ? "POST" : "GET", cache: "no-store",
      headers: { ...(key && key !== "session" ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json().catch(() => ({})) as LibraryFolders & { error?: string };
    if (!response.ok) throw new Error(response.status === 409 ? "Folders changed in another session. Reloaded the latest folders; try again." : value.error || `Folders could not be saved (${response.status}).`);
    return value;
  }, [key]);

  const refresh = useCallback(async () => {
    if (!key || !workspaceId) return;
    try { setState(await request()); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Folders could not be loaded."); }
  }, [key, request, workspaceId]);

  useEffect(() => {
    if (!key || !workspaceId) return;
    let active = true;
    void request().then((next) => { if (active) { setState(next); setError(""); } }, (cause) => { if (active) setError(cause instanceof Error ? cause.message : "Folders could not be loaded."); });
    return () => { active = false; };
  }, [key, request, workspaceId]);

  const changeSort = (value: LibrarySort) => {
    if (!workspaceId) return;
    setSortChoice({ workspaceId, value });
    try { localStorage.setItem(sortKey(workspaceId), value); } catch { /* Private browsing still allows an in-memory sort. */ }
  };

  const changeFolder = async (change: FolderChange) => {
    if (busy || !key || !workspaceId) return false;
    setBusy(true); setError("");
    try {
      const next = await request({ expectedVersion: state.version, ...change });
      setState(next);
      if (change.operation === "delete" && folderFilter === change.folderId) setFolderFilter("all");
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Folders could not be saved.";
      if (message.startsWith("Folders changed")) await refresh();
      setError(message);
      return false;
    } finally { setBusy(false); }
  };

  return { folders: state.folders, assignments: state.assignments, folderFilter, setFolderFilter, sort, changeSort, busy, error, changeFolder, refresh };
}
