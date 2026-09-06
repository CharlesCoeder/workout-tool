import { describe, expect, it } from 'vitest';
import { exerciseFrequency, forecastLift, forecastProgram, ladderSteps, progressionRate, simulateUpgrade, withPlates } from './forecast';
import { DEFAULT_INVENTORY as inv, DEFAULT_PROGRAM } from './defaults';
import { achievableWeights } from './plates';
import type { SessionRecord } from './types';

const WEEK = 7 * 86_400_000;
const now = new Date(2026, 8, 6, 12).getTime();

function rec(startedAt: number, exerciseId: string, weightLb: number, reps: number[], dayId = 'A'): SessionRecord {
  return {
    id: String(startedAt) + exerciseId,
    dayId,
    dayName: `Day ${dayId}`,
    startedAt,
    endedAt: startedAt + 1,
    completed: true,
    exercises: [{ exerciseId, name: exerciseId, load: 'pair', weightLb, reps }],
  };
}

describe('progression rate and frequency', () => {
  it('counts weight increases between consecutive sessions', () => {
    const h = [rec(1, 'curl', 9, [10, 9, 8]), rec(2, 'curl', 9, [12, 10, 9]), rec(3, 'curl', 14, [8, 7, 6]), rec(4, 'curl', 14, [9, 8, 7])];
    expect(progressionRate(h, 'curl')).toEqual({ rate: 1 / 3, sessions: 4 });
    expect(progressionRate([h[0]], 'curl')).toEqual({ rate: null, sessions: 1 });
    expect(progressionRate([], 'curl')).toEqual({ rate: null, sessions: 0 });
  });

  it('frequency comes from recent history, else from the program cadence', () => {
    const h = [rec(now - 5 * WEEK, 'curl', 9, [10]), rec(now - 4 * WEEK, 'curl', 9, [10]), rec(now - 3 * WEEK, 'curl', 9, [10]), rec(now - 2 * WEEK, 'curl', 9, [10]), rec(now - 1 * WEEK, 'curl', 9, [10])];
    expect(exerciseFrequency(DEFAULT_PROGRAM, h, 'curl', now, 3)).toBe(1);
    // curl is on one of three days; three sessions a week → once a week
    expect(exerciseFrequency(DEFAULT_PROGRAM, [], 'curl', now, 3)).toBe(1);
    // floor press is on two of three days
    expect(exerciseFrequency(DEFAULT_PROGRAM, [], 'floor-press', now, 3)).toBe(2);
    expect(exerciseFrequency(DEFAULT_PROGRAM, [], 'floor-press', now, 2)).toBe(1.3);
  });
});

describe('lift forecast', () => {
  const curl = DEFAULT_PROGRAM.exercises['curl'];
  const squat = DEFAULT_PROGRAM.exercises['squat'];

  it('reports steps left and time to the ceiling at the observed and best rates', () => {
    // 9 → 14 once over four sessions, one session a week
    const h = [rec(now - 4 * WEEK, 'curl', 9, [10, 9, 8]), rec(now - 3 * WEEK, 'curl', 9, [12, 10, 9]), rec(now - 2 * WEEK, 'curl', 14, [8, 7, 6]), rec(now - 1 * WEEK, 'curl', 14, [9, 8, 7])];
    const f = forecastLift(curl, DEFAULT_PROGRAM, h, inv, now, 'firstSet', 3)!;
    expect(f).toMatchObject({ currentLb: 14, ceilingLb: 19, stepsLeft: 1, atCeiling: false, sessions: 4, rate: 1 / 3, perWeek: 1 });
    expect(f.sessionsAtBest).toBe(1);
    expect(f.weeksAtBest).toBe(1);
    expect(f.sessionsAtRate).toBe(3);
    expect(f.weeksAtRate).toBe(3);
    expect(f.etaAtRate).toBe(now + 3 * WEEK);
  });

  it('is honest at the ceiling and without history', () => {
    const f = forecastLift(squat, DEFAULT_PROGRAM, [], inv, now, 'firstSet', 3)!;
    expect(f).toMatchObject({ currentLb: 19, ceilingLb: 19, stepsLeft: 0, atCeiling: true, rate: null, sessionsAtRate: null, weeksAtRate: null, etaAtRate: null });
    const g = forecastLift(curl, DEFAULT_PROGRAM, [], inv, now, 'firstSet', 3)!;
    expect(g).toMatchObject({ currentLb: 9, stepsLeft: 2, sessionsAtBest: 2, weeksAtBest: 2, rate: null });
    expect(forecastLift(DEFAULT_PROGRAM.exercises['situp'], DEFAULT_PROGRAM, [], inv, now, 'firstSet', 3)).toBeNull();
  });

  it('forecasts each weighted program exercise once', () => {
    const all = forecastProgram(DEFAULT_PROGRAM, [], inv, now, 'firstSet', 3);
    const ids = all.map((f) => f.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('floor-press'); // appears on A and C, listed once
    expect(ids).not.toContain('situp');
    expect(all.filter((f) => f.atCeiling).map((f) => f.exerciseId)).toEqual(['squat', 'sldl', 'shrug']);
  });
});

describe('ladders and upgrades', () => {
  it('describes the jumps on a ladder', () => {
    const steps = ladderSteps(achievableWeights(inv, 'pair'));
    expect(steps.map((s) => [s.from, s.to])).toEqual([
      [4, 9],
      [9, 14],
      [14, 19],
    ]);
    expect(steps[2].pct).toBeCloseTo(5 / 14, 5);
  });

  it('merges bought plates into the inventory', () => {
    const next = withPlates(inv, [{ lb: 5, count: 4 }, { lb: 10, count: 4 }]);
    expect(next.plates).toEqual([
      { lb: 10, count: 4 },
      { lb: 5, count: 8 },
      { lb: 2.5, count: 4 },
    ]);
    expect(withPlates(inv, [], 1).handles).toBe(3);
  });

  it('shows what four 10 lb plates would do', () => {
    const forecasts = forecastProgram(DEFAULT_PROGRAM, [], inv, now, 'firstSet', 3);
    const fx = simulateUpgrade(inv, [{ lb: 10, count: 4 }], forecasts);
    expect(fx.pairCeiling).toBe(39);
    expect(fx.pair).toEqual([4, 9, 14, 19, 24, 29, 34, 39]);
    expect(fx.newPair).toEqual([24, 29, 34, 39]);
    expect(fx.unblocked.map((u) => [u.exerciseId, u.steps])).toEqual([
      ['squat', 4],
      ['sldl', 4],
      ['shrug', 4],
    ]);
    expect(fx.worstJumpAfter).toBeCloseTo(fx.worstJumpBefore, 5); // the 4 → 9 jump at the bottom is unchanged
  });

  it('small plates make the steps gentler rather than the ceiling higher', () => {
    const fx = simulateUpgrade(inv, [{ lb: 1.25, count: 4 }], []);
    expect(fx.pairCeiling).toBe(21.5);
    expect(fx.newPair).toEqual([6.5, 11.5, 16.5, 21.5]);
    const before = ladderSteps(achievableWeights(inv, 'pair')).map((s) => s.pct);
    const after = ladderSteps(fx.pair).map((s) => s.pct);
    expect(Math.max(...after.slice(1))).toBeLessThan(Math.max(...before.slice(1)));
  });
});
