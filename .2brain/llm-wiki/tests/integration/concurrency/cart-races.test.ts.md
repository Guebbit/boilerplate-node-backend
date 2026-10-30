---
source: tests/integration/concurrency/cart-races.test.ts
sha256: 57397d975e425b55bdb32e95053f6a1e55e476c5cc6d90e075db25eb6f279b1d
generated_at: 2026-10-29T06:53:25.289269+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration test that exercises race conditions on the cart and checkout endpoints under concurrent HTTP load. It closes two documented bugs: **R2** (parallel `POST /cart/checkout` both reading the same lines and both creating an order, charging the customer twice) and **R3** (the cart upsert retry / `$ne`-in-filter guard was untested). The R3 cases double as the reference the R2 fix (`clearLinesIfUnchanged`) was modelled on.

## Key elements

- **`RACE_SIZE`** (from `@tests/race`) — knob controlling how many concurrent requests fire per case.
- **`raceN(n, fn)`** — fires `n` concurrent invocations and collects the responses.
- **`countStatus(results, code)` / `expectNoServerErrors(results)`** — assertion helpers for the response array.
- **`withEnvironmentOverrides({ NODE_CART_LINE_MAX })`** — scopes the per-line quantity ceiling so the race fits within the limit.
- **`checkoutAs(bearer)`** (from `@tests/checkout-as`) — wraps the full checkout request sequence.
- **`setupTestDb()`** — isolates a clean database per run.
- **R3 describe blocks** — three `it` cases: same-product adds (one line, quantity = `RACE_SIZE`), different-product adds (one line per product, no duplicates), and concurrent `PATCH` quantity writes (result is one of the sent values, never a merge artefact or second cart).
- **R2 describe blocks** — five `it` cases: exactly one order, one 200/201 + the rest 409, cart emptied to zero items, no orphan order for the loser, and the loser's inventory hold is released (not leaked on the product).
- **Webhook / outbox wiring** — `webhooksModule`, `webhookSubscriptionRepository`, `webhookDeliveryRepository`, `mintRingSecret`, `outboxEventModel`, `relayOutbox`, `settleOutboxNudges`, `resetDomainEvents` are imported to set up and tear down the side-effect pipeline that `order.created` triggers, ensuring the tests observe committed state only.

## Relationships

- **`src/modules/cart/repository.ts`** — the code under test for R3; its duplicate-key retry loop and `$ne`-in-filter condition are the invariant these cases verify.
- **`src/modules/cart/model.ts`** — `cartModel` is queried directly for post-race assertions (document count, line count, quantity).
- **`src/modules/cart/services/index.ts`** — `cartService` is imported for the service-level cart operations the HTTP layer exercises.
- **`src/modules/orders/model.ts`** — `orderModel` is queried to assert exactly one committed order (R2).
- **`src/modules/orders/tests/factories.ts`** — `countOrders` / `readOrder` provide order-assertion helpers.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds products with controlled `onHand` / `price` / `title`.
- **`src/modules/products/index.ts`** & **`src/modules/products/services/index.ts`** — `productService` is used to verify hold release after a lost checkout (R2 hold-leak case).
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` ensures the user has a shipping address before checkout.
- **`src/modules/users/tests/factories.ts`** — `createUser` (via `authenticateAs`) supplies the authenticated actor.
- **`src/modules/webhooks/module.ts`**, **`src/modules/webhooks/repository.ts`**, **`src/modules/webhooks/secrets.ts`** — set up the webhook subscription/delivery pipeline so that `order.created` events have a target and can be settled/verified after the race.
- **`src/kernel/outbox.ts`** — `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` let the test assert that only the winner's order events were actually relayed.
- **`src/kernel/events.ts`** — `resetDomainEvents` flushes the in-memory event log between cases.

## Notes

- Cases 3 (same product) and 4 (different products) look similar but test different invariants: only the multi-product case can distinguish a correct `$ne`-in-filter guard from a broken one, because a single-product race produces identical observable output either way.
- The per-line ceiling (`NODE_CART_LINE_MAX`) is set to exactly `RACE_SIZE` via `withEnvironmentOverrides`; a lower value would turn the last adds into refusals and mask the concurrency bug.
- The R2 "hold leak" test depends on `reserveForOrder` being called *before* the conditional cart write inside the order transaction; if the transaction aborts, `placeOrder` must release the hold. Without that, the product accumulates permanent holds keyed to orders that never exist.
- The file intentionally does **not** fix R3 — the repository code was already correct; these tests are the missing coverage that was missing.
