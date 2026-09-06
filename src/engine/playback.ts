import type { DemoPlayback } from './types';

/**
 * Pure helpers for the TV → phone playback feed (see `DemoPlayback`).
 *
 * The TV samples its player twice a second but only publishes when something the phone
 * can't predict has changed: play/pause, a seek or loop, a rate change, the duration
 * turning up, or a heartbeat so the phone can tell a live player from a closed tab.
 */

export const HEARTBEAT_MS = 5000;
/** After this long without a heartbeat the phone stops trusting the feed. */
export const STALE_MS = HEARTBEAT_MS * 2 + 2000;
/** How far the real position may drift from the phone's extrapolation before we republish. */
const DRIFT_SEC = 0.75;

export function playbackPath(hid: string): string {
  return `households/${hid}/demoPlayback`;
}

/** What the phone should display as the playhead at `now`, extrapolating while playing. */
export function positionAt(p: DemoPlayback, now: number): number {
  const pos = p.playing ? p.position + (Math.max(0, now - p.at) / 1000) * p.rate : p.position;
  const max = p.duration > 0 ? p.duration : Infinity;
  return Math.min(max, Math.max(0, pos));
}

/** True while the feed refers to this exercise of this session and the TV is still heartbeating. */
export function isFresh(p: DemoPlayback | null, sessionId: string, exerciseId: string, now: number): p is DemoPlayback {
  if (!p) return false;
  if (p.sessionId !== sessionId || p.exerciseId !== exerciseId) return false;
  return now - p.at < STALE_MS;
}

/** Whether a fresh sample differs from what the last published one lets the phone predict. */
export function shouldPublish(last: DemoPlayback | null, next: DemoPlayback): boolean {
  if (!last) return true;
  if (last.sessionId !== next.sessionId || last.exerciseId !== next.exerciseId) return true;
  if (last.playing !== next.playing) return true;
  if (Math.abs(last.rate - next.rate) > 0.001) return true;
  if (Math.abs(last.duration - next.duration) > 0.5) return true;
  if (next.at - last.at >= HEARTBEAT_MS) return true;
  return Math.abs(positionAt(last, next.at) - next.position) > DRIFT_SEC;
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
