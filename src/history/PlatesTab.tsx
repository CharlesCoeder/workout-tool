import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { PLATE_PRESETS, forecastProgram, ladderSteps, simulateUpgrade, type LiftForecast } from '../engine/forecast';
import { achievableWeights, formatLb } from '../engine/plates';
import type { PlateType } from '../engine/types';
import { Link } from '../lib/router';

function weeksLabel(weeks: number | null): string {
  if (weeks === null) return '—';
  if (!Number.isFinite(weeks)) return '—';
  if (weeks <= 1) return 'next session';
  if (weeks < 8) return `~${weeks} weeks`;
  const months = Math.round(weeks / 4.33);
  return `~${months} month${months === 1 ? '' : 's'}`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Where each lift stands against the plate ceiling, and what buying plates would change. */
export function PlatesTab() {
  const app = useApp();
  const now = useMemo(() => app.now(), [app.now]);
  const forecasts = useMemo(
    () => forecastProgram(app.program, app.history, app.inventory, now, app.settings.progressionRule, app.settings.targetSessionsPerWeek),
    [app.program, app.history, app.inventory, now, app.settings.progressionRule, app.settings.targetSessionsPerWeek],
  );
  const atCeiling = forecasts.filter((f) => f.atCeiling);
  const climbing = forecasts
    .filter((f) => !f.atCeiling)
    .sort((a, b) => (a.weeksAtRate ?? a.weeksAtBest * 3) - (b.weeksAtRate ?? b.weeksAtBest * 3));
  const pair = achievableWeights(app.inventory, 'pair');
  const single = achievableWeights(app.inventory, 'single');

  return (
    <div className="stack">
      <div className="card stack">
        <strong>Where each lift stands</strong>
        {atCeiling.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="warn" style={{ fontSize: 14 }}>
              At the ceiling now: {atCeiling.map((f) => `${f.name} (${formatLb(f.ceilingLb)} lb)`).join(', ')}.
            </span>
            <span className="faint" style={{ fontSize: 13 }}>
              These can only progress by reps until you add plates. More than about 15 clean reps a set and the set stops training strength much.
            </span>
          </div>
        )}
        {climbing.length > 0 && (
          <div className="stack" style={{ gap: 0 }}>
            {climbing.map((f) => (
              <ForecastRow key={f.exerciseId} f={f} />
            ))}
          </div>
        )}
        <span className="faint" style={{ fontSize: 13 }}>
          "At your pace" uses how often each lift has actually stepped up so far and how often it comes round; "at best" assumes a step every session, which is what the program's rule allows. Both are rough: they say "weeks" or "months", not dates.
        </span>
      </div>

      <div className="card stack">
        <strong>Your ladder</strong>
        <Ladder label="Pair (each dumbbell)" weights={pair} />
        <Ladder label="Single dumbbell" weights={single} />
        <span className="faint" style={{ fontSize: 13 }}>
          Every step is one plate change; the percentage is how big a jump it is. Jumps over about 10% are a lot for pressing and arm work, which is why small plates matter as much as heavy ones.
        </span>
      </div>

      <Upgrades forecasts={forecasts} />
    </div>
  );
}

function ForecastRow({ f }: { f: LiftForecast }) {
  const pace = f.rate === null ? 'no pace yet' : f.rate === 0 ? "hasn't stepped up yet" : `${weeksLabel(f.weeksAtRate)} at your pace`;
  return (
    <div className="frow">
      <div className="row spread" style={{ gap: 8 }}>
        <span>{f.name}</span>
        <span className="muted" style={{ whiteSpace: 'nowrap' }}>
          {formatLb(f.currentLb)} → {formatLb(f.ceilingLb)} lb · {f.stepsLeft} step{f.stepsLeft === 1 ? '' : 's'}
        </span>
      </div>
      <div className="faint" style={{ fontSize: 13 }}>
        {pace} · {weeksLabel(f.weeksAtBest)} at best
      </div>
    </div>
  );
}

