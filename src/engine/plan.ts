import type { Day, Exercise, Inventory, PlannedExercise, Program, ProgressionRule, SessionRecord, SessionState } from './types';
import { createSession, DEFAULT_OPTIONS, type SessionOptions } from './session';
import { loadingFor } from './plates';
import { prescribe } from './progression';

/** Plan a single exercise from history + inventory. `prevPerEnd` biases plate choice. */
export function planExercise(
  ex: Exercise,
  history: SessionRecord[],
  inv: Inventory,
  overrides: { sets?: number; repMin?: number; repMax?: number } = {},
  prevPerEnd?: number[],
  rule: ProgressionRule = 'firstSet',
): PlannedExercise {
  const repMax = overrides.repMax ?? ex.repMax;
  const pres = prescribe(ex, history, inv, repMax, rule);
  const loading = ex.load === 'bodyweight' ? null : loadingFor(inv, ex.load, pres.weightLb, prevPerEnd);
  return {
    exerciseId: ex.id,
    name: ex.name,
    load: ex.load,
    sets: overrides.sets ?? ex.sets,
    repMin: overrides.repMin ?? ex.repMin,
    repMax,
    restSec: ex.restSec,
    cue: ex.cue,
    demo: ex.demo ?? null,
    perSide: !!ex.perSide,
    substitutes: ex.substitutes ?? [],
    demoVolume: ex.demoVolume,
    prescribedLb: pres.weightLb,
    weightLb: pres.weightLb,
    loading,
    maxedOut: pres.maxedOut,
    blocked: pres.blocked,
    progressed: pres.progressed,
    stalled: pres.stalled,
    lastTime: pres.lastTime,
    results: [],
  };
}

export function planDay(program: Program, day: Day, history: SessionRecord[], inv: Inventory, rule: ProgressionRule = 'firstSet'): PlannedExercise[] {
  const out: PlannedExercise[] = [];
  let prevPerEnd: number[] | undefined;
  for (const entry of day.entries) {
    const ex = program.exercises[entry.exerciseId];
    if (!ex) continue;
    const planned = planExercise(ex, history, inv, entry, prevPerEnd, rule);
    if (planned.loading) prevPerEnd = planned.loading.perEnd;
    out.push(planned);
  }
  return out;
}

export function planSession(
  program: Program,
  dayId: string,
  history: SessionRecord[],
  inv: Inventory,
  now: number,
  id = `${now}-${Math.random().toString(36).slice(2, 8)}`,
  rule: ProgressionRule = 'firstSet',
  opts: SessionOptions = DEFAULT_OPTIONS,
): SessionState {
  const day = program.days.find((d) => d.id === dayId);
  if (!day) throw new Error(`Unknown day ${dayId}`);
  return createSession({ id, dayId, dayName: day.name, warmup: program.warmup, exercises: planDay(program, day, history, inv, rule) }, now, opts);
}

// ---------- Gear ----------

/** Gear an exercise needs that the inventory doesn't list. Empty means you can do it today. */
export function missingGear(ex: Pick<Exercise, 'requires'>, inv: Inventory): string[] {
  const have = new Set(inv.gear ?? []);
  return (ex.requires ?? []).filter((g) => !have.has(g));
}

export function canDo(ex: Pick<Exercise, 'requires'>, inv: Inventory): boolean {
  return missingGear(ex, inv).length === 0;
}

/**
 * Substitutes that use gear you own and the planned exercise does not. The floor press is
 * in the program because the program assumes a floor; owning a bench is a reason to offer
 * the swap, never to make it silently (see DECISIONS).
 */
export function betterWithGear(exerciseId: string, program: Program, inv: Inventory): Exercise[] {
  const ex = program.exercises[exerciseId];
  if (!ex) return [];
  const own = new Set(inv.gear ?? []);
  const already = new Set(ex.requires ?? []);
  return (ex.substitutes ?? [])
    .map((id) => program.exercises[id])
    .filter((sub): sub is Exercise => !!sub && canDo(sub, inv) && (sub.requires ?? []).some((g) => own.has(g) && !already.has(g)));
}

/** Convert a live session into the history record shape. */
export function toRecord(s: SessionState): SessionRecord {
  return {
    id: s.id,
    dayId: s.dayId,
    dayName: s.dayName,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
    completed: s.phase.kind === 'summary',
    exercises: s.exercises
      .filter((e) => e.results.length > 0)
      .map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        load: e.load,
        weightLb: e.results[0].weightLb,
        // Only written when a set was done at a different weight (a mid-exercise change).
        weights: e.results.some((r) => Math.abs(r.weightLb - e.results[0].weightLb) > 1e-9) ? e.results.map((r) => r.weightLb) : undefined,
        reps: e.results.map((r) => r.reps),
        maxedOut: e.maxedOut || undefined,
        note: e.note || undefined,
      })),
    note: s.note || undefined,
  };
}

/** Which day should come next: the one after the last session's day, cycling. */
export function suggestNextDay(program: Program, history: SessionRecord[]): Day | undefined {
  const days = program.days;
  if (!days.length) return undefined;
  const last = [...history].sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!last) return days[0];
  const i = days.findIndex((d) => d.id === last.dayId);
  return days[(i + 1) % days.length];
}
