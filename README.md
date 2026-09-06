# Dumbbell Coach

A guided dumbbell workout: a TV screen that drives the session, a phone remote where you tap reps, and progression computed from your history and your plate inventory. See `ARCHITECTURE.md` for how it fits together and `DECISIONS.md` for the calls made along the way.

## Run it locally (no setup)

```bash
npm install
npm run dev
```

Open http://localhost:5173/tv in one tab and http://localhost:5173/remote in another (or on a phone on the same network via the address Vite prints). Without Firebase env vars the app runs in *local mode*: both tabs share the same browser storage, so it must be the same browser. Everything else, including history and progression, works.

```bash
npm test        # plate math, progression rule, session state machine
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

- **TV page** (`/tv`): display only. Warm-up → get ready → set → rest → summary. Click once on it after opening to enable sound, both the countdown beeps and the demo clips' audio (browser autoplay rule).
- **Remote** (`/remote`): pick a day; then the only things you do are tap "Go" if you don't want to wait, tap the rep count after each set, and occasionally "Skip rest". "More" has weight override (snapped to your plates), swap, skip, pause, end. "Demo video" puts the clip full-screen on the TV and gives you a scrubber, restart, ±5 s, play/pause, sound on/off, speed from 0.25× to 2×, and a pause-timer button.
- **History** (`/history`): every session, and a chart per lift with the plate ceiling drawn in.
- **Settings** (`/settings`): program days, exercise library (sets, reps, rest, cue, demo, substitutes, pair/single), plate inventory, timing, beeps, voice, backup/restore.

## Voice (optional)

Settings → Timing & voice → enable. Chrome only, needs microphone permission on the TV page. Commands: "done", a number, "skip", "go", "pause", "resume", "show me again". The remote always works regardless.
