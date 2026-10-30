---
source: src/modules/locales/tests/integration/translations.test.ts
sha256: bc531b82f718ef4e108060c26f6316333e80ef90160345f7979f862ab7b9ef39
generated_at: 2026-10-29T04:26:29.301971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/translations.test.ts

## Purpose

Integration test suite for `getEntityTranslations` and `updateEntityTranslations` on `localeService`, run against a real MongoDB instance. It verifies the full write/read path for entity translations—including registry validation, locale-row existence checks, draft/preview gating, orphan-row exclusion, fallback-locale special-casing, and transaction atomicity with the derived-index tag bump on `products`.

## Key elements

- **`beforeAll` / `afterAll`** — registers (and clears) the real translatable targets via `resolveTranslatables(enabledModules)`, ensuring `localeService.setTranslatables` reflects production wiring rather than a hand-rolled duplicate.
- **`FALLBACK` (`'en'`)** — the fallback locale tag; created in every `beforeEach` so the write path treats it as a normal row.
- **`describe('getEntityTranslations')`** — asserts 404 for unregistered entity types, empty list for entities with no rows, and correct locale-sorted ordering of returned rows.
- **`describe('updateEntityTranslations')`** — the bulk of the suite. Covers:
  - 404 for unregistered entity type and nonexistent entity ID (with no rows written).
  - 422 for a locale tag absent from the `locales` collection.
  - Rejection-before-write ordering for malformed ObjectIds.
  - Transaction atomicity: a failing `markEdited` (tag bump) rolls back all translation writes.
  - Draft (inactive) locales: writable and listed, but not served by `resolveEntityFields` / `findEntityIdsByFieldMatch` unless the preview tag matches.
  - Orphan / deleted-locale scenarios: rows whose language row no longer exists are excluded from reads.
  - Fallback-locale special case: served even when the corresponding `locales` row has been removed.
  - A "message that outlives the entity" read-scope check (truncated in source).

## Relationships

- **`src/kernel/registry.ts`** — `resolveTranslatables` is called in `beforeAll` to obtain the real translatable-target map that `localeService` uses for `writeDerived` / `markEdited` dispatch.
- **`src/modules.ts`** — `enabledModules` is the input to `resolveTranslatables`, tying the test to the same module registry production uses.
- **`src/modules/locales/services/index.ts`** — `localeService` is the system under test; its `getEntityTranslations` and `updateEntityTranslations` methods are exercised directly.
- **`src/modules/locales/repository.ts`** — `translationRepository` and `localeRepository` are used for direct DB assertions (verifying rows were/ weren't written, resolving fields, finding by field match) and for `deriveSourceDigest`.
- **`src/modules/locales/model.ts`** — `localeModel.deleteOne` is used to simulate a concurrent locale-row deletion (orphan scenario) without going through the service layer.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` creates locale rows (optionally with `active: false`) in the test DB.
- **`src/modules/products/tests/factories.ts`** — `createProduct` / `readProduct` seed the `products` collection so translation writes have a valid target entity.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` spins up the real Mongo instance the entire suite runs against.

## Notes

- This is a **real-DB** integration test, not a unit test with mocks. All assertions that check "no rows were written" query the collection directly via `translationRepository.findEntityTranslations`.
- The `beforeAll` comment explicitly warns against importing the products repository directly here—that coupling is guarded by `tests/cross-cutting/translatable-targets.test.ts`. The translatables map is the only sanctioned path to `writeDerived`.
- `FALLBACK` is hardcoded to `'en'` and is documented as matching `.env-example`; changing the fallback in config without updating this constant will break the suite silently.
- The draft/preview tests rely on a fourth optional argument to `resolveEntityFields` / `findEntityIdsByFieldMatch` (the preview tag). Without it, draft rows are invisible; with a mismatched tag they are also invisible.
- The "tag bump fails" test swaps out the `product` target's `markEdited` with a rejecting stub and restores the real map in the same `it` block—there is no `afterEach` cleanup for that swap.
