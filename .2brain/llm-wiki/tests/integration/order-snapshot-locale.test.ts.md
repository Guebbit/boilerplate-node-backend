---
source: tests/integration/order-snapshot-locale.test.ts
sha256: 5c655943fe8102035089d313a28e9bae1bb1cee367207a10bb0a6564d8556a41
generated_at: 2026-11-08T09:43:39.747053+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/order-snapshot-locale.test.ts

## Purpose

Integration tests verifying that an order line's product snapshot freezes the **buyer's stored locale** (from `user.locale`) at the moment of order creation — never the caller's locale and never re-resolved at read time. Covers both order-creation entry points (`orderService.create` and `cartService.orderConfirm`) to guard against the caller's locale leaking into the frozen receipt.

## Key elements

- **`FALLBACK`** — constant `'en'`; the fallback locale in every test environment (per `.env-example`).
- **`givenTranslation(productId, locale, fields)`** — helper that calls `translationRepository.upsertEntityLocale` with actor `'human'` and source `'digest'` (for non-fallback locales), so a product translation row exists before order creation.
- **`describe("orderService.create …")`** — two cases: (1) Italian translation is embedded over the caller's `en` locale; (2) when no translation exists, the source text is used but `item.locale` is still `'it'`.
- **`describe("cartService.orderConfirm …")`** — one case confirming the same freeze behaviour through the cart-confirm path, which additionally requires a shipping address and shipping method.

## Relationships

- **`@modules/orders` / `@modules/orders/services`** — under test; `orderService.create` is the primary SUT in the first describe block.
- **`@modules/cart/services` & `@modules/cart/repository`** — under test; `cartService.orderConfirm` and `cartRepository.setShippingMethod` drive the second describe block.
- **`@modules/locales/repository`** — `translationRepository.upsertEntityLocale` is called by `givenTranslation` to seed the Italian product row.
- **`@modules/locales/tests/factories`** — `givenLocale('it')` activates the locale for the test run.
- **`@modules/users/tests/factories`** — `createUser({ locale: 'it' })` creates the buyer whose stored locale must win.
- **`@modules/products/tests/factories`** — `createProduct` seeds the source product.
- **`@modules/addresses/tests/factories`** — `giveAddress` is required before the cart-confirm path will succeed.
- **`tests/support/callers`** — `callerContextAs('admin')` and `testCallerContext` supply the *caller* identity (deliberately set to `en` to prove it loses).
- **`tests/support/response`** — `asSuccess` unwraps the Result type from service calls.
- **`tests/support/setup-test-db`** — in-memory DB lifecycle for the suite.
- **`tests/support/http`** — side-effect import (registers HTTP mocks before any test runs).

## Notes

- Linted at top-level `tests/integration/` (not under any single module's `tests/`) because the flow spans `orders`, `cart`, and `locales`. The file header cross-references `translation-resolution.test.ts` as the read-path counterpart.
- The first test case asserts `String(order.items[0].product._id) === String(product._id)` to catch a regression where `resolveSnapshotProducts` merges via `.toJSON()` (which would replace the Mongoose `_id` with a newly serialised one) instead of `.toObject()`.
- The cart-confirm test requires both `giveAddress` and `cartRepository.setShippingMethod` before `orderConfirm` will proceed; omitting either causes an unrelated validation failure.
- The caller context is intentionally set to `locale: 'en'` in every case — if the snapshot ever re-resolves against the *request* locale rather than the *buyer's* stored locale, these tests fail.
