import { rackFor, emptyRack, rackDiff, type RackChange } from '../engine/plates';
import type { Inventory, PlannedExercise, Rack, SessionState } from '../engine/types';

/** What is on the bars just before exercise `index` (following the session so far). */
export function rackBefore(s: SessionState, index: number, inv: Inventory): Rack {
  let rack = emptyRack(inv);
  for (let i = 0; i < index && i < s.exercises.length; i++) {
    const e = s.exercises[i];
    if (e.skipped || e.load === 'bodyweight' || !e.loading) continue;
    rack = rackFor(inv, e.load, e.loading, rack);
  }
  return rack;
}

export function rackForExercise(e: PlannedExercise, prev: Rack, inv: Inventory): Rack {
  if (e.load === 'bodyweight' || !e.loading) return prev;
  return rackFor(inv, e.load, e.loading, prev);
}

export interface RackPlan {
  from: Rack;
  to: Rack;
  changes: RackChange[];
}

export function rackPlanFor(s: SessionState, index: number, inv: Inventory): RackPlan {
  const from = rackBefore(s, index, inv);
  const e = s.exercises[index];
  const to = e ? rackForExercise(e, from, inv) : from;
  return { from, to, changes: rackDiff(from, to) };
}
