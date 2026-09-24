import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import {
  MUSCLES,
  addDays,
  consistency,
  daysBetween,
  firstWeek,
  muscleSources,
  muscleWeeks,
  plannedSetsPerMuscle,
  setsPerMuscle,
  startOfDay,
  startOfWeek,
  weeklyStats,
  type WeekStat,
} from '../engine/stats';
import { allPrs, volumeBreakdown, volumeMultiplier, type VolumeLine } from '../engine/records';
import { formatLb } from '../engine/plates';
import { fmtDate } from '../ui/format';
import { WeekDots } from '../ui/WeekDots';

const WEEKS = 12;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "This week", "Last week", or the week's dates. */
function weekLabel(start: number, now: number): string {
  const back = Math.round(daysBetween(start, startOfWeek(now)) / 7);
  if (back === 0) return 'This week';
  if (back === 1) return 'Last week';
  const end = addDays(start, 6);
  const a = new Date(start);
  const b = new Date(end);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${month(a)} ${a.getDate()}–${b.getDate()}` : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

const fmtSets = (n: number) => (n % 1 ? n.toFixed(1) : String(n));

function ago(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** Adherence, weekly volume, muscle balance and recent records: the "how is it going" page. */
export function Overview() {
  const app = useApp();
  const now = useMemo(() => app.now(), [app.now]);
  const weeks = useMemo(() => weeklyStats(app.history, app.program, WEEKS, now), [app.history, app.program, now]);
  const c = useMemo(() => consistency(app.history, app.settings.targetSessionsPerWeek, now), [app.history, app.settings.targetSessionsPerWeek, now]);
  const prs = useMemo(() => allPrs(app.history).slice(-6).reverse(), [app.history]);
  const thisWeek = weeks[weeks.length - 1];

  if (!app.history.length) return <div className="notice">No sessions yet. Your first one will show up here.</div>;

  return (
    <div className="stack">
      <div className="card stack">
        <div className="row spread">
          <strong>This week</strong>
          <span className={c.thisWeek >= c.target ? 'good' : 'muted'}>
            {c.thisWeek} of {c.target} sessions
          </span>
        </div>
        <WeekDots days={thisWeek.days} today={daysBetween(thisWeek.start, now)} />
        <div className="muted" style={{ fontSize: 14 }}>
          {c.lastSessionAt !== null && c.daysSince !== null ? `Last session ${ago(c.daysSince)}` : 'No sessions yet'}
          {c.recentPerWeek > 0 ? ` · averaging ${c.recentPerWeek} a week over the last four weeks` : ''}
        </div>
      </div>

      <div className="card stack">
        <strong>Last {WEEKS} weeks</strong>
        <WeekGrid weeks={weeks} now={now} target={c.target} />
        <div className="faint" style={{ fontSize: 13 }}>
          {c.totalSessions} session{c.totalSessions === 1 ? '' : 's'} over {c.activeWeeks} active week{c.activeWeeks === 1 ? '' : 's'} all time. Showing up is the whole game at this stage; weeks that hit your target are marked green.
        </div>
      </div>

      <VolumeCard weeks={weeks} now={now} />

      <MuscleBalance now={now} />

      {prs.length > 0 && (
        <div className="card stack">
          <strong>Recent records</strong>
          <div className="stack" style={{ gap: 6 }}>
            {prs.map((p) => (
              <div key={`${p.sessionId}-${p.exerciseId}-${p.set}`} style={{ fontSize: 14 }}>
                <div className="row spread" style={{ gap: 8 }}>
                  <span>{p.name}</span>
                  <span className="good" style={{ textAlign: 'right' }}>
                    {p.pr.label}
                  </span>
                </div>
                <div className="faint" style={{ fontSize: 13 }}>
                  {fmtDate(p.at)} · {p.load === 'bodyweight' ? `${p.reps} reps` : `${formatLb(p.weightLb)} lb × ${p.reps}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Columns are weeks (oldest left), rows are Monday to Sunday; a count under each week. */
function WeekGrid({ weeks, now, target }: { weeks: WeekStat[]; now: number; target: number }) {
  const cell = 18;
  const gap = 4;
  const left = 16;
  const w = left + weeks.length * (cell + gap);
  const h = 7 * (cell + gap) + 18;
  const today = startOfDay(now);
  return (
    <svg className="weekgrid" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Sessions per day over the last weeks">
      {DAY_LETTERS.map((l, r) => (
        <text key={r} x={0} y={r * (cell + gap) + cell * 0.75} className="lbl">
          {l}
        </text>
      ))}
      {weeks.map((wk, col) => {
        const x = left + col * (cell + gap);
        const hit = wk.sessions >= target;
        return (
          <g key={wk.start}>
            {Array.from({ length: 7 }, (_, r) => {
              const day = addDays(wk.start, r);
              const future = day > today;
              const done = wk.days.includes(r);
              return <rect key={r} x={x} y={r * (cell + gap)} width={cell} height={cell} rx={4} className={done ? 'on' : future ? 'future' : 'off'} />;
            })}
            <text x={x + cell / 2} y={h - 4} textAnchor="middle" className={`count ${hit ? 'hit' : ''}`}>
              {wk.sessions || ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Weight × reps per week, with the week you tap broken down by exercise. The total alone
 * reads like a bug to anyone lifting 12 lb dumbbells ("4,868 lb?"), and the breakdown is
 * the explanation: two dumbbells, both sides, every rep.
 */
function VolumeCard({ weeks, now }: { weeks: WeekStat[]; now: number }) {
  const app = useApp();
  const [picked, setPicked] = useState(weeks.length - 1);
  const week = weeks[Math.min(picked, weeks.length - 1)];
  const lines = useMemo(() => {
    const end = addDays(week.start, 7);
    return volumeBreakdown(
      app.history.filter((s) => s.startedAt >= week.start && s.startedAt < end),
      app.program,
    );
  }, [app.history, app.program, week.start]);
  return (
    <div className="card stack">
      <div className="row spread">
        <strong>Pounds lifted per week</strong>
        <span className="muted">{week.volumeLb ? `${week.volumeLb.toLocaleString()} lb ${weekLabel(week.start, now).toLowerCase()}` : ''}</span>
      </div>
      <VolumeBars weeks={weeks} picked={picked} onPick={setPicked} />
      <div className="faint" style={{ fontSize: 13 }}>
        Every rep × the weight in your hands. A pair counts both dumbbells and a one-sided lift counts both sides, so three sets of ten squats with two 19 lb dumbbells
        is already 1,140 lb. Bodyweight sets add nothing. Tap a week to see where its total came from.
      </div>
      {lines.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="eyebrow">{weekLabel(week.start, now)}</div>
          {lines.map((l) => (
            <VolumeRow key={l.exerciseId} l={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function VolumeRow({ l }: { l: VolumeLine }) {
  const weight = l.minLb === l.maxLb ? `${formatLb(l.maxLb)} lb` : `${formatLb(l.minLb)}–${formatLb(l.maxLb)} lb`;
  const times = [l.load === 'pair' ? '2 dumbbells' : '', l.perSide ? '2 sides' : ''].filter(Boolean).join(' × ');
  return (
    <div style={{ fontSize: 14 }}>
      <div className="row spread" style={{ gap: 8 }}>
        <span>{l.name}</span>
        <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {l.volumeLb.toLocaleString()} lb
        </span>
      </div>
      <div className="faint" style={{ fontSize: 13 }}>
        {weight}
        {volumeMultiplier(l.load, l.perSide) > 1 ? ` × ${times}` : ''} × {l.reps} reps over {l.sets} set{l.sets === 1 ? '' : 's'}
      </div>
    </div>
  );
}

function VolumeBars({ weeks, picked, onPick }: { weeks: WeekStat[]; picked: number; onPick: (i: number) => void }) {
  const max = Math.max(1, ...weeks.map((w) => w.volumeLb));
  const bw = 18;
  const gap = 6;
  const H = 90;
  const W = weeks.length * (bw + gap);
  return (
    <svg className="volbars" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Volume per week">
      {weeks.map((w, i) => {
        const bh = Math.max(w.volumeLb > 0 ? 2 : 0, (w.volumeLb / max) * H);
        return (
          <g key={w.start} className="pick" onClick={() => onPick(i)}>
            {/* The whole column is the tap target, not just the (maybe tiny) bar. */}
            <rect x={i * (bw + gap) - gap / 2} y={0} width={bw + gap} height={H} className="hit" />
            <rect x={i * (bw + gap)} y={H - bh} width={bw} height={bh} rx={3} className={i === picked ? 'cur' : ''} />
            {w.volumeLb > 0 && w.volumeLb === max && (
              <text x={i * (bw + gap) + bw / 2} y={H - bh - 4} textAnchor="middle" className="lbl">
                {Math.round(w.volumeLb / 100) / 10}k
              </text>
            )}
          </g>
        );
      })}
      <text x={0} y={H + 13} className="lbl">
        {new Date(weeks[0].start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </text>
      <text x={W} y={H + 13} textAnchor="end" className="lbl">
        this week
      </text>
    </svg>
  );
}

/** Weeks shown in a muscle's own chart. */
const MUSCLE_WEEKS = 12;

/**
 * Sets per muscle for any week since you started (step back with the arrows), against what
 * the program prescribes. Tap a muscle for its weekly history and the exercises its sets
 * came from.
 */
function MuscleBalance({ now }: { now: number }) {
  const app = useApp();
  const thisWeek = startOfWeek(now);
  const earliest = useMemo(() => firstWeek(app.history) ?? thisWeek, [app.history, thisWeek]);
  const [back, setBack] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const maxBack = Math.max(0, Math.round(daysBetween(earliest, thisWeek) / 7));
  const weekStart = addDays(thisWeek, -7 * Math.min(back, maxBack));
  const done = useMemo(() => setsPerMuscle(app.history, app.program, weekStart), [app.history, app.program, weekStart]);
  const planned = useMemo(() => plannedSetsPerMuscle(app.program), [app.program]);
  const rows = MUSCLES.filter((m) => (planned.get(m) ?? 0) > 0 || (done.get(m) ?? 0) > 0);
  const max = Math.max(1, ...rows.map((m) => Math.max(planned.get(m) ?? 0, done.get(m) ?? 0)));
  if (!rows.length) return null;
  return (
    <div className="card stack">
      <strong>Sets per muscle</strong>
      <div className="row spread">
        <button className="btn small ghost" disabled={back >= maxBack} onClick={() => setBack((b) => Math.min(maxBack, b + 1))} aria-label="Earlier week">
          ‹
        </button>
        <span style={{ fontSize: 15 }}>{weekLabel(weekStart, now)}</span>
        <button className="btn small ghost" disabled={back <= 0} onClick={() => setBack((b) => Math.max(0, b - 1))} aria-label="Later week">
          ›
        </button>
      </div>
      <div className="muscles">
        {rows.map((m) => {
          const d = done.get(m) ?? 0;
          const p = planned.get(m) ?? 0;
          const isOpen = open === m;
          return (
            <div key={m} className="stack" style={{ gap: 6 }}>
              <button className={`mrow ${isOpen ? 'open' : ''}`} onClick={() => setOpen(isOpen ? null : m)} aria-expanded={isOpen}>
                <span className="name">{m}</span>
                <span className="bar">
                  <i className="plan" style={{ width: `${(p / max) * 100}%` }} />
                  <i className="done" style={{ width: `${(d / max) * 100}%` }} />
                </span>
                <span className="num">
                  {fmtSets(d)}
                  <span className="faint"> / {fmtSets(p)}</span>
                </span>
              </button>
              {isOpen && <MuscleDetail muscle={m} planned={p} now={now} weekStart={weekStart} onPickWeek={(start) => setBack(Math.round(daysBetween(start, thisWeek) / 7))} />}
            </div>
          );
        })}
      </div>
      <div className="faint" style={{ fontSize: 13 }}>
        Done that week over what the program prescribes when every day is trained once. The main muscle of an exercise gets a full set, the others half. A common
        guide is 10–20 hard sets per muscle a week; around 10 is plenty while you're starting out. Tap a muscle for its history.
      </div>
    </div>
  );
}

/** One muscle: sets per week over the last few months against the program's line, and where they came from. */
function MuscleDetail({
  muscle,
  planned,
  now,
  weekStart,
  onPickWeek,
}: {
  muscle: string;
  planned: number;
  now: number;
  weekStart: number;
  onPickWeek: (start: number) => void;
}) {
  const app = useApp();
  const weeks = useMemo(() => muscleWeeks(app.history, app.program, muscle, MUSCLE_WEEKS, now), [app.history, app.program, muscle, now]);
  const from = weeks[0].start;
  const to = addDays(startOfWeek(now), 7);
  const sources = useMemo(() => muscleSources(app.history, app.program, muscle, from, to), [app.history, app.program, muscle, from, to]);
  const active = weeks.filter((w) => w.sets > 0);
  const avg = active.length ? active.reduce((n, w) => n + w.sets, 0) / active.length : 0;

  const bw = 18;
  const gap = 6;
  const H = 70;
  const W = weeks.length * (bw + gap);
  const top = Math.max(1, planned, ...weeks.map((w) => w.sets));
  const y = (v: number) => H - (v / top) * H;
  return (
    <div className="mdetail stack" style={{ gap: 8 }}>
      <svg className="volbars" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`${muscle} sets per week`}>
        {weeks.map((w, i) => {
          const bh = Math.max(w.sets > 0 ? 2 : 0, (w.sets / top) * H);
          return (
            <g key={w.start} className="pick" onClick={() => onPickWeek(w.start)}>
              <rect x={i * (bw + gap) - gap / 2} y={0} width={bw + gap} height={H} className="hit" />
              <rect x={i * (bw + gap)} y={H - bh} width={bw} height={bh} rx={3} className={w.start === weekStart ? 'cur' : ''} />
            </g>
          );
        })}
        {planned > 0 && <line x1={0} x2={W - gap} y1={y(planned)} y2={y(planned)} className="plan" />}
        <text x={0} y={H + 13} className="lbl">
          {new Date(from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
        <text x={W} y={H + 13} textAnchor="end" className="lbl">
          this week
        </text>
      </svg>
      <div className="faint" style={{ fontSize: 13 }}>
        {active.length
          ? `Averaging ${fmtSets(Math.round(avg * 10) / 10)} sets in the ${active.length} week${active.length === 1 ? '' : 's'} you trained it, against ${fmtSets(planned)} in the program (the dashed line).`
          : `Nothing logged for ${muscle} in the last ${MUSCLE_WEEKS} weeks.`}
      </div>
      {sources.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {sources.map((src) => (
            <div key={src.exerciseId} className="row spread" style={{ fontSize: 14, gap: 8 }}>
              <span>
                {src.name}
                <span className="faint">{src.main ? '' : ' · helper, half credit'}</span>
              </span>
              <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtSets(src.sets)} sets
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
