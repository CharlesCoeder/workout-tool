import type { Exercise, Inventory, Program, Settings } from './types';

export const DEFAULT_INVENTORY: Inventory = {
  handleLb: 3,
  collarLb: 0.5,
  collarsPerHandle: 2,
  handles: 2,
  plates: [
    { lb: 5, count: 4 },
    { lb: 2.5, count: 4 },
  ],
};

export const DEFAULT_SETTINGS: Settings = {
  readySec: 20,
  rerackBonusSec: 30,
  logRestSec: 0,
  voiceEnabled: false,
  countdownBeeps: true,
  progressionRule: 'firstSet',
};

// Public YouTube demos (muted, looping embeds). Replace with your own clips in Settings → Exercises.
const DEMOS: Record<string, string> = {
  'squat': 'ZXwvmRSRRxY',
  'floor-press': 'qHCI9rK7HqM',
  'one-arm-row': 'ze6J_KJtJJ8',
  'curl': 'DgTlETfEuEU',
  'overhead-extension': 'YbX7Wd8jQ-Q',
  'situp': 'iL06z9PWYs8',
  'step-up': '64Lj285kiU4',
  'sldl': 'uMlKNyFFOLI',
  'seated-press': 'qEwKCR5JCog',
  'bent-over-row': '2MW94NxnGik',
  'lateral-raise': '3VcKaXpzqRo',
  'rear-delt-fly': 'dA4iqyTgx5I',
  'calf-raise': 'RodSTSylf94',
  'shrug': 'xDt6qbKgLkY',
  'lunge': '3TM-vVWuLYE',
  'pullover': 'k6b7vIjJxy0',
  'hammer-curl': 'zC3nLlEvin4',
  'lying-extension': '2XDPNh7a8p8',
  'leg-raise': 'SuIxXbKnwx4',
  'goblet-squat': 'Xjo_fY9Hl9w',
};

const ex = (
  id: string,
  name: string,
  load: Exercise['load'],
  range: [number, number],
  cue: string,
  startWeightLb: number,
  extra: Partial<Exercise> = {},
): Exercise => ({
  id,
  name,
  load,
  sets: 3,
  repMin: range[0],
  repMax: range[1],
  restSec: 90,
  cue,
  demo: DEMOS[id] ? { type: 'youtube', id: DEMOS[id] } : null,
  substitutes: [],
  startWeightLb,
  ...extra,
});

