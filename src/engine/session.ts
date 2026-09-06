import type { Action, DemoState, Phase, PlannedExercise, SessionState, SetResult, WarmupStep } from './types';
import { loadingDistance } from './plates';

export interface SessionOptions {
  readySec: number;
  rerackBonusSec: number;
}

export const DEFAULT_OPTIONS: SessionOptions = { readySec: 20, rerackBonusSec: 30 };

export const DEFAULT_DEMO: DemoState = { enlarged: false, rate: 1, muted: false, seq: 0, cmd: null };

// ---------- Creation ----------

export function createSession(
  args: { id: string; dayId: string; dayName: string; warmup: WarmupStep[]; exercises: PlannedExercise[] },
  now: number,
): SessionState {
  const warmup = args.warmup.filter((w) => w.seconds > 0);
  const phase: Phase = warmup.length
    ? { kind: 'warmup', step: 0, endsAt: now + warmup[0].seconds * 1000 }
    : { kind: 'ready', endsAt: now + DEFAULT_OPTIONS.readySec * 1000 };
  return {
    id: args.id,
    dayId: args.dayId,
    dayName: args.dayName,
    startedAt: now,
    warmup,
    exercises: args.exercises,
    cursor: { ex: 0, set: 0 },
    phase,
    paused: null,
    demo: DEFAULT_DEMO,
    rev: 0,
  };
}

// ---------- Helpers ----------

export function currentExercise(s: SessionState): PlannedExercise | undefined {
  return s.exercises[s.cursor.ex];
}

export function isTimed(p: Phase): p is Extract<Phase, { endsAt: number }> {
  return p.kind === 'warmup' || p.kind === 'ready' || p.kind === 'rest';
}

export function remainingMs(s: SessionState, now: number): number {
  if (s.paused) return s.paused.remainingMs ?? 0;
  return isTimed(s.phase) ? Math.max(0, s.phase.endsAt - now) : 0;
}

export function isDone(s: SessionState): boolean {
  return s.phase.kind === 'summary';
}

/** When something last happened in the session: a set logged, or its start. */
export function lastActivityAt(s: SessionState): number {
  let t = s.endedAt ?? s.startedAt;
  for (const e of s.exercises) for (const r of e.results) if (r.at > t) t = r.at;
  return t;
}

/** A session nobody has touched for this long was abandoned, not paused. */
export const STALE_SESSION_MS = 3 * 60 * 60 * 1000;

export function isStale(s: SessionState, now: number): boolean {
  return s.phase.kind !== 'summary' && now - lastActivityAt(s) > STALE_SESSION_MS;
}

/** Rack loading needed for an exercise (per-end plates), for change detection. */
function perEndOf(ex: PlannedExercise | undefined): number[] | null {
  if (!ex || ex.load === 'bodyweight' || !ex.loading) return null;
  return ex.loading.perEnd;
}

/** Does moving from exercise a to exercise b require touching plates? */
export function needsRerack(a: PlannedExercise | undefined, b: PlannedExercise | undefined): boolean {
  const pa = perEndOf(a);
  const pb = perEndOf(b);
  if (!pb) return false; // bodyweight next: nothing to load
  if (!pa) return true; // coming from bodyweight/nothing: must load
  if (a!.load !== b!.load) return true; // pair <-> single always moves plates
  return loadingDistance(pa, pb) > 0;
}

/** The most recently logged set in the whole session (by timestamp), or null. */
export function lastLoggedSet(s: SessionState): { ex: number; set: number; result: SetResult } | null {
  let best: { ex: number; set: number; result: SetResult } | null = null;
  s.exercises.forEach((e, ex) => {
    e.results.forEach((result, set) => {
      if (!best || result.at > best.result.at || (result.at === best.result.at && ex >= best.ex)) best = { ex, set, result };
    });
  });
  return best;
}

function nextIncompleteExercise(s: SessionState, from: number): number {
  for (let i = from; i < s.exercises.length; i++) {
    const e = s.exercises[i];
    if (!e.skipped && e.results.length < e.sets) return i;
  }
  return -1;
}

/** Enter the working phase; the enlarged demo gets out of the way. */
function toWorking(s: SessionState): SessionState {
  return { ...s, phase: { kind: 'working' }, demo: s.demo.enlarged ? { ...s.demo, enlarged: false } : s.demo };
}

// ---------- Settle: roll time forward through expired timers (pure) ----------

export function settle(s: SessionState, now: number, opts: SessionOptions = DEFAULT_OPTIONS): SessionState {
  if (s.paused) return s;
  let state = s;
  for (let guard = 0; guard < 100; guard++) {
    const p = state.phase;
    if (p.kind === 'warmup' && now >= p.endsAt) {
      const next = p.step + 1;
      if (next < state.warmup.length) {
        state = { ...state, phase: { kind: 'warmup', step: next, endsAt: p.endsAt + state.warmup[next].seconds * 1000 } };
      } else {
        state = { ...state, phase: { kind: 'ready', endsAt: p.endsAt + opts.readySec * 1000 } };
      }
      continue;
    }
    if ((p.kind === 'ready' || p.kind === 'rest') && now >= p.endsAt) {
      state = toWorking(state);
      continue;
    }
    break;
  }
  return state;
}

