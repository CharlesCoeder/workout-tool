import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRAM } from '../engine/defaults';
import { normalizeProgram } from './normalize';

describe('normalizeProgram', () => {
  it('adds library exercises a saved program predates, and offers swaps to them', () => {
    const { ['bench-press']: _b, ['incline-press']: _i, ...older } = DEFAULT_PROGRAM.exercises;
    const saved = { ...DEFAULT_PROGRAM, exercises: { ...older, 'floor-press': { ...older['floor-press'], substitutes: ['pushup'] } } };
    const p = normalizeProgram(saved);
    expect(p.exercises['bench-press'].demo).toEqual({ type: 'youtube', id: '_1MkDIqT9mA' });
    expect(p.exercises['incline-press']).toBeDefined();
    expect(p.exercises['floor-press'].substitutes).toEqual(['pushup', 'bench-press', 'incline-press']);
    expect(DEFAULT_PROGRAM.exercises['bench-press'].substitutes).toEqual(['floor-press', 'incline-press']);
  });

  it('leaves a swap you removed from an exercise both programs know about', () => {
    const saved = { ...DEFAULT_PROGRAM, exercises: { ...DEFAULT_PROGRAM.exercises, 'floor-press': { ...DEFAULT_PROGRAM.exercises['floor-press'], substitutes: ['pushup'] } } };
    expect(normalizeProgram(saved).exercises['floor-press'].substitutes).toEqual(['pushup']);
  });
});
