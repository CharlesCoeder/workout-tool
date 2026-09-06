import { useEffect, useRef } from 'react';
import type { Demo as DemoT, DemoCommand } from '../engine/types';
import { useUserActivated } from '../lib/activation';

export function youtubeIdFrom(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ---------- Player registry: every mounted demo can be driven from the remote ----------

export interface DemoHandle {
  apply(cmd: DemoCommand): void;
  setRate(rate: number): void;
}

const players = new Set<DemoHandle>();

export function applyDemoCommand(cmd: DemoCommand) {
  for (const p of players) p.apply(cmd);
}

// ---------- Progress feed: the primary player says where it is ----------

/** A sample of the primary player, in clip seconds. */
export interface DemoProgress {
  position: number;
  duration: number;
  playing: boolean;
  rate: number;
}

type ProgressListener = (p: DemoProgress | null) => void;
const progressListeners = new Set<ProgressListener>();
const primaries = new Set<object>();
const SAMPLE_MS = 400;

/** Subscribe to samples from the primary player; `null` means no primary player is mounted. */
export function onDemoProgress(fn: ProgressListener): () => void {
  progressListeners.add(fn);
  return () => {
    progressListeners.delete(fn);
  };
}

function emitProgress(p: DemoProgress | null) {
  for (const fn of progressListeners) fn(p);
}

/**
 * While `primary`, sample the player a few times a second and publish each sample.
 * Returns a function to publish an immediate sample (after a state change).
 */
function useProgressReporting(primary: boolean, sample: () => DemoProgress | null): () => void {
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const primaryRef = useRef(primary);
  primaryRef.current = primary;
  useEffect(() => {
    if (!primary) return;
    const token = {};
    primaries.add(token);
    const tick = () => {
      const p = sampleRef.current();
      if (p) emitProgress(p);
    };
    tick();
    const id = setInterval(tick, SAMPLE_MS);
    return () => {
      clearInterval(id);
      primaries.delete(token);
      if (primaries.size === 0) emitProgress(null);
    };
  }, [primary]);
  return () => {
    if (!primaryRef.current) return;
    const p = sampleRef.current();
    if (p) emitProgress(p);
  };
}

// ---------- YouTube IFrame API loader ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YTPlayer = any;
let ytLoading: Promise<YTPlayer> | null = null;

function loadYouTubeApi(): Promise<YTPlayer> {
  if (ytLoading) return ytLoading;
  ytLoading = new Promise((resolve) => {
    const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
  return ytLoading;
}

interface PlayerProps {
  rate: number;
  /** Sound may come out of this player (it is the primary one, the user hasn't muted, and the page has had a click). */
  audible: boolean;
  /** Reports its position for the phone's scrubber. Only one player per screen should be primary. */
  primary: boolean;
  className: string;
}

// YouTube player states
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;

function YouTubeDemo({ id, start = 0, rate, audible, primary, className }: PlayerProps & { id: string; start?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const audibleRef = useRef(audible);
  audibleRef.current = audible;
  // When we last unmuted, and whether a pause was asked for: an unrequested pause right
  // after unmuting means the browser refused sound, so we fall back to muted playback.
  const unmutedAt = useRef(0);
  const pauseRequested = useRef(false);

  const report = useProgressReporting(primary, () => {
    const p = player.current;
    if (!p || typeof p.getCurrentTime !== 'function') return null;
    try {
      const st = p.getPlayerState();
      return {
        position: p.getCurrentTime() || 0,
        duration: p.getDuration() || 0,
        playing: st === YT_PLAYING || st === YT_BUFFERING,
        rate: p.getPlaybackRate() || 1,
      };
    } catch {
      return null;
    }
  });
  const reportRef = useRef(report);
  reportRef.current = report;

  const setSound = (p: YTPlayer, on: boolean) => {
    try {
      if (on) {
        unmutedAt.current = Date.now();
        p.unMute();
      } else p.mute();
    } catch {
      /* not ready */
    }
  };

  useEffect(() => {
    let destroyed = false;
    const target = document.createElement('div');
    host.current?.appendChild(target);
    const handle: DemoHandle = {
      apply(cmd) {
        const p = player.current;
        if (!p || typeof p.getCurrentTime !== 'function') return;
        try {
          switch (cmd.type) {
            case 'seekBy':
              p.seekTo(Math.max(0, p.getCurrentTime() + cmd.seconds), true);
              pauseRequested.current = false;
              p.playVideo();
              break;
            case 'seekTo':
              // Keeps the play/pause state: YouTube stays paused if it was paused.
              p.seekTo(Math.max(0, cmd.seconds), true);
              break;
            case 'restart':
              p.seekTo(start, true);
              pauseRequested.current = false;
              p.playVideo();
              break;
            case 'play':
              pauseRequested.current = false;
              p.playVideo();
              break;
            case 'pause':
              pauseRequested.current = true;
              p.pauseVideo();
              break;
            case 'toggle':
              if (p.getPlayerState() === YT_PLAYING) {
                pauseRequested.current = true;
                p.pauseVideo();
              } else {
                pauseRequested.current = false;
                p.playVideo();
              }
              break;
          }
        } catch {
          /* player not ready */
        }
      },
      setRate(r) {
        try {
          player.current?.setPlaybackRate?.(r);
        } catch {
          /* ignore */
        }
      },
    };
    players.add(handle);
    loadYouTubeApi().then((YT) => {
      if (destroyed) return;
      player.current = new YT.Player(target, {
        videoId: id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1,
          // Always start muted so autoplay is never blocked; sound is switched on in onReady
          // once the page has had a gesture (see `audible`).
          mute: 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          start,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.mute();
            e.target.setPlaybackRate(rateRef.current);
            e.target.playVideo();
            if (audibleRef.current) setSound(e.target, true);
          },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            // Ended: loop back to the start offset (the `loop` param would restart at 0).
            if (e.data === YT_ENDED) {
              e.target.seekTo(start, true);
              e.target.playVideo();
            }
            // Playing: re-assert rate (YouTube resets it on some seeks).
            if (e.data === YT_PLAYING && Math.abs(e.target.getPlaybackRate() - rateRef.current) > 0.01) e.target.setPlaybackRate(rateRef.current);
            // Paused by the browser right after we unmuted: it refused sound without a
            // gesture in the frame. Keep the clip going, silently.
            if (e.data === YT_PAUSED && !pauseRequested.current && Date.now() - unmutedAt.current < 1500) {
              e.target.mute();
              e.target.playVideo();
            }
            reportRef.current();
          },
        },
      });
    });
    return () => {
      destroyed = true;
      players.delete(handle);
      try {
        player.current?.destroy?.();
      } catch {
        /* ignore */
      }
      player.current = null;
      target.remove();
    };
  }, [id, start]);

  useEffect(() => {
    try {
      player.current?.setPlaybackRate?.(rate);
    } catch {
      /* ignore */
    }
  }, [rate]);

  useEffect(() => {
    const p = player.current;
    if (p && typeof p.unMute === 'function') setSound(p, audible);
  }, [audible]);

  return <div className={`demo youtube ${className}`} ref={host} />;
}

function VideoDemo({ url, rate, audible, primary, className }: PlayerProps & { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const pauseRequested = useRef(false);
  const report = useProgressReporting(primary, () => {
    const el = ref.current;
    if (!el) return null;
    return {
      position: el.currentTime || 0,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      playing: !el.paused && !el.ended,
      rate: el.playbackRate || 1,
    };
  });
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // If sound is refused, keep the clip going without it.
    const play = () => {
      pauseRequested.current = false;
      return el.play().catch(() => {
        el.muted = true;
        void el.play();
      });
    };
    const handle: DemoHandle = {
      apply(cmd) {
        switch (cmd.type) {
          case 'seekBy':
            el.currentTime = Math.max(0, el.currentTime + cmd.seconds);
            void play();
            break;
          case 'seekTo':
            el.currentTime = Math.max(0, cmd.seconds);
            break;
          case 'restart':
            el.currentTime = 0;
            void play();
            break;
          case 'play':
            void play();
            break;
          case 'pause':
            pauseRequested.current = true;
            el.pause();
            break;
          case 'toggle':
            if (el.paused) void play();
            else {
              pauseRequested.current = true;
              el.pause();
            }
            break;
        }
      },
      setRate(r) {
        el.playbackRate = r;
      },
    };
    players.add(handle);
    const onState = () => reportRef.current();
    for (const ev of ['play', 'pause', 'seeked', 'durationchange', 'ended']) el.addEventListener(ev, onState);
    return () => {
      players.delete(handle);
      for (const ev of ['play', 'pause', 'seeked', 'durationchange', 'ended']) el.removeEventListener(ev, onState);
    };
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = !audible;
    // Unmuting an autoplaying clip can pause it in some browsers; resume unless the user paused it.
    if (audible && el.paused && !pauseRequested.current) {
      el.play().catch(() => {
        el.muted = true;
        void el.play();
      });
    }
  }, [audible]);
  return (
    <div className={`demo ${className}`}>
      <video ref={ref} src={url} autoPlay muted loop playsInline />
    </div>
  );
}

export function Demo({
  demo,
  rate = 1,
  muted = false,
  primary = true,
  className = '',
}: {
  demo: DemoT;
  rate?: number;
  /** User turned the sound off (from the phone). */
  muted?: boolean;
  /** The one player on screen that carries sound and reports its position. */
  primary?: boolean;
  className?: string;
}) {
  // Sound needs a user gesture on this page first; until then every player stays muted.
  const activated = useUserActivated();
  if (!demo) {
    return (
      <div className={`demo ${className}`}>
        <div className="placeholder">
          <div style={{ fontSize: '2em', opacity: 0.6 }}>▶</div>
          <div>No demo yet</div>
        </div>
      </div>
    );
  }
  const audible = primary && !muted && activated;
  if (demo.type === 'video') return <VideoDemo url={demo.url} rate={rate} audible={audible} primary={primary} className={className} />;
  return <YouTubeDemo id={demo.id} start={demo.start ?? 0} rate={rate} audible={audible} primary={primary} className={className} />;
}
