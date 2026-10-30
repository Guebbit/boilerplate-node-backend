---
source: src/modules/account/tests/integration/profile-audit.test.ts
sha256: 78f0ac1dee6ccd1802cdb8367d9adba9d5ac2807bf619edc4a3bb25dc4909544
generated_at: 2026-10-29T02:58:36.751224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/profile-audit.test.ts

## Purpose

Integration test verifying that the `AUTH_PROFILE_UPDATED` audit row for an own-profile edit records preference changes by value (from → to) while recording an email change by field name only — the actual email value is never stored in the audit metadata. Also documents the invariant that the audit collection is never scrubbed on user erasure.

## Key elements

- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the entire audit port module with `auditPortMock()` from `tests/support/ports.ts`. This is a full replacement, not a spy.
- **`setupTestDb()`** — Initialises the shared test database before any test runs.
- **`describe('accountService.updateProfile — the audit row of an own edit')`** — Single test block.
- **Test: "names the email when this call asked for a change, and never carries its value"** — Calls `accountService.updateProfile` with a new email and a locale change, then asserts the audit row's `metadata`:
  - `changes.locale` → `{ from: 'en', to: 'it' }` (value recorded)
  - `changedFields` → `['email']` (name recorded, value absent)
- **`observePort(auditPort.emitAuditEvent)`** — Captures emitted audit entries for assertion.
- **`accountAuditActions.AUTH_PROFILE_UPDATED`** — Constant used to locate the correct audit row among all emitted entries.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `accountService.updateProfile`, the method under test.
- **`src/modules/account/audit.ts`** — Provides the `accountAuditActions` identifier used to filter the expected audit entry.
- **`src/infrastructure/observability/audit.ts`** — The real audit port module; fully replaced by the mock so no actual emission side-effect occurs.
- **`tests/support/ports.ts`** — Supplies `observePort` (call capture) and `auditPortMock` (the replacement factory used in `jest.mock`).
- **`tests/support/callers.ts`** — Supplies `testCallerContext`, the caller identity passed to `updateProfile`.
- **`src/modules/users/tests/factories.ts`** — Supplies `createUser` to provision a verified user with a known starting email/locale.
- **`tests/support/setup-test-db.ts`** — Supplies `setupTestDb` for database lifecycle.

## Notes

- The audit port is **replaced, not spied** (explicit comment in the file). Tests must go through `observePort` / `auditPortMock` rather than `jest.spyOn` on the real module.
- The assertion is intentionally strict (`toEqual` on `metadata`): it fails if a future change accidentally includes the email value in `changes`, enforcing the "email by name only" invariant.
- The module-level docblock states the audit collection is **never scrubbed on erasure**; this test documents that design decision but does not itself test erasure behaviour.
- Only one test case exists; coverage of multi-field preference changes or the "no email change" path is absent.
