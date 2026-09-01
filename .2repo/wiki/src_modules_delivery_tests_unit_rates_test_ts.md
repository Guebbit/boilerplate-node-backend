# src/modules/delivery/tests/unit/rates.test.ts

## Purpose
Unit tests for the pure shipping-rate domain functions (`findShippingMethod`, `priceShipping`) and the `SHIPPING_METHODS` table. No database or mocks are needed because the pricing logic is a static lookup plus a threshold check; this file exists to pin that behaviour in isolation from the persistence layer (which lives in `tests/integration/`).

## Key elements
- **`describe('findShippingMethod')`** — verifies lookup by id (`express`) and `undefined` for an id the shop does not offer (`overnight`).
- **`describe('priceShipping')`** — covers the four pricing branches: flat rate below the free-shipping threshold, zero at/above the threshold, flat rate when the method has no threshold (`express`), and the special `pickup` method that always prices at zero.
- **`describe('SHIPPING_METHODS')`** — a data-integrity canary: asserts every entry in the committed table has a non-negative `price`.

## Relationships
- **`src/modules/delivery/domain/rates.ts`** — the sole import target. This test file exercises `findShippingMethod`, `priceShipping`, and the `SHIPPING_METHODS` constant exported from that module. No other files are imported.

## Notes
- The module doc comment explicitly records *why* `service.test.ts` was moved to `tests/integration/`: the pricing rule is pure, the service persistence is not. If you add a new shipping method, update `SHIPPING_METHODS` in the domain file and add a case here.
- The `pickup` method is asserted to price at zero, which is intentionally distinct from the `undefined` case (an unknown id). A regression that conflates the two would pass the `express` tests but fail the `pickup` one.
- Tests use `!` (non-null assertion) on `findShippingMethod(...)` results because the valid ids are known at test-writing time; the `undefined` path is covered separately.
