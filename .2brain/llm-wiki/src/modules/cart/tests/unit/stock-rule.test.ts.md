---
source: src/modules/cart/tests/unit/stock-rule.test.ts
sha256: 6774bde8c574399ca57a73d36af50c37a0c88b1df24c16b1acf164df88c546fc
generated_at: 2026-11-08T05:25:32.053244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/stock-rule.test.ts

## Purpose

Unit tests for `fitsStock`, the single stock-availability rule shared by checkout, cart merge, and the cart view. The file exists to lock down the exact boundary semantics of that rule (zero, over-stock, unknown) and to verify it stays consistent with the `evaluateCheckout` verdict path. No mocks, no database.

## Key elements

- **`describe('fitsStock')`** – single test suite scoped to one function; no other functions are tested here.
- **Parameterized boundary cases** (`it.each`) – covers `quantity` 0/1/5/6 against `available` 0/5, asserting the `fits` boolean.
- **Unknown-availability guard** – asserts `fitsStock(1, null)` and `fitsStock(1, undefined)` both return `false` (i.e. "unknown" is treated as "unavailable").
- **Consistency cross-check** (`it.each` over `available` 0–6) – runs `evaluateCheckout` with a single cart line of quantity 5 and asserts `verdict.ok === fitsStock(5, available)`, ensuring the checkout path and the standalone rule never diverge.

## Relationships

- **Imports from `src/modules/cart/domain/index.ts`** – pulls `evaluateCheckout` and `fitsStock` via the domain barrel; this is the *only* import in the file.
- **Exercises logic defined in `src/modules/cart/domain/rules.ts`** (assumed home of `fitsStock`) and **`src/modules/cart/domain/stock.ts`** (assumed home of `evaluateCheckout` or its stock sub-check) – the test is the executable spec for those two implementations.

## Notes

- The "short for one is short for the other" consistency test is the file's main safety net: if someone changes the comparison operator in `fitsStock` or adds a tolerance in `evaluateCheckout`, this suite catches the drift immediately.
- `quantity: 0` is explicitly allowed to fit even against zero stock (the "empty line" convention). New rules that treat 0 as invalid will break this case first.
- The test uses `null`/`undefined` for "unknown availability" rather than `-1` or a sentinel; match that convention in any new call-site.
