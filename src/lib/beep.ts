let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short tone. `high` for the final "go". Silently no-ops if audio is blocked. */
export function beep(high = false, durationMs = 120) {
  const c = ac();
  if (!c || c.state !== 'running') return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = high ? 1320 : 880;
  g.gain.value = 0.0001;
  o.connect(g).connect(c.destination);
  const t = c.currentTime;
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  o.start(t);
  o.stop(t + durationMs / 1000 + 0.02);
}

export function audioUnlocked(): boolean {
  return !!ctx && ctx.state === 'running';
}

export function unlockAudio() {
  ac();
}
