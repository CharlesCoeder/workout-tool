import type { LoadMode, PlannedExercise, Program, ProgressionRule, SessionRecord, SessionRecordExercise, SessionState } from './types';
import { formatLb } from './plates';

/**
 * Personal records, estimated strength and volume, all derived from history.
 * Nothing here is stored: every number is recomputed from the session records.
 */

/** Epley estimate of a one-rep max from a set. Rough above ~12 reps, but fine for ranking sets. */
export function e1rm(weightLb: number, reps: number): number {
  if (reps <= 0 || weightLb <= 0) return 0;
  if (reps === 1) return weightLb;
  return Math.round(weightLb * (1 + reps / 30) * 10) / 10;
}

/** Pounds moved by one set: both dumbbells for a pair, both sides for a per-side lift. */
export function setVolume(weightLb: number, reps: number, load: LoadMode, perSide: boolean): number {
  if (load === 'bodyweight' || weightLb <= 0) return 0;
  return weightLb * reps * (load === 'pair' ? 2 : 1) * (perSide ? 2 : 1);
}

function perSideOf(program: Program | undefined, exerciseId: string): boolean {
  return !!program?.exercises[exerciseId]?.perSide;
}

/**
 * The weight of each set. `weightLb` is the exercise's working weight (the first set's);
 * `weights` appears only when a set was done at a different one, so older records and
 * ordinary exercises cost nothing.
 */
export function setWeights(e: SessionRecordExercise): number[] {
  return e.reps.map((_, i) => (e.weights && e.weights.length > i ? e.weights[i] : e.weightLb));
}

/** Total pounds moved in a recorded session (bodyweight sets count 0). */
export function recordVolume(rec: SessionRecord, program?: Program): number {
  return rec.exercises.reduce((sum, e) => {
    const ps = perSideOf(program, e.exerciseId);
    const ws = setWeights(e);
    return sum + e.reps.reduce((n, r, i) => n + setVolume(ws[i], r, e.load, ps), 0);
  }, 0);
}

export function recordSets(rec: SessionRecord): number {
  return rec.exercises.reduce((n, e) => n + e.reps.length, 0);
}

/** Same for the live session. */
export function sessionVolume(s: SessionState): number {
  return s.exercises.reduce((sum, e) => sum + e.results.reduce((n, r) => n + setVolume(r.weightLb, r.reps, e.load, e.perSide), 0), 0);
}

// ---------- Prior bests ----------

export interface PriorBest {
  /** Heaviest weight logged for at least one rep (0 for bodyweight or nothing). */
  heaviest: number;
  /** Most reps in a single set at each weight. */
  repsAtWeight: Map<number, number>;
  /** Best estimated 1RM over all sets. */
  bestE1rm: number;
  /** Most reps in a single set at any weight (the bodyweight measure). */
  bestReps: number;
  /** Number of earlier sessions that included this exercise. */
  sessions: number;
}

function emptyBest(): PriorBest {
  return { heaviest: 0, repsAtWeight: new Map(), bestE1rm: 0, bestReps: 0, sessions: 0 };
}

function fold(b: PriorBest, weightLb: number, reps: number) {
  if (reps <= 0) return;
  if (weightLb > b.heaviest) b.heaviest = weightLb;
  const prev = b.repsAtWeight.get(weightLb) ?? 0;
  if (reps > prev) b.repsAtWeight.set(weightLb, reps);
  const e = e1rm(weightLb, reps);
  if (e > b.bestE1rm) b.bestE1rm = e;
  if (reps > b.bestReps) b.bestReps = reps;
}

/** Bests over every recorded session except `excludeSessionId`. */
export function priorBest(history: SessionRecord[], exerciseId: string, excludeSessionId?: string): PriorBest {
  const b = emptyBest();
  for (const s of history) {
    if (s.id === excludeSessionId) continue;
    let counted = false;
    for (const e of s.exercises) {
      if (e.exerciseId !== exerciseId || !e.reps.length) continue;
      counted = true;
      const ws = setWeights(e);
      e.reps.forEach((r, i) => fold(b, ws[i], r));
    }
    if (counted) b.sessions++;
  }
  return b;
}

// ---------- PRs ----------

export type PrKind = 'weight' | 'reps' | 'e1rm' | 'bwReps';

