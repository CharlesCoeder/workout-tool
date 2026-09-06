import type { Exercise, Inventory, LoadMode, PlateType, Program, ProgressionRule, SessionRecord } from './types';
import { achievableWeights, formatLb, maxWeight } from './plates';
import { performances, prescribe } from './progression';
import { addDays, startOfWeek } from './stats';

/**
 * Where each lift stands against the plates you own, and what buying more would change.
 * A small adjustable set runs out of steps fast (the default pair ladder is 4·9·14·19 lb),
 * so "when do I need plates?" is a real planning question here.
 */

export interface LiftForecast {
  exerciseId: string;
  name: string;
  load: LoadMode;
  /** What the next session will prescribe. */
  currentLb: number;
  ceilingLb: number;
  /** Achievable weights strictly above the current one. */
  stepsLeft: number;
  atCeiling: boolean;
  /** Sessions of this exercise on record. */
  sessions: number;
  /** Plate steps gained per session over history (0–1), or null with fewer than two sessions. */
  rate: number | null;
  /** How often this lift comes round, sessions per week. */
  perWeek: number;
  /** Sessions and weeks until the ceiling at the observed rate (null if the rate is 0 or unknown). */
  sessionsAtRate: number | null;
  weeksAtRate: number | null;
  /** Same if every session earns a step (the program's best case). */
  sessionsAtBest: number;
  weeksAtBest: number;
  /** Estimated day the ceiling is reached at the observed rate. */
  etaAtRate: number | null;
}

/** Plate steps per session: weight increases between consecutive sessions over the exercise's history. */
export function progressionRate(history: SessionRecord[], exerciseId: string): { rate: number | null; sessions: number } {
  const perf = performances(history, exerciseId).reverse(); // chronological
  if (perf.length < 2) return { rate: null, sessions: perf.length };
  let ups = 0;
  for (let i = 1; i < perf.length; i++) if (perf[i].entry.weightLb > perf[i - 1].entry.weightLb + 1e-9) ups++;
  return { rate: ups / (perf.length - 1), sessions: perf.length };
}

/** Sessions per week this exercise has actually come round in the last eight weeks, else the program's cadence. */
export function exerciseFrequency(program: Program, history: SessionRecord[], exerciseId: string, now: number, targetPerWeek: number): number {
  const since = addDays(startOfWeek(now), -7 * 8);
  const recent = history.filter((s) => s.startedAt >= since && s.exercises.some((e) => e.exerciseId === exerciseId && e.reps.length > 0));
  if (recent.length >= 2) {
    const first = Math.min(...recent.map((s) => s.startedAt));
    const weeks = Math.max(1, (now - first) / (7 * 86_400_000));
    return Math.round((recent.length / weeks) * 10) / 10;
  }
  const daysWith = program.days.filter((d) => d.entries.some((e) => e.exerciseId === exerciseId)).length;
  if (!program.days.length || !daysWith) return 0;
  return Math.round((daysWith * (targetPerWeek / program.days.length)) * 10) / 10;
}

export function forecastLift(
  ex: Exercise,
  program: Program,
  history: SessionRecord[],
  inv: Inventory,
  now: number,
  rule: ProgressionRule,
  targetPerWeek: number,
): LiftForecast | null {
  if (ex.load === 'bodyweight') return null;
  const ladder = achievableWeights(inv, ex.load);
  if (!ladder.length) return null;
  const pres = prescribe(ex, history, inv, undefined, rule);
  const currentLb = pres.weightLb;
  const ceilingLb = ladder[ladder.length - 1];
  const stepsLeft = ladder.filter((w) => w > currentLb + 1e-9).length;
  const { rate, sessions } = progressionRate(history, ex.id);
  const perWeek = exerciseFrequency(program, history, ex.id, now, targetPerWeek);
  const sessionsAtBest = stepsLeft;
  const weeksAtBest = perWeek > 0 ? Math.ceil(sessionsAtBest / perWeek) : Infinity;
  const sessionsAtRate = rate && rate > 0 ? Math.ceil(stepsLeft / rate) : null;
  const weeksAtRate = sessionsAtRate !== null && perWeek > 0 ? Math.ceil(sessionsAtRate / perWeek) : null;
  return {
    exerciseId: ex.id,
    name: ex.name,
    load: ex.load,
    currentLb,
    ceilingLb,
    stepsLeft,
    atCeiling: stepsLeft === 0,
    sessions,
    rate,
    perWeek,
    sessionsAtRate,
    weeksAtRate,
    sessionsAtBest,
    weeksAtBest,
    etaAtRate: weeksAtRate !== null ? addDays(now, weeksAtRate * 7) : null,
  };
}

