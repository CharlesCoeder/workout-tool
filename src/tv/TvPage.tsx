import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useApp, useSettled } from '../lib/store';
import { hostPairing } from '../lib/pairing';
import { beep, unlockAudio } from '../lib/beep';
import { onUserActivation, useUserActivated } from '../lib/activation';
import { playbackPath, shouldPublish } from '../engine/playback';
import { currentExercise, isTimed, progress, remainingMs } from '../engine/session';
import { prescribe } from '../engine/progression';
import { suggestNextDay, toRecord } from '../engine/plan';
import { formatLb } from '../engine/plates';
import { prForSet, sessionPrs, sessionVolume, targetReps, type RepTarget } from '../engine/records';
import type { DemoPlayback, Inventory, PlannedExercise, Program, SessionRecord, SessionState } from '../engine/types';
import { Demo, applyDemoCommand, onDemoProgress } from '../ui/Demo';
import { PlateBar } from '../ui/PlateBar';
import { RackChanges } from '../ui/RackChanges';
import { rackPlanFor } from '../ui/rack';
import { fmtCountdown, fmtDuration, modeLabel, perEndLabel, repsTarget, weightLabel } from '../ui/format';
import { useVoice } from '../voice/useVoice';

export function TvPage() {
  const app = useApp();
  const { session, now } = useSettled();
  const [code, setCode] = useState<string | null>(null);
  // Browsers allow sound (beeps, demo audio) only after a click on the page.
  const activated = useUserActivated();

  // Pairing host (Firebase mode only). A new code is issued after each successful pairing.
  useEffect(() => {
    if (app.mode !== 'firebase') return;
    let stop = () => {};
    let cancelled = false;
    const start = () => {
      const h = hostPairing(app.backend, app.hid, (hid) => {
        if (cancelled) return;
        if (hid !== app.hid) app.setHid(hid);
        stop();
        setTimeout(start, 500);
      });
      stop = h.stop;
      setCode(h.code);
    };
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [app.mode, app.backend, app.hid, app.setHid]);

  // Beeps at 3, 2, 1 and a higher one when a countdown lands.
  const lastSec = useRef<number>(-1);
  const lastKind = useRef<string>('');
  useEffect(() => {
    if (!session) return;
    const kind = session.phase.kind;
    if (app.settings.countdownBeeps) {
      if (isTimed(session.phase) && !session.paused) {
        const sec = Math.ceil(remainingMs(session, now) / 1000);
        if (sec !== lastSec.current && sec >= 1 && sec <= 3) beep(false);
        lastSec.current = sec;
      }
      if (kind === 'working' && lastKind.current && lastKind.current !== 'working' && lastKind.current !== 'logging') beep(true, 220);
    }
    lastKind.current = kind;
  }, [session, now, app.settings.countdownBeeps]);

  // The AudioContext for beeps has to be created inside that first gesture.
  useEffect(() => onUserActivation(unlockAudio), []);

  const voice = useVoice(app.settings.voiceEnabled, session, app.dispatch);

  // One-shot demo commands from the remote (seek, restart, play/pause).
  const lastSeq = useRef<number>(-1);
  useEffect(() => {
    if (!session) {
      lastSeq.current = -1;
      return;
    }
    const { seq, cmd } = session.demo;
    if (lastSeq.current === -1) {
      lastSeq.current = seq; // don't replay a stale command on (re)load
      return;
    }
    if (seq !== lastSeq.current) {
      lastSeq.current = seq;
      if (cmd) applyDemoCommand(cmd);
    }
  }, [session]);

  // Publish where the primary demo player is, so the phone can draw a scrubber and the
  // right play/pause icon. Steady playback costs one write per heartbeat; seeks, pauses and
  // loops are written straight away. A short grace period covers the moment the enlarged
  // stage closes and the side player takes over as primary.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const lastPub = useRef<DemoPlayback | null>(null);
  useEffect(() => {
    const path = playbackPath(app.hid);
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const off = onDemoProgress((prog) => {
      const s = sessionRef.current;
      const ex = s ? currentExercise(s) : undefined;
      if (!prog || !s || !ex) {
        if (clearTimer || !lastPub.current) return;
        clearTimer = setTimeout(() => {
          clearTimer = null;
          lastPub.current = null;
          void app.backend.remove(path);
        }, 400);
        return;
      }
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      const next: DemoPlayback = { sessionId: s.id, exerciseId: ex.exerciseId, ...prog, at: app.backend.now() };
      if (!shouldPublish(lastPub.current, next)) return;
      lastPub.current = next;
      void app.backend.set(path, next);
    });
    return () => {
      off();
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [app.backend, app.hid]);

  if (!app.loaded) {
    return (
      <div className="tv">
        <div className="main center">
          <div className="muted">Connecting…</div>
        </div>
      </div>
    );
  }

  const wantsSound = app.settings.countdownBeeps || !(session?.demo.muted ?? false);
  const soundHint = wantsSound && !activated ? 'Click once on this screen to enable sound' : '';
  const voiceHint = app.settings.voiceEnabled ? voice.status : '';

  if (!session) return <TvIdle code={code} mode={app.mode} program={app.program} history={app.history} hint={soundHint} voiceHint={voiceHint} />;

  const inv = app.inventory;
  const p = session.phase;
  let body: ReactElement;
  switch (p.kind) {
    case 'warmup':
      body = <TvWarmup s={session} now={now} inv={inv} />;
      break;
    case 'ready':
      body = <TvReady s={session} now={now} inv={inv} />;
      break;
    case 'working':
      body = <TvWorking s={session} />;
      break;
    case 'logging':
      body = <TvLogging s={session} />;
      break;
    case 'rest':
      body = <TvRest s={session} now={now} inv={inv} history={app.history} />;
      break;
    case 'summary':
      body = <TvSummary s={session} program={app.program} history={app.history} inv={inv} />;
      break;
  }

  const ex = currentExercise(session);
  const rate = session.demo.rate;
  const timedLabel =
    p.kind === 'rest' ? 'Rest' : p.kind === 'ready' ? 'Starts in' : p.kind === 'warmup' ? 'Warm-up' : p.kind === 'working' ? `Set ${session.cursor.set + 1}` : '';
  return (
    <div className={`tv ${session.paused ? 'is-paused' : ''}`}>
      {body}
      {session.demo.enlarged && ex && p.kind !== 'summary' && (
        <div className="overlay demo-stage">
          <div className="stage-top">
            <div>
              <div className="eyebrow accent">{ex.name}</div>
              <div className="hint" style={{ marginTop: '0.6vmin' }}>
                {rate !== 1 ? `${rate}× speed · ` : ''}
                {session.demo.muted ? 'Sound off · ' : ''}Controls are on your phone
              </div>
            </div>
            <div className="stage-timer">
              {session.paused ? (
                <span className="badge warn">Paused</span>
              ) : isTimed(session.phase) ? (
                <>
                  <span className="eyebrow">{timedLabel}</span>
                  <span className="countdown small" style={{ fontSize: '7vmin' }}>
                    {fmtCountdown(remainingMs(session, now))}
                  </span>
                </>
              ) : (
                <span className="eyebrow">{timedLabel}</span>
              )}
            </div>
          </div>
          <Demo demo={ex.demo} rate={rate} muted={session.demo.muted} primary className="stage-video" />
          <div className="cue" style={{ textAlign: 'center', maxWidth: '60em' }}>
            {ex.cue}
          </div>
        </div>
      )}
      {session.paused && !session.demo.enlarged && (
        <div className="paused-badge">
          <span className="badge warn pulse">Paused</span>
          <span className="hint">resume from your phone</span>
        </div>
      )}
      {(soundHint || voiceHint) && (
        <div style={{ position: 'fixed', right: '5vmin', bottom: '1.5vmin' }} className="hint">
          {[voiceHint, soundHint].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

// ---------- Frame pieces ----------

function Top({ s }: { s: SessionState }) {
  const pr = progress(s);
  const exIndex = s.exercises.slice(0, s.cursor.ex + 1).filter((e) => !e.skipped).length;
  return (
    <div className="top">
      <div className="eyebrow">
        {s.dayName} · Exercise {Math.min(exIndex, pr.exercisesTotal)} of {pr.exercisesTotal}
      </div>
      <div className="muted">
        {pr.setsDone} / {pr.setsTotal} sets
      </div>
    </div>
  );
}

function ProgressBar({ s }: { s: SessionState }) {
  const pr = progress(s);
  const pct = pr.setsTotal ? (pr.setsDone / pr.setsTotal) * 100 : 0;
  return (
    <div className="progress">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

function SetDots({ ex, current }: { ex: PlannedExercise; current: number }) {
  return (
    <div className="sets">
      {Array.from({ length: ex.sets }, (_, i) => {
        const r = ex.results[i];
        const cls = r ? 'done' : i === current ? 'now' : '';
        return (
          <span key={i} className={`dot ${cls}`}>
            {r ? r.reps : ''}
          </span>
        );
      })}
      <span className="muted" style={{ marginLeft: '1vmin' }}>
        Set {Math.min(current + 1, ex.sets)} of {ex.sets}
      </span>
    </div>
  );
}

function WeightBlock({ ex, size = 'big', showPerEnd = true }: { ex: PlannedExercise; size?: 'big' | 'small'; showPerEnd?: boolean }) {
  if (ex.load === 'bodyweight') {
    return (
      <div className={size === 'big' ? 'weight' : ''} style={size === 'small' ? { fontSize: '3.2vmin', fontWeight: 600 } : undefined}>
        Bodyweight
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: '1.4vmin' }}>
      <div className={size === 'big' ? 'weight' : ''} style={size === 'small' ? { fontSize: '4vmin', fontWeight: 700 } : undefined}>
        {formatLb(ex.weightLb)} lb
        <small style={size === 'small' ? { marginLeft: '0.4em', fontWeight: 500, color: 'var(--fg-2)' } : undefined}>
          {ex.load === 'pair' ? 'each · two dumbbells' : 'one dumbbell'}
        </small>
      </div>
      {ex.loading && (
        <div style={{ fontSize: size === 'big' ? '7vmin' : '5vmin' }}>
          <PlateBar perEnd={ex.loading.perEnd} tone="accent" />
        </div>
      )}
      {(showPerEnd || ex.weightLb !== ex.prescribedLb) && (
        <div className="muted" style={{ fontSize: '2.6vmin' }}>
          {showPerEnd && ex.loading ? perEndLabel(ex.loading.perEnd) : ''}
          {ex.weightLb !== ex.prescribedLb && <span className="faint"> · overridden from {formatLb(ex.prescribedLb)} lb</span>}
        </div>
      )}
    </div>
  );
}

function Flags({ ex }: { ex: PlannedExercise }) {
  const items: ReactElement[] = [];
  if (ex.progressed) items.push(<span key="up" className="badge good">▲ Up from last time</span>);
  if (ex.blocked) items.push(<span key="blocked" className="badge warn">Earned a bump · maxed out on your current plates</span>);
  else if (ex.maxedOut && ex.load !== 'bodyweight') items.push(<span key="max" className="badge warn">Maxed out on your current plates</span>);
  if (ex.substitutedFrom) items.push(<span key="sub" className="badge dim">Substitute</span>);
  if (!items.length) return null;
  return <div className="row wrap">{items}</div>;
}

/** "Beat the logbook": the rep count to aim for this set, and why. */
function TargetLine({ target, size = 'big' }: { target: RepTarget | null; size?: 'big' | 'small' }) {
  if (!target) return null;
  const why =
    target.reason === 'beat'
      ? `one more than last time (${target.lastReps})`
      : target.reason === 'newWeight'
        ? 'new weight: clean reps first, add reps next time'
        : 'top of the range again';
  return (
    <div className={`target ${size}`}>
      <b>Aim for {target.reps}</b>
      <span className="muted"> · {why}</span>
    </div>
  );
}

function LastTime({ ex }: { ex: PlannedExercise }) {
  if (!ex.lastTime) return <div className="lasttime faint">First time on this one. Pick a weight you can do for {ex.repMax} clean reps.</div>;
  return (
    <div className="lasttime">
      Last time: {ex.load === 'bodyweight' ? '' : `${formatLb(ex.lastTime.weightLb)} lb × `}
      {ex.lastTime.reps.join(', ')}
      {ex.maxedOut && ex.load !== 'bodyweight' ? ' · push toward the top of the range' : ''}
    </div>
  );
}

// ---------- Screens ----------

function TvIdle({
  code,
  mode,
  program,
  history,
  hint,
  voiceHint,
}: {
  code: string | null;
  mode: 'local' | 'firebase';
  program: Program;
  history: SessionRecord[];
  hint: string;
  voiceHint: string;
}) {
  const next = suggestNextDay(program, history);
  const last = [...history].sort((a, b) => b.startedAt - a.startedAt)[0];
  const host = window.location.host;
  return (
    <div className="tv">
      <div className="top">
        <div className="eyebrow">Dumbbell Coach</div>
        <div className="muted">{last ? `Last session: ${last.dayName}, ${new Date(last.startedAt).toLocaleDateString()}` : ''}</div>
      </div>
      <div className="main center">
        <div className="col center fade-in">
          <div className="eyebrow accent">Ready when you are</div>
          <div className="exercise">{next ? next.name : 'No program yet'}</div>
          {next && (
            <div className="cue" style={{ textAlign: 'center' }}>
              {next.entries.map((e) => program.exercises[e.exerciseId]?.name).filter(Boolean).join(' · ')}
            </div>
          )}
          <div className="muted" style={{ marginTop: '4vmin' }}>
            Tap a day on your phone to start
          </div>
        </div>
      </div>
      <div className="bottom">
        <div className="row" style={{ gap: '2vmin' }}>
          {mode === 'firebase' && code ? (
            <>
              <span>
                Pair a phone: open <span className="mono">{host}/remote</span> and enter
              </span>
              <span className="code">{code}</span>
            </>
          ) : (
            <span className="faint">Local mode: open /remote in another tab of this browser.</span>
          )}
        </div>
        <div className="hint">{[voiceHint, hint].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  );
}

function TvWarmup({ s, now, inv }: { s: SessionState; now: number; inv: Inventory }) {
  const p = s.phase as Extract<SessionState['phase'], { kind: 'warmup' }>;
  const step = s.warmup[p.step];
  const next = s.warmup[p.step + 1];
  const first = s.exercises.find((e) => !e.skipped);
  const plan = rackPlanFor(s, 0, inv);
  return (
    <>
      <div className="top">
        <div className="eyebrow">
          {s.dayName} · Warm-up {p.step + 1} of {s.warmup.length}
        </div>
        <div className="muted">{fmtDuration(now - s.startedAt)} in</div>
      </div>
      <div className="main">
        <div className="col center">
          <div className="eyebrow accent">Warm-up</div>
          <div className="exercise" key={p.step}>
            {step?.name}
          </div>
          <div className="countdown" key={'c' + p.step}>
            {fmtCountdown(remainingMs(s, now))}
          </div>
          <div className="muted">{next ? `Next: ${next.name}` : first ? `Next: ${first.name}` : ''}</div>
        </div>
        {first && (
          <div className="col side">
            <div className="next">
              <div className="eyebrow">First exercise</div>
              <div className="exercise">{first.name}</div>
              {first.load !== 'bodyweight' && (
                <>
                  <div style={{ fontSize: '3.6vmin', fontWeight: 700 }}>{weightLabel(first.weightLb, first.load)}</div>
                  {first.loading && (
                    <div style={{ fontSize: '5vmin' }}>
                      <PlateBar perEnd={first.loading.perEnd} tone="accent" />
                    </div>
                  )}
                  <div className="muted">Load the bars while you warm up</div>
                  <RackChanges changes={plan.changes} handles={inv.handles} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="bottom">
        <div className="hint">Easy pace. This is just to get warm.</div>
      </div>
    </>
  );
}

function TvReady({ s, now, inv }: { s: SessionState; now: number; inv: Inventory }) {
  const ex = currentExercise(s)!;
  const rate = s.demo.rate;
  const plan = rackPlanFor(s, s.cursor.ex, inv);
  return (
    <>
      <Top s={s} />
      <div className="main">
        <div className="col fade-in" key={ex.exerciseId}>
          <div className="row" style={{ gap: '2vmin' }}>
            <span className="badge accent">Get ready</span>
            <span className="countdown small" style={{ fontSize: '6vmin' }}>
              {fmtCountdown(remainingMs(s, now))}
            </span>
          </div>
          <div className="exercise">{ex.name}</div>
          <SetDots ex={ex} current={s.cursor.set} />
          <WeightBlock ex={ex} showPerEnd={plan.changes.length === 0} />
          <RackChanges changes={plan.changes} handles={inv.handles} />
          <Flags ex={ex} />
          <div className="cue" style={{ fontSize: '2.7vmin' }}>{ex.cue}</div>
          <LastTime ex={ex} />
        </div>
        <div className="col side wide">
          <Demo demo={ex.demo} rate={rate} muted={s.demo.muted} primary={!s.demo.enlarged} />
          <div className="muted" style={{ textAlign: 'center' }}>
            {repsTarget(ex)} · {modeLabel(ex.load)}
          </div>
        </div>
      </div>
      <div className="bottom">
        <div className="hint">Starts on its own. Tap "Go" on your phone to start sooner.</div>
      </div>
      <ProgressBar s={s} />
    </>
  );
}

function TvWorking({ s }: { s: SessionState }) {
  const ex = currentExercise(s)!;
  const rate = s.demo.rate;
  return (
    <>
      <Top s={s} />
      <div className="main">
        <div className="col fade-in" key={`${ex.exerciseId}-${s.cursor.set}`}>
          <div className="row" style={{ gap: '2vmin' }}>
            <span className="badge accent pulse">Go</span>
            <span className="eyebrow">
              Set {s.cursor.set + 1} of {ex.sets}
            </span>
          </div>
          <div className="exercise">{ex.name}</div>
          <div style={{ fontSize: '5vmin', fontWeight: 700 }} className="accent">
            {repsTarget(ex)}
          </div>
          <TargetLine target={targetReps(ex, s.cursor.set)} />
          <div className="cue">Leave one or two reps in the tank. Stop when the next rep would be ugly.</div>
          <WeightBlock ex={ex} size="small" />
          <SetDots ex={ex} current={s.cursor.set} />
          <LastTime ex={ex} />
        </div>
        <div className="col side wide">
          <Demo demo={ex.demo} rate={rate} muted={s.demo.muted} primary={!s.demo.enlarged} />
          <div className="cue" style={{ fontSize: '2.6vmin', textAlign: 'center' }}>
            {ex.cue}
          </div>
        </div>
      </div>
      <div className="bottom">
        <div className="hint">When you're done, tap how many reps you got.</div>
      </div>
      <ProgressBar s={s} />
    </>
  );
}

function TvLogging({ s }: { s: SessionState }) {
  const ex = currentExercise(s)!;
  return (
    <>
      <Top s={s} />
      <div className="main center">
        <div className="col center fade-in">
          <div className="eyebrow accent">
            {ex.name} · Set {s.cursor.set + 1} of {ex.sets}
          </div>
          <div className="exercise">How many reps?</div>
          <div className="cue" style={{ textAlign: 'center' }}>
            Tap the number on your phone{ex.perSide ? ' (per side)' : ''}.
          </div>
        </div>
      </div>
      <ProgressBar s={s} />
    </>
  );
}

function TvRest({ s, now, inv, history }: { s: SessionState; now: number; inv: Inventory; history: SessionRecord[] }) {
  const p = s.phase as Extract<SessionState['phase'], { kind: 'rest' }>;
  const ex = currentExercise(s)!; // cursor already points at the NEXT set
  const sameExercise = s.cursor.set > 0;
  const prevIndex = sameExercise ? s.cursor.ex : s.exercises.slice(0, s.cursor.ex).map((e) => e.results.length > 0).lastIndexOf(true);
  const prevEx = prevIndex >= 0 ? s.exercises[prevIndex] : undefined;
  const last = prevEx?.results[prevEx.results.length - 1];
  const pr = prevEx && last ? prForSet(history, s, prevIndex, prevEx.results.length - 1) : null;
  const plan = useMemo(() => rackPlanFor(s, s.cursor.ex, inv), [s, inv]);
  const rem = remainingMs(s, now);
  return (
    <>
      <Top s={s} />
      <div className="main">
        <div className="col center">
          <div className="eyebrow accent">Rest</div>
          <div className={`countdown ${rem < 1000 ? 'zero' : ''}`}>{fmtCountdown(rem)}</div>
          {last && prevEx && (
            <div className="muted">
              {prevEx.name}: {last.reps} reps
              {prevEx.load !== 'bodyweight' ? ` at ${formatLb(last.weightLb)} lb` : ''}
              {last.reps >= prevEx.repMax && prevEx.results.length === 1 && prevEx.load !== 'bodyweight'
                ? prevEx.maxedOut
                  ? ' · top of the range at your plate ceiling'
                  : ' · weight goes up next time'
                : ''}
            </div>
          )}
          {pr && (
            <span className="badge good fade-in" key={`${prevIndex}-${prevEx?.results.length}`}>
              PR · {pr.label}
            </span>
          )}
        </div>
        <div className="col side">
          <div className="next fade-in" key={`${ex.exerciseId}-${s.cursor.set}`}>
            <div className="eyebrow">{sameExercise ? 'Next' : 'Next up'}</div>
            <div className="exercise">{ex.name}</div>
            <div className="muted">
              Set {s.cursor.set + 1} of {ex.sets} · {repsTarget(ex)}
            </div>
            <TargetLine target={targetReps(ex, s.cursor.set)} size="small" />
            {ex.load !== 'bodyweight' && (
              <>
                <div style={{ fontSize: '3.6vmin', fontWeight: 700 }}>{weightLabel(ex.weightLb, ex.load)}</div>
                {ex.loading && (
                  <div style={{ fontSize: '5vmin' }}>
                    <PlateBar perEnd={ex.loading.perEnd} tone={plan.changes.length ? 'accent' : 'dim'} />
                  </div>
                )}
              </>
            )}
            {p.rerack && plan.changes.length > 0 && (
              <>
                <span className="badge accent" style={{ alignSelf: 'flex-start' }}>
                  Change plates now
                </span>
                <RackChanges changes={plan.changes} handles={inv.handles} />
              </>
            )}
            {!sameExercise && <Flags ex={ex} />}
          </div>
          {!sameExercise && <Demo demo={ex.demo} rate={s.demo.rate} muted={s.demo.muted} primary={!s.demo.enlarged} />}
        </div>
      </div>
      <div className="bottom">
        <div className="hint">{sameExercise ? 'Breathe. Same weight, same movement.' : ex.cue}</div>
      </div>
      <ProgressBar s={s} />
    </>
  );
}

function TvSummary({ s, program, history, inv }: { s: SessionState; program: Program; history: SessionRecord[]; inv: Inventory }) {
  const rec = toRecord(s);
  const hist = [...history.filter((h) => h.id !== s.id), rec];
  const prs = sessionPrs(history, s);
  const rows = s.exercises
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.results.length > 0)
    .map(({ e, i }) => {
      const lib = program.exercises[e.exerciseId];
      const next = lib ? prescribe(lib, hist, inv) : null;
      const prSets = new Set(prs.filter((p) => p.ex === i).map((p) => p.set));
      return { e, next, prSets };
    });
  const durationMs = (s.endedAt ?? s.startedAt) - s.startedAt;
  const volume = sessionVolume(s);
  const pr = progress(s);
  return (
    <>
      <div className="top">
        <div className="eyebrow">{s.dayName}</div>
        <div className="muted">{fmtDuration(durationMs)}</div>
      </div>
      <div className="main" style={{ alignItems: 'flex-start', paddingTop: '2vmin' }}>
        <div className="col">
          <div className="eyebrow accent">Session complete</div>
          <div className="exercise small">Nice work. Everything's saved.</div>
          <div className="stats">
            <div>
              <b>{fmtDuration(durationMs)}</b>
              <span>on the clock</span>
            </div>
            <div>
              <b>{pr.setsDone}</b>
              <span>sets</span>
            </div>
            {volume > 0 && (
              <div>
                <b>{volume.toLocaleString()} lb</b>
                <span>moved</span>
              </div>
            )}
            {prs.length > 0 && (
              <div>
                <b className="good">{prs.length}</b>
                <span>{prs.length === 1 ? 'personal record' : 'personal records'}</span>
              </div>
            )}
          </div>
          <table className="summary">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Weight</th>
                <th>Reps</th>
                <th>Next time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, next, prSets }) => (
                <tr key={e.exerciseId}>
                  <td>{e.name}</td>
                  <td>{weightLabel(e.results[0].weightLb, e.load)}</td>
                  <td>
                    {e.results.map((r, k) => (
                      <span key={k}>
                        {k > 0 ? ', ' : ''}
                        {prSets.has(k) ? <b className="good">{r.reps}★</b> : r.reps}
                      </span>
                    ))}
                  </td>
                  <td>
                    {!next || e.load === 'bodyweight' ? (
                      <span className="faint">reps only</span>
                    ) : next.progressed ? (
                      <span className="good">▲ {formatLb(next.weightLb)} lb</span>
                    ) : next.blocked ? (
                      <span className="warn">maxed out on your plates</span>
                    ) : (
                      <span className="muted">same, {formatLb(next.weightLb)} lb</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.some((r) => r.next?.blocked) && (
            <div className="cue warn">You've outgrown your plates on at least one lift. Add plates in Settings → Equipment when you buy them.</div>
          )}
        </div>
      </div>
      <div className="bottom">
        <div className="hint">Tap "Finish" on your phone to clear the screen.</div>
      </div>
    </>
  );
}
