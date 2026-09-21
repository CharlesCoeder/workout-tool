import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The remote's modal panel: slides up from the bottom, closes on backdrop tap.
 *
 * The header stays put while the body scrolls, so "Close" is always one tap away even
 * half-way down a long list of sets, and the page behind is frozen while the sheet is
 * open: on a phone a flick that started inside a text field used to scroll the session
 * screen underneath instead of the sheet.
 */
export function BottomSheet({ title, status, children, onClose }: { title: string; status?: ReactNode; children: ReactNode; onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.body;
    const y = window.scrollY;
    const prev = { position: el.style.position, top: el.style.top, width: el.style.width, overflow: el.style.overflow };
    el.style.position = 'fixed';
    el.style.top = `-${y}px`;
    el.style.width = '100%';
    el.style.overflow = 'hidden';
    return () => {
      el.style.position = prev.position;
      el.style.top = prev.top;
      el.style.width = prev.width;
      el.style.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, []);

  // Touching anything that isn't a field lets go of the one you were typing in, so a
  // scroll after the keyboard has gone down moves the sheet rather than the caret.
  const release = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) active.blur();
  };

  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} onTouchStart={release}>
        <div className="panel-head row spread">
          <strong style={{ fontSize: 18 }}>{title}</strong>
          <div className="row" style={{ gap: 10 }}>
            {status}
            <button className="btn small ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="panel-body" ref={body}>
          {children}
        </div>
      </div>
    </div>
  );
}
