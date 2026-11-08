---
source: src/modules/users/tests/integration/update-audit.test.ts
sha256: c02282e6d2b3b9393370c4ec4b369b6af2cb3773252018c3fb6fd5dede3dee1e
generated_at: 2026-11-08T08:58:08.056691+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/update-audit.test.ts

## Purpose
Integration test verifying what the `ADMIN_USER_UPDATED` audit event records when an admin edits a user: non-sensitive fields (e.g. `locale`) are captured by value, while personal identifiers (`username`, `phone`, `email`) appear only as field names in `changedFields`. This guards against leaking PII into the audit collection, which is never scrubbed on user erasure.

## Key elements
- **`metadataOf(spy, action)`** — helper that extracts the `metadata` object from the single `emitAuditEvent` call matching a given `action` string.
- **`describe('userService.updateById — the audit row of an admin edit')`** — the test suite.
  - *records the locale by value and the personal fields by name* — asserts `metadata.changes` contains `{ locale: { from, to } }` and `changedFields` lists `['username', 'phone']` (no values).
  - *writes nothing for a value sent unchanged, or a phone cleared that was never set* — asserts `metadata` is `{}` when no field actually changed.

## Relationships
- **`@modules/users/services`** — under test; `userService.updateById` is the function being audited.
- **`@modules/users/audit`** — provides `usersAuditActions.ADMIN_USER_UPDATED`, the action constant matched in assertions.
- **`@infrastructure/observability/audit`** — the real audit port module; fully replaced via `jest.mock` with `auditPortMock()` from `@tests/ports` so no events are emitted to real sinks.
- **`@tests/ports`** — supplies `auditPortMock()` (the replacement factory) and `observePort()` (wraps a port function in a jest spy for the test).
- **`@tests/callers`** — `callerContextAs('admin')` fabricates the authenticated-caller context passed to the service.
- **`@modules/users/tests/factories`** — `createUser` seeds a known user row in the test database.
- **`@tests/setup-test-db`** — `setupTestDb()` initialises the test database once at module load.

## Notes
- The audit port is **replaced** (via `jest.mock`), not merely spied on, so the real `emitAuditEvent` never runs. Use `observePort` to obtain a spy on the mock.
- `setupTestDb()` is called at module scope (outside `describe`); `afterEach` only restores mocks, never tears down the DB.
- The assertion style is a single `toEqual` on the whole `metadata` object — if the service adds a new key to the audit payload, both tests will fail and must be updated intentionally.
