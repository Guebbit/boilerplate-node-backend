# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for `evaluateCheckout` — the pure, dependency-free rule that decides whether a cart's lines can proceed to checkout. Covers empty-cart rejection, product-resolution failure, reservation-aware stock sufficiency, fail-closed handling of missing counters, and the priority order of failure reasons. Also cross-checks that the cart domain's internal availability arithmetic agrees with the inventory module's `availabilityOf`.

## Key elements

- **`line(quantity, onHand?, reserved)`** — local fixture builder that produces a `CartLineCandidate`. States both counters explicitly so tests can distinguish "zero on shelf" from "all units reserved".
- **`describe('evaluateCheckout')`** — the main block. Asserts:
  - Empty cart → `{ ok: false, reason: 'empty' }`
  - All-lines-resolved → `{ ok: true }`
  - `null`/`undefined` product → `{ reason: 'product-unavailable' }`
  - Quantity > available → `{ reason: 'insufficient-stock', shortfalls: [...] }`
  - Exact-fit (quantity === available) passes
  - Fully-reserved stock (`onHand === reserved`) → refused with `available: 0`
  - Absent counters (no `product` object) → treated as 0 available, not unlimited
  - Priority: `product-unavailable` outranks `insufficient-stock`
- **`describe('availability agrees with the inventory authority')`** — property-style cross-module check. For a set of `(onHand, reserved)` pairs (including the clamped `reserved > onHand` case), asserts the cart rule's accept/refer boundary matches `availabilityOf` exactly, pinning both sides of each boundary.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — the module under test. The file imports `evaluateCheckout` and the `CartLineCandidate` type from it.
- **`src/modules/inventory/index.ts`** — barrel re-export used to import `availabilityOf` via the `@modules/inventory` alias.
- **`src/modules/inventory/domain/transitions.ts`** — ultimate source of `availabilityOf`; the cross-check block compares the cart's embedded subtraction against this function's output.

## Notes

- **No mocks, no DB.** The file header states this explicitly. The verdict→HTTP-status mapping is intentionally excluded and lives in `service.test.ts`.
- **Duplication guard rationale.** The cross-check block exists because `rules.ts` must not import a sibling module, so it carries its own copy of the availability subtraction. The test file *may* import the rule the domain layer may not, making it the only place to pin the two implementations together.
- **Fail-closed on missing data.** A line with no `product` object (undefined counters) is refused, not allowed through. The comment references migration `20260817120000-inventory-counters.js` as the backfill that makes this a defense-in-depth case, not a live path.
- **Boundary assertions are one-sided per direction.** When `available > 0`, both "exactly `available` passes" and "`available + 1` fails" are asserted. When `available === 0`, only the rejection is asserted (a zero-quantity line is schema-impossible via `minimum: 1`).
