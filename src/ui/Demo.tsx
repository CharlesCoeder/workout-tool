import { useEffect, useRef } from 'react';
import type { Demo as DemoT, DemoCommand } from '../engine/types';

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

function YouTubeDemo({ id, start = 0, rate, className }: { id: string; start?: number; rate: number; className: string }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;

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
              p.playVideo();
              break;
            case 'restart':
              p.seekTo(start, true);
              p.playVideo();
              break;
            case 'play':
              p.playVideo();
              break;
            case 'pause':
              p.pauseVideo();
              break;
            case 'toggle':
              if (p.getPlayerState() === 1) p.pauseVideo();
              else p.playVideo();
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
          },
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            // 0 = ended: loop back to the start offset (the `loop` param would restart at 0).
            if (e.data === 0) {
              e.target.seekTo(start, true);
              e.target.playVideo();
            }
            // 1 = playing: re-assert rate (YouTube resets it on some seeks).
            if (e.data === 1 && Math.abs(e.target.getPlaybackRate() - rateRef.current) > 0.01) e.target.setPlaybackRate(rateRef.current);
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

  return <div className={`demo youtube ${className}`} ref={host} />;
}

function VideoDemo({ url, rate, className }: { url: string; rate: number; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle: DemoHandle = {
      apply(cmd) {
        switch (cmd.type) {
          case 'seekBy':
            el.currentTime = Math.max(0, el.currentTime + cmd.seconds);
            void el.play();
            break;
          case 'restart':
            el.currentTime = 0;
            void el.play();
            break;
          case 'play':
            void el.play();
            break;
          case 'pause':
            el.pause();
            break;
          case 'toggle':
            if (el.paused) void el.play();
            else el.pause();
            break;
        }
      },
      setRate(r) {
        el.playbackRate = r;
      },
    };
    players.add(handle);
    return () => {
      players.delete(handle);
    };
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate]);
  return (
    <div className={`demo ${className}`}>
      <video ref={ref} src={url} autoPlay muted loop playsInline />
    </div>
  );
}

export function Demo({ demo, rate = 1, className = '' }: { demo: DemoT; rate?: number; className?: string }) {
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
  if (demo.type === 'video') return <VideoDemo url={demo.url} rate={rate} className={className} />;
  return <YouTubeDemo id={demo.id} start={demo.start ?? 0} rate={rate} className={className} />;
}
