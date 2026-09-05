import { describe, expect, it } from 'vitest';
import {
  achievableWeights,
  emptyDumbbellLb,
  loadingFor,
  maxWeight,
  nextStep,
  rackDiff,
  rackFor,
  snapDown,
  snapWeight,
} from './plates';
import { DEFAULT_INVENTORY as inv } from './defaults';
import type { Inventory } from './types';

describe('plate math with the Amazon Basics set', () => {
  it('empty dumbbell is handle + collars', () => {
    expect(emptyDumbbellLb(inv)).toBe(4);
  });

  it('pair achievable weights match the brief', () => {
    expect(achievableWeights(inv, 'pair')).toEqual([4, 9, 14, 19]);
  });

  it('single achievable weights match the brief', () => {
    expect(achievableWeights(inv, 'single')).toEqual([4, 9, 14, 19, 24, 29, 34]);
  });

  it('bodyweight has no weights', () => {
    expect(achievableWeights(inv, 'bodyweight')).toEqual([]);
    expect(loadingFor(inv, 'bodyweight', 0)).toBeNull();
  });

  it('loading for 19 pair is a 5 and a 2.5 on each end', () => {
    expect(loadingFor(inv, 'pair', 19)?.perEnd).toEqual([5, 2.5]);
  });

  it('loading for 34 single uses every plate', () => {
    expect(loadingFor(inv, 'single', 34)?.perEnd).toEqual([5, 5, 2.5, 2.5]);
  });

  it('prefers fewer plates when combos tie', () => {
    // 14 single: 5 per end (1 plate) beats 2.5+2.5 (2 plates)
    expect(loadingFor(inv, 'single', 14)?.perEnd).toEqual([5]);
  });

  it('prefers the combo closest to what is already on the bar', () => {
    // Coming from [2.5, 2.5] per end, 14 single can stay as [2.5, 2.5] (0 changes) vs [5] (3 changes)
    expect(loadingFor(inv, 'single', 14, [2.5, 2.5])?.perEnd).toEqual([2.5, 2.5]);
  });

  it('returns null for an unbuildable weight', () => {
    expect(loadingFor(inv, 'pair', 12)).toBeNull();
  });

  it('nextStep steps by one buildable increment and nulls at the ceiling', () => {
    expect(nextStep(inv, 'pair', 14)).toBe(19);
    expect(nextStep(inv, 'pair', 19)).toBeNull();
    expect(nextStep(inv, 'single', 29)).toBe(34);
    expect(nextStep(inv, 'single', 34)).toBeNull();
    expect(maxWeight(inv, 'pair')).toBe(19);
  });

  it('snaps to the nearest buildable weight, ties going lower', () => {
    expect(snapWeight(inv, 'pair', 12)).toBe(14);
    expect(snapWeight(inv, 'pair', 11.5)).toBe(9);
    expect(snapWeight(inv, 'pair', 100)).toBe(19);
    expect(snapDown(inv, 'pair', 18)).toBe(14);
    expect(snapDown(inv, 'pair', 1)).toBe(4);
  });

  it('derives new weights when plates are added', () => {
    const bigger: Inventory = { ...inv, plates: [{ lb: 5, count: 8 }, { lb: 2.5, count: 4 }] };
    expect(achievableWeights(bigger, 'pair')).toEqual([4, 9, 14, 19, 24, 29]);
    expect(nextStep(bigger, 'pair', 19)).toBe(24);
  });

  it('handles odd plate counts by ignoring the unpaired plate', () => {
    const odd: Inventory = { ...inv, plates: [{ lb: 5, count: 5 }] };
    expect(achievableWeights(odd, 'pair')).toEqual([4, 14]);
    expect(achievableWeights(odd, 'single')).toEqual([4, 14, 24]);
  });

  it('rack for a single 34 strips the other handle', () => {
    const prev = rackFor(inv, 'pair', loadingFor(inv, 'pair', 19));
    expect(prev.handles).toEqual([[5, 2.5], [5, 2.5]]);
    const rack = rackFor(inv, 'single', loadingFor(inv, 'single', 34), prev);
    expect(rack.handles).toEqual([[5, 5, 2.5, 2.5], []]);
    const diff = rackDiff(prev, rack);
    expect(diff).toHaveLength(2);
    expect(diff[0]).toMatchObject({ handle: 0, add: [5, 2.5], remove: [] });
    expect(diff[1]).toMatchObject({ handle: 1, add: [], remove: [5, 2.5] });
  });

  it('rack for a light single leaves the other handle alone', () => {
    const prev = rackFor(inv, 'pair', loadingFor(inv, 'pair', 9));
    const rack = rackFor(inv, 'single', loadingFor(inv, 'single', 14), prev);
    expect(rack.handles).toEqual([[5], [2.5]]);
  });
});
