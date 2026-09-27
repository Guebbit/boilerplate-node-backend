---
source: tests/contract/product-write.test.ts
sha256: 7789da40bdaed85f1c9d2923a82dcb19088475c23208c3c06e433a7eccebff0e
generated_at: 2026-09-27T15:48:06.773643+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/product-write.test.ts

## Purpose

Contract-level integration test for the multilingual product write surface (`POST /products`, `PUT /products/{id}`, `PATCH /products/{id}`, `GET /products/{id}/admin`) over real HTTP. It lives at the top-level `tests/contract/` directory rather than under `src/modules/products/tests/` because exercising these routes requires a live `locales` collection row, which the `products` module can only reach through the `kernel/translation` port.

## Key elements

- **`fieldPriceMin()`** — Looks up the i18n message for the `field-price-min` rule from `mergedResources().en.translation`, used to assert that 422 responses carry the field-named error rather than a generic one.
- **`beforeAll`** — Registers the product as a translatable resource with `localeService.setTranslatables()`, wiring `productRepository.existsById` and `productRepository.writeTranslatedFields` as the port callbacks.
- **`beforeEach`** — Seeds the fallback `en` locale row via `localeRepository.create(makeLocale(...))` so translation writes have a target.
- **`afterAll`** — Clears the translatable registration.
- **`describe('POST /products')`** — Covers creation (multi-language body), fallback-locale enforcement (422), and opening stock arriving via a real `receive()` inventory movement.
- **`describe('PUT /products/{id}')`** — Covers full-resource replacement, RFC 9110 required-field enforcement (422), and field-named negative-price rejection.
- **`describe('PATCH /products/{id}')`** — Covers partial merge (price + translation), single-field price update, `taxClass: null` clearing, and field-named negative-price rejection.
- **`describe('SKU (SH4)')`** — Covers SKU creation, DB-level uniqueness collision (409 via sparse index), and `sku: null` clearing.
- **`describe('GET /products/{id}/admin')`** — Covers the admin read returning all language variants.

## Relationships

- **`tests/support/contract.ts`** — Side-effect import that configures the shared contract assertion helpers used across all `expect(response...)` calls.
- **`tests/support/http.ts`** — Provides `api()` (Supertest-style HTTP client), `authenticateAs()`, and `authenticateAsRole()` for issuing authenticated requests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` handles test-database lifecycle (create/teardown).
- **`tests/support/i18n-boot.ts`** — `mergedResources()` exposes the resolved i18n resource bundle so the test can assert exact validation messages.
- **`src/modules/locales/repository.ts`** — `localeRepository.create()` inserts the fallback locale row each test.
- **`src/modules/locales/factories.ts`** — `makeLocale()` builds the locale fixture document.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables()` registers/unregisters the product translation binding for the test's lifetime.
- **`src/modules/products/repository.ts`** — `productRepository.existsById` and `writeTranslatedFields` are injected as the translation-port callbacks the `locales` module calls back into.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds existing product rows for PUT/PATCH/SKU tests.

## Notes

- **`en` is a hard-coded fallback.** The constant `FALLBACK = 'en'` is documented as the fallback locale in every environment this suite runs (see `.env-example`). Changing it requires touching both the constant and the environment.
- **PUT vs PATCH semantics are intentional.** PUT bodies must include every writable field (no "cleared" state exists for `active`, `requiresShipping`, `categories`, `tags`); PATCH accepts a partial body. The 422 missing-field test on PUT exists specifically to pin the RFC 9110 full-replacement contract.
- **`onHand` is not a direct field write.** The opening-stock test goes through a real `receive()` inventory movement; the `products` service never writes `onHand` itself. The test uses `admin` (not `editor`) because reading back the ledger requires `inventory.any.read`.
- **SKU uniqueness is enforced at the DB level** via a sparse unique index (`products_sku`). A collision against an already-stored SKU returns 409; a null SKU on PATCH clears it.
- **Validation messages are i18n-resolved.** The `fieldPriceMin()` helper exists because the factory now validates against `zodProductReplaceSchema` / `zodProductUpdateSchema` directly, and the error text comes from the i18n bundle — asserting a hard-coded English string would break if the locale changes.
- **Authorization stacking.** Write routes require both `products.any.update` AND `translations.any.update`. No preset role holds one without the other, so the "one key alone refuses" path is tested at the ability layer (`shared/authorization-conformance.yaml`), not here.
