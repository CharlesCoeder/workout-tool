import type { ReactNode } from 'react';

/** The remote's modal panel: slides up from the bottom, closes on backdrop tap. */
export function BottomSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <strong style={{ fontSize: 18 }}>{title}</strong>
          <button className="btn small ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
