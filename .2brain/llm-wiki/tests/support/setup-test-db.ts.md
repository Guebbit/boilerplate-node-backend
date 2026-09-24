---
source: tests/support/setup-test-db.ts
sha256: 48895427c9f34236450d552c1da02025d2ccc6229fb9dc74f85bdfd9d2105f50
generated_at: 2026-09-23T20:14:08.915609+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-test-db.ts

## Purpose

Provides a one-liner test-setup function that wires up the shared in-memory MongoDB connection for any test suite that persists data. It ensures each test starts against an empty database so assertions can rely on absolute document counts.

## Key elements

- **`setupTestDb()`** (exported) — Registers three hooks: `beforeAll(connect)` to start the connection, `afterAll(disconnect)` to tear it down, and `beforeEach(clearAll)` to wipe every collection before each `it()`.
- **`connect`, `disconnect`, `clearAll`** — Imported from the sibling `./database` module; this file only composes them into lifecycle hooks.

## Relationships

- **`./database`** — Source of the three lifecycle functions; this file is a thin hook wrapper around them.
- **Test files across modules** (e.g. `access.test.ts`, `jwt.test.ts`, `oauth-link.test.ts`, `addresses.test.ts`, `api.contract.test.ts`, `api-keys.test.ts`) — Each calls `setupTestDb()` at the top level to gain the connect/clear/disconnect behavior without re-implementing it.

## Notes

- **Must be called at the top level of the test file**, not inside a `describe` block. Nesting it in `describe` scopes the hooks to only that block.
- **Per-test wiping, not per-file.** `beforeEach(clearAll)` guarantees each `it()` sees an empty DB, preventing order-dependent failures (e.g. a new test added above a sibling, or a single `it.only` run).
- **Intentionally seeds nothing.** Tests that need pre-existing data create it via their module's `tests/factories.ts`, keeping dependencies visible within the test case itself.
- The per-test `deleteMany` cost is negligible against an in-memory mongod.
