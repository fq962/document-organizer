"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

// En touch hay que distinguir "quiero arrastrar" de "quiero hacer scroll":
// solo se arrastra tras mantener el dedo quieto este tiempo.
export const TOUCH_HOLD_MS = 280;
// Si el dedo se mueve más que esto antes del hold, es un scroll.
export const TOUCH_SLOP = 8;

/** Atributo que marcan los elementos que aceptan documentos soltados. */
export const FOLDER_ATTR = "data-folder-id";
/** Atributo que se pone sobre el destino mientras el dedo está encima. */
const DROP_TARGET_ATTR = "data-drop-target";

/**
 * Contenedor donde montar overlays (como la gota líquida). Debe compartir
 * contexto de apilamiento con los elementos que los originan; si no, un
 * `z-index` dentro del drawer móvil nunca podría quedar sobre el overlay.
 */
export const OverlayRootContext = createContext<HTMLElement | null>(null);

/**
 * Bloquea el scroll nativo del navegador mientras `isActive()` sea true. El
 * listener tiene que ser no pasivo para poder llamar a `preventDefault`, por
 * eso no se puede usar el `onTouchMove` de React.
 */
export function useBlockTouchScroll(
  ref: React.RefObject<HTMLElement | null>,
  isActive: () => boolean,
) {
  const activeRef = useRef(isActive);
  useEffect(() => {
    activeRef.current = isActive;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (activeRef.current()) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [ref]);
}

type Press = {
  phase: "idle" | "pressing" | "dragging";
  x: number;
  y: number;
  timer?: number;
};

/**
 * Arrastrar un documento con el dedo: mantener presionado, mover y soltar
 * sobre cualquier elemento con `data-folder-id`. El mouse sigue usando el
 * drag & drop nativo de HTML, que en touch no funciona de forma fiable.
 */
export function useTouchDocDrag(
  docId: string,
  onMove: (docId: string, folderId: string) => void,
) {
  const ref = useRef<HTMLElement>(null);
  const press = useRef<Press>({ phase: "idle", x: 0, y: 0 });
  const target = useRef<HTMLElement | null>(null);
  const justDragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useBlockTouchScroll(ref, () => press.current.phase === "dragging");

  const setTarget = (el: HTMLElement | null) => {
    if (target.current === el) return;
    target.current?.removeAttribute(DROP_TARGET_ATTR);
    el?.setAttribute(DROP_TARGET_ATTR, "");
    target.current = el;
  };

  const reset = () => {
    clearTimeout(press.current.timer);
    press.current = { phase: "idle", x: 0, y: 0 };
    setTarget(null);
    setDragging(false);
  };

  useEffect(() => () => clearTimeout(press.current.timer), []);

  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" || e.button !== 0) return;
      const el = e.currentTarget;
      const pointerId = e.pointerId;
      press.current = {
        phase: "pressing",
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          press.current.phase = "dragging";
          try {
            el.setPointerCapture(pointerId);
          } catch {
            // El dedo ya se levantó.
          }
          x.jump(press.current.x);
          y.jump(press.current.y);
          setDragging(true);
          navigator.vibrate?.(10);
        }, TOUCH_HOLD_MS),
      };
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const p = press.current;
      if (p.phase === "pressing") {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TOUCH_SLOP) reset();
        return;
      }
      if (p.phase !== "dragging") return;
      x.set(e.clientX);
      y.set(e.clientY);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      setTarget(under?.closest<HTMLElement>(`[${FOLDER_ATTR}]`) ?? null);
    },
    onPointerUp() {
      if (press.current.phase === "dragging") {
        justDragged.current = true;
        const folderId = target.current?.getAttribute(FOLDER_ATTR);
        if (folderId) onMove(docId, folderId);
      }
      reset();
    },
    onPointerCancel: reset,
    // Evita el menú contextual / vista previa del long-press en móvil.
    onContextMenu(e: React.MouseEvent) {
      if (press.current.phase !== "idle") e.preventDefault();
    },
    // Al terminar un arrastre no debe dispararse el click (p. ej. abrir el link).
    onClickCapture(e: React.MouseEvent) {
      if (!justDragged.current) return;
      justDragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  /** Para cancelar el drag nativo de HTML si el dedo ya está arrastrando. */
  const isActive = () => press.current.phase !== "idle";

  return { ref, handlers, isActive, dragging, x, y };
}

/** Etiqueta que sigue al dedo mientras se arrastra un documento. */
export function TouchDragGhost({
  show,
  label,
  x,
  y,
}: {
  show: boolean;
  label: string;
  x: MotionValue<number>;
  y: MotionValue<number>;
}) {
  const sx = useSpring(x, { stiffness: 1200, damping: 50, mass: 0.3 });
  // Centrada en el dedo pero sin salirse de la pantalla (max-w-56 = 224px).
  const cx = useTransform(() =>
    Math.min(Math.max(sx.get(), 124), window.innerWidth - 124),
  );
  const sy = useSpring(y, { stiffness: 1200, damping: 50, mass: 0.3 });
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed top-0 left-0 z-[70] max-w-56 truncate rounded-full bg-[#2f3627] px-4 py-2 text-sm font-medium shadow-lg shadow-black/40 ring-1 ring-white/15"
          // Por encima del dedo, para que no lo tape.
          style={{ x: cx, y: sy, translateX: "-50%", translateY: "-150%" }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          {label}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
