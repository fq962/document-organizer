"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  OverlayRootContext,
  TOUCH_HOLD_MS,
  TOUCH_SLOP,
  useBlockTouchScroll,
} from "./touch-drag";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";

// Mantener quieto este tiempo también arma la gota (con feedback visual),
// pero no hace falta esperar: arrastrar más de DRAG_START la arranca al instante.
export const HOLD_MS = 120;
const DRAG_START = 4;
// Un arrastre más corto que esto se sigue contando como clic.
const CLICK_SLOP = 8;
const DETACH_DISTANCE = 55;
// Al estar separada, hay que volver más cerca para que se "reabsorba".
const REATTACH_DISTANCE = DETACH_DISTANCE * 0.7;
const NECK_DOTS = 8;

const followSpring = { stiffness: 1600, damping: 50, mass: 0.3 };
const breakSpring = { type: "spring", stiffness: 520, damping: 11 } as const;
const joinSpring = { type: "spring", stiffness: 420, damping: 26 } as const;
const wobbleSpring = { stiffness: 180, damping: 9 };

type Phase = "idle" | "holding" | "pull" | "settle";

/** Forma de la burbuja de origen, en coordenadas de viewport. */
export type BubbleShape = { cx: number; cy: number; w: number; h: number };

/**
 * Presionar un elemento y arrastrar hacia afuera "estira" una gota.
 * Si se suelta pasada la distancia de separación, se llama a `onDetach`.
 *
 * Durante el arrastre solo se actualizan motion values: no hay re-renders de
 * React por cada movimiento del puntero.
 */
