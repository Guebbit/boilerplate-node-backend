---
source: src/modules/locales/tests/integration/translations.test.ts
sha256: df28cbc8cd367dae60ba4ee033283f011996d42980a5fc3ab65d4f6673fe4d89
generated_at: 2026-10-15T10:48:19.592471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/translations.test.ts

## Purpose

Integration test for `localeService.getEntityTranslations` and `localeService.upsertEntityTranslations`, run against a real MongoDB instance. It verifies the full read/write path—including registry lookup, locale validation, derived-index-column writes on `products`, and source-digest stamping—without mocking any of those layers.

## Key elements

- **`setupTestDb()`** — provisions a real Mongo-backed test database for the suite.
- **`beforeAll`** — registers translatables via `resolveTranslatables(enabledModules)` so the service resolves the *real* `product` target (with its own `markEdited` / `writeDerived` methods).
- **`beforeEach`** — seeds the `en` fallback locale row via `givenLocale(FALLBACK)`.
- **`describe('getEntityTranslations')`** — covers 404 on unknown entity type, empty-list response, and sorted locale listing.
- **`describe('upsertEntityTranslations')`** — the bulk of the suite. Covers:
  - 404 for unregistered entity type / nonexistent entity id
  - 422 for unknown locale, inactive locale, undeclared field, empty fields object, `null` on fallback
  - Rejection (throw) on malformed ObjectId *before* any row is written
  - Transactional rollback when `markEdited` fails (no partial write)
  - `null` on a non-fallback locale deletes that row
  - Untouched locales left intact when not named in the body
  - Batch all-or-nothing validation (one bad locale rejects the whole batch)
  - Derived index column written only for the fallback locale; non-fallback writes leave it untouched
  - Source-digest stamping on non-fallback rows (omitted on the fallback row itself)

## Relationships

- **`src/modules/locales/services/index.ts`** — the system under test; `localeService` is called for every assertion.
- **`src/modules/locales/repository.ts`** — `translationRepository` and `localeRepository` are used directly in assertions to inspect or clean up DB state (e.g., verifying no rows were written, deleting the fallback row). `deriveSourceDigest` is imported but only exercised indirectly through the service.
- **`src/kernel/registry.ts`** — `resolveTranslatables` resolves the registered translatable targets so the test exercises the real `writeDerived` / `markEdited` path rather than a hand-rolled stub.
- **`src/modules.ts`** — `enabledModules` feeds into `resolveTranslatables` to determine which entity types are registered.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` seeds locale rows in the DB.
- **`src/modules/products/tests/factories.ts`** — `createProduct` / `readProduct` create and inspect product documents (the target of derived-index writes).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` connects the test suite to a real Mongo instance.

## Notes

- **Requires a live MongoDB instance** (via `setupTestDb`); these tests will not pass with in-memory mocks.
- The fallback locale (`en`) is treated as a *special* value in the service logic: it cannot be `null`-deleted, does not need a `locales` collection row to be writable, and is the only locale that triggers a derived-index-column write on the target entity.
- The "rejects rather than writing anything" test asserts *ordering*: the malformed-id rejection must fire before any `translations` row is persisted.
- The tag-bump-failure test temporarily swaps in a rejecting `markEdited` via `localeService.setTranslatables`, then restores the real target afterward.
- The digest-stamping test writes the fallback row first, then the non-fallback row, because the digest is computed *against* an already-existing fallback row (mirroring real usage where `productService.create` writes the fallback before a translator ever upserts).
