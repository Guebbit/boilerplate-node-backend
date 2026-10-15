---
source: src/modules/orders/domain/export.ts
sha256: f00d8f821e2ff8d3d7956507c7e61f50b394348f387a9730fd839948e02a259d
generated_at: 2026-10-15T11:01:04.446843+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/export.ts

## Purpose

Defines the **shape** of the orders CSV export: which columns appear, in what order, and how a single order object maps to one row of cells. It is a pure, side-effect-free mapping layer so that the service that actually writes the file only deals with an array of strings/numbers, not with `Order` objects or `Date` objects.

## Key elements

- **`ORDER_CSV_COLUMNS`** – `as const` array listing the 13 CSV headers in file order (`createdAt` … `paidAt`). Also serves as the single source of truth for the header row.
- **`OrderCsvColumn`** – Union-of-literals type derived from `ORDER_CSV_COLUMNS`; used as the key type for row objects.
- **`OrderCsvSource`** – Structural type describing the minimal slice of `Order` a row needs. `createdAt` and `paidAt` are `string | Date | undefined` to accept both repository-normalized (`Date`) and serialized (`ISO string`) forms.
- **`isoOf`** *(internal)* – Coerces `string | Date | undefined` → ISO-8601 UTC string, or `''` for `undefined`.
- **`toOrderCsvRow`** – Pure function: takes an `OrderCsvSource`, returns a `Record<OrderCsvColumn, string | number>` with one entry per column. No I/O, no mutation.

## Relationships

- **`src/types/index.ts`** – Provides the `Order` type from which `OrderCsvSource` picks its fields.
- **`src/modules/orders/services/export.ts`** – Consumes `ORDER_CSV_COLUMNS` for the header and calls `toOrderCsvRow` to build each data row before handing cells to the CSV writer.
- **`src/modules/orders/domain/index.ts`** – Barrel re-export; external code reaches this module through the domain index.
- **`src/modules/orders/tests/unit/export.test.ts`** – Unit-tests `toOrderCsvRow` in isolation (mapping, `isoOf` edge cases, missing `paymentMethod`).
- **`src/modules/orders/tests/integration/export.test.ts`** – Exercises the full export path, asserting the CSV produced from real orders matches the column set defined here.

## Notes

- **No address fields.** Both address fields are field-encrypted at rest; an export is deliberately not a decryption point. Do not add them.
- **Formula injection is not handled here.** The module docstring explicitly states that `escape_formulas` in the CSV writer is responsible for neutralizing cells like `=cmd…` in the `email` column. This file passes the raw value through.
- **`total` is paired with `currency`** on purpose: a bare number is meaningless without it. Both columns are adjacent in `ORDER_CSV_COLUMNS`.
- **`lines` vs `units`** map to `totalItems` (count of line items) and `totalQuantity` (sum of quantities), respectively—not to the individual line-item details.
- **`createdAt` / `paidAt` dual type.** Callers may pass either a `Date` (fresh from a repository) or an ISO string (from a serialized API payload). `isoOf` normalises both to the same UTC string output.
