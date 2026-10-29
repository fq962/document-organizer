"use client";

import { useRef, useState } from "react";
import { Menu, Pencil, Plus, X } from "lucide-react";
import { ShareFolderButton } from "./share-folder";
import { FOLDER_ATTR, TouchDragGhost, useTouchDocDrag } from "./touch-drag";
import { useImagePreviews } from "./use-organizer-store";
import {
  byPinned,
  DOC_DRAG_TYPE,
  extension,
  formatSize,
  splitName,
  type Doc,
  type Folder,
} from "./types";

type Props = {
  folder: Folder;
  folders: Folder[];
  docs: Doc[];
  onSelectFolder: (id: string) => void;
  onAddFiles: (files: FileList, folderId: string) => void;
  onRemoveDoc: (id: string) => void;
  onRenameDoc: (id: string, name: string) => void;
  onMoveDoc: (docId: string, folderId: string) => void;
  onOpenDoc: (doc: Doc) => void;
  onOpenFolders: () => void;
  onShareFolder: (id: string) => Promise<string | null>;
  onUnshareFolder: (id: string) => void;
};

// Resalta destinos de documentos tanto con el drag nativo (mouse) como con el
// arrastre táctil, que marca el destino con `data-drop-target`.
const DROP_TARGET_CLASSES =
  "data-drop-target:ring-2 data-drop-target:ring-white/70";

/** Props para que un elemento acepte documentos arrastrados con el mouse. */
function docDropTarget(
  folderId: string,
  onMoveDoc: (docId: string, folderId: string) => void,
) {
  return {
    [FOLDER_ATTR]: folderId,
    onDragOver(e: React.DragEvent<HTMLElement>) {
      if (!e.dataTransfer.types.includes(DOC_DRAG_TYPE)) return;
      e.preventDefault();
      e.currentTarget.setAttribute("data-drop-target", "");
    },
    onDragLeave(e: React.DragEvent<HTMLElement>) {
      e.currentTarget.removeAttribute("data-drop-target");
    },
    onDrop(e: React.DragEvent<HTMLElement>) {
      e.currentTarget.removeAttribute("data-drop-target");
      const docId = e.dataTransfer.getData(DOC_DRAG_TYPE);
      if (!docId) return;
      e.preventDefault();
      e.stopPropagation();
      onMoveDoc(docId, folderId);
    },
  };
}

