import { describe, expect, it } from 'vitest';
import { betterWithGear, canDo, missingGear, planDay, planExercise } from './plan';
import { DEFAULT_INVENTORY, DEFAULT_PROGRAM } from './defaults';
import type { Inventory } from './types';

const withGear = (gear: string[]): Inventory => ({ ...DEFAULT_INVENTORY, gear });

describe('gear you own', () => {
  const lib = DEFAULT_PROGRAM.exercises;

  it('knows what an exercise needs beyond dumbbells', () => {
    expect(missingGear(lib['bench-press'], withGear([]))).toEqual(['bench']);
    expect(missingGear(lib['bench-press'], withGear(['bench']))).toEqual([]);
    expect(canDo(lib['floor-press'], withGear([]))).toBe(true);
    expect(canDo(lib['pullup'], withGear(['bench', 'step']))).toBe(false);
  });

  it('offers the bench press to someone with a bench, and nothing to someone without', () => {
    const better = betterWithGear('floor-press', DEFAULT_PROGRAM, withGear(['bench', 'step']));
    expect(better.map((e) => e.id)).toEqual(['bench-press', 'incline-press']);
    expect(betterWithGear('floor-press', DEFAULT_PROGRAM, withGear(['step']))).toEqual([]);
  });

  it('does not offer a swap that needs the same gear you are already using', () => {
    // Step-ups already need the step, so another step exercise is not an upgrade.
    expect(betterWithGear('step-up', DEFAULT_PROGRAM, withGear(['step']))).toEqual([]);
  });

  it('never changes the plan on its own', () => {
    const day = DEFAULT_PROGRAM.days.find((d) => d.id === 'A')!;
    const plan = planDay(DEFAULT_PROGRAM, day, [], withGear(['bench', 'step']));
    expect(plan.map((e) => e.exerciseId)).toContain('floor-press');
    expect(plan.map((e) => e.exerciseId)).not.toContain('bench-press');
  });

  it('carries the clip loudness into the session', () => {
    const ex = { ...DEFAULT_PROGRAM.exercises['squat'], demoVolume: 35 };
    expect(planExercise(ex, [], DEFAULT_INVENTORY).demoVolume).toBe(35);
    expect(planExercise(DEFAULT_PROGRAM.exercises['squat'], [], DEFAULT_INVENTORY).demoVolume).toBeUndefined();
  });
});
