"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { sharePath, type Folder } from "./types";

const COPIED_MS = 2000;

export function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}

/**
 * Botón "Compartir" del encabezado. Abre un panel para crear el enlace corto
 * de la carpeta, copiarlo o revocarlo.
 */
export function ShareFolderButton({
  folder,
  onShare,
  onUnshare,
}: {
  folder: Folder;
  onShare: (id: string) => Promise<string | null>;
  onUnshare: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shared = Boolean(folder.shareCode);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Compartir carpeta"
        aria-expanded={open}
        className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition @xl:h-auto @xl:py-2 ${
          shared ? "bg-white/20 hover:bg-white/30" : "bg-white/10 hover:bg-white/20"
        }`}
      >
        <LinkIcon className="size-4" />
        <span className="hidden @md:inline">
          {shared ? "Compartida" : "Compartir"}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <SharePanel
            // Al cambiar de carpeta el panel se reinicia.
            key={folder.id}
            folder={folder}
            onShare={onShare}
            onUnshare={onUnshare}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SharePanel({
  folder,
  onShare,
  onUnshare,
  onClose,
}: {
  folder: Folder;
  onShare: (id: string) => Promise<string | null>;
  onUnshare: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = folder.shareCode
    ? `${window.location.origin}${sharePath(folder.shareCode)}`
    : null;

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // El botón que lo abre está fuera del panel: lo excluye para que su
      // propio clic sea el que lo cierre.
      const trigger = ref.current?.parentElement;
      if (!trigger?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles: queda el texto seleccionable.
    }
  };

  const create = async () => {
    setCreating(true);
    const code = await onShare(folder.id);
    setCreating(false);
    if (code) copy(`${window.location.origin}${sharePath(code)}`);
  };

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={`Compartir ${folder.name}`}
      initial={{ opacity: 0, y: -6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className="absolute top-full right-0 z-40 mt-2 w-[min(20rem,calc(100vw-1.5rem))] origin-top-right rounded-2xl bg-[#2f3627] p-4 text-sm shadow-lg shadow-black/40 ring-1 ring-white/10"
    >
      {url ? (
        <>
          <p>
            Cualquiera con este enlace puede ver{" "}
            <span className="font-semibold">“{folder.name}”</span>, sus
            subcarpetas y documentos.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Enlace para compartir"
              className="min-w-0 flex-1 rounded-full bg-black/30 px-3 py-1.5 font-mono text-xs outline-none"
            />
            <button
              onClick={() => copy(url)}
              className="shrink-0 rounded-full bg-white/90 px-3 py-1.5 font-medium text-[#3a4230] hover:bg-white"
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => onUnshare(folder.id)}
              className="rounded-full px-3 py-1 text-red-300 hover:bg-white/10"
            >
              Dejar de compartir
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Crea un enlace corto para que cualquiera pueda ver{" "}
            <span className="font-semibold">“{folder.name}”</span> sin iniciar
            sesión. Solo podrán ver y abrir documentos, no modificarlos.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-3 py-1 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              autoFocus
              disabled={creating}
              onClick={create}
              className="rounded-full bg-white/90 px-3 py-1 font-medium text-[#3a4230] hover:bg-white disabled:opacity-60"
            >
              {creating ? "Creando…" : "Crear enlace"}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
