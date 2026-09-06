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

/** When a lift earns its next plate step: the first set reaches the top of the range, or every set does. */
export type ProgressionRule = 'firstSet' | 'allSets';

export interface Settings {
  readySec: number;
  rerackBonusSec: number;
  logRestSec: number; // extra rest granted when using "done"→"how many" path? (unused, keep 0)
  voiceEnabled: boolean;
  countdownBeeps: boolean;
  progressionRule: ProgressionRule;
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
  /** Consecutive recent sessions at this weight without earning a step (0 = progressing). */
  stalled: number;
  lastTime: { weightLb: number; reps: number[] } | null;
  results: SetResult[];
  skipped?: boolean;
  substitutedFrom?: string;
  /** Free text typed on the phone ("left shoulder pinched", "grip went first"). */
  note?: string;
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
  | { type: 'seekTo'; seconds: number }
  | { type: 'restart' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' };

export interface DemoState {
  /** Demo fills the TV until hidden (auto-hides when a set starts). */
  enlarged: boolean;
  /** Playback rate applied to every demo player on the TV. */
  rate: number;
  /** Sound off. Defaults to on: the TV plays the clip's audio once it has had one click. */
  muted: boolean;
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
  /** Session-level note, typed on the phone. */
  note?: string;
  rev: number;
}

export type Action =
  | { type: 'skipWarmupStep' }
  | { type: 'skipWarmup' }
  | { type: 'go' }
  | { type: 'setDone' }
  | { type: 'logReps'; reps: number }
  /** Take back the most recently logged set (any exercise) and return to it. */
  | { type: 'undoSet' }
  /** Correct the reps of an already-logged set in place. */
  | { type: 'editSet'; ex: number; set: number; reps: number }
  /** Attach a note to the session (`ex` omitted) or to one exercise. */
  | { type: 'note'; ex?: number; text: string }
  | { type: 'skipRest' }
  | { type: 'extendRest'; seconds: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'showDemo' }
  | { type: 'hideDemo' }
  | { type: 'demoRate'; rate: number }
  | { type: 'demoMuted'; muted: boolean }
  | { type: 'demoCommand'; cmd: DemoCommand }
  | { type: 'overrideWeight'; weightLb: number; loading: Loading | null }
  | { type: 'substitute'; exercise: PlannedExercise }
  | { type: 'skipExercise' }
  | { type: 'endSession' };

/**
 * Where the TV's demo player is, published by the TV a few times a minute (and on every
 * play/pause/seek) so the phone can draw a scrubber and a correct play/pause icon.
 * Lives beside `live` (not inside it) so the TV never races the phone's writes.
 */
export interface DemoPlayback {
  sessionId: string;
  exerciseId: string;
  /** Seconds into the clip when sampled. */
  position: number;
  /** Clip length in seconds; 0 while unknown. */
  duration: number;
  playing: boolean;
  rate: number;
  /** Backend clock (ms) at sampling time; the phone extrapolates from here. */
  at: number;
}

// ---------- History ----------

export interface SessionRecordExercise {
  exerciseId: string;
  name: string;
  load: LoadMode;
  weightLb: number;
  reps: number[];
  maxedOut?: boolean;
  note?: string;
}

export interface SessionRecord {
  id: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  endedAt: number | null;
  completed: boolean;
  exercises: SessionRecordExercise[];
  note?: string;
}
