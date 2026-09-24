import type { PlannedExercise, Program, SessionRecord, WarmupStep } from './types';
import { recordSets, recordVolume } from './records';
import { needsRerack } from './session';

/**
 * Adherence and volume statistics over history. Weeks start on Monday, local time.
 * Everything is derived; nothing here is stored.
 */

const DAY_MS = 86_400_000;

/** Local midnight at the start of the day containing `t`. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight on the Monday of the week containing `t`. */
export function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function addDays(t: number, days: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** 'YYYY-MM-DD' in local time. */
export function dayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole local days between two instants (b − a), by calendar day. */
export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}

// ---------- Weekly rollups ----------

export interface WeekStat {
  /** Monday 00:00 local. */
  start: number;
  sessions: number;
  sets: number;
  volumeLb: number;
  minutes: number;
  /** Which local days (0 = Monday … 6 = Sunday) had a session. */
  days: number[];
}

/** The last `weeks` weeks ending with the week containing `now`, oldest first. */
export function weeklyStats(history: SessionRecord[], program: Program | undefined, weeks: number, now: number): WeekStat[] {
  const thisStart = startOfWeek(now);
  const out: WeekStat[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    out.push({ start: addDays(thisStart, -7 * i), sessions: 0, sets: 0, volumeLb: 0, minutes: 0, days: [] });
  }
  const first = out[0]?.start ?? thisStart;
  for (const s of history) {
    if (s.startedAt < first) continue;
    const ws = startOfWeek(s.startedAt);
    const w = out.find((x) => x.start === ws);
    if (!w) continue;
    w.sessions++;
    w.sets += recordSets(s);
    w.volumeLb += recordVolume(s, program);
    if (s.endedAt) w.minutes += Math.round((s.endedAt - s.startedAt) / 60_000);
    const dow = daysBetween(ws, s.startedAt);
    if (!w.days.includes(dow)) w.days.push(dow);
  }
  return out;
}

export interface Consistency {
  /** Sessions in the week containing `now`. */
  thisWeek: number;
  target: number;
  lastSessionAt: number | null;
  /** Calendar days since the last session (0 = today). */
  daysSince: number | null;
  /** Mean sessions per week over the last four full weeks (not counting the current one). */
  recentPerWeek: number;
  /** Weeks with at least one session, all time. */
  activeWeeks: number;
  totalSessions: number;
}

export function consistency(history: SessionRecord[], target: number, now: number): Consistency {
  const thisStart = startOfWeek(now);
  const thisWeek = history.filter((s) => s.startedAt >= thisStart && s.startedAt <= now).length;
  const last = history.reduce<SessionRecord | null>((best, s) => (s.startedAt <= now && (!best || s.startedAt > best.startedAt) ? s : best), null);
  const fourStart = addDays(thisStart, -28);
  const recent = history.filter((s) => s.startedAt >= fourStart && s.startedAt < thisStart).length;
  const weeksWithSessions = new Set(history.map((s) => startOfWeek(s.startedAt)));
  return {
    thisWeek,
    target,
    lastSessionAt: last?.startedAt ?? null,
    daysSince: last ? daysBetween(last.startedAt, now) : null,
    recentPerWeek: Math.round((recent / 4) * 10) / 10,
    activeWeeks: weeksWithSessions.size,
    totalSessions: history.length,
  };
}

// ---------- Muscle groups ----------

/** The vocabulary used by the exercise editor and the balance chart, in display order. */
export const MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves', 'chest', 'back', 'shoulders', 'traps', 'biceps', 'triceps', 'forearms', 'core'] as const;
export type Muscle = (typeof MUSCLES)[number];

/** A set counts 1 for the first (main) muscle listed and ½ for every other one. */
function creditSet(into: Map<string, number>, muscles: string[] | undefined, sets: number) {
  if (!muscles?.length) return;
  muscles.forEach((m, i) => into.set(m, (into.get(m) ?? 0) + sets * (i === 0 ? 1 : 0.5)));
}

/** Sets per muscle actually done in the week starting at `weekStart` (a Monday). */
export function setsPerMuscle(history: SessionRecord[], program: Program, weekStart: number): Map<string, number> {
  const end = addDays(weekStart, 7);
  const out = new Map<string, number>();
  for (const s of history) {
    if (s.startedAt < weekStart || s.startedAt >= end) continue;
    for (const e of s.exercises) creditSet(out, program.exercises[e.exerciseId]?.muscles, e.reps.filter((r) => r > 0).length);
  }
  return out;
}

