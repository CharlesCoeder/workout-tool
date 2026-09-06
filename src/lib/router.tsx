import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    window.addEventListener('dc:navigate', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('dc:navigate', on);
    };
  }, []);
  return path;
}

export function navigate(to: string) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new Event('dc:navigate'));
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

export function TopNav({ current }: { current: string }) {
  const items = [
    ['/remote', 'Remote'],
    ['/tv', 'TV'],
    ['/history', 'History'],
    ['/body', 'Body'],
    ['/settings', 'Settings'],
  ];
  return (
    <nav className="topnav">
      {items.map(([to, label]) => (
        <Link key={to} to={to} className={current === to ? 'active' : ''}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
