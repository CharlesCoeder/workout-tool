import { describe, expect, it } from 'vitest';
import { createSession, needsRerack, progress, reduce, remainingMs, settle } from './session';
import { planDay, planSession, suggestNextDay, toRecord } from './plan';
import { DEFAULT_INVENTORY as inv, DEFAULT_PROGRAM } from './defaults';
import type { PlannedExercise, SessionState } from './types';

const opts = { readySec: 20, rerackBonusSec: 30 };
const T0 = 1_000_000;

function planned(overrides: Partial<PlannedExercise>): PlannedExercise {
  return {
    exerciseId: 'x',
    name: 'X',
    load: 'pair',
    sets: 2,
    repMin: 6,
    repMax: 12,
    restSec: 60,
    cue: '',
    demo: null,
    perSide: false,
    substitutes: [],
    prescribedLb: 9,
    weightLb: 9,
    loading: { perEnd: [2.5], dumbbellLb: 9 },
    maxedOut: false,
    blocked: false,
    progressed: false,
    stalled: 0,
    lastTime: null,
    results: [],
    ...overrides,
  };
}

function twoExercises(): SessionState {
  return createSession(
    {
      id: 's1',
      dayId: 'A',
      dayName: 'Day A',
      warmup: [
        { name: 'w1', seconds: 10 },
        { name: 'w2', seconds: 5 },
      ],
      exercises: [
        planned({ exerciseId: 'a', name: 'A' }),
        planned({ exerciseId: 'b', name: 'B', weightLb: 19, loading: { perEnd: [5, 2.5], dumbbellLb: 19 } }),
      ],
    },
    T0,
  );
}

