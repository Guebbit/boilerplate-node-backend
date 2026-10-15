---
source: tests/integration/concurrency/cart-races.test.ts
sha256: a6eeb6a2c9a14c9e8fdeabf1530bef0e2a569b674ea0d70a28b4ccf1fb587f60
generated_at: 2026-10-15T12:45:15.718249+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/cart-races.test.ts

## Purpose

Integration tests that fire N concurrent HTTP requests at the cart and checkout endpoints to verify the concurrency guarantees of two specific invariants: **R2** (exactly one order is created and committed when multiple checkouts race on the same cart, with losers receiving 409) and **R3** (concurrent cart writes — same product, different products, or conflicting quantity updates — never produce duplicate lines, lost increments, or split cart documents). The tests exercise the real HTTP API end-to-end, hitting the `$ne`-in-filter upsert retry and the `clearLinesIfUnchanged` conditional write that close these races.

## Key elements

- **`describe('R3 — concurrent writes of the SAME product')`** — Fires `RACE_SIZE` parallel `POST /cart` calls for one product. Asserts exactly one 201 (line creator), the rest 200, a single cart document with one line at quantity `RACE_SIZE`. Sets `NODE_CART_LINE_MAX` via `withEnvironment` so the per-line ceiling never triggers mid-race.
- **`describe('R3 — concurrent adds of DIFFERENT products')`** — Fires `RACE_SIZE` parallel `POST /cart` calls, each for a distinct product. Asserts one cart with `RACE_SIZE` unique product lines. This is the case that specifically distinguishes a working `$ne`-in-filter guard from a broken one (a single-product race cannot expose the "two lines, same product" failure).
- **`describe('R3 — concurrent quantity writes to the same line')`** — Seeds a line, then races `PUT /cart/:productId` with different quantities. Asserts the surviving quantity is one of the values actually sent (last-writer-wins semantics), no second cart, no merge artefact.
- **`describe('R2 — concurrent checkouts of one cart')`** — Five cases: exactly one order created; one success + N-1 409s; cart emptied to zero items; no orphan order from a losing request; product inventory hold released to the product rather than leaked on a ghost order.
- **`raceN`, `countStatus`, `expectNoServerErrors`, `RACE_SIZE`** (from `@tests/race`) — concurrency harness utilities used throughout.
- **`checkoutAs`** (from `@tests/checkout-as`) — wraps the full checkout `POST` so each racer performs the same multi-step flow.

## Relationships

- **`src/modules/cart/model.ts`** — `cartModel` is queried directly after each race to assert document count, line count, and quantity.
- **`src/modules/orders/model.ts`** — `orderModel` is queried to assert exactly one order exists and its item quantity is intact.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` / `readOrder` provide order-assertion helpers.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` seeds a shipping address required before checkout.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates inventory-backed products for each scenario.
- **`src/modules/users/tests/factories.ts`** — `createUser` (indirectly via `authenticateAs`) provides the test user identity.
- **`src/modules/products/index.ts`** / **`src/modules/products/services/index.ts`** — `productService` imported for product-side state assertions (e.g., hold release).
- **`src/modules/cart/services/index.ts`** / **`src/modules/cart/repository.ts`** — `cartService` and `cartRepository` are imported to give the test access to the same service/repository layer the HTTP handler exercises.
- **`src/kernel/outbox.ts`** — `outboxEventModel`, `relayOutbox`, `settleOutboxNudges` clean up the outbox so `order.created` events from the winning checkout don't leak into subsequent tests.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-process domain-event bus between tests.
- **`src/modules/webhooks/module.ts`**, **`src/modules/webhooks/repository.ts`**, **`src/modules/webhooks/secrets.ts`** — `webhooksModule`, `webhookSubscriptionRepository`, `webhookDeliveryRepository`, and `mintRingSecret` set up and tear down webhook subscriptions/deliveries triggered by the checkout event, ensuring the outbox relay path is fully exercised and cleaned.

## Notes

- Cases 3 and 4 (same-product vs. different-product races) are intentionally distinct: only the multi-product case can expose the "one product on two lines" failure mode that the `$ne`-in-filter guard prevents. A single-product race is indistinguishable from correct behaviour.
- The R2 hold-release test (`gives the loser its hold back`) exists because `reserveForOrder` runs *before* the transaction that may abort; without explicit release on abort, the product accumulates an unfindable permanent hold keyed to a non-existent order.
- `NODE_CART_LINE_MAX` is set to `RACE_SIZE` in the same-product test specifically so the per-line ceiling does not reject late arrivals and mask the concurrency assertion.
- The file is labelled as the *reference* implementation the R2 fix (`clearLinesIfUnchanged`) was modelled on; the R3 cases were the missing tests that had never exercised the retry/`$ne`-in-filter path in `cart/repository.ts`.
