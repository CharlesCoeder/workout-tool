import { describe, expect, it } from 'vitest';
import { commandFor, parseSpokenNumber } from './useVoice';
import type { SessionState } from '../engine/types';
import { DEFAULT_DEMO } from '../engine/session';

const base = (phase: SessionState['phase'], paused = false): SessionState =>
  ({ id: 's', dayId: 'A', dayName: 'A', startedAt: 0, warmup: [], exercises: [], cursor: { ex: 0, set: 0 }, phase, paused: paused ? { remainingMs: 0 } : null, demo: DEFAULT_DEMO, rev: 0 });

describe('voice parsing', () => {
  it('parses numbers in words and digits', () => {
    expect(parseSpokenNumber('I got 12')).toBe(12);
    expect(parseSpokenNumber('twelve')).toBe(12);
    expect(parseSpokenNumber('twenty two reps')).toBe(22);
    expect(parseSpokenNumber('eight')).toBe(8);
    expect(parseSpokenNumber('nothing here')).toBeNull();
  });
  it('maps commands by phase', () => {
    expect(commandFor('ten', base({ kind: 'working' }))).toEqual({ type: 'logReps', reps: 10 });
    expect(commandFor('done', base({ kind: 'working' }))).toEqual({ type: 'setDone' });
    expect(commandFor('I got 9', base({ kind: 'logging' }))).toEqual({ type: 'logReps', reps: 9 });
    expect(commandFor('skip', base({ kind: 'rest', endsAt: 0, durationSec: 0, rerack: false }))).toEqual({ type: 'skipRest' });
    expect(commandFor('skip', base({ kind: 'warmup', step: 0, endsAt: 0 }))).toEqual({ type: 'skipWarmupStep' });
    expect(commandFor('go', base({ kind: 'ready', endsAt: 0 }))).toEqual({ type: 'go' });
    expect(commandFor('show me again', base({ kind: 'working' }))).toEqual({ type: 'showDemo' });
    expect(commandFor('pause', base({ kind: 'working' }))).toEqual({ type: 'pause' });
    expect(commandFor('resume', base({ kind: 'working' }, true))).toEqual({ type: 'resume' });
    expect(commandFor('ten', base({ kind: 'working' }, true))).toBeNull();
    expect(commandFor('ten', base({ kind: 'rest', endsAt: 0, durationSec: 0, rerack: false }))).toBeNull();
  });
});
