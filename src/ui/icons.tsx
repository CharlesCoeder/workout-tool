// Small inline icons for the remote: text glyphs like ▶ turn into emoji on some phones.

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true } as const;

export function PlayIcon() {
  return (
    <svg {...base}>
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg {...base}>
      <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
    </svg>
  );
}

export function SoundOnIcon() {
  return (
    <svg {...base}>
      <path d="M4 9.5v5a1 1 0 0 0 1 1h2.6l4.1 3.4a.8.8 0 0 0 1.3-.6V5.7a.8.8 0 0 0-1.3-.6L7.6 8.5H5a1 1 0 0 0-1 1Z" />
      <path d="M16 8.6a4.6 4.6 0 0 1 0 6.8M18.6 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SoundOffIcon() {
  return (
    <svg {...base}>
      <path d="M4 9.5v5a1 1 0 0 0 1 1h2.6l4.1 3.4a.8.8 0 0 0 1.3-.6V5.7a.8.8 0 0 0-1.3-.6L7.6 8.5H5a1 1 0 0 0-1 1Z" />
      <path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RestartIcon() {
  return (
    <svg {...base}>
      <path d="M12 5a7 7 0 1 1-6.3 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.5 4.5v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
