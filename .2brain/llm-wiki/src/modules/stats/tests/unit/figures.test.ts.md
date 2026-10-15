---
source: src/modules/stats/tests/unit/figures.test.ts
sha256: f3ce57ba9b85a57db92e222947e88e0bc2f21379c9f5b6f6b1920008eaeec33e
generated_at: 2026-10-15T12:05:35.021252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/figures.test.ts

## Purpose

Unit tests for the figures calculation service, verifying the core sales formulas: net sales subtracts reversals, shipping and VAT are computed as charged-minus-refunded, and no division by zero orders occurs. Also covers field-by-field aggregation and the safe-rate helper.

## Key elements

- **`eur(amount)`** — local helper that delegates to `toMinorUnits(amount, 'EUR')` so test fixtures read in whole-euro notation.
- **`describe('figuresOf')`** — three tests against a shared two-order fixture: (1) net/shipping/tax/refund arithmetic, (2) empty-shop yields all zeros without a crash, (3) JPY (no minor unit) produces a floored `averageOrderValue`.
- **`describe('addRawFigures')`** — confirms two raw-figure objects sum field-by-field (orders, goods, etc.).
- **`describe('rateOf')`** — verifies the simple share calculation (`part / whole`) and the `0 / 0 → 0` guard.

## Relationships

- **`src/modules/stats/services/figures.ts`** — the system under test; this file imports `figuresOf`, `addRawFigures`, `emptyRawFigures`, and `rateOf`.
- **`src/shared-kernel/money.ts`** — provides `toMinorUnits`, used both by the `eur` helper and directly in the JPY test to construct fixtures in the correct minor-unit representation.

## Notes

- Assertions compare against **major-unit** numbers (e.g. `140`, `24.2`) even though the fixtures are built in **minor units** (cents). The service under test is expected to convert back; if it doesn't, the tests will fail with a factor-of-100 mismatch.
- The JPY test asserts `averageOrderValue === 333` (integer), pinning the expectation that division for no-minor-unit currencies truncates rather than rounds.
- `emptyRawFigures()` is spread into every fixture object; adding a new field to the raw shape without updating `emptyRawFigures` will silently produce `undefined` here and surface as a `toEqual` / `toMatchObject` mismatch.
