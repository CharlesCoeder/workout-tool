import { describe, expect, it } from 'vitest';
import { prescribe } from './progression';
import { DEFAULT_INVENTORY as inv, DEFAULT_PROGRAM } from './defaults';
import type { Inventory, SessionRecord } from './types';

const squat = DEFAULT_PROGRAM.exercises['squat'];
const row = DEFAULT_PROGRAM.exercises['one-arm-row'];
const situp = DEFAULT_PROGRAM.exercises['situp'];

function session(startedAt: number, exerciseId: string, weightLb: number, reps: number[]): SessionRecord {
  return {
    id: String(startedAt),
    dayId: 'A',
    dayName: 'Day A',
    startedAt,
    endedAt: startedAt + 1000,
    completed: true,
    exercises: [{ exerciseId, name: exerciseId, load: 'pair', weightLb, reps }],
  };
}

describe('progression rule', () => {
  it('uses the start weight, snapped, with no history', () => {
    const p = prescribe({ ...squat, startWeightLb: 12 }, [], inv);
    expect(p.weightLb).toBe(14);
    expect(p.progressed).toBe(false);
    expect(p.lastTime).toBeNull();
  });

  it('adds one step when the first set hit the top of the range', () => {
    const p = prescribe(squat, [session(1, 'squat', 9, [12, 10, 9])], inv);
    expect(p).toMatchObject({ weightLb: 14, progressed: true, maxedOut: false, blocked: false });
    expect(p.lastTime).toEqual({ weightLb: 9, reps: [12, 10, 9] });
  });

  it('does not add weight when only a later set hit the top', () => {
    const p = prescribe(squat, [session(1, 'squat', 9, [11, 12, 12])], inv);
    expect(p).toMatchObject({ weightLb: 9, progressed: false });
  });

  it('holds the weight when reps fall short', () => {
    const p = prescribe(squat, [session(1, 'squat', 14, [8, 7, 6])], inv);
    expect(p).toMatchObject({ weightLb: 14, progressed: false });
  });

  it('uses the most recent session, not the heaviest', () => {
    const hist = [session(1, 'squat', 14, [12, 12, 12]), session(2, 'squat', 9, [8, 8, 8])];
    expect(prescribe(squat, hist, inv).weightLb).toBe(9);
  });

  it('flags maxed out and stays put at the ceiling', () => {
    const p = prescribe(squat, [session(1, 'squat', 19, [12, 12, 11])], inv);
    expect(p).toMatchObject({ weightLb: 19, maxedOut: true, blocked: true, progressed: false });
  });

  it('flags maxed out (not blocked) when the bump lands on the ceiling', () => {
    const p = prescribe(squat, [session(1, 'squat', 14, [12, 10, 9])], inv);
    expect(p).toMatchObject({ weightLb: 19, maxedOut: true, blocked: false, progressed: true });
  });

  it('progresses again once plates are added', () => {
    const bigger: Inventory = { ...inv, plates: [{ lb: 5, count: 8 }, { lb: 2.5, count: 4 }] };
    const p = prescribe(squat, [session(1, 'squat', 19, [12, 12, 11])], bigger);
    expect(p).toMatchObject({ weightLb: 24, maxedOut: false, progressed: true });
  });

  it('snaps down when the last weight is no longer buildable', () => {
    const smaller: Inventory = { ...inv, plates: [{ lb: 5, count: 4 }] };
    const p = prescribe(squat, [session(1, 'squat', 19, [8, 8, 8])], smaller);
    expect(p.weightLb).toBe(14);
  });

  it('respects a per-day rep max override', () => {
    const p = prescribe(squat, [session(1, 'squat', 9, [10, 9, 9])], inv, 10);
    expect(p.weightLb).toBe(14);
  });

  it('single-dumbbell lifts step through the single ladder', () => {
    const p = prescribe(row, [session(1, 'one-arm-row', 29, [12, 12, 12])], inv);
    expect(p).toMatchObject({ weightLb: 34, maxedOut: true, progressed: true });
  });

  it('bodyweight exercises carry reps only', () => {
    const p = prescribe(situp, [session(1, 'situp', 0, [25, 20, 18])], inv);
    expect(p).toMatchObject({ weightLb: 0, maxedOut: false, progressed: false });
    expect(p.lastTime?.reps).toEqual([25, 20, 18]);
  });
});

describe('progression rule and stalls', () => {
  it('"all sets" needs every set at the top', () => {
    const hist = [session(1, 'squat', 9, [12, 12, 11])];
    expect(prescribe(squat, hist, inv, undefined, 'firstSet')).toMatchObject({ weightLb: 14, progressed: true });
    expect(prescribe(squat, hist, inv, undefined, 'allSets')).toMatchObject({ weightLb: 9, progressed: false });
    expect(prescribe(squat, [session(1, 'squat', 9, [12, 12, 12])], inv, undefined, 'allSets')).toMatchObject({ weightLb: 14, progressed: true });
  });

  it('climbing the rep range is progress, not a stall', () => {
    const hist = [session(1, 'squat', 9, [12, 10, 9]), session(2, 'squat', 14, [9, 8, 7]), session(3, 'squat', 14, [10, 8, 7]), session(4, 'squat', 14, [10, 9, 8])];
    expect(prescribe(squat, hist, inv)).toMatchObject({ weightLb: 14, progressed: false, stalled: 0 });
  });

  it('counts sessions in a row that failed to beat the one before', () => {
    const hist = [
      session(1, 'squat', 9, [12, 10, 9]), // earned → moved to 14
      session(2, 'squat', 14, [9, 8, 7]),
      session(3, 'squat', 14, [9, 8, 7]), // no better
      session(4, 'squat', 14, [9, 7, 7]), // worse
      session(5, 'squat', 14, [8, 8, 7]), // same total, first set down
    ];
    expect(prescribe(squat, hist, inv)).toMatchObject({ weightLb: 14, progressed: false, stalled: 3 });
    // any improvement resets the count: one more rep in total is enough
    expect(prescribe(squat, [...hist, session(6, 'squat', 14, [8, 8, 8])], inv).stalled).toBe(0);
    // earning the step resets it too
    expect(prescribe(squat, [...hist, session(6, 'squat', 14, [12, 9, 8])], inv)).toMatchObject({ weightLb: 19, progressed: true, stalled: 0 });
    // a session at a different weight breaks the run
    expect(prescribe(squat, [session(1, 'squat', 14, [8, 8, 8]), session(2, 'squat', 9, [8, 8, 8]), session(3, 'squat', 14, [8, 8, 8])], inv).stalled).toBe(0);
    expect(prescribe(squat, [session(1, 'squat', 14, [8, 8, 8]), session(2, 'squat', 14, [8, 8, 8])], inv).stalled).toBe(1);
    expect(prescribe(squat, [], inv).stalled).toBe(0);
  });
});
