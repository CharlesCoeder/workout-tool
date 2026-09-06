import { describe, expect, it } from 'vitest';
import { e1rm, liftRecords, prForSet, priorBest, recordVolume, sessionPrs, sessionVolume, setVolume, targetReps } from './records';
import { createSession, reduce } from './session';
import { DEFAULT_PROGRAM } from './defaults';
import type { PlannedExercise, SessionRecord, SessionState } from './types';

const T0 = 1_000_000;
const opts = { readySec: 20, rerackBonusSec: 30 };

function rec(id: string, startedAt: number, exercises: { exerciseId: string; weightLb: number; reps: number[]; load?: 'pair' | 'single' | 'bodyweight' }[]): SessionRecord {
  return {
    id,
    dayId: 'A',
    dayName: 'Day A',
    startedAt,
    endedAt: startedAt + 1,
    completed: true,
    exercises: exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.exerciseId, load: e.load ?? 'pair', weightLb: e.weightLb, reps: e.reps })),
  };
}

function planned(overrides: Partial<PlannedExercise>): PlannedExercise {
  return {
    exerciseId: 'squat',
    name: 'Squat',
    load: 'pair',
    sets: 3,
    repMin: 6,
    repMax: 12,
    restSec: 60,
    cue: '',
    demo: null,
    perSide: false,
    substitutes: [],
    prescribedLb: 14,
    weightLb: 14,
    loading: { perEnd: [5], dumbbellLb: 14 },
    maxedOut: false,
    blocked: false,
    progressed: false,
    stalled: 0,
    lastTime: null,
    results: [],
    ...overrides,
  };
}

function live(exercises: PlannedExercise[]): SessionState {
  return createSession({ id: 'live', dayId: 'A', dayName: 'Day A', warmup: [], exercises }, T0);
}

function logAll(s: SessionState, reps: number[][]): SessionState {
  let t = T0;
  let st = reduce(s, { type: 'go' }, t, opts);
  for (const ex of reps) {
    for (const r of ex) {
      t += 60_000;
      st = reduce(st, { type: 'logReps', reps: r }, t, opts);
      if (st.phase.kind === 'rest') st = reduce(st, { type: 'skipRest' }, t + 1, opts);
    }
  }
  return st;
}

describe('estimates and volume', () => {
  it('Epley e1rm', () => {
    expect(e1rm(14, 1)).toBe(14);
    expect(e1rm(14, 10)).toBe(18.7);
    expect(e1rm(0, 10)).toBe(0);
    expect(e1rm(14, 0)).toBe(0);
  });

  it('set volume counts both dumbbells and both sides', () => {
    expect(setVolume(14, 10, 'pair', false)).toBe(280);
    expect(setVolume(14, 10, 'single', false)).toBe(140);
    expect(setVolume(14, 10, 'single', true)).toBe(280);
    expect(setVolume(0, 20, 'bodyweight', false)).toBe(0);
  });

  it('record volume uses the program for per-side lifts', () => {
    const r = rec('r', 1, [
      { exerciseId: 'one-arm-row', weightLb: 19, reps: [10, 10], load: 'single' },
      { exerciseId: 'situp', weightLb: 0, reps: [20], load: 'bodyweight' },
    ]);
    expect(recordVolume(r)).toBe(380);
    expect(recordVolume(r, DEFAULT_PROGRAM)).toBe(760);
  });

  it('live session volume', () => {
    const s = logAll(live([planned({})]), [[10, 9, 8]]);
    expect(sessionVolume(s)).toBe(14 * 27 * 2);
  });
});

