---
source: src/modules/cart/tests/integration/backorder.test.ts
sha256: 7aad378f56f8bbb24616cde9ced38d5b8f8323254f6cb9cee2dbd7b9708abd19
generated_at: 2026-11-08T05:19:21.173620+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/backorder.test.ts

## Purpose

Integration tests for the backorder feature as seen through the cart: verifying the four availability states a line can report, and confirming that `orderConfirm` correctly splits a line into shelf-fulfilled and backordered portions, freezes the owed quantity and promise date, serialises the promise as a shop-day string on the wire, and refuses the order (409) when shelf + cap cannot cover the requested quantity.

## Key elements

- **`backorderProduct(onHand, limit, restockInDays?)`** — Factory. Creates a released product with `allowBackorder: true`, sets the inventory backorder cap via `inventoryService.setBackorderLimit`, and optionally stamps a `restockDate`.
- **`availabilityOf(userId)`** — Reads the first cart line's `availability` field via `cartService.getForView`.
- **`shopperWith(productId, quantity)`** — Creates a user, gives them an address, adds the product to their cart, and sets shipping to `pickup`.
- **`describe('a backorder line')`** — Four cases asserting `availability` resolves to `in_stock`, `backorder`, `insufficient_stock`, or `out_of_stock` based on shelf count vs. cap vs. requested quantity.
- **`describe('checking out a backorder')`** — Five cases covering: partial fulfilment (shelf + backordered split with explicit restock date), 30-day default promise when no restock date is set, wire serialisation of `promisedAt` as a `YYYY-MM-DD` shop-day string via `toJSON`, no-backorder freeze when shelf covers the full line, and 409 rejection with inventory untouched when cap is exceeded.

## Relationships

- **`src/modules/cart/services/index.ts`** — Primary system under test: `addItemById`, `getForView`, `orderConfirm`.
- **`src/modules/cart/repository.ts`** — `setShippingMethod` to configure pickup before checkout.
- **`src/modules/inventory/index.ts`** — `setBackorderLimit` (setup) and `listLevels` (post-checkout assertions on `reserved`/`available`/`backordered`).
- **`src/modules/shop/index.ts`** — `shopDayOf` to compute the expected `YYYY-MM-DD` wire value for promise dates.
- **`src/modules/payments/module.ts`** — Registered via `registerCheckoutModules` so the checkout pipeline is complete.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `beforeEach` to isolate event-bus state between tests.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` to satisfy the checkout address requirement.
- **`src/modules/users/tests/factories.ts`** — `createUser` for the shopper.
- **`src/modules/products/tests/factories.ts`** — `createProduct` with `onHand`, `allowBackorder`, and optional `restockDate`.
- **`tests/support/callers.ts`** — `testCallerContext` passed to every service call.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` to wire the payment module into the checkout pipeline.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` for in-memory/ephemeral persistence.

## Notes

- **Wire format vs. domain format:** `promisedAt` is a `Date` in the domain object but a `YYYY-MM-DD` string after `toJSON()`. The test that checks the wire shape casts the result because `toJSON` returns a loose Mongoose `Document` type.
- **`promiseDated` flag:** `true` when the product has an explicit `restockDate`; `false` when the 30-day default is applied. The test asserts both variants.
- **No-backorder fields are `undefined`, not zero:** When the shelf covers the full line, `backorderedQuantity` and `promisedAt` are absent (`undefined`), not `0` or `null`.
- **409 rejection leaves inventory pristine:** On an unfulfillable order the test asserts `reserved: 0`, `backordered: 0` — no partial reservation is held.
- **30-day default is relative to `Date.now()` at order time**, not a fixed constant; the test uses a window assertion (`≥ before + 30d`, `< now + 30d + 1s`).