/** Every weighted exercise that appears in the program's days, in program order, forecast once each. */
export function forecastProgram(program: Program, history: SessionRecord[], inv: Inventory, now: number, rule: ProgressionRule, targetPerWeek: number): LiftForecast[] {
  const seen = new Set<string>();
  const out: LiftForecast[] = [];
  for (const d of program.days) {
    for (const en of d.entries) {
      if (seen.has(en.exerciseId)) continue;
      seen.add(en.exerciseId);
      const ex = program.exercises[en.exerciseId];
      if (!ex) continue;
      const f = forecastLift(ex, program, history, inv, now, rule, targetPerWeek);
      if (f) out.push(f);
    }
  }
  return out;
}

// ---------- Ladders and upgrades ----------

export interface LadderStep {
  from: number;
  to: number;
  /** Relative size of the jump, e.g. 0.36 for 14 → 19. */
  pct: number;
}

export function ladderSteps(weights: number[]): LadderStep[] {
  const out: LadderStep[] = [];
  for (let i = 1; i < weights.length; i++) out.push({ from: weights[i - 1], to: weights[i], pct: (weights[i] - weights[i - 1]) / weights[i - 1] });
  return out;
}

/** The inventory with extra plates (merged by size) and handles. */
export function withPlates(inv: Inventory, add: PlateType[], extraHandles = 0): Inventory {
  const plates = inv.plates.map((p) => ({ ...p }));
  for (const a of add) {
    if (a.lb <= 0 || a.count <= 0) continue;
    const hit = plates.find((p) => Math.abs(p.lb - a.lb) < 1e-9);
    if (hit) hit.count += a.count;
    else plates.push({ lb: a.lb, count: a.count });
  }
  plates.sort((a, b) => b.lb - a.lb);
  return { ...inv, plates, handles: inv.handles + extraHandles };
}

export interface UpgradeEffect {
  inv: Inventory;
  pair: number[];
  single: number[];
  pairCeiling: number;
  singleCeiling: number;
  /** Weights that did not exist before. */
  newPair: number[];
  newSingle: number[];
  /** Largest relative jump on the pair ladder before and after, ignoring the step off the empty handle. */
  worstJumpBefore: number;
  worstJumpAfter: number;
  /** Lifts currently at their ceiling that would get room again, with their new step count. */
  unblocked: { exerciseId: string; name: string; steps: number }[];
}

export function simulateUpgrade(inv: Inventory, add: PlateType[], forecasts: LiftForecast[], extraHandles = 0): UpgradeEffect {
  const next = withPlates(inv, add, extraHandles);
  const pairBefore = achievableWeights(inv, 'pair');
  const singleBefore = achievableWeights(inv, 'single');
  const pair = achievableWeights(next, 'pair');
  const single = achievableWeights(next, 'single');
  const has = (list: number[], w: number) => list.some((x) => Math.abs(x - w) < 1e-9);
  const worst = (ws: number[]) => Math.max(0, ...ladderSteps(ws).slice(1).map((s) => s.pct));
  const unblocked = forecasts
    .filter((f) => f.atCeiling)
    .map((f) => ({ exerciseId: f.exerciseId, name: f.name, steps: achievableWeights(next, f.load).filter((w) => w > f.currentLb + 1e-9).length }))
    .filter((u) => u.steps > 0);
  return {
    inv: next,
    pair,
    single,
    pairCeiling: maxWeight(next, 'pair') ?? 0,
    singleCeiling: maxWeight(next, 'single') ?? 0,
    newPair: pair.filter((w) => !has(pairBefore, w)),
    newSingle: single.filter((w) => !has(singleBefore, w)),
    worstJumpBefore: worst(pairBefore),
    worstJumpAfter: worst(pair),
    unblocked,
  };
}

/** Standard 1-inch plate sizes, as sold. */
export const PLATE_PRESETS: { label: string; plates: PlateType[] }[] = [
  { label: '4 × 1.25 lb', plates: [{ lb: 1.25, count: 4 }] },
  { label: '4 × 2.5 lb', plates: [{ lb: 2.5, count: 4 }] },
  { label: '4 × 5 lb', plates: [{ lb: 5, count: 4 }] },
  { label: '4 × 10 lb', plates: [{ lb: 10, count: 4 }] },
  { label: '8 × 5 lb', plates: [{ lb: 5, count: 8 }] },
  { label: '4 × 25 lb', plates: [{ lb: 25, count: 4 }] },
];

export function fmtLadder(ws: number[]): string {
  return ws.map(formatLb).join(' · ');
}
