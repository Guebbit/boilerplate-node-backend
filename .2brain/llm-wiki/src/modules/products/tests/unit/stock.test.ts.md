---
source: src/modules/products/tests/unit/stock.test.ts
sha256: 90d6bd6711b741b272448eeadf93c26b0d1fa3f81586406decab649a6c550f23
generated_at: 2026-11-14T21:31:43.896983+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock.test.ts

## Purpose

Unit tests for the three pure stock-calculation functions exported from `domain/stock.ts`. Exercises every input shape the inventory and cart modules can pass, with no database or I/O involved.

## Key elements

- **`describe('availableStock')`** — Parameterized (`it.each`) cases covering normal on-hand/reserved pairs, `undefined` counters, and a negative-result clamp. Asserts `availableStock(3, 8)` → `0`.
- **`describe('stockFlags')`** — Parameterized cases asserting the `{ inStock, lowStock }` object returned by `stockFlags(available, threshold)`, including the zero-threshold boundary.
- **`describe('preorderAllowanceLeft')`** — Parameterized cases for `preorderAllowanceLeft(limit, claimed)`, including `undefined` inputs and the `null`-limit sentinel that yields `999_999`.

## Relationships

- **`src/modules/products/domain/stock.ts`** — The module under test. This file imports `availableStock`, `preorderAllowanceLeft`, and `stockFlags` from that path and asserts their return values. No other imports.

## Notes

- `undefined` counters are treated as zero (safe-failure direction), not as "unlimited."
- The negative clamp in `availableStock` is explicitly asserted despite being considered unreachable in production; the comment notes every inventory transition should guard against it, but the test documents the invariant.
- `preorderAllowanceLeft(null, 5)` → `999_999` is the "no cap" contract; the buyer is never shown the count, so a large finite sentinel suffices.
- All tests are synchronous and pure; no mocks, spies, or async utilities are used.
