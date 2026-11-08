---
source: tests/unit/infrastructure/runtime/readiness.test.ts
sha256: db2789f0e79618f0a88442533dbde8ed8d5d2457837a39aee946d7fcfb456f48
generated_at: 2026-11-08T10:23:55.278326+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/readiness.test.ts

## Purpose

Unit tests for the `isServerReady` state machine in `readiness.ts`, which backs the `GET /readyz` endpoint. The file verifies the four-phase lifecycle (booting → listening → draining) and that readiness never regresses once draining is entered.

## Key elements

- **`withReadyState(state)`** — local helper that overrides `connection.readyState` via `Object.defineProperty` so tests can simulate DB connection states (0 = disconnected, 1 = connected) without opening a real database. Same pattern used in `dependency-health.test.ts`.
- **`describe('isServerReady')`** — four ordered tests covering: booting (not ready even with DB up), listening + DB connected (ready), listening + DB disconnected (not ready), and draining (permanently not ready).

## Relationships

- **`src/infrastructure/runtime/readiness.ts`** — the module under test. Provides `isServerReady()`, `markServerListening()`, and `markServerDraining()`. The `phase` variable is module-level state with **no reset export**, which dictates test ordering.
- **`src/infrastructure/runtime/database.ts`** — source of the `connection` object. Tests mutate only its `readyState` property; no actual database is opened.

## Notes

- **Ordering is load-bearing.** The "booting" test must run first in the file because `phase` is module-level state with no reset function. Any test that calls `markServerListening` or `markServerDraining` before it would destroy the initial state. Do not reorder the `it` blocks.
- The header comment explicitly documents *why* no reset was added: in production the phase never moves backwards, so a reset would serve no real use case.
- `withReadyState` uses `{ value, configurable: true }` without `writable`, meaning each call redefines the property rather than assigning it. Subsequent calls in the same test overwrite the descriptor.
