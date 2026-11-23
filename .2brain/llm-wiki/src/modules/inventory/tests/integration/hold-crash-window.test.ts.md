---
source: src/modules/inventory/tests/integration/hold-crash-window.test.ts
generated_at: 2026-11-22T05:26:40.212228+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/hold-crash-window.test.ts

## Purpose
Integration tests for the inventory module's crash-safety guarantee. Claiming a reservation hold's status and moving each line's stock counters happen in one transaction, so a failure partway through undoes the claim as well. A retry then finishes the job instead of seeing a closed hold and reporting "already done" while counters never moved. Each test checks that the stock level agrees with the hold's status after the failed call and after the retry.

## Key elements
- `setupTestDb()` / `afterEach(jest.restoreAllMocks)`: set up the test DB and undo spies between tests.
- `ORDER`: a 24-character hex string used as a valid ObjectId order id.
- `failOnce(reason)`: spies on `stockLevelRepository.applyDelta` so the first call with the given `StockMovementReason` rejects with `connection reset`. Other calls pass through to the real implementation.
- `levelOf(productId)`: returns `{ onHand, reserved }` for a product's level row.
- `ledgerIdsOf(orderId)`: returns ids of stock-movement rows whose `reference` is the order, oldest first.
- `itemCount()`: returns how many lines the `ORDER` hold currently has.
- Test groups:
  - **Crash between claim and counter move**: covers `shipForOrder`, `releaseForOrder` and `releaseCommittedForOrder`. Each fails once, retries, and expects the final counters (`onHand` 6 or 10, `reserved` 0). The ship case also asserts the hold is still `committed` after the failure.
  - **A line whose counters refuse**: the later line has `reserved` forced to 0. `shipForOrder` rejects with `the counters refused`, and the hold stays `held` with the earlier line's counters unchanged.
  - **Checkout killed between two lines**: a gate holds back the second line's reserve write while the hold is expired and `runReservationSweep()` runs. The sweep releases only the line already taken. The other order's reserved units are untouched, the checkout rejects, the hold ends `released`, and the unwind gives back nothing a second time. The ledger rows are unchanged, and there are exactly 2 of them.
  - **Rollback whose release throws**: `reserveForOrder` returns `held: false`, but the hold stays `held` with 4 reserved. After the hold is expired, the sweep frees the units.

## Relationships
- `inventoryService` (`src/modules/inventory/services/index.ts`): the system under test (`reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`, `releaseCommittedForOrder`, `runReservationSweep`).
- `reservationRepository` and `stockLevelRepository` (`src/modules/inventory/repository.ts`): used to read hold status and level rows. `stockLevelRepository.applyDelta` is spied on to inject failures and gates.
- `stockLevelModel`, `reservationModel`, `stockMovementModel` (`src/modules/inventory/model.ts`): used for direct DB manipulation (zeroing `reserved`, expiring a hold) and for ledger queries.
- `createProduct` (`src/modules/products/tests/factories.ts`): creates products with an `onHand` quantity.
- `StockMovementReason` (`src/types/index.ts`): selects which `applyDelta` call fails or waits.
- `setupTestDb` (`tests/support/setup-test-db.ts`): DB lifecycle.
- `src/modules/delivery/tests/unit/fulfillment.test.ts` is a graph neighbor, but this file has no visible interaction with it.

## Notes
- `failOnce` matches on the movement reason, not the product, and disarms after one rejection.
- The mid-checkout test polls `itemCount()` every 5 ms until the first line is in the hold. It opens the gate after the assertions-relevant state is captured so no transaction hangs past teardown.
- The tests use `toSorted()` on product ids so line order is deterministic.
- Failures are simulated at the `applyDelta` layer, not by killing a process.
