import type { Day, Exercise, Inventory, PlannedExercise, Program, ProgressionRule, SessionRecord, SessionState } from './types';
import { createSession } from './session';
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
): SessionState {
  const day = program.days.find((d) => d.id === dayId);
  if (!day) throw new Error(`Unknown day ${dayId}`);
  return createSession({ id, dayId, dayName: day.name, warmup: program.warmup, exercises: planDay(program, day, history, inv, rule) }, now);
}

/** Convert a live session into the history record shape. */
/**
 * A session is only worth a history row once something has actually been logged.
 * An empty one is noise: it counts toward the weekly target and tells progression nothing.
 */
export function worthKeeping(s: SessionState): boolean {
  return s.exercises.some((e) => e.results.length > 0);
}

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
