import type { Inventory, Loading, LoadMode, Rack } from './types';

const round = (n: number) => Math.round(n * 100) / 100;

export function emptyDumbbellLb(inv: Inventory): number {
  return round(inv.handleLb + inv.collarLb * inv.collarsPerHandle);
}

function handlesInUse(_inv: Inventory, mode: LoadMode): number {
  if (mode === 'bodyweight') return 0;
  return mode === 'pair' ? 2 : 1;
}

/**
 * Every distinct dumbbell weight the inventory can build for the given mode,
 * ascending, one loading per weight (fewest plates wins the tie).
 */
export function achievableLoadings(inv: Inventory, mode: LoadMode): Loading[] {
  const handles = handlesInUse(inv, mode);
  if (handles === 0 || inv.handles < handles) return [];
  const ends = handles * 2;
  const types = inv.plates.filter((p) => p.lb > 0 && p.count > 0);
  const maxPerEnd = types.map((p) => Math.floor(p.count / ends));
  const base = emptyDumbbellLb(inv);
  const byWeight = new Map<number, Loading>();

  const counts = new Array<number>(types.length).fill(0);
  const visit = (i: number) => {
    if (i === types.length) {
      const perEnd: number[] = [];
      for (let t = 0; t < types.length; t++) for (let c = 0; c < counts[t]; c++) perEnd.push(types[t].lb);
      perEnd.sort((a, b) => b - a);
      const lb = round(base + 2 * perEnd.reduce((s, x) => s + x, 0));
      const prev = byWeight.get(lb);
      if (!prev || prev.perEnd.length > perEnd.length) byWeight.set(lb, { perEnd, dumbbellLb: lb });
      return;
    }
    for (let c = 0; c <= maxPerEnd[i]; c++) {
      counts[i] = c;
      visit(i + 1);
    }
    counts[i] = 0;
  };
  visit(0);
  return [...byWeight.values()].sort((a, b) => a.dumbbellLb - b.dumbbellLb);
}

export function achievableWeights(inv: Inventory, mode: LoadMode): number[] {
  return achievableLoadings(inv, mode).map((l) => l.dumbbellLb);
}

/** All loadings (not de-duplicated) that produce exactly `lb`. */
function allLoadingsFor(inv: Inventory, mode: LoadMode, lb: number): number[][] {
  const handles = handlesInUse(inv, mode);
  if (handles === 0) return [];
  const ends = handles * 2;
  const types = inv.plates.filter((p) => p.lb > 0 && p.count > 0);
  const maxPerEnd = types.map((p) => Math.floor(p.count / ends));
  const target = round((lb - emptyDumbbellLb(inv)) / 2);
  const out: number[][] = [];
  const counts = new Array<number>(types.length).fill(0);
  const visit = (i: number, sum: number) => {
    if (sum > target + 1e-9) return;
    if (i === types.length) {
      if (Math.abs(sum - target) < 1e-9) {
        const perEnd: number[] = [];
        for (let t = 0; t < types.length; t++) for (let c = 0; c < counts[t]; c++) perEnd.push(types[t].lb);
        out.push(perEnd.sort((a, b) => b - a));
      }
      return;
    }
    for (let c = 0; c <= maxPerEnd[i]; c++) {
      counts[i] = c;
      visit(i + 1, round(sum + c * types[i].lb));
    }
    counts[i] = 0;
  };
  visit(0, 0);
  return out;
}

/** Number of plates that differ between two per-end loadings (moves needed). */
export function loadingDistance(a: number[], b: number[]): number {
  const count = (arr: number[]) => {
    const m = new Map<number, number>();
    for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const ma = count(a);
  const mb = count(b);
  let d = 0;
  for (const k of new Set([...ma.keys(), ...mb.keys()])) d += Math.abs((ma.get(k) ?? 0) - (mb.get(k) ?? 0));
  return d;
}

/**
 * The loading for an exact achievable weight. When several plate combinations
 * give the same weight, prefer the one needing the fewest changes from `preferLike`
 * (what is on the bar now), then the fewest plates.
 */
export function loadingFor(inv: Inventory, mode: LoadMode, lb: number, preferLike?: number[]): Loading | null {
  if (mode === 'bodyweight') return null;
  const options = allLoadingsFor(inv, mode, lb);
  if (options.length === 0) return null;
  options.sort((a, b) => {
    if (preferLike) {
      const da = loadingDistance(a, preferLike);
      const db = loadingDistance(b, preferLike);
      if (da !== db) return da - db;
    }
    return a.length - b.length;
  });
  return { perEnd: options[0], dumbbellLb: lb };
}

export function isAchievable(inv: Inventory, mode: LoadMode, lb: number): boolean {
  return achievableWeights(inv, mode).some((w) => Math.abs(w - lb) < 1e-9);
}

/** Nearest achievable weight; ties go lower. Null if nothing can be built. */
export function snapWeight(inv: Inventory, mode: LoadMode, target: number): number | null {
  const ws = achievableWeights(inv, mode);
  if (ws.length === 0) return null;
  let best = ws[0];
  for (const w of ws) {
    const d = Math.abs(w - target);
    const bd = Math.abs(best - target);
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && w < best)) best = w;
  }
  return best;
}

