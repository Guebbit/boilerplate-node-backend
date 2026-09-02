# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration tests for the inventory service's own module boundaries: the all-or-nothing `reserveForOrder` semantics, exactly-once `commitForOrder` / `releaseForOrder` transitions, their refusal paths, `receive`, and `adjust` guardrails. Explicitly out of scope (covered elsewhere) are cross-module lifecycle (see `cart/tests/unit/stock.test.ts`) and the ledger replay invariant (see `ledger.property.test.ts`). All tests run against real MongoDB because every guarantee under test is a conditional write.

## Key elements

- **`anOrderId()`** — module-level counter producing 24-char hex strings (valid MongoDB ObjectId shape), one per call.
- **`countersOf(productId)`** — reads `onHand` / `reserved` via `productRepository.findByIdRaw` to assert counter state without going through the service.
- **`withoutWindow(body)`** — wraps `body` with `NODE_RESERVATION_TTL_MINUTES=0` so every hold is immediately stale. Defined at module scope (not inside a `describe`) to avoid leaking the zero-TTL into sibling suites.
- **`describe('reserveForOrder')`** — five cases: all-or-nothing shortfall, rollback recorded as a distinct movement (not netted), idempotency on duplicate order-id, non-duplicate DB error propagation (mutation-testing guard), and refusal when all units are already held.
- **`describe('commitForOrder')`** — four cases: successful commit drops both counters, at-most-once on replay, refusal after prior release, no-op for unknown order.
- **`describe('releaseForOrder')`** — two cases: at-most-once give-back, and distinct `StockMovementReason` values (`release` vs `expire`) recorded in the ledger.
- **`describe('receive')`** — three cases: raises available stock, leaves existing holds untouched, 404 for missing product.
- **`describe('adjust')`** — correction in both directions, refusal below reserved (409 `INVENTORY_BELOW_RESERVED`), boundary where `onHand` may equal but not fall below `reserved`.

## Relationships

- **`../../service`** (`src/modules/inventory/service.ts`) — system under test; all eight exported functions are exercised here.
- **`../../model`** (`src/modules/inventory/model.ts`) — `reservationModel` is spied on (`.create` mocked) to simulate a non-duplicate DB error.
- **`../../repository`** (`src/modules/inventory/repository.ts`) — `reservationRepository` imported (used in truncated portion of the file).
- **`@modules/products`** (`src/modules/products/index.ts`) — `productRepository.findByIdRaw` used by `countersOf` to assert raw counter state.
- **`@modules/products/tests/fixtures`** (`src/modules/products/tests/fixtures.ts`) — `createProduct` seeds products with specific `onHand` values.
- **`@types`** (`src/types/index.ts`) — `StockMovementReason` enum for asserting ledger reasons.
- **`@tests/setup-test-db`** (`tests/support/setup-test-db.ts`) — `setupTestDb()` initialises a real MongoDB instance at module load.
- **`@tests/environment`** (`tests/support/environment.ts`) — `withEnvironment` used by `withoutWindow` to temporarily override the reservation TTL.

## Notes

- The non-duplicate-error test exists because mutation testing showed that replacing the duplicate-key check with `true` (or swallowing all errors into `null`) would pass every other test while masking a real failure mode: a transient DB error being read as "already held."
- `withoutWindow` is deliberately **not** a `describe`-scoped helper; placing it inside a `describe` would leave the TTL at zero for the remainder of the file and expire holds that other cases depend on.
- Order IDs are 24-char hex strings to satisfy MongoDB's unique-index format on the `orderId` field, ensuring the idempotency path is genuinely exercised.
