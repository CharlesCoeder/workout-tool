import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { TopNav } from '../lib/router';
import { formatLb, maxWeight } from '../engine/plates';
import { e1rm, liftRecords, recordSets, recordVolume, setWeights } from '../engine/records';
import type { SessionRecord } from '../engine/types';
import { fmtDate, fmtDuration, recordSummary, weightLabel } from '../ui/format';
import { downloadText, sessionsCsv } from '../lib/csv';
import { Overview } from './Overview';
import { PlatesTab } from './PlatesTab';

type Tab = 'overview' | 'lifts' | 'sessions' | 'plates';
type Metric = 'weight' | 'e1rm';

export function HistoryPage() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>('overview');
  const sessions = useMemo(() => [...app.history].sort((a, b) => b.startedAt - a.startedAt), [app.history]);

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ['lifts', 'Lifts'],
    ['sessions', `Sessions (${sessions.length})`],
    ['plates', 'Plates'],
  ];
  return (
    <div className="page">
      <TopNav current="/history" />
      <h1>History</h1>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        {tabs.map(([t, label]) => (
          <button key={t} className={`btn small ${tab === t ? 'primary' : 'ghost'}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'lifts' && <Lifts />}
      {tab === 'sessions' && <Sessions sessions={sessions} />}
      {tab === 'plates' && <PlatesTab />}
    </div>
  );
}

// ---------- Lifts ----------

interface Point {
  t: number;
  weight: number;
  reps: number[];
  repMax: number;
  /** Best estimated 1RM among the session's sets. */
  e1rm: number;
}

function Lifts() {
  const app = useApp();
  const [metric, setMetric] = useState<Metric>('weight');
  const lifts = useMemo(() => {
    const byEx = new Map<string, { name: string; points: Point[] }>();
    for (const s of app.history) {
      for (const e of s.exercises) {
        if (!e.reps.length) continue;
        const lib = app.program.exercises[e.exerciseId];
        const entry = byEx.get(e.exerciseId) ?? { name: lib?.name ?? e.name, points: [] };
        const ws = setWeights(e);
        entry.points.push({ t: s.startedAt, weight: e.weightLb, reps: e.reps, repMax: lib?.repMax ?? 12, e1rm: Math.max(0, ...e.reps.map((r, i) => e1rm(ws[i], r))) });
        byEx.set(e.exerciseId, entry);
      }
    }
    const order = app.program.days.flatMap((d) => d.entries.map((x) => x.exerciseId));
    return [...byEx.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [app.history, app.program]);

  if (!lifts.length) return <div className="notice">No sessions yet. Your first one will show up here.</div>;

  return (
    <div className="stack">
      <div className="row spread">
        <span className="muted" style={{ fontSize: 14 }}>
          {metric === 'weight' ? 'Weight per session; dots are grey when the first set fell short of the top of the range.' : 'Estimated one-rep max (Epley) of the best set each session: a smoother view of strength when reps vary.'}
        </span>
        <div className="row" style={{ gap: 6, flex: '0 0 auto' }}>
          <button className={`btn small ${metric === 'weight' ? 'primary' : 'ghost'}`} onClick={() => setMetric('weight')}>
            Weight
          </button>
          <button className={`btn small ${metric === 'e1rm' ? 'primary' : 'ghost'}`} onClick={() => setMetric('e1rm')}>
            Est. 1RM
          </button>
        </div>
      </div>
      {lifts.map(([id, lift]) => {
        const lib = app.program.exercises[id];
        const bodyweight = lib?.load === 'bodyweight' || (!lib && lift.points.every((p) => p.weight === 0));
        const ceiling = lib && lib.load !== 'bodyweight' ? maxWeight(app.inventory, lib.load) : null;
        const latest = lift.points[lift.points.length - 1];
        const rec = liftRecords(app.history, id);
        return (
          <div key={id} className="card stack" style={{ marginBottom: 4 }}>
            <div className="row spread">
              <strong>{lift.name}</strong>
              <span className="muted">
                {bodyweight ? `${latest.reps.join(', ')} reps` : metric === 'e1rm' ? `est. 1RM ${formatLb(latest.e1rm)} lb` : `${formatLb(latest.weight)} lb`}
                {ceiling !== null && latest.weight >= ceiling && <span className="warn"> · at ceiling</span>}
              </span>
            </div>
            <LiftChart points={lift.points} bodyweight={bodyweight} ceiling={metric === 'weight' ? ceiling : null} metric={bodyweight ? 'weight' : metric} />
            <div className="faint" style={{ fontSize: 13 }}>
              {rec.sessions} session{rec.sessions === 1 ? '' : 's'} · {rec.totalSets} sets
              {rec.heaviest && !bodyweight && (
                <>
                  {' '}
                  · best {formatLb(rec.heaviest.weightLb)} × {rec.heaviest.reps}
                  {rec.bestE1rm ? ` (est. 1RM ${formatLb(rec.bestE1rm.e1rm)})` : ''}
                </>
              )}
              {rec.mostReps && bodyweight && ` · best ${rec.mostReps.reps} reps`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LiftChart({ points, bodyweight, ceiling, metric }: { points: Point[]; bodyweight: boolean; ceiling: number | null; metric: Metric }) {
  const W = 600;
  const H = 160;
  const padL = 34;
  const padR = 10;
  const padT = 26;
  const padB = 22;
  const ys = points.map((p) => (bodyweight ? p.reps[0] : metric === 'e1rm' ? p.e1rm : p.weight));
  const yMax = Math.max(...ys, ceiling ?? 0, 1);
  const yMin = 0;
  const x = (i: number) => (points.length === 1 ? W / 2 : padL + (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const path = points.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ');
  const ticks = [0, yMax / 2, yMax];
  // Label every point when there are few, otherwise only the ends and the maximum.
  const maxI = ys.indexOf(Math.max(...ys));
  const showLabel = (i: number) => points.length <= 8 || i === 0 || i === points.length - 1 || i === maxI;
  const dateEvery = Math.max(1, Math.ceil(points.length / 8));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
          <text x={0} y={y(t) + 4}>
            {formatLb(Math.round(t * 2) / 2)}
          </text>
        </g>
      ))}
      {ceiling !== null && !bodyweight && (
        <text x={W - padR} y={y(ceiling) - 4} textAnchor="end">
          plate ceiling
        </text>
      )}
      <path className={`line ${metric === 'e1rm' ? 'alt' : ''}`} d={path} />
      {points.map((p, i) => (
        <g key={i}>
          <circle className={`pt ${p.reps[0] >= p.repMax ? '' : 'short'}`} cx={x(i)} cy={y(ys[i])} r={5} />
          {(i % dateEvery === 0 || i === points.length - 1) && (
            <text x={x(i)} y={H - 6} textAnchor="middle">
              {new Date(p.t).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
            </text>
          )}
          {showLabel(i) && (
            <text x={x(i)} y={y(ys[i]) - 10} textAnchor="middle">
              {metric === 'e1rm' && !bodyweight ? formatLb(p.e1rm) : p.reps.join('/')}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ---------- Sessions ----------

function Sessions({ sessions }: { sessions: SessionRecord[] }) {
  const app = useApp();
  if (!sessions.length) return <div className="notice">No sessions yet. Your first one will show up here.</div>;
  return (
    <div className="stack">
      <div className="row spread">
        <span className="muted" style={{ fontSize: 14 }}>
          Every session, newest first.
        </span>
        <button className="btn small ghost" onClick={() => downloadText(`dumbbell-coach-sessions-${new Date().toISOString().slice(0, 10)}.csv`, sessionsCsv(app.history, app.program))}>
          Export CSV
        </button>
      </div>
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} onDelete={() => void app.deleteSession(s.id)} />
      ))}
    </div>
  );
}

function SessionCard({ s, onDelete }: { s: SessionRecord; onDelete: () => void }) {
  const app = useApp();
  const [confirm, setConfirm] = useState(false);
  const volume = recordVolume(s, app.program);
  const sets = recordSets(s);
  return (
    <div className="card stack">
      <div className="row spread">
        <strong>
          {s.dayName} · {fmtDate(s.startedAt)}
        </strong>
        <span className="muted" style={{ fontSize: 14, textAlign: 'right' }}>
          {s.endedAt ? fmtDuration(s.endedAt - s.startedAt) : ''}
          {sets ? ` · ${sets} sets` : ''}
          {volume ? ` · ${volume.toLocaleString()} lb` : ''}
          {!s.completed && <span className="warn"> · unfinished</span>}
        </span>
      </div>
      <table className="plain">
        <tbody>
          {s.exercises.map((e) => (
            <tr key={e.exerciseId}>
              <td>
                {e.name}
                {e.note && <div className="faint" style={{ fontSize: 13 }}>{e.note}</div>}
              </td>
              <td className="muted">{e.weights ? 'per set' : weightLabel(e.weightLb, e.load)}</td>
              <td className="muted">{e.weights ? recordSummary(e) : e.reps.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.note && <div className="muted" style={{ fontSize: 14 }}>{s.note}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {confirm ? (
          <>
            <button className="btn small danger" onClick={onDelete}>
              Delete for real
            </button>
            <button className="btn small ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setConfirm(true)}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
