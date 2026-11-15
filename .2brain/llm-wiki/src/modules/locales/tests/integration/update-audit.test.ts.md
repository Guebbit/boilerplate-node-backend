---
source: src/modules/locales/tests/integration/update-audit.test.ts
sha256: 2fe221df2469e8e0053e6291a861ad1f459294247ea8d01e83cfca3cf8cb0b7a
generated_at: 2026-11-14T20:25:07.267949+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/update-audit.test.ts

## Purpose

Integration tests that verify the audit metadata emitted when locale service mutations occur. It encodes the project's audit design principle: language-level changes record each display field's old/new values, while entry-level changes record only the key and the fact that `value` moved — never the text itself.

## Key elements

- **`metadataOf`** – local helper that pulls the `metadata` object out of the first matching audit-spy call for a given action string.
- **`describe('localeService.updateLanguage …')`** – asserts the audit row carries per-field `{ from, to }` diffs for `name` and `direction`.
- **`describe('localeService.deactivateLanguage …')`** – asserts the audit row carries the `active` flag transition (`true → false`).
- **`describe('localeService.updateEntry …')`** – asserts the audit row names `locale`, `app`, `entryKey`, and `changedFields` but omits the actual text.

## Relationships

- **`src/modules/locales/services/index.ts`** – the system under test; three mutation methods are exercised here.
- **`src/infrastructure/observability/audit.ts`** – the audit port whose `emitAuditEvent` is fully replaced at module level (not spied on).
- **`src/modules/locales/audit.ts`** – source of the `localeAuditActions` constants used in assertions.
- **`src/modules/locales/factories.ts`** – `makeLocale` / `makeLocaleEntry` used to seed test rows.
- **`src/modules/locales/repository.ts`** – `localeRepository` / `localeEntryRepository` used to create preconditions.
- **`tests/support/ports.ts`** – supplies `observePort` (spy wrapper) and the mock factory used in the module-level replacement.
- **`tests/support/callers.ts`** – supplies `testCallerContext` passed as the caller argument to every service call.
- **`tests/support/setup-test-db.ts`** – initialises a real test database (this is an integration test, not a unit test).
- **`src/modules/locales/tests/unit/apps.fixture.ts`** – provides the `FRONTEND` app-identifier constant.

## Notes

- The audit port is **replaced at module level**, not spied on: the entire `src/infrastructure/observability/audit.ts` module is swapped with the factory from `tests/support/ports.ts`. Do not add `jest.spyOn` here; follow the port-replacement pattern.
- `afterEach(jest.restoreAllMocks)` is the sole cleanup; there is no explicit `teardownDb`.
- The header comment is load-bearing: it states the project rule that the audit trail is *not* a second copy of the dictionary. Any new test for entry updates should assert the *absence* of text in the metadata.
