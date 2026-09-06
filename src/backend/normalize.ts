import type { Exercise, Inventory, PlannedExercise, Program, SessionRecord, SessionState, Settings } from '../engine/types';
import { DEFAULT_INVENTORY, DEFAULT_PROGRAM, DEFAULT_SETTINGS } from '../engine/defaults';
import { DEFAULT_DEMO } from '../engine/session';

// RTDB drops empty arrays and null keys; these restore the shapes the engine expects.

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v && typeof v === 'object' ? (Object.values(v) as T[]) : []);

export function normalizeExercise(e: Partial<Exercise> & { id: string }): Exercise {
  return {
    id: e.id,
    name: e.name ?? e.id,
    load: e.load ?? 'pair',
    sets: e.sets ?? 3,
    repMin: e.repMin ?? 6,
    repMax: e.repMax ?? 12,
    restSec: e.restSec ?? 90,
    cue: e.cue ?? '',
    demo: e.demo ?? null,
    substitutes: arr<string>(e.substitutes),
    startWeightLb: e.startWeightLb ?? 0,
    perSide: !!e.perSide,
    notes: e.notes,
  };
}

export function normalizeProgram(p: Partial<Program> | null): Program {
  if (!p) return DEFAULT_PROGRAM;
  const exercises: Record<string, Exercise> = {};
  for (const [id, e] of Object.entries(p.exercises ?? {})) exercises[id] = normalizeExercise({ ...(e as Exercise), id });
  return {
    days: arr<Program['days'][number]>(p.days).map((d) => ({ ...d, entries: arr(d.entries) })),
    exercises,
    warmup: arr(p.warmup),
  };
}

export function normalizeInventory(i: Partial<Inventory> | null): Inventory {
  if (!i) return DEFAULT_INVENTORY;
  return {
    handleLb: i.handleLb ?? DEFAULT_INVENTORY.handleLb,
    collarLb: i.collarLb ?? DEFAULT_INVENTORY.collarLb,
    collarsPerHandle: i.collarsPerHandle ?? DEFAULT_INVENTORY.collarsPerHandle,
    handles: i.handles ?? DEFAULT_INVENTORY.handles,
    plates: arr(i.plates),
  };
}

export function normalizeSettings(s: Partial<Settings> | null): Settings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export function normalizePlanned(e: PlannedExercise): PlannedExercise {
  return {
    ...e,
    loading: e.loading ? { perEnd: arr<number>(e.loading.perEnd), dumbbellLb: e.loading.dumbbellLb } : null,
    substitutes: arr(e.substitutes),
    results: arr(e.results),
    stalled: e.stalled ?? 0,
    lastTime: e.lastTime ? { weightLb: e.lastTime.weightLb, reps: arr(e.lastTime.reps) } : null,
    demo: e.demo ?? null,
  };
}

export function normalizeSession(s: SessionState | null): SessionState | null {
  if (!s) return null;
  return {
    ...s,
    warmup: arr(s.warmup),
    exercises: arr<PlannedExercise>(s.exercises).map(normalizePlanned),
    paused: s.paused ?? null,
    demo: { ...DEFAULT_DEMO, ...(s.demo ?? {}), cmd: s.demo?.cmd ?? null },
    rev: s.rev ?? 0,
  };
}

export function normalizeRecord(r: SessionRecord): SessionRecord {
  return {
    ...r,
    endedAt: r.endedAt ?? null,
    completed: !!r.completed,
    exercises: arr<SessionRecord['exercises'][number]>(r.exercises).map((e) => ({ ...e, reps: arr(e.reps) })),
  };
}

export function normalizeRecords(v: Record<string, SessionRecord> | null): SessionRecord[] {
  if (!v) return [];
  return Object.values(v)
    .map(normalizeRecord)
    .sort((a, b) => a.startedAt - b.startedAt);
}
