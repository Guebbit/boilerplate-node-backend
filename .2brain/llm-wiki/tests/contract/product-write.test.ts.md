---
source: tests/contract/product-write.test.ts
sha256: 49f6468282e528a4b53733ce45acb4912404e1601588b64e73bf932f8c3f9777
generated_at: 2026-10-29T06:40:06.110950+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/product-write.test.ts

## Purpose

Contract tests for the multilingual product write surface over real HTTP: `POST /products`, `PUT /products/{id}`, and the `translations` map on `GET /products/{id}`. It lives at the top-level `tests/contract/` directory (not under `src/modules/products/tests/`) because driving these routes requires a real `locales` collection row, which the `products` module may only reach through the `kernel/translation.ts` port.

## Key elements

- **`fieldPriceMin()`** — Renders the exact English validation message for a price below 0, using the shipped i18n copy, so assertions match the user-facing sentence verbatim.
- **`titleTooShort()`** — Renders the English validation message for a title under the 5-character contract minimum.
- **`FALLBACK`** (`'en'`) — The fallback locale, seeded via `givenLocale(FALLBACK)` in `beforeEach`; every test depends on its existence.
- **`describe('POST /products')`** — Covers: creation with translations, title-length validation, rejection of `null` locale / `null imageUrl`, omission of description, missing fallback locale, stock-invariant behaviour (new product starts at 0 `onHand`; only a receipt sets it), and rejection of `onHand` in the create body.
- **`describe('PUT /products/{id}')`** — Covers: full-replacement semantics (RFC 9110 §9.3.4), `releaseDate` clearing ends a preorder, required-field enforcement (`allowBackorder`, `noWithdrawal`, `active`, etc.), locale deletion for translations not present in the body, and rejection when the fallback locale is missing.
- **`beforeEach`** — Seeds the `'en'` locale row so the product write path can resolve translations.

## Relationships

- **`tests/support/contract.ts`** — Imported for side-effect (global contract-level test setup, e.g. app boot, module registration).
- **`tests/support/http.ts`** — Provides `api()` (supertest wrapper), `authenticateAs`, and `authenticateAsRole` used for every request in this file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to prepare a clean database for the suite.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` is awaited after `POST /products` to flush outbox events before asserting stock/inventory state.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product for PUT/PATCH tests; `productRepository` is used for direct DB assertions (e.g. confirming `releaseDate` was cleared).
- **`src/modules/products/repository.ts`** — The underlying repository that `productRepository.findById` delegates to; used to verify stored state beyond the HTTP response.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` seeds the `locales` collection row (e.g. `'it'`) required for multi-locale tests.
- **`src/infrastructure/i18n/index.ts`** — Re-exports `translator`, the function used to render English validation messages for exact-match assertions.
- **`src/infrastructure/i18n/context.ts`** — Underlying implementation behind `translator`; supplies locale-aware message rendering.

## Notes

- The file asserts **exact** validation messages by rendering them through the `translator('en')` call at test time. If shipped copy changes, these assertions break automatically — they are intentionally coupled to the i18n catalog.
- `PUT` is treated as full replacement (RFC 9110 §9.3.4): every writable field (`active`, `purchasable`, `requiresShipping`, `allowBackorder`, `noWithdrawal`, `categories`, `tags`, `translations`) is required in the body. Fields with no "cleared" state cannot be omitted.
- Locale rows are per-test: `beforeEach` seeds `'en'`; tests that need additional locales (e.g. `'it'`) call `givenLocale` explicitly.
- Stock is deliberately **not** a product field. The test suite asserts that `onHand` in a create body is rejected (422) and that a separate receipt endpoint is the only way to set an opening count.
- The `@tests/contract` import (side-effect) is what boots the real application and registers every enabled module's `translatables`; without it the i18n catalog would be empty.
