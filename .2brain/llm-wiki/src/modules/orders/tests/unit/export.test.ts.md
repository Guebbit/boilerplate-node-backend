---
source: src/modules/orders/tests/unit/export.test.ts
sha256: ef6282b0ac990208d2674c745c8572ff4bf111f0234bd318fe3dcd79bc26e9d7
generated_at: 2026-10-29T04:58:59.410375+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/export.test.ts

## Purpose

Unit tests for the `toOrderCsvRow` mapper, verifying that a single order is serialized into a flat, key-ordered object suitable for direct CSV consumption. It guards column completeness, ordering, date normalization, and the "empty cell for missing payment" contract.

## Key elements

- **`order` fixture** – A fully-populated `OrderCsvSource` (paid, delivered, fulfilled, no return) used as the happy-path input.
- **`describe('toOrderCsvRow')`** – The sole test block, containing two cases:
  - *Column contract* – asserts `Object.keys(row)` matches `ORDER_CSV_COLUMNS` exactly and in order, and that every value is the expected string/number (dates normalized to UTC ISO `…T…Z`).
  - *Empty cells* – overrides `paymentStatus` to `'unpaid'` and sets `paymentMethod` / `paidAt` to `undefined`, asserting both resolve to `''` rather than the literal string `"undefined"`.

## Relationships

- **`src/modules/orders/domain/index.ts`** – Re-exports `ORDER_CSV_COLUMNS`, `toOrderCsvRow`, and the `OrderCsvSource` type that this file imports via `../../domain`.
- **`src/modules/orders/domain/export.ts`** – The implementation under test; provides `toOrderCsvRow`, the `ORDER_CSV_COLUMNS` constant, and the `OrderCsvSource` interface.

## Notes

- `toEqual` does **not** compare key order, so the test explicitly asserts the array form of `ORDER_CSV_COLUMNS` to pin column sequence. If columns are added or reordered in the domain, this assertion must be updated in lockstep.
- Date inputs arrive as either `Date` (store) or ISO string (wire); the test covers both shapes (`createdAt` is a `Date`, `paidAt` is a string) to confirm uniform UTC ISO output.
- The empty-cell test relies on the mapper coercing `undefined` → `''`; it does not test `null` or other falsy values.
