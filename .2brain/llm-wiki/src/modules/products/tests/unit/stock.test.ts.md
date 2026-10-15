---
source: src/modules/products/tests/unit/stock.test.ts
sha256: 76de3d5bcfc93fac66f7d0728112042c1f3a7d1a084f0c6740e0c28fe0b9f452
generated_at: 2026-10-15T11:50:35.954367+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock.test.ts

## Purpose

Unit tests for the two pure stock-calculation helpers (`availableStock`, `stockFlags`) exported from the products domain layer. It exists to pin down the exact numeric and edge-case behavior that downstream modules (`@modules/inventory`, `@modules/cart`) rely on when deciding whether to let a purchase proceed.

## Key elements

- **`describe('availableStock', …)`** — Parameterized via `it.each` over `(onHand, reserved, expected)` triples covering: normal subtraction, full reservation, `undefined` on either side (treated as 0), and a mixed-undefined case. A separate test asserts the clamp: `availableStock(3, 8) → 0` rather than a negative value.
- **`describe('stockFlags', …)`** — Parameterized over `(available, threshold, inStock, lowStock)` tuples. Verifies the `{ inStock, lowStock }` object for zero-available, at-threshold, above-threshold, and zero-threshold (nothing is ever "low", only "gone") scenarios.

## Relationships

- **Imports** `availableStock` and `stockFlags` from `src/modules/products/domain/stock.ts` — the sole dependency. The tests exercise that module's full public surface; no other files are touched.

## Notes

- `undefined` inputs are an intentional contract: a missing counter means *nothing to sell*, not *unlimited*. The test file documents this explicitly in a comment because it is the "safe direction" for a value that gates payment.
- The negative-clamp test (`availableStock(3, 8)`) is annotated as "should be unreachable" under normal invariants but is asserted defensively so a regression can never surface a negative number to a UI.
- Both functions are tested as pure (no mocks, no DB, no async). If the domain module ever gains side effects, these tests will break and must be revisited.
