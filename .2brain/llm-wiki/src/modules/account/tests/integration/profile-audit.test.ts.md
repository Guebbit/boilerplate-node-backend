---
source: src/modules/account/tests/integration/profile-audit.test.ts
source_sha256: 7ffc45311b74bae35d5e91a3932b4c44efc90997980295966e88062e2b8db1bf
context_sha256: 03214abbd86572f7b3b2cc903f3d620cc0ad8a11323adcf7d590d9dd4afe0839
generated_at: 2026-11-22T03:58:50.109853+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/profile-audit.test.ts

## Purpose
Integration test checking what the `AUTH_PROFILE_UPDATED` audit event records when a user edits their own profile. According to the module docblock, preference changes are recorded by value, an email change by name only, and the audit collection is never scrubbed on erasure. The one test in the file covers the preference-change case.

## Key elements
- **`jest.mock('@infrastructure/observability/audit', ...)`**: replaces the audit port wholesale with `auditPortMock()` from `@tests/ports`, loaded through `jest.requireActual`. It is not a spy.
- **`setupTestDb()`**: sets up the test database.
- **`afterEach(() => jest.restoreAllMocks())`**: restores mocks after each test.
- **Test "records the preference change with its values, and names no email"**:
  - Calls `observePort(auditPort.emitAuditEvent)` to capture emitted events.
  - Creates a verified user (`owner@example.com`) with `createUser`.
  - Calls `accountService.updateProfile(user.id, { locale: 'it' }, testCallerContext)`.
  - Finds the emitted entry whose `action` is `accountAuditActions.AUTH_PROFILE_UPDATED`.
  - Asserts that `metadata` equals `{ changes: { locale: { from: 'en', to: 'it' } } }`.

## Relationships
- `src/infrastructure/observability/audit.ts`: provides `emitAuditEvent`, which is mocked here and observed.
- `src/modules/account/audit.ts`: provides the `accountAuditActions` export, used to pick the audit row by its action.
- `src/modules/account/services/index.ts`: provides the `accountService` export, the code under test.
- `src/modules/users/tests/factories.ts`: provides `createUser` to seed the test user.
- `tests/support/callers.ts`: provides `testCallerContext`, passed as the caller.
- `tests/support/ports.ts`: provides `observePort` and `auditPortMock`.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.

## Notes
- The test name says no email is named, but the assertion only checks that `metadata` equals the locale change. The email-change and erasure cases mentioned in the docblock are not exercised in this file.
- The source comment says the audit port is "replaced, not spied on". The reason is documented in `tests/support/ports.ts`.
