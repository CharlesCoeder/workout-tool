# Dumbbell Coach

A guided dumbbell workout: a TV screen that drives the session, a phone remote where you tap reps, and progression computed from your history and your plate inventory. See `ARCHITECTURE.md` for how it fits together and `DECISIONS.md` for the calls made along the way.

## Run it locally (no setup)

```bash
npm install
npm run dev
```

Open http://localhost:5173/tv in one tab and http://localhost:5173/remote in another (or on a phone on the same network via the address Vite prints). Without Firebase env vars the app runs in *local mode*: both tabs share the same browser storage, so it must be the same browser. Everything else, including history and progression, works.

```bash
npm test        # plate math, progression, session state machine, records, stats, forecasts, body trend, nutrition, TV keys
npm run build   # typecheck + production build into dist/
```

## Firebase setup (ten lines)

1. Create a project at https://console.firebase.google.com (Spark plan is fine).
2. **Build → Authentication → Sign-in method**: enable **Anonymous**.
3. **Build → Realtime Database → Create database**, any region, start in locked mode.
4. **Project settings → Your apps → Web app** (</> icon): register one, copy the config values.
5. `cp .env.example .env` and fill in the five `VITE_FIREBASE_*` values from that config.
6. `npm i -g firebase-tools && firebase login`, then `cp .firebaserc.example .firebaserc` and put your project id in it.
7. `firebase deploy --only database` pushes `database.rules.json` (anonymous users may read/write a household they know the id of; pairing codes are short-lived).
8. `npm run build && firebase deploy --only hosting` deploys to `https://<project>.web.app`.
9. Open `/tv` on the TV (cast a Chrome tab, or open the URL in the TV browser). It shows a 4-letter code.
10. Open `/remote` on the phone, enter the code, and "Add to Home Screen" to install it. Done: they share one household from then on.

## Using it

- **TV page** (`/tv`): display only. Warm-up → get ready → set → rest → summary. Click once on it after opening to enable sound, both the countdown beeps and the demo clips' audio (browser autoplay rule). During a set it shows the rep count to aim for (one more than last time); after a set it flags a personal record; a strip along the bottom shows the whole day. The demo clip is one player that moves between the side of the screen and full screen rather than reloading, so going full screen (or changing screens) never restarts it; when a set begins it steps aside, paused where you left it. Full screen also shows the weight and plate loading, so you can see what to have ready without leaving the video. If the TV is a laptop casting a tab, the keyboard works too: Enter/Space to start or skip, digits then Enter to log reps, P pause, U undo, D full-screen demo, S show/hide the demo, + and − to move the rest by 30 s.
- **Remote** (`/remote`): the home screen shows this week's sessions, a body-weight quick log, and each day with its weights and typical length. In a session the only things you do are tap "Go" if you don't want to wait, tap the rep count after each set, and occasionally "Skip rest" or −30 s / −5 s / +5 s / +30 s. A wrong tap is fixed with "Undo" under the rest countdown, or "Logged sets & notes" under More, where every set can have its reps *and* its weight corrected (so a set you backed off on is recorded as what you did), notes save themselves as you type, and the header says so. "More" has weight override (snapped to your plates, with your recent sets at each weight), swap, skip, pause, end. "Demo video" opens the clip's controls without touching the TV: show/hide, full screen, a scrubber, restart, ±5 s, play/pause, volume (savable as that exercise's level), captions, sound on/off, speed from 0.25× to 2×, and a pause-timer button. A session left open for hours is offered for discarding instead of being resumed.
- **History** (`/history`): *Overview* (this week, a 12-week grid, pounds moved per week, sets per muscle against the program, recent records), *Lifts* (a chart per lift, weight or estimated 1RM, with the plate ceiling drawn in), *Sessions* (every session, with notes, and a CSV export), *Plates* (how many steps each lift has left and roughly when it will hit the ceiling, plus what buying a given set of plates would change).
- **Body** (`/body`): morning weigh-ins with a smoothed trend and weekly rate, and daily calorie/protein targets from a small profile, adjusted by what the trend actually does.
- **Settings** (`/settings`): program days, exercise library (sets, reps, rest, cue, demo and its volume, what gear it needs, substitutes, pair/single, muscles worked), plate inventory and the rest of your gear (bench, step, pull-up bar), progression rule and weekly target, timing, keeping the screen awake, demo-clip defaults, beeps, phone buzz, voice, backup/restore (which now includes body weight and profile).

## The program, and what "6–12 reps" means

The seed program in `src/engine/defaults.ts` is this repo's own: three dumbbell days built around a pair of loadable handles, a floor and a step, with 6–12 reps on the compounds and 10–15 on the smaller lifts. It is a starting point to edit, not a published routine — everything in it is a setting.

The range is a ladder, not a choice. Double progression means you pick a weight you can do for about 6 clean reps, add a rep or two a session until the first set reaches 12, and then add one plate step — which drops you back to 7 or 8 reps at the new weight, and you climb again. So 6 and 12 are not two different workouts: they are the bottom and top of the same rung.

That is also why extra reps are not free credit. Under the default rule the *first* set reaching the top of the range is the entire trigger for more weight next time; reps past it change nothing the app will ever read, and the phone says so while it shows them. The two exceptions, where reps are the only progress available, are bodyweight exercises and lifts already at your plate ceiling — and there it says that instead.

## Voice (optional)

Settings → Timing & voice → enable. Chrome only, needs microphone permission on the TV page. Commands: "done", a number, "skip", "go", "pause", "resume", "undo", "show me again". The remote always works regardless.
