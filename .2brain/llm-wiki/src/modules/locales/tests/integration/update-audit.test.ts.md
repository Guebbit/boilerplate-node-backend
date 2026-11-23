---
source: src/modules/locales/tests/integration/update-audit.test.ts
generated_at: 2026-11-22T05:51:10.818885+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/integration/update-audit.test.ts

## Purpose
Integration test that pins down what the locale update operations write into their audit rows. A language's display fields are recorded by value (old and new). A locale entry's text is never recorded; only the key and the fact that `value` changed. The audit trail is deliberately not a second copy of the dictionary.

## Key elements
- **`jest.mock('@infrastructure/observability/audit', ...)`**: replaces the audit port with `auditPortMock()` from `@tests/ports` (a replacement, not a spy).
- **`setupTestDb()`** and **`afterEach(() => jest.restoreAllMocks())`**: real test database per suite, mocks restored after each test.
- **`metadataOf(spy, action)`**: finds the `emitAuditEvent` call with the given `action` and returns its `metadata`.
- **`localeService.updateLanguage`** test: updating `name` (`' Spanish '` becomes `'Spanish'`) and `direction` (`ltr` to `rtl`) yields `metadata.changes` with `{from, to}` for each moved field.
- **`localeService.deactivateLanguage`** test: metadata is `changes: { active: { from: true, to: false } }`.
- **`localeService.updateEntry`** test: metadata is `{ locale, app, entryKey, changedFields: ['value'] }`, with neither the old nor the new text (`Carrito`, `Cesta`).

## Relationships
- `@infrastructure/observability/audit`: its `emitAuditEvent` is mocked and observed via `observePort`.
- `@modules/locales/audit`: provides `localeAuditActions` (`ADMIN_LOCALE_UPDATED`, `ADMIN_LOCALE_DEACTIVATED`, `ADMIN_LOCALE_ENTRY_UPDATED`) used to select rows.
- `@modules/locales/factories`: `makeLocale` and `makeLocaleEntry` build the seed data.
- `@modules/locales/repository`: `localeRepository` and `localeEntryRepository` persist the seed data.
- `@modules/locales/services`: `localeService` is the code under test.
- `@modules/locales/tests/unit/apps.fixture` (imported as `../unit/apps.fixture`): supplies the `FRONTEND` app constant.
- `@tests/setup-test-db`, `@tests/ports`, `@tests/callers`: DB setup, the audit port mock with `observePort`, and `testCallerContext`.

## Notes
- The expected `toEqual` objects are exact, so any extra metadata (such as entry text) would fail the tests.
- The `updateLanguage` test shows that values are trimmed before being recorded (`'Spanish'`).