export function useLiquidPull(onDetach: () => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [detached, setDetached] = useState(false);
  const phaseRef = useRef<Phase>("idle");
  const detachedRef = useRef(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const pressed = useRef<{
    el: HTMLElement;
    pointerId: number;
    touch: boolean;
  } | null>(null);
  const ref = useRef<HTMLElement>(null);
  const maxDistance = useRef(0);
  const [shape, setShape] = useState<BubbleShape>({ cx: 0, cy: 0, w: 0, h: 0 });
  const suppressClick = useRef(false);
  const onDetachRef = useRef(onDetach);

  const pointer = { x: useMotionValue(0), y: useMotionValue(0) };
  const anchor = { x: useMotionValue(0), y: useMotionValue(0) };
  // 1 = gota unida al ancla, 0 = separada. Con resorte para que rebote.
  const neck = useMotionValue(1);
  // 0 → 1 al soltar una gota separada: se desvanece mientras nace la carpeta.
  const release = useMotionValue(0);
  // Impulso elástico de la burbuja de origen al soltar o reabsorber la gota.
  const recoil = useMotionValue(0);

  useEffect(() => {
    onDetachRef.current = onDetach;
  });

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  // Con el dedo, una vez que la gota salió el navegador no debe hacer scroll.
  useBlockTouchScroll(ref, () => phaseRef.current === "pull");

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const setAttached = (attached: boolean) => {
    detachedRef.current = !attached;
    setDetached(!attached);
    animate(neck, attached ? 1 : 0, attached ? joinSpring : breakSpring);
    recoil.jump(0);
    animate(recoil, 0, {
      type: "spring",
      stiffness: 380,
      damping: 8,
      velocity: attached ? -6 : 10,
    });
  };

  const cancelHold = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    if (phaseRef.current === "holding") go("idle");
  };

  const startPull = (current = start.current) => {
    clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    const target = pressed.current;
    if (!target || phaseRef.current !== "holding") return;
    const { el, pointerId, touch } = target;
    if (touch) navigator.vibrate?.(10);
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // El puntero ya no está activo; el pointerup lo resolverá.
    }
    // offsetWidth/Height ignoran el scale de la animación de "mantener".
    const rect = el.getBoundingClientRect();
    setShape({
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      w: el.offsetWidth,
      h: el.offsetHeight,
    });
    anchor.x.jump(start.current.x);
    anchor.y.jump(start.current.y);
    pointer.x.jump(current.x);
    pointer.y.jump(current.y);
    neck.jump(1);
    release.jump(0);
    recoil.jump(0);
    detachedRef.current = false;
    maxDistance.current = 0;
    setDetached(false);
    go("pull");
  };

  const finish = async (cancelled: boolean) => {
    pressed.current = null;
    cancelHold();
    if (phaseRef.current !== "pull") return;
    suppressClick.current = maxDistance.current > CLICK_SLOP;
    go("settle");

    if (detachedRef.current && !cancelled) {
      onDetachRef.current();
      await animate(release, 1, { duration: 0.22, ease: "easeOut" }).finished;
    } else {
      setAttached(true);
      await Promise.all([
        animate(pointer.x, anchor.x.get(), joinSpring).finished,
        animate(pointer.y, anchor.y.get(), joinSpring).finished,
      ]);
    }
    go("idle");
  };

  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0 || phaseRef.current !== "idle") return;
      if ((e.target as HTMLElement).closest("button, input")) return;
      const touch = e.pointerType !== "mouse";
      pressed.current = { el: e.currentTarget, pointerId: e.pointerId, touch };
      start.current = { x: e.clientX, y: e.clientY };
      go("holding");
      holdTimer.current = window.setTimeout(
        () => startPull(),
        touch ? TOUCH_HOLD_MS : HOLD_MS,
      );
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (phaseRef.current === "holding") {
        const moved = Math.hypot(
          e.clientX - start.current.x,
          e.clientY - start.current.y,
        );
        // Con el dedo, moverse antes del hold es scroll: se cancela. Con el
        // mouse no hay ambigüedad y el arrastre arranca al instante.
        if (pressed.current?.touch) {
          if (moved > TOUCH_SLOP) cancelHold();
        } else if (moved > DRAG_START) {
          startPull({ x: e.clientX, y: e.clientY });
        }
        return;
      }
      if (phaseRef.current !== "pull") return;
      pointer.x.set(e.clientX);
      pointer.y.set(e.clientY);
      const d = Math.hypot(
        e.clientX - anchor.x.get(),
        e.clientY - anchor.y.get(),
      );
      maxDistance.current = Math.max(maxDistance.current, d);
      if (!detachedRef.current && d > DETACH_DISTANCE) setAttached(false);
      else if (detachedRef.current && d < REATTACH_DISTANCE) setAttached(true);
    },
    onPointerUp: () => void finish(false),
    onPointerCancel: () => void finish(true),
    // Sin menú contextual ni vista previa del long-press en móvil.
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  /** Devuelve true si el click viene de terminar un arrastre y debe ignorarse. */
  const consumeClick = () => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  };

  return {
    ref,
    handlers,
    consumeClick,
    holding: phase === "holding",
    pulling: phase === "pull",
    // Mientras está activo, la burbuja real debe ocultar su fondo y quedar por
    // encima del overlay: el overlay dibuja la burbuja como parte del líquido.
    active: phase === "pull" || phase === "settle",
    overlay: {
      active: phase === "pull" || phase === "settle",
      detached,
      pointer,
      anchor,
      neck,
      release,
      recoil,
      shape,
    },
  };
}

type OverlayProps = ReturnType<typeof useLiquidPull>["overlay"] & {
  color: string;
};

export function LiquidPullOverlay(props: OverlayProps) {
  const root = useContext(OverlayRootContext);
  if (!props.active) return null;
  return createPortal(<Blob {...props} />, root ?? document.body);
}

