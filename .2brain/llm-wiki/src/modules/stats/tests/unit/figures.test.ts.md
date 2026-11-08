---
source: src/modules/stats/tests/unit/figures.test.ts
sha256: 4770353af79276358b5f85eeb3c8ff1c124a0ee329a438a7add010e014428354
generated_at: 2026-11-08T08:26:59.105137+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/tests/unit/figures.test.ts

## Purpose

Unit tests for the sales-figures service. Verifies that `figuresOf` correctly computes net sales (goods minus reversals), net shipping and VAT (charged minus refunded), and average order value; that `addRawFigures` composes buckets additively; and that `rateOf` handles a zero denominator.

## Key elements

- **`eur(amount)`** — local helper that wraps `toMinorUnits(amount, 'EUR')` so test fixtures can be written in major units.
- **`describe('figuresOf')`** — three cases: (1) a two-order fixture with one credit note, asserting the full computed object; (2) an empty shop, asserting all-zero output and no crash; (3) a JPY fixture, confirming integer-only output when the currency has no minor unit.
- **`describe('addRawFigures')`** — asserts that two buckets sum field-by-field (orders, goods).
- **`describe('rateOf')`** — asserts `rateOf(1,4) === 0.25` and `rateOf(3,0) === 0`.

## Relationships

- **`src/modules/stats/services/figures.ts`** — the system under test; this file imports `figuresOf`, `addRawFigures`, `emptyRawFigures`, and `rateOf` from it.
- **`src/domain-primitives/money.ts`** — provides `toMinorUnits`, used by the `eur` helper and the JPY fixture to convert major-unit test values into the integer minor-unit representation the service expects.

## Notes

- The `raw` fixture is defined once at the top of the `figuresOf` describe block and shared by its `it` cases; the zero-orders and JPY cases build their own inline fixtures.
- The AOV assertion (`'70.00'`) encodes the formula `netSales / orders`, i.e. 140 / 2, not `(invoicedGoods - creditedGoods) / orders`. If the service formula changes, this test is the one to update.
- JPY test uses `toMinorUnits(1000, 'JPY')` directly (no `eur` helper) and expects an integer string `'333'` (floor of 1000/3), documenting the no-decimal division path.