// ---------- Reducer ----------

export function reduce(prev: SessionState, action: Action, now: number, opts: SessionOptions = DEFAULT_OPTIONS): SessionState {
  const s = settle(prev, now, opts);
  const next = apply(s, action, now, opts);
  return next === s ? s : { ...next, rev: s.rev + 1 };
}

function finish(s: SessionState, now: number): SessionState {
  return { ...s, phase: { kind: 'summary' }, paused: null, endedAt: now };
}

function startRest(s: SessionState, now: number, opts: SessionOptions, fromEx: PlannedExercise | undefined): SessionState {
  const ex = currentExercise(s);
  if (!ex) return finish(s, now);
  const rerack = fromEx !== ex && needsRerack(fromEx, ex);
  const base = fromEx?.restSec ?? ex.restSec;
  const durationSec = base + (rerack ? opts.rerackBonusSec : 0);
  return { ...s, phase: { kind: 'rest', endsAt: now + durationSec * 1000, durationSec, rerack } };
}

/** Advance cursor to the next set / exercise after the current set was logged. */
function advance(s: SessionState, now: number, opts: SessionOptions): SessionState {
  const ex = currentExercise(s)!;
  if (s.cursor.set + 1 < ex.sets) {
    const moved = { ...s, cursor: { ex: s.cursor.ex, set: s.cursor.set + 1 } };
    return startRest(moved, now, opts, ex);
  }
  const nextEx = nextIncompleteExercise(s, s.cursor.ex + 1);
  if (nextEx < 0) return finish(s, now);
  const moved = { ...s, cursor: { ex: nextEx, set: s.exercises[nextEx].results.length } };
  return startRest(moved, now, opts, ex);
}

/** Corrections and notes are allowed in every phase, including summary and while paused. */
function correct(s: SessionState, a: Action): SessionState | null {
  switch (a.type) {
    case 'editSet': {
      const ex = s.exercises[a.ex];
      const r = ex?.results[a.set];
      if (!r) return s;
      const reps = Math.max(0, Math.round(a.reps));
      if (reps === r.reps) return s;
      const results = ex.results.map((x, i) => (i === a.set ? { ...x, reps } : x));
      return { ...s, exercises: s.exercises.map((e, i) => (i === a.ex ? { ...e, results } : e)) };
    }
    case 'note': {
      const text = a.text.trim();
      const note = text ? text : undefined;
      if (a.ex === undefined) {
        if ((s.note ?? undefined) === note) return s;
        const { note: _old, ...rest } = s;
        return note ? { ...rest, note } : rest;
      }
      const ex = s.exercises[a.ex];
      if (!ex || (ex.note ?? undefined) === note) return s;
      const exercises = s.exercises.map((e, i) => {
        if (i !== a.ex) return e;
        const { note: _old, ...rest } = e;
        return note ? { ...rest, note } : rest;
      });
      return { ...s, exercises };
    }
    case 'undoSet': {
      const last = lastLoggedSet(s);
      if (!last) return s;
      const exercises = s.exercises.map((e, i) =>
        i === last.ex ? { ...e, results: e.results.filter((_, k) => k !== last.set), skipped: undefined } : e,
      );
      // Back to that set, ready to log it again. A summary re-opens; a paused timer is dropped
      // (the working phase has none) but the session stays paused.
      const { endedAt: _ended, ...rest } = s;
      return {
        ...rest,
        exercises,
        cursor: { ex: last.ex, set: last.set },
        phase: { kind: 'working' },
        paused: s.paused ? { remainingMs: null } : null,
        demo: s.demo.enlarged ? { ...s.demo, enlarged: false } : s.demo,
      };
    }
    default:
      return null;
  }
}

