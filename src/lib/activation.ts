import { useEffect, useState } from 'react';

/**
 * Has this page had a user gesture yet? Browsers refuse to play sound (an unmuted video,
 * a YouTube embed, an AudioContext) until the user has clicked, tapped or typed on the
 * page. The TV shows a hint until then, and the demo players stay muted until then.
 */

let active = false;
const subs = new Set<() => void>();

function mark() {
  if (active) return;
  active = true;
  for (const fn of subs) fn();
}

export function userActivated(): boolean {
  if (!active) {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua?.hasBeenActive) active = true;
  }
  return active;
}

/** Runs `fn` synchronously inside the first gesture (so it may itself start audio). */
export function onUserActivation(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, mark, { capture: true, passive: true });
}

export function useUserActivated(): boolean {
  const [on, setOn] = useState(userActivated);
  useEffect(() => {
    if (userActivated()) {
      setOn(true);
      return;
    }
    return onUserActivation(() => setOn(true));
  }, []);
  return on;
}
