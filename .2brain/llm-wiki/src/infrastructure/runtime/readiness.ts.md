---
source: src/infrastructure/runtime/readiness.ts
sha256: 52029ca3aef8dc350a3b6c801b8d07a79f6d87fe138f12db105aa9b5061a6363
generated_at: 2026-11-08T03:47:38.477426+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/readiness.ts

## Purpose

Holds the single mutable process-lifecycle state (`booting → listening → draining`) and exposes a synchronous `isServerReady()` predicate that the `GET /readyz` handler calls to decide whether to accept traffic. It is deliberately split out of `server-lifecycle.ts` (which *sequences* shutdown steps) so that the HTTP read path has a tiny, I/O-free module it can import without pulling in the full teardown logic.

## Key elements

- **`phase`** (module-local, not exported) — a `ServerPhase` (`'booting' | 'listening' | 'draining'`) that starts at `'booting'` and only ever advances forward.
- **`markServerListening()`** — transitions `phase` to `'listening'`. Called once after the server starts listening.
- **`markServerDraining()`** — transitions `phase` to `'draining'`. Called once when a shutdown signal is received, before teardown begins.
- **`isServerReady(): boolean`** — returns `true` only when `phase === 'listening'` **and** the Mongoose connection `readyState` is `connected`. Both `booting` and `draining` short-circuit to `false` regardless of DB state.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — imported (`{ connection }`); `isServerReady` reads `connection.readyState` to confirm the database is reachable.
- **`src/app.ts`** — calls `markServerListening()` inside `createApp()`'s `start`, immediately after `listenOn` resolves.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — calls `markServerDraining()` inside `registerSignalHandlers`, before initiating teardown.
- **`src/app/system-routes.ts`** — the `GET /readyz` route handler calls `isServerReady()` synchronously (no I/O) to decide the 200/503 response.
- **Tests** — `tests/unit/infrastructure/runtime/readiness.test.ts` covers the phase transitions and readiness predicate; `tests/integration/app-health.test.ts` and `tests/contract/system.test.ts` exercise the endpoint end-to-end.

## Notes

- `phase` is module-scoped, not exported, so there is no way for consumers to read or mutate it directly — only the two `mark*` functions change it.
- Because `markServerDraining` is called in the same tick that teardown starts, a load-balancer probe will rarely observe the `draining` state; the practical effect is that the process simply disappears from the pool.
- The readiness check is a pure property read (Mongoose `readyState` is an in-memory integer); it does **not** open a new connection or run a query, keeping the handler latency negligible.