function apply(s: SessionState, a: Action, now: number, opts: SessionOptions): SessionState {
  const p = s.phase;
  const corrected = correct(s, a);
  if (corrected) return corrected;
  if (p.kind === 'summary' && a.type !== 'endSession') return s;

  // Pause / resume work in any phase.
  if (a.type === 'pause') {
    if (s.paused) return s;
    const rem = isTimed(p) ? Math.max(0, p.endsAt - now) : null;
    return { ...s, paused: { remainingMs: rem } };
  }
  if (a.type === 'resume') {
    if (!s.paused) return s;
    const rem = s.paused.remainingMs;
    const phase: Phase = isTimed(p) && rem !== null ? { ...p, endsAt: now + rem } : p;
    return { ...s, paused: null, phase };
  }
  // Demo controls work while paused too: that is exactly when you want to study the clip.
  if (a.type === 'showDemo') return s.demo.enlarged ? s : { ...s, demo: { ...s.demo, enlarged: true } };
  if (a.type === 'hideDemo') return s.demo.enlarged ? { ...s, demo: { ...s.demo, enlarged: false } } : s;
  if (a.type === 'demoRate') return { ...s, demo: { ...s.demo, rate: Math.min(2, Math.max(0.25, a.rate)) } };
  if (a.type === 'demoMuted') return s.demo.muted === a.muted ? s : { ...s, demo: { ...s.demo, muted: a.muted } };
  if (a.type === 'demoCommand') return { ...s, demo: { ...s.demo, seq: s.demo.seq + 1, cmd: a.cmd } };

  if (s.paused) return s; // everything else waits for resume

  if (a.type === 'endSession') return finish(s, now);

  switch (a.type) {
    case 'skipWarmupStep': {
      if (p.kind !== 'warmup') return s;
      // Pretend the current step just ended; settle handles the chain.
      return settle({ ...s, phase: { ...p, endsAt: now } }, now, opts);
    }
    case 'skipWarmup': {
      if (p.kind !== 'warmup') return s;
      return { ...s, phase: { kind: 'ready', endsAt: now + opts.readySec * 1000 } };
    }
    case 'go': {
      if (p.kind === 'ready' || p.kind === 'rest') return toWorking(s);
      if (p.kind === 'warmup') return { ...s, phase: { kind: 'ready', endsAt: now + opts.readySec * 1000 } };
      return s;
    }
    case 'setDone': {
      if (p.kind !== 'working') return s;
      return { ...s, phase: { kind: 'logging' } };
    }
    case 'logReps': {
      if (p.kind !== 'working' && p.kind !== 'logging') return s;
      const ex = currentExercise(s);
      if (!ex) return finish(s, now);
      const reps = Math.max(0, Math.round(a.reps));
      const results = [...ex.results, { weightLb: ex.weightLb, reps, at: now }];
      const exercises = s.exercises.map((e, i) => (i === s.cursor.ex ? { ...e, results } : e));
      const hidden = s.demo.enlarged ? { ...s.demo, enlarged: false } : s.demo;
      return advance({ ...s, exercises, demo: hidden }, now, opts);
    }
    case 'skipRest': {
      if (p.kind !== 'rest' && p.kind !== 'ready') return s;
      return toWorking(s);
    }
    case 'extendRest': {
      if (!isTimed(p)) return s;
      return { ...s, phase: { ...p, endsAt: Math.max(now, p.endsAt) + a.seconds * 1000 } };
    }
    case 'overrideWeight': {
      const ex = currentExercise(s);
      if (!ex || ex.load === 'bodyweight') return s;
      const exercises = s.exercises.map((e, i) =>
        i === s.cursor.ex ? { ...e, weightLb: a.weightLb, loading: a.loading, maxedOut: false, blocked: false } : e,
      );
      return { ...s, exercises };
    }
    case 'substitute': {
      const ex = currentExercise(s);
      if (!ex) return s;
      const replacement: PlannedExercise = {
        ...a.exercise,
        results: [],
        substitutedFrom: ex.substitutedFrom ?? ex.exerciseId,
      };
      const exercises = s.exercises.map((e, i) => (i === s.cursor.ex ? replacement : e));
      const st = { ...s, exercises, cursor: { ex: s.cursor.ex, set: 0 } };
      if (p.kind === 'warmup') return st;
      const rerack = needsRerack(ex, replacement);
      const sec = opts.readySec + (rerack ? opts.rerackBonusSec : 0);
      return { ...st, phase: { kind: 'ready', endsAt: now + sec * 1000 } };
    }
    case 'skipExercise': {
      const ex = currentExercise(s);
      if (!ex) return s;
      const exercises = s.exercises.map((e, i) => (i === s.cursor.ex ? { ...e, skipped: true } : e));
      const st = { ...s, exercises };
      const nextEx = nextIncompleteExercise(st, s.cursor.ex + 1);
      if (nextEx < 0) return finish(st, now);
      const moved = { ...st, cursor: { ex: nextEx, set: st.exercises[nextEx].results.length } };
      if (p.kind === 'warmup') return moved;
      const rerack = needsRerack(ex, moved.exercises[nextEx]);
      const sec = opts.readySec + (rerack ? opts.rerackBonusSec : 0);
      return { ...moved, phase: { kind: 'ready', endsAt: now + sec * 1000 } };
    }
    default:
      return s;
  }
}

// ---------- Derived views ----------

export interface SessionProgress {
  setsDone: number;
  setsTotal: number;
  exercisesDone: number;
  exercisesTotal: number;
}

export function progress(s: SessionState): SessionProgress {
  const active = s.exercises.filter((e) => !e.skipped);
  const setsTotal = active.reduce((n, e) => n + e.sets, 0);
  const setsDone = active.reduce((n, e) => n + Math.min(e.sets, e.results.length), 0);
  const exercisesDone = active.filter((e) => e.results.length >= e.sets).length;
  return { setsDone, setsTotal, exercisesDone, exercisesTotal: active.length };
}
