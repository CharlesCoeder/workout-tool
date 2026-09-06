import { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { lastLoggedSet } from '../engine/session';
import { formatLb } from '../engine/plates';
import type { PlannedExercise, SessionState } from '../engine/types';
import { BottomSheet } from './Sheet';

/**
 * Everything logged so far, editable: tap a set to change its reps, add a note per
 * exercise or for the whole session, or take back the last set entirely.
 */
export function LogSheet({ session, onClose, onDone }: { session: SessionState; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const last = lastLoggedSet(session);
  const logged = session.exercises.map((e, i) => ({ e, i })).filter(({ e }) => e.results.length > 0);
  const [editing, setEditing] = useState<{ ex: number; set: number } | null>(null);

  const undo = async () => {
    if (!last) return;
    await app.dispatch({ type: 'undoSet' });
    onDone(`Took back ${session.exercises[last.ex].name} set ${last.set + 1}`);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose} title="Logged sets">
      {last && (
        <button className="item" onClick={() => void undo()}>
          <span>
            Undo last set
            <span className="muted" style={{ fontSize: 13 }}>
              {' '}
              · {session.exercises[last.ex].name}, set {last.set + 1}: {last.result.reps} reps
            </span>
          </span>
        </button>
      )}
      {!logged.length && <div className="muted">Nothing logged yet.</div>}
      {logged.map(({ e, i }) => (
        <div key={i} className="card stack" style={{ gap: 8, padding: 14 }}>
          <div className="row spread">
            <strong>{e.name}</strong>
            {e.load !== 'bodyweight' && <span className="muted">{formatLb(e.results[0].weightLb)} lb</span>}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {e.results.map((r, k) => {
              const on = editing?.ex === i && editing.set === k;
              return (
                <button key={k} className={`pill ${on ? 'accent' : ''}`} style={{ fontSize: 15, padding: '6px 12px' }} onClick={() => setEditing(on ? null : { ex: i, set: k })}>
                  Set {k + 1}: {r.reps}
                </button>
              );
            })}
          </div>
          {editing?.ex === i && <RepPicker ex={e} current={e.results[editing.set].reps} onPick={(reps) => void app.dispatch({ type: 'editSet', ex: i, set: editing.set, reps }).then(() => setEditing(null))} />}
          <NoteField value={e.note ?? ''} placeholder="Note for this exercise (optional)" onCommit={(text) => void app.dispatch({ type: 'note', ex: i, text })} />
        </div>
      ))}
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">Session note</div>
        <NoteField value={session.note ?? ''} placeholder="How did it go? Sleep, energy, anything sore…" onCommit={(text) => void app.dispatch({ type: 'note', text })} multiline />
      </div>
    </BottomSheet>
  );
}

function RepPicker({ ex, current, onPick }: { ex: PlannedExercise; current: number; onPick: (n: number) => void }) {
  const hi = Math.max(ex.repMax + 6, current + 2);
  const nums = Array.from({ length: hi + 1 }, (_, n) => n);
  return (
    <div className="chips">
      {nums.map((n) => (
        <button key={n} className={n === current ? 'on' : ''} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

/** Text that is written when you leave the field (or press Enter), not on every keystroke. */
function NoteField({
  value,
  placeholder,
  onCommit,
  multiline = false,
}: {
  value: string;
  placeholder: string;
  onCommit: (text: string) => void;
  multiline?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() !== value.trim()) onCommit(text);
  };
  if (multiline) return <textarea rows={2} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />;
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
