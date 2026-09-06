import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApp, useSettled } from '../lib/store';
import { useWakeLock } from '../lib/useWakeLock';
import { useVibrate } from '../lib/useVibrate';
import { joinPairing } from '../lib/pairing';
import { Link } from '../lib/router';
import { currentExercise, isStale, lastActivityAt, lastLoggedSet, progress, remainingMs } from '../engine/session';
import { consistency, daysBetween, estimateSessionMs, startOfWeek, typicalDurationMs, weeklyStats } from '../engine/stats';
import { WeekDots } from '../ui/WeekDots';
import { planDay, planExercise, suggestNextDay } from '../engine/plan';
import { achievableWeights, formatLb, loadingFor } from '../engine/plates';
import { prForSet, sessionPrs, sessionVolume, targetReps } from '../engine/records';
import { STALL_SESSIONS } from '../engine/progression';
import type { Day, DemoCommand, DemoPlayback, PlannedExercise, SessionState } from '../engine/types';
import { fmtClock, isFresh, playbackPath, positionAt } from '../engine/playback';
import { fmtCountdown, fmtDuration, perEndLabel, repsTarget, weightLabel } from '../ui/format';
import { PauseIcon, PlayIcon, RestartIcon, SoundOffIcon, SoundOnIcon } from '../ui/icons';
import { PlateBar } from '../ui/PlateBar';
import { RackChanges } from '../ui/RackChanges';
import { rackPlanFor } from '../ui/rack';
import { BottomSheet } from './Sheet';
import { LogSheet } from './LogSheet';
import { WeighSheet } from './WeighSheet';
import { summarize, todayKey as todayKeyLocal } from '../engine/body';

type Sheet = null | 'menu' | 'weight' | 'swap' | 'end' | 'pair' | 'demo' | 'log' | 'weigh';