describe('personal records', () => {
  const history = [rec('h1', 1, [{ exerciseId: 'squat', weightLb: 9, reps: [12, 12, 11] }]), rec('h2', 2, [{ exerciseId: 'squat', weightLb: 14, reps: [10, 9, 8] }])];

  it('summarises prior bests', () => {
    const b = priorBest(history, 'squat');
    expect(b.heaviest).toBe(14);
    expect(b.repsAtWeight.get(14)).toBe(10);
    expect(b.repsAtWeight.get(9)).toBe(12);
    expect(b.bestE1rm).toBe(e1rm(14, 10));
    expect(b.sessions).toBe(2);
    expect(priorBest(history, 'squat', 'h2').sessions).toBe(1);
  });

  it('nothing is a record the first time', () => {
    const s = logAll(live([planned({})]), [[12, 12, 12]]);
    expect(prForSet([], s, 0, 0)).toBeNull();
    expect(sessionPrs([], s)).toEqual([]);
  });

  it('a heavier weight is a weight PR, once per session', () => {
    const s = logAll(live([planned({ weightLb: 19 })]), [[8, 7, 6]]);
    expect(prForSet(history, s, 0, 0)).toEqual({ kind: 'weight', label: 'Heaviest yet' });
    // later sets at the same weight beat only their own earlier sets: 7 < 8, no record
    expect(prForSet(history, s, 0, 1)).toBeNull();
  });

  it('more reps at a known weight is a reps PR; equalling it is not', () => {
    const s = logAll(live([planned({})]), [[11, 10, 12]]);
    expect(prForSet(history, s, 0, 0)).toEqual({ kind: 'reps', label: 'Most reps at 14 lb' });
    expect(prForSet(history, s, 0, 1)).toBeNull();
    expect(prForSet(history, s, 0, 2)).toEqual({ kind: 'reps', label: 'Most reps at 14 lb' });
    expect(sessionPrs(history, s).map((p) => p.set)).toEqual([0, 2]);
  });

  it('a never-used lighter weight can still be a strength PR by estimate', () => {
    // prior best e1rm is 14×10 = 18.7; 12.5 lb × 15 reps = 18.75 → higher
    const s = logAll(live([planned({ weightLb: 12.5 })]), [[15]]);
    expect(prForSet(history, s, 0, 0)).toEqual({ kind: 'e1rm', label: 'Strongest set yet (est.)' });
  });

  it('bodyweight lifts count reps only', () => {
    const hist = [rec('h', 1, [{ exerciseId: 'situp', weightLb: 0, reps: [20, 18], load: 'bodyweight' }])];
    const s = logAll(live([planned({ exerciseId: 'situp', load: 'bodyweight', weightLb: 0, loading: null })]), [[21, 19]]);
    expect(prForSet(hist, s, 0, 0)).toEqual({ kind: 'bwReps', label: 'Most reps yet' });
    expect(prForSet(hist, s, 0, 1)).toBeNull();
  });

  it('zero-rep sets are never records', () => {
    const s = logAll(live([planned({ weightLb: 19 })]), [[0]]);
    expect(prForSet(history, s, 0, 0)).toBeNull();
  });

  it('all-time lift records', () => {
    const r = liftRecords(history, 'squat');
    expect(r.heaviest).toEqual({ weightLb: 14, reps: 10, at: 2 });
    expect(r.mostReps).toEqual({ weightLb: 9, reps: 12, at: 1 });
    expect(r.bestE1rm?.e1rm).toBe(e1rm(14, 10));
    expect(r.sessions).toBe(2);
    expect(r.totalSets).toBe(6);
    expect(liftRecords(history, 'curl')).toMatchObject({ heaviest: null, sessions: 0 });
  });
});

describe('target reps (beat the logbook)', () => {
  it('is null the first time', () => {
    expect(targetReps(planned({}), 0)).toBeNull();
  });

  it('asks for one more than the same set last time, capped at the top', () => {
    const ex = planned({ lastTime: { weightLb: 14, reps: [10, 9, 7] } });
    expect(targetReps(ex, 0)).toEqual({ reps: 11, reason: 'beat', lastReps: 10 });
    expect(targetReps(ex, 2)).toEqual({ reps: 8, reason: 'beat', lastReps: 7 });
    // a fourth set (more sets than last time) follows the last known set
    expect(targetReps(ex, 3)).toEqual({ reps: 8, reason: 'beat', lastReps: 7 });
    expect(targetReps(planned({ lastTime: { weightLb: 14, reps: [12, 12, 12] } }), 0)).toEqual({ reps: 12, reason: 'top', lastReps: 12 });
    expect(targetReps(planned({ lastTime: { weightLb: 14, reps: [3] } }), 0)).toEqual({ reps: 6, reason: 'beat', lastReps: 3 });
  });

  it('aims for the bottom of the range at a new weight', () => {
    const ex = planned({ weightLb: 19, lastTime: { weightLb: 14, reps: [12, 11, 10] } });
    expect(targetReps(ex, 0)).toEqual({ reps: 6, reason: 'newWeight', lastReps: null });
  });

  it('bodyweight ignores the weight', () => {
    const ex = planned({ load: 'bodyweight', weightLb: 0, repMin: 10, repMax: 25, lastTime: { weightLb: 0, reps: [20] } });
    expect(targetReps(ex, 0)).toEqual({ reps: 21, reason: 'beat', lastReps: 20 });
  });
});
