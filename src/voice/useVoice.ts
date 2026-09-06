import { useEffect, useRef, useState } from 'react';
import type { Action, SessionState } from '../engine/types';

// Minimal typings for the Web Speech API (Chrome).
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50,
};

/** Parse a spoken number: "12", "twelve", "twenty two". Null if none. */
export function parseSpokenNumber(text: string): number | null {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  const digits = t.match(/\b(\d{1,2})\b/);
  if (digits) return Number(digits[1]);
  const tokens = t.split(/\s+/);
  let total: number | null = null;
  for (const tok of tokens) {
    const v = WORDS[tok];
    if (v === undefined) continue;
    if (total === null) total = v;
    else if (total >= 20 && total % 10 === 0 && v < 10) total += v;
    else total = v;
  }
  return total;
}

/** Map a transcript to an action for the current phase. */
export function commandFor(text: string, session: SessionState | null): Action | null {
  if (!session) return null;
  const t = text.toLowerCase();
  const kind = session.phase.kind;
  if (/\b(pause|hold on|wait)\b/.test(t)) return session.paused ? null : { type: 'pause' };
  if (/\b(resume|continue|unpause)\b/.test(t)) return session.paused ? { type: 'resume' } : null;
  if (/\b(undo|take that back|scratch that)\b/.test(t)) return { type: 'undoSet' };
  if (session.paused) return null;
  if (/\b(hide|close)\b/.test(t) && session.demo.enlarged) return { type: 'hideDemo' };
  if (/\b(slow|slower|slow mo|slow motion)\b/.test(t)) return { type: 'demoRate', rate: 0.5 };
  if (/\b(normal speed|full speed)\b/.test(t)) return { type: 'demoRate', rate: 1 };
  if (/\b(rewind|go back|back up)\b/.test(t)) return { type: 'demoCommand', cmd: { type: 'seekBy', seconds: -5 } };
  if (/\b(restart|from the top|start over)\b/.test(t)) return { type: 'demoCommand', cmd: { type: 'restart' } };
  if (/\b(show me again|show me|again|demo|how do i)\b/.test(t)) return { type: 'showDemo' };
  if (/\bskip\b/.test(t)) {
    if (kind === 'warmup') return { type: 'skipWarmupStep' };
    if (kind === 'rest' || kind === 'ready') return { type: 'skipRest' };
    return null;
  }
  if (/\b(go|start|begin)\b/.test(t)) {
    if (kind === 'ready' || kind === 'rest' || kind === 'warmup') return { type: 'go' };
    return null;
  }
  if (kind === 'working' || kind === 'logging') {
    const n = parseSpokenNumber(t);
    if (n !== null && /\b(got|did|reps?|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\b/.test(t)) {
      return { type: 'logReps', reps: n };
    }
    if (/\b(done|finished|that's it)\b/.test(t)) return kind === 'working' ? { type: 'setDone' } : null;
  }
  return null;
}

/**
 * Voice control on the TV page. Listens continuously while enabled and a
 * session is running; restarts itself when Chrome ends the stream.
 */
export function useVoice(enabled: boolean, session: SessionState | null, dispatch: (a: Action) => Promise<void>) {
  const [status, setStatus] = useState('');
  const [heard, setHeard] = useState('');
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const active = enabled && !!session && session.phase.kind !== 'summary';

  useEffect(() => {
    if (!active) {
      setStatus(enabled ? 'Voice: waiting for a session' : '');
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) {
      setStatus('Voice: not supported in this browser');
      return;
    }
    let stopped = false;
    let rec: SpeechRecognitionLike | null = null;
    let lastAt = 0;
    let lastText = '';
    const start = () => {
      if (stopped) return;
      rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';
      rec.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (!r.isFinal) continue;
          const text = r[0].transcript.trim();
          setHeard(text);
          const action = commandFor(text, sessionRef.current);
          if (!action) continue;
          const now = Date.now();
          if (text === lastText && now - lastAt < 1500) continue; // de-bounce duplicates
          lastText = text;
          lastAt = now;
          void dispatchRef.current(action);
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setStatus('Voice: microphone blocked');
          stopped = true;
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          setStatus(`Voice: ${e.error}`);
        }
      };
      rec.onend = () => {
        if (!stopped) setTimeout(start, 300);
      };
      try {
        rec.start();
        setStatus('Voice: listening');
      } catch {
        setStatus('Voice: could not start');
      }
    };
    start();
    return () => {
      stopped = true;
      rec?.abort();
    };
  }, [active, enabled]);

  return { status: heard ? `${status} · “${heard}”` : status };
}
