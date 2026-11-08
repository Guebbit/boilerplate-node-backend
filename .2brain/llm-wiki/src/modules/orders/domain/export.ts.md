---
source: src/modules/orders/domain/export.ts
sha256: f00d8f821e2ff8d3d7956507c7e61f50b394348f387a9730fd839948e02a259d
generated_at: 2026-11-08T06:48:20.589049+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/export.ts

## Purpose

Defines the shape and mapping of a single orders-CSV row: which columns appear (and in what order), what fields an order must supply, and the pure function that converts an order into a row of cells. It exists so the CSV contract is declarative, testable, and decoupled from the transport (writing, escaping, streaming) handled elsewhere.

## Key elements

- **`ORDER_CSV_COLUMNS`** — `as const` tuple listing the 13 CSV headers in file order. The string value of each entry is both the key and the header.
- **`OrderCsvColumn`** — Union type of the column names, derived from the tuple.
- **`OrderCsvSource`** — A `Pick` of `Order` fields (plus optional `createdAt`/`paidAt` as `string | Date | undefined`) that a row needs. Intentionally excludes address fields.
- **`isoOf`** (private) — Normalises a stored `Date`, its ISO string, or `undefined` into an ISO-8601 UTC string (or `''`).
- **`toOrderCsvRow`** (exported) — Pure mapping from an `OrderCsvSource` to `Record<OrderCsvColumn, string | number>`. `lines` maps to `totalItems`, `units` to `totalQuantity`; `paymentMethod` falls back to `''`.

## Relationships

- **`src/types/index.ts`** — Provides the `Order` interface that `OrderCsvSource` picks fields from.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export for the orders domain; makes `ORDER_CSV_COLUMNS`, `OrderCsvColumn`, `OrderCsvSource`, and `toOrderCsvRow` available to consumers.
- **`src/modules/orders/services/export.ts`** — The service that iterates orders, calls `toOrderCsvRow` per row, and writes/escapes the CSV. Formula-escaping (`escape_formulas`) lives there, not here.
- **`src/modules/orders/tests/unit/export.test.ts`** — Unit tests exercising `toOrderCsvRow` and the column list.

## Notes

- **No address fields.** Both billing and shipping addresses are field-encrypted at rest; an export does not justify decryption, so they are simply absent from the column set.
- **Email is included as-is.** `zod.email()` accepts `+cmd@…` patterns, so a cell can begin a spreadsheet formula. The doc comment explicitly delegates escaping to the CSV writer (`escape_formulas` in the service layer), not to this module.
- **Date fields are optional and dual-typed.** `createdAt` and `paidAt` accept `Date` (repository-normalised rows) or `string` (serialised rows); `isoOf` handles both, returning `''` for `undefined`.
- **`lines` ≠ `units`.** `lines` is the count of order line items (`totalItems`); `units` is the summed quantity across those lines (`totalQuantity`). They are distinct columns.