/** How much one set of an exercise counts towards `muscle`: 1 as the main muscle, ½ as another, 0 otherwise. */
function creditFor(muscles: string[] | undefined, muscle: string): number {
  const i = muscles?.indexOf(muscle) ?? -1;
  return i < 0 ? 0 : i === 0 ? 1 : 0.5;
}

export interface MuscleWeek {
  /** Monday 00:00 local. */
  start: number;
  /** Credited sets that week (main muscle 1, secondary ½). */
  sets: number;
}

/** One muscle's weekly sets over the last `weeks` weeks ending with the week containing `now`, oldest first. */
export function muscleWeeks(history: SessionRecord[], program: Program, muscle: string, weeks: number, now: number): MuscleWeek[] {
  const thisStart = startOfWeek(now);
  const out: MuscleWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ start: addDays(thisStart, -7 * i), sets: 0 });
  const first = out[0]?.start ?? thisStart;
  for (const s of history) {
    if (s.startedAt < first) continue;
    const w = out.find((x) => x.start === startOfWeek(s.startedAt));
    if (!w) continue;
    for (const e of s.exercises) w.sets += creditFor(program.exercises[e.exerciseId]?.muscles, muscle) * e.reps.filter((r) => r > 0).length;
  }
  return out;
}

export interface MuscleSource {
  exerciseId: string;
  name: string;
  /** Credited sets between `from` and `to`. */
  sets: number;
  /** This muscle is the exercise's main one (full credit) rather than a helper (half). */
  main: boolean;
}

/** Which exercises a muscle's sets came from between `from` (inclusive) and `to` (exclusive), most first. */
export function muscleSources(history: SessionRecord[], program: Program, muscle: string, from: number, to: number): MuscleSource[] {
  const by = new Map<string, MuscleSource>();
  for (const s of history) {
    if (s.startedAt < from || s.startedAt >= to) continue;
    for (const e of s.exercises) {
      const muscles = program.exercises[e.exerciseId]?.muscles;
      const credit = creditFor(muscles, muscle);
      const done = e.reps.filter((r) => r > 0).length;
      if (!credit || !done) continue;
      const src = by.get(e.exerciseId) ?? { exerciseId: e.exerciseId, name: program.exercises[e.exerciseId]?.name ?? e.name, sets: 0, main: credit === 1 };
      src.sets += credit * done;
      by.set(e.exerciseId, src);
    }
  }
  return [...by.values()].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
}

/** Monday of the week of the earliest session, or null with no history. */
export function firstWeek(history: SessionRecord[]): number | null {
  if (!history.length) return null;
  return startOfWeek(Math.min(...history.map((s) => s.startedAt)));
}

/** Sets per muscle the program prescribes if every day is done once. */
export function plannedSetsPerMuscle(program: Program): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of program.days) {
    for (const en of d.entries) {
      const ex = program.exercises[en.exerciseId];
      if (ex) creditSet(out, ex.muscles, en.sets ?? ex.sets);
    }
  }
  return out;
}

// ---------- How long will this take? ----------

export interface EstimateOptions {
  readySec: number;
  rerackBonusSec: number;
}

/** Seconds a set takes: setup plus about three seconds a rep, doubled for per-side lifts. */
function setSeconds(e: PlannedExercise): number {
  const reps = (e.repMin + e.repMax) / 2;
  return 10 + 3 * reps * (e.perSide ? 2 : 1);
}

/** A planned day's expected length from its warm-up, sets, rests and plate changes. */
export function estimateSessionMs(exercises: PlannedExercise[], warmup: WarmupStep[], opts: EstimateOptions): number {
  let sec = warmup.reduce((n, w) => n + Math.max(0, w.seconds), 0) + opts.readySec;
  const active = exercises.filter((e) => !e.skipped);
  active.forEach((e, i) => {
    sec += e.sets * setSeconds(e) + Math.max(0, e.sets - 1) * e.restSec;
    const next = active[i + 1];
    if (next) sec += e.restSec + (needsRerack(e, next) ? opts.rerackBonusSec : 0);
  });
  return sec * 1000;
}

/** Median length of the last few completed sessions of a day, or null without any. */
export function typicalDurationMs(history: SessionRecord[], dayId: string, sample = 5): number | null {
  const durations = history
    .filter((s) => s.dayId === dayId && s.completed && s.endedAt)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, sample)
    .map((s) => (s.endedAt as number) - s.startedAt)
    .filter((d) => d > 5 * 60_000) // a session ended within five minutes was abandoned, not done
    .sort((a, b) => a - b);
  if (!durations.length) return null;
  const mid = Math.floor(durations.length / 2);
  return durations.length % 2 ? durations[mid] : Math.round((durations[mid - 1] + durations[mid]) / 2);
}
