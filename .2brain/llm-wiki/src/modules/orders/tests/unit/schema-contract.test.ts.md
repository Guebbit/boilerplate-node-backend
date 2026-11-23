---
source: src/modules/orders/tests/unit/schema-contract.test.ts
source_sha256: 3fafbf6526b397784a4540b1e7a4ed6254d87ffbdc053764aad8e8cabf36b693
context_sha256: 49ab1f949bbe9dd3a5836eef4089d4f7f28f402ce31b1f30d7e914bfa634fb5a
generated_at: 2026-11-22T06:37:54.705939+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that assert the order schema's declarations directly (required paths, types, defaults, enums, indexes, sub-schema options) rather than saving documents. The integration test (`src/modules/orders/tests/integration/model.test.ts`) only checks that valid documents save, so it misses declaration defects such as a dropped `required`, a flipped `_id: false`, or a reversed index direction. Per the file header, these checks need no database (see `tests/support/schema.ts`).

## Key elements
Each `describe` block covers one area of `orderSchema`:

- **What an order must carry**
  - Required paths are exactly `currency`, `email` and `orderNumber`. This is asserted as a set, so adding or removing a `required` both fail.
  - `userId` is deliberately not required, because account erasure unsets it.
  - `userId` is typed `ObjectId`, since aggregation `$match` applies no casting.
  - `notes`, `shippingMethod` and `deletedAt` stay optional.
  - `orderNumber` and `currency` are strings.
- **Status**
  - The enum equals `Object.values(OrderStatus)`.
  - The default is `OrderStatus.pending`.
- **Money**
  - `shippingCost` has no default.
  - A negative `shippingCost` is refused (`-1` refused, `0` accepted).
- **Embedded snapshots**
  - `items` has `_id: false` and requires `quantity`.
  - The embedded `items.product` sub-schema declares no indexes, and no order index mentions `items.`.
  - `taxRate` on `items.product` is required, with `min` 0 and `max` 1.
  - `shippingAddress` and `billingAddress` have `_id: false`. Both require `city`, `country`, `fullName`, `street` and `zip`. `phone` is not required.
- **Indexes**
  - `indexSpecs` is asserted to equal exactly nine named indexes with their directions. For example, `orders_status_createdAt: status+1, createdAt-1`.
  - `indexOptionSpecs` is asserted to give `orders_orderNumber` as the only unique index. `orders_paidAt` and `orders_piiClockStartedAt` are the sparse ones. The others have no options.
- **Options**
  - `timestamps` is `true`.

## Relationships
- `src/modules/orders/model.ts`: provides `orderSchema`, the only subject under test.
- `src/types/index.ts`: provides `OrderStatus`, imported via `@types` and used for the status enum and default.
- `tests/support/schema.ts`: imported via `@tests/schema`. It supplies the schema-introspection helpers `defaultOf`, `enumOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathOptions`, `refuses`, `requiredPaths`, `subSchema` and `typeOf`.

## Notes
- Index names are asserted explicitly because Mongo identifies an index by name. A rename would leave the old index in production.
- The `createdAt` direction (`-1` in the compound indexes) is tested because it serves "newest first" from the index.
- The "requires the order number and the frozen currency" test partly duplicates the exact-set required-paths test.
- Several comments refer to external artifacts that are not in this file: `orderService.callerScope`, `orderTotal`/`asMoney`, `openapi.yaml`, and `orderLineProductSchema`.
