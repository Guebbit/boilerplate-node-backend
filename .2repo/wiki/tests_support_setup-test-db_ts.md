# tests/support/setup-test-db.ts

## Purpose

Registers Mongoose connection and per-test database clearing hooks for any test suite that touches MongoDB. It exists so every test starts against a guaranteed-empty database, letting assertions use absolute counts instead of relative deltas, and eliminating order-dependent failures.

## Key elements

- **`setupTestDb()`** — the sole export. Calls `beforeAll(connect)`, `afterAll(disconnect)`, and `beforeEach(clearAll)`, all imported from `./database`. Intended to be invoked once at the **top level** of a test file (outside any `describe`).

## Relationships

- **`./database`** (sibling in `tests/support/`) — provides the `connect`, `disconnect`, and `clearAll` primitives that `setupTestDb` wraps into Jest lifecycle hooks.
- **~15 test files across modules** (`account`, `audit-logs`, `cart`, `delivery`, `feedback`) — each calls `setupTestDb()` at the top level to inherit the connect/clear/disconnect lifecycle. No module-specific logic lives here; all callers get identical behavior.

## Notes

- **Top-level only.** Calling `setupTestDb()` inside a `describe` block scopes the hooks to that block; the file's own docstring warns against this.
- **No seeding.** The file deliberately does not insert fixture data. Tests that need documents are expected to create them via the module's `tests/factory.ts`, keeping fixtures visible in the test body.
- **Per-test wipe, not per-file.** `beforeEach(clearAll)` runs a `deleteMany` per collection before every `it()`. This is a deliberate trade-off: microseconds of overhead on an in-memory mongod in exchange for eliminating any dependency on test execution order.
- **Shared mongod.** All suites in a run share one in-memory mongod instance; this file does not start or configure the server itself — that responsibility belongs to `./database`.
