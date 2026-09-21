import { describe, expect, it } from 'vitest';
import { keyAction } from './keys';
import { createSession, reduce } from '../engine/session';
import type { PlannedExercise, SessionState } from '../engine/types';

const T0 = 1_000_000;
const opts = { readySec: 20, rerackBonusSec: 30 };

function ex(id: string): PlannedExercise {
  return {
    exerciseId: id,
    name: id,
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
  };
}

function session(): SessionState {
  return createSession({ id: 's', dayId: 'A', dayName: 'A', warmup: [{ name: 'w', seconds: 10 }], exercises: [ex('a'), ex('b')] }, T0);
}

describe('TV keyboard', () => {
  it('does nothing without a session', () => {
    expect(keyAction('Enter', null, '')).toEqual({ action: null, buffer: '' });
  });

  it('Enter steps the warm-up, then starts the set from ready and rest', () => {
    let s = session();
    expect(keyAction('Enter', s, '').action).toEqual({ type: 'skipWarmupStep' });
    s = reduce(s, { type: 'skipWarmup' }, T0, opts);
    expect(keyAction(' ', s, '').action).toEqual({ type: 'go' });
    s = reduce(s, { type: 'go' }, T0, opts);
    s = reduce(s, { type: 'logReps', reps: 8 }, T0, opts);
    expect(s.phase.kind).toBe('rest');
    expect(keyAction('Enter', s, '').action).toEqual({ type: 'go' });
    expect(keyAction('+', s, '').action).toEqual({ type: 'extendRest', seconds: 30 });
    expect(keyAction('-', s, '').action).toEqual({ type: 'extendRest', seconds: -30 });
  });

  it('digits build a rep count during the set and Enter logs it', () => {
    let s = reduce(session(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    let r = keyAction('1', s, '');
    expect(r).toEqual({ action: null, buffer: '1' });
    r = keyAction('2', s, r.buffer);
    expect(r.buffer).toBe('12');
    r = keyAction('Backspace', s, r.buffer);
    expect(r.buffer).toBe('1');
    r = keyAction('1', s, r.buffer);
    expect(keyAction('Enter', s, r.buffer)).toEqual({ action: { type: 'logReps', reps: 11 }, buffer: '' });
    // digits are ignored while resting
    s = reduce(s, { type: 'logReps', reps: 8 }, T0, opts);
    expect(keyAction('7', s, '').buffer).toBe('');
  });

  it('Enter alone during a set means "done", Space does not', () => {
    let s = reduce(session(), { type: 'skipWarmup' }, T0, opts);
    s = reduce(s, { type: 'go' }, T0, opts);
    expect(keyAction('Enter', s, '').action).toEqual({ type: 'setDone' });
    expect(keyAction(' ', s, '').action).toBeNull();
  });

  it('P pauses and resumes, U undoes, D toggles the demo, Escape clears typing then hides the demo', () => {
    let s = reduce(session(), { type: 'skipWarmup' }, T0, opts);
    expect(keyAction('p', s, '').action).toEqual({ type: 'pause' });
    s = reduce(s, { type: 'pause' }, T0, opts);
    expect(keyAction('P', s, '').action).toEqual({ type: 'resume' });
    expect(keyAction('Enter', s, '').action).toEqual({ type: 'resume' });
    s = reduce(s, { type: 'resume' }, T0, opts);
    expect(keyAction('u', s, '4').action).toEqual({ type: 'undoSet' });
    expect(keyAction('d', s, '').action).toEqual({ type: 'showDemo' });
    s = reduce(s, { type: 'showDemo' }, T0, opts);
    expect(keyAction('d', s, '').action).toEqual({ type: 'hideDemo' });
    expect(keyAction('Escape', s, '9')).toEqual({ action: null, buffer: '' });
    expect(keyAction('Escape', s, '')).toEqual({ action: { type: 'hideDemo' }, buffer: '' });
  });

  it('S takes the clip off the screen and puts it back', () => {
    let s = reduce(session(), { type: 'skipWarmup' }, T0, opts);
    expect(s.demo.shown).toBe(true);
    expect(keyAction('s', s, '').action).toEqual({ type: 'demoShown', shown: false });
    s = reduce(s, { type: 'demoShown', shown: false }, T0, opts);
    expect(keyAction('S', s, '').action).toEqual({ type: 'demoShown', shown: true });
  });
});
