# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for `evaluateCheckout` in the cart domain rules, focused on the stock-availability and reservation logic. Also contains a duplication-guard suite that verifies the availability subtraction copied into `rules.ts` still agrees with the inventory module's `availabilityOf`.

## Key elements

- **`line(quantity, onHand?, reserved?)`** – Fixture builder returning a `CartLineCandidate`. Accepts both `onHand` and `reserved` separately so tests can distinguish "zero on shelf" from "everything reserved".
- **`describe('evaluateCheckout')`** – Covers: empty cart rejection; valid cart acceptance; `null`/`undefined` product (deleted vs. absent); reason priority (empty > product-unavailable > insufficient-stock); stock boundary (exact fit accepted, one-over refused); the reservation case (`onHand=40, reserved=40` → available 0); partial reservation (`onHand=40, reserved=37` → available 3); absent counters → refuse; resolution outranking availability.
- **`describe('availability agrees with the inventory authority')`** – Iterates `(onHand, reserved)` pairs (including an intentionally unreachable `reserved > onHand` case), calls `availabilityOf` from inventory, then pins the boundary from both sides through `evaluateCheckout`'s verdict. Catches silent drift in the duplicated subtraction inside `rules.ts`.

## Relationships

- **`src/modules/cart/domain/rules.ts`** – Imports `evaluateCheckout` and the `CartLineCandidate` type; this file is its primary behavioral spec.
- **`src/modules/inventory/index.ts`** – Re-exports `availabilityOf`, which the duplication-guard suite imports to act as the reference authority.
- **`src/modules/inventory/domain/transitions.ts`** – Origin of `availabilityOf` (re-exported through the index above).

## Notes

- The duplication guard exists because `rules.ts` may not import a sibling domain module (enforced via `eslint.config.ts`), so it carries its own copy of the `onHand - reserved` subtraction. A *test* file is permitted the cross-module import the rule is not; that asymmetry is what makes the guard possible.
- Absent counters (no `onHand`/`reserved` on the product doc) are treated as **zero availability → refuse**, not as "unconstrained." This is deliberate: the safe default for a rule whose only job is to refuse is to refuse.
- The reservation case (`line(1, 40, 40)`) is the scenario the old single-count model could not express; it is the key regression test for the two-counter design.
- The `available > 0` guard in the boundary-pinning loop skips the lower-side assertion when nothing is sellable, because `CartItem.quantity` has `minimum: 1` (a zero-quantity line is not representable). The one-unit-refused assertion still runs and is the meaningful check in that state.
