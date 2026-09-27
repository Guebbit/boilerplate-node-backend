---
source: src/modules/products/tests/unit/stock.test.ts
sha256: f9a5280f1d56908294d416d5553b4a5a54200b8b05900aaa97697810d2e2b1c3
generated_at: 2026-09-27T15:35:45.473341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/stock.test.ts

## Purpose

Unit tests for the pure `availableStock(onHand, reserved)` function. Exercises every input combination callers (`@modules/inventory`, `@modules/cart`) can pass, including `undefined` counters and the edge case where reserved exceeds on-hand.

## Key elements

- **`describe('availableStock')`** — single test suite around the one function under test.
- **`it.each([...])('reads onHand %j, reserved %j as %i', …)`** — table-driven cases: normal subtraction, full reservation, `undefined` on either or both sides, and one-side-only undefined.
- **`it('clamps a would-be negative at zero')`** — asserts `availableStock(3, 8) === 0`, guarding against a negative count ever reaching a consumer.

## Relationships

- **`src/modules/products/domain/stock.ts`** — the sole import; provides the `availableStock` function under test. No other module is touched.

## Notes

- `undefined` is treated as **zero** (nothing available), not as "unlimited." The file's own comment frames this as the safe direction for a number that gates payment.
- The negative-clamp case is described in comments as *expected to be unreachable* in practice (inventory transitions should prevent reserved > on-hand), but the test asserts the clamp anyway as a last line of defense.
- Test names use `%j` (JSON) for the input placeholders and `%i` (integer) for the expected output, making failure logs human-readable.
