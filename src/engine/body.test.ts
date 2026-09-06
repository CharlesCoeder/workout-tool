import { describe, expect, it } from 'vitest';
import { ALPHA, summarize, trend, weeklyRate, type BodyWeightEntry } from './body';

// Day n counted from 1 = Aug 1 2026; larger n roll into September.
const day = (n: number) => {
  const d = new Date(2026, 7, n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const e = (n: number, lb: number): BodyWeightEntry => ({ date: day(n), lb, at: 0 });
const now = new Date(2026, 7, 31, 9).getTime();

describe('body weight trend', () => {
  it('starts at the first reading and smooths the rest', () => {
    const pts = trend([e(1, 180), e(2, 182), e(3, 179)]);
    expect(pts.map((p) => p.trend)).toEqual([180, 180.2, 180.08]);
  });

  it('sorts by date and drops empty readings', () => {
    const pts = trend([e(3, 181), e(1, 180), e(2, 0)]);
    expect(pts.map((p) => p.date)).toEqual([day(1), day(3)]);
  });

  it('gaps count as elapsed days, so a reading after a week moves the trend more', () => {
    const daily = trend([e(1, 180), e(2, 184)]);
    const weekly = trend([e(1, 180), e(8, 184)]);
    expect(daily[1].trend).toBeCloseTo(180 + ALPHA * 4, 5);
    expect(weekly[1].trend).toBeGreaterThan(daily[1].trend);
    expect(weekly[1].trend).toBeLessThan(184);
  });

  it('weekly rate is a least-squares slope of the trend over the last three weeks', () => {
    // steady loss of 0.1 lb a day; once the smoothing has settled the trend falls at the same −0.7 lb/week
    const entries = Array.from({ length: 45 }, (_, i) => e(i - 14, 195 - i * 0.1)); // Jul 18 … Aug 31
    const pts = trend(entries);
    const rate = weeklyRate(pts, now);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(-0.7, 1);
    // a fresh series lags: the smoothed line has not caught up with the scale yet
    const fresh = weeklyRate(trend(Array.from({ length: 20 }, (_, i) => e(i + 11, 190 - i * 0.1))), now);
    expect(fresh!).toBeLessThan(-0.3);
    expect(fresh!).toBeGreaterThan(-0.7);
    // too few or too clustered readings → null
    expect(weeklyRate(trend([e(28, 180), e(29, 180), e(30, 180)]), now)).toBeNull();
    expect(weeklyRate(trend([e(25, 180), e(26, 180), e(27, 180), e(28, 180), e(29, 180)]), now)).toBeNull();
  });

  it('summarises the latest trend and changes', () => {
    const entries = Array.from({ length: 31 }, (_, i) => e(i + 1, 190 - i * 0.2));
    const s = summarize(entries, now);
    expect(s.entries).toBe(31);
    expect(s.latest?.date).toBe(day(31));
    expect(s.trendLb).toBeGreaterThan(184);
    expect(s.trendLb).toBeLessThan(190);
    expect(s.change30).not.toBeNull();
    expect(s.change30!).toBeLessThan(0);
    expect(s.changeAll).toBe(Math.round((s.trendLb! - 190) * 10) / 10);
    expect(s.recentReadings).toBe(21); // Aug 11 … Aug 31
    expect(summarize([], now)).toMatchObject({ latest: null, trendLb: null, weeklyRate: null, change30: null, changeAll: null, entries: 0 });
  });
});
