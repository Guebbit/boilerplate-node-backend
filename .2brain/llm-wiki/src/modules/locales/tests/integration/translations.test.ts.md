---
source: src/modules/locales/tests/integration/translations.test.ts
sha256: a4bee1b67d0dddb5f425f09f6424132f32cb96a4836d629ecb31f77ffaf1bcd3
generated_at: 2026-09-23T18:53:59.192244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/translations.test.ts

## Purpose

Integration tests for `localeService.getEntityTranslations` and `localeService.upsertEntityTranslations` — the two methods a translator uses to read and write per-locale content. Every case runs against a real Mongo database (not mocks) to exercise the full write path: registry validation, locale-existence checks, derived-index-column writes on `products`, and the `sourceDigest` stamping between sibling rows.

## Key elements

- **`setupTestDb()`** — boots a real Mongo instance for the suite (from `@tests/setup-test-db`).
- **`beforeAll` / `afterAll`** — registers and clears the translatable-entity registry so only `product` (collection `products`, fields `title` + `description`, cacheTag `products`) is available during the tests.
- **`FALLBACK = 'en'`** — the fallback locale tag; created via `givenLocale` in `beforeEach` so it exists as a regular row before every case.
- **`givenLocale(tag, overrides?)`** — helper that creates a locale document through `localeRepository.create` + `makeLocale`, optionally setting `active: false`.
- **`describe('getEntityTranslations')`** — three cases: unregistered entity → 422; entity with no rows → empty list; multiple rows returned sorted by locale tag.
- **`describe('upsertEntityTranslations')`** — twelve cases covering:
  - Validation rejections (unregistered entity, missing/inactive locale, undeclared field, empty `fields`, `null` on fallback).
  - `null` on a non-fallback locale deletes that row.
  - Locales not named in the request body are left untouched.
  - Batch atomicity: one bad entry in the payload rejects the whole write (nothing persisted).
  - Derived-index-column sync: fallback write updates `products.title`/`description`; non-fallback write does not.
  - `sourceDigest` stamping: set on non-fallback rows at write time, absent on the fallback row, and **not** re-stamped when the fallback is later rewritten in a separate request.
  - `origin` defaults to `'human'`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/locales/services/index.ts` | System under test. `localeService.setTranslatables` configures the registry; `getEntityTranslations` / `upsertEntityTranslations` are the methods exercised in every case. |
| `src/modules/locales/repository.ts` | `localeRepository.create` (via `givenLocale`) seeds locale rows; `translationRepository.findEntityTranslations` reads persisted rows directly for assertions (digest, origin, empty-set checks). |
| `src/modules/locales/factories.ts` | `makeLocale` builds the locale document shape passed to `localeRepository.create`. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds a product row; `readProduct` reads it back to verify the derived-index-column write (or its absence). |
| `tests/support/setup-test-db.ts` | `setupTestDb` initialises the real Mongo connection the suite depends on. |

## Notes

- The fallback locale (`en`) receives **no** special-casing in the write path — it is validated and stored exactly like any other locale. Tests assert this explicitly.
- The `sourceDigest` on a non-fallback row is a point-in-time snapshot of the fallback row **at the moment the non-fallback row is written**. Rewriting the fallback in a later request does not update already-stamped siblings (dedicated test confirms this).
- Registry state is suite-scoped (`beforeAll`/`afterAll`), not per-case. If another suite in the same process registers a different entity, it will conflict; the registry is a single `localeService` instance.
- "Validates the whole batch before writing anything" is a critical contract: a single invalid locale in the payload must leave the `locales` collection completely unchanged.
