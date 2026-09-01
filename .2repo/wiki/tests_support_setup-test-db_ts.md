# tests/support/setup-test-db.ts

## Purpose

Registers Jest lifecycle hooks (`beforeAll` / `afterAll` / `beforeEach`) that connect to the run's shared in-memory mongod and wipe every collection before each test case. It exists so that any suite touching Mongo gets an isolated, empty database per `it()` without each test file repeating the boilerplate.

## Key elements

- **`setupTestDb`** (the sole export) — a zero-arg function that calls:
  - `beforeAll(connect)` — opens the connection to the in-memory mongod.
  - `afterAll(disconnect)` — closes it after the suite finishes.
  - `beforeEach(clearAll)` — deletes all documents in all collections before every test, guaranteeing absolute-count assertions.
- Imports `connect`, `disconnect`, `clearAll` from `./database`.

## Relationships

- **`./database`** (sibling in `tests/support/`) — provides the three primitives (`connect`, `disconnect`, `clearAll`) that `setupTestDb` wires into Jest hooks.
- **Consumer test files** across `src/modules/{account,audit-logs,cart,delivery,feedback}/tests/` — every contract, integration, and service test file in those modules imports and calls `setupTestDb()` at the top level of the file to obtain the described lifecycle.

## Notes

- **Call at top level only.** The function registers hooks via bare `beforeAll` / `beforeEach`. If invoked inside a `describe` block, the hooks wrap only that block; the JSDoc explicitly warns against this.
- **No seeding.** By design `setupTestDb` inserts nothing. Tests that need data must create it locally (typically via a module's `tests/fixtures.ts`), keeping each case self-contained.
- **Per-test clearing, not per-file.** The `deleteMany` cost is microseconds against an in-memory server but eliminates order-dependent failures (e.g., a passing suite that breaks when a case is inserted above another, or when run via `it.only`).
- **In-memory mongod assumption.** The implementation expects a single shared in-memory instance for the entire run; it does not manage the mongod process itself (that is presumably handled by a global Jest setup or the `./database` module).
