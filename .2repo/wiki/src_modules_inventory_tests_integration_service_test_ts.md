# src/modules/inventory/tests/integration/service.test.ts

## Purpose

Integration tests for the inventory service's module-internal guarantees: exactly-once reserve/commit/release semantics, admin transitions (receive, adjust) and their refusal paths, and the reservation sweep. Deliberately scoped to the module's own edges—cross-module lifecycle is covered by `cart/tests/unit/stock.test.ts` and replay invariants by `ledger.property.test.ts`. Runs against a real MongoDB instance because every guarantee under test is a conditional write.

## Key elements

- **`anOrderId()`** – generates a unique 24-char hex order ID per call; holds are keyed by this value.
- **`countersOf(productId)`** – reads `onHand` / `reserved` directly from the product document via `productRepository.findByIdRaw`, bypassing service-level projections.
- **`withoutWindow(body)`** – wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` so every hold it opens is immediately stale (used by sweep tests).
- **`describe('reserveForOrder')`** – atomic all-or-nothing hold; rollback is recorded (not netted); idempotency on order ID; non-duplicate DB errors propagate (surfaced by mutation testing); shortfall reports *available*, not `onHand`.
- **`describe('commitForOrder')`** – drops both counters together; at-most-once (second call returns `false`); cannot commit after release; no-op for an unknown order.
- **`describe('releaseForOrder')`** – returns units; at-most-once; records the reason (`release` vs `expire`) so the ledger distinguishes cancellation from abandonment.
- **`describe('receive')`** – raises `onHand` without disturbing existing holds; 404 for a non-existent product.
- **`describe('adjust')`** – correction in either direction; refuses if it would drop `onHand` below `reserved` (409, `INVENTORY_BELOW_RESERVED`); allows correction down to exactly `reserved`.
- **`describe('runReservationSweep')`** – (truncated in source) exercises TTL-based sweep under the `withoutWindow` helper.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/inventory/service.ts` | Module under test; all exported functions are called directly. |
| `src/modules/inventory/model.ts` | `reservationModel.create` is spied/mocked in the error-propagation test. |
| `src/modules/inventory/repository.ts` | `reservationRepository` imported (used internally by the service). |
| `src/modules/products/index.ts` | `productRepository` used by `countersOf` to read raw counters. |
| `src/modules/products/tests/fixtures.ts` | `createProduct` creates seeded products for every test. |
| `src/types/index.ts` | `StockMovementReason` enum used in assertions. |
| `tests/support/environment.ts` | `withEnvironment` temporarily sets `NODE_RESERVATION_TTL_MINUTES`. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the real Mongo test database at module load. |

## Notes

- **Real Mongo, no in-memory mocks.** Every assertion depends on conditional-write semantics (atomic find-and-update, unique-index 11000); an in-memory store would not exercise them.
- **`withoutWindow` is module-scoped, not per-test.** Setting TTL to 0 globally would expire holds that other tests in the file depend on.
- **Error-propagation test is mutation-driven.** Swallowing *any* error into `null` (making `reserveForOrder` read "already held") survived every other test in the file; only code 11000 may be mapped to `null`.
- **Rollback is recorded, not netted.** A failed multi-line reserve leaves both a `reserve` and a `release` row in the movement ledger—intentionally, so the ledger remains reconcilable.
- **Order ID shape matters.** `anOrderId` pads to 24 hex chars to match the unique-index key format; using a shorter string would change which code path the duplicate check exercises.
