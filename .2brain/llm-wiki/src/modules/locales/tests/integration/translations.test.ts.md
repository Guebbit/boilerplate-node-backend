---
source: src/modules/locales/tests/integration/translations.test.ts
sha256: 43373ff89addf2a7e30c4d1a3c8d4c51275a10cc7db9beb857a2ddea6d4fa59c
generated_at: 2026-11-14T20:24:42.248862+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/translations.test.ts

## Purpose

Integration tests for `getEntityTranslations` and `updateEntityTranslations` that run against a **real MongoDB** (via `setupTestDb`). The suite verifies the full read/write path for entity translations, including registry validation, locale-existence checks, derived-index writes on `products`, digest stamping, transactional atomicity, and draft/orphan-locale visibility rules.

## Key elements

- **`setupTestDb()`** — spins up a real in-memory/connected Mongo for the whole file.
- **`beforeAll`** — registers the *real* translatable targets by calling `resolveTranslatables(enabledModules)` and feeding them to `localeService.setTranslatables`. Deliberately avoids hand-rolled duplicates to keep the test in lockstep with the cross-cutting coupling guard.
- **`beforeEach`** — guarantees the `en` (fallback) locale row exists via `givenLocale(FALLBACK)`. Treated as an ordinary row, not a special case.
- **`describe('getEntityTranslations')`** — covers: 404 for unregistered entity type, empty list for a new entity, 404 for missing entity, and locale-sorted listing.
- **`describe('updateEntityTranslations')`** — covers: 404 unregistered type, 422 unknown locale, 404 missing entity (no rows written), rejection on malformed ObjectId *before* any write, transactional rollback when `markEdited` (tag bump) fails, draft-locale draft/serve/preview-tag/orphan/fallback scenarios.
- **`FALLBACK`** — constant `'en'`; the fallback locale used in every write assertion.
- **Temporary translatable swap** — one test replaces `product.markEdited` with a rejecting stub to prove the shared transaction rolls back the translation upsert.

## Relationships

- **`src/modules/locales/services/index.ts`** — the system under test; all public calls go through the `localeService` exported here.
- **`src/kernel/registry.ts`** — `resolveTranslatables` resolves the registered translatable targets from enabled modules; feeds `setTranslatables`.
- **`src/modules.ts`** — provides the `enabledModules` list consumed by `resolveTranslatables`.
- **`src/modules/locales/repository.ts`** — `translationRepository` and `localeRepository` are used for post-condition assertions (row existence, field resolution, field-match search) and for directly manipulating locale rows (activate/deactivate). `deriveSourceDigest` is imported but exercised indirectly through the service.
- **`src/modules/locales/model.ts`** — `localeModel` is used directly in one race-condition test (`deleteOne`) to delete a language row out from under a translation row.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` creates locale rows for setup.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates the product entity that translations attach to.
- **`tests/support/setup-test-db.ts`** — initialises the real database connection before any test runs.

## Notes

- **Real DB, no mocks.** Every assertion that inspects rows uses the actual repository/model; there are no jest mocks of Mongo.
- **Cross-module coupling guard.** The `beforeAll` comment explicitly states that importing the products repository directly here would be the exact hidden coupling that `tests/cross-cutting/translatable-targets.test.ts` is designed to catch. The test relies on `resolveTranslatables` to stay in sync.
- **Draft vs. active vs. orphan.** A cluster of tests at the bottom exercises the visibility matrix: active locales serve text, inactive (draft) locales only serve text when the caller names the correct preview tag, orphan rows (locale row deleted) are invisible, and the fallback locale serves even without a `locales` collection row.
- **`afterAll` resets translatables to `{}`** to prevent leaking registered targets into sibling test files.
- **Truncation in source.** The file content ends mid-test (fallback-locale-no-row case); the full file likely contains additional assertions for that scenario.