export interface Pr {
  kind: PrKind;
  /** Short badge text, e.g. "Most reps at 14 lb". */
  label: string;
}

/**
 * The best thing a single set achieved compared with everything before it: earlier
 * sessions, and earlier sets of the same exercise in this session. One label at most,
 * heaviest-weight first, then most-reps-at-this-weight, then estimated 1RM. Nothing is a
 * record the first time an exercise is done.
 */
export function prForSet(history: SessionRecord[], s: SessionState, exIndex: number, setIndex: number): Pr | null {
  const ex = s.exercises[exIndex];
  const r = ex?.results[setIndex];
  if (!ex || !r || r.reps <= 0) return null;
  const prior = priorBest(history, ex.exerciseId, s.id);
  if (prior.sessions === 0) return null;
  for (const e of s.exercises) {
    if (e.exerciseId !== ex.exerciseId) continue;
    for (const x of e.results) if (x.at < r.at) fold(prior, x.weightLb, x.reps);
  }
  return prAgainst(prior, ex.load, r.weightLb, r.reps);
}

export function prAgainst(prior: PriorBest, load: LoadMode, weightLb: number, reps: number): Pr | null {
  if (reps <= 0) return null;
  if (load === 'bodyweight') {
    return reps > prior.bestReps ? { kind: 'bwReps', label: 'Most reps yet' } : null;
  }
  if (weightLb > prior.heaviest) return { kind: 'weight', label: 'Heaviest yet' };
  const seen = prior.repsAtWeight.has(weightLb);
  if (seen && reps > (prior.repsAtWeight.get(weightLb) ?? 0)) return { kind: 'reps', label: `Most reps at ${formatLb(weightLb)} lb` };
  if (e1rm(weightLb, reps) > prior.bestE1rm) return { kind: 'e1rm', label: 'Strongest set yet (est.)' };
  return null;
}

/** Every PR set in a live session, in the order they happened. */
export function sessionPrs(history: SessionRecord[], s: SessionState): { ex: number; set: number; pr: Pr }[] {
  const out: { ex: number; set: number; pr: Pr }[] = [];
  s.exercises.forEach((e, ex) => {
    e.results.forEach((_, set) => {
      const pr = prForSet(history, s, ex, set);
      if (pr) out.push({ ex, set, pr });
    });
  });
  return out;
}

/** Every PR in history, in the order it was set: replay the sessions and compare each set with what came before. */
export interface HistoryPr {
  sessionId: string;
  at: number;
  exerciseId: string;
  name: string;
  load: LoadMode;
  weightLb: number;
  reps: number;
  set: number;
  pr: Pr;
}

export function allPrs(history: SessionRecord[]): HistoryPr[] {
  const best = new Map<string, PriorBest>();
  const out: HistoryPr[] = [];
  for (const s of [...history].sort((a, b) => a.startedAt - b.startedAt)) {
    for (const e of s.exercises) {
      const b = best.get(e.exerciseId) ?? emptyBest();
      best.set(e.exerciseId, b);
      const eligible = b.sessions >= 1;
      const ws = setWeights(e);
      e.reps.forEach((reps, set) => {
        if (eligible) {
          const pr = prAgainst(b, e.load, ws[set], reps);
          if (pr) out.push({ sessionId: s.id, at: s.startedAt, exerciseId: e.exerciseId, name: e.name, load: e.load, weightLb: ws[set], reps, set, pr });
        }
        fold(b, ws[set], reps);
      });
      if (e.reps.some((r) => r > 0)) b.sessions++;
    }
  }
  return out;
}

// ---------- All-time records (for History) ----------

export interface LiftRecords {
  heaviest: { weightLb: number; reps: number; at: number } | null;
  bestE1rm: { weightLb: number; reps: number; e1rm: number; at: number } | null;
  mostReps: { weightLb: number; reps: number; at: number } | null;
  sessions: number;
  totalSets: number;
}

