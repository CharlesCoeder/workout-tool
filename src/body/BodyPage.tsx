import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { TopNav } from '../lib/router';
import { summarize, todayKey, trend, type TrendPoint } from '../engine/body';
import { fmtDate } from '../ui/format';
import { Nutrition } from './Nutrition';

type Range = 28 | 84 | 0;

export function BodyPage() {
  const app = useApp();
  return (
    <div className="page">
      <TopNav current="/body" />
      <h1>Body</h1>
      <div className="stack">
        <WeighIn />
        <BodyTrend />
        <Nutrition />
        <Entries entries={app.bodyWeight} />
      </div>
    </div>
  );
}

function fmtRate(r: number | null): string {
  if (r === null) return 'not enough readings yet';
  if (Math.abs(r) < 0.1) return 'holding steady';
  return `${r > 0 ? '+' : ''}${r.toFixed(1)} lb a week`;
}

/** Log today's reading (or any date) in a couple of taps. */
export function WeighIn({ compact = false, onSaved }: { compact?: boolean; onSaved?: (lb: number) => void }) {
  const app = useApp();
  const now = app.now();
  const today = todayKey(now);
  const latest = app.bodyWeight[app.bodyWeight.length - 1];
  const existing = app.bodyWeight.find((e) => e.date === today);
  const [date, setDate] = useState(today);
  const [lb, setLb] = useState<string>(existing ? String(existing.lb) : latest ? String(latest.lb) : '');
  // Readings arrive after the first render; fill the field from them until the user types.
  const touched = useRef(false);
  const suggested = existing?.lb ?? latest?.lb;
  useEffect(() => {
    if (!touched.current && suggested !== undefined) setLb(String(suggested));
  }, [suggested]);
  const value = Number(lb);
  const ok = Number.isFinite(value) && value > 50 && value < 700;
  const save = async () => {
    if (!ok) return;
    await app.saveBodyWeight(date, Math.round(value * 10) / 10);
    onSaved?.(value);
  };
  return (
    <div className={compact ? 'stack' : 'card stack'}>
      {!compact && <strong>{existing ? 'Today’s reading' : 'Log a reading'}</strong>}
      <div className="row">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={50}
          max={700}
          value={lb}
          placeholder="lb"
          onChange={(e) => {
            touched.current = true;
            setLb(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          style={{ fontSize: 24, width: '6em' }}
          aria-label="Body weight in pounds"
        />
        <span className="muted">lb</span>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} style={{ flex: 1 }} aria-label="Date" />
      </div>
      <button className="btn primary" disabled={!ok} onClick={() => void save()}>
        {date === today ? (existing ? 'Update today' : 'Log today') : `Log for ${date}`}
      </button>
      {!compact && (
        <span className="faint" style={{ fontSize: 13 }}>
          Same time each morning, after the bathroom and before breakfast. Daily readings bounce around by a couple of pounds; the trend line below is the number to watch.
        </span>
      )}
    </div>
  );
}

function BodyTrend() {
  const app = useApp();
  const now = useMemo(() => app.now(), [app.now]);
  const [range, setRange] = useState<Range>(84);
  const points = useMemo(() => trend(app.bodyWeight), [app.bodyWeight]);
  const s = useMemo(() => summarize(app.bodyWeight, now), [app.bodyWeight, now]);
  if (!points.length) return <div className="notice">Log a few mornings and a trend line will appear here.</div>;
  const shown = range ? points.filter((p) => p.t >= now - range * 86_400_000) : points;
  return (
    <div className="card stack">
      <div className="stats">
        <div>
          <b>{s.trendLb?.toFixed(1)} lb</b>
          <span>trend now</span>
        </div>
        <div>
          <b>{fmtRate(s.weeklyRate)}</b>
          <span>last three weeks</span>
        </div>
        {s.change30 !== null && (
          <div>
            <b>
              {s.change30 > 0 ? '+' : ''}
              {s.change30.toFixed(1)} lb
            </b>
            <span>last 30 days</span>
          </div>
        )}
        {s.changeAll !== null && s.entries > 1 && (
          <div>
            <b>
              {s.changeAll > 0 ? '+' : ''}
              {s.changeAll.toFixed(1)} lb
            </b>
            <span>since {fmtDate(points[0].t)}</span>
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {(
          [
            [28, '4 weeks'],
            [84, '12 weeks'],
            [0, 'All'],
          ] as [Range, string][]
        ).map(([r, label]) => (
          <button key={r} className={`btn small ${range === r ? 'primary' : 'ghost'}`} onClick={() => setRange(r)}>
            {label}
          </button>
        ))}
      </div>
      {shown.length ? <TrendChart points={shown} /> : <div className="muted">No readings in this range.</div>}
      <span className="faint" style={{ fontSize: 13 }}>
        Dots are the scale; the line is a smoothed trend (about a ten-day memory). Aim for the line, not the dots: a 0.5–1 lb change a week is a sensible pace either direction.
      </span>
    </div>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const W = 600;
  const H = 180;
  const padL = 40;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const vals = points.flatMap((p) => [p.lb, p.trend]);
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => (t1 === t0 ? W / 2 : padL + ((t - t0) / (t1 - t0)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  const dateEvery = Math.max(1, Math.ceil(points.length / 6));
  return (
    <svg className="chart body" viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
          <text x={0} y={y(t) + 4}>
            {t.toFixed(t % 1 ? 1 : 0)}
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <g key={p.date}>
          <circle className="raw" cx={x(p.t)} cy={y(p.lb)} r={3} />
          {(i % dateEvery === 0 || i === points.length - 1) && (
            <text x={x(p.t)} y={H - 6} textAnchor="middle">
              {new Date(p.t).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
            </text>
          )}
        </g>
      ))}
      <path className="line" d={path} />
    </svg>
  );
}

function Entries({ entries }: { entries: { date: string; lb: number }[] }) {
  const app = useApp();
  const [showAll, setShowAll] = useState(false);
  if (!entries.length) return null;
  const list = [...entries].reverse();
  const shown = showAll ? list : list.slice(0, 10);
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <strong>Readings</strong>
      {shown.map((e) => (
        <div key={e.date} className="row spread" style={{ fontSize: 14 }}>
          <span className="muted">{e.date}</span>
          <span className="row" style={{ gap: 12 }}>
            <span>{e.lb.toFixed(1)} lb</span>
            <button className="btn small ghost" onClick={() => void app.deleteBodyWeight(e.date)} aria-label={`Delete reading for ${e.date}`}>
              ✕
            </button>
          </span>
        </div>
      ))}
      {list.length > 10 && (
        <button className="btn small ghost" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