describe('session state machine', () => {
  it('starts in warm-up and chains steps by time', () => {
    const s = twoExercises();
    expect(s.phase).toEqual({ kind: 'warmup', step: 0, endsAt: T0 + 10_000 });
    expect(settle(s, T0 + 9_999, opts).phase.kind).toBe('warmup');
    const s2 = settle(s, T0 + 12_000, opts);
    expect(s2.phase).toEqual({ kind: 'warmup', step: 1, endsAt: T0 + 15_000 });
    const s3 = settle(s, T0 + 16_000, opts);
    expect(s3.phase).toEqual({ kind: 'ready', endsAt: T0 + 35_000 });
    // ready expires straight into working
    expect(settle(s, T0 + 35_000, opts).phase).toEqual({ kind: 'working' });
  });

  it('skips warm-up on demand', () => {
    const s = reduce(twoExercises(), { type: 'skipWarmup' }, T0 + 1000, opts);
    expect(s.phase).toEqual({ kind: 'ready', endsAt: T0 + 1000 + 20_000 });
    expect(s.rev).toBe(1);
  });

  it('skipWarmupStep advances one step', () => {
    const s = reduce(twoExercises(), { type: 'skipWarmupStep' }, T0 + 1000, opts);
    expect(s.phase).toEqual({ kind: 'warmup', step: 1, endsAt: T0 + 1000 + 5000 });
  });

  it('runs the whole happy path with one tap per set', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0 + 1000, opts);
    expect(s.phase.kind).toBe('working');

    // set 1 of A
    let t = T0 + 30_000;
    s = reduce(s, { type: 'logReps', reps: 10 }, t, opts);
    expect(s.exercises[0].results).toEqual([{ weightLb: 9, reps: 10, at: t }]);
    expect(s.cursor).toEqual({ ex: 0, set: 1 });
    expect(s.phase).toEqual({ kind: 'rest', endsAt: t + 60_000, durationSec: 60, rerack: false });

    // rest expires → working
    t += 60_000;
    expect(settle(s, t, opts).phase.kind).toBe('working');

    // set 2 of A → rest before B, with re-rack bonus (9 → 19 lb)
    t += 30_000;
    s = reduce(s, { type: 'logReps', reps: 9 }, t, opts);
    expect(s.cursor).toEqual({ ex: 1, set: 0 });
    expect(s.phase).toEqual({ kind: 'rest', endsAt: t + 90_000, durationSec: 90, rerack: true });

    // skip the rest
    s = reduce(s, { type: 'skipRest' }, t + 5000, opts);
    expect(s.phase.kind).toBe('working');

    // B set 1, B set 2 → summary
    s = reduce(s, { type: 'logReps', reps: 12 }, t + 40_000, opts);
    expect(s.phase.kind).toBe('rest');
    s = reduce(s, { type: 'logReps', reps: 11 }, t + 120_000, opts);
    expect(s.phase.kind).toBe('summary');
    expect(s.endedAt).toBe(t + 120_000);
    expect(progress(s)).toEqual({ setsDone: 4, setsTotal: 4, exercisesDone: 2, exercisesTotal: 2 });

    const rec = toRecord(s);
    expect(rec.completed).toBe(true);
    expect(rec.exercises).toEqual([
      { exerciseId: 'a', name: 'A', load: 'pair', weightLb: 9, reps: [10, 9], maxedOut: undefined },
      { exerciseId: 'b', name: 'B', load: 'pair', weightLb: 19, reps: [12, 11], maxedOut: undefined },
    ]);
  });

  it('supports done → how many (voice path)', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'setDone' }, T0 + 1000, opts);
    expect(s.phase.kind).toBe('logging');
    s = reduce(s, { type: 'logReps', reps: 8 }, T0 + 2000, opts);
    expect(s.phase.kind).toBe('rest');
  });

  it('ignores reps while resting', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'logReps', reps: 8 }, T0 + 1000, opts);
    const before = s;
    s = reduce(s, { type: 'logReps', reps: 8 }, T0 + 2000, opts);
    expect(s).toBe(before);
  });

  it('pauses and resumes preserving remaining time', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'logReps', reps: 8 }, T0, opts); // rest 60s
    s = reduce(s, { type: 'pause' }, T0 + 20_000, opts);
    expect(s.paused).toEqual({ remainingMs: 40_000 });
    // time passes while paused; nothing settles
    expect(settle(s, T0 + 500_000, opts).phase.kind).toBe('rest');
    expect(remainingMs(s, T0 + 500_000)).toBe(40_000);
    // actions other than resume are ignored
    expect(reduce(s, { type: 'skipRest' }, T0 + 500_000, opts)).toBe(s);
    s = reduce(s, { type: 'resume' }, T0 + 500_000, opts);
    expect(s.paused).toBeNull();
    expect(s.phase).toMatchObject({ kind: 'rest', endsAt: T0 + 540_000 });
  });

  it('extends rest', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'logReps', reps: 8 }, T0, opts);
    s = reduce(s, { type: 'extendRest', seconds: 30 }, T0 + 10_000, opts);
    expect(s.phase).toMatchObject({ kind: 'rest', endsAt: T0 + 90_000 });
  });

  it('overrides the weight for the current exercise only', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'overrideWeight', weightLb: 14, loading: { perEnd: [5], dumbbellLb: 14 } }, T0, opts);
    expect(s.exercises[0].weightLb).toBe(14);
    expect(s.exercises[0].prescribedLb).toBe(9);
    expect(s.exercises[1].weightLb).toBe(19);
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'logReps', reps: 8 }, T0, opts);
    expect(s.exercises[0].results[0].weightLb).toBe(14);
  });

  it('substitutes the current exercise and gives a ready countdown', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    const sub = planned({ exerciseId: 'c', name: 'C', load: 'single', weightLb: 24, loading: { perEnd: [5, 5], dumbbellLb: 24 } });
    s = reduce(s, { type: 'substitute', exercise: sub }, T0 + 1000, opts);
    expect(s.exercises[0]).toMatchObject({ exerciseId: 'c', substitutedFrom: 'a', results: [] });
    expect(s.phase).toEqual({ kind: 'ready', endsAt: T0 + 1000 + 50_000 }); // 20 + 30 re-rack
  });

  it('skips an exercise and finishes when none remain', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'skipExercise' }, T0, opts);
    expect(s.exercises[0].skipped).toBe(true);
    expect(s.cursor).toEqual({ ex: 1, set: 0 });
    expect(s.phase.kind).toBe('ready');
    s = reduce(s, { type: 'skipExercise' }, T0, opts);
    expect(s.phase.kind).toBe('summary');
    expect(progress(s).setsTotal).toBe(0);
  });

  it('ends early with a partial record', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'logReps', reps: 8 }, T0, opts);
    s = reduce(s, { type: 'endSession' }, T0 + 5000, opts);
    expect(s.phase.kind).toBe('summary');
    expect(toRecord(s).exercises).toHaveLength(1);
  });

  it('demo stays enlarged until hidden or the set starts, and works while paused', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'showDemo' }, T0, opts);
    expect(s.demo.enlarged).toBe(true);
    s = reduce(s, { type: 'pause' }, T0 + 1000, opts);
    s = reduce(s, { type: 'demoRate', rate: 0.5 }, T0 + 1000, opts);
    s = reduce(s, { type: 'demoCommand', cmd: { type: 'seekBy', seconds: -5 } }, T0 + 2000, opts);
    expect(s.demo).toMatchObject({ enlarged: true, rate: 0.5, seq: 1, cmd: { type: 'seekBy', seconds: -5 } });
    s = reduce(s, { type: 'resume' }, T0 + 3000, opts);
    expect(s.demo.enlarged).toBe(true);
    // ready countdown expiring into the set hides it
    s = settle(s, T0 + 60_000, opts);
    expect(s.phase.kind).toBe('working');
    expect(s.demo.enlarged).toBe(false);
    expect(s.demo.rate).toBe(0.5);
    s = reduce(s, { type: 'showDemo' }, T0 + 61_000, opts);
    s = reduce(s, { type: 'hideDemo' }, T0 + 62_000, opts);
    expect(s.demo.enlarged).toBe(false);
  });

  it('demo sound is on by default and the mute toggle survives phase changes', () => {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    expect(s.demo.muted).toBe(false);
    const same = reduce(s, { type: 'demoMuted', muted: false }, T0, opts);
    expect(same).toBe(s); // no-op write avoided
    s = reduce(s, { type: 'demoMuted', muted: true }, T0 + 1000, opts);
    expect(s.demo.muted).toBe(true);
    s = reduce(s, { type: 'demoCommand', cmd: { type: 'seekTo', seconds: 42 } }, T0 + 2000, opts);
    expect(s.demo).toMatchObject({ muted: true, seq: 1, cmd: { type: 'seekTo', seconds: 42 } });
    s = settle(s, T0 + 60_000, opts);
    expect(s.phase.kind).toBe('working');
    expect(s.demo.muted).toBe(true);
  });

  it('needsRerack detects plate and mode changes', () => {
    const a = planned({ load: 'pair', loading: { perEnd: [5], dumbbellLb: 14 } });
    const b = planned({ load: 'pair', loading: { perEnd: [5], dumbbellLb: 14 } });
    const c = planned({ load: 'single', loading: { perEnd: [5], dumbbellLb: 14 } });
    const bw = planned({ load: 'bodyweight', loading: null });
    expect(needsRerack(a, b)).toBe(false);
    expect(needsRerack(a, c)).toBe(true);
    expect(needsRerack(a, bw)).toBe(false);
    expect(needsRerack(bw, a)).toBe(true);
  });
});

