# Direction

Where Dumbbell Coach is going, written for whoever picks up the next piece of work (human or agent). Read `README.md`, `ARCHITECTURE.md` and `DECISIONS.md` first; this file is about intent, not mechanics.

## The model: self-hosted, personal, open source

- There is no central service and there never will be. Each install is one person or one household running their own copy: their own Firebase project (Spark free tier) or local mode, their own hosting URL, their own data. Nothing phones home.
- The app stays open source. Docs are a first-class deliverable: a setup guide a non-developer can follow, and contributor docs for the code.
- Scale is a household, not the internet. Design for one TV, a couple of phones, and a few people who share the same equipment. Do not add accounts, billing, admin panels or anything that assumes strangers.
- The core stays what it is: a TV screen that drives the session and a phone that is the only thing you touch. Features must lower the effort of starting and finishing a workout, or make the numbers more useful. Nothing gimmicky (see `DECISIONS.md`).

## Constraints that shape everything

- Firebase Spark cannot run server code (Cloud Functions need the pay-as-you-go plan) and Hosting serves static files only. So there is no backend of ours anywhere. The Realtime Database *is* the API; its security rules are the schema layer; all logic runs on the user's devices or on the user's own machine.
- The engine (`src/engine/*`) is pure TypeScript with tests and must stay that way. Anything that reasons about the data (planning, progression, records, stats, forecasts, body trend, nutrition) belongs there, never in a component and never in an agent.
- The storage layer is the six-method `Backend` interface (`get/set/update/remove/subscribe/now`). Local mode and Firebase are the two implementations today; any future storage (IndexedDB, a sync log) goes behind the same interface.

## Next: several people per install

Charlie and his girlfriend share the plates but not the training. Model this as *members* of a household:

- Shared at household level: equipment, pairing, the single live session (with a `memberId` so the TV can say whose it is), and probably the exercise library.
- Per member: program (days and overrides), settings, sessions, body weight, profile.
- The phone's home screen gets a member switcher; the chosen member is remembered per device. The TV follows the live session.
- Migration: existing data moves under a default member. Backup/restore must round-trip members.
- Members are not a security boundary. People who share a household id share everything; that is fine for people who share a home.

## Agent access

Goal: an agent can be told "here is my equipment, here are my goals, here is what happened in the last month" and propose a program, swaps, rest changes, demo videos, plate purchases, and import old logs, so nobody has to hand-cultivate a program as they go.

Shape:

1. **A plain TypeScript API package first.** Schema for the data model (JSON Schema or zod), validation (exercise ids exist, weights snap to the inventory, rep ranges are sane), and operations over a household: read program/history/equipment/forecasts/trend; propose program; import sessions; log body weight. It imports the engine. This is the real API; everything else adapts it.
2. **A CLI adapter.** Runs on the user's machine with the user's credentials (Firebase service-account JSON or a signed-in token, or the local export file). Any agent that can run commands, including Claude Code, can use it as-is. Also useful for scripts and backups.
3. **An MCP adapter over the same operations**, for chat clients that speak MCP. Keep it thin: a handful of tools with tight descriptions and structured outputs, stdio transport, local only. If MCP falls out of favour the API and CLI survive untouched.

Rules for agents, enforced by the API rather than by prompting:

- Agent proposes, engine validates, user approves. Program changes are presented as a diff and written only on approval.
- The agent never sets a session's weight or reps. Progression stays rule-based in the engine; agents change exercises, rules and plans, not today's numbers.
- Reads are broad, writes are narrow and validated. No raw writes to `live`.
- Demo videos: prefer a curated exercise library with licence-clean media that the agent maps exercises onto; YouTube ids remain a per-exercise override, not the source of truth.

## Units

Display is a toggle (lb/kg), but the engine must be unit-agnostic: the inventory declares its unit (2.5 kg plates are a real thing), the engine works in whatever unit the inventory is in, and display converts only when the chosen display unit differs. Store numbers with their unit; never convert on write.

## Local-first (direction to evaluate, not a decision)

The data is small, personal, mostly append-only and keyed sensibly (sessions by id, readings by date), which is the easy case for local-first. The intended path if pursued:

1. Make the local store (IndexedDB) the primary store on every device, so the app works fully offline and Firebase becomes an optional sync relay rather than the source of truth.
2. Make records mergeable: ids, `updatedAt` on every document, tombstones for deletes, last-writer-wins per document. No CRDT library needed at this scale.
3. Keep `live` and `demoPlayback` as ephemeral real-time channels, not replicated documents; they are coordination signals between two screens.
4. Same-network TV/phone sync without any cloud is a later stretch goal.

## Open questions for Charlie

- Is the exercise library shared across members, or copied per member?
- Can two members train in the same session (taking turns on the same handles), or is it strictly one live session for one member?
- Which unit should be canonical for the default data, given the seed program is in pounds?
- Is a curated open exercise library (with its media licences) acceptable, or should demos stay bring-your-own?

## State of the code (Sep 2026)

`main` is the original scaffold plus demo/scrubber work. Branch `fable/feature-pass` holds one commit per feature awaiting review: undo/edit/notes, PRs and rep targets, progression rule and stall advisory, History overview with weekly grid, muscle balance and records, Plates forecasts and upgrade simulator, body-weight trend, nutrition targets, TV day strip and keyboard control, phone vibration. `DECISIONS.md` entries 22–39 explain those calls.
