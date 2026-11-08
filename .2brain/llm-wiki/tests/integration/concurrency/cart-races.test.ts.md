---
source: tests/integration/concurrency/cart-races.test.ts
sha256: 7e537d9d79b982d82d77488a0168324139cd829c78bd43efbf1ab35177a0366f
generated_at: 2026-11-08T09:36:25.012337+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration tests that fire concurrent HTTP requests at the cart and checkout endpoints to verify two race conditions stay closed: **R2** (parallel checkouts must produce exactly one order, not a double-charge) and **R3** (concurrent cart writes must not create duplicate lines, lost increments, or a second cart document). The file also documents *why* each test exists and which failure mode it isolates, serving as the reference the R2 fix was modelled on.

## Key elements

- **`R3 — concurrent writes of the SAME product`** — fires `RACE_SIZE` parallel `POST /cart/items` for one product; asserts one cart, one line, quantity equals `RACE_SIZE`, all responses 200. Sets `NODE_CART_LINE_MAX` to `RACE_SIZE` via `withEnvironmentOverrides` so the per-line ceiling doesn't interfere.
- **`R3 — concurrent adds of DIFFERENT products`** — fires `RACE_SIZE` parallel adds, each for a *different* product. The only case that distinguishes a working `$ne`-in-filter design from a broken one (a single-product race cannot expose the "one product on two lines" failure).
- **`R3 — concurrent quantity writes to the same line`** — fires parallel `PATCH /cart/items/:id` with distinct quantities in *set* mode; asserts the final quantity is one of the values sent (last-writer-wins), not a merge artefact, and no second cart appears.
- **`R2 — concurrent checkouts of one cart`** — fires `RACE_SIZE` parallel `checkoutAs` calls. Sub-tests verify: exactly one order, one 2xx and `RACE_SIZE−1` 409s, cart emptied to zero items, no orphaned order for the loser, and the product's inventory hold is released for losing requests.
- **`RACE_SIZE`** (from `@tests/race`) — the concurrency knob; every test's expected counts are expressed in terms of it.
- **`raceN`, `countStatus`, `expectNoServerErrors`** (from `@tests/race`) — shared helpers for firing N concurrent requests and tallying status codes.

## Relationships

- **`src/modules/cart/model.ts`** — `cartModel` is queried directly (`countDocuments`, `findOne`) to assert cart/line invariants.
- **`src/modules/cart/repository.ts`** — the code under test for R3; its `$ne`-in-filter + duplicate-key retry is what the same/different-product cases discriminate.
- **`src/modules/cart/services/index.ts`** — `cartService` imported; exercises the add/update/checkout logic the HTTP calls reach.
- **`src/modules/orders/model.ts`** — `orderModel` queried directly to assert order count and item contents after checkout races.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` / `readOrder` helpers for order assertions (used in the truncated portion).
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds inventory for every test.
- **`src/modules/products/index.ts`** / **`src/modules/products/services/index.ts`** — `productService` imported; likely used in the truncated hold-release assertion.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` satisfies the checkout precondition.
- **`src/modules/users/tests/factories.ts`** — `createUser` imported for user setup.
- **`src/modules/webhooks/module.ts`**, **`src/modules/webhooks/repository.ts`**, **`src/modules/webhooks/secrets.ts`** — imported for webhook subscription/delivery teardown in the (truncated) later cases.
- **`src/kernel/outbox.ts`** — `relayOutbox`, `settleOutboxNudges`, `outboxEventModel` imported to drain or assert the outbox after checkout.
- **`src/kernel/events.ts`** — `resetDomainEvents` imported for per-test event-bus cleanup.

## Notes

- **`RACE_SIZE` is a knob, not a constant.** The per-line ceiling (`NODE_CART_LINE_MAX`) is explicitly set to `RACE_SIZE` in the same-product test; a lower value would turn valid adds into 400 refusals and mask the real invariant.
- **Cases 3 and 4 look identical at a glance but test different bugs.** Only the multi-product case (case 4) can expose the "same product on two lines" failure; a single-product race produces the same observable output whether the guard is present or not.
- **The R2 fix is transactional.** `clearLinesIfUnchanged` runs *inside* the order's transaction using the cart's `__v` as the condition, so the loser's order and its `order.created` event are rolled back together. The "no orphaned order" sub-test exists specifically to catch a regression where the cart is emptied but the order is still committed.
- **Assertions bypass the service layer.** The file reads `cartModel` / `orderModel` directly (Mongoose) rather than calling `cartService.get`, because it needs to verify database-level invariants (single document, single line) that a service response might hide.
