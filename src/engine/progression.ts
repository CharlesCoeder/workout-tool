import type { Exercise, Inventory, ProgressionRule, SessionRecord } from './types';
import { isAchievable, nextStep, snapDown, snapWeight } from './plates';

export interface Prescription {
  weightLb: number;
  /** The weight is the heaviest the plates can build; no further step exists. */
  maxedOut: boolean;
  /** Earned an increase last time but the plates could not provide one. */
  blocked: boolean;
  progressed: boolean;
  /** How many recent sessions in a row sat at this weight without earning a step (0 = progressing). */
  stalled: number;
  lastTime: { weightLb: number; reps: number[] } | null;
}

/** Did a session's sets earn the next step under the rule? */
export function earnedStep(reps: number[], repMax: number, rule: ProgressionRule): boolean {
  if (!reps.length) return false;
  return rule === 'allSets' ? reps.every((r) => r >= repMax) : reps[0] >= repMax;
}

/** All performances of an exercise, most recent first. */
export function performances(history: SessionRecord[], exerciseId: string) {
  const out: { session: SessionRecord; entry: SessionRecord['exercises'][number] }[] = [];
  for (const s of [...history].sort((a, b) => b.startedAt - a.startedAt)) {
    const e = s.exercises.find((x) => x.exerciseId === exerciseId && x.reps.length > 0);
    if (e) out.push({ session: s, entry: e });
  }
  return out;
}

/** Sessions in a row without progress before the TV says something. */
export const STALL_SESSIONS = 3;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * How many recent sessions in a row at `weightLb` failed to beat the session before them
 * (more reps on the first set, or more reps in total). Climbing the rep range is progress
 * and counts 0; the weight itself is never changed automatically.
 */
export function stallCount(history: SessionRecord[], exerciseId: string, weightLb: number, repMax: number, rule: ProgressionRule): number {
  const runs: number[][] = []; // latest first, all at this weight, none earning a step
  for (const { entry } of performances(history, exerciseId)) {
    if (Math.abs(entry.weightLb - weightLb) > 1e-9 || earnedStep(entry.reps, repMax, rule)) break;
    runs.push(entry.reps);
  }
  let n = 0;
  for (let i = 0; i + 1 < runs.length; i++) {
    const cur = runs[i];
    const prev = runs[i + 1];
    if (cur[0] > prev[0] || sum(cur) > sum(prev)) break;
    n++;
  }
  return n;
}

/** Most recent record of this exercise with at least one logged set. */
export function lastPerformance(history: SessionRecord[], exerciseId: string) {
  const sorted = [...history].sort((a, b) => b.startedAt - a.startedAt);
  for (const s of sorted) {
    const e = s.exercises.find((x) => x.exerciseId === exerciseId && x.reps.length > 0);
    if (e) return { session: s, entry: e };
  }
  return null;
}

/**
 * The program's rule: hit the top of the rep range on the FIRST set → add one
 * plate step next time. Constrained to what the inventory can build; at the
 * ceiling the weight stays and `maxedOut` is flagged.
 */
export function prescribe(ex: Exercise, history: SessionRecord[], inv: Inventory, repMax = ex.repMax, rule: ProgressionRule = 'firstSet'): Prescription {
  if (ex.load === 'bodyweight') {
    const last = lastPerformance(history, ex.id);
    return {
      weightLb: 0,
      maxedOut: false,
      blocked: false,
      progressed: false,
      stalled: 0,
      lastTime: last ? { weightLb: 0, reps: last.entry.reps } : null,
    };
  }
  const last = lastPerformance(history, ex.id);
  if (!last) {
    const w = snapWeight(inv, ex.load, ex.startWeightLb) ?? 0;
    const up = nextStep(inv, ex.load, w);
    return { weightLb: w, maxedOut: up === null, blocked: false, progressed: false, stalled: 0, lastTime: null };
  }
  const lastW = last.entry.weightLb;
  const lastReps = last.entry.reps;
  const lastTime = { weightLb: lastW, reps: lastReps };
  const earned = earnedStep(lastReps, repMax, rule);

  // Base weight: what they used, or the nearest buildable at/below if plates changed.
  const base = isAchievable(inv, ex.load, lastW) ? lastW : (snapDown(inv, ex.load, lastW) ?? lastW);
  const up = nextStep(inv, ex.load, base);
  if (earned) {
    if (up === null) return { weightLb: base, maxedOut: true, blocked: true, progressed: false, stalled: 0, lastTime };
    const upUp = nextStep(inv, ex.load, up);
    return { weightLb: up, maxedOut: upUp === null, blocked: false, progressed: true, stalled: 0, lastTime };
  }
  const stalled = stallCount(history, ex.id, lastW, repMax, rule);
  return { weightLb: base, maxedOut: up === null, blocked: false, progressed: false, stalled, lastTime };
}
