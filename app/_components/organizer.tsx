"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderSidebar } from "./folder-sidebar";
import { DropArea } from "./drop-area";
import type { CurrentUser } from "@/lib/auth";
import type { Doc, Folder } from "./types";

const ROOT_ID = "root";
const HUES = [95, 140, 45, 25, 180, 205, 275, 340];

const initialFolders: Folder[] = [
  { id: ROOT_ID, name: "Mis documentos", parentId: null, hue: 95 },
  { id: "trabajo", name: "Trabajo", parentId: ROOT_ID, hue: 140 },
  { id: "personal", name: "Personal", parentId: ROOT_ID, hue: 45 },
  { id: "facturas", name: "Facturas", parentId: "personal", hue: 25 },
];

function descendantIds(folders: Folder[], id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function Organizer({ user }: { user: CurrentUser }) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedId, setSelectedId] = useState(ROOT_ID);
  // Drawer de carpetas en móvil; en desktop la barra siempre está visible.
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectFolder = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const addFiles = useCallback((files: FileList | File[], folderId: string) => {
    const added: Doc[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      folderId,
      addedAt: Date.now(),
      url: URL.createObjectURL(file),
    }));
    setDocs((prev) => [...added, ...prev]);
  }, []);

  const moveDoc = useCallback((docId: string, folderId: string) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, folderId } : d)),
    );
  }, []);

  const removeDoc = useCallback((docId: string) => {
    setDocs((prev) => {
      const doc = prev.find((d) => d.id === docId);
      if (doc) URL.revokeObjectURL(doc.url);
      return prev.filter((d) => d.id !== docId);
    });
  }, []);

  const createFolder = useCallback((parentId: string, hue?: number) => {
    const id = crypto.randomUUID();
    setFolders((prev) => [
      ...prev,
      {
        id,
        name: "Nueva carpeta",
        parentId,
        hue: hue ?? HUES[prev.length % HUES.length],
      },
    ]);
    return id;
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }, []);

  const deleteFolder = useCallback(
    (id: string) => {
      if (id === ROOT_ID) return;
      const ids = descendantIds(folders, id);
      setFolders((prev) => prev.filter((f) => !ids.has(f.id)));
      setDocs((prev) =>
        prev.filter((d) => {
          if (!ids.has(d.folderId)) return true;
          URL.revokeObjectURL(d.url);
          return false;
        }),
      );
      if (ids.has(selectedId)) {
        setSelectedId(folders.find((f) => f.id === id)?.parentId ?? ROOT_ID);
      }
    },
    [folders, selectedId],
  );

  const selected = folders.find((f) => f.id === selectedId) ?? folders[0];
  const selectedDocs = useMemo(
    () => docs.filter((d) => d.folderId === selected.id),
    [docs, selected.id],
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <FolderSidebar
        folders={folders}
        docs={docs}
        rootId={ROOT_ID}
        selectedId={selected.id}
        onSelect={selectFolder}
        onCreate={createFolder}
        onRename={renameFolder}
        onDelete={deleteFolder}
        onDropFiles={addFiles}
        onMoveDoc={moveDoc}
        user={user}
        mobileOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <DropArea
        folder={selected}
        folders={folders}
        docs={selectedDocs}
        onSelectFolder={setSelectedId}
        onAddFiles={addFiles}
        onRemoveDoc={removeDoc}
        onMoveDoc={moveDoc}
        onOpenFolders={() => setDrawerOpen(true)}
      />
    </div>
  );
}
