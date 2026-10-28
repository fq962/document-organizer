"use client";

import { useState } from "react";
import { DOC_DRAG_TYPE, type Doc, type Folder } from "./types";

type Props = {
  folders: Folder[];
  docs: Doc[];
  rootId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: (parentId: string) => string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDropFiles: (files: FileList, folderId: string) => void;
  onMoveDoc: (docId: string, folderId: string) => void;
};

export function FolderSidebar(props: Props) {
  const { folders, rootId } = props;
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([rootId, "personal"]),
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggle = (id: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const create = (parentId: string) => {
    const id = props.onCreate(parentId);
    toggle(parentId, true);
    setEditingId(id);
  };

  const root = folders.find((f) => f.id === rootId)!;

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 bg-black/15 p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Carpetas</h1>
        <button
          onClick={() => create(props.selectedId)}
          className="rounded-full bg-white/10 px-3 py-1 text-sm transition hover:bg-white/20"
          title="Nueva carpeta dentro de la seleccionada"
        >
          + Nueva
        </button>
      </div>
      <FolderNode
        {...props}
        folder={root}
        depth={0}
        expanded={expanded}
        editingId={editingId}
        onToggle={toggle}
        onEdit={setEditingId}
        onCreateChild={create}
      />
    </aside>
  );
}

type NodeProps = Props & {
  folder: Folder;
  depth: number;
  expanded: Set<string>;
  editingId: string | null;
  onToggle: (id: string) => void;
  onEdit: (id: string | null) => void;
  onCreateChild: (parentId: string) => void;
};

function FolderNode(props: NodeProps) {
  const { folder, folders, docs, depth, expanded, selectedId } = props;
  const [dropping, setDropping] = useState(false);

  const children = folders.filter((f) => f.parentId === folder.id);
  const isOpen = expanded.has(folder.id) && children.length > 0;
  const isSelected = selectedId === folder.id;
  const count = docs.filter((d) => d.folderId === folder.id).length;

  const acceptsDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(DOC_DRAG_TYPE) ||
    e.dataTransfer.types.includes("Files");

  return (
    <div className="w-full">
      <div
        onClick={() => props.onSelect(folder.id)}
        onDoubleClick={() => props.onEdit(folder.id)}
        onDragOver={(e) => {
          if (!acceptsDrag(e)) return;
          e.preventDefault();
          e.stopPropagation();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropping(false);
          const docId = e.dataTransfer.getData(DOC_DRAG_TYPE);
          if (docId) props.onMoveDoc(docId, folder.id);
          else if (e.dataTransfer.files.length)
            props.onDropFiles(e.dataTransfer.files, folder.id);
        }}
        style={{
          backgroundColor: `hsl(${folder.hue} 28% ${isSelected ? 52 : 38}% / ${isSelected ? 0.9 : 0.55})`,
        }}
        className={`group inline-flex max-w-full cursor-pointer items-center gap-2.5 rounded-full py-2.5 pr-3 pl-4 shadow-sm shadow-black/20 transition duration-150 select-none hover:brightness-110 ${
          isSelected ? "ring-2 ring-white/70" : ""
        } ${dropping ? "scale-110 ring-2 ring-white" : ""} ${
          depth === 0 ? "text-lg font-semibold" : "text-base"
        }`}
      >
        {children.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              props.onToggle(folder.id);
            }}
            className={`text-xs opacity-70 transition hover:opacity-100 ${isOpen ? "rotate-90" : ""}`}
            aria-label={isOpen ? "Contraer" : "Expandir"}
          >
            ▶
          </button>
        )}

        {props.editingId === folder.id ? (
          <input
            autoFocus
            defaultValue={folder.name}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              props.onRename(folder.id, e.currentTarget.value.trim() || folder.name);
              props.onEdit(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") props.onEdit(null);
            }}
            className="w-36 rounded-full bg-black/25 px-2 outline-none"
          />
        ) : (
          <span className="truncate">{folder.name}</span>
        )}

        {count > 0 && (
          <span className="rounded-full bg-black/25 px-2 text-sm tabular-nums">
            {count}
          </span>
        )}

        <span className="hidden items-center gap-0.5 group-hover:inline-flex">
          <BubbleAction
            label="Subcarpeta"
            onClick={() => props.onCreateChild(folder.id)}
          >
            +
          </BubbleAction>
          {depth > 0 && (
            <BubbleAction
              label="Eliminar"
              onClick={() => {
                if (confirm(`¿Eliminar "${folder.name}" y todo su contenido?`))
                  props.onDelete(folder.id);
              }}
            >
              ×
            </BubbleAction>
          )}
        </span>
      </div>

      {isOpen && (
        <div
          className="mt-2 ml-4 flex flex-col items-start gap-2 rounded-3xl p-3"
          style={{ backgroundColor: `hsl(${folder.hue} 25% 30% / 0.3)` }}
        >
          {children.map((child) => (
            <FolderNode key={child.id} {...props} folder={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function BubbleAction({
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
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex size-6 items-center justify-center rounded-full text-base leading-none hover:bg-black/30"
    >
      {children}
    </button>
  );
}
