---
source: tests/integration/order-snapshot-locale.test.ts
sha256: 28ab231c487cebf022611cf8786af41a8d8af8aa25dd71c710ed48abc3895760
generated_at: 2026-10-15T12:49:07.426199+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/order-snapshot-locale.test.ts

## Purpose

Integration test that verifies an order line's snapshot freezes the **buyer's** stored locale (not the caller's or the request's) at the moment the product is embedded. It covers both entry points — `orderService.create` (direct order) and `cartService.orderConfirm` (cart checkout) — and asserts that the snapshot retains the correct translated title/description and the original product `_id`. It lives at the top level under `tests/integration/` (not under any single module) because the behavior crosses `orders`, `cart`, and `locales`; the file header notes this mirrors the placement rationale in `translation-resolution.test.ts`.

## Key elements

- **`FALLBACK`** — constant `'en'`, the universal fallback locale (see `.env-example`).
- **`givenTranslation(productId, locale, fields)`** — thin wrapper around `translationRepository.upsertEntityLocale` that upserts a product translation; passes `'digest'` as the source flag only when the locale differs from `FALLBACK`.
- **`describe("orderService.create …")`** — two cases:
  - Translation present → asserts `items[0].locale === 'it'`, Italian title/description, and that `product._id` matches the original Mongo id.
  - No Italian translation → asserts fallback to the English source title while `locale` is still `'it'`.
- **`describe("cartService.orderConfirm …")`** — one case exercising the full cart → confirm flow (`cartItemSetById`, `setShippingMethod`, `orderConfirm`) and asserting the same snapshot invariants.

## Relationships

- **`src/modules/orders/index.ts`** — exports `orderService`; the test calls `orderService.create`.
- **`src/modules/cart/index.ts`** — exports `cartService`; the test calls `cartService.cartItemSetById` and `cartService.orderConfirm`.
- **`src/modules/cart/repository.ts`** — exports `cartRepository`; the test calls `cartRepository.setShippingMethod` before confirming.
- **`src/modules/locales/repository.ts`** — exports `translationRepository`; `givenTranslation` delegates to `upsertEntityLocale`.
- **`src/modules/locales/tests/factories.ts`** — exports `givenLocale`; seeds a locale row before tests run.
- **`src/modules/users/tests/factories.ts`** — exports `createUser`; creates the buyer with a chosen `locale`.
- **`src/modules/products/tests/factories.ts`** — exports `createProduct`; creates the product whose snapshot is asserted.
- **`src/modules/addresses/tests/factories.ts`** — exports `giveAddress`; required by the cart-confirm flow.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB.
- **`tests/support/http.ts`** — side-effect import (Jest setup / request interception).
- **`tests/support/callers.ts`** — `callerContextAs('admin')` and `testCallerContext` build the caller payloads.
- **`tests/support/response.ts`** — `asSuccess` unwraps the `Result` envelope for assertions.

## Notes

- The caller's locale is deliberately set to `'en'` in every case while the buyer is `'it'` — this is the adversarial scenario the test guards against (an admin accidentally overwriting the buyer's language).
- The assertion `String(order.items[0].product._id) === String(product._id)` is intentional: `resolveSnapshotProducts` merges via `.toObject()`, **not** `.toJSON()`, specifically so the original Mongo ObjectId survives the snapshot. A regression to `.toJSON()` would mint a new id and break downstream references.
- The file is a *mirror* of the read-path test (`translation-resolution.test.ts`); keep the two in sync if the snapshot schema or locale-resolution contract changes.
