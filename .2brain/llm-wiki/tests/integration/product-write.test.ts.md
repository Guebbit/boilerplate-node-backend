---
source: tests/integration/product-write.test.ts
sha256: a20af8a8b4a8a0d4a94dcf9327cd390d29b5a677307da244ee8c35fadd199246
generated_at: 2026-09-23T20:06:08.121308+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-write.test.ts

## Purpose

Integration tests for `productService.writeCreate` and `productService.writeUpdate`, exercising the multilingual product write path against a real database and a real translation port. Because the trigger lives in the `products` module while the translation rows and locale validation live in the `locales` module, the suite sits at the top-level `tests/integration/` rather than under either module's own `tests/` directory.

## Key elements

- **`FALLBACK`** (`'en'`) — the locale that must always be present; assumed by every test case.
- **`givenLocale(tag, overrides?)`** — shorthand that creates a locale via `localeRepository.create` + `makeLocale`.
- **`beforeAll`** — imports `enabledModules` (triggering the import-time `registerTranslationPort` side-effect) and configures `localeService.setTranslatables` for the `product` entity.
- **`beforeEach`** — ensures the `en` fallback locale exists before each test.
- **`afterAll`** — clears the translatables config.
- **`describe('productService.writeCreate')`** — three cases: happy-path (product + translation rows written atomically), missing fallback locale (reject, no rows written), unregistered translation locale (reject with field-level error, no rows written).
- **`describe('productService.writeUpdate')`** — three cases: mixed edit + delete in one PATCH, `null` on the fallback locale (reject, rows untouched), PATCH carrying no `translations` key (product fields updated, translation rows left alone).

## Relationships

- **`src/modules.ts`** — `enabledModules` is imported solely to fire the `registerTranslationPort` side-effect that opens the `products → locales` translation channel.
- **`src/modules/products/index.ts`** — re-exports `productService` (the SUT) and the `ProductDocument` type.
- **`src/modules/products/model.ts`** — source of the `ProductDocument` type used in assertions.
- **`src/modules/products/service.ts`** — implements `writeCreate` / `writeUpdate`; the logic under test.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct` for seeding a product document before `writeUpdate` tests.
- **`src/modules/locales/repository.ts`** — `translationRepository.findEntityTranslations` and `upsertEntityLocale` are used for assertions and pre-seeding; `localeRepository.create` is used by `givenLocale`.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds locale documents for the `givenLocale` helper.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables` registers which product fields are translatable.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-test database.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity expected by `writeCreate`/`writeUpdate`.

## Notes

- The `void enabledModules` import is **not** a no-op: its purpose is the import-time side-effect that registers the translation port. Removing it would break every test in the file.
- `'en'` is hard-coded as the fallback. The suite assumes it exists in every test environment (documented via `.env-example`). It is not parameterised.
- Convention (mirrored in `locales/tests/integration/translations.test.ts`): every test case must write the fallback locale at least once; the `beforeEach` guard exists to make that assumption explicit.
- In `writeUpdate`, a `null` value in the `translations` map means "delete this locale's row," while omitting the `translations` key entirely means "leave all translation rows untouched."
