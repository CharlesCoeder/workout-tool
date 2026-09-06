import { describe, expect, it } from 'vitest';
import { addDays, consistency, dayKey, daysBetween, estimateSessionMs, plannedSetsPerMuscle, setsPerMuscle, startOfWeek, typicalDurationMs, weeklyStats } from './stats';
import { planDay } from './plan';
import { DEFAULT_INVENTORY as inv, DEFAULT_PROGRAM } from './defaults';
import type { SessionRecord } from './types';

// Local-time dates so the tests pass in any zone.
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();

function rec(startedAt: number, dayId = 'A', minutes = 40, exercises: SessionRecord['exercises'] = []): SessionRecord {
  return { id: String(startedAt), dayId, dayName: `Day ${dayId}`, startedAt, endedAt: startedAt + minutes * 60_000, completed: true, exercises };
}

describe('calendar helpers', () => {
  it('weeks start on Monday', () => {
    const wed = at(2026, 9, 2); // Wednesday
    expect(dayKey(startOfWeek(wed))).toBe('2026-08-31');
    expect(dayKey(startOfWeek(at(2026, 8, 31, 0)))).toBe('2026-08-31'); // Monday stays put
    expect(dayKey(startOfWeek(at(2026, 9, 6, 23)))).toBe('2026-08-31'); // Sunday belongs to the week before
  });

  it('day arithmetic is by calendar day', () => {
    expect(daysBetween(at(2026, 9, 1, 23), at(2026, 9, 2, 1))).toBe(1);
    expect(dayKey(addDays(at(2026, 8, 31), 7))).toBe('2026-09-07');
  });
});

describe('weekly stats and consistency', () => {
  const now = at(2026, 9, 6, 12); // Sunday
  const history = [
    rec(at(2026, 8, 17)), // two weeks ago, Mon
    rec(at(2026, 8, 19)), // Wed
    rec(at(2026, 8, 26)), // last week, Wed
    rec(at(2026, 8, 31)), // this week, Mon
    rec(at(2026, 9, 4), 'B', 45, [{ exerciseId: 'squat', name: 'Squat', load: 'pair', weightLb: 14, reps: [10, 9, 8] }]), // Fri
  ];

  it('buckets sessions into the last N weeks, oldest first', () => {
    const w = weeklyStats(history, DEFAULT_PROGRAM, 3, now);
    expect(w.map((x) => dayKey(x.start))).toEqual(['2026-08-17', '2026-08-24', '2026-08-31']);
    expect(w.map((x) => x.sessions)).toEqual([2, 1, 2]);
    expect(w[2].days).toEqual([0, 4]);
    expect(w[2].sets).toBe(3);
    expect(w[2].volumeLb).toBe(14 * 27 * 2);
    expect(w[2].minutes).toBe(85);
  });

  it('summarises adherence', () => {
    const c = consistency(history, 3, now);
    expect(c.thisWeek).toBe(2);
    expect(c.target).toBe(3);
    expect(c.lastSessionAt).toBe(at(2026, 9, 4));
    expect(c.daysSince).toBe(2);
    expect(c.recentPerWeek).toBe(0.8); // 3 sessions over the previous four weeks
    expect(c.activeWeeks).toBe(3);
    expect(c.totalSessions).toBe(5);
    expect(consistency([], 3, now)).toMatchObject({ thisWeek: 0, lastSessionAt: null, daysSince: null, recentPerWeek: 0 });
  });
});

describe('muscle balance', () => {
  it('credits the main muscle fully and the others half', () => {
    const week = startOfWeek(at(2026, 8, 31));
    const history = [
      rec(at(2026, 8, 31), 'A', 40, [
        { exerciseId: 'squat', name: 'Squat', load: 'pair', weightLb: 14, reps: [10, 9, 8] },
        { exerciseId: 'curl', name: 'Curl', load: 'pair', weightLb: 9, reps: [10, 0] },
      ]),
      rec(at(2026, 9, 8), 'A', 40, [{ exerciseId: 'squat', name: 'Squat', load: 'pair', weightLb: 14, reps: [10] }]), // next week
    ];
    const m = setsPerMuscle(history, DEFAULT_PROGRAM, week);
    expect(m.get('quads')).toBe(3);
    expect(m.get('glutes')).toBe(1.5);
    expect(m.get('biceps')).toBe(1); // the zero-rep set does not count
    expect(m.get('chest')).toBeUndefined();
  });

  it('adds up what the program prescribes across all days', () => {
    const m = plannedSetsPerMuscle(DEFAULT_PROGRAM);
    // squat A (3) + step-up B (3) + lunge C (3) = 9 direct quad sets
    expect(m.get('quads')).toBe(9);
    // curl A (3) + hammer curl C (3) + half of rows A, B and chin-up-free B rows
    expect(m.get('biceps')).toBe(3 + 3 + 1.5 + 1.5);
    expect(m.get('core')).toBe(6);
  });
});

describe('session length', () => {
  it('estimates a planned day from sets, rests, warm-up and plate changes', () => {
    const day = DEFAULT_PROGRAM.days[0];
    const plan = planDay(DEFAULT_PROGRAM, day, [], inv);
    const ms = estimateSessionMs(plan, DEFAULT_PROGRAM.warmup, { readySec: 20, rerackBonusSec: 30 });
    const min = ms / 60_000;
    expect(min).toBeGreaterThan(25);
    expect(min).toBeLessThan(50);
    // no warm-up, one exercise, 3 sets: 3 sets × (10 + 3×9) + 2 rests × 90 + ready 20
    const one = estimateSessionMs([plan[0]], [], { readySec: 20, rerackBonusSec: 30 });
    expect(one).toBe((3 * 37 + 180 + 20) * 1000);
  });

  it('uses the median of recent completed sessions of a day', () => {
    const h = [rec(at(2026, 8, 3), 'A', 40), rec(at(2026, 8, 10), 'A', 30), rec(at(2026, 8, 17), 'A', 50), rec(at(2026, 8, 19), 'B', 90), rec(at(2026, 8, 24), 'A', 2)];
    expect(typicalDurationMs(h, 'A')).toBe(40 * 60_000);
    expect(typicalDurationMs(h, 'B')).toBe(90 * 60_000);
    expect(typicalDurationMs(h, 'C')).toBeNull();
  });
});
