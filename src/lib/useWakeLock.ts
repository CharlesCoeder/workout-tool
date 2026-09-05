import { useEffect } from 'react';

/** Keep the phone screen on while `active`. Re-acquires after the tab comes back. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not allowed; fine */
      }
    };
    const onVis = () => {
      if (!stopped && document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