const LIB: Exercise[] = [
  // ----- Day A -----
  ex('squat', 'Dumbbell Squat', 'pair', [6, 12], 'Dumbbells at your sides. Sit back and down, chest up, knees over toes. Drive through the whole foot.', 19, {
    substitutes: ['goblet-squat', 'lunge'],
  }),
  ex('floor-press', 'Dumbbell Floor Press', 'pair', [6, 12], 'Lie on the floor, knees bent. Upper arms touch the floor at the bottom. Press up and slightly in.', 14, {
    substitutes: ['pushup'],
  }),
  ex('one-arm-row', 'One-Arm Dumbbell Row', 'single', [6, 12], 'Hand and knee on the step. Flat back. Pull the elbow to your hip, squeeze, lower slow.', 19, {
    perSide: true,
    substitutes: ['bent-over-row'],
  }),
  ex('curl', 'Standing Dumbbell Curl', 'pair', [6, 12], 'Elbows pinned at your sides. Curl up, squeeze, lower under control. No swinging.', 9, {
    substitutes: ['hammer-curl'],
  }),
  ex('overhead-extension', 'Seated Overhead Dumbbell Extension', 'single', [6, 12], 'Both hands cup the top plate. Elbows point forward and stay narrow. Lower behind your head, extend.', 14, {
    substitutes: ['lying-extension'],
  }),
  ex('situp', 'Sit-Up', 'bodyweight', [10, 25], 'Knees bent, feet flat. Curl up one vertebra at a time, exhale at the top, lower slow.', 0, {
    restSec: 60,
    substitutes: ['leg-raise'],
  }),
  // ----- Day B -----
  ex('step-up', 'Dumbbell Step-Up', 'pair', [10, 15], 'Whole foot on the step. Drive through the top leg; don’t push off the bottom foot. Alternate legs or do one side then the other.', 9, {
    perSide: true,
    substitutes: ['lunge', 'squat'],
  }),
  ex('sldl', 'Stiff-Leg Dumbbell Deadlift', 'pair', [6, 12], 'Soft knees, flat back. Push your hips back and slide the dumbbells down your legs. Stop when the hamstrings pull. Stand tall.', 19, {
    substitutes: ['squat'],
  }),
  ex('seated-press', 'Seated Dumbbell Press', 'pair', [6, 12], 'Sit tall on the step, core tight. Press overhead until arms lock, lower to ear level.', 9, {
    substitutes: ['floor-press'],
  }),
  ex('bent-over-row', 'Bent-Over Dumbbell Row', 'pair', [6, 12], 'Hinge to about 45°, flat back. Row both dumbbells to your hips, elbows in. Pause, lower slow.', 14, {
    substitutes: ['one-arm-row'],
  }),
  ex('lateral-raise', 'Lateral Raise', 'pair', [10, 15], 'Slight bend in the elbows. Raise out to the side to shoulder height, lead with the elbows. Lower slow.', 4, {
    restSec: 60,
    substitutes: ['rear-delt-fly'],
  }),
  ex('rear-delt-fly', 'Bent-Over Rear-Delt Fly', 'pair', [10, 15], 'Hinge forward, flat back, slight elbow bend. Sweep the dumbbells out and back. Squeeze the shoulder blades.', 4, {
    restSec: 60,
    substitutes: ['lateral-raise'],
  }),
  ex('calf-raise', 'One-Leg Calf Raise', 'single', [10, 15], 'Ball of one foot on the step edge, dumbbell on the same side, other hand for balance. Full stretch at the bottom, pause at the top.', 14, {
    perSide: true,
    restSec: 60,
    substitutes: [],
  }),
  ex('shrug', 'Dumbbell Shrug', 'pair', [10, 15], 'Arms straight. Shrug straight up toward your ears, hold a second, lower fully. No rolling.', 19, {
    restSec: 60,
    substitutes: [],
  }),
  // ----- Day C -----
  ex('lunge', 'Dumbbell Lunge', 'pair', [10, 15], 'Step forward, drop the back knee toward the floor, front shin vertical. Push back to standing. Alternate legs.', 9, {
    perSide: true,
    substitutes: ['step-up', 'squat'],
  }),
  ex('pullover', 'Dumbbell Pullover', 'single', [6, 12], 'Lie on the floor, hips low. Hold one plate with both hands over your chest. Lower behind your head with slightly bent arms, feel the lats stretch, pull back over.', 14, {
    substitutes: ['bent-over-row'],
  }),
  ex('hammer-curl', 'Hammer Curl', 'pair', [6, 12], 'Palms facing each other the whole way. Elbows pinned. Curl up, squeeze, lower slow.', 9, {
    substitutes: ['curl'],
  }),
  ex('lying-extension', 'Lying Dumbbell Extension', 'pair', [6, 12], 'Lie on the floor, dumbbells over your shoulders. Bend only at the elbows, lower beside your head, extend.', 9, {
    substitutes: ['overhead-extension'],
  }),
  ex('leg-raise', 'Lying Leg Raise', 'bodyweight', [10, 25], 'Hands under your hips, lower back pressed down. Raise straight legs to vertical, lower slow, don’t let the heels touch.', 0, {
    restSec: 60,
    substitutes: ['situp'],
  }),
  // ----- Substitutes / later -----
  ex('goblet-squat', 'Goblet Squat', 'single', [6, 12], 'Hold one dumbbell vertically against your chest. Elbows inside the knees at the bottom. Chest up.', 24, {
    substitutes: ['squat'],
  }),
  ex('pushup', 'Push-Up', 'bodyweight', [6, 20], 'Hands under the shoulders, body straight. Chest to the floor, press up. Leave a couple in the tank.', 0, {
    substitutes: ['floor-press'],
  }),
  ex('chinup', 'Chin-Up', 'bodyweight', [4, 10], 'Palms facing you. Start from a dead hang, pull the chin over the bar, lower slow. Needs a bar.', 0, {
    substitutes: ['bent-over-row'],
  }),
  ex('pullup', 'Wide-Grip Pull-Up', 'bodyweight', [4, 10], 'Palms away, wide grip. Dead hang, chest to the bar, lower slow. Needs a bar.', 0, {
    substitutes: ['pullover'],
  }),
];

export const DEFAULT_PROGRAM: Program = {
  days: [
    {
      id: 'A',
      name: 'Day A',
      entries: ['squat', 'floor-press', 'one-arm-row', 'curl', 'overhead-extension', 'situp'].map((exerciseId) => ({ exerciseId })),
    },
    {
      id: 'B',
      name: 'Day B',
      entries: ['step-up', 'sldl', 'seated-press', 'bent-over-row', 'lateral-raise', 'rear-delt-fly', 'calf-raise', 'shrug'].map(
        (exerciseId) => ({ exerciseId }),
      ),
    },
    {
      id: 'C',
      name: 'Day C',
      entries: ['lunge', 'floor-press', 'pullover', 'hammer-curl', 'lying-extension', 'leg-raise'].map((exerciseId) => ({ exerciseId })),
    },
  ],
  exercises: Object.fromEntries(LIB.map((e) => [e.id, e])),
  warmup: [
    { name: 'March in place', seconds: 45 },
    { name: 'Arm circles, both ways', seconds: 30 },
    { name: 'Bodyweight squats', seconds: 45 },
    { name: 'Hip hinges, hands on hips', seconds: 30 },
    { name: 'Push-ups, easy pace', seconds: 30 },
    { name: 'Shoulder rolls and shake out', seconds: 30 },
  ],
};
