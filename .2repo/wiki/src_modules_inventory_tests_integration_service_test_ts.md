# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration test suite for the inventory service, exercising its own edges—exactly-once reservation claims, admin receive/adjust transitions, and their refusal paths—against a real MongoDB instance. It deliberately does not duplicate the cross-module lifecycle covered by cart unit tests or the replay invariants covered by ledger property tests; every guarantee here is a conditional (atomic) write, which is why a real database is required.

## Key elements

- **`setupTestDb()`** (module scope) — boots a real Mongo before any test runs.
- **`anOrderId()`** — returns a unique 24-char hex string (Mongo ObjectId shape) so holds are keyed distinctly per call.
- **`countersOf(productId)`** — reads `onHand` / `reserved` straight from `productRepository.findByIdRaw` for post-condition assertions.
- **`withoutWindow(body)`** — wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` so any hold opened inside is immediately stale. Defined at module scope because the TTL is read lazily on each `reserve` call; leaving it zero globally would expire holds other tests depend on.
- **`describe('reserveForOrder')`** — all-or-nothing hold, rollback recorded in the movement ledger (not netted), idempotency on order ID, non-duplicate DB error must propagate (only code 11000 is swallowed), refusal when units exist but are fully held.
- **`describe('commitForOrder')`** — drops both counters atomically; at-most-once (second call returns `false`); cannot commit an already-released hold; no-op for an unknown order.
- **`describe('releaseForOrder')`** — returns units to available; at-most-once; records the *reason* (`release` vs `expire`) in the movement ledger.
- **`describe('receive')`** — raises `onHand` and makes new stock immediately sellable; does not disturb existing holds; 404 for a non-existent product.
- **`describe('adjust')`** — applies corrections up or down; refuses a correction that would drive `onHand` below `reserved` (409, `INVENTORY_BELOW_RESERVED`); allows a correction down to exactly the reserved level.

## Relationships

- **`src/modules/inventory/service.ts`** — the system under test; every exported function (`reserveForOrder`, `commitForOrder`, `releaseForOrder`, `runReservationSweep`, `receive`, `adjust`, `listLevels`, `listMovements`) is called here.
- **`src/modules/inventory/model.ts`** — `reservationModel` is spied on (`jest.spyOn(reservationModel, 'create')`) in the error-propagation test to inject a non-duplicate failure.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` is imported (available for direct assertions on hold documents if needed).
- **`src/modules/products/index.ts`** / **`src/modules/products/repository.ts`** — `productRepository.findByIdRaw` is used by `countersOf` to assert onHand/reserved state.
- **`src/modules/products/tests/factory.ts`** — `createProduct` creates the fixture products with controlled `onHand` values.
- **`src/types/index.ts`** — `StockMovementReason` enum values (`reserve`, `release`, `expire`) are asserted in ledger-reason tests.
- **`tests/support/setup-test-db.ts`** — provides the real-Mongo bootstrap.
- **`tests/support/environment.ts`** — `withEnvironment` temporarily overrides `NODE_RESERVATION_TTL_MINUTES` for the sweep/stale-hold scenario.

## Notes

- The error-propagation test was added after mutation testing revealed that replacing the duplicate-key check with a blanket `catch → null` would make `reserveForOrder` report a successful hold on *any* database failure. Only Mongo error code **11000** (duplicate key) may be treated as "already held"; everything else must propagate.
- Movement-ledger assertions check that both the action **and** its reversal appear as separate rows. Netting to zero would be indistinguishable from "nothing happened" during a stock-take reconciliation.
- `anOrderId` produces a 24-char hex string (padded with `b`) to match the unique-index shape on the reservation collection without requiring a real `ObjectId` instance.
- The file content provided here is truncated inside the `adjust` describe block; additional cases (e.g., the "down to exactly reserved" boundary) continue beyond the visible portion.
