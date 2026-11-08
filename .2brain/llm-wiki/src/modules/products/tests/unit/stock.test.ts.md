---
source: src/modules/products/tests/unit/stock.test.ts
sha256: 3b0e56462d10e88e28d177dcfa56b457aedfec6d5d09d6f3c9bd84421043803a
generated_at: 2026-11-08T07:54:51.614839+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock.test.ts

## Purpose

Unit tests for the three pure stock-calculation helpers in the products domain (`availableStock`, `stockFlags`, `preorderAllowanceLeft`). It exists so that the "how much can we sell" logic is verified in isolation—no database, no HTTP—covering every input shape that inventory and cart callers can produce, including `undefined` counters.

## Key elements

- **`describe('availableStock')`** — Table-driven cases for the on-hand / reserved arithmetic, the "absent means zero, not unlimited" rule for `undefined` inputs, and an explicit clamp-to-zero guard for the (theoretically unreachable) negative case.
- **`describe('stockFlags')`** — Table-driven cases mapping `(available, threshold)` to the `{ inStock, lowStock }` pair, including the edge case where `threshold === 0` disables the "low" flag entirely.
- **`describe('preorderAllowanceLeft')`** — Table-driven cases for the `limit - claimed` calculation, including `undefined` handling (treated as 0) and the clamp when claimed ≥ limit.

## Relationships

- **`src/modules/products/domain/stock.ts`** — The sole import target; this file exercises its three named exports (`availableStock`, `stockFlags`, `preorderAllowanceLeft`) and nothing else. The test file is the only consumer of these functions in the dependency graph, so behavioral changes in `stock.ts` are caught here before they reach `@modules/inventory` or `@modules/cart`.

## Notes

- All inputs are passed as literals; there are no mocks, fakes, or async helpers. If you add side-effectful behavior to `stock.ts`, this test suite will not catch it—add integration tests alongside.
- The "safe direction" comment on `undefined` inputs is intentional: missing stock data must read as **0 available**, never as unlimited, because the result gates a charge. Any refactor that flips that default will fail here.
- The negative-clamp test is described as a defense-in-depth assertion ("asserted rather than assumed"); removing it does not break the test suite but removes a safety net for a path that inventory transitions should already prevent.
