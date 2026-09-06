/**
 * Calorie and macro targets from standard equations, adjusted by what the scale trend
 * actually does. Nothing clever: Mifflin-St Jeor for resting energy, a fixed activity
 * multiplier, 500 kcal/day per pound a week, protein by bodyweight, fat as a share of
 * calories, carbs as the remainder. The adjustment step is what makes it useful over time.
 */

export type Sex = 'male' | 'female';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
export type Goal = 'lose' | 'maintain' | 'gain';

export interface Profile {
  sex: Sex;
  birthYear: number;
  heightIn: number;
  activity: Activity;
  goal: Goal;
  /** Intended change per week in pounds (always positive; the goal gives the direction). */
  rateLbPerWeek: number;
}

export const ACTIVITY: Record<Activity, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary', hint: 'desk job, little walking, no training' },
  light: { factor: 1.375, label: 'Lightly active', hint: 'desk job plus this program 2–3× a week' },
  moderate: { factor: 1.55, label: 'Moderately active', hint: 'on your feet a lot, or training most days' },
  active: { factor: 1.725, label: 'Active', hint: 'physical job, or hard training daily' },
  veryActive: { factor: 1.9, label: 'Very active', hint: 'physical job and hard training' },
};

export const KCAL_PER_LB = 3500;

const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;

export function ageAt(profile: Profile, now: number): number {
  return Math.max(10, new Date(now).getFullYear() - profile.birthYear);
}

/** Mifflin-St Jeor resting energy expenditure, kcal/day. */
export function bmr(profile: Profile, weightLb: number, now: number): number {
  const kg = weightLb * LB_TO_KG;
  const cm = profile.heightIn * IN_TO_CM;
  const base = 10 * kg + 6.25 * cm - 5 * ageAt(profile, now);
  return Math.round(base + (profile.sex === 'male' ? 5 : -161));
}

export function tdee(profile: Profile, weightLb: number, now: number): number {
  return Math.round(bmr(profile, weightLb, now) * ACTIVITY[profile.activity].factor);
}

export interface Targets {
  bmr: number;
  tdee: number;
  /** Daily calories to eat. */
  calories: number;
  /** Signed daily difference from maintenance that the goal asks for. */
  delta: number;
  /** True when the deficit was capped at the safe floor. */
  floored: boolean;
  floor: number;
  /** Grams per day. `protein` is the recommended figure inside `proteinRange`. */
  protein: number;
  proteinRange: [number, number];
  fat: number;
  fatRange: [number, number];
  carbs: number;
}

/** A sensible daily floor: not below resting energy, and never below 1,200 (women) / 1,500 (men). */
export function calorieFloor(profile: Profile, weightLb: number, now: number): number {
  return Math.max(bmr(profile, weightLb, now), profile.sex === 'male' ? 1500 : 1200);
}

export function targets(profile: Profile, weightLb: number, now: number): Targets {
  const rest = bmr(profile, weightLb, now);
  const maintenance = tdee(profile, weightLb, now);
  const rate = Math.max(0, profile.rateLbPerWeek);
  const perDay = (rate * KCAL_PER_LB) / 7;
  const delta = profile.goal === 'lose' ? -perDay : profile.goal === 'gain' ? perDay : 0;
  const floor = calorieFloor(profile, weightLb, now);
  const raw = maintenance + delta;
  const floored = raw < floor;
  const calories = Math.round((floored ? floor : raw) / 10) * 10;
  // Protein: 0.7–1.0 g per lb of bodyweight (≈1.6–2.2 g/kg); the top of the range while losing.
  const proteinRange: [number, number] = [Math.round(weightLb * 0.7), Math.round(weightLb * 1.0)];
  const protein = Math.round(weightLb * (profile.goal === 'lose' ? 1.0 : 0.8));
  // Fat: 25–35% of calories, recommended 30%.
  const fatRange: [number, number] = [Math.round((calories * 0.25) / 9), Math.round((calories * 0.35) / 9)];
  const fat = Math.round((calories * 0.3) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { bmr: rest, tdee: maintenance, calories, delta: Math.round(delta), floored, floor: Math.round(floor), protein, proteinRange, fat, fatRange, carbs };
}

export interface Adjustment {
  /** Daily calories to add (positive) or remove (negative); 0 means on track. */
  kcal: number;
  observedRate: number;
  plannedRate: number;
  summary: string;
}

/**
 * Compare the scale trend with the plan. Slower than planned → eat less (or more, for a gain);
 * faster → the other way. Rounded to 50 kcal, capped at ±300, and silent inside ±100.
 */
export function adjustment(profile: Profile, observedRate: number | null): Adjustment | null {
  if (observedRate === null) return null;
  const planned = profile.goal === 'lose' ? -profile.rateLbPerWeek : profile.goal === 'gain' ? profile.rateLbPerWeek : 0;
  const diff = observedRate - planned; // lb/week, positive = heavier than planned
  const rawKcal = (-diff * KCAL_PER_LB) / 7;
  const capped = Math.max(-300, Math.min(300, rawKcal));
  const kcal = Math.abs(capped) < 100 ? 0 : Math.round(capped / 50) * 50;
  const obs = `${observedRate > 0 ? '+' : ''}${observedRate.toFixed(1)} lb/week`;
  let summary: string;
  if (kcal === 0) summary = `Trend ${obs}, close to the plan. Keep going.`;
  else if (profile.goal === 'maintain') summary = `Trend ${obs} while aiming to hold steady: ${kcal > 0 ? 'add' : 'trim'} about ${Math.abs(kcal)} kcal a day.`;
  else if (profile.goal === 'lose')
    summary = kcal < 0 ? `Losing slower than planned (${obs}): trim about ${-kcal} kcal a day, or accept the slower pace.` : `Losing faster than planned (${obs}): you can add about ${kcal} kcal a day and still be on plan.`;
  else summary = kcal > 0 ? `Gaining slower than planned (${obs}): add about ${kcal} kcal a day.` : `Gaining faster than planned (${obs}): trim about ${-kcal} kcal a day to keep the gain lean.`;
  return { kcal, observedRate, plannedRate: planned, summary };
}

export const DEFAULT_PROFILE: Profile = {
  sex: 'male',
  birthYear: 1995,
  heightIn: 70,
  activity: 'light',
  goal: 'maintain',
  rateLbPerWeek: 0.5,
};
