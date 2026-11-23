---
source: src/modules/orders/domain/export.ts
source_sha256: 2cbd0634c5bc6e3d6e05cc98b43c8d75e05e3baf74500d92c5d2c2ae948c74b4
context_sha256: 2604110f2b0d7210428fe6ead3850ef30395c109e0d758cf56e3eced3acf3e30
generated_at: 2026-11-22T06:11:14.031808+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/export.ts

## Purpose
Defines the shape of one line of the orders CSV export: which columns exist, what an order must supply, and how an order list row is mapped to a CSV row. The columns mirror the order list, plus `currency`. Addresses are deliberately left out because they are field-encrypted at rest and an export should not decrypt them.

## Key elements
- `ORDER_CSV_COLUMNS`: the columns in file order (`createdAt`, `orderNumber`, `status`, `paymentStatus`, `fulfillmentStatus`, `returnStatus`, `email`, `lines`, `units`, `total`, `currency`, `paymentMethod`, `paidAt`). Each key is also the header.
- `OrderCsvColumn`: union type of those column names.
- `OrderCsvSource`: the input type. It is a `Pick` of `Order` (`orderNumber`, `status`, `paymentStatus`, `fulfillmentStatus`, `returnStatus`, `email`, `totalItems`, `totalQuantity`, `totalPrice`, `currency`, `paymentMethod`), plus optional `createdAt` and `paidAt` as `string | Date`. A normalized repository row carries a `Date`; a serialized one carries an ISO string.
- `toOrderCsvRow(order)`: a pure function returning a `Record<OrderCsvColumn, string | number>`. `lines` comes from `totalItems` (the count of order lines) and `units` from `totalQuantity`. `total` comes from `totalPrice`.
- `isoOf` (private): formats a date as ISO 8601 in UTC, or `''` if undefined.

## Relationships
- Imports the `Order` type from `src/types/index.ts` (via the `@types` alias).
- `src/modules/orders/services/export.ts` and `src/modules/orders/tests/unit/export.test.ts` are the neighbors that would use these exports. Their contents are not shown here.
- `src/modules/orders/domain/index.ts` is a sibling neighbor in the same domain folder. Its contents are not shown here.

## Notes
- This file does not escape formula-injection characters. The email is in the file and `zod.email()` accepts values like `+cmd@example.com`, so a cell can start a formula. Escaping is the CSV writer's job (`escape_formulas`).
- Missing `paymentMethod` becomes `''`. Missing `createdAt` or `paidAt` also becomes `''`.
- `isoOf` calls `new Date(value).toISOString()`, which throws a `RangeError` on an unparseable date string.
