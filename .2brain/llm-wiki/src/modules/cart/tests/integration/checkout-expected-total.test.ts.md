---
source: src/modules/cart/tests/integration/checkout-expected-total.test.ts
sha256: 9c286c47947585f4cc69e2e8c9255594a98b9c8c9264a6580a2c5a880c1fefa7
generated_at: 2026-11-08T05:19:37.221527+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-expected-total.test.ts

## Purpose

Integration test for `POST /cart/checkout` that verifies the `expectedTotal` guard: checkout must match the total the buyer was shown, refuse (409) if any component moved, leave zero side effects on refusal, and reject malformed input with 422. It exists to lock down the atomicity invariant and the error-contract surface of the endpoint.

## Key elements

- **`shopperWith(price, quantity)`** — Local helper that authenticates a user, gives them an address, creates a product at the given price with 10 on hand, adds `quantity` units to the cart, and sets shipping to `pickup` (free). Returns the bearer token and product.
- **`describe('POST /cart/checkout and the total the buyer was shown')`** — The sole suite; contains 11 test cases covering:
  - Happy path (201)
  - Price-change refusal (409, `CART_TOTAL_CHANGED`, both totals in `details`)
  - Atomicity of refusal (no order, no held stock, cart unchanged)
  - Confirm-and-retry with the new total (409 → 201)
  - Currency mismatch (409 even with same numeric amount)
  - Basket mutation (added line) triggering refusal
  - Minor-unit equivalence (`"20"` ≡ `"20.00"`)
  - Excess decimal places → 422
  - Missing `expectedTotal` → 422
  - Malformed totals (negative, numeric type, wrong currency code, missing currency) → 422 via `it.each`
  - Stock shortage takes priority over price mismatch → 409 `CART_INSUFFICIENT_STOCK`
- **`setupTestDb()`** — Called at module scope; resets the test database before any test runs.

## Relationships

- **`tests/support/http.ts`** — Provides `api()` (Supertest wrapper) and `authenticateAs()` used by every test to make authenticated requests.
- **`tests/support/checkout-as.ts`** — Provides `checkoutAs(bearer, { expectedTotal })` and `shownTotal(bearer)`; the primary means of exercising the endpoint and reading the current cart total.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` seeds/resets the database for the test session.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress(user.id)` ensures the user has a billing address (required for checkout).
- **`src/modules/products/tests/factories.ts`** — `createProduct()` creates the test product; `countersOf(productId)` asserts inventory counters (reserved = 0) after a refused checkout.
- **`src/modules/orders/tests/factories.ts`** — `countOrders()` asserts zero orders exist after a refusal.
- **`src/modules/products/index.ts`** (via `productService`) — `updateById()` changes the product price mid-test to simulate a race.
- **`src/modules/inventory/index.ts`** (via `inventoryService`) — `adjust()` reduces on-hand stock to trigger the insufficient-stock path.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by service-method calls made outside the HTTP layer.

## Notes

- **Status-code contract:** 409 means "the cart is valid but the total you named is stale" (business rule); 422 means "the input itself is malformed" (validation). Tests deliberately exercise both to pin this distinction.
- **Priority:** When both stock is short and the price has moved, the stock refusal (`CART_INSUFFICIENT_STOCK`) wins — the last test asserts this ordering.
- **Amount comparison is in minor units:** `"20"` and `"20.00"` are treated as identical; the test locks this in so a future refactor to float comparison is caught.
- **Currency is case-sensitive ISO-4217:** `"EURO"`, `"eur"`, and a missing currency all produce 422, not 409 — the distinction is validation vs. business logic.
- The `expectedTotal` field is **required**; an empty body gets 422, not a server error.
