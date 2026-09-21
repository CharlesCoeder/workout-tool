import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { DemoState, PlannedExercise } from '../engine/types';
import { Demo, applyDemoCommand, onDemoProgress } from '../ui/Demo';

/**
 * One demo player per exercise, mounted once and *moved* between the side column and the
 * full-screen stage rather than re-created in each of them.
 *
 * A YouTube iframe restarts the moment React unmounts it, so the old arrangement — a
 * player in every screen that wanted one — meant the clip jumped back to the start every
 * time the rest screen became the set screen, or "Demo video" put it on the stage. Here
 * the screens only say *where* the clip should be, by rendering a `DemoSlot`; the player
 * itself lives in a fixed-position box that animates onto whichever slot is showing. When
 * no screen wants it (a set is running) the player is parked, paused and invisible, so
 * bringing it back picks up exactly where you were.
 */

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type SlotKind = 'dock' | 'stage';
type Slots = { dock: HTMLElement | null; stage: HTMLElement | null };

/**
 * Registering is kept in its own context, and its function never changes identity: a
 * callback ref that changed whenever a slot registered would detach and re-attach on
 * every render, which is an infinite loop.
 */
const RegisterCtx = createContext<((kind: SlotKind, el: HTMLElement | null) => void) | null>(null);
const SlotsCtx = createContext<Slots>({ dock: null, stage: null });

export function DemoSlots({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Slots>({ dock: null, stage: null });
  const register = useCallback((kind: SlotKind, el: HTMLElement | null) => {
    setSlots((s) => (s[kind] === el ? s : { ...s, [kind]: el }));
  }, []);
  return (
    <RegisterCtx.Provider value={register}>
      <SlotsCtx.Provider value={slots}>{children}</SlotsCtx.Provider>
    </RegisterCtx.Provider>
  );
}

/** The space the clip should occupy on this screen. Renders an empty frame; the player flies to it. */
export function DemoSlot({ kind = 'dock', className = '' }: { kind?: SlotKind; className?: string }) {
  const register = useContext(RegisterCtx);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      register?.(kind, el);
    },
    [register, kind],
  );
  return <div className={`demo demo-slot ${className}`} ref={ref} aria-hidden />;
}

const same = (a: Rect | null, b: Rect) =>
  !!a && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/** The player itself. Rendered once, at the root of the TV page. */
export function DemoPlayer({ ex, demo }: { ex: PlannedExercise; demo: DemoState }) {
  const slots = useContext(SlotsCtx);
  const shown = demo.shown || demo.enlarged;
  const target = (demo.enlarged ? slots.stage : null) ?? slots.dock;
  const [rect, setRect] = useState<Rect | null>(null);
  const placed = useRef(false);

  // Follow the slot: it moves when the screen changes, when the stage opens, and when the
  // TV is resized. Cheap enough to re-measure on a slow timer as a backstop for layout
  // that settles after a transition.
  const targetRef = useRef(target);
  targetRef.current = target;
  useLayoutEffect(() => {
    const measure = () => {
      const el = targetRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      setRect((prev) => (same(prev, r) ? prev : { left: r.left, top: r.top, width: r.width, height: r.height }));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const timer = setInterval(measure, 500);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (target && ro) ro.observe(target);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [target]);

  // Parking pauses the clip; unparking resumes it, unless it was you who paused it.
  const playing = useRef(true);
  useEffect(() => onDemoProgress((p) => { if (p) playing.current = p.playing; }), []);
  const wasPlaying = useRef(true);
  const prevShown = useRef(shown);
  useEffect(() => {
    if (prevShown.current === shown) return;
    prevShown.current = shown;
    if (!shown) {
      wasPlaying.current = playing.current;
      if (playing.current) applyDemoCommand({ type: 'pause' });
    } else if (wasPlaying.current) {
      applyDemoCommand({ type: 'play' });
    }
  }, [shown]);

  if (!rect) return null;
  const first = !placed.current;
  placed.current = true;
  const style: CSSProperties = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    opacity: shown ? 1 : 0,
    transition: first ? 'none' : undefined,
  };
  return (
    <div className="demo-layer" style={style} aria-hidden={!shown}>
      <Demo demo={ex.demo} rate={demo.rate} muted={demo.muted} volume={demo.volume} captions={demo.captions} primary />
    </div>
  );
}
