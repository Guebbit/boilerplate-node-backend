---
source: src/modules/products/tests/unit/stock.test.ts
sha256: 3b0e56462d10e88e28d177dcfa56b457aedfec6d5d09d6f3c9bd84421043803a
generated_at: 2026-10-29T05:35:28.528430+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock.test.ts

## Purpose
Unit tests for the three pure stock-calculation functions exported from the products domain layer. Every case a caller (`@modules/inventory`, `@modules/cart`) might pass is exercised without any database or mock.

## Key elements
- **`describe('availableStock')`** — table-driven test for `availableStock(onHand, reserved)`. Covers normal subtraction, the undefined-counter cases (absent values resolve to 0, not ∞), and a clamp assertion for the "would-be negative" edge (`availableStock(3, 8) → 0`).
- **`describe('stockFlags')`** — table-driven test for `stockFlags(available, threshold)`. Asserts the `{ inStock, lowStock }` pair across boundary values (available === threshold, threshold === 0, available === 0).
- **`describe('preorderAllowanceLeft')`** — table-driven test for `preorderAllowanceLeft(limit, claimed)`. Verifies remaining allowance, the zero-out when claimed ≥ limit, and undefined-handling.

## Relationships
- **`src/modules/products/domain/stock.ts`** — sole import target; provides the three functions under test (`availableStock`, `preorderAllowanceLeft`, `stockFlags`). No other module is referenced.

## Notes
- Undefined inputs are deliberately treated as "nothing to sell" (→ 0), not as unlimited — the comment flags this as the *safe* direction for a number that gates a charge. Tests pin that behavior.
- The negative-clamp test (`onHand 3, reserved 8`) is annotated as "should be unreachable" in production, but is asserted here so a regression can never leak a negative to a UI.
- All tests are pure-value `it.each` tables; there are no spies, mocks, or async calls.
