import type { Action, SessionState } from '../engine/types';

/**
 * Keyboard control for the TV page, for when it is a laptop casting a tab: Enter or Space
 * does the obvious thing for the phase, digits then Enter log reps, P pauses, U undoes,
 * D toggles the enlarged demo, S puts the clip on or off the screen, + and − move the rest
 * by 30 s. The remote is never required.
 */

export interface KeyResult {
  action: Action | null;
  /** Digits typed so far towards a rep count. */
  buffer: string;
}

export function keyAction(key: string, s: SessionState | null, buffer: string): KeyResult {
  if (!s || s.phase.kind === 'summary') return { action: null, buffer: '' };
  const k = s.phase.kind;
  const logging = k === 'working' || k === 'logging';

  if (/^[0-9]$/.test(key)) return { action: null, buffer: logging ? (buffer + key).slice(-2) : '' };
  if (key === 'Backspace') return { action: null, buffer: buffer.slice(0, -1) };
  if (key === 'Escape') return { action: buffer ? null : s.demo.enlarged ? { type: 'hideDemo' } : null, buffer: '' };

  const lower = key.toLowerCase();
  if (lower === 'p') return { action: { type: s.paused ? 'resume' : 'pause' }, buffer };
  if (lower === 'u') return { action: { type: 'undoSet' }, buffer: '' };
  if (lower === 'd') return { action: { type: s.demo.enlarged ? 'hideDemo' : 'showDemo' }, buffer };
  if (lower === 's') return { action: { type: 'demoShown', shown: !s.demo.shown }, buffer };
  if (key === '+' || key === '=') return { action: k === 'rest' || k === 'ready' ? { type: 'extendRest', seconds: 30 } : null, buffer };
  if (key === '-' || key === '_') return { action: k === 'rest' || k === 'ready' ? { type: 'extendRest', seconds: -30 } : null, buffer };

  if (key === 'Enter' || key === ' ') {
    if (s.paused) return { action: { type: 'resume' }, buffer };
    if (logging && buffer) return { action: { type: 'logReps', reps: Number(buffer) }, buffer: '' };
    if (k === 'warmup') return { action: { type: 'skipWarmupStep' }, buffer: '' };
    if (k === 'ready' || k === 'rest') return { action: { type: 'go' }, buffer: '' };
    if (k === 'working' && key === 'Enter') return { action: { type: 'setDone' }, buffer: '' };
    return { action: null, buffer };
  }
  return { action: null, buffer };
}

export const KEY_HINT = 'Keys: Enter/Space go · digits + Enter log reps · P pause · U undo · D full-screen demo · S show/hide demo · +/− 30 s';
