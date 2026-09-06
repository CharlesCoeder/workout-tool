import { dayKey, daysBetween } from './stats';

/**
 * Body weight: daily readings are noisy (water, food, salt swing them by 2–3 lb), so
 * everything the app says is based on a smoothed trend, not the last number on the scale.
 */

export interface BodyWeightEntry {
  /** Local 'YYYY-MM-DD'; one reading per day, the latest wins. */
  date: string;
  lb: number;
  /** When it was logged. */
  at: number;
}

export interface TrendPoint extends BodyWeightEntry {
  /** Midnight local of `date`. */
  t: number;
  trend: number;
}

/** Per-day smoothing factor: about a ten-day memory, the usual choice for scale-weight trends. */
export const ALPHA = 0.1;

export function parseDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Exponentially smoothed trend. Missing days move the smoothing forward as if each day
 * had repeated the previous trend, so a reading after a week away still counts more than
 * one taken the next morning.
 */
export function trend(entries: BodyWeightEntry[]): TrendPoint[] {
  const sorted = [...entries].filter((e) => e.lb > 0).sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let prev: TrendPoint | null = null;
  for (const e of sorted) {
    const t = parseDay(e.date);
    if (!prev) {
      prev = { ...e, t, trend: e.lb };
    } else {
      const gap = Math.max(1, daysBetween(prev.t, t));
      const alpha = 1 - Math.pow(1 - ALPHA, gap);
      prev = { ...e, t, trend: Math.round((prev.trend + alpha * (e.lb - prev.trend)) * 100) / 100 };
    }
    out.push(prev);
  }
  return out;
}

export interface BodySummary {
  latest: TrendPoint | null;
  /** Trend value today (the last trend point). */
  trendLb: number | null;
  /** Change in the trend per week over the last three weeks, from a least-squares fit; null with too little data. */
  weeklyRate: number | null;
  /** Trend now minus the trend about 30 days ago. */
  change30: number | null;
  /** Trend now minus the first trend point. */
  changeAll: number | null;
  /** Days covered by readings in the last three weeks. */
  recentReadings: number;
  entries: number;
}

const WEEK = 7 * 86_400_000;

/** Least-squares slope of trend against time over the last `days`, in lb per week. */
export function weeklyRate(points: TrendPoint[], now: number, days = 21): number | null {
  const since = now - days * 86_400_000;
  const recent = points.filter((p) => p.t >= since && p.t <= now);
  if (recent.length < 4) return null;
  const span = recent[recent.length - 1].t - recent[0].t;
  if (span < 10 * 86_400_000) return null;
  const n = recent.length;
  const mx = recent.reduce((s, p) => s + p.t, 0) / n;
  const my = recent.reduce((s, p) => s + p.trend, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of recent) {
    num += (p.t - mx) * (p.trend - my);
    den += (p.t - mx) * (p.t - mx);
  }
  if (den === 0) return null;
  return Math.round((num / den) * WEEK * 100) / 100;
}

export function summarize(entries: BodyWeightEntry[], now: number): BodySummary {
  const points = trend(entries).filter((p) => p.t <= now + 86_400_000);
  const latest = points[points.length - 1] ?? null;
  const ago30 = latest ? [...points].reverse().find((p) => latest.t - p.t >= 28 * 86_400_000) : undefined;
  const recentSince = now - 21 * 86_400_000;
  return {
    latest,
    trendLb: latest?.trend ?? null,
    weeklyRate: weeklyRate(points, now),
    change30: latest && ago30 ? Math.round((latest.trend - ago30.trend) * 10) / 10 : null,
    changeAll: latest && points.length > 1 ? Math.round((latest.trend - points[0].trend) * 10) / 10 : null,
    recentReadings: points.filter((p) => p.t >= recentSince).length,
    entries: points.length,
  };
}

export function todayKey(now: number): string {
  return dayKey(now);
}
