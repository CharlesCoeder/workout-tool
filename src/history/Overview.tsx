import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { MUSCLES, addDays, consistency, daysBetween, plannedSetsPerMuscle, setsPerMuscle, startOfDay, startOfWeek, weeklyStats, type WeekStat } from '../engine/stats';
import { allPrs } from '../engine/records';
import { formatLb } from '../engine/plates';
import { fmtDate } from '../ui/format';

const WEEKS = 12;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
        <WeekDots week={thisWeek} now={now} />
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

      <div className="card stack">
        <div className="row spread">
          <strong>Pounds moved per week</strong>
          <span className="muted">{thisWeek.volumeLb ? `${thisWeek.volumeLb.toLocaleString()} lb so far` : ''}</span>
        </div>
        <VolumeBars weeks={weeks} />
        <div className="faint" style={{ fontSize: 13 }}>
          Weight × reps, counting both dumbbells and both sides. Bodyweight sets aren't counted. It should creep up as weights and reps do.
        </div>
      </div>

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

function WeekDots({ week, now }: { week: WeekStat; now: number }) {
  const today = daysBetween(week.start, now);
  return (
    <div className="weekdots">
      {DAY_LETTERS.map((l, i) => {
        const done = week.days.includes(i);
        const cls = done ? 'done' : i > today ? 'future' : '';
        return (
          <div key={i} className={`wd ${cls} ${i === today ? 'today' : ''}`}>
            <i />
            <span>{l}</span>
          </div>
        );
      })}
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

function VolumeBars({ weeks }: { weeks: WeekStat[] }) {
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
          <g key={w.start}>
            <rect x={i * (bw + gap)} y={H - bh} width={bw} height={bh} rx={3} className={i === weeks.length - 1 ? 'cur' : ''} />
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

function MuscleBalance({ now }: { now: number }) {
  const app = useApp();
  const [which, setWhich] = useState<'this' | 'last'>('this');
  const weekStart = which === 'this' ? startOfWeek(now) : addDays(startOfWeek(now), -7);
  const done = useMemo(() => setsPerMuscle(app.history, app.program, weekStart), [app.history, app.program, weekStart]);
  const planned = useMemo(() => plannedSetsPerMuscle(app.program), [app.program]);
  const rows = MUSCLES.filter((m) => (planned.get(m) ?? 0) > 0 || (done.get(m) ?? 0) > 0);
  const max = Math.max(1, ...rows.map((m) => Math.max(planned.get(m) ?? 0, done.get(m) ?? 0)));
  if (!rows.length) return null;
  return (
    <div className="card stack">
      <strong>Sets per muscle</strong>
      <div className="row" style={{ gap: 6 }}>
        <button className={`btn small ${which === 'this' ? 'primary' : 'ghost'}`} onClick={() => setWhich('this')}>
          This week
        </button>
        <button className={`btn small ${which === 'last' ? 'primary' : 'ghost'}`} onClick={() => setWhich('last')}>
          Last week
        </button>
      </div>
      <div className="muscles">
        {rows.map((m) => {
          const d = done.get(m) ?? 0;
          const p = planned.get(m) ?? 0;
          return (
            <div key={m} className="mrow">
              <span className="name">{m}</span>
              <span className="bar">
                <i className="plan" style={{ width: `${(p / max) * 100}%` }} />
                <i className="done" style={{ width: `${(d / max) * 100}%` }} />
              </span>
              <span className="num">
                {d % 1 ? d.toFixed(1) : d}
                <span className="faint"> / {p % 1 ? p.toFixed(1) : p}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="faint" style={{ fontSize: 13 }}>
        Done this week over what the program prescribes when every day is trained once. The main muscle of an exercise gets a full set, the others half. A common guide is 10–20 hard sets per muscle a week; around 10 is plenty while you're starting out.
      </div>
    </div>
  );
}
