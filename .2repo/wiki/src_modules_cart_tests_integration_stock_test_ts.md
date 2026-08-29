# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration suite that pins the reservation model's core invariant: units are **held** (reserved) at checkout and only leave the shelf upon payment. Every assertion checks the **pair** of counters (`onHand`, `reserved`) rather than a single stock number, because a single counter cannot distinguish "reserved" from "destroyed." Runs against real Mongo (`setupTestDb`) because the guarantees under test are conditional writes (`$expr` guards) that a mock would silently swallow.

## Key elements

- **`countersOf(productId)`** — reads the product row and returns `{ onHand, reserved, available }`; every stock assertion in the file goes through this helper.
- **`withoutWindow(body)`** — wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` so any reservation opened inside is already stale by the time the sweep runs. Scoped per-test so the TTL stays non-zero for the other cases.
- **`describe('checkout holds units without selling them')`** — exercises `cartService.orderConfirm`:
  - successful checkout reserves (does not decrement `onHand`),
  - 409 refusal with per-line `CART_INSUFFICIENT_STOCK` details,
  - full-hold blocks a second buyer (`available: 0`),
  - multi-line shortfall reports **all** short lines at once,
  - partial failure rolls back earlier lines' reservations,
  - concurrent `Promise.all` checkouts: exactly one wins the conditional reserve, the other gets `available: 0` read back at refusal time.
- **`describe('the admin order create holds units like checkout')`** — same reservation semantics through `orderService.create`; includes rollback-on-failure assertions.
- **`beforeEach` block** — calls `resetDomainEvents()` then `registerModules([...])` for all eight modules, so cross-module event subscriptions (notably orders listening for `RESERVATION_EXPIRED`) are live.

## Relationships

- **`src/modules/cart/index.ts`** — imports `cartService`; the primary actor under test (`cartItemAddById`, `orderConfirm`, `cartGetForBadge`).
- **`src/modules/orders/index.ts`** — imports `orderService` and `orderRepository`; the admin-create path and the `RESERVATION_EXPIRED` listener.
- **`src/modules/inventory/index.ts` / `service.ts`** — imports `inventoryService`; its reserve/commit/expiry logic is what the counter assertions actually verify.
- **`src/kernel/registry.ts`** — `registerModules` wires module event subscriptions; without it the sweep's release-of-units has no downstream order-status update.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the bus between tests so stale subscriptions don't leak.
- **`src/modules/payments/module.ts`** — registered but **not** directly exercised; the file's header notes the payment-commit half of the invariant lives in `payments/tests/unit/service.test.ts` to respect `eslint-plugin-boundaries`.
- **`src/modules/cart/module.ts`, `src/modules/orders/module.ts`, `src/modules/inventory/module.ts`, `src/modules/account/module.ts`, `src/modules/delivery/module.ts`, `src/modules/users/module.ts`, `src/modules/products/module.ts`** — registered so their event handlers and service wiring are active during the run.

## Notes

- **Pair-of-counters discipline.** Asserting only `onHand` would pass for a shop that never reserved; asserting only `available` would pass for the old destroy-at-checkout model. Both must move together.
- **Real Mongo is mandatory.** The `$expr` guard on reserve and the two-counter guard on commit are conditional writes; a mocked repository would make them no-ops and the tests would go green for the wrong reason.
- **Module registration is load-bearing.** Omitting `ordersModule` from the registration list means `RESERVATION_EXPIRED` has no listener, so expiry tests would release units but leave orders stuck in `pending`—asserting only half the expected state.
- **`withoutWindow` is scoped, not global.** The TTL is read lazily on each reserve; setting it to zero permanently would expire reservations mid-run in every other test.
- **Concurrent-checkout loser assertion** reads `available: 0` from the *winner's* post-reserve state, not from the loser's pre-flight read—both pre-flights saw the unit as available, which is exactly what the conditional write is meant to catch.
- **Payment-commit path is intentionally absent.** Reaching into the payments service here would violate `eslint-plugin-boundaries`; that guarantee is covered in its own module's test suite.
