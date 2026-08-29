# src/modules/delivery/tests/unit/rates.test.ts

## Purpose

Unit tests for the pure, table-driven shipping-rate functions in `domain/rates.ts`. Because the pricing logic operates over a static in-memory table (no DB, no I/O), it qualifies as a genuine unit test and lives here rather than in `tests/integration/`.

## Key elements

- **`describe('findShippingMethod')`** — Verifies lookup by known id returns the expected object, and that an unknown id yields `undefined`.
- **`describe('priceShipping')`** — Covers four pricing paths: flat rate below the free-shipping threshold, zero cost at/above the threshold, a method with no threshold (always flat), and the special-case pickup method priced at 0 (distinct from "method not found").
- **`describe('SHIPPING_METHODS')`** — Data-canary: asserts every entry in the committed table has a non-negative `price`, catching a typo before it surfaces at checkout.

## Relationships

- **Imports from `src/modules/delivery/domain/rates.ts`** — the sole production dependency. Pulls in `findShippingMethod`, `priceShipping`, and the `SHIPPING_METHODS` constant; every assertion in this file exercises those three exports.

## Notes

- The file header documents *why* this test lives in `unit/` rather than `integration/`: the pricing rule is pure, while `service.test.ts` required a real database and was moved out. If the domain gains DB or network I/O, these tests would need to relocate.
- The `SHIPPING_METHODS` block is a data-validation guard (canary), not a logic test — it exists to catch a bad committed value, not a code path.
- Pickup pricing (0) is deliberately tested separately from the "no method" case (`undefined`) to prevent a future refactor from conflating the two.
