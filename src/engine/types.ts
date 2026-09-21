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
  /** Everything else you own that an exercise can need: see `GEAR` in defaults. */
  gear: string[];
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
  /** Muscle groups worked; the first is the main one (counts a full set, the rest count half). */
  muscles?: string[];
  /** Gear this needs besides dumbbells ('bench', 'step', 'pullup-bar'); see `GEAR`. */
  requires?: string[];
  /** How loud this clip is, 0–100. Clips are mastered at wildly different levels. */
  demoVolume?: number;
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
  /** Sessions per week you are aiming for; drives the "this week" card. */
  targetSessionsPerWeek: number;
  /** Buzz the phone at 3-2-1 and go (Android; iOS has no vibration API). */
  phoneVibrate: boolean;
  /** Leave the clip on the TV while a set runs. Off: it parks, paused, where you left it. */
  demoDuringSets: boolean;
  /** Turn captions on for clips that have them. */
  demoCaptions: boolean;
  /** Loudness for clips with no per-exercise level of their own, 0–100. */
  demoVolume: number;
  /** Ask the browser to keep the screen on while the app is open. */
  keepAwake: boolean;
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
  /** Per-exercise demo loudness, copied from the library so the TV needs no program. */
  demoVolume?: number;
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
  /** The clip is on the TV at all. It goes false when a set starts (unless `demoDuringSets`). */
  shown: boolean;
  /** Demo fills the TV until hidden (auto-hides when a set starts). */
  enlarged: boolean;
  /** Playback rate applied to every demo player on the TV. Back to 1x on a new exercise. */
  rate: number;
  /** Sound off. Defaults to on: the TV plays the clip's audio once it has had one click. */
  muted: boolean;
  /** Loudness, 0–100, starting from the exercise's own level. */
  volume: number;
  /** Captions on, for clips that carry them. */
  captions: boolean;
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
  /** Correct the weight an already-logged set was done at. */
  | { type: 'editSetWeight'; ex: number; set: number; weightLb: number }
  /** Attach a note to the session (`ex` omitted) or to one exercise. */
  | { type: 'note'; ex?: number; text: string }
  | { type: 'skipRest' }
  | { type: 'extendRest'; seconds: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'showDemo' }
  | { type: 'hideDemo' }
  /** Put the clip on the TV, or take it off without touching where it is up to. */
  | { type: 'demoShown'; shown: boolean }
  | { type: 'demoRate'; rate: number }
  | { type: 'demoMuted'; muted: boolean }
  | { type: 'demoVolume'; volume: number }
  | { type: 'demoCaptions'; captions: boolean }
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
  /** What the exercise was worked at: the first set's weight. Progression reads this. */
  weightLb: number;
  /** One weight per set, written only when a set was done at a different weight. */
  weights?: number[];
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
