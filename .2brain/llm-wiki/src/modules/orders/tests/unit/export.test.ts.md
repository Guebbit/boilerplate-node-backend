---
source: src/modules/orders/tests/unit/export.test.ts
source_sha256: 81cb469a3094814bbafa4b0f9814ce9939f25196d1c29d54982e176099af911f
context_sha256: 4e893c7176e263909b84a77e13d86d3fce731923dc56142b838458954a46f5f8
generated_at: 2026-11-22T06:35:51.801241+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/export.test.ts

## Purpose
Unit tests for `toOrderCsvRow`, which turns one order into one CSV row. They check that every declared column is filled in a fixed order, that dates come out as UTC ISO text whether the source value is a `Date` or a string, and that an unpaid order's missing payment fields become empty cells.

## Key elements
- `order` — fixture of type `OrderCsvSource`: a delivered, paid, fulfilled, never-returned order with 2 lines, 3 units, total `'59.90'` EUR, paid by card. `createdAt` is a `Date` and `paidAt` is an ISO string, so both input forms are covered.
- Test "fills exactly the columns the file declares":
  - `Object.keys(row)` must equal `ORDER_CSV_COLUMNS`.
  - `ORDER_CSV_COLUMNS` is pinned to its literal order: `createdAt`, `orderNumber`, `status`, `paymentStatus`, `fulfillmentStatus`, `returnStatus`, `email`, `lines`, `units`, `total`, `currency`, `paymentMethod`, `paidAt`.
  - The full row must equal the expected object. `totalItems` maps to `lines`, `totalQuantity` to `units`, `totalPrice` to `total`. `createdAt` is serialized as `'2026-05-01T09:30:00.000Z'`.
- Test "leaves the cells of an unpaid order with no method empty": with `paymentStatus: 'unpaid'` and `paymentMethod` and `paidAt` both `undefined`, the row's `paymentMethod` and `paidAt` are `''`, not `"undefined"`.

## Relationships
- Imports `ORDER_CSV_COLUMNS`, `toOrderCsvRow` and the type `OrderCsvSource` from `../../domain`, which resolves to `src/modules/orders/domain/index.ts`, the domain barrel.
- `src/modules/orders/domain/export.ts` is a graph neighbor and presumably where these exports are implemented, though the test does not import it directly.
- Tests only this domain export surface. It does not touch a store, a CSV writer or the network.

## Notes
- The separate `Object.keys`/`ORDER_CSV_COLUMNS` assertion exists because `toEqual` ignores key order. The comment in the test says column order is pinned there.
- `describe`, `it` and `expect` are used without being imported, so they come from global test-runner configuration.
