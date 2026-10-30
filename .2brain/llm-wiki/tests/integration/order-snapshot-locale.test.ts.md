---
source: tests/integration/order-snapshot-locale.test.ts
sha256: 5c655943fe8102035089d313a28e9bae1bb1cee367207a10bb0a6564d8556a41
generated_at: 2026-10-29T06:59:37.129146+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/order-snapshot-locale.test.ts

## Purpose

Integration test verifying that an order-line product snapshot freezes the **buyer's stored locale** (from `user.locale`) at creation time, rather than the caller's or request's locale. Covers both order-creation entry points (`orderService.create` and `cartService.orderConfirm`) and asserts the embedded title/description come from the buyer-locale translation row. Lives at the top level (not under a single module's `tests/`) because the behavior spans `orders`, `cart`, and `locales` simultaneously.

## Key elements

- **`FALLBACK`** — constant `'en'`, the fallback locale assumed across all CI environments (documented in `.env-example`).
- **`givenTranslation(productId, locale, fields)`** — helper that calls `translationRepository.upsertEntityLocale` for a product; passes `'human'` as author and conditionally `'digest'` as a quality flag when the locale is not the fallback.
- **`describe("orderService.create freezes the snapshot in the buyer's stored locale")`** — two cases: (1) Italian translation is embedded even though the admin caller's locale is `en`; (2) when no translation exists, the source title is still tagged with the buyer's locale.
- **`describe("cartService.orderConfirm freezes the snapshot in the buyer's stored locale")`** — same assertion through the cart-confirmation flow (requires `giveAddress` and `cartRepository.setShippingMethod`).

## Relationships

- **`src/modules/orders/index.ts`** — exports `orderService`; the primary SUT in the first describe block.
- **`src/modules/orders/services/index.ts`** — implementation behind `orderService.create`.
- **`src/modules/cart/index.ts`** — exports `cartService`; SUT in the second describe block.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` is called to satisfy the cart-confirm precondition.
- **`src/modules/locales/repository.ts`** — `translationRepository.upsertEntityLocale` is invoked by `givenTranslation` to seed the product's Italian row.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` registers a locale in the test DB.
- **`src/modules/users/tests/factories.ts`** — `createUser` with a `locale` field.
- **`src/modules/products/tests/factories.ts`** — `createProduct` with source `title`/`description`.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` satisfies the cart-confirm address requirement.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/ephemeral DB.
- **`tests/support/callers.ts`** — `testCallerContext` (generic) and `callerContextAs('admin')` (role-scoped) build the caller object whose `locale` is deliberately wrong.
- **`tests/support/response.ts`** — `asSuccess` unwraps the `Result` type.
- **`tests/support/http.ts`** — side-effect import (likely registers HTTP interceptors or test-app wiring).

## Notes

- The caller's `locale: 'en'` in the admin context is intentionally the *wrong* answer; if a regression ever resolves the snapshot against the caller rather than the buyer, the test fails loudly. The file's header comment calls out that a mis-frozen locale is "frozen beyond repair" once the order is persisted.
- The `_id` assertion (`order.items[0].product._id === product._id`) guards a specific implementation detail: `resolveSnapshotProducts` must merge via `.toObject()` (not `.toJSON()`), which preserves the original Mongoose `_id` rather than substituting a new one.
- `givenTranslation` sets the quality flag to `'digest'` only for non-fallback locales; the fallback (`en`) row is left unflagged. This mirrors the production upsert contract.
