---
source: tests/support/setup-test-db.ts
sha256: 0b44ea2b8ef7c77a21bce051a31b9cf0a96091a3a302ca04783d1d19d39806a7
generated_at: 2026-10-15T13:01:57.116031+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-test-db.ts

## Purpose

Jest lifecycle-hook installer for any test suite that uses the in-memory MongoDB. Call `setupTestDb()` once at the **top level** of a test file (not inside a `describe`) to get a fresh, empty database for every `it()` and to guarantee background event-delivery passes are drained before the next test or teardown runs.

## Key elements

- **`setupTestDb()`** — the sole export. Registers four hooks:
  - `beforeAll(connect)` — connects the shared in-memory mongod.
  - `afterEach(settleOutboxNudges)` — waits for any in-flight event relay passes to finish before the next test starts.
  - `afterAll(() => settleOutboxNudges().then(disconnect))` — final drain, then disconnects.
  - `beforeEach(clearAll)` — wipes every collection so each test starts from an empty DB.

## Relationships

- **`src/kernel/outbox.ts`** — provides `settleOutboxNudges`, the function that blocks until background event-delivery passes complete. Called in `afterEach` and `afterAll`.
- **`./database`** (sibling in `tests/support/`) — provides `connect`, `disconnect`, and `clearAll` used by the hooks.
- **Consumer test files** (e.g. `src/modules/account/tests/contract/*.test.ts`, `src/modules/account/tests/integration/*.test.ts`) — call `setupTestDb()` at module top level to inherit the connect/clear/drain/disconnect cycle.

## Notes

- Must be called at **top level**, not inside a `describe`. If nested, the hooks only wrap that block and the outer file's tests run without isolation.
- `settleOutboxNudges` is declared in `afterEach` **before** any file-level `afterEach` that unregisters event listeners, because jest-circus runs `afterEach` hooks in declaration order. Reordering can let a relay pass write into the next test's DB or touch a disconnected client.
- The file deliberately **seeds nothing**. Tests that need fixture data should create it via their module's `tests/factories.ts` so dependencies are visible in the test body.
- Per-test `clearAll` (a `deleteMany` per collection) is the intended trade-off: it eliminates order-dependent failures at negligible cost on an in-memory server.
