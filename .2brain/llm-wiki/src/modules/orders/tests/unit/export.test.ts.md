---
source: src/modules/orders/tests/unit/export.test.ts
sha256: a2866cd3e2be06f3b64da2d89a289f6da3d6b9ec6d444d9496a4f29614a73300
generated_at: 2026-10-15T11:19:19.054740+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/export.test.ts

## Purpose

Unit tests for `toOrderCsvRow`, verifying that a single order object is flattened into a CSV-ready row with the correct column names, UTC ISO date strings, and empty-string cells for missing payment data on unpaid orders.

## Key elements

- **`order` fixture** – A typed `OrderCsvSource` representing a paid, delivered, never-returned order (2 lines, 3 units, EUR). Serves as the primary input for both test cases.
- **`describe('toOrderCsvRow')`** – Two assertions:
  - *Column shape & values*: `Object.keys(row)` must match `ORDER_CSV_COLUMNS` exactly, and every cell value (including date normalisation to `.000Z` ISO strings) is checked via `toEqual`.
  - *Unpaid empty cells*: When `paymentStatus` is `'unpaid'` and `paymentMethod`/`paidAt` are `undefined`, the row carries `''` in those cells rather than the string `"undefined"` or `undefined`.

## Relationships

- **`src/modules/orders/domain/export.ts`** – The module under test. Provides `toOrderCsvRow`, `ORDER_CSV_COLUMNS`, and the `OrderCsvSource` type that the fixture and assertions rely on.
- **`src/modules/orders/domain/index.ts`** – Barrel re-export through which this file imports the three symbols above (`import … from '../../domain'`).

## Notes

- The first test asserts key **order** via `toEqual([...ORDER_CSV_COLUMNS])`; adding, removing, or reordering a column in `ORDER_CSV_COLUMNS` will break this test even if the values are still correct.
- Date inputs are intentionally mixed: `createdAt` is a `Date` object while `paidAt` is already an ISO string. The test confirms both arrive as identical `.000Z`-precision strings in the output.
- The empty-cell test checks for the empty **string** `''`, not `undefined` — this is the contract a downstream CSV writer expects (it would otherwise serialise `undefined` as the literal text `"undefined"`).
