import { describe, expect, it } from 'vitest';
import { HEARTBEAT_MS, STALE_MS, fmtClock, isFresh, positionAt, shouldPublish } from './playback';
import type { DemoPlayback } from './types';

const T0 = 1_000_000;
const sample = (o: Partial<DemoPlayback> = {}): DemoPlayback => ({
  sessionId: 's1',
  exerciseId: 'x',
  position: 10,
  duration: 120,
  playing: true,
  rate: 1,
  at: T0,
  ...o,
});

describe('playback feed', () => {
  it('extrapolates the playhead while playing, at the playback rate, clamped to the clip', () => {
    expect(positionAt(sample(), T0 + 2000)).toBeCloseTo(12);
    expect(positionAt(sample({ rate: 0.5 }), T0 + 2000)).toBeCloseTo(11);
    expect(positionAt(sample({ playing: false }), T0 + 2000)).toBe(10);
    expect(positionAt(sample({ position: 119 }), T0 + 5000)).toBe(120);
    expect(positionAt(sample({ duration: 0, position: 5 }), T0 + 1000)).toBe(6); // unknown duration: no clamp
    expect(positionAt(sample(), T0 - 1000)).toBe(10); // clock skew never runs backwards
  });

  it('is fresh only for the same session and exercise while the TV keeps heartbeating', () => {
    expect(isFresh(sample(), 's1', 'x', T0 + 1000)).toBe(true);
    expect(isFresh(sample(), 's1', 'y', T0 + 1000)).toBe(false);
    expect(isFresh(sample(), 's2', 'x', T0 + 1000)).toBe(false);
    expect(isFresh(sample(), 's1', 'x', T0 + STALE_MS + 1)).toBe(false);
    expect(isFresh(null, 's1', 'x', T0)).toBe(false);
  });

  it('publishes on anything the phone cannot predict, otherwise only a heartbeat', () => {
    const last = sample();
    expect(shouldPublish(null, last)).toBe(true);
    // steady playback: predicted position matches
    expect(shouldPublish(last, sample({ position: 12, at: T0 + 2000 }))).toBe(false);
    // a seek or loop
    expect(shouldPublish(last, sample({ position: 40, at: T0 + 2000 }))).toBe(true);
    expect(shouldPublish(last, sample({ position: 0.2, at: T0 + 2000 }))).toBe(true);
    // pause, rate change, duration arriving, new exercise
    expect(shouldPublish(last, sample({ position: 12, at: T0 + 2000, playing: false }))).toBe(true);
    expect(shouldPublish(last, sample({ position: 12, at: T0 + 2000, rate: 0.5 }))).toBe(true);
    expect(shouldPublish(sample({ duration: 0 }), sample({ position: 12, at: T0 + 2000 }))).toBe(true);
    expect(shouldPublish(last, sample({ position: 12, at: T0 + 2000, exerciseId: 'y' }))).toBe(true);
    // heartbeat
    expect(shouldPublish(last, sample({ position: 10 + HEARTBEAT_MS / 1000, at: T0 + HEARTBEAT_MS }))).toBe(true);
    expect(shouldPublish(last, sample({ position: 10 + (HEARTBEAT_MS - 500) / 1000, at: T0 + HEARTBEAT_MS - 500 }))).toBe(false);
    // paused: position must hold still
    const paused = sample({ playing: false });
    expect(shouldPublish(paused, sample({ playing: false, at: T0 + 2000 }))).toBe(false);
    expect(shouldPublish(paused, sample({ playing: false, position: 20, at: T0 + 2000 }))).toBe(true);
  });

  it('formats clip times as m:ss', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(65.9)).toBe('1:05');
    expect(fmtClock(-3)).toBe('0:00');
  });
});
