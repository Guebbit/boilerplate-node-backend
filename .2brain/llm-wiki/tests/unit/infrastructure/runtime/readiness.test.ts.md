---
source: tests/unit/infrastructure/runtime/readiness.test.ts
sha256: db2789f0e79618f0a88442533dbde8ed8d5d2457837a39aee946d7fcfb456f48
generated_at: 2026-09-27T16:10:12.018553+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/readiness.test.ts

## Purpose
Unit tests for the `isServerReady` gate that backs the `GET /readyz` endpoint. The file verifies the four-state readiness contract (booting → listening → draining) against the database connection state, ensuring the readiness phase never regresses once a transition has occurred.

## Key elements
- **`withReadyState(state: number)`** — Test-local helper that sets `connection.readyState` via `Object.defineProperty`, allowing tests to simulate database connection states without opening a real connection. Mirrors the same helper found in `dependency-health.test.ts`.
- **`describe('isServerReady')`** — Single test suite with four sequential cases covering:
  - Booting (not yet listening) → `false`, even with DB up
  - Listening + DB connected → `true`
  - Listening + DB down → `false`
  - Draining (after listening) → `false`, and permanently (no return to ready)

## Relationships
- **`src/infrastructure/runtime/readiness.ts`** — The module under test. The file imports and exercises `isServerReady`, `markServerListening`, and `markServerDraining`.
- **`src/infrastructure/runtime/database.ts`** — Provides the `connection` object whose `readyState` property the tests manipulate to simulate DB up/down without a live connection.

## Notes
- **Test ordering is load-bearing.** `phase` is module-level mutable state in `readiness.ts` with no reset export. The first test ("is false before the process is marked listening") must run before any subsequent test calls `markServerListening` or `markServerDraining`, because it asserts the module's true initial state. There is intentionally no `beforeEach` reset—production never moves a phase backwards, so a reset was deemed unnecessary. Reordering these `it` blocks or adding parallelism will silently break the first assertion.
- **No database is opened.** All DB-state simulation goes through `withReadyState`, which overwrites `readyState` as a plain value property on the existing `connection` object.
