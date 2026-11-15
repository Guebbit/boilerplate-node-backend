---
source: src/modules/account/tests/integration/profile-audit.test.ts
sha256: 7ffc45311b74bae35d5e91a3932b4c44efc90997980295966e88062e2b8db1bf
generated_at: 2026-11-14T19:07:15.568893+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/profile-audit.test.ts

## Purpose

Integration test that verifies the `AUTH_PROFILE_UPDATED` audit event records preference changes by value (from → to) while deliberately omitting any email address from the audit metadata. It exists to lock in the privacy contract of own-profile edits: sensitive fields are never persisted into the audit trail.

## Key elements

- **Module doc comment** — States the two invariants under test: preferences are audited by value, email is never included, and the audit collection is never scrubbed on erasure.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the entire audit port module with `auditPortMock()` from `tests/support/ports.ts`. The port is *replaced*, not spied on.
- **`setupTestDb()`** — Initialises the integration-test database before any test runs.
- **`describe('accountService.updateProfile — the audit row of an own edit')`** — Single test case that calls `accountService.updateProfile` with a `locale` change and asserts the emitted audit row's `metadata` equals `{ changes: { locale: { from: 'en', to: 'it' } } }`, confirming no email field is present.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — The real audit port whose `emitAuditEvent` is under observation; the module is fully mocked in this test.
- **`src/modules/account/audit.ts`** — Source of the `accountAuditActions` constants, including `AUTH_PROFILE_UPDATED`, used to identify the relevant audit row.
- **`src/modules/account/services/index.ts`** — Exposes `accountService`, whose `updateProfile` method is the system under test.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` to seed a verified user with a known email.
- **`tests/support/ports.ts`** — Supplies `observePort` (wraps a port method with a spy) and `auditPortMock` (the factory used in the mock replacement).
- **`tests/support/callers.ts`** — Provides `testCallerContext`, the canned caller identity passed to `updateProfile`.
- **`tests/support/setup-test-db.ts`** — Initialises and tears down the test database schema.

## Notes

- The audit port is **replaced**, not spied on (see `tests/support/ports.ts`). This means no real I/O or side-effects from the observability layer can leak into the test.
- The module doc comment asserts the audit collection is **never scrubbed on erasure** — a deliberate design decision, not a bug. If you're looking for erasure logic, it intentionally excludes this collection.
- The test only covers the *own-edit* path (caller is the profile owner). Other caller contexts (admin, support) are not exercised here.
