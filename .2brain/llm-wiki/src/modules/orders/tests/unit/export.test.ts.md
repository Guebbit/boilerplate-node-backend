---
source: src/modules/orders/tests/unit/export.test.ts
sha256: 81cb469a3094814bbafa4b0f9814ce9939f25196d1c29d54982e176099af911f
generated_at: 2026-11-08T07:12:04.170788+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/export.test.ts

## Purpose

Unit tests for `toOrderCsvRow`, verifying that an order serializes to exactly the declared CSV columns, that dates normalize to UTC ISO text regardless of input type (`Date` vs. string), and that an unpaid order's missing fields emit empty strings rather than `"undefined"`.

## Key elements

- **`order`** (fixture) — a fully paid, delivered order with two lines / three units; exercises the happy-path branch of `toOrderCsvRow`.
- **`describe('toOrderCsvRow')`** — the sole test suite in this file.
  - *"fills exactly the columns…"* — asserts the returned object's keys match `ORDER_CSV_COLUMNS` in both membership **and** order, then compares every cell value.
  - *"leaves the cells of an unpaid order…"* — spreads the fixture with `paymentStatus: 'unpaid'`, `paymentMethod: undefined`, `paidAt: undefined` and asserts those cells are `''`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — barrel re-export; this file imports `ORDER_CSV_COLUMNS`, `toOrderCsvRow`, and the `OrderCsvSource` type through it (`import { … } from '../../domain'`).
- **`src/modules/orders/domain/export.ts`** — the actual implementation of `toOrderCsvRow` and the definition of `ORDER_CSV_COLUMNS`; the function under test.

## Notes

- `toEqual` does **not** compare key order, so the test pins column order with a separate `expect(ORDER_CSV_COLUMNS).toEqual([...])` assertion. If the column array is reordered in `export.ts`, this test will fail even if the row object still maps correctly.
- The fixture deliberately mixes input types: `createdAt` is a `Date` instance while `paidAt` is already an ISO string, covering both the store and wire paths mentioned in the module docblock.
- Empty cells are asserted as `''` (empty string), not `undefined` or omitted — this is the contract a downstream CSV writer relies on.
