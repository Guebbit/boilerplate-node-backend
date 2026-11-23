---
source: src/infrastructure/runtime/readiness.ts
source_sha256: 410f988f15ecfd838ce3d03f72bd81d5cbc61a9977fe1880e89e5e2faf598409
context_sha256: 0d61313c20279269bdbacd423cd7b0ee0008eacd989a21e3b2a04ddbf0d4060c
generated_at: 2026-11-22T03:07:11.122731+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/readiness.ts

## Purpose
Holds the single piece of process-lifecycle state that `GET /readyz` reads: whether the process is still booting, is listening, or has started draining for shutdown. It also reports whether the database is reachable. It is separate from `server-lifecycle.ts`, which sequences the stop steps but has no queryable state. This file is the synchronous read side for HTTP handlers, with no I/O beyond a Mongoose property read.

## Key elements
- `ServerPhase` (internal type): `'booting' | 'listening' | 'draining'`. The phase only moves forward, and the module-level `phase` starts at `'booting'`.
- `markServerListening()`: moves `booting` to `listening`. It does nothing in any other phase, so a late-finishing boot cannot revert a draining process to ready.
- `markServerDraining()`: sets the phase to `draining` unconditionally. After this, `GET /readyz` answers 503.
- `isServerDraining()`: returns whether a shutdown signal has arrived (the phase is `draining`).
- `isServerReady()`: returns whether the phase is `listening` and `connection.readyState` equals `mongoose.ConnectionStates.connected`. This is the whole decision behind `/readyz`.

## Relationships
- `src/app.ts`: `createApp()`'s `start` calls `markServerListening` once, right after `listenOn` resolves.
- `src/infrastructure/runtime/server-lifecycle.ts`: `createShutdownHandler` calls `markServerDraining` before teardown starts.
- `src/infrastructure/runtime/database.ts`: supplies the Mongoose `connection` whose `readyState` `isServerReady` checks.
- `src/infrastructure/http/middlewares/connection-close.ts`: `closeWhileDraining` calls `isServerDraining` on each response to tell clients not to reuse their connection.
- `src/app/system-routes.ts`: the `/readyz` handler is the consumer of `isServerReady`. The file's own doc comment names `GET /readyz` as its reader, but the import itself is not shown here.
- Tests: `tests/unit/infrastructure/runtime/readiness.test.ts` tests this file directly. The other listed tests (contract, fuzz, integration, SSE, connection-close, shutdown-signal) are graph neighbors, and this file does not show how they use it.

## Notes
- Draining is sticky. `markServerListening` ignores any call made after a shutdown signal, so `/readyz` cannot return 200 on a closing process.
- The listener stays open for `NODE_SHUTDOWN_DELAY_MS` after draining begins, so probes can see the 503.
- `isServerReady` is false in both `booting` and `draining`, whatever the database state. A load balancer therefore sees both ends of the lifecycle.
- The state is a module-level variable, so there is one phase per process, and there is no reset function in this file.
