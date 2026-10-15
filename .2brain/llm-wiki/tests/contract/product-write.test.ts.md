---
source: tests/contract/product-write.test.ts
sha256: e98623c1d37c7ad9ca3f3e6587c702cdb2cb19fbe591d0b7e92841e1ac5fc2d5
generated_at: 2026-10-15T12:32:53.062204+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/product-write.test.ts

## Purpose

Contract test suite that exercises the multilingual product write surface — `POST /products`, `PUT /products/{id}`, `PATCH /products/{id}`, and `GET /products/{id}/admin` — over real HTTP. It lives at the top-level `tests/contract/` directory (not under `src/modules/products/tests/`) because driving these routes requires a real `locales` collection row, which the products module may only reach through the `kernel/translation.ts` port, making the suite inherently cross-module.

## Key elements

- **`fieldPriceMin()` / `titleTooShort()`** — Local helpers that render the shipped English i18n validation strings via `translator('en')` so tests can assert exact error messages.
- **`beforeAll` / `afterAll`** — Registers and clears the product translatable config on `localeService`, wiring `productRepository` methods (`existsById`, `writeTranslatedFields`, `markEdited`) and `checkProductTranslationFields` from the products model.
- **`beforeEach`** — Seeds the `en` fallback locale row via `localeRepository.create(makeLocale(...))`.
- **`describe('POST /products')`** — Covers creation with multilingual body, 422 on short title, 422 on missing fallback locale, and opening stock arriving through a `receive` inventory movement (verified after `settleOutboxNudges()`).
- **`describe('PUT /products/{id}')`** — Covers full-replacement semantics: all writable fields required, omitted stored locales are deleted (not kept), fallback locale still required, and field-named validation message for negative price.
- **`describe('PATCH /products/{id}')`** — Covers partial merge (price + translation edit), editor price change, and explicit-`null` clearing of `taxClass`.

## Relationships

- **`tests/support/contract.ts`** — Side-effect import; configures the shared contract-test harness.
- **`tests/support/http.ts`** — Provides `api`, `authenticateAs`, `authenticateAsRole` for all HTTP calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database before any test runs.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` is called after `POST` with `onHand` to drain the outbox relay before reading the resulting stock.
- **`src/modules/locales/repository.ts`** — `localeRepository.create` seeds locale rows in `beforeEach` and in PUT-locale-deletion tests.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds locale fixtures.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables` registers the product translation contract for the duration of the suite.
- **`src/modules/products/repository.ts`** — Methods (`existsById`, `writeTranslatedFields`, `markEdited`) are wired into the translatables registration; `productRepository` is the product module's persistence port.
- **`src/modules/products/model.ts`** — `checkProductTranslationFields` is registered as the per-field validator for product translations.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product for PUT/PATCH tests.
- **`src/infrastructure/i18n/index.ts`** (and its re-export from `context.ts`) — `translator('en')` resolves the English message catalogue used to build expected validation strings.

## Notes

- **PUT is full-replacement (RFC 9110 §9.3.4):** all writable fields (`active`, `purchasable`, `requiresShipping`, `categories`, `tags`, `translations`) are required in the body; locales omitted from `translations` are *deleted*, not preserved. PATCH is the partial-update path.
- **Opening stock is outbox-driven:** `POST` with `onHand` does not write the count directly; it enqueues a `receive` movement. Tests must call `settleOutboxNudges()` before asserting the final `onHand` value.
- **Authorization nuance:** the write routes require *both* `products.any.update` and `translations.any.update`. No preset role holds one without the other, so the "single-key-alone" refusal is asserted at the ability layer in `shared/authorization-conformance.yaml` rather than here.
- **Validation schema:** the factory validates PUT against `zodProductReplaceSchema` (not the raw generated schema) so that field-named i18n messages (e.g. "too small number" for price) surface in the 422 body rather than being swallowed by a generic contract minimum.
- **`en` fallback assumption:** the suite assumes `en` is the fallback locale in every environment it runs in (documented via `.env-example`); no dynamic lookup is performed.
