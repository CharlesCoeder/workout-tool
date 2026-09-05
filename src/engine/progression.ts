import type { Exercise, Inventory, SessionRecord } from './types';
import { isAchievable, nextStep, snapDown, snapWeight } from './plates';

export interface Prescription {
  weightLb: number;
  /** The weight is the heaviest the plates can build; no further step exists. */
  maxedOut: boolean;
  /** Earned an increase last time but the plates could not provide one. */
  blocked: boolean;
  progressed: boolean;
  lastTime: { weightLb: number; reps: number[] } | null;
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
export function prescribe(ex: Exercise, history: SessionRecord[], inv: Inventory, repMax = ex.repMax): Prescription {
  if (ex.load === 'bodyweight') {
    const last = lastPerformance(history, ex.id);
    return {
      weightLb: 0,
      maxedOut: false,
      blocked: false,
      progressed: false,
      lastTime: last ? { weightLb: 0, reps: last.entry.reps } : null,
    };
  }
  const last = lastPerformance(history, ex.id);
  if (!last) {
    const w = snapWeight(inv, ex.load, ex.startWeightLb) ?? 0;
    const up = nextStep(inv, ex.load, w);
    return { weightLb: w, maxedOut: up === null, blocked: false, progressed: false, lastTime: null };
  }
  const lastW = last.entry.weightLb;
  const lastReps = last.entry.reps;
  const lastTime = { weightLb: lastW, reps: lastReps };
  const earned = lastReps[0] >= repMax;

  // Base weight: what they used, or the nearest buildable at/below if plates changed.
  const base = isAchievable(inv, ex.load, lastW) ? lastW : (snapDown(inv, ex.load, lastW) ?? lastW);
  const up = nextStep(inv, ex.load, base);
  if (earned) {
    if (up === null) return { weightLb: base, maxedOut: true, blocked: true, progressed: false, lastTime };
    const upUp = nextStep(inv, ex.load, up);
    return { weightLb: up, maxedOut: upUp === null, blocked: false, progressed: true, lastTime };
  }
  return { weightLb: base, maxedOut: up === null, blocked: false, progressed: false, lastTime };
}