export function liftRecords(history: SessionRecord[], exerciseId: string): LiftRecords {
  const out: LiftRecords = { heaviest: null, bestE1rm: null, mostReps: null, sessions: 0, totalSets: 0 };
  for (const s of [...history].sort((a, b) => a.startedAt - b.startedAt)) {
    let counted = false;
    for (const e of s.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      const ws = setWeights(e);
      for (const [i, reps] of e.reps.entries()) {
        if (reps <= 0) continue;
        counted = true;
        out.totalSets++;
        const w = ws[i];
        if (!out.heaviest || w > out.heaviest.weightLb || (w === out.heaviest.weightLb && reps > out.heaviest.reps)) out.heaviest = { weightLb: w, reps, at: s.startedAt };
        const e1 = e1rm(w, reps);
        if (!out.bestE1rm || e1 > out.bestE1rm.e1rm) out.bestE1rm = { weightLb: w, reps, e1rm: e1, at: s.startedAt };
        if (!out.mostReps || reps > out.mostReps.reps) out.mostReps = { weightLb: w, reps, at: s.startedAt };
      }
    }
    if (counted) out.sessions++;
  }
  return out;
}

// ---------- "Beat the logbook" ----------

export interface RepTarget {
  reps: number;
  /** Why this number: one more than last time, a fresh weight, or the top of the range again. */
  reason: 'beat' | 'newWeight' | 'top';
  lastReps: number | null;
}

/**
 * Reps to aim for in set `setIndex`, following double progression: one more than the
 * same set last time at this weight, capped at the top of the range; at a new weight,
 * the bottom of the range. Null the first time an exercise is done.
 */
export function targetReps(ex: PlannedExercise, setIndex: number): RepTarget | null {
  const last = ex.lastTime;
  if (!last || !last.reps.length) return null;
  const sameWeight = ex.load === 'bodyweight' || Math.abs(last.weightLb - ex.weightLb) < 1e-9;
  if (!sameWeight) return { reps: ex.repMin, reason: 'newWeight', lastReps: null };
  const lastReps = last.reps[Math.min(setIndex, last.reps.length - 1)];
  if (lastReps >= ex.repMax) return { reps: ex.repMax, reason: 'top', lastReps };
  return { reps: Math.min(ex.repMax, Math.max(ex.repMin, lastReps + 1)), reason: 'beat', lastReps };
}

// ---------- How far past the range to go ----------

export interface RepGuidance {
  /** The rep count this set is asking for. */
  stopAt: number;
  /** True when going past `stopAt` earns nothing: the weight is what moves next, not the reps. */
  capped: boolean;
  /** One line of why, for the screen that has room for it. */
  note: string;
}

/**
 * What extra reps are worth on this set. Under the program's rule the top of the range is
 * a trigger, not a ceiling to beat: once the set that decides has reached it the weight
 * goes up next time and further reps change nothing the app will ever read. At the plate
 * ceiling, and on bodyweight work, reps are the only thing that can move, so they count.
 */
export function repGuidance(ex: PlannedExercise, setIndex: number, rule: ProgressionRule = 'firstSet'): RepGuidance {
  const top = ex.repMax;
  if (ex.load === 'bodyweight') {
    return { stopAt: top, capped: false, note: `Past ${top}, make the reps harder rather than longer: slower lowering, a pause at the hard point.` };
  }
  if (ex.maxedOut) {
    return { stopAt: top, capped: false, note: `You are at the top of your plates, so reps are the progress here. Every extra one counts.` };
  }
  if (rule === 'allSets') {
    return { stopAt: top, capped: true, note: `${top} on every set is what adds a plate step next time. More than that changes nothing.` };
  }
  if (setIndex === 0) {
    return { stopAt: top, capped: true, note: `${top} on this first set is the whole trigger: the weight goes up next time. Save the rest for the sets after it.` };
  }
  const first = ex.results[0]?.reps ?? 0;
  const note =
    first >= top
      ? `The first set already earned the step. These are for the work, not the logbook: stop a rep or two short of failure.`
      : `Only the first set decides the weight. Match what you can here and stop a rep or two short of failure.`;
  return { stopAt: top, capped: true, note };
}

/** One line explaining what a rep range is for, for someone seeing "6–12" and wondering. */
export function rangeExplainer(ex: PlannedExercise): string {
  if (ex.load === 'bodyweight') return `${ex.repMin}–${ex.repMax} is the working range: climb it, then make the movement harder.`;
  return `${ex.repMin}–${ex.repMax} is a ladder, not a choice: a new weight starts near ${ex.repMin}, you climb to ${ex.repMax} over sessions, then add a plate and start again.`;
}
