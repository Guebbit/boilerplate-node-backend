---
source: tests/integration/persistence/conditional-status.test.ts
sha256: 3b7e05f8687b0de82fe7cfd34fb4898ebbefb2d08e8d081e6ec00b009b89ffbb
generated_at: 2026-10-29T07:00:02.881725+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/conditional-status.test.ts

## Purpose

Integration test for `updateStatusIfIn` that exercises the function against a real MongoDB instance. It exists because the core guarantee — that two racing conditional writes can both succeed at the application layer but only one wins at the storage engine — is a property of mongod's write path, which a mocked Mongoose connection cannot reproduce.

## Key elements

- **`ProbeDocument`** — minimal interface (`status`, `scope`, `stampedAt?`) that serves as the only schema in this file; not a domain model.
- **`probeModel`** — a Mongoose model registered on the test database, used solely to back the three test cases.
- **`describe('updateStatusIfIn')`** — three tests:
  - *Race:* fires two concurrent `updateStatusIfIn` calls via `Promise.all`; asserts exactly one resolves truthy and the stored status is the target.
  - *Stamp:* passes a `set` payload (`stampedAt`) and verifies the returned document reflects both the new status and the stamped field in one atomic write.
  - *Non-match:* verifies the function resolves `null` when the current status is outside the allowed list, or when a scope filter excludes the document.

## Relationships

- **`src/infrastructure/persistence/conditional-status.ts`** — the system under test; provides `updateStatusIfIn(model, filter, allowedStatuses, targetStatus, extra?)` which performs a single conditional `findOneAndUpdate`.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`; called once at module top-level to spin up (or connect to) a real MongoDB instance before the test suite runs.

## Notes

- `setupTestDb()` is invoked at **module scope** (not inside `beforeAll`), matching the convention across the integration test directory.
- The race test depends on genuine concurrency at the mongod level; running it against an in-memory or mocked driver would invalidate the assertion.
- The probe collection is disposable — no cleanup fixture is needed because `setupTestDb` (per its contract) isolates the database per run.
