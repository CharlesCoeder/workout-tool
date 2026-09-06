import { describe, expect, it } from 'vitest';
import { adjustment, bmr, calorieFloor, targets, tdee, type Profile } from './nutrition';

const now = new Date(2026, 8, 6).getTime();
const man: Profile = { sex: 'male', birthYear: 1996, heightIn: 70, activity: 'light', goal: 'lose', rateLbPerWeek: 1 };

describe('energy equations', () => {
  it('Mifflin-St Jeor for a 30-year-old, 180 lb, 5\'10" man', () => {
    expect(bmr(man, 180, now)).toBe(1783);
    expect(tdee(man, 180, now)).toBe(2452);
  });

  it('women subtract 161 instead of adding 5', () => {
    expect(bmr({ ...man, sex: 'female' }, 180, now)).toBe(1783 - 166);
  });
});

describe('targets', () => {
  it('a pound a week is 500 kcal a day below maintenance, with protein at the top of the range', () => {
    const t = targets(man, 180, now);
    expect(t.delta).toBe(-500);
    expect(t.calories).toBe(1950);
    expect(t.floored).toBe(false);
    expect(t.proteinRange).toEqual([126, 180]);
    expect(t.protein).toBe(180);
    expect(t.fat).toBe(65);
    expect(t.carbs).toBe(Math.round((1950 - 720 - 585) / 4));
  });

  it('gaining adds calories and asks for a little less protein', () => {
    const t = targets({ ...man, goal: 'gain', rateLbPerWeek: 0.5 }, 180, now);
    expect(t.delta).toBe(250);
    expect(t.calories).toBe(2700);
    expect(t.protein).toBe(144);
  });

  it('maintaining sits at maintenance whatever the rate says', () => {
    expect(targets({ ...man, goal: 'maintain', rateLbPerWeek: 2 }, 180, now).calories).toBe(2450);
  });

  it('never goes below the floor', () => {
    const small: Profile = { sex: 'female', birthYear: 1990, heightIn: 62, activity: 'sedentary', goal: 'lose', rateLbPerWeek: 2 };
    const t = targets(small, 130, now);
    expect(calorieFloor(small, 130, now)).toBeGreaterThanOrEqual(1200);
    expect(t.floored).toBe(true);
    expect(t.calories).toBeGreaterThanOrEqual(1200);
    expect(t.calories).toBe(Math.round(t.floor / 10) * 10);
  });
});

describe('adjustment from the scale trend', () => {
  it('is quiet close to plan and speaks up when off by 100 kcal or more', () => {
    expect(adjustment(man, -0.9)?.kcal).toBe(0);
    expect(adjustment(man, -0.5)?.kcal).toBe(-250);
    expect(adjustment(man, -1.6)?.kcal).toBe(300); // capped
    expect(adjustment(man, 0.2)?.kcal).toBe(-300); // capped
    expect(adjustment(man, null)).toBeNull();
  });

  it('describes the situation in words', () => {
    expect(adjustment(man, -0.5)?.summary).toMatch(/slower than planned/);
    expect(adjustment({ ...man, goal: 'gain', rateLbPerWeek: 0.5 }, 1.2)?.summary).toMatch(/faster than planned/);
    expect(adjustment({ ...man, goal: 'maintain' }, 0.6)?.summary).toMatch(/hold steady/);
  });
});
