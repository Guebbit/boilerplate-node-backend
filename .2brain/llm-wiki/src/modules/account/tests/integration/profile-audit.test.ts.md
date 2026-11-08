---
source: src/modules/account/tests/integration/profile-audit.test.ts
sha256: 78f0ac1dee6ccd1802cdb8367d9adba9d5ac2807bf619edc4a3bb25dc4909544
generated_at: 2026-11-08T04:40:12.315064+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/profile-audit.test.ts

## Purpose

Integration test asserting the shape of the `AUTH_PROFILE_UPDATED` audit row emitted when a user edits their own profile via `accountService.updateProfile`. It verifies that preference changes (e.g. `locale`) are recorded with `from`/`to` values while a changed email is recorded only by field name in `changedFields`, never with its value. The module doc also states the audit collection is never scrubbed on erasure.

## Key elements

- **`describe('accountService.updateProfile — the audit row of an own edit')`** — single test suite for the own-profile-edit audit path.
- **`jest.mock('@infrastructure/observability/audit', …)`** — fully replaces the audit port with `auditPortMock()` from `tests/support/ports.ts` (a port-swap, not a spy).
- **`setupTestDb()`** — initialises the integration-test database before the suite runs.
- **`afterEach(() => jest.restoreAllMocks())`** — restores any residual mocks after each test.
- **Test: "names the email when this call asked for a change, and never carries its value"** — calls `updateProfile` with a new email and `locale: 'it'`, then inspects the emitted audit row to confirm `metadata.changes` carries locale values and `metadata.changedFields` lists `'email'` without any email string.

## Relationships

- **`src/modules/account/services/index.ts`** — provides `accountService.updateProfile`, the function under test.
- **`src/modules/account/audit.ts`** — exports `accountAuditActions.AUTH_PROFILE_UPDATED`, used to locate the correct row in captured audit events.
- **`src/infrastructure/observability/audit.ts`** — the real audit port; replaced wholesale by the mock factory so no actual emission occurs.
- **`tests/support/ports.ts`** — supplies both `observePort` (to capture calls on the mocked port) and `auditPortMock` (the replacement implementation).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the DB used by this integration test.
- **`tests/support/callers.ts`** — `testCallerContext` provides the authenticated caller identity for the service call.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the user record that is then profile-edited.

## Notes

- The audit port is **replaced, not spied on**. The `jest.mock` factory calls `jest.requireActual('@tests/ports').auditPortMock()` to produce a full substitute. Do not add `jest.spyOn` against the real audit module in this file; follow the port-swap pattern from `tests/support/ports.ts`.
- Email values must never appear in audit `metadata`. Only the field name (`'email'`) is expected in `changedFields`. Locale and other preferences do carry `from`/`to` values. This distinction is the core assertion of the test.
- The "never scrubbed on erasure" claim lives only in the module doc comment; no test in this file exercises erasure/scrubbing logic.
