---
source: src/modules/users/tests/integration/update-audit.test.ts
sha256: c02282e6d2b3b9393370c4ec4b369b6af2cb3773252018c3fb6fd5dede3dee1e
generated_at: 2026-10-29T06:23:36.429242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/update-audit.test.ts

## Purpose

Integration test verifying the privacy contract of the `ADMIN_USER_UPDATED` audit row: non-identifying preferences (e.g. `locale`) are recorded by value, while personal identifiers (e.g. `phone`, `email`) appear only as field names in `changedFields`. Because the audit collection is never scrubbed on erasure, this test guards against accidentally persisting PII into audit metadata.

## Key elements

- **`metadataOf(spy, action)`** — helper that scans the mocked `emitAuditEvent` calls, finds the entry matching `action`, and returns its `metadata` (or `undefined`).
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the entire audit port with `auditPortMock()` from `tests/support/ports.ts`; the real `emitAuditEvent` is never called.
- **`describe('userService.updateById — the audit row of an admin edit')`** — two cases:
  - *records the locale by value and the personal fields by name*: asserts `changes: { locale: { from: 'en', to: 'it' } }` and `changedFields: ['username', 'phone']`.
  - *writes nothing for a value sent unchanged, or a phone cleared that was never set*: asserts `metadata` is `{}`.
- **`setupTestDb()`** — initialises a real test database (integration, not unit, level).

## Relationships

- **`src/modules/users/services/index.ts`** — source under test (`userService.updateById`).
- **`src/modules/users/audit.ts`** — supplies the `usersAuditActions` enum used to tag and locate the audit row.
- **`src/infrastructure/observability/audit.ts`** — the audit port whose `emitAuditEvent` is fully mocked at module scope.
- **`tests/support/ports.ts`** — provides both `observePort` (wrap-a-function spy) and `auditPortMock` (the factory used by the `jest.mock` call).
- **`tests/support/callers.ts`** — `callerContextAs('admin')` simulates an authenticated admin calling context.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a known user row in the test DB.
- **`tests/support/setup-test-db.ts`** — boots the schema/connection before tests run.

## Notes

- The audit port is **replaced**, not spied on (`jest.mock` → `auditPortMock()`). Do not add `jest.spyOn` on `auditPort.emitAuditEvent` at the call site; use `observePort` from `ports.ts` instead.
- `afterEach(jest.restoreAllMocks)` handles the per-test spies from `observePort`; the module-level `jest.mock` replacement persists for the whole file.
- The privacy invariant tested here is a **hard requirement** of the data model: the audit collection has no erasure pipeline, so any PII value written there is a breach. The test encodes the "name-only" rule explicitly.
