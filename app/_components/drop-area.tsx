"use client";

import { useRef, useState } from "react";
import { DOC_DRAG_TYPE, type Doc, type Folder } from "./types";

type Props = {
  folder: Folder;
  folders: Folder[];
  docs: Doc[];
  onSelectFolder: (id: string) => void;
  onAddFiles: (files: FileList, folderId: string) => void;
  onRemoveDoc: (id: string) => void;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase().slice(0, 4) : "FILE";
}

export function DropArea({
  folder,
  folders,
  docs,
  onSelectFolder,
  onAddFiles,
  onRemoveDoc,
}: Props) {
  // Contador para que el overlay no parpadee al pasar sobre elementos hijos.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFileDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files") &&
    !e.dataTransfer.types.includes(DOC_DRAG_TYPE);

  const path: Folder[] = [];
  for (let f: Folder | undefined = folder; f; ) {
    path.unshift(f);
    f = folders.find((p) => p.id === f!.parentId);
  }
  const subfolders = folders.filter((f) => f.parentId === folder.id);

  return (
    <section
      className="relative flex flex-1 flex-col overflow-hidden"
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
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-8 py-5">
        <nav className="flex min-w-0 items-center gap-1 text-sm">
          {path.map((f, i) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1">
              {i > 0 && <span className="opacity-40">/</span>}
              <button
                onClick={() => onSelectFolder(f.id)}
                className={`truncate rounded-full px-2 py-0.5 hover:bg-white/10 ${
                  i === path.length - 1 ? "text-xl font-semibold" : "opacity-70"
                }`}
              >
                {f.name}
              </button>
            </span>
          ))}
        </nav>
        <button
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-[#3a4230] transition hover:bg-white"
        >
          Subir archivos
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

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {subfolders.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {subfolders.map((f) => (
              <button
                key={f.id}
                onClick={() => onSelectFolder(f.id)}
                style={{ backgroundColor: `hsl(${f.hue} 28% 38% / 0.55)` }}
                className="rounded-full px-4 py-1.5 text-sm transition hover:brightness-110"
              >
                {f.name}
              </button>
            ))}
          </div>
        )}

        {docs.length === 0 ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-white/20 text-center">
            <p className="text-lg font-medium">Arrastra archivos aquí</p>
            <p className="text-sm opacity-60">
              Se guardarán en “{folder.name}”
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
            {docs.map((doc) => (
              <li
                key={doc.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DOC_DRAG_TYPE, doc.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="group relative flex cursor-grab flex-col overflow-hidden rounded-2xl bg-black/20 shadow-sm shadow-black/20 transition hover:-translate-y-0.5 hover:bg-black/30 active:cursor-grabbing"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  draggable={false}
                  className="flex aspect-[4/3] items-center justify-center bg-white/5"
                >
                  {doc.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- blob: URL local, next/image no aplica
                    <img
                      src={doc.url}
                      alt=""
                      draggable={false}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="rounded-lg bg-white/15 px-2.5 py-1 text-sm font-semibold tracking-wide">
                      {extension(doc.name)}
                    </span>
                  )}
                </a>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium" title={doc.name}>
                    {doc.name}
                  </p>
                  <p className="text-xs opacity-60">{formatSize(doc.size)}</p>
                </div>
                <button
                  onClick={() => onRemoveDoc(doc.id)}
                  aria-label={`Eliminar ${doc.name}`}
                  className="absolute top-2 right-2 hidden size-6 items-center justify-center rounded-full bg-black/50 text-sm group-hover:flex hover:bg-black/70"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-3xl border-2 border-dashed border-white/70 bg-black/30 backdrop-blur-sm">
          <p className="text-2xl font-semibold">
            Suelta para subir a “{folder.name}”
          </p>
        </div>
      )}
    </section>
  );
}