describe('planning a day', () => {
  it('plans Day A from defaults with buildable weights and loadings', () => {
    const plan = planDay(DEFAULT_PROGRAM, DEFAULT_PROGRAM.days[0], [], inv);
    expect(plan.map((p) => p.exerciseId)).toEqual(['squat', 'floor-press', 'one-arm-row', 'curl', 'overhead-extension', 'situp']);
    for (const p of plan) {
      if (p.load === 'bodyweight') expect(p.loading).toBeNull();
      else expect(p.loading?.dumbbellLb).toBe(p.weightLb);
    }
    expect(plan[0]).toMatchObject({ weightLb: 19, maxedOut: true });
  });

  it('planSession starts at warm-up and suggestNextDay cycles', () => {
    const s = planSession(DEFAULT_PROGRAM, 'B', [], inv, T0, 'id');
    expect(s.phase.kind).toBe('warmup');
    expect(s.exercises).toHaveLength(8);
    expect(suggestNextDay(DEFAULT_PROGRAM, [])?.id).toBe('A');
    expect(suggestNextDay(DEFAULT_PROGRAM, [toRecord(s)])?.id).toBe('C');
  });
});

describe('corrections: undo, edit, notes', () => {
  function afterTwoSets(): SessionState {
    let s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'logReps', reps: 10 }, T0 + 30_000, opts);
    s = reduce(s, { type: 'skipRest' }, T0 + 31_000, opts);
    s = reduce(s, { type: 'logReps', reps: 9 }, T0 + 60_000, opts);
    return s; // resting before B, A done: [10, 9]
  }

  it('undo takes back the last set and returns to it, dropping the rest timer', () => {
    let s = afterTwoSets();
    expect(s.cursor).toEqual({ ex: 1, set: 0 });
    expect(s.phase.kind).toBe('rest');
    s = reduce(s, { type: 'undoSet' }, T0 + 70_000, opts);
    expect(s.exercises[0].results.map((r) => r.reps)).toEqual([10]);
    expect(s.cursor).toEqual({ ex: 0, set: 1 });
    expect(s.phase).toEqual({ kind: 'working' });
    // logging again continues normally
    s = reduce(s, { type: 'logReps', reps: 11 }, T0 + 80_000, opts);
    expect(s.exercises[0].results.map((r) => r.reps)).toEqual([10, 11]);
    expect(s.cursor).toEqual({ ex: 1, set: 0 });
    expect(s.phase.kind).toBe('rest');
  });

  it('undo with nothing logged is a no-op', () => {
    const s = reduce(twoExercises(), { type: 'skipWarmup' }, T0, opts);
    expect(reduce(s, { type: 'undoSet' }, T0 + 1, opts)).toBe(s);
  });

  it('undo re-opens a finished session', () => {
    let s = afterTwoSets();
    s = reduce(s, { type: 'skipRest' }, T0 + 61_000, opts);
    s = reduce(s, { type: 'logReps', reps: 12 }, T0 + 90_000, opts);
    s = reduce(s, { type: 'skipRest' }, T0 + 91_000, opts);
    s = reduce(s, { type: 'logReps', reps: 8 }, T0 + 120_000, opts);
    expect(s.phase.kind).toBe('summary');
    expect(s.endedAt).toBe(T0 + 120_000);
    s = reduce(s, { type: 'undoSet' }, T0 + 130_000, opts);
    expect(s.phase.kind).toBe('working');
    expect(s.endedAt).toBeUndefined();
    expect(s.cursor).toEqual({ ex: 1, set: 1 });
    expect(s.exercises[1].results.map((r) => r.reps)).toEqual([12]);
    s = reduce(s, { type: 'logReps', reps: 10 }, T0 + 140_000, opts);
    expect(s.phase.kind).toBe('summary');
    expect(toRecord(s).exercises[1].reps).toEqual([12, 10]);
  });

  it('undo un-skips an exercise that was skipped after a logged set', () => {
    let s = afterTwoSets();
    s = reduce(s, { type: 'skipRest' }, T0 + 61_000, opts);
    s = reduce(s, { type: 'logReps', reps: 12 }, T0 + 90_000, opts); // B set 1
    s = reduce(s, { type: 'skipExercise' }, T0 + 91_000, opts); // gives up on B → summary
    expect(s.phase.kind).toBe('summary');
    s = reduce(s, { type: 'undoSet' }, T0 + 92_000, opts);
    expect(s.exercises[1].skipped).toBeUndefined();
    expect(s.cursor).toEqual({ ex: 1, set: 0 });
    expect(progress(s).setsTotal).toBe(4);
  });

  it('undo works while paused and keeps the session paused', () => {
    let s = afterTwoSets();
    s = reduce(s, { type: 'pause' }, T0 + 65_000, opts);
    s = reduce(s, { type: 'undoSet' }, T0 + 66_000, opts);
    expect(s.paused).toEqual({ remainingMs: null });
    expect(s.phase.kind).toBe('working');
    s = reduce(s, { type: 'resume' }, T0 + 67_000, opts);
    expect(s.paused).toBeNull();
    expect(s.phase.kind).toBe('working');
  });

  it('edits a logged set in place without touching the phase', () => {
    let s = afterTwoSets();
    const before = s;
    s = reduce(s, { type: 'editSet', ex: 0, set: 0, reps: 12 }, T0 + 70_000, opts);
    expect(s.exercises[0].results.map((r) => r.reps)).toEqual([12, 9]);
    expect(s.exercises[0].results[0].at).toBe(T0 + 30_000);
    expect(s.phase).toEqual(before.phase);
    expect(s.cursor).toEqual(before.cursor);
    // out of range or unchanged → no write
    expect(reduce(s, { type: 'editSet', ex: 0, set: 5, reps: 3 }, T0 + 71_000, opts)).toBe(s);
    expect(reduce(s, { type: 'editSet', ex: 0, set: 0, reps: 12 }, T0 + 71_000, opts)).toBe(s);
  });

  it('notes attach to the session or an exercise and clear when blank', () => {
    let s = afterTwoSets();
    s = reduce(s, { type: 'note', text: '  Slept badly ' }, T0, opts);
    expect(s.note).toBe('Slept badly');
    s = reduce(s, { type: 'note', ex: 0, text: 'Right knee clicked on rep 8' }, T0, opts);
    expect(s.exercises[0].note).toBe('Right knee clicked on rep 8');
    const rec = toRecord(s);
    expect(rec.note).toBe('Slept badly');
    expect(rec.exercises[0].note).toBe('Right knee clicked on rep 8');
    s = reduce(s, { type: 'note', text: '' }, T0, opts);
    expect(s.note).toBeUndefined();
    expect(reduce(s, { type: 'note', text: '' }, T0, opts)).toBe(s);
  });
});