function Ladder({ label, weights, highlight = [] }: { label: string; weights: number[]; highlight?: number[] }) {
  const steps = ladderSteps(weights);
  const isNew = (w: number) => highlight.some((h) => Math.abs(h - w) < 1e-9);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="eyebrow">{label}</span>
      <div className="ladder">
        {weights.map((w, i) => (
          <span key={w} className="row" style={{ gap: 0 }}>
            {i > 0 && <span className="jump faint">{pct(steps[i - 1].pct)}</span>}
            <span className={`pill ${isNew(w) ? 'good' : ''}`}>{formatLb(w)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Upgrades({ forecasts }: { forecasts: LiftForecast[] }) {
  const app = useApp();
  const [picked, setPicked] = useState<number[]>([]);
  const [custom, setCustom] = useState<{ lb: number; count: number }>({ lb: 5, count: 4 });
  const [useCustom, setUseCustom] = useState(false);
  const add: PlateType[] = [...picked.flatMap((i) => PLATE_PRESETS[i].plates), ...(useCustom ? [custom] : [])];
  const fx = useMemo(() => simulateUpgrade(app.inventory, add, forecasts), [app.inventory, add, forecasts]);
  const chosen = add.length > 0;
  return (
    <div className="card stack">
      <strong>What buying plates would do</strong>
      <span className="muted" style={{ fontSize: 14 }}>
        Tap what you're thinking of buying (standard 1-inch plates, sold in pairs). Nothing here changes your equipment; that's in{' '}
        <Link to="/settings">Settings → Equipment</Link>.
      </span>
      <div className="row wrap" style={{ gap: 6 }}>
        {PLATE_PRESETS.map((p, i) => {
          const on = picked.includes(i);
          return (
            <button key={p.label} className={`pill ${on ? 'accent' : ''}`} style={{ fontSize: 14, padding: '6px 12px' }} onClick={() => setPicked(on ? picked.filter((x) => x !== i) : [...picked, i])}>
              {on ? '✓ ' : '+ '}
              {p.label}
            </button>
          );
        })}
        <button className={`pill ${useCustom ? 'accent' : ''}`} style={{ fontSize: 14, padding: '6px 12px' }} onClick={() => setUseCustom(!useCustom)}>
          {useCustom ? '✓ ' : '+ '}custom
        </button>
      </div>
      {useCustom && (
        <div className="row">
          <input type="number" min={1} value={custom.count} onChange={(e) => setCustom({ ...custom, count: Math.max(0, Number(e.target.value)) })} style={{ width: '5em' }} />
          <span className="muted">×</span>
          <input type="number" min={0.25} step={0.25} value={custom.lb} onChange={(e) => setCustom({ ...custom, lb: Math.max(0, Number(e.target.value)) })} style={{ width: '6em' }} />
          <span className="muted">lb plates</span>
        </div>
      )}
      {chosen && (
        <div className="stack" style={{ gap: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="stats">
            <div>
              <b>{formatLb(fx.pairCeiling)} lb</b>
              <span>pair ceiling (was {formatLb(achievableWeights(app.inventory, 'pair').at(-1) ?? 0)})</span>
            </div>
            <div>
              <b>{formatLb(fx.singleCeiling)} lb</b>
              <span>single ceiling (was {formatLb(achievableWeights(app.inventory, 'single').at(-1) ?? 0)})</span>
            </div>
            <div>
              <b>{fx.newPair.length}</b>
              <span>new pair weights</span>
            </div>
            <div>
              <b>{pct(fx.worstJumpAfter)}</b>
              <span>biggest jump (was {pct(fx.worstJumpBefore)})</span>
            </div>
          </div>
          <Ladder label="Pair ladder after" weights={fx.pair} highlight={fx.newPair} />
          {fx.unblocked.length > 0 ? (
            <span className="good" style={{ fontSize: 14 }}>
              Gives room again to {fx.unblocked.map((u) => `${u.name} (+${u.steps} step${u.steps === 1 ? '' : 's'})`).join(', ')}.
            </span>
          ) : forecasts.some((f) => f.atCeiling) ? (
            <span className="warn" style={{ fontSize: 14 }}>
              Doesn't raise the ceiling for the lifts that are stuck at it.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
