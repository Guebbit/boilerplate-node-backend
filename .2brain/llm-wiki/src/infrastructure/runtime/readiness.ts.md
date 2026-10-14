---
source: src/infrastructure/runtime/readiness.ts
sha256: 52029ca3aef8dc350a3b6c801b8d07a79f6d87fe138f12db105aa9b5061a6363
generated_at: 2026-10-14T08:14:55.343364+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/readiness.ts

## Purpose

Holds the single readiness state that `GET /readyz` reads: whether the process has finished booting, has begun draining for shutdown, and whether the Mongoose database connection is currently live. It is the synchronous, I/O-free read side of the server lifecycle — distinct from `server-lifecycle.ts`, which sequences the actual stop steps but exposes no queryable state.

## Key elements

- **`ServerPhase`** (private type) — Ordered union `'booting' | 'listening' | 'draining'`. The process only ever moves forward through these.
- **`phase`** (module-level `let`) — Current phase. Initialised to `'booting'`; mutable only via the two `mark*` functions.
- **`markServerListening()`** — Sets phase to `'listening'`. Called once by `createApp()` in `src/app.ts` immediately after `listenOn` resolves.
- **`markServerDraining()`** — Sets phase to `'draining'`. Called once by `registerSignalHandlers` in `server-lifecycle.ts` before teardown begins.
- **`isServerReady()`** — Returns `true` only when `phase === 'listening'` **and** `connection.readyState === mongoose.ConnectionStates.connected`. Used by the `/readyz` handler to decide 200 vs 503.

## Relationships

- **`src/app.ts`** — Calls `markServerListening()` as the final step of `createApp()`'s `start` flow.
- **`src/app/system-routes.ts`** — Defines the `GET /readyz` route whose handler calls `isServerReady()`.
- **`src/infrastructure/runtime/database.ts`** — Exports the shared `connection` instance whose `readyState` is checked inside `isServerReady()`.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Calls `markServerDraining()` in its signal-handler path; does not read readiness state itself.
- **`tests/integration/app-health.test.ts`** / **`tests/contract/system.test.ts`** / **`tests/fuzz/endpoints.fuzz.test.ts`** — Exercise the `/readyz` endpoint against various readiness states.
- **`tests/unit/infrastructure/runtime/readiness.test.ts`** — Unit-tests the three exported functions in isolation.

## Notes

- `markServerDraining` and the start of teardown happen in the same tick, so a health probe rarely observes the `draining` phase in practice — it is primarily a correctness guarantee for the window between signal receipt and the first socket close.
- Both `booting` and `draining` short-circuit `isServerReady()` to `false` regardless of DB state; the Mongoose check is only reached while `listening`.
- The module has no I/O of its own: the only external read is the Mongoose `readyState` property, which is in-memory.
