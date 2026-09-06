import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { TopNav } from '../lib/router';
import { DEFAULT_INVENTORY, DEFAULT_PROGRAM, DEFAULT_SETTINGS } from '../engine/defaults';
import { achievableWeights, formatLb } from '../engine/plates';
import type { Day, DayEntry, Exercise, Inventory, Program, Settings, WarmupStep } from '../engine/types';
import { youtubeIdFrom } from '../ui/Demo';
import { getStoredHid, setStoredHid } from '../lib/household';
import { MUSCLES } from '../engine/stats';

type Tab = 'program' | 'exercises' | 'equipment' | 'timing' | 'data';

export function SettingsPage() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>('program');
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(null), 1800);
    return () => clearTimeout(id);
  }, [saved]);
  const flash = (m = 'Saved') => setSaved(m);

  const tabs: [Tab, string][] = [
    ['program', 'Program'],
    ['exercises', 'Exercises'],
    ['equipment', 'Equipment'],
    ['timing', 'Timing & rules'],
    ['data', 'Data'],
  ];
  return (
    <div className="page">
      <TopNav current="/settings" />
      <h1>Settings</h1>
      <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
        {tabs.map(([t, label]) => (
          <button key={t} className={`btn small ${tab === t ? 'primary' : 'ghost'}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'program' && <ProgramTab onSaved={flash} />}
      {tab === 'exercises' && <ExercisesTab onSaved={flash} />}
      {tab === 'equipment' && <EquipmentTab onSaved={flash} />}
      {tab === 'timing' && <TimingTab onSaved={flash} />}
      {tab === 'data' && <DataTab onSaved={flash} />}
      {saved && <div className="toast" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: 'var(--bg-3)', padding: '10px 16px', borderRadius: 999 }}>{saved}</div>}
      {app.live && app.live.phase.kind !== 'summary' && (
        <p className="notice" style={{ marginTop: 20 }}>
          A session is running. Program changes apply to the next session.
        </p>
      )}
    </div>
  );
}

// ---------- Program ----------

function ProgramTab({ onSaved }: { onSaved: (m?: string) => void }) {
  const app = useApp();
  const program = app.program;
  const save = async (p: Program) => {
    await app.saveProgram(p);
    onSaved();
  };
  const updateDay = (i: number, d: Day) => save({ ...program, days: program.days.map((x, j) => (j === i ? d : x)) });
  const exOptions = Object.values(program.exercises).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <p className="muted">Each day is an ordered list from the exercise library. Blank overrides use the exercise's own sets and reps.</p>
      {program.days.map((day, di) => (
        <div key={day.id} className="card stack">
          <div className="row spread">
            <input value={day.name} onChange={(e) => updateDay(di, { ...day, name: e.target.value })} style={{ fontWeight: 700, fontSize: 18 }} />
            <button
              className="btn small danger"
              onClick={() => {
                if (confirm(`Remove ${day.name}?`)) save({ ...program, days: program.days.filter((_, j) => j !== di) });
              }}
            >
              Remove day
            </button>
          </div>
          <table className="plain">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Sets</th>
                <th>Reps</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {day.entries.map((en, ei) => {
                const ex = program.exercises[en.exerciseId];
                const setEntry = (patch: Partial<DayEntry>) =>
                  updateDay(di, { ...day, entries: day.entries.map((x, j) => (j === ei ? { ...x, ...patch } : x)) });
                const move = (dir: -1 | 1) => {
                  const entries = [...day.entries];
                  const j = ei + dir;
                  if (j < 0 || j >= entries.length) return;
                  [entries[ei], entries[j]] = [entries[j], entries[ei]];
                  updateDay(di, { ...day, entries });
                };
                return (
                  <tr key={ei}>
                    <td>
                      <select value={en.exerciseId} onChange={(e) => setEntry({ exerciseId: e.target.value })}>
                        {!ex && <option value={en.exerciseId}>(missing: {en.exerciseId})</option>}
                        {exOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        placeholder={String(ex?.sets ?? '')}
                        value={en.sets ?? ''}
                        onChange={(e) => setEntry({ sets: e.target.value === '' ? undefined : Number(e.target.value) })}
                        style={{ width: '4.5em' }}
                      />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <input
                          type="number"
                          min={1}
                          placeholder={String(ex?.repMin ?? '')}
                          value={en.repMin ?? ''}
                          onChange={(e) => setEntry({ repMin: e.target.value === '' ? undefined : Number(e.target.value) })}
                          style={{ width: '4.5em' }}
                        />
                        –
                        <input
                          type="number"
                          min={1}
                          placeholder={String(ex?.repMax ?? '')}
                          value={en.repMax ?? ''}
                          onChange={(e) => setEntry({ repMax: e.target.value === '' ? undefined : Number(e.target.value) })}
                          style={{ width: '4.5em' }}
                        />
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn small ghost" onClick={() => move(-1)} aria-label="Move up">
                          ↑
                        </button>
                        <button className="btn small ghost" onClick={() => move(1)} aria-label="Move down">
                          ↓
                        </button>
                        <button className="btn small ghost" onClick={() => updateDay(di, { ...day, entries: day.entries.filter((_, j) => j !== ei) })}>
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) updateDay(di, { ...day, entries: [...day.entries, { exerciseId: e.target.value }] });
              }}
            >
              <option value="">Add exercise…</option>
              {exOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      <button
        className="btn"
        onClick={() => {
          const id = String.fromCharCode(65 + program.days.length);
          save({ ...program, days: [...program.days, { id: `${id}-${Date.now().toString(36)}`, name: `Day ${id}`, entries: [] }] });
        }}
      >
        Add a day
      </button>

      <h2>Warm-up</h2>
      <p className="muted">Timed steps, run in order before every session. Set seconds to 0 to disable a step.</p>
      <div className="card stack">
        {program.warmup.map((w, i) => {
          const set = (patch: Partial<WarmupStep>) => save({ ...program, warmup: program.warmup.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="row">
              <input className="grow" value={w.name} onChange={(e) => set({ name: e.target.value })} />
              <input type="number" min={0} value={w.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} style={{ width: '5em' }} />
              <span className="muted">s</span>
              <button className="btn small ghost" onClick={() => save({ ...program, warmup: program.warmup.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          );
        })}
        <button className="btn small" onClick={() => save({ ...program, warmup: [...program.warmup, { name: 'New step', seconds: 30 }] })}>
          Add step
        </button>
      </div>
    </div>
  );
}

// ---------- Exercises ----------

function ExercisesTab({ onSaved }: { onSaved: (m?: string) => void }) {
  const app = useApp();
  const program = app.program;
  const list = useMemo(() => Object.values(program.exercises).sort((a, b) => a.name.localeCompare(b.name)), [program.exercises]);
  const [openId, setOpenId] = useState<string | null>(null);
  const save = async (p: Program) => {
    await app.saveProgram(p);
    onSaved();
  };
  const saveEx = (ex: Exercise) => save({ ...program, exercises: { ...program.exercises, [ex.id]: ex } });
  const usedIn = (id: string) => program.days.filter((d) => d.entries.some((e) => e.exerciseId === id)).map((d) => d.name);

  return (
    <div className="stack">
      <p className="muted">The library. Tap an exercise to edit it. "Single" means one dumbbell (two hands or one side at a time); "pair" means one in each hand.</p>
      {list.map((ex) => (
        <div key={ex.id} className="card stack">
          <button className="row spread" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpenId(openId === ex.id ? null : ex.id)}>
            <span>
              <strong>{ex.name}</strong>
              <span className="faint" style={{ fontSize: 13 }}>
                {' '}
                · {ex.load} · {ex.sets}×{ex.repMin}–{ex.repMax} · {ex.restSec}s rest · {usedIn(ex.id).join(', ') || 'unused'}
              </span>
            </span>
            <span className="muted">{openId === ex.id ? '▾' : '▸'}</span>
          </button>
          {openId === ex.id && (
            <ExerciseForm
              ex={ex}
              all={list}
              onChange={saveEx}
              onDelete={() => {
                if (!confirm(`Delete ${ex.name} from the library?`)) return;
                const exercises = { ...program.exercises };
                delete exercises[ex.id];
                save({
                  ...program,
                  exercises,
                  days: program.days.map((d) => ({ ...d, entries: d.entries.filter((e) => e.exerciseId !== ex.id) })),
                });
                setOpenId(null);
              }}
            />
          )}
        </div>
      ))}
      <button
        className="btn"
        onClick={() => {
          const id = `custom-${Date.now().toString(36)}`;
          const ex: Exercise = {
            id,
            name: 'New exercise',
            load: 'pair',
            sets: 3,
            repMin: 6,
            repMax: 12,
            restSec: 90,
            cue: '',
            demo: null,
            substitutes: [],
            startWeightLb: 9,
          };
          saveEx(ex);
          setOpenId(id);
        }}
      >
        Add exercise
      </button>
    </div>
  );
}

function ExerciseForm({ ex, all, onChange, onDelete }: { ex: Exercise; all: Exercise[]; onChange: (e: Exercise) => void; onDelete: () => void }) {
  const app = useApp();
  const [draft, setDraft] = useState<Exercise>(ex);
  const [demoText, setDemoText] = useState(ex.demo ? (ex.demo.type === 'youtube' ? `https://youtu.be/${ex.demo.id}` : ex.demo.url) : '');
  useEffect(() => setDraft(ex), [ex]);
  const set = (patch: Partial<Exercise>) => setDraft((d) => ({ ...d, ...patch }));
  const weights = draft.load === 'bodyweight' ? [] : achievableWeights(app.inventory, draft.load);
  const commit = () => {
    let demo: Exercise['demo'] = null;
    const t = demoText.trim();
    if (t) {
      const yt = youtubeIdFrom(t);
      demo = yt ? { type: 'youtube', id: yt, start: draft.demo?.type === 'youtube' ? draft.demo.start : undefined } : { type: 'video', url: t };
    }
    onChange({ ...draft, demo });
  };
  const startOffset = draft.demo?.type === 'youtube' ? (draft.demo.start ?? 0) : 0;
  return (
    <div className="stack">
      <div className="grid2">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Name</label>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="field">
          <label>Dumbbells</label>
          <select value={draft.load} onChange={(e) => set({ load: e.target.value as Exercise['load'] })}>
            <option value="pair">Pair (one each hand)</option>
            <option value="single">Single dumbbell</option>
            <option value="bodyweight">Bodyweight</option>
          </select>
        </div>
        <div className="field">
          <label>Per side</label>
          <select value={draft.perSide ? '1' : '0'} onChange={(e) => set({ perSide: e.target.value === '1' })}>
            <option value="0">No</option>
            <option value="1">Yes (reps per side)</option>
          </select>
        </div>
        <div className="field">
          <label>Sets</label>
          <input type="number" min={1} value={draft.sets} onChange={(e) => set({ sets: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Rest (seconds)</label>
          <input type="number" min={0} value={draft.restSec} onChange={(e) => set({ restSec: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Reps min</label>
          <input type="number" min={1} value={draft.repMin} onChange={(e) => set({ repMin: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Reps max (progression trigger)</label>
          <input type="number" min={1} value={draft.repMax} onChange={(e) => set({ repMax: Number(e.target.value) })} />
        </div>
        {draft.load !== 'bodyweight' && (
          <div className="field">
            <label>Starting weight (lb{draft.load === 'pair' ? ' each' : ''})</label>
            <select value={String(draft.startWeightLb)} onChange={(e) => set({ startWeightLb: Number(e.target.value) })}>
              {!weights.includes(draft.startWeightLb) && <option value={String(draft.startWeightLb)}>{formatLb(draft.startWeightLb)} (not buildable, will snap)</option>}
              {weights.map((w) => (
                <option key={w} value={String(w)}>
                  {formatLb(w)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label>Form cue (shown on the TV)</label>
        <textarea rows={2} value={draft.cue} onChange={(e) => set({ cue: e.target.value })} />
      </div>
      <div className="field">
        <label>Demo: YouTube link/ID or a direct video URL (mp4/webm). Blank for "no demo yet".</label>
        <input value={demoText} onChange={(e) => setDemoText(e.target.value)} placeholder="https://youtu.be/… or https://…/clip.mp4" />
      </div>
      {youtubeIdFrom(demoText.trim()) && (
        <div className="field">
          <label>Start at (seconds into the video)</label>
          <input
            type="number"
            min={0}
            value={startOffset}
            onChange={(e) => set({ demo: { type: 'youtube', id: youtubeIdFrom(demoText.trim())!, start: Number(e.target.value) } })}
          />
        </div>
      )}
      <div className="field">
        <label>Muscles worked (tap in order: the first is the main one and counts a full set in the weekly balance, the rest count half)</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {MUSCLES.map((m) => {
            const list = draft.muscles ?? [];
            const idx = list.indexOf(m);
            return (
              <button
                key={m}
                className={`pill ${idx === 0 ? 'accent' : idx > 0 ? 'good' : ''}`}
                onClick={() => set({ muscles: idx >= 0 ? list.filter((x) => x !== m) : [...list, m] })}
              >
                {m}
                {idx === 0 ? ' · main' : ''}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label>Substitutes (offered first when you swap)</label>
        <div className="row wrap" style={{ gap: 6 }}>
          {all
            .filter((o) => o.id !== draft.id)
            .map((o) => {
              const on = draft.substitutes.includes(o.id);
              return (
                <button
                  key={o.id}
                  className={`pill ${on ? 'accent' : ''}`}
                  onClick={() => set({ substitutes: on ? draft.substitutes.filter((s) => s !== o.id) : [...draft.substitutes, o.id] })}
                >
                  {o.name}
                </button>
              );
            })}
        </div>
      </div>
      <div className="row spread">
        <button className="btn small danger" onClick={onDelete}>
          Delete
        </button>
        <button className="btn primary" onClick={commit}>
          Save exercise
        </button>
      </div>
    </div>
  );
}

// ---------- Equipment ----------

function EquipmentTab({ onSaved }: { onSaved: (m?: string) => void }) {
  const app = useApp();
  const [inv, setInv] = useState<Inventory>(app.inventory);
  useEffect(() => setInv(app.inventory), [app.inventory]);
  const set = (patch: Partial<Inventory>) => setInv((i) => ({ ...i, ...patch }));
  const pair = achievableWeights(inv, 'pair');
  const single = achievableWeights(inv, 'single');
  const dirty = JSON.stringify(inv) !== JSON.stringify(app.inventory);
  return (
    <div className="stack">
      <p className="muted">Everything the app prescribes is derived from this. Bought plates? Add them here and the ceiling moves.</p>
      <div className="card stack">
        <div className="grid2">
          <div className="field">
            <label>Handle weight (lb)</label>
            <input type="number" step="0.5" min={0} value={inv.handleLb} onChange={(e) => set({ handleLb: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Collar weight (lb, each)</label>
            <input type="number" step="0.25" min={0} value={inv.collarLb} onChange={(e) => set({ collarLb: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Collars per handle</label>
            <input type="number" min={0} value={inv.collarsPerHandle} onChange={(e) => set({ collarsPerHandle: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Handles</label>
            <input type="number" min={1} value={inv.handles} onChange={(e) => set({ handles: Number(e.target.value) })} />
          </div>
        </div>
        <h3>Plates (total count, shared by all handles)</h3>
        <table className="plain">
          <thead>
            <tr>
              <th>Plate (lb)</th>
              <th>How many</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inv.plates.map((p, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="number"
                    step="0.25"
                    min={0}
                    value={p.lb}
                    onChange={(e) => set({ plates: inv.plates.map((x, j) => (j === i ? { ...x, lb: Number(e.target.value) } : x)) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={p.count}
                    onChange={(e) => set({ plates: inv.plates.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x)) })}
                  />
                </td>
                <td>
                  <button className="btn small ghost" onClick={() => set({ plates: inv.plates.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn small" onClick={() => set({ plates: [...inv.plates, { lb: 10, count: 4 }] })}>
          Add a plate size
        </button>
        <div className="row spread">
          <span className="muted" style={{ fontSize: 13 }}>
            Odd plates are ignored (they can't load symmetrically).
          </span>
          <button
            className="btn primary"
            disabled={!dirty}
            onClick={() => {
              void app.saveInventory({ ...inv, plates: inv.plates.filter((p) => p.lb > 0).sort((a, b) => b.lb - a.lb) });
              onSaved('Equipment saved');
            }}
          >
            Save equipment
          </button>
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>What you can build</h3>
        <div>
          <span className="muted">Pair, each: </span>
          {pair.map(formatLb).join(', ') || '—'} lb
        </div>
        <div>
          <span className="muted">Single: </span>
          {single.map(formatLb).join(', ') || '—'} lb
        </div>
      </div>
    </div>
  );
}

// ---------- Timing & voice ----------

function TimingTab({ onSaved }: { onSaved: (m?: string) => void }) {
  const app = useApp();
  const s = app.settings;
  const save = (patch: Partial<Settings>) => {
    void app.saveSettings({ ...s, ...patch });
    onSaved();
  };
  return (
    <div className="stack">
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Progression</h3>
        <div className="field">
          <label>When does a lift earn its next plate step?</label>
          <select value={s.progressionRule} onChange={(e) => save({ progressionRule: e.target.value as Settings['progressionRule'] })}>
            <option value="firstSet">First set reaches the top of the rep range (the program's rule)</option>
            <option value="allSets">Every set reaches the top of the rep range (stricter, slower)</option>
          </select>
        </div>
        <div className="field">
          <label>Sessions per week you're aiming for</label>
          <input type="number" min={1} max={7} value={s.targetSessionsPerWeek} onChange={(e) => save({ targetSessionsPerWeek: Math.max(1, Math.min(7, Number(e.target.value) || 1)) })} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Either way the weight only ever goes up on its own. If a lift goes three sessions without beating the session before (first-set reps or total reps), the TV says so and suggests a step down for a session; it never changes the weight for you.
        </p>
      </div>
      <div className="card stack">
        <div className="field">
          <label>"Get ready" countdown before the first set (seconds)</label>
          <input type="number" min={0} value={s.readySec} onChange={(e) => save({ readySec: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Extra rest when the next exercise needs a plate change (seconds)</label>
          <input type="number" min={0} value={s.rerackBonusSec} onChange={(e) => save({ rerackBonusSec: Number(e.target.value) })} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Rest between sets is set per exercise in the Exercises tab.
        </p>
      </div>
      <div className="card stack">
        <label className="row">
          <input type="checkbox" checked={s.countdownBeeps} onChange={(e) => save({ countdownBeeps: e.target.checked })} />
          <span>Countdown beeps on the TV (3, 2, 1, go)</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={s.voiceEnabled} onChange={(e) => save({ voiceEnabled: e.target.checked })} />
          <span>Voice control on the TV page (Chrome, needs a microphone)</span>
        </label>
        <p className="muted" style={{ fontSize: 13 }}>
          Voice understands: "done", a number ("ten"), "skip", "go", "pause", "resume", "show me again". The remote always works regardless.
        </p>
      </div>
    </div>
  );
}

// ---------- Data ----------

function DataTab({ onSaved }: { onSaved: (m?: string) => void }) {
  const app = useApp();
  const [importText, setImportText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const exportJson = () =>
    JSON.stringify({ program: app.program, equipment: app.inventory, settings: app.settings, sessions: app.history, bodyWeight: app.bodyWeight }, null, 2);
  const doImport = async () => {
    setErr(null);
    try {
      const data = JSON.parse(importText);
      if (data.program) await app.saveProgram(data.program);
      if (data.equipment) await app.saveInventory(data.equipment);
      if (data.settings) await app.saveSettings(data.settings);
      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) await app.backend.set(`households/${app.hid}/sessions/${s.id}`, s);
      }
      if (Array.isArray(data.bodyWeight)) {
        for (const e of data.bodyWeight) if (e?.date && e.lb > 0) await app.saveBodyWeight(e.date, e.lb);
      }
      setImportText('');
      onSaved('Imported');
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="stack">
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Backup</h3>
        <textarea rows={6} readOnly value={exportJson()} onFocus={(e) => e.currentTarget.select()} className="mono" style={{ fontSize: 12 }} />
        <button
          className="btn small"
          onClick={() => {
            void navigator.clipboard?.writeText(exportJson());
            onSaved('Copied');
          }}
        >
          Copy to clipboard
        </button>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Restore</h3>
        <textarea rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste a backup here" className="mono" style={{ fontSize: 12 }} />
        {err && <div className="error">{err}</div>}
        <button className="btn small" disabled={!importText.trim()} onClick={() => void doImport()}>
          Import
        </button>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Reset</h3>
        <div className="row wrap">
          <button
            className="btn small ghost"
            onClick={() => {
              if (confirm('Reset the program and exercise library to the defaults? History is kept.')) {
                void app.saveProgram(DEFAULT_PROGRAM);
                onSaved('Program reset');
              }
            }}
          >
            Reset program to defaults
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              if (confirm('Reset equipment to the Amazon Basics set?')) {
                void app.saveInventory(DEFAULT_INVENTORY);
                void app.saveSettings(DEFAULT_SETTINGS);
                onSaved('Equipment reset');
              }
            }}
          >
            Reset equipment & timing
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm('Delete ALL session history? This cannot be undone.')) {
                void app.clearHistory();
                onSaved('History cleared');
              }
            }}
          >
            Clear history
          </button>
        </div>
      </div>
      <div className="card stack">
        <h3 style={{ margin: 0 }}>This device</h3>
        <div className="muted" style={{ fontSize: 13 }}>
          Backend: {app.mode}. Household: <span className="mono">{app.hid}</span>
        </div>
        {app.mode === 'firebase' && (
          <button
            className="btn small ghost"
            onClick={() => {
              if (confirm('Forget the household on this device? Data stays in Firebase; pair again to get it back.')) {
                setStoredHid(null);
                location.reload();
              }
            }}
          >
            Unpair this device {getStoredHid() ? '' : '(not paired)'}
          </button>
        )}
      </div>
    </div>
  );
}
