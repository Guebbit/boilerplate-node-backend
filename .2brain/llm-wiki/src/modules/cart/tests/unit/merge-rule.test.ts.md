---
source: src/modules/cart/tests/unit/merge-rule.test.ts
sha256: bca9021d666f11a97102a854148eeca07712357319eb339b5f4e0155415cfc2b
generated_at: 2026-10-15T10:25:42.001718+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/merge-rule.test.ts

## Purpose

Unit tests for `planMergeLine`, the cart's merge rule in the domain layer. The suite asserts the rule's invariants over a full input grid (quantity × held × visibility) rather than relying on a handful of examples, and pins the precedence order when multiple reasons apply. No mocks, no database — the function under test is pure.

## Key elements

- **`LINE_MAX` (999)** — the per-line quantity ceiling used throughout the tests.
- **`plan(facts)`** — thin wrapper that fills in `listed: true` and `lineMax: LINE_MAX` so each test case names only the variables it is actually about.
- **Individual reason cases** — one `it` per reason (`summed`, `capped`, `removed`) and the "no reason" happy path, including the boundary where the sum lands *exactly* on the ceiling (no reason) vs. passes it (`capped`).
- **Precedence block** — asserts the first-of-order rule: `removed` > `capped` > `summed`.
- **Grid invariant block** — `it.each` over a 5 × 5 × 2 Cartesian product verifies, for every combination, that `add ≥ 0`, `held + add ≤ LINE_MAX`, `add ≤ requested`, and that unlisted products always get `add: 0`. A second `it.each` confirms a `reason` is present *exactly* when the line did not land as asked.

## Relationships

- **`src/modules/cart/domain/index.ts`** — provides the `planMergeLine` function and `MergeLineFacts` type imported by this file.
- **`src/modules/cart/domain/merge.ts`** — implementation home for `planMergeLine`; this test file is its primary unit-level consumer.

## Notes

- Stock is deliberately **not** an input here. The module docstring clarifies that `planMergeLine` computes the add-amount; the separate `fitsStock` rule (not tested in this file) flags the result against inventory.
- The reason strings (`'summed'`, `'capped'`, `'removed'`) are plain literals in the test assertions. The actual locale/translation mapping lives in `src/modules/locales/services/translations.ts` but is not exercised or imported by this file.
- The grid test uses `toBeGreaterThanOrEqual` / `toBeLessThanOrEqual` on the *resulting* quantity rather than checking a single expected `add` value, which is what catches boundary off-by-one bugs a fixed-assertion test would miss.