export function DropArea({
  folder,
  folders,
  docs,
  onSelectFolder,
  onAddFiles,
  onRemoveDoc,
  onRenameDoc,
  onMoveDoc,
  onOpenDoc,
  onOpenFolders,
  onShareFolder,
  onUnshareFolder,
}: Props) {
  const previewUrl = useImagePreviews(docs);
  // Contador para que el overlay no parpadee al pasar sobre elementos hijos.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickFiles = () => inputRef.current?.click();

  const isFileDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files") &&
    !e.dataTransfer.types.includes(DOC_DRAG_TYPE);

  const path: Folder[] = [];
  for (let f: Folder | undefined = folder; f;) {
    path.unshift(f);
    f = folders.find((p) => p.id === f!.parentId);
  }
  const subfolders = folders
    .filter((f) => f.parentId === folder.id)
    .sort(byPinned);

  return (
    <section
      className="@container relative flex min-w-0 flex-1 flex-col overflow-hidden"
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return;
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDragOver={(e) => {
        if (isFileDrag(e)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        onAddFiles(e.dataTransfer.files, folder.id);
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] @xl:gap-4 @xl:px-8 @xl:py-5">
        <button
          onClick={onOpenFolders}
          aria-label="Abrir carpetas"
          className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 md:hidden"
        >
          <Menu className="size-6" aria-hidden />
        </button>
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          {path.map((f, i) => (
            <span
              key={f.id}
              // Las carpetas anteriores se recortan antes que la actual.
              className={`flex min-w-0 items-center gap-1 ${
                i === path.length - 1 ? "shrink" : "shrink-[10]"
              }`}
            >
              {i > 0 && <span className="shrink-0 opacity-40">/</span>}
              <button
                {...docDropTarget(f.id, onMoveDoc)}
                onClick={() => onSelectFolder(f.id)}
                title={f.name}
                className={`truncate rounded-full px-2 py-1 hover:bg-white/10 ${DROP_TARGET_CLASSES} ${
                  i === path.length - 1
                    ? "text-lg font-semibold @xl:text-xl"
                    : "opacity-70"
                }`}
              >
                {f.name}
              </button>
            </span>
          ))}
        </nav>
        <ShareFolderButton
          folder={folder}
          onShare={onShareFolder}
          onUnshare={onUnshareFolder}
        />
        <button
          onClick={pickFiles}
          aria-label="Subir archivos"
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/90 px-4 text-sm font-medium text-[#3a4230] transition hover:bg-white @xl:h-auto @xl:py-2"
        >
          <Plus className="size-4" strokeWidth={2.5} aria-hidden />
          <span className="hidden @md:inline">Subir archivos</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onAddFiles(e.target.files, folder.id);
            e.target.value = "";
          }}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] @xl:px-8 @xl:py-6">
        {subfolders.length > 0 && (
          // En móvil, una fila con scroll horizontal; en anchos mayores, wrap.
          <div className="-mx-3 mb-4 flex shrink-0 gap-2 overflow-x-auto px-3 pb-1 @xl:mx-0 @xl:mb-6 @xl:flex-wrap @xl:overflow-visible @xl:px-0">
            {subfolders.map((f) => (
              <button
                key={f.id}
                {...docDropTarget(f.id, onMoveDoc)}
                onClick={() => onSelectFolder(f.id)}
                style={{ backgroundColor: `hsl(${f.hue} 28% 38% / 0.55)` }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm transition hover:brightness-110 ${DROP_TARGET_CLASSES}`}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        {docs.length === 0 ? (
          <button
            onClick={pickFiles}
            className="flex min-h-48 flex-1 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/20 px-4 text-center transition hover:border-white/35"
          >
            <span className="text-lg font-medium">
              <span className="pointer-coarse:hidden">
                Arrastra archivos aquí
              </span>
              <span className="hidden pointer-coarse:inline">
                Toca para subir archivos
              </span>
            </span>
            <span className="text-sm opacity-60">
              Se guardarán en “{folder.name}”
            </span>
          </button>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 @xl:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] @xl:gap-4">
            {docs.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                onRemove={onRemoveDoc}
                onRename={onRenameDoc}
                onMove={onMoveDoc}
                onOpen={onOpenDoc}
                previewUrl={previewUrl(doc)}
              />
            ))}
          </ul>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-3xl border-2 border-dashed border-white/70 bg-black/30 px-4 text-center backdrop-blur-sm">
          <p className="text-2xl font-semibold">
            Suelta para subir a “{folder.name}”
          </p>
        </div>
      )}
    </section>
  );
}

function DocCard({
  doc,
  onRemove,
  onRename,
  onMove,
  onOpen,
  previewUrl,
}: {
  doc: Doc;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (docId: string, folderId: string) => void;
  onOpen: (doc: Doc) => void;
  previewUrl: string | undefined;
}) {
  const { ref, handlers, isActive, dragging, x, y } = useTouchDocDrag(
    doc.id,
    onMove,
  );
  const [editing, setEditing] = useState(false);
  // Mientras se sube no existe en la base: no se puede mover, renombrar ni
  // borrar. Mientras se renombra tampoco se arrastra (el input necesita los
  // gestos del puntero para seleccionar texto).
  const busy = doc.uploading || editing;

  return (
    <li
      ref={ref as React.RefObject<HTMLLIElement>}
      {...(editing ? {} : handlers)}
      draggable={!busy}
      onDragStart={(e) => {
        if (isActive() || busy) return e.preventDefault();
        e.dataTransfer.setData(DOC_DRAG_TYPE, doc.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      aria-busy={doc.uploading}
      style={{ WebkitTouchCallout: "none" }}
      className={`group relative flex cursor-grab flex-col overflow-hidden rounded-2xl bg-black/20 shadow-sm shadow-black/20 transition select-none hover:-translate-y-0.5 hover:bg-black/30 active:cursor-grabbing ${
        dragging ? "scale-95 opacity-40" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(doc)}
        aria-label={`Abrir ${doc.name}`}
        draggable={false}
        className="relative flex aspect-[4/3] items-center justify-center bg-white/5"
      >
        {doc.type.startsWith("image/") && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage o blob: local; next/image no aplica
          <img
            src={previewUrl}
            alt=""
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <span className="rounded-lg bg-white/15 px-2.5 py-1 text-sm font-semibold tracking-wide">
            {extension(doc.name)}
          </span>
        )}
        {doc.uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-medium">
            <span className="animate-pulse">Subiendo…</span>
          </span>
        )}
      </button>
      <div className="px-3 py-2">
        {editing ? (
          <input
            autoFocus
            defaultValue={doc.name}
            aria-label={`Nuevo nombre para ${doc.name}`}
            // Selecciona solo el nombre, sin la extensión, como un explorador
            // de archivos.
            onFocus={(e) =>
              e.currentTarget.setSelectionRange(
                0,
                splitName(doc.name).base.length,
              )
            }
            onBlur={(e) => {
              const name = e.currentTarget.value.trim();
              if (name) onRename(doc.id, name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                // Restaura el valor para que el blur no lo guarde.
                e.currentTarget.value = doc.name;
                e.currentTarget.blur();
              }
            }}
            maxLength={255}
            className="-mx-1 w-[calc(100%+0.5rem)] rounded-md bg-black/30 px-1 text-sm font-medium outline-none select-text"
          />
        ) : (
          <p
            onDoubleClick={() => !doc.uploading && setEditing(true)}
            className="truncate text-sm font-medium"
            title={doc.name}
          >
            {doc.name}
          </p>
        )}
        <p className="text-xs opacity-60">{formatSize(doc.size)}</p>
      </div>
      {!busy && (
        // Sin hover en touch: los botones siempre están visibles.
        <div className="absolute top-2 right-2 hidden gap-1 group-hover:flex pointer-coarse:flex">
          <CardAction
            label={`Renombrar ${doc.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" aria-hidden />
          </CardAction>
          <CardAction
            label={`Eliminar ${doc.name}`}
            onClick={() => onRemove(doc.id)}
          >
            <X className="size-3.5" aria-hidden />
          </CardAction>
        </div>
      )}
      <TouchDragGhost show={dragging} label={doc.name} x={x} y={y} />
    </li>
  );
}

function CardAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-6 items-center justify-center rounded-full bg-black/50 text-sm hover:bg-black/70 pointer-coarse:size-8"
    >
      {children}
    </button>
  );
}