/** Nearest achievable weight at or below target (or the lightest if none). */
export function snapDown(inv: Inventory, mode: LoadMode, target: number): number | null {
  const ws = achievableWeights(inv, mode);
  if (ws.length === 0) return null;
  const below = ws.filter((w) => w <= target + 1e-9);
  return below.length ? below[below.length - 1] : ws[0];
}

/** Next heavier achievable weight, or null at the ceiling. */
export function nextStep(inv: Inventory, mode: LoadMode, current: number): number | null {
  const ws = achievableWeights(inv, mode);
  const up = ws.find((w) => w > current + 1e-9);
  return up ?? null;
}

export function prevStep(inv: Inventory, mode: LoadMode, current: number): number | null {
  const ws = achievableWeights(inv, mode).filter((w) => w < current - 1e-9);
  return ws.length ? ws[ws.length - 1] : null;
}

export function maxWeight(inv: Inventory, mode: LoadMode): number | null {
  const ws = achievableWeights(inv, mode);
  return ws.length ? ws[ws.length - 1] : null;
}

// ---------- Rack (what's on each handle) ----------

export function emptyRack(inv: Inventory): Rack {
  return { handles: Array.from({ length: inv.handles }, () => []) };
}

/**
 * The rack needed to perform a lift. For a pair, both handles get the loading.
 * For a single, handle 0 gets the loading and the other handles keep whatever they
 * had if the remaining pool allows it; otherwise they are stripped down.
 */
export function rackFor(inv: Inventory, mode: LoadMode, loading: Loading | null, prev?: Rack): Rack {
  const rack = emptyRack(inv);
  if (!loading || mode === 'bodyweight') return prev ?? rack;
  if (mode === 'pair') {
    for (let h = 0; h < Math.min(2, inv.handles); h++) rack.handles[h] = [...loading.perEnd];
    // Extra handles (if any) keep previous contents if the pool allows.
    for (let h = 2; h < inv.handles; h++) rack.handles[h] = fitToPool(inv, rack, prev?.handles[h] ?? []);
    return rack;
  }
  rack.handles[0] = [...loading.perEnd];
  for (let h = 1; h < inv.handles; h++) rack.handles[h] = fitToPool(inv, rack, prev?.handles[h] ?? []);
  return rack;
}

function fitToPool(inv: Inventory, rack: Rack, wanted: number[]): number[] {
  const used = new Map<number, number>();
  for (const h of rack.handles) for (const p of h) used.set(p, (used.get(p) ?? 0) + 2);
  const out: number[] = [];
  for (const p of [...wanted].sort((a, b) => b - a)) {
    const total = inv.plates.find((t) => Math.abs(t.lb - p) < 1e-9)?.count ?? 0;
    if ((used.get(p) ?? 0) + 2 <= total) {
      out.push(p);
      used.set(p, (used.get(p) ?? 0) + 2);
    }
  }
  return out;
}

export function sameRack(a: Rack, b: Rack): boolean {
  if (a.handles.length !== b.handles.length) return false;
  return a.handles.every((h, i) => loadingDistance(h, b.handles[i]) === 0);
}

export function rackWeight(inv: Inventory, perEnd: number[]): number {
  return round(emptyDumbbellLb(inv) + 2 * perEnd.reduce((s, x) => s + x, 0));
}

export interface RackChange {
  handle: number;
  from: number[];
  to: number[];
  add: number[];
  remove: number[];
}

/** Per-handle description of the change needed to go from one rack to another. */
export function rackDiff(from: Rack, to: Rack): RackChange[] {
  const n = Math.max(from.handles.length, to.handles.length);
  const out: RackChange[] = [];
  for (let h = 0; h < n; h++) {
    const a = from.handles[h] ?? [];
    const b = to.handles[h] ?? [];
    if (loadingDistance(a, b) === 0) continue;
    const remaining = [...a];
    const add: number[] = [];
    for (const p of b) {
      const i = remaining.findIndex((x) => Math.abs(x - p) < 1e-9);
      if (i >= 0) remaining.splice(i, 1);
      else add.push(p);
    }
    out.push({ handle: h, from: a, to: b, add, remove: remaining });
  }
  return out;
}

export function formatLb(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round(n));
}