export function RemotePage() {
  const app = useApp();
  const { session, now } = useSettled();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  // A session left open for hours is offered for discarding rather than silently resumed.
  const [resumedStale, setResumedStale] = useState<string | null>(null);
  const stale = !!session && isStale(session, now) && resumedStale !== session.id;
  const active = !!session && session.phase.kind !== 'summary' && !stale;
  useWakeLock(active);
  useVibrate(active ? session : null, now, app.settings.phoneVibrate);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // ?pair=CODE deep link from the TV screen.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('pair');
    if (code && app.mode === 'firebase') setSheet('pair');
  }, [app.mode]);

  if (!app.loaded) {
    return (
      <div className="remote">
        <div className="muted" style={{ textAlign: 'center', marginTop: 80 }}>
          Connecting…
        </div>
      </div>
    );
  }

  const say = (m: string) => setToast(m);
  const ex = session ? currentExercise(session) : undefined;

  const closeSheet = () => setSheet(null);
  // "Demo video" puts the clip full-screen on the TV and opens the controls.
  const openDemo = () => {
    void app.dispatch({ type: 'showDemo' });
    setSheet('demo');
  };
  const sheets = (
    <>
      {sheet === 'menu' && session && (
        <BottomSheet onClose={closeSheet} title="Session">
          <div className="list">
            <button className="item" onClick={() => setSheet('demo')}>
              Demo video controls
            </button>
            {ex && ex.load !== 'bodyweight' && (
              <button className="item" onClick={() => setSheet('weight')}>
                Change weight <span className="muted">{formatLb(ex.weightLb)} lb</span>
              </button>
            )}
            {ex && (
              <button className="item" onClick={() => setSheet('swap')}>
                Swap exercise
              </button>
            )}
            {ex && (
              <button className="item" onClick={() => void app.dispatch({ type: 'skipExercise' }).then(closeSheet)}>
                Skip {ex.name}
              </button>
            )}
            <button className="item" onClick={() => setSheet('log')}>
              Logged sets &amp; notes
              {lastLoggedSet(session) && <span className="muted" style={{ fontSize: 13 }}>undo · edit</span>}
            </button>
            <button className="item danger" onClick={() => setSheet('end')}>
              End session early
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
            <Link to="/history">History</Link>
            <Link to="/settings">Settings</Link>
            {app.mode === 'firebase' && <button onClick={() => setSheet('pair')} className="accent">Pair a TV</button>}
          </div>
        </BottomSheet>
      )}
      {sheet === 'weight' && session && ex && <WeightSheet ex={ex} onClose={closeSheet} onDone={say} />}
      {sheet === 'demo' && session && ex && <DemoSheet session={session} ex={ex} now={now} onClose={closeSheet} />}
      {sheet === 'swap' && session && ex && <SwapSheet session={session} ex={ex} onClose={closeSheet} onDone={say} />}
      {sheet === 'log' && session && <LogSheet session={session} onClose={closeSheet} onDone={say} />}
      {sheet === 'end' && (
        <BottomSheet onClose={closeSheet} title="End the session?">
          <p className="muted">What you've logged so far is saved and counts for progression.</p>
          <button className="btn danger big" onClick={() => void app.dispatch({ type: 'endSession' }).then(closeSheet)}>
            End session
          </button>
          <button className="btn ghost" onClick={closeSheet}>
            Keep going
          </button>
        </BottomSheet>
      )}
      {sheet === 'pair' && <PairSheet onClose={closeSheet} onDone={say} />}
      {sheet === 'weigh' && <WeighSheet onClose={closeSheet} onDone={say} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );

  if (!session) {
    return (
      <div className="remote">
        <DayPicker onPair={() => setSheet('pair')} onWeigh={() => setSheet('weigh')} />
        {sheets}
      </div>
    );
  }

  if (stale) {
    const at = new Date(lastActivityAt(session));
    const logged = session.exercises.filter((e) => e.results.length > 0).length;
    return (
      <div className="remote">
        <div className="card stack">
          <strong>A session is still open</strong>
          <span className="muted">
            {session.dayName}, last touched {at.toLocaleDateString(undefined, { weekday: 'short' })} at {at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.{' '}
            {logged ? `${logged} exercise${logged === 1 ? '' : 's'} logged so far; those stay in your history either way.` : 'Nothing was logged.'}
          </span>
          <div className="row">
            <button className="btn primary grow" onClick={() => setResumedStale(session.id)}>
              Pick it back up
            </button>
            <button className="btn ghost grow" onClick={() => void app.clearLive()}>
              Discard
            </button>
          </div>
        </div>
        {sheets}
      </div>
    );
  }

  const p = session.phase;
  let body: ReactNode;
  switch (p.kind) {
    case 'warmup':
      body = <WarmupControls s={session} now={now} />;
      break;
    case 'ready':
      body = (
        <ReadyControls s={session} now={now} onWeight={() => setSheet('weight')} onSwap={() => setSheet('swap')} onDemo={() => openDemo()} />
      );
      break;
    case 'working':
    case 'logging':
      body = <RepControls s={session} onWeight={() => setSheet('weight')} onSwap={() => setSheet('swap')} onDemo={() => openDemo()} />;
      break;
    case 'rest':
      body = <RestControls s={session} now={now} onWeight={() => setSheet('weight')} onDemo={() => openDemo()} />;
      break;
    case 'summary':
      body = <SummaryControls s={session} onEdit={() => setSheet('log')} />;
      break;
  }

  return (
    <div className="remote">
      <Header s={session} />
      {body}
      {p.kind !== 'summary' && (
        <div className="footer">
          {session.paused ? (
            <button className="btn primary grow" onClick={() => void app.dispatch({ type: 'resume' })}>
              Resume
            </button>
          ) : (
            <button className="btn ghost grow" onClick={() => void app.dispatch({ type: 'pause' })}>
              Pause
            </button>
          )}
          <button className="btn ghost" onClick={() => setSheet('menu')}>
            More
          </button>
        </div>
      )}
      {sheets}
    </div>
  );
}

// ---------- Pieces ----------

function Header({ s }: { s: SessionState }) {
  const pr = progress(s);
  return (
    <div className="row spread">
      <span className="eyebrow">{s.dayName}</span>
      <span className="muted" style={{ fontSize: 14 }}>
        {pr.setsDone}/{pr.setsTotal} sets{s.paused ? ' · paused' : ''}
      </span>
    </div>
  );
}

function ExerciseHero({ ex, sub }: { ex: PlannedExercise; sub?: string }) {
  return (
    <div className="hero">
      {sub && <div className="eyebrow accent">{sub}</div>}
      <div className="name">{ex.name}</div>
      <div className="weight">
        {weightLabel(ex.weightLb, ex.load)}
        {ex.loading && <span className="muted" style={{ fontWeight: 400 }}> · {perEndLabel(ex.loading.perEnd)}</span>}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="pill">{repsTarget(ex)}</span>
        {ex.progressed && <span className="pill good">▲ up from last time</span>}
        {ex.blocked && <span className="pill warn">maxed out on your plates</span>}
        {!ex.blocked && ex.maxedOut && ex.load !== 'bodyweight' && <span className="pill warn">at your plate ceiling</span>}
        {ex.stalled >= STALL_SESSIONS && <span className="pill warn">no progress · {ex.stalled} sessions</span>}
        {ex.weightLb !== ex.prescribedLb && <span className="pill">overridden</span>}
      </div>
    </div>
  );
}

function DayPicker({ onPair, onWeigh }: { onPair: () => void; onWeigh: () => void }) {
  const app = useApp();
  const suggested = suggestNextDay(app.program, app.history);
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => app.now(), [app.now]);
  const week = useMemo(() => weeklyStats(app.history, app.program, 1, now)[0], [app.history, app.program, now]);
  const c = useMemo(() => consistency(app.history, app.settings.targetSessionsPerWeek, now), [app.history, app.settings.targetSessionsPerWeek, now]);
  const body = useMemo(() => summarize(app.bodyWeight, now), [app.bodyWeight, now]);
  const weighedToday = app.bodyWeight.some((e) => e.date === todayKeyLocal(now));
  const plans = useMemo(
    () => Object.fromEntries(app.program.days.map((d) => [d.id, planDay(app.program, d, app.history, app.inventory, app.settings.progressionRule)])),
    [app.program, app.history, app.inventory, app.settings.progressionRule],
  );
  const start = async (d: Day) => {
    setBusy(true);
    try {
      await app.startSession(d.id);
    } finally {
      setBusy(false);
    }
  };
  const lengthOf = (d: Day) => {
    const typical = typicalDurationMs(app.history, d.id);
    if (typical) return `usually ${Math.round(typical / 60_000)} min`;
    const est = estimateSessionMs(plans[d.id], app.program.warmup, { readySec: app.settings.readySec, rerackBonusSec: app.settings.rerackBonusSec });
    return `about ${Math.round(est / 60_000)} min`;
  };
  return (
    <>
      <div className="row spread">
        <h1 style={{ margin: 0, fontSize: 24 }}>Dumbbell Coach</h1>
        <div className="row" style={{ gap: 14 }}>
          <Link to="/history">History</Link>
          <Link to="/settings">Settings</Link>
        </div>
      </div>
      {app.mode === 'firebase' && !app.hasData && (
        <div className="card stack">
          <strong>First time here?</strong>
          <span className="muted">If your TV shows a pairing code, enter it so both screens share one session and history.</span>
          <button className="btn primary" onClick={onPair}>
            Enter pairing code
          </button>
        </div>
      )}
      {app.mode === 'local' && <div className="notice">Local mode: open /tv in another tab of this browser to see the TV screen.</div>}
      {app.history.length > 0 && (
        <div className="card stack" style={{ gap: 10 }}>
          <div className="row spread">
            <span className="eyebrow">This week</span>
            <span className={`${c.thisWeek >= c.target ? 'good' : 'muted'}`} style={{ fontSize: 14 }}>
              {c.thisWeek} of {c.target} sessions
            </span>
          </div>
          <WeekDots days={week.days} today={daysBetween(startOfWeek(now), now)} />
          <span className="faint" style={{ fontSize: 13 }}>
            {c.daysSince === null ? '' : c.daysSince === 0 ? 'Trained today.' : c.daysSince === 1 ? 'Last session yesterday.' : `Last session ${c.daysSince} days ago.`}
            {c.recentPerWeek > 0 ? ` Averaging ${c.recentPerWeek} a week lately.` : ''}
          </span>
        </div>
      )}
      <div className="card row spread" style={{ padding: '12px 18px' }}>
        <span style={{ fontSize: 14 }}>
          <span className="eyebrow">Body weight</span>
          <div className="muted">
            {body.trendLb !== null ? (
              <>
                trend {body.trendLb.toFixed(1)} lb
                {body.weeklyRate !== null && Math.abs(body.weeklyRate) >= 0.1 ? ` · ${body.weeklyRate > 0 ? '+' : ''}${body.weeklyRate.toFixed(1)}/wk` : ''}
              </>
            ) : (
              'no readings yet'
            )}
          </div>
        </span>
        <button className={`btn small ${weighedToday ? 'ghost' : ''}`} onClick={onWeigh}>
          {weighedToday ? 'Logged today' : 'Log weight'}
        </button>
      </div>
      <div className="days">
        {app.program.days.map((d) => {
          const plan = plans[d.id];
          const isSug = suggested?.id === d.id;
          return (
            <button key={d.id} className={`day ${isSug ? 'suggested' : ''}`} disabled={busy} onClick={() => void start(d)}>
              <div className="row spread">
                <span className="title">{d.name}</span>
                {isSug && <span className="pill accent">Up next</span>}
              </div>
              <span className="faint" style={{ fontSize: 13 }}>
                {plan.length} exercise{plan.length === 1 ? '' : 's'} · {lengthOf(d)}
              </span>
              <div className="list">
                {plan.map((e) => (
                  <div key={e.exerciseId}>
                    {e.name}
                    {e.load !== 'bodyweight' && (
                      <span className="faint">
                        {' '}
                        · {formatLb(e.weightLb)} lb{e.progressed ? ' ▲' : ''}
                        {e.blocked ? ' (maxed)' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <span className="btn primary small" style={{ alignSelf: 'flex-start' }}>
                Start {d.name}
              </span>
            </button>
          );
        })}
      </div>
      {app.mode === 'firebase' && app.hasData && (
        <button className="btn ghost small" style={{ alignSelf: 'center' }} onClick={onPair}>
          Pair a TV
        </button>
      )}
    </>
  );
}

function WarmupControls({ s, now }: { s: SessionState; now: number }) {
  const app = useApp();
  const p = s.phase as Extract<SessionState['phase'], { kind: 'warmup' }>;
  return (
    <>
      <div className="hero">
        <div className="eyebrow accent">
          Warm-up {p.step + 1} of {s.warmup.length}
        </div>
        <div className="name">{s.warmup[p.step]?.name}</div>
      </div>
      <div className="count">{fmtCountdown(remainingMs(s, now))}</div>
      <div className="actions">
        <button className="btn" onClick={() => void app.dispatch({ type: 'skipWarmupStep' })}>
          Next step
        </button>
        <button className="btn ghost" onClick={() => void app.dispatch({ type: 'skipWarmup' })}>
          Skip warm-up
        </button>
      </div>
    </>
  );
}

function ReadyControls({
  s,
  now,
  onWeight,
  onSwap,
  onDemo,
}: {
  s: SessionState;
  now: number;
  onWeight: () => void;
  onSwap: () => void;
  onDemo: () => void;
}) {
  const app = useApp();
  const ex = currentExercise(s)!;
  const plan = rackPlanFor(s, s.cursor.ex, app.inventory);
  return (
    <>
      <ExerciseHero ex={ex} sub={`Get ready · set ${s.cursor.set + 1} of ${ex.sets}`} />
      {ex.loading && (
        <div style={{ fontSize: 44, padding: '6px 0 18px' }}>
          <PlateBar perEnd={ex.loading.perEnd} tone="accent" />
        </div>
      )}
      <div style={{ fontSize: 15 }}>
        <RackChanges changes={plan.changes} handles={app.inventory.handles} />
      </div>
      <div className="count">{fmtCountdown(remainingMs(s, now))}</div>
      <div className="actions">
        <button className="btn primary big wide" onClick={() => void app.dispatch({ type: 'go' })}>
          Go
        </button>
        {ex.load !== 'bodyweight' && (
          <button className="btn" onClick={onWeight}>
            Change weight
          </button>
        )}
        <button className="btn" onClick={onSwap}>
          Swap exercise
        </button>
        <button className="btn ghost wide" onClick={onDemo}>
          Demo video
        </button>
      </div>
    </>
  );
}

function RepControls({ s, onWeight, onSwap, onDemo }: { s: SessionState; onWeight: () => void; onSwap: () => void; onDemo: () => void }) {
  const app = useApp();
  const ex = currentExercise(s)!;
  const lo = Math.max(1, ex.repMin - 3);
  const hi = ex.repMax + 4;
  const nums = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const target = targetReps(ex, s.cursor.set);
  return (
    <>
      <ExerciseHero ex={ex} sub={`Set ${s.cursor.set + 1} of ${ex.sets} · in progress`} />
      {target && (
        <div className="row" style={{ gap: 8 }}>
          <span className="pill accent">Aim for {target.reps}</span>
          <span className="muted" style={{ fontSize: 14 }}>
            {target.reason === 'beat' ? `one more than last time (${target.lastReps})` : target.reason === 'newWeight' ? 'new weight, clean reps first' : 'top of the range again'}
          </span>
        </div>
      )}
      <div className="muted" style={{ fontSize: 15 }}>
        How many reps did you get{ex.perSide ? ' (per side)' : ''}? Tap the number when you're done.
      </div>
      <div className="reps">
        {nums.map((n) => (
          <button
            key={n}
            className={`${n >= ex.repMax ? 'top' : n >= ex.repMin ? 'in' : ''} ${target && n === target.reps ? 'target' : ''}`}
            onClick={() => void app.dispatch({ type: 'logReps', reps: n })}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="actions">
        <button className="btn ghost small" onClick={() => void app.dispatch({ type: 'logReps', reps: 0 })}>
          Couldn't do it (0)
        </button>
        <button className="btn ghost small" onClick={onDemo}>
          Demo video
        </button>
        {ex.load !== 'bodyweight' ? (
          <button className="btn ghost small" onClick={onWeight}>
            Change weight
          </button>
        ) : (
          <span />
        )}
        <button className="btn ghost small" onClick={onSwap}>
          Swap exercise
        </button>
      </div>
    </>
  );
}

function RestControls({ s, now, onWeight, onDemo }: { s: SessionState; now: number; onWeight: () => void; onDemo: () => void }) {
  const app = useApp();
  const p = s.phase as Extract<SessionState['phase'], { kind: 'rest' }>;
  const ex = currentExercise(s)!;
  const plan = rackPlanFor(s, s.cursor.ex, app.inventory);
  const sameExercise = s.cursor.set > 0;
  const last = lastLoggedSet(s);
  const pr = last ? prForSet(app.history, s, last.ex, last.set) : null;
  const target = targetReps(ex, s.cursor.set);
  return (
    <>
      <div className="hero">
        <div className="eyebrow accent">Rest</div>
      </div>
      <div className="count">{fmtCountdown(remainingMs(s, now))}</div>
      {last && (
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <span className="muted" style={{ fontSize: 14 }}>
            Logged {last.result.reps} reps for {s.exercises[last.ex].name}, set {last.set + 1}
          </span>
          <button className="btn small ghost" onClick={() => void app.dispatch({ type: 'undoSet' })}>
            Undo
          </button>
        </div>
      )}
      {pr && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="pill good">PR · {pr.label}</span>
        </div>
      )}
      <div className="card stack" style={{ gap: 8 }}>
        <div className="eyebrow">{sameExercise ? 'Next' : 'Next up'}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{ex.name}</div>
        <div className="muted">
          Set {s.cursor.set + 1} of {ex.sets} · {repsTarget(ex)}
          {target && (
            <>
              {' '}
              · aim for <b style={{ color: 'var(--fg)' }}>{target.reps}</b>
            </>
          )}
        </div>
        {ex.load !== 'bodyweight' && (
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            {weightLabel(ex.weightLb, ex.load)}
            {ex.loading && <span className="muted" style={{ fontWeight: 400 }}> · {perEndLabel(ex.loading.perEnd)}</span>}
          </div>
        )}
        {p.rerack && plan.changes.length > 0 && (
          <div style={{ fontSize: 15 }}>
            <span className="pill accent">Change plates now</span>
            <div style={{ height: 8 }} />
            <RackChanges changes={plan.changes} handles={app.inventory.handles} />
          </div>
        )}
      </div>
      <div className="actions">
        <button className="btn primary big wide" onClick={() => void app.dispatch({ type: 'skipRest' })}>
          Skip rest
        </button>
        <button className="btn" onClick={() => void app.dispatch({ type: 'extendRest', seconds: 30 })}>
          +30 s
        </button>
        {ex.load !== 'bodyweight' ? (
          <button className="btn" onClick={onWeight}>
            Change weight
          </button>
        ) : (
          <span />
        )}
        <button className="btn ghost wide" onClick={onDemo}>
          Demo video
        </button>
      </div>
    </>
  );
}

function SummaryControls({ s, onEdit }: { s: SessionState; onEdit: () => void }) {
  const app = useApp();
  const done = s.exercises.map((e, i) => ({ e, i })).filter(({ e }) => e.results.length > 0);
  const prs = sessionPrs(app.history, s);
  const volume = sessionVolume(s);
  const pr = progress(s);
  return (
    <>
      <div className="hero">
        <div className="eyebrow accent">Session complete</div>
        <div className="name">Nice work.</div>
      </div>
      <div className="stats">
        <div>
          <b>{fmtDuration((s.endedAt ?? s.startedAt) - s.startedAt)}</b>
          <span>on the clock</span>
        </div>
        <div>
          <b>{pr.setsDone}</b>
          <span>sets</span>
        </div>
        {volume > 0 && (
          <div>
            <b>{volume.toLocaleString()}</b>
            <span>lb moved</span>
          </div>
        )}
        {prs.length > 0 && (
          <div>
            <b className="good">{prs.length}</b>
            <span>{prs.length === 1 ? 'PR' : 'PRs'}</span>
          </div>
        )}
      </div>
      <div className="card stack" style={{ gap: 8 }}>
        {done.map(({ e, i }) => {
          const mine = prs.filter((p) => p.ex === i);
          return (
            <div key={e.exerciseId} className="stack" style={{ gap: 4 }}>
              <div className="row spread">
                <span>{e.name}</span>
                <span className="muted">
                  {e.load !== 'bodyweight' ? `${formatLb(e.results[0].weightLb)} lb × ` : ''}
                  {e.results.map((r) => r.reps).join(', ')}
                </span>
              </div>
              {mine.length > 0 && (
                <div className="row wrap" style={{ gap: 6 }}>
                  {mine.map((p) => (
                    <span key={p.set} className="pill good">
                      Set {p.set + 1} · {p.pr.label}
                    </span>
                  ))}
                </div>
              )}
              {e.note && <div className="faint" style={{ fontSize: 13 }}>{e.note}</div>}
            </div>
          );
        })}
        {!done.length && <span className="muted">Nothing logged.</span>}
        {s.note && <div className="muted" style={{ fontSize: 14, borderTop: '1px solid var(--line)', paddingTop: 8 }}>{s.note}</div>}
      </div>
      <button className="btn ghost" onClick={onEdit}>
        Fix a number or add a note
      </button>
      <button className="btn primary big" onClick={() => void app.clearLive()}>
        Finish
      </button>
      <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
        <Link to="/history">History</Link>
        <Link to="/settings">Settings</Link>
      </div>
    </>
  );
}

// ---------- Sheets ----------

function WeightSheet({ ex, onClose, onDone }: { ex: PlannedExercise; onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const mode = ex.load;
  const weights = achievableWeights(app.inventory, mode);
  const pick = async (lb: number) => {
    const loading = loadingFor(app.inventory, mode, lb, ex.loading?.perEnd);
    await app.dispatch({ type: 'overrideWeight', weightLb: lb, loading });
    onDone(`${ex.name}: ${formatLb(lb)} lb`);
    onClose();
  };
  return (
    <BottomSheet onClose={onClose} title={`Weight for ${ex.name}`}>
      <div className="muted">
        Only weights your plates can build. Prescribed: {formatLb(ex.prescribedLb)} lb{mode === 'pair' ? ' each' : ''}.
      </div>
      <div className="chips">
        {weights.map((w) => (
          <button key={w} className={Math.abs(w - ex.weightLb) < 1e-9 ? 'on' : ''} onClick={() => void pick(w)}>
            {formatLb(w)}
          </button>
        ))}
      </div>
      {ex.loading && (
        <div className="muted" style={{ fontSize: 14 }}>
          Now: {perEndLabel(ex.loading.perEnd)}
        </div>
      )}
    </BottomSheet>
  );
}

function SwapSheet({
  session,
  ex,
  onClose,
  onDone,
}: {
  session: SessionState;
  ex: PlannedExercise;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const app = useApp();
  const lib = app.program.exercises;
  const subs = ex.substitutes.map((id) => lib[id]).filter(Boolean);
  const inSession = new Set(session.exercises.map((e) => e.exerciseId));
  const others = Object.values(lib)
    .filter((e) => e.id !== ex.exerciseId && !subs.includes(e) && !inSession.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pick = async (id: string) => {
    const target = lib[id];
    const planned = planExercise(target, app.history, app.inventory, { sets: ex.sets }, ex.loading?.perEnd, app.settings.progressionRule);
    await app.dispatch({ type: 'substitute', exercise: planned });
    onDone(`Swapped to ${target.name}`);
    onClose();
  };
  const Item = ({ id, name }: { id: string; name: string }) => (
    <button className="item" onClick={() => void pick(id)}>
      <span>{name}</span>
      <span className="muted" style={{ fontSize: 13 }}>
        {lib[id].load === 'bodyweight' ? 'bodyweight' : lib[id].load}
      </span>
    </button>
  );
  return (
    <BottomSheet onClose={onClose} title={`Swap ${ex.name}`}>
      {subs.length > 0 && (
        <>
          <div className="eyebrow">Substitutes</div>
          <div className="list">
            {subs.map((e) => (
              <Item key={e.id} id={e.id} name={e.name} />
            ))}
          </div>
        </>
      )}
      <div className="eyebrow">Anything else</div>
      <div className="list">
        {others.map((e) => (
          <Item key={e.id} id={e.id} name={e.name} />
        ))}
      </div>
    </BottomSheet>
  );
}

// The steps YouTube's player accepts; the native <video> path takes any of them too.
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** The TV's playback feed for this household (see `DemoPlayback`). */
function usePlayback(): DemoPlayback | null {
  const app = useApp();
  const [pb, setPb] = useState<DemoPlayback | null>(null);
  useEffect(() => app.backend.subscribe<DemoPlayback>(playbackPath(app.hid), setPb), [app.backend, app.hid]);
  return pb;
}

/** How long a tap's optimistic state is trusted over the TV's feed. */
const OPTIMISTIC_MS = 3000;

function DemoSheet({ session, ex, now, onClose }: { session: SessionState; ex: PlannedExercise; now: number; onClose: () => void }) {
  const app = useApp();
  const d = session.demo;
  const cmd = (c: DemoCommand) => void app.dispatch({ type: 'demoCommand', cmd: c });
  const timed = session.phase.kind === 'rest' || session.phase.kind === 'ready' || session.phase.kind === 'warmup';

  const feed = usePlayback();
  const fresh = isFresh(feed, session.id, ex.exerciseId, now);
  const duration = fresh ? feed.duration : 0;

  // The feed lags a tap by up to a second, so a tap's effect is shown at once and kept
  // until the TV reports something that agrees with it (or a few seconds pass).
  const [flip, setFlip] = useState<{ playing: boolean; at: number } | null>(null);
  const [seek, setSeek] = useState<{ to: number; at: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  let playing = fresh ? feed.playing : false;
  if (flip && fresh && now - flip.at < OPTIMISTIC_MS && !(feed.at > flip.at && feed.playing === flip.playing)) playing = flip.playing;
  let pos = fresh ? positionAt(feed, now) : 0;
  if (seek && fresh && now - seek.at < OPTIMISTIC_MS) {
    const expected = seek.to + (playing ? ((now - seek.at) / 1000) * feed.rate : 0);
    if (!(feed.at > seek.at && Math.abs(pos - expected) < 2)) pos = Math.min(expected, duration || expected);
  }
  if (drag !== null) pos = drag;

  const nowRef = useRef(now);
  nowRef.current = now;
  const start = ex.demo?.type === 'youtube' ? (ex.demo.start ?? 0) : 0;
  const clampPos = (v: number) => Math.max(0, duration > 0 ? Math.min(duration, v) : v);
  const showAt = (to: number, playingNow: boolean) => {
    setSeek({ to, at: nowRef.current });
    setFlip({ playing: playingNow, at: nowRef.current });
  };

  const onDrag = (v: number) => {
    dragRef.current = v;
    setDrag(v);
  };
  const commit = () => {
    const v = dragRef.current;
    if (v === null) return;
    dragRef.current = null;
    setDrag(null);
    setSeek({ to: v, at: nowRef.current });
    cmd({ type: 'seekTo', seconds: v });
  };
  // The native `change` event fires once when a drag ends, even if the finger or pointer
  // is released outside the slider, so a drag can never be left half-finished.
  const slider = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = slider.current;
    if (!el) return;
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nudge = (seconds: number) => {
    showAt(clampPos(pos + seconds), true);
    cmd({ type: 'seekBy', seconds });
  };
  const restart = () => {
    showAt(start, true);
    cmd({ type: 'restart' });
  };
  const playPause = () => {
    setFlip({ playing: !playing, at: now });
    cmd(fresh ? { type: playing ? 'pause' : 'play' } : { type: 'toggle' });
  };

  const canScrub = fresh && duration > 0;
  const pct = canScrub ? Math.min(100, (pos / duration) * 100) : 0;
  return (
    <BottomSheet onClose={onClose} title={ex.name}>
      {!ex.demo && <div className="notice">No demo clip for this exercise yet. Add one in Settings → Exercises.</div>}
      <div className="row">
        <button className={`btn grow ${d.enlarged ? '' : 'primary'}`} onClick={() => void app.dispatch({ type: d.enlarged ? 'hideDemo' : 'showDemo' })}>
          {d.enlarged ? 'Hide from TV' : 'Show on TV'}
        </button>
        {timed && (
          <button className={`btn grow ${session.paused ? 'primary' : 'ghost'}`} onClick={() => void app.dispatch({ type: session.paused ? 'resume' : 'pause' })}>
            {session.paused ? 'Resume timer' : 'Pause timer'}
          </button>
        )}
      </div>
      <div className="eyebrow">Playback</div>
      <div className="scrub">
        <input
          ref={slider}
          type="range"
          aria-label="Position in the clip"
          min={0}
          max={canScrub ? duration : 1}
          step={0.1}
          value={canScrub ? Math.min(pos, duration) : 0}
          disabled={!canScrub}
          style={{ '--pct': `${pct}%` } as CSSProperties}
          onChange={(e) => onDrag(Number(e.target.value))}
          onPointerUp={commit}
          onPointerCancel={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
        />
        <div className="row spread times">
          <span>{fmtClock(pos)}</span>
          <span>{canScrub ? fmtClock(duration) : '–:––'}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={restart} aria-label="Restart">
          <RestartIcon />
        </button>
        <button className="btn grow" onClick={() => nudge(-5)}>
          −5s
        </button>
        <button className="btn grow" onClick={playPause} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button className="btn grow" onClick={() => nudge(5)}>
          +5s
        </button>
        <button
          className={`btn grow ${d.muted ? 'ghost' : ''}`}
          onClick={() => void app.dispatch({ type: 'demoMuted', muted: !d.muted })}
          aria-label={d.muted ? 'Turn sound on' : 'Turn sound off'}
          aria-pressed={!d.muted}
        >
          {d.muted ? <SoundOffIcon /> : <SoundOnIcon />}
        </button>
      </div>
      {ex.demo && !fresh && (
        <div className="faint" style={{ fontSize: 13 }}>
          The TV isn't playing this clip right now{d.enlarged ? '' : ': "Show on TV" puts it up'}.
        </div>
      )}
      <div className="eyebrow">Speed</div>
      <div className="rates">
        {RATES.map((r) => (
          <button key={r} className={`btn ${Math.abs(d.rate - r) < 0.01 ? 'primary' : ''}`} onClick={() => void app.dispatch({ type: 'demoRate', rate: r })}>
            {r === 1 ? 'Normal' : `${r}×`}
          </button>
        ))}
      </div>
      <p className="faint" style={{ fontSize: 13, margin: 0 }}>
        The clip hides on its own when the set starts. Speed and sound stay until you change them.
      </p>
    </BottomSheet>
  );
}

function PairSheet({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const app = useApp();
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('pair') ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const hid = await joinPairing(app.backend, code, app.hasData ? app.hid : null);
      app.setHid(hid);
      onDone('Paired with the TV');
      window.history.replaceState({}, '', '/remote');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (app.mode !== 'firebase') {
    return (
      <BottomSheet onClose={onClose} title="Pairing">
        <p className="muted">Local mode doesn't need pairing: open /tv in another tab of this browser.</p>
      </BottomSheet>
    );
  }
  return (
    <BottomSheet onClose={onClose} title="Pair with the TV">
      <p className="muted">Type the 4-letter code shown at the bottom of the TV screen.</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD"
        maxLength={4}
        autoCapitalize="characters"
        autoCorrect="off"
        style={{ fontSize: 28, letterSpacing: '0.3em', textAlign: 'center' }}
      />
      {err && <div className="error">{err}</div>}
      <button className="btn primary big" disabled={busy || code.length !== 4} onClick={() => void go()}>
        Pair
      </button>
      {app.hasData && <p className="faint" style={{ fontSize: 13 }}>This phone's history will be used on the TV.</p>}
    </BottomSheet>
  );
}
