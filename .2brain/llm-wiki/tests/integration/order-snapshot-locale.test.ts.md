---
source: tests/integration/order-snapshot-locale.test.ts
sha256: 5ccbf6a3cc1b20574deeafdc65e265a4ccde2c53480cf2d292d38cfdfa11b220
generated_at: 2026-09-27T15:56:37.153192+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/order-snapshot-locale.test.ts

## Purpose

Integration test that verifies the order line-item snapshot freezes the **buyer's stored locale** (from `user.locale`) at order-creation time, regardless of the caller's locale. Covers both creation paths — `orderService.create` and `cartService.orderConfirm` — and asserts the embedded product title/description come from the correct locale translation. Lives at the top-level `tests/integration/` (not under any single module) because the logic spans `orders`, `cart`, and `locales` simultaneously, mirroring the placement rationale documented in `translation-resolution.test.ts`.

## Key elements

- **`FALLBACK`** – constant set to `'en'`; the locale that needs no `digest` flag when upserting a translation.
- **`givenTranslation(productId, locale, fields)`** – local helper wrapping `translationRepository.upsertEntityLocale` with source `'human'` and `digest` for non-fallback locales.
- **`describe("orderService.create freezes…")`** – two tests: (1) Italian buyer, English caller → snapshot carries Italian text and `locale: 'it'`; (2) no Italian translation exists → source text is used but still tagged with the buyer's locale.
- **`describe("cartService.orderConfirm freezes…")`** – one test exercising the cart-confirm path with the same locale-freezing expectation, including `cartRepository.setShippingMethod` setup.

## Relationships

- **`src/modules/orders/index.ts`** – source of `orderService.create`, the primary system under test.
- **`src/modules/cart/index.ts`** – source of `cartService.cartItemSetById` / `orderConfirm`, the second creation path.
- **`src/modules/cart/repository.ts`** – `cartRepository.setShippingMethod` is called to satisfy cart-confirm preconditions.
- **`src/modules/locales/repository.ts`** – `translationRepository.upsertEntityLocale` is called by `givenTranslation` to seed per-locale product rows.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale('it')` registers the locale so the repository can resolve it.
- **`src/modules/users/tests/factories.ts`** – `createUser({ locale: 'it' })` provisions the buyer.
- **`src/modules/products/tests/factories.ts`** – `createProduct` provisions the product whose snapshot is asserted.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the (deliberately mismatched) caller identity.
- **`tests/support/http.ts`** – imported for side-effect setup (HTTP-level test infrastructure).
- **`tests/support/response.ts`** – `asSuccess` unwraps the result union to access `.data`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory database once for the file.

## Notes

- The Italian-vs-English locale mismatch is **intentional**: the caller is always `locale: 'en'` while the buyer is `'it'`, so any regression to "use the caller's locale" is caught immediately.
- The `product._id` equality assertion (`String(order.items[0].product._id) === String(product._id)`) guards against a `.toJSON()` serialisation that would rename the field to `id`; the implementation must go through `.toObject()`.
- `FALLBACK` is environment-bound (documented as `'en'` per `.env-example`); changing the default locale in environment config without updating this constant will silently alter the `digest` flag passed to `upsertEntityLocale`.
