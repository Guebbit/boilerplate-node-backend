---
source: src/modules/cart/tests/integration/checkout-expected-total.test.ts
sha256: 659babea514756dd047a84701a7911f01ecf2f712f8eb9ab88a9b33b34c91c72
generated_at: 2026-10-29T03:27:04.385524+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-expected-total.test.ts

## Purpose

Integration test verifying the `expectedTotal` invariant on `POST /cart/checkout`: the endpoint must reject any checkout where the named total differs from the cart's current total (price change, basket change, wrong currency), return **both** totals so the UI can prompt the buyer, and leave no side effects (no order, no held stock, cart intact). Also covers input validation (missing/malformed `expectedTotal` → 422) and priority (stock check runs before total check).

## Key elements

- **`shopperWith(price, quantity)`** – local helper: authenticates a user, gives an address, creates a product with `onHand: 10`, adds it to the cart, and sets shipping to `pickup` (free). Returns `{ bearer, product }`.
- **`describe('POST /cart/checkout and the total the buyer was shown')`** – nine cases:
  - Happy path: correct total → 201, `totalPrice` matches.
  - Price moved after read → 409 `CART_TOTAL_CHANGED` with `expected`/`actual` in `details`.
  - Atomicity: after a 409, zero orders, `reserved` stock = 0, cart still holds the line.
  - Buyer confirms: first attempt 409, second attempt with the `actual` from `details` → 201.
  - Wrong currency (USD vs EUR, same amount) → 409.
  - Basket changed (extra line added) → 409, `actual.amount` reflects new total.
  - Missing `expectedTotal` field → 422.
  - `it.each` of four malformed totals (negative, fractional, bad currency code, missing currency) → 422.
  - Stock shortage takes priority: `CART_INSUFFICIENT_STOCK` is returned instead of `CART_TOTAL_CHANGED`.

## Relationships

- **`tests/support/http.ts`** – `api()` and `authenticateAs()` provide the HTTP client and bearer-token auth used throughout.
- **`tests/support/checkout-as.ts`** – `checkoutAs(bearer, { expectedTotal })` wraps the checkout POST; `shownTotal(bearer)` reads the cart's current total.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initializes a fresh database before the suite.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the caller identity for direct service calls.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` seeds the required shipping address.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product; `countersOf` reads inventory counters.
- **`src/modules/products/index.ts`** → `productService.updateById` mutates price mid-test to simulate a race.
- **`src/modules/inventory/index.ts`** → `inventoryService.adjust` depletes stock for the stock-priority test.
- **`src/modules/orders/tests/factories.ts`** – `countOrders` asserts no order was persisted after a refused checkout.

## Notes

- Prices are integer cents in EUR (`2000` = €20.00). The API's `totalPrice` is returned in whole units (`20`, `24`).
- The stock-priority test (`CART_INSUFFICIENT_STOCK` over `CART_TOTAL_CHANGED`) documents an ordering contract: if both violations exist, stock is reported first.
- The "buyer confirms" test reads the `actual` value out of the 409 response body and replays it — the test does not hard-code the new price, keeping it resilient to pricing-logic changes.
- `setupTestDb()` is called at module scope (outside `beforeEach`), so all cases share one database instance; isolation relies on unique product/user IDs from the factories.
