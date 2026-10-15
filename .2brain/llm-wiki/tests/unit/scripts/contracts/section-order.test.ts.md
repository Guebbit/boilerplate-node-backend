---
source: tests/unit/scripts/contracts/section-order.test.ts
sha256: 088f53d5b17d09bf4bba326cc20bd995397585431c6c534aeec25504b3370957
generated_at: 2026-10-15T13:26:48.939480+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/section-order.test.ts

## Purpose
Unit test suite for the `orderSections` function. It verifies that sections are returned in a preferred order, that missing sections are dropped, and that previously unknown sections are appended in alphabetical order.

## Key elements
- **`describe('orderSections', …)`** — top-level suite; defines `preferred = ['products', 'cart', 'users']` used across all cases.
- **`it('keeps the preferred order…')`** — asserts that all three existing sections come back in preferred order regardless of input order.
- **`it('drops a preferred section…')`** — asserts that a preferred section absent from the input list is omitted from the result.
- **`it('appends a module… alphabetically')`** — asserts that sections not in `preferred` are placed after the known ones, sorted alphabetically among themselves (`alpha` before `zeta`).
- **`it('is empty when nothing exists')`** — asserts an empty input yields an empty array.

## Relationships
- **Imports `orderSections` from `scripts/contracts/section-order.ts`** — the sole dependency; every assertion in this file exercises that single exported function.

## Notes
- The "alphabetical" ordering applies only to the *unknown* (non-preferred) sections; the preferred sections always come first, in their defined order.
- The `preferred` array is a local constant, not imported — if the production preferred order changes, this test's expectations must be updated in lockstep.
