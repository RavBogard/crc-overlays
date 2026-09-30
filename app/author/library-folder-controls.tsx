"use client";

import { useState } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { LibraryFolder } from "./use-library-folders";
import type { LibrarySort } from "./library-model";

export function LibraryFolderControls(props: {
  folders: LibraryFolder[]; folderFilter: string; setFolderFilter: (value: string) => void;
  sort: LibrarySort; changeSort: (value: LibrarySort) => void; busy: boolean; error: string;
  create: (name: string) => Promise<boolean>; rename: (folderId: string, name: string) => Promise<boolean>; remove: (folderId: string) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");
  const selected = props.folders.find((folder) => folder.id === props.folderFilter);
  async function submit() {
    if (!name.trim()) return;
    const saved = edit === "create" ? await props.create(name) : selected ? await props.rename(selected.id, name) : false;
    if (saved) { setEdit(null); setName(""); }
  }
  return <div className="library-organization">
    <div className="library-organization-row">
      <label>Folder<select aria-label="Filter by folder" value={props.folderFilter} onChange={(event) => props.setFolderFilter(event.target.value)}>
        <option value="all">All graphics</option><option value="unfiled">Unfiled</option>
        {props.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select></label>
      <button type="button" aria-label="Create folder" title="Create folder" disabled={props.busy} onClick={() => { setEdit("create"); setName(""); }}><FolderPlus size={15} /></button>
      {selected && <button type="button" aria-label={`Rename ${selected.name}`} title="Rename folder" disabled={props.busy} onClick={() => { setEdit("rename"); setName(selected.name); }}><Pencil size={14} /></button>}
      {selected && <button type="button" aria-label={`Delete ${selected.name}`} title="Delete folder; graphics become unfiled" disabled={props.busy} onClick={() => void props.remove(selected.id)}><Trash2 size={14} /></button>}
    </div>
    {edit && <form className="library-folder-edit" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <input aria-label={edit === "create" ? "New folder name" : "Rename folder"} autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Folder name" />
      <button type="submit" disabled={props.busy || !name.trim()}>{edit === "create" ? "Add" : "Save"}</button>
      <button type="button" onClick={() => setEdit(null)}>Cancel</button>
    </form>}
    <label className="library-sort">Sort<select aria-label="Sort graphics" value={props.sort} onChange={(event) => props.changeSort(event.target.value as LibrarySort)}>
      <option value="az">A–Z</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option>
    </select></label>
    {props.error && <p className="library-folder-error" role="alert">{props.error}</p>}
  </div>;
}