function Blob({
  detached,
  pointer,
  anchor,
  neck,
  release,
  recoil,
  shape,
  color,
}: OverlayProps) {
  const filterId = `goo-${useId().replace(/[^\w-]/g, "")}`;
  const blobH = shape.h;
  const blobW = Math.min(shape.w, shape.h * 2.6);

  // La gota sigue al puntero con un pequeño retraso elástico.
  const x = useSpring(pointer.x, followSpring);
  const y = useSpring(pointer.y, followSpring);

  // Velocidad suavizada con un resorte flojo: al frenar, la gota sigue
  // deformándose un instante y tiembla como gelatina antes de asentarse.
  const vx = useSpring(useVelocity(x), wobbleSpring);
  const vy = useSpring(useVelocity(y), wobbleSpring);

  const stretch = useTransform(() => {
    const d = Math.hypot(x.get() - anchor.x.get(), y.get() - anchor.y.get());
    return Math.min(d / DETACH_DISTANCE, 1);
  });
  // `neck` rebota por debajo de 0 al romperse; para tamaños se recorta.
  const attached = useTransform(() => clamp(neck.get(), 0, 1));

  // Punto del borde de la burbuja por donde sale el cuello: se lanza un rayo
  // desde donde se agarró hacia la gota y se corta con el contorno.
  const edge = useTransform(() => {
    const ax = anchor.x.get();
    const ay = anchor.y.get();
    const dx = x.get() - ax;
    const dy = y.get() - ay;
    const left = shape.cx - shape.w / 2;
    const top = shape.cy - shape.h / 2;
    const tx =
      dx > 0
        ? (left + shape.w - ax) / dx
        : dx < 0
          ? (left - ax) / dx
          : Infinity;
    const ty =
      dy > 0 ? (top + shape.h - ay) / dy : dy < 0 ? (top - ay) / dy : Infinity;
    // Un poco hacia adentro para que la raíz quede fundida con la burbuja.
    const t = clamp(
      Math.min(tx, ty) - 6 / Math.max(Math.hypot(dx, dy), 1),
      0,
      1,
    );
    return { x: ax + dx * t, y: ay + dy * t };
  });
  const edgeX = useTransform(() => edge.get().x);
  const edgeY = useTransform(() => edge.get().y);

  // Abultamiento en el borde: la burbuja "empuja" líquido hacia afuera.
  const bulgeR = useTransform(
    () => shape.h * 0.42 * Math.min(stretch.get() * 2.5, 1) * attached.get(),
  );

  // Pegada es una gota redonda; al separarse se transforma en píldora. El
  // rebote de `neck` hace que la transformación se pase y vuelva (gelatina).
  const morph = useTransform(() => clamp(1 - neck.get(), -0.35, 1.35));
  const drop = useTransform(() => shape.h * (0.5 + 0.5 * stretch.get()));
  const width = useTransform(() => {
    const d = drop.get();
    return (
      Math.max(d + (blobW - d) * morph.get(), 4) * (1 + 0.3 * release.get())
    );
  });
  const height = useTransform(() => {
    const d = drop.get();
    return (
      Math.max(d + (blobH - d) * morph.get(), 4) * (1 + 0.3 * release.get())
    );
  });
  const rectX = useTransform(() => -width.get() / 2);
  const rectY = useTransform(() => -height.get() / 2);
  const rx = useTransform(() => Math.min(width.get(), height.get()) / 2);
  const opacity = useTransform(() => 1 - release.get());

  // Deformación tipo squash & stretch: se estira a lo largo de un vector que
  // combina la velocidad y la tensión del cuello, y se aplasta en perpendicular.
  const blobTransform = useTransform(() => {
    const bx = x.get();
    const by = y.get();
    let tx = vx.get() / 2200;
    let ty = vy.get() / 2200;
    const nx = edgeX.get() - bx;
    const ny = edgeY.get() - by;
    const nLen = Math.hypot(nx, ny);
    if (nLen > 0) {
      const tension = 0.3 * stretch.get() * attached.get();
      tx += (nx / nLen) * tension;
      ty += (ny / nLen) * tension;
    }
    const mag = Math.hypot(tx, ty);
    if (mag < 1e-3) return `translate(${bx} ${by})`;
    const ux = tx / mag;
    const uy = ty / mag;
    const s = 1 + Math.min(mag, 0.5);
    const q = 1 / s;
    const a = s * ux * ux + q * uy * uy;
    const b = (s - q) * ux * uy;
    const d = s * uy * uy + q * ux * ux;
    return `matrix(${a} ${b} ${b} ${d} ${bx} ${by})`;
  });
  const blobRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const apply = (v: string) => blobRef.current?.setAttribute("transform", v);
    apply(blobTransform.get());
    return blobTransform.on("change", apply);
  }, [blobTransform]);

  const bubbleScaleX = useTransform(() => 1 - 0.03 * recoil.get());
  const bubbleScaleY = useTransform(() => 1 + 0.06 * recoil.get());

  const labelX = useTransform(() => x.get() - blobW / 2);
  const labelY = useTransform(() => y.get() - blobH / 2);

  return (
    <div className="pointer-events-none fixed inset-0 z-50" aria-hidden>
      <svg className="absolute inset-0 size-full overflow-visible">
        <defs>
          {/* Región relativa al bbox de las gotas: el filtro no cubre toda la pantalla. */}
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`} fill={color}>
          {/* La burbuja misma forma parte del líquido: el cuello sale de su borde. */}
          <motion.g style={{ scaleX: bubbleScaleX, scaleY: bubbleScaleY }}>
            <rect
              x={shape.cx - shape.w / 2}
              y={shape.cy - shape.h / 2}
              width={shape.w}
              height={shape.h}
              rx={shape.h / 2}
            />
          </motion.g>
          <motion.circle cx={edgeX} cy={edgeY} r={bulgeR} />
          {Array.from({ length: NECK_DOTS }, (_, i) => (
            <NeckDot
              key={i}
              f={(i + 1) / (NECK_DOTS + 1)}
              x={x}
              y={y}
              edgeX={edgeX}
              edgeY={edgeY}
              stretch={stretch}
              attached={attached}
              rootR={shape.h * 0.42}
              tipR={shape.h * 0.3}
            />
          ))}
          <g ref={blobRef}>
            <motion.rect
              x={rectX}
              y={rectY}
              width={width}
              height={height}
              rx={rx}
              style={{ opacity }}
            />
          </g>
        </g>
      </svg>

      <AnimatePresence>
        {detached && (
          <motion.div
            key="label"
            className="absolute top-0 left-0 flex items-center justify-center text-sm font-medium"
            style={{ x: labelX, y: labelY, width: blobW, height: blobH }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
          >
            + Nueva
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Cuello de la gota: puntos entre el borde de la burbuja y la gota. Se
// adelgazan en el centro al estirar, y cada uno sigue su posición con un
// resorte propio (más flojo en el medio), así el cuello se curva y ondula al
// mover el puntero. Al romperse, cada mitad se retrae hacia su extremo.
function NeckDot({
  f,
  x,
  y,
  edgeX,
  edgeY,
  stretch,
  attached,
  rootR,
  tipR,
}: {
  f: number;
  x: MotionValue<number>;
  y: MotionValue<number>;
  edgeX: MotionValue<number>;
  edgeY: MotionValue<number>;
  stretch: MotionValue<number>;
  attached: MotionValue<number>;
  rootR: number;
  tipR: number;
}) {
  const along = useTransform(() => {
    const a = attached.get();
    return f < 0.5 ? f * a : 1 - (1 - f) * a;
  });
  const spring = {
    stiffness: 260 + 900 * Math.abs(2 * f - 1),
    damping: 14,
    mass: 0.5,
  };
  const cx = useSpring(
    useTransform(() => edgeX.get() + (x.get() - edgeX.get()) * along.get()),
    spring,
  );
  const cy = useSpring(
    useTransform(() => edgeY.get() + (y.get() - edgeY.get()) * along.get()),
    spring,
  );
  const r = useTransform(() => {
    const pinch = 0.25 + 0.5 * stretch.get();
    const base = rootR + (tipR - rootR) * f;
    return (
      Math.max(base * (1 - pinch * Math.sin(Math.PI * f)), 0) * attached.get()
    );
  });
  return <motion.circle cx={cx} cy={cy} r={r} />;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}
