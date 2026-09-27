---
source: src/infrastructure/runtime/readiness.ts
sha256: ed50d7b2e90f04dc3746530c95cac16dd340d2c7e8ce97dc1109ad9d8ea59890
generated_at: 2026-09-27T14:15:32.201362+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/readiness.ts

## Purpose

Holds the single mutable state that `GET /readyz` reads to decide whether this process should receive traffic. It tracks a one-way lifecycle phase (booting → listening → draining) and, on the ready check, also verifies the Mongoose connection is live. It is the *read* side of process readiness; `server-lifecycle.ts` owns the *sequencing* of shutdown steps and does not itself expose queryable state.

## Key elements

- **`ServerPhase`** (local type) — Union `'booting' | 'listening' | 'draining'`. The phase only ever advances; no export.
- **`phase`** (module-level `let`) — Current phase. Initialized to `'booting'`; mutated only by the two `mark*` functions.
- **`markServerListening()`** — Sets phase to `'listening'`. Called once by `createApp()` in `src/app.ts` after `listenOn` resolves.
- **`markServerDraining()`** — Sets phase to `'draining'`. Called once by `registerSignalHandlers` in `server-lifecycle.ts` before teardown begins, so a load balancer stops routing before connections are cut.
- **`isServerReady()`** — Returns `true` only when `phase === 'listening'` **and** `connection.readyState === mongoose.ConnectionStates.connected`. Both `booting` and `draining` short-circuit to `false` regardless of DB state. Performs no I/O beyond a synchronous Mongoose property read.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Provides the `connection` instance whose `readyState` is checked inside `isServerReady()`.
- **`src/app.ts`** — Invokes `markServerListening()` once the server is accepting connections.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Invokes `markServerDraining()` at the start of its shutdown sequence.
- **`src/app/system-routes.ts`** — The `GET /readyz` handler that calls `isServerReady()` (the sole consumer of the readiness state).
- **Tests** — `tests/unit/infrastructure/runtime/readiness.test.ts` exercises the phase transitions and DB-readiness gate; `tests/integration/app-health.test.ts` and `tests/contract/system.test.ts` hit the `/readyz` endpoint end-to-end; `tests/fuzz/endpoints.fuzz.test.ts` includes readiness endpoints in its fuzz surface.

## Notes

- The phase transition is strictly one-directional. There is no reset or reverse path; once `draining`, it stays `draining`.
- `isServerReady()` is intentionally synchronous and side-effect-free (one property read on the Mongoose connection). Do not add async logic here without also updating the contract tests that assume a synchronous call.
- The file deliberately has no `export` of the `phase` variable itself; all external mutation goes through the two `mark*` functions, keeping the state machine's invariants in one place.
