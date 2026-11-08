---
source: tests/integration/persistence/conditional-status.test.ts
sha256: 3b7e05f8687b0de82fe7cfd34fb4898ebbefb2d08e8d081e6ec00b009b89ffbb
generated_at: 2026-11-08T09:44:25.191849+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/conditional-status.test.ts

## Purpose

Integration test for `updateStatusIfIn` that runs against a real MongoDB instance. It exists because the critical guarantee—only one of two racing filtered writes can succeed—depends on mongod's atomicity semantics, which a mock cannot exercise.

## Key elements

- **`ProbeDocument`** — minimal inline interface (`status`, `scope`, optional `stampedAt`) that models the smallest document shape the function needs to operate on.
- **`probeModel`** — a Mongoose model (`'ConditionalStatusProbe'`) defined in-file solely for these tests; avoids coupling to application schemas.
- **`describe('updateStatusIfIn')`** — three cases:
  - *Race*: fires two concurrent `updateStatusIfIn` calls via `Promise.all`; asserts exactly one resolves truthy and the stored status is `'paid'`.
  - *Atomic set*: passes a `set: { stampedAt }` modifier; asserts the returned row reflects both the new status **and** the new stamp in a single read.
  - *Non-match*: verifies the function resolves to `null` when the current status is outside the allowed list, or when the filter's `scope` doesn't match.

## Relationships

- **`src/infrastructure/persistence/conditional-status.ts`** — the module under test; imports and exercises `updateStatusIfIn` (accepts a model, filter, allowed-statuses array, target status, and an optional Mongoose update modifier).
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module top-level to spin up (or connect to) a real mongod for the test process.

## Notes

- The test deliberately uses a real database, not an in-memory mock, because the concurrency guarantee is a server-side atomicity property.
- `setupTestDb()` is invoked unconditionally at the top of the file (outside any `beforeAll`), so it must be idempotent across test runs in the same process.
- The model name `'ConditionalStatusProbe'` is specific; if other test files register the same name, Mongoose will throw. Keep it unique.
