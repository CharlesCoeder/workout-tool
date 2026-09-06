import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { ACTIVITY, DEFAULT_PROFILE, adjustment, targets, type Activity, type Goal, type Profile, type Sex } from '../engine/nutrition';
import { summarize } from '../engine/body';

/** Daily calorie and macro targets from the profile and the current body-weight trend. */
export function Nutrition() {
  const app = useApp();
  const now = useMemo(() => app.now(), [app.now]);
  const body = useMemo(() => summarize(app.bodyWeight, now), [app.bodyWeight, now]);
  const [editing, setEditing] = useState(false);
  const profile = app.profile;
  const weightLb = body.trendLb ?? body.latest?.lb ?? null;

  if (!profile || editing) {
    return (
      <ProfileForm
        initial={profile ?? DEFAULT_PROFILE}
        onSave={async (p) => {
          await app.saveProfile(p);
          setEditing(false);
        }}
        onCancel={profile ? () => setEditing(false) : undefined}
      />
    );
  }
  if (weightLb === null) {
    return (
      <div className="card stack">
        <strong>Daily targets</strong>
        <span className="muted">Log a body-weight reading above and the targets will appear here.</span>
        <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
          Edit profile
        </button>
      </div>
    );
  }
  const t = targets(profile, weightLb, now);
  const adj = adjustment(profile, body.weeklyRate);
  const goalText =
    profile.goal === 'maintain' ? 'holding your weight' : `${profile.goal === 'lose' ? 'losing' : 'gaining'} about ${profile.rateLbPerWeek} lb a week`;
  return (
    <div className="card stack">
      <div className="row spread">
        <strong>Daily targets</strong>
        <button className="btn small ghost" onClick={() => setEditing(true)}>
          Edit profile
        </button>
      </div>
      <div className="stats">
        <div>
          <b>{t.calories.toLocaleString()}</b>
          <span>kcal a day</span>
        </div>
        <div>
          <b>{t.protein} g</b>
          <span>protein ({t.proteinRange[0]}–{t.proteinRange[1]})</span>
        </div>
        <div>
          <b>{t.fat} g</b>
          <span>fat ({t.fatRange[0]}–{t.fatRange[1]})</span>
        </div>
        <div>
          <b>{t.carbs} g</b>
          <span>carbs (the rest)</span>
        </div>
      </div>
      <div className="muted" style={{ fontSize: 14 }}>
        Maintenance is about {t.tdee.toLocaleString()} kcal ({ACTIVITY[profile.activity].label.toLowerCase()}, resting {t.bmr.toLocaleString()}). You're {goalText}
        {t.delta ? `, so ${t.delta > 0 ? '+' : ''}${t.delta} kcal a day` : ''}.{t.floored ? ` That would go below a safe floor of ${t.floor.toLocaleString()} kcal, so the target stops there; a slower rate is the better fix.` : ''}
      </div>
      {adj ? (
        <div className={`notice ${adj.kcal === 0 ? '' : 'accent'}`} style={{ fontSize: 14 }}>
          {adj.summary}
          {adj.kcal !== 0 && ' Change one thing at a time and give it two weeks.'}
        </div>
      ) : (
        <div className="faint" style={{ fontSize: 13 }}>
          After a couple of weeks of morning readings, the scale trend will say whether these numbers need nudging.
        </div>
      )}
      <details>
        <summary className="muted" style={{ fontSize: 13, cursor: 'pointer' }}>
          How this is worked out
        </summary>
        <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>
          Resting energy is the Mifflin-St Jeor equation from your sex, age, height and trend weight; maintenance multiplies it by an activity factor
          ({ACTIVITY[profile.activity].factor}). A pound a week is taken as 500 kcal a day, the usual approximation. Protein is 0.7–1 g per pound of
          bodyweight (roughly 1.6–2.2 g/kg), the range that keeps and builds muscle while training; the top end while losing. Fat is 25–35% of calories;
          carbs fill the rest. The adjustment compares the trend's weekly rate with your plan and suggests a change of at most 300 kcal, only when the gap is
          worth acting on. If you carry a lot of extra weight, set protein by a sensible goal weight instead of the trend.
        </div>
      </details>
    </div>
  );
}

function ProfileForm({ initial, onSave, onCancel }: { initial: Profile; onSave: (p: Profile) => Promise<void>; onCancel?: () => void }) {
  const [p, setP] = useState<Profile>(initial);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const feet = Math.floor(p.heightIn / 12);
  const inches = Math.round(p.heightIn - feet * 12);
  const year = new Date().getFullYear();
  const ok = p.birthYear > year - 100 && p.birthYear < year - 9 && p.heightIn >= 48 && p.heightIn <= 90;
  return (
    <div className="card stack">
      <strong>{onCancel ? 'Profile' : 'Set up daily targets'}</strong>
      <span className="muted" style={{ fontSize: 14 }}>
        Used only to work out calorie and protein targets on this page. Stored with your other data, nowhere else.
      </span>
      <div className="grid2">
        <div className="field">
          <label>Sex (for the energy equation)</label>
          <select value={p.sex} onChange={(e) => set({ sex: e.target.value as Sex })}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="field">
          <label>Birth year</label>
          <input type="number" value={p.birthYear} min={year - 100} max={year - 10} onChange={(e) => set({ birthYear: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Height</label>
          <div className="row" style={{ gap: 6 }}>
            <input type="number" value={feet} min={4} max={7} onChange={(e) => set({ heightIn: Number(e.target.value) * 12 + inches })} style={{ width: '4em' }} />
            <span className="muted">ft</span>
            <input type="number" value={inches} min={0} max={11} onChange={(e) => set({ heightIn: feet * 12 + Number(e.target.value) })} style={{ width: '4em' }} />
            <span className="muted">in</span>
          </div>
        </div>
        <div className="field">
          <label>Activity outside the gym</label>
          <select value={p.activity} onChange={(e) => set({ activity: e.target.value as Activity })}>
            {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY[a].label}: {ACTIVITY[a].hint}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Goal</label>
          <select value={p.goal} onChange={(e) => set({ goal: e.target.value as Goal })}>
            <option value="lose">Lose fat</option>
            <option value="maintain">Hold steady (recomposition)</option>
            <option value="gain">Gain muscle</option>
          </select>
        </div>
        {p.goal !== 'maintain' && (
          <div className="field">
            <label>Pace (lb per week)</label>
            <select value={String(p.rateLbPerWeek)} onChange={(e) => set({ rateLbPerWeek: Number(e.target.value) })}>
              {(p.goal === 'lose' ? [0.5, 1, 1.5, 2] : [0.25, 0.5, 1]).map((r) => (
                <option key={r} value={String(r)}>
                  {r} lb/week{p.goal === 'lose' && r >= 1.5 ? ' (aggressive)' : p.goal === 'gain' && r >= 1 ? ' (mostly fat above this)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn primary" disabled={!ok} onClick={() => void onSave(p)}>
          Save
        </button>
      </div>
    </div>
  );
}
