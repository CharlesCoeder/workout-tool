import { useEffect, useState } from 'react';
import { onUserActivation, userActivated } from './activation';

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Keep the screen on while `active`. The app asks for this on every page, not just during
 * a session: reading the next day's weights or typing a note should not need you to poke
 * the screen either, and nobody should have to change their phone's display timeout to
 * use a workout app. It is a setting, on by default.
 *
 * The lock is dropped by the browser whenever the tab is hidden (screen off, app
 * switched), so it is re-taken every time the page becomes visible again. Some browsers
 * only grant it after a gesture, so a first refusal is retried on the first tap.
 *
 * Returns whether a lock is actually held, which Settings reports rather than claiming.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || !wakeLockSupported) {
      setHeld(false);
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || lock || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (stopped) {
          void lock.release().catch(() => {});
          lock = null;
          return;
        }
        setHeld(true);
        lock.addEventListener('release', () => {
          lock = null;
          setHeld(false);
        });
      } catch {
        setHeld(false); // not allowed yet (no gesture, or low battery); we try again later
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    const offActivation = userActivated() ? () => {} : onUserActivation(() => void acquire());
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVis);
      offActivation();
      lock?.release().catch(() => {});
      lock = null;
      setHeld(false);
    };
  }, [active]);
  return { supported: wakeLockSupported, held };
}
