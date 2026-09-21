import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { lastLoggedSet } from '../engine/session';
import { achievableWeights, formatLb } from '../engine/plates';
import { resultsSummary } from '../ui/format';
import type { PlannedExercise, SessionState } from '../engine/types';
import { BottomSheet } from './Sheet';

/**
 * Everything logged so far, editable: tap a set to change its reps or the weight it was
 * done at, add a note per exercise or for the whole session, or take back the last set.
 *
 * Every field saves itself, shortly after you stop typing and again when you leave it, and
 * the header says where that has got to. Nothing here waits for a "save" button, because
 * the one thing you must not lose is what you just did.
 */
export function LogSheet({ session, onClose, onDone }: { session: SessionState; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const last = lastLoggedSet(session);
  const logged = session.exercises.map((e, i) => ({ e, i })).filter(({ e }) => e.results.length > 0);
  const [editing, setEditing] = useState<{ ex: number; set: number } | null>(null);
  const save = useSaveStatus();

  const undo = async () => {
    if (!last) return;
    await app.dispatch({ type: 'undoSet' });
    onDone(`Took back ${session.exercises[last.ex].name} set ${last.set + 1}`);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose} title="Logged sets" status={<SaveStatus state={save.state} />}>
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
            <span className="muted" style={{ fontSize: 14 }}>
              {resultsSummary(e.results, e.load)}
            </span>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {e.results.map((r, k) => {
              const on = editing?.ex === i && editing.set === k;
              return (
                <button
                  key={k}
                  className={`pill ${on ? 'accent' : ''}`}
                  style={{ fontSize: 15, padding: '6px 12px' }}
                  onClick={() => setEditing(on ? null : { ex: i, set: k })}
                >
                  Set {k + 1}: {e.load === 'bodyweight' ? r.reps : `${formatLb(r.weightLb)} × ${r.reps}`}
                </button>
              );
            })}
          </div>
          {editing?.ex === i && (
            <SetEditor
              ex={e}
              set={editing.set}
              onReps={(reps) => save.run(app.dispatch({ type: 'editSet', ex: i, set: editing.set, reps }))}
              onWeight={(weightLb) => save.run(app.dispatch({ type: 'editSetWeight', ex: i, set: editing.set, weightLb }))}
              onClose={() => setEditing(null)}
            />
          )}
          <NoteField
            value={e.note ?? ''}
            placeholder="Note for this exercise (optional)"
            onCommit={(text) => save.run(app.dispatch({ type: 'note', ex: i, text }))}
          />
        </div>
      ))}
      <div className="stack" style={{ gap: 6 }}>
        <div className="eyebrow">Session note</div>
        <NoteField
          value={session.note ?? ''}
          placeholder="How did it go? Sleep, energy, anything sore…"
          onCommit={(text) => save.run(app.dispatch({ type: 'note', text }))}
          multiline
        />
      </div>
    </BottomSheet>
  );
}

/** Reps and, for a weighted lift, the weight that set was actually done at. */
function SetEditor({
  ex,
  set,
  onReps,
  onWeight,
  onClose,
}: {
  ex: PlannedExercise;
  set: number;
  onReps: (reps: number) => void;
  onWeight: (lb: number) => void;
  onClose: () => void;
}) {
  const app = useApp();
  const result = ex.results[set];
  const hi = Math.max(ex.repMax + 6, result.reps + 2);
  const nums = Array.from({ length: hi + 1 }, (_, n) => n);
  const weights = ex.load === 'bodyweight' ? [] : achievableWeights(app.inventory, ex.load);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row spread">
        <span className="eyebrow">Set {set + 1} · reps</span>
        <button className="btn small ghost" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="chips">
        {nums.map((n) => (
          <button key={n} className={n === result.reps ? 'on' : ''} onClick={() => onReps(n)}>
            {n}
          </button>
        ))}
      </div>
      {weights.length > 0 && (
        <>
          <div className="eyebrow">Weight for this set</div>
          <div className="chips">
            {weights.map((w) => (
              <button key={w} className={Math.abs(w - result.weightLb) < 1e-9 ? 'on' : ''} onClick={() => onWeight(w)}>
                {formatLb(w)}
              </button>
            ))}
          </div>
          <span className="faint" style={{ fontSize: 13 }}>
            Only this set. Next time's weight comes from your first set, so a set you dropped doesn't cost you the step.
          </span>
        </>
      )}
    </div>
  );
}

// ---------- Saving ----------

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Tracks the writes this sheet has in flight so the header can say what happened. */
function useSaveStatus() {
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const run = useCallback((p: Promise<unknown>) => {
    pending.current++;
    setState('saving');
    if (timer.current) clearTimeout(timer.current);
    void p
      .then(() => {
        if (--pending.current === 0) setState('saved');
      })
      .catch(() => {
        pending.current--;
        setState('error');
      });
  }, []);
  return { state, run };
}

function SaveStatus({ state }: { state: SaveState }) {
  const text = state === 'saving' ? 'Saving…' : state === 'saved' ? 'All changes saved' : state === 'error' ? "Couldn't save" : 'Saves as you type';
  return (
    <span className={state === 'error' ? 'error-text' : 'faint'} style={{ fontSize: 13 }} aria-live="polite">
      {text}
    </span>
  );
}

/** How long after the last keystroke a note is written. Every write is the whole live state. */
const COMMIT_MS = 800;

/** Text that writes itself shortly after you stop typing, and again when you leave the field. */
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
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ text, value, onCommit });
  latest.current = { text, value, onCommit };

  // An edit from the other screen only lands in the box while you are not typing in it.
  useEffect(() => {
    if (!dirty.current) setText(value);
  }, [value]);

  const commit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { text: t, value: v, onCommit: fn } = latest.current;
    dirty.current = false;
    if (t.trim() !== v.trim()) fn(t);
  }, []);

  useEffect(() => () => commit(), [commit]);

  const onChange = (next: string) => {
    setText(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, COMMIT_MS);
  };

  if (multiline) return <textarea rows={2} value={text} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={commit} />;
  return (
    <input
      value={text}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
