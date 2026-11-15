---
source: tests/integration/concurrency/cart-races.test.ts
sha256: 71103af7e2c1e3b3a3a62e2bdc827f8c8c5ad4c63b9aac9b5b4768a10d7017c8
generated_at: 2026-11-14T23:11:15.733466+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration tests that exercise two cart/checkout race conditions under concurrent load. **R2** verifies that N parallel `POST /cart/checkout` calls produce exactly one order (the losers get 409) and that the conditional cart-clear (`clearLinesIfUnchanged`) is scoped to the order's transaction. **R3** verifies the cart upsert retry path in `cart/repository.ts` — the `$ne`-in-filter guard and the duplicate-key retry — by firing N concurrent adds or quantity writes and asserting the resulting cart shape.

## Key elements

- **`describe('R3 — concurrent writes of the SAME product')`** — fires `RACE_SIZE` parallel `POST /cart/items` for one product; asserts one cart, one line, quantity = `RACE_SIZE`, all 200.
- **`describe('R3 — concurrent adds of DIFFERENT products')`** — same shape but N distinct products; asserts N unique lines (this is the case that actually discriminates a broken `$ne`-in-filter from a working one).
- **`describe('R3 — concurrent quantity writes to the same line')`** — uses supertest's `.patch()` to set (not increment) quantities on an existing line; asserts the final quantity is one of the sent values, not a merge artefact, and no duplicate cart.
- **`describe('R2 — concurrent checkouts of one cart')`** — five sub-tests: exactly one order; one 200/201 + N−1 409s; cart emptied to zero items; no phantom order for losers; product inventory holds are released for losers.
- **`withEnvironmentOverrides`** — used to set `NODE_CART_LINE_MAX_QUANTITY` to `RACE_SIZE` so the per-line ceiling doesn't reject legitimate adds.
- **`raceN`, `countStatus`, `expectNoServerErrors`, `RACE_SIZE`** — concurrency helpers imported from `@tests/race`.
- **`checkoutAs`** — helper (from `@tests/checkout-as`) that performs the full checkout HTTP call.

## Relationships

- **`src/modules/cart/repository.ts`** — the code under test for R3; its `$ne`-in-filter upsert and duplicate-key retry are the invariants these tests pin.
- **`src/modules/cart/model.ts`** — `cartModel` is queried directly after each race to assert cart count, line count, and quantities.
- **`src/modules/cart/services/index.ts`** — `cartService` imported; the checkout flow it hosts is what the R2 tests exercise via HTTP.
- **`src/modules/orders/model.ts`** — `orderModel` is queried to count orders and verify the surviving order's line quantity.
- **`src/modules/orders/tests/factories.ts`** — `countOrders`, `readOrder` available for order assertions.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds inventory (`onHand`) for each scenario.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` is required before checkout in R2 tests.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the authenticated user.
- **`src/modules/webhooks/module.ts`**, **`repository.ts`**, **`secrets.ts`** — imported for outbox/webhook state reset and verification in the checkout flow.
- **`src/kernel/outbox.ts`** — `relayOutbox`, `settleOutboxNudges` used to flush pending events so assertions aren't racy.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus between tests.

## Notes

- The same-product (case 3) and different-product (case 4) R3 tests look similar but only case 4 can detect a broken `$ne`-in-filter design; a single-product race is indistinguishable from correct behaviour.
- `NODE_CART_LINE_MAX_QUANTITY` must be ≥ `RACE_SIZE` or the last adds become 400s instead of 200s; the test sets it explicitly.
- R2's fix (`clearLinesIfUnchanged`) ties the cart write to the `__v` read at order-creation time, *inside the order's transaction*; the "no phantom order" sub-test exists specifically to catch a regression where the conditional write is moved outside that transaction.
- The file is truncated in the graph; the last R2 test (product hold release) is cut off mid-assertion.
