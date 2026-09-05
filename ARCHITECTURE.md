# Architecture

A guided dumbbell workout coach: a TV page that drives the session like a follow-along video, and a phone remote that is the only thing you touch. Single user, pounds, free tier.

## Backend choice: Firebase Spark (Realtime Database only), with a zero-config local mode

**Why Firebase.** The core requirement is a live, low-latency shared state between two browsers (TV and phone) with no server code to run, on a free tier that is not Supabase. Firebase Realtime Database (RTDB) is purpose-built for exactly this: a JSON node that both clients subscribe to, sub-100 ms fan-out, automatic reconnect after the phone screen locks, and a server clock offset (`.info/serverTimeOffset`) so both screens count down in sync. Anonymous auth is one call. Hosting is free with SPA rewrites. The alternatives I weighed: Cloudflare Workers + Durable Objects (free tier now exists, but you'd write and own a WebSocket relay), PocketBase (needs a box to run on), and PartyKit/Liveblocks (fine, but a second vendor for history). For a single user with one JSON document of live state and a few KB of history per week, RTDB alone is the smallest thing that works, so I use it for history too rather than adding Firestore. Spark limits (1 GB stored, 10 GB/month egress, 100 simultaneous connections) are orders of magnitude above what this uses.

**Local mode.** If no Firebase env vars are set, the app runs on a `LocalBackend` that stores the same JSON tree in `localStorage` and fans out changes across tabs with `BroadcastChannel`. Everything works in one browser (TV tab + remote tab) with no setup, which is how you should try it first. The backend is a five-method interface (`get`, `set`, `update`, `remove`, `subscribe`, plus `now()`), so the two implementations are interchangeable.

## Data model

All data for one user lives under one *household* node. Anonymous auth gives every device its own UID, so the household id (`hid`, 20 random chars) is the thing that ties TV and phone together. RTDB rules allow any signed-in (anonymous) user to read/write a household; the unguessable hid is the capability. That is the right trade for a single-user workout log; if that ever changes, rules can restrict hids to a member list.

```
households/{hid}/
  program        Program        days, exercise library, warm-up steps
  equipment      Inventory      handle/collar weights, plate counts
  settings       Settings       rest defaults, ready countdown, voice toggle...
  live           SessionState | null   the running session (see engine)
  sessions/{id}  SessionRecord  completed (or abandoned) sessions, for history
pairings/{CODE}  { tvHid, phoneHid?, createdAt }   short-lived pairing handshake
```

Types are in `src/engine/types.ts`. Key ones:

- `Exercise` (library entry): `id, name, load: 'pair' | 'single' | 'bodyweight', sets, repMin, repMax, restSec, cue, demo, substitutes[], startWeightLb, perSide`.
- `Program.days[]`: ordered `exerciseIds` with an optional per-day override of sets/reps.
- `SessionRecord`: `{ id, dayId, startedAt, endedAt?, completed, exercises: [{ exerciseId, name, load, weightLb, reps[] }] }`. History is upserted after every logged set, so an abandoned session still counts.

## Session engine (pure, tested)

`src/engine/session.ts` is a reducer over `SessionState` with no I/O. Time-based transitions are not side effects: every timed phase stores an absolute `endsAt` timestamp, and a pure `settle(state, now)` function rolls the state forward through any expired timers (warm-up step → next step → ready → working; rest → working). Views render `settle(state, now)` on a 250 ms tick; dispatches apply `reduce(settle(state, now), action, now)` and write the whole state back. This means:

- TV and phone never disagree: both derive the same phase from the same timestamps.
- No client "owns" the timer. Either can be closed and reopened.
- Pause stores `remainingMs` and resume recomputes `endsAt`.

Phases: `idle → warmup(step) → ready → [working → logging? → rest]* → summary`. One tap per set: on the remote the rep picker is shown during `working`, so tapping a number both ends the set and logs it. `logging` exists for the voice path ("done", then a number). The rest before a new exercise is the "get ready" screen: it shows the next exercise, weight, plate change and demo, and is extended by `rerackBonusSec` when the plate loading differs from what is on the bars. `ready` is only used at the start of the session and after a substitution or skip.

Planning (`src/engine/plan.ts`) turns a program day + history + inventory into a `SessionState` with a prescribed weight and plate loading per exercise. This runs on whichever device starts the session.

## Progression

`src/engine/progression.ts`. For each exercise, find the most recent session containing it. If the first set reached `repMax`, prescribe the next achievable weight above the one used (one plate step, whatever the inventory makes that). Otherwise repeat the weight. If there is no next achievable weight, keep the weight and set `maxedOut: true`, which the TV shows plainly and the summary repeats. If the previous weight is no longer buildable (inventory changed), snap to the nearest buildable weight at or below it. No history → `startWeightLb` snapped to the inventory. Bodyweight exercises carry reps only. There is deliberately no automatic deload (see DECISIONS.md).

## Plate-loading model

`src/engine/plates.ts`. Inventory = handle weight, collar weight, collars per handle, number of handles, and a list of `{ lb, count }` plate types. A dumbbell is loaded symmetrically, so a *loading* is the multiset of plates on one end. The two dumbbells of a pair share the pool and must match, so a pair loading consumes 4 × the per-end plates; a single dumbbell consumes 2 ×. Achievable loadings are found by enumerating per-end counts up to `floor(count / endsInUse)` for each plate type (tiny search space), computing `handle + collars + 2 × perEnd`, and de-duplicating by weight, preferring fewer plates. From that list we derive: `achievableWeights`, `snap` (nearest buildable), `nextStep` (next heavier or `null` at the ceiling), and `loadingFor(weight, preferLike)` which, when several plate combinations give the same weight, picks the one closest to what is currently on the bar. `rackFor` produces the per-handle picture the TV draws (for a single-dumbbell lift it says whether the second handle must be stripped), and `rackDiff` describes the change to make during rest.

## Sync and pairing

Live state is one node, `live`, written whole on every action. Both clients subscribe to it. Conflicts are practically impossible with one user; the last write wins.

Pairing: the TV generates a 4-letter code, writes `pairings/CODE = { tvHid }` and listens on it. The remote enters the code (or opens the URL with `?pair=CODE`), reads `tvHid`, and answers with `phoneHid`: if the phone already has a household (existing history) that wins and the TV adopts it; otherwise the phone adopts the TV's. Both store the hid in `localStorage`, the pairing node is deleted, and from then on nothing is typed on either device again. In local mode both tabs simply share the same household.

Phone lock: the remote requests a Screen Wake Lock during a session, and Firebase resubscribes on reconnect, so the state is current the moment the screen comes back.

## Pages

`/tv` (display only), `/remote` (controls), `/history`, `/settings`. Hash-free path routing by hand; Firebase Hosting rewrites everything to `index.html`. PWA manifest and a small service worker make the remote installable.

## Voice (optional, last)

`src/voice/useVoice.ts` wraps the Web Speech API on the TV page behind a toggle in settings. It recognises "done", a number, "skip", "show me again", "pause", "go" and dispatches the same actions as the remote.
