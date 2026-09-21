import { formatLb } from '../engine/plates';
import { setWeights } from '../engine/records';
import type { LoadMode, PlannedExercise, SessionRecordExercise, SetResult } from '../engine/types';

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return String(s);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weightLabel(lb: number, mode: LoadMode): string {
  if (mode === 'bodyweight') return 'Bodyweight';
  return `${formatLb(lb)} lb${mode === 'pair' ? ' each' : ''}`;
}

export function modeLabel(mode: LoadMode): string {
  return mode === 'pair' ? 'Two dumbbells' : mode === 'single' ? 'One dumbbell' : 'No weight';
}

export function perEndLabel(perEnd: number[]): string {
  if (!perEnd.length) return 'Empty handle';
  return perEnd.map(formatLb).join(' + ') + ' each end';
}

export function repsTarget(ex: PlannedExercise): string {
  return `${ex.repMin}–${ex.repMax} reps${ex.perSide ? ' each side' : ''}`;
}

export function repsList(reps: number[]): string {
  return reps.join(', ');
}

/**
 * The sets of one exercise in a line. Normally "14 lb × 10, 9, 8"; when a set was done at
 * a different weight, each set carries its own so the change is visible rather than lost.
 */
export function setsSummary(sets: { weightLb: number; reps: number }[], load: LoadMode): string {
  const reps = sets.map((r) => r.reps).join(', ');
  if (load === 'bodyweight' || !sets.length) return reps;
  const even = sets.every((r) => Math.abs(r.weightLb - sets[0].weightLb) < 1e-9);
  if (even) return `${formatLb(sets[0].weightLb)} lb × ${reps}`;
  return sets.map((r) => `${formatLb(r.weightLb)} × ${r.reps}`).join(', ');
}

export function resultsSummary(results: SetResult[], load: LoadMode): string {
  return setsSummary(results, load);
}

export function recordSummary(e: SessionRecordExercise): string {
  const ws = setWeights(e);
  return setsSummary(
    e.reps.map((reps, i) => ({ weightLb: ws[i], reps })),
    e.load,
  );
}
