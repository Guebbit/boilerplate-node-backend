---
source: src/modules/locales/tests/integration/update-audit.test.ts
sha256: 57fa59d4577b57e675e5a2b7c4074f6365c4a409afc3aff65ea35a37a76876a7
generated_at: 2026-10-29T04:26:43.307825+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/update-audit.test.ts

## Purpose

Integration tests that assert the **audit-event metadata** emitted by the locale service when a language is updated, deactivated, or an entry is updated. The core contract under test: language-level changes record each field's old→new value; entry-level changes record the key and *which* fields moved, but **never** the text itself (the audit trail is not a second copy of the dictionary).

## Key elements

- **`metadataOf`** – local helper that scans the audit spy's call log, finds the entry matching a given `action`, and returns its `metadata`.
- **`jest.mock('@infrastructure/observability/audit', …)`** – replaces the audit port with the shared `auditPortMock` from `tests/support/ports.ts` (replacement, not spy).
- **`describe('localeService.updateLanguage …')`** – verifies `ADMIN_LOCALE_UPDATED` metadata carries per-field `{ from, to }` diffs (e.g. `name`, `direction`).
- **`describe('localeService.deactivateLanguage …')`** – verifies `ADMIN_LOCALE_DEACTIVATED` metadata carries `{ active: { from: true, to: false } }`.
- **`describe('localeService.updateEntry …')`** – verifies `ADMIN_LOCALE_ENTRY_UPDATED` metadata names the locale, app, key, and `changedFields: ['value']` without including the text.
- **`setupTestDb()`** – provisions a real (ephemeral) database so the full repository→service→port path executes.

## Relationships

- **`src/modules/locales/services/index.ts`** – the system under test; `localeService.updateLanguage`, `deactivateLanguage`, and `updateEntry` are the methods whose audit output is asserted.
- **`src/infrastructure/observability/audit.ts`** – the audit port module, fully **replaced** by the port mock (not the real implementation).
- **`src/modules/locales/audit.ts`** – source of the `localeAuditActions` constants used to identify which audit entry to inspect.
- **`src/modules/locales/repository.ts`** – `localeRepository` / `localeEntryRepository` are used to seed test fixtures before each scenario.
- **`src/modules/locales/factories.ts`** – `makeLocale` and `makeLocaleEntry` build the seed documents.
- **`tests/support/ports.ts`** – provides both the `auditPortMock` factory (used in the `jest.mock` factory) and `observePort` (wraps the mocked function as a spy for assertions).
- **`tests/support/callers.ts`** – supplies `testCallerContext` passed as the actor argument to every service call.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` ensures a clean database for each test run.
- **`src/modules/locales/tests/unit/apps.fixture.ts`** – exports the `FRONTEND` app identifier used in entry-level tests.

## Notes

- The audit port is **replaced**, not spied on. The `jest.mock` factory delegates to `auditPortMock()` from the shared port helper; `observePort` then wraps the already-mocked function. Do not expect the real `emitAuditEvent` implementation to execute.
- The module doc-comment states a deliberate design constraint: for entry updates the audit row records *that* `value` changed, not *what* the new text is. Tests lock this in by asserting the exact shape (no `value` field in metadata).
- `afterEach` calls `jest.restoreAllMocks()`; the mock replacement itself is not reset (it's a module-level mock), but any per-call state on the spy is cleared.
