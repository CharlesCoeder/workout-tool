import { useEffect, useRef } from 'react';
import type { SessionState } from '../engine/types';
import { isTimed, remainingMs } from '../engine/session';

/**
 * Buzz the phone at 3, 2, 1 and when a countdown lands, mirroring the TV's beeps, so the
 * end of a rest is felt even with the phone face-down on the floor. Android only: iOS
 * Safari has no vibration API, in which case this silently does nothing.
 */
export function useVibrate(session: SessionState | null, now: number, enabled: boolean) {
  const lastSec = useRef(-1);
  const lastKind = useRef('');
  useEffect(() => {
    if (!session) {
      lastKind.current = '';
      return;
    }
    const kind = session.phase.kind;
    const can = enabled && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    if (can) {
      if (isTimed(session.phase) && !session.paused) {
        const sec = Math.ceil(remainingMs(session, now) / 1000);
        if (sec !== lastSec.current && sec >= 1 && sec <= 3) navigator.vibrate(40);
        lastSec.current = sec;
      }
      const wasTimed = lastKind.current === 'rest' || lastKind.current === 'ready' || lastKind.current === 'warmup';
      if (kind === 'working' && wasTimed) navigator.vibrate([90, 60, 90]);
    }
    lastKind.current = kind;
  }, [session, now, enabled]);
}
