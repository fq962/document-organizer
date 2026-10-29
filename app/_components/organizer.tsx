"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FolderSidebar } from "./folder-sidebar";
import { DropArea } from "./drop-area";
import { useOrganizerStore } from "./use-organizer-store";
import type { CurrentUser } from "@/lib/auth";
import type { OrganizerData } from "@/lib/organizer-data";

const ERROR_TIMEOUT_MS = 6000;

export function Organizer({
  user,
  data,
}: {
  user: CurrentUser;
  data: OrganizerData;
}) {
  const store = useOrganizerStore({
    userId: user.id,
    initialFolders: data.folders,
    initialDocs: data.docs,
  });
  const { folders, docs, error, dismissError } = store;
  const [selectedId, setSelectedId] = useState(data.rootId);
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

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(dismissError, ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [error, dismissError]);

  // Si la carpeta seleccionada se elimina, se vuelve a la raíz.
  const selected =
    folders.find((f) => f.id === selectedId) ??
    folders.find((f) => f.id === data.rootId)!;
  const selectedDocs = useMemo(
    () => docs.filter((d) => d.folderId === selected.id),
    [docs, selected.id],
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <FolderSidebar
        folders={folders}
        docs={docs}
        rootId={data.rootId}
        selectedId={selected.id}
        onSelect={selectFolder}
        onCreate={store.createFolder}
        onRename={store.renameFolder}
        onDelete={store.deleteFolder}
        onTogglePin={store.togglePin}
        onDropFiles={store.addFiles}
        onMoveDoc={store.moveDoc}
        user={user}
        mobileOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <DropArea
        folder={selected}
        folders={folders}
        docs={selectedDocs}
        onSelectFolder={setSelectedId}
        onAddFiles={store.addFiles}
        onRemoveDoc={store.removeDoc}
        onRenameDoc={store.renameDoc}
        onMoveDoc={store.moveDoc}
        onOpenDoc={store.openDoc}
        onOpenFolders={() => setDrawerOpen(true)}
        onShareFolder={store.shareFolder}
        onUnshareFolder={store.unshareFolder}
      />

      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            role="alert"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-[#3a2a26] px-4 py-3 text-sm shadow-xl shadow-black/40 ring-1 ring-red-300/30"
          >
            <p className="flex-1">{error}</p>
            <button
              onClick={dismissError}
              aria-label="Cerrar"
              className="-m-1 rounded-full p-1 leading-none opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
