"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HOLD_MS, LiquidPullOverlay, useLiquidPull } from "./liquid-pull";
import {
  FOLDER_ATTR,
  OverlayRootContext,
  TouchDragGhost,
  useTouchDocDrag,
} from "./touch-drag";
import type { CurrentUser } from "@/lib/auth";
import {
  byPinned,
  DOC_DRAG_TYPE,
  splitName,
  type Doc,
  type Folder,
} from "./types";
import { LinkIcon } from "./share-folder";
import { UserMenu } from "./user-menu";

type Props = {
  folders: Folder[];
  docs: Doc[];
  rootId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: (parentId: string, hue?: number) => string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDropFiles: (files: FileList, folderId: string) => void;
  onMoveDoc: (docId: string, folderId: string) => void;
};

type SidebarProps = Props & {
  user: CurrentUser;
  /** Solo en móvil: la barra es un drawer que se abre sobre el contenido. */
  mobileOpen: boolean;
  onClose: () => void;
};

const NO_CHILDREN: Folder[] = [];
const NO_DOCS: Doc[] = [];

const WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 220;
const MAX_WIDTH = 640;
const clampWidth = (w: number) => Math.min(Math.max(w, MIN_WIDTH), MAX_WIDTH);

/**
 * Ancho ajustable arrastrando el borde. Se aplica directo al DOM (sin estado
 * de React) para no re-renderizar el árbol en cada movimiento, y se guarda en
 * localStorage al soltar.
 */
function useResizableWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);

  const apply = (width: number) => {
    const w = clampWidth(width);
    // Variable CSS: el ancho solo aplica en desktop (`md:w-(--sidebar-w)`).
    ref.current?.style.setProperty("--sidebar-w", `${w}px`);
    handleRef.current?.setAttribute("aria-valuenow", String(w));
    return w;
  };
  const save = () => {
    if (ref.current)
      localStorage.setItem(WIDTH_KEY, String(ref.current.offsetWidth));
  };

  useEffect(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (saved) apply(saved);
  }, []);

  const handleProps = {
    ref: handleRef,
    role: "separator",
    "aria-orientation": "vertical" as const,
    "aria-label": "Ajustar ancho de la barra lateral",
    "aria-valuemin": MIN_WIDTH,
    "aria-valuemax": MAX_WIDTH,
    tabIndex: 0,
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      if (e.button !== 0 || !ref.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, width: ref.current.offsetWidth };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      if (drag.current) apply(drag.current.width + e.clientX - drag.current.x);
    },
    onPointerUp() {
      if (!drag.current) return;
      drag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      save();
    },
    onDoubleClick() {
      apply(DEFAULT_WIDTH);
      save();
    },
    onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
      const step = e.shiftKey ? 64 : 16;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = ref.current?.offsetWidth ?? DEFAULT_WIDTH;
      apply(current + (e.key === "ArrowRight" ? step : -step));
      save();
    },
  };

  return { ref, handleProps };
}

