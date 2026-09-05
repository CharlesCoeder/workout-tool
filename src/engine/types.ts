// ---------- Equipment ----------

export interface PlateType {
  lb: number;
  count: number;
}

export interface Inventory {
  handleLb: number;
  collarLb: number;
  collarsPerHandle: number;
  handles: number;
  plates: PlateType[];
}

export type LoadMode = 'pair' | 'single' | 'bodyweight';

/** Plates on ONE end of a dumbbell, heaviest first. */
export interface Loading {
  perEnd: number[];
  dumbbellLb: number;
}

/** What is physically on the bars: one entry per handle. */
export interface Rack {
  handles: number[][]; // perEnd for each handle
}

// ---------- Program ----------

export type Demo =
  | { type: 'youtube'; id: string; start?: number }
  | { type: 'video'; url: string }
  | null;

export interface Exercise {
  id: string;
  name: string;
  load: LoadMode;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  cue: string;
  demo: Demo;
  substitutes: string[];
  startWeightLb: number;
  perSide?: boolean;
  notes?: string;
}

export interface DayEntry {
  exerciseId: string;
  sets?: number;
  repMin?: number;
  repMax?: number;
}

export interface Day {
  id: string;
  name: string;
  entries: DayEntry[];
}

export interface WarmupStep {
  name: string;
  seconds: number;
}

export interface Program {
  days: Day[];
  exercises: Record<string, Exercise>;
  warmup: WarmupStep[];
}

export interface Settings {
  readySec: number;
  rerackBonusSec: number;
  logRestSec: number; // extra rest granted when using "done"→"how many" path? (unused, keep 0)
  voiceEnabled: boolean;
  countdownBeeps: boolean;
}

// ---------- Session ----------

export interface SetResult {
  weightLb: number;
  reps: number;
  at: number;
}

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  load: LoadMode;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
  cue: string;
  demo: Demo;
  perSide: boolean;
  substitutes: string[];
  prescribedLb: number;
  weightLb: number;
  loading: Loading | null;
  maxedOut: boolean;
  blocked: boolean;
  progressed: boolean;
  lastTime: { weightLb: number; reps: number[] } | null;
  results: SetResult[];
  skipped?: boolean;
  substitutedFrom?: string;
}

export type Phase =
  | { kind: 'warmup'; step: number; endsAt: number }
  | { kind: 'ready'; endsAt: number }
  | { kind: 'working' }
  | { kind: 'logging' }
  | { kind: 'rest'; endsAt: number; durationSec: number; rerack: boolean }
  | { kind: 'summary' };

export type DemoCommand =
  | { type: 'seekBy'; seconds: number }
  | { type: 'restart' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' };

export interface DemoState {
  /** Demo fills the TV until hidden (auto-hides when a set starts). */
  enlarged: boolean;
  /** Playback rate applied to every demo player on the TV. */
  rate: number;
  /** One-shot command; `seq` increments so the TV applies each once. */
  seq: number;
  cmd: DemoCommand | null;
}

export interface SessionState {
  id: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  endedAt?: number;
  warmup: WarmupStep[];
  exercises: PlannedExercise[];
  cursor: { ex: number; set: number };
  phase: Phase;
  paused: { remainingMs: number | null } | null;
  demo: DemoState;
  rev: number;
}

export type Action =
  | { type: 'skipWarmupStep' }
  | { type: 'skipWarmup' }
  | { type: 'go' }
  | { type: 'setDone' }
  | { type: 'logReps'; reps: number }
  | { type: 'skipRest' }
  | { type: 'extendRest'; seconds: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'showDemo' }
  | { type: 'hideDemo' }
  | { type: 'demoRate'; rate: number }
  | { type: 'demoCommand'; cmd: DemoCommand }
  | { type: 'overrideWeight'; weightLb: number; loading: Loading | null }
  | { type: 'substitute'; exercise: PlannedExercise }
  | { type: 'skipExercise' }
  | { type: 'endSession' };

// ---------- History ----------

export interface SessionRecordExercise {
  exerciseId: string;
  name: string;
  load: LoadMode;
  weightLb: number;
  reps: number[];
  maxedOut?: boolean;
}

export interface SessionRecord {
  id: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  endedAt: number | null;
  completed: boolean;
  exercises: SessionRecordExercise[];
}
