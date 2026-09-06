import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { TopNav } from '../lib/router';
import { formatLb, maxWeight } from '../engine/plates';
import type { SessionRecord } from '../engine/types';
import { fmtDate, fmtDuration, weightLabel } from '../ui/format';

export function HistoryPage() {
  const app = useApp();
  const [tab, setTab] = useState<'lifts' | 'sessions'>('lifts');
  const sessions = useMemo(() => [...app.history].sort((a, b) => b.startedAt - a.startedAt), [app.history]);

  const lifts = useMemo(() => {
    const byEx = new Map<string, { name: string; points: { t: number; weight: number; reps: number[]; repMax: number }[] }>();
    for (const s of app.history) {
      for (const e of s.exercises) {
        if (!e.reps.length) continue;
        const lib = app.program.exercises[e.exerciseId];
        const entry = byEx.get(e.exerciseId) ?? { name: lib?.name ?? e.name, points: [] };
        entry.points.push({ t: s.startedAt, weight: e.weightLb, reps: e.reps, repMax: lib?.repMax ?? 12 });
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

  return (
    <div className="page">
      <TopNav current="/history" />
      <h1>History</h1>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className={`btn small ${tab === 'lifts' ? 'primary' : 'ghost'}`} onClick={() => setTab('lifts')}>
          Lifts
        </button>
        <button className={`btn small ${tab === 'sessions' ? 'primary' : 'ghost'}`} onClick={() => setTab('sessions')}>
          Sessions ({sessions.length})
        </button>
      </div>

      {!app.history.length && <div className="notice">No sessions yet. Your first one will show up here.</div>}

      {tab === 'lifts' &&
        lifts.map(([id, lift]) => {
          const lib = app.program.exercises[id];
          const ceiling = lib && lib.load !== 'bodyweight' ? maxWeight(app.inventory, lib.load) : null;
          const latest = lift.points[lift.points.length - 1];
          const bodyweight = lib?.load === 'bodyweight';
          return (
            <div key={id} className="card stack" style={{ marginBottom: 12 }}>
              <div className="row spread">
                <strong>{lift.name}</strong>
                <span className="muted">
                  {bodyweight ? `${latest.reps.join(', ')} reps` : `${formatLb(latest.weight)} lb`}
                  {ceiling !== null && latest.weight >= ceiling && <span className="warn"> · at ceiling</span>}
                </span>
              </div>
              <LiftChart points={lift.points} bodyweight={bodyweight} ceiling={ceiling} />
              <div className="faint" style={{ fontSize: 13 }}>
                {lift.points.length} session{lift.points.length === 1 ? '' : 's'} · first-set reps at the top of the range earn the next step
              </div>
            </div>
          );
        })}

      {tab === 'sessions' &&
        sessions.map((s) => <SessionCard key={s.id} s={s} onDelete={() => void app.deleteSession(s.id)} />)}
    </div>
  );
}

function SessionCard({ s, onDelete }: { s: SessionRecord; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="card stack" style={{ marginBottom: 12 }}>
      <div className="row spread">
        <strong>
          {s.dayName} · {fmtDate(s.startedAt)}
        </strong>
        <span className="muted">
          {s.endedAt ? fmtDuration(s.endedAt - s.startedAt) : ''}
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
              <td className="muted">{weightLabel(e.weightLb, e.load)}</td>
              <td className="muted">{e.reps.join(', ')}</td>
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

function LiftChart({
  points,
  bodyweight,
  ceiling,
}: {
  points: { t: number; weight: number; reps: number[]; repMax: number }[];
  bodyweight: boolean;
  ceiling: number | null;
}) {
  const W = 600;
  const H = 160;
  const padL = 34;
  const padR = 10;
  const padT = 26;
  const padB = 22;
  const ys = points.map((p) => (bodyweight ? p.reps[0] : p.weight));
  const yMax = Math.max(...ys, ceiling ?? 0, 1);
  const yMin = 0;
  const x = (i: number) => (points.length === 1 ? W / 2 : padL + (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const path = points.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ');
  const ticks = [0, yMax / 2, yMax];
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
      <path className="line" d={path} />
      {points.map((p, i) => (
        <g key={i}>
          <circle className={`pt ${p.reps[0] >= p.repMax ? '' : 'short'}`} cx={x(i)} cy={y(ys[i])} r={5} />
          <text x={x(i)} y={H - 6} textAnchor="middle">
            {new Date(p.t).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
          </text>
          <text x={x(i)} y={y(ys[i]) - 10} textAnchor="middle">
            {bodyweight ? p.reps.join('/') : p.reps.join('/')}
          </text>
        </g>
      ))}
    </svg>
  );
}
