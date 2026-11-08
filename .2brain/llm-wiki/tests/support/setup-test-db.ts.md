---
source: tests/support/setup-test-db.ts
sha256: 0b44ea2b8ef7c77a21bce051a31b9cf0a96091a3a302ca04783d1d19d39806a7
generated_at: 2026-11-08T10:00:13.452094+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-test-db.ts

## Purpose

A single-function helper that wires up the MongoDB lifecycle for any test suite that persists data. It gives each `it()` a dedicated, empty database on the shared in-memory mongod so tests can assert absolute document counts without depending on execution order. It also ensures background outbox event-relay passes finish before the next test starts.

## Key elements

- **`setupTestDb()`** (default and only export) — registers four Jest hooks:
  - `beforeAll(connect)` — opens the test connection.
  - `beforeEach(clearAll)` — wipes every collection so each test starts from an empty database.
  - `afterEach(settleOutboxNudges)` — waits for in-flight outbox relay passes to complete.
  - `afterAll(() => settleOutboxNudges().then(disconnect))` — final drain, then closes the connection.

## Relationships

- **`src/kernel/outbox.ts`** — imports `settleOutboxNudges`, the function that awaits pending event-relay passes. Called in both `afterEach` and `afterAll`.
- **`./database`** (sibling module) — imports `connect`, `disconnect`, and `clearAll` for the in-memory mongod lifecycle.
- **All listed test files** (access, account contract/integration suites) — each calls `setupTestDb()` at the top level of its file to obtain the per-test empty-database guarantee before writing its own `describe` blocks.

## Notes

- Must be called at the **top level** of the test file, not inside a `describe`. Hooks registered inside a `describe` only scope to that block, leaving tests outside it without the connection or wipe.
- `settleOutboxNudges` is declared as `afterEach` **before** any file-level `afterEach` (e.g. `resetDomainEvents`) because jest-circus runs `afterEach` hooks in declaration order; the drain must complete while listeners are still registered.
- It deliberately **seeds no data**. Tests are expected to create their own fixtures via the owning module's `tests/factories.ts`, keeping each case's dependencies self-evident.
- The per-test `deleteMany` cost is negligible against an in-memory server; the trade-off is eliminating order-dependent failures when tests are reordered or run in isolation.
