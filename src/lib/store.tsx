import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Action, Inventory, Program, SessionRecord, SessionState, Settings } from '../engine/types';
import { reduce, settle } from '../engine/session';
import { planSession, toRecord } from '../engine/plan';
import { getBackend, type Backend } from '../backend';
import {
  normalizeInventory,
  normalizeProgram,
  normalizeRecords,
  normalizeSession,
  normalizeSettings,
} from '../backend/normalize';
import { getStoredHid, randomId, setStoredHid } from './household';
import { playbackPath } from '../engine/playback';

export interface AppStore {
  backend: Backend;
  mode: 'local' | 'firebase';
  hid: string;
  setHid: (hid: string) => void;
  loaded: boolean;
  /** True when this household has anything saved (used to decide who wins at pairing). */
  hasData: boolean;
  program: Program;
  inventory: Inventory;
  settings: Settings;
  history: SessionRecord[];
  /** Raw live state (unsettled). Use `useSettled` for rendering. */
  live: SessionState | null;
  now: () => number;
  dispatch: (a: Action) => Promise<void>;
  startSession: (dayId: string) => Promise<void>;
  clearLive: () => Promise<void>;
  saveProgram: (p: Program) => Promise<void>;
  saveInventory: (i: Inventory) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

const Ctx = createContext<AppStore | null>(null);

function initialHid(mode: 'local' | 'firebase'): string {
  if (mode === 'local') return 'local';
  const existing = getStoredHid();
  if (existing) return existing;
  const fresh = randomId();
  setStoredHid(fresh);
  return fresh;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const [hid, setHidState] = useState(() => initialHid(backend.mode));
  const [programRaw, setProgramRaw] = useState<Program | null>(null);
  const [inventoryRaw, setInventoryRaw] = useState<Inventory | null>(null);
  const [settingsRaw, setSettingsRaw] = useState<Settings | null>(null);
  const [historyRaw, setHistoryRaw] = useState<Record<string, SessionRecord> | null>(null);
  const [live, setLive] = useState<SessionState | null>(null);
  const [loadedFlags, setLoadedFlags] = useState(0);

  const base = `households/${hid}`;

  useEffect(() => {
    setLoadedFlags(0);
    const mark = (bit: number) => setLoadedFlags((f) => f | bit);
    const unsubs = [
      backend.subscribe<Program>(`${base}/program`, (v) => {
        setProgramRaw(v);
        mark(1);
      }),
      backend.subscribe<Inventory>(`${base}/equipment`, (v) => {
        setInventoryRaw(v);
        mark(2);
      }),
      backend.subscribe<Settings>(`${base}/settings`, (v) => {
        setSettingsRaw(v);
        mark(4);
      }),
      backend.subscribe<Record<string, SessionRecord>>(`${base}/sessions`, (v) => {
        setHistoryRaw(v);
        mark(8);
      }),
      backend.subscribe<SessionState>(`${base}/live`, (v) => {
        setLive(normalizeSession(v));
        mark(16);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [backend, base]);

  const program = useMemo(() => normalizeProgram(programRaw), [programRaw]);
  const inventory = useMemo(() => normalizeInventory(inventoryRaw), [inventoryRaw]);
  const settings = useMemo(() => normalizeSettings(settingsRaw), [settingsRaw]);
  const history = useMemo(() => normalizeRecords(historyRaw), [historyRaw]);
  const loaded = loadedFlags === 31;

  const liveRef = useRef(live);
  liveRef.current = live;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const now = useCallback(() => backend.now(), [backend]);

  const persistRecord = useCallback(
    async (s: SessionState) => {
      const hasResults = s.exercises.some((e) => e.results.length > 0);
      if (!hasResults && s.phase.kind !== 'summary') return;
      await backend.set(`${base}/sessions/${s.id}`, toRecord(s));
    },
    [backend, base],
  );

  const dispatch = useCallback(
    async (a: Action) => {
      const cur = liveRef.current;
      if (!cur) return;
      const t = backend.now();
      const opts = { readySec: settingsRef.current.readySec, rerackBonusSec: settingsRef.current.rerackBonusSec };
      const next = reduce(cur, a, t, opts);
      if (next === cur) return;
      liveRef.current = next;
      setLive(next);
      await backend.set(`${base}/live`, next);
      if (a.type === 'logReps' || a.type === 'endSession' || next.phase.kind === 'summary') await persistRecord(next);
    },
    [backend, base, persistRecord],
  );

  const startSession = useCallback(
    async (dayId: string) => {
      const s = planSession(program, dayId, history, inventory, backend.now());
      liveRef.current = s;
      setLive(s);
      await backend.set(`${base}/live`, s);
    },
    [backend, base, program, history, inventory],
  );

  const clearLive = useCallback(async () => {
    const cur = liveRef.current;
    if (cur && cur.phase.kind !== 'summary') await persistRecord({ ...cur, endedAt: backend.now() });
    liveRef.current = null;
    setLive(null);
    await backend.remove(`${base}/live`);
    await backend.remove(playbackPath(hid));
  }, [backend, base, hid, persistRecord]);

  const setHid = useCallback((h: string) => {
    setStoredHid(h);
    setHidState(h);
  }, []);

  const value: AppStore = {
    backend,
    mode: backend.mode,
    hid,
    setHid,
    loaded,
    hasData: programRaw !== null || historyRaw !== null || inventoryRaw !== null,
    program,
    inventory,
    settings,
    history,
    live,
    now,
    dispatch,
    startSession,
    clearLive,
    saveProgram: (p) => backend.set(`${base}/program`, p),
    saveInventory: (i) => backend.set(`${base}/equipment`, i),
    saveSettings: (s) => backend.set(`${base}/settings`, s),
    deleteSession: (id) => backend.remove(`${base}/sessions/${id}`),
    clearHistory: () => backend.remove(`${base}/sessions`),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** A clock that re-renders on an interval, aligned to the backend clock. */
export function useNow(intervalMs = 250): number {
  const { now } = useApp();
  const [t, setT] = useState(() => now());
  useEffect(() => {
    const id = setInterval(() => setT(now()), intervalMs);
    return () => clearInterval(id);
  }, [now, intervalMs]);
  return t;
}

/** The live session rolled forward to `now` (pure), plus `now`. */
export function useSettled(): { session: SessionState | null; now: number } {
  const { live, settings } = useApp();
  const t = useNow();
  const session = useMemo(
    () => (live ? settle(live, t, { readySec: settings.readySec, rerackBonusSec: settings.rerackBonusSec }) : null),
    [live, t, settings.readySec, settings.rerackBonusSec],
  );
  return { session, now: t };
}