export function FolderSidebar({
  folders,
  docs,
  rootId,
  onCreate,
  user,
  mobileOpen,
  onClose,
  ...actions
}: SidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([rootId]),
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  // Índices calculados una sola vez por cambio, en lugar de filtrar en cada nodo.
  const childrenOf = useMemo(() => {
    const map = new Map<string, Folder[]>();
    for (const f of folders) {
      if (!f.parentId) continue;
      const list = map.get(f.parentId);
      if (list) list.push(f);
      else map.set(f.parentId, [f]);
    }
    for (const list of map.values()) list.sort(byPinned);
    return map;
  }, [folders]);

  const docsOf = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const d of docs) {
      const list = map.get(d.folderId);
      if (list) list.push(d);
      else map.set(d.folderId, [d]);
    }
    return map;
  }, [docs]);

  // Documentos de cada carpeta contando todas sus subcarpetas.
  const totalOf = useMemo(() => {
    const map = new Map<string, number>();
    const visit = (id: string): number => {
      let total = docsOf.get(id)?.length ?? 0;
      for (const child of childrenOf.get(id) ?? []) total += visit(child.id);
      map.set(id, total);
      return total;
    };
    visit(rootId);
    return map;
  }, [childrenOf, docsOf, rootId]);

  const toggle = useCallback(
    (id: string, open?: boolean) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (open ?? !next.has(id)) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );

  const create = useCallback(
    (parentId: string, hue?: number) => {
      const id = onCreate(parentId, hue);
      toggle(parentId, true);
      setEditingId(id);
    },
    [onCreate, toggle],
  );

  const root = folders.find((f) => f.id === rootId)!;
  const { ref: widthRef, handleProps } = useResizableWidth();
  // Los overlays (gota líquida) se montan dentro de la barra para compartir su
  // contexto de apilamiento; ver OverlayRootContext.
  const [overlayRoot, setOverlayRoot] = useState<HTMLDivElement | null>(null);
  const setRoot = useCallback(
    (el: HTMLDivElement | null) => {
      widthRef.current = el;
      setOverlayRoot(el);
    },
    [widthRef],
  );

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden
          />
        )}
      </AnimatePresence>
      {/* Mobile first: drawer fijo fuera de pantalla; en md+ columna ajustable. */}
      <div
        ref={setRoot}
        style={{ "--sidebar-w": `${DEFAULT_WIDTH}px` } as React.CSSProperties}
        className={`fixed inset-y-0 left-0 z-40 flex w-[85vw] max-w-80 bg-[#4d5740] shadow-2xl shadow-black/40 transition-transform duration-300 ease-out md:relative md:z-10 md:w-(--sidebar-w) md:max-w-[60vw] md:shrink-0 md:translate-none md:bg-transparent md:shadow-none md:transition-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <OverlayRootContext value={overlayRoot}>
          <aside className="flex w-full min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain border-r border-white/10 bg-black/15 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Carpetas</h1>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => create(actions.selectedId)}
                  className="rounded-full bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20 md:px-3 md:py-1"
                  title="Nueva carpeta dentro de la seleccionada"
                >
                  + Nueva
                </button>
                <button
                  onClick={onClose}
                  aria-label="Cerrar carpetas"
                  className="flex size-10 items-center justify-center rounded-full text-xl hover:bg-white/10 md:hidden"
                >
                  ×
                </button>
              </div>
            </div>
            <FolderNode
              {...actions}
              folder={root}
              depth={0}
              childrenOf={childrenOf}
              docsOf={docsOf}
              totalOf={totalOf}
              expanded={expanded}
              editingId={editingId}
              onToggle={toggle}
              onEdit={setEditingId}
              onCreateChild={create}
            />
            <UserMenu user={user} />
          </aside>
        </OverlayRootContext>
        <div
          {...handleProps}
          className="group absolute inset-y-0 -right-1.5 z-10 hidden w-3 cursor-col-resize justify-center outline-none md:flex"
        >
          <div className="h-full w-0.5 bg-white/0 transition-colors group-hover:bg-white/30 group-focus-visible:bg-white/50 group-active:bg-white/50" />
        </div>
      </div>
    </>
  );
}

type NodeProps = Omit<Props, "folders" | "docs" | "rootId" | "onCreate"> & {
  folder: Folder;
  depth: number;
  childrenOf: Map<string, Folder[]>;
  docsOf: Map<string, Doc[]>;
  totalOf: Map<string, number>;
  expanded: Set<string>;
  editingId: string | null;
  onToggle: (id: string, open?: boolean) => void;
  onEdit: (id: string | null) => void;
  onCreateChild: (parentId: string, hue?: number) => void;
};

const FolderNode = memo(function FolderNode(props: NodeProps) {
  const { folder, depth, childrenOf, docsOf, expanded, selectedId } = props;
  const [dropping, setDropping] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const liquid = useLiquidPull(
    // Nace de la gota, así que hereda el color de la burbuja de origen.
    () => props.onCreateChild(folder.id, folder.hue),
  );

  const children = childrenOf.get(folder.id) ?? NO_CHILDREN;
  const folderDocs = docsOf.get(folder.id) ?? NO_DOCS;
  const hasContent = children.length > 0 || folderDocs.length > 0;
  const isOpen = expanded.has(folder.id) && hasContent;
  const isSelected = selectedId === folder.id;
  const isEditing = props.editingId === folder.id;
  const count = folderDocs.length;
  // Opaco a propósito: el filtro líquido trabaja sobre el canal alfa, así que
  // la burbuja y la gota tienen que tener exactamente el mismo color sólido.
  const color = `hsl(${folder.hue} ${isSelected ? "26% 48%" : "20% 36%"})`;

  const acceptsDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(DOC_DRAG_TYPE) ||
    e.dataTransfer.types.includes("Files");

  return (
    <div className="w-full">
      <div className="relative inline-flex max-w-full min-w-0">
        <motion.div
          ref={liquid.ref as React.RefObject<HTMLDivElement>}
          {...liquid.handlers}
          {...{ [FOLDER_ATTR]: folder.id }}
          onClick={() => {
            if (!liquid.consumeClick()) props.onSelect(folder.id);
          }}
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
            // Se abre para que se vea dónde quedó lo que se soltó.
            props.onToggle(folder.id, true);
          }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{
            scale: dropping ? 1.1 : liquid.holding ? 1.06 : 1,
            opacity: 1,
          }}
          transition={
            liquid.holding
              ? { duration: HOLD_MS / 1000, ease: "easeOut" }
              : { type: "spring", stiffness: 500, damping: 22 }
          }
          style={{
            backgroundColor: liquid.active ? "transparent" : color,
            WebkitTouchCallout: "none",
          }}
          className={`group inline-flex max-w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-full py-2.5 pr-3 pl-4 transition-[filter,box-shadow] select-none ${
            liquid.active
              ? "relative z-[60]"
              : "shadow-sm shadow-black/20 hover:brightness-110"
          } ${
            dropping ? "ring-2 ring-white/70" : ""
          } data-drop-target:ring-2 data-drop-target:ring-white/70 ${depth === 0 ? "text-lg font-semibold" : "text-base"}`}
        >
          {hasContent && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                props.onToggle(folder.id);
              }}
              // Área de toque más grande que el ícono.
              className={`-m-2 shrink-0 p-2 text-xs opacity-70 transition hover:opacity-100 ${isOpen ? "rotate-90" : ""}`}
              aria-label={isOpen ? "Contraer" : "Expandir"}
            >
              ▶
            </button>
          )}

          {isEditing ? (
            <input
              autoFocus
              defaultValue={folder.name}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                props.onRename(
                  folder.id,
                  e.currentTarget.value.trim() || folder.name,
                );
                props.onEdit(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") props.onEdit(null);
              }}
              // Crece con el texto pero nunca más allá de la burbuja.
              className="field-sizing-content max-w-full min-w-16 flex-1 rounded-full bg-black/25 px-2 outline-none"
            />
          ) : (
            <span className="truncate" title={folder.name}>
              {folder.name}
            </span>
          )}

          {folder.pinnedAt && (
            // Mientras se ven las acciones, el botón de desfijar ya lo indica.
            <span
              title="Fijada"
              className={`shrink-0 opacity-75 group-hover:hidden ${
                isSelected ? "pointer-coarse:hidden" : ""
              }`}
            >
              <PinIcon filled className="size-3.5" />
              <span className="sr-only">(fijada)</span>
            </span>
          )}

          {folder.shareCode && (
            <span title="Compartida por enlace" className="shrink-0 opacity-75">
              <LinkIcon className="size-3.5" />
              <span className="sr-only">(compartida)</span>
            </span>
          )}

          {count > 0 && (
            <span className="shrink-0 rounded-full bg-black/25 px-2 text-sm tabular-nums">
              {count}
            </span>
          )}

          {/* Mientras se renombra no hay acciones: el input usa todo el ancho. */}
          {!isEditing && (
            // Sin hover en touch: las acciones se ven en la carpeta seleccionada.
            <span
              className={`hidden shrink-0 items-center gap-0.5 group-hover:inline-flex ${
                isSelected ? "pointer-coarse:inline-flex" : ""
              }`}
            >
              {depth > 0 && (
                <BubbleAction
                  label={folder.pinnedAt ? "Desfijar" : "Fijar"}
                  onClick={() => props.onTogglePin(folder.id)}
                >
                  <PinIcon filled={Boolean(folder.pinnedAt)} />
                </BubbleAction>
              )}
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
                    // Solo se confirma si hay documentos que se perderían.
                    if (props.totalOf.get(folder.id)) setConfirmingDelete(true);
                    else props.onDelete(folder.id);
                  }}
                >
                  ×
                </BubbleAction>
              )}
            </span>
          )}
        </motion.div>

        <AnimatePresence>
          {confirmingDelete && (
            <DeleteConfirm
              name={folder.name}
              docCount={props.totalOf.get(folder.id) ?? 0}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={() => {
                setConfirmingDelete(false);
                props.onDelete(folder.id);
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <LiquidPullOverlay {...liquid.overlay} color={color} />

      {isOpen && (
        <div
          className="mt-2 ml-3 flex flex-col items-start gap-2 rounded-3xl p-2"
          style={{ backgroundColor: `hsl(${folder.hue} 25% 30% / 0.3)` }}
        >
          {children.map((child) => (
            <FolderNode
              key={child.id}
              {...props}
              folder={child}
              depth={depth + 1}
            />
          ))}
          {folderDocs.length > 0 && (
            <ul className="flex w-full min-w-0 flex-col">
              {folderDocs.map((doc) => (
                <DocItem
                  key={doc.id}
                  doc={doc}
                  onClick={() => props.onSelect(folder.id)}
                  onMove={props.onMoveDoc}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});

function PinIcon({
  filled = false,
  className = "size-4",
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
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
      className="flex size-6 items-center justify-center rounded-full text-base leading-none hover:bg-black/30 pointer-coarse:size-8"
    >
      {children}
    </button>
  );
}

function DeleteConfirm({
  name,
  docCount,
  onCancel,
  onConfirm,
}: {
  name: string;
  docCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCancel();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onCancel]);

  return (
    <motion.div
      ref={ref}
      role="alertdialog"
      aria-label={`Eliminar ${name}`}
      initial={{ opacity: 0, y: -6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="absolute top-full left-0 z-40 mt-2 w-60 origin-top-left rounded-2xl bg-[#2f3627] p-4 shadow-lg shadow-black/40 ring-1 ring-white/10"
    >
      <p className="text-sm">
        <span className="font-semibold">“{name}”</span> tiene {docCount}{" "}
        {docCount === 1 ? "documento" : "documentos"}. Se eliminará todo su
        contenido.
      </p>
      <div className="mt-3 flex justify-end gap-2 text-sm">
        <button
          autoFocus
          onClick={onCancel}
          className="rounded-full px-3 py-1 hover:bg-white/10"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          className="rounded-full bg-red-400/90 px-3 py-1 font-medium text-black hover:bg-red-400"
        >
          Eliminar
        </button>
      </div>
    </motion.div>
  );
}

function DocItem({
  doc,
  onClick,
  onMove,
}: {
  doc: Doc;
  onClick: () => void;
  onMove: (docId: string, folderId: string) => void;
}) {
  const { base, ext } = splitName(doc.name);
  const { ref, handlers, isActive, dragging, x, y } = useTouchDocDrag(
    doc.id,
    onMove,
  );
  return (
    <li
      ref={ref as React.RefObject<HTMLLIElement>}
      {...handlers}
      draggable
      onDragStart={(e) => {
        if (isActive()) return e.preventDefault();
        e.dataTransfer.setData(DOC_DRAG_TYPE, doc.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onClick}
      title={doc.name}
      style={{ WebkitTouchCallout: "none" }}
      className={`flex w-full min-w-0 cursor-grab items-baseline rounded-full px-3 py-1 text-sm transition select-none hover:bg-white/10 hover:opacity-100 active:cursor-grabbing pointer-coarse:py-2 ${
        dragging ? "opacity-40" : "opacity-80"
      }`}
    >
      {/* La extensión nunca se corta: solo el nombre se trunca. */}
      <span className="truncate">{base}</span>
      {ext && <span className="shrink-0 opacity-55">.{ext}</span>}
      <TouchDragGhost show={dragging} label={doc.name} x={x} y={y} />
    </li>
  );
}
