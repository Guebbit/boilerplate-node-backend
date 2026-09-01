# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration test suite verifying the reservation model across the full order lifecycle. The core invariant under test: units are *reserved* at checkout (neither sold nor free) and only leave `onHand` upon payment; they are recoverable via cancellation or TTL expiry. Every assertion checks `onHand` and `reserved` together to catch a shop that merely decrements stock. Runs against real MongoDB because the guarantees depend on conditional writes that mocks cannot exercise.

## Key elements

- **`countersOf(productId)`** — Helper that reads the raw product document and returns `{ onHand, reserved, available }`. Every assertion in the file goes through this so both counters are always checked.
- **`withoutWindow(body)`** — Wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` via `withEnvironment`, making any reservation immediately stale so the expiry sweep can find it. Scoped per-test to avoid breaking other cases.
- **`beforeEach`** — Resets domain events and re-registers all modules (account, cart, delivery, inventory, orders, payments, products, users). Module registration is essential so the `orders` module's `RESERVATION_EXPIRED` subscription is active for expiry cases.
- **`describe("checkout holds units without selling them")`** — Covers: successful reservation, over-available refusal, fully-held product refusal, multi-line shortfall reporting, rollback of earlier lines on a later-line failure, and concurrent checkouts racing for the last unit (conditional-write path).
- **`describe("a rollback that itself fails")`** — Forces `inventoryService.reserveForOrder` to return a shortfall and `orderRepository.deleteOne` to reject, verifying the customer still receives a 409 (not 500) and that a failed order deletion is logged via `logger.error`. Also tests the case where the hold refuses to release.

## Relationships

- **`src/modules/cart/index.ts`** / **`src/modules/cart/services/index.ts`** — Source of `cartService`; the primary SUT for `cartItemAddById` and `orderConfirm`.
- **`src/modules/cart/repository.ts`** — `cartRepository` imported (used for cart state assertions after refused checkouts).
- **`src/modules/inventory/service.ts`** / **`src/modules/inventory/index.ts`** — `inventoryService` spied on in the rollback-failure cases to force a reserve shortfall deterministically.
- **`src/modules/orders/repository.ts`** / **`src/modules/orders/index.ts`** — `orderRepository.deleteOne` mocked to reject, simulating a broken cleanup path; `orderService` available for order-state checks.
- **`src/modules/orders/module.ts`** — Registered so its `RESERVATION_EXPIRED` event subscription is live; without it the expiry tests would assert only half the behaviour.
- **`src/kernel/registry.ts`** — `registerModules` wires all module subscriptions before each test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus between tests.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` spied on to assert that a failed rollback is logged rather than swallowed or escalated to a 500.
- **`src/modules/account/module.ts`**, **`src/modules/delivery/module.ts`** — Registered for completeness so cross-module event wiring is fully active, though not directly asserted in visible cases.

## Notes

- **Real MongoDB, not mocks.** The file explicitly states the guarantees are conditional writes (atomic compare-and-set on `reserved`) that a mock cannot demonstrate. `setupTestDb()` handles the connection.
- **`clearMocks` vs. forced failures.** The rollback-failure block uses `jest.spyOn` with `mockResolvedValue`/`mockRejectedValue` and must call `jest.restoreAllMocks()` in `afterEach` because the global `clearMocks` setting empties call logs but does *not* restore implementations.
- **TTL is read lazily per-reserve.** The `withoutWindow` helper scopes `NODE_RESERVATION_TTL_MINUTES=0` to a single test body; setting it globally would expire every reservation mid-run and break the non-expiry cases.
- **Concurrent-checkout test is deterministic.** Both pre-flight checks see the unit as available; the loser is refused at the *conditional write* step. The test asserts the loser's error reports `available: 0` (the winner's post-hold state), not the earlier `available: 1` the loser saw during pre-flight.
- **Multi-line shortfall reporting.** The error payload includes *all* short lines (with product titles), not just the first, to prevent the customer from binary-searching their basket.
