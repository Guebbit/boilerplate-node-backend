# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Unit test that asserts the **declarations** of `orderSchema` directly (required fields, types, defaults, enum values, sub-schema shapes, index names/directions/options, and `timestamps`). It exists because the integration suite (`tests/integration/model.test.ts`) only exercises valid documents and therefore cannot detect declaration drift — a removed `required`, a flipped `_id: false`, a reversed index direction, or disabled `timestamps` would all let integration fixtures pass while silently breaking production behaviour.

## Key elements

- **`describe('orderSchema — what an order must carry')`** — asserts `requiredPaths` is exactly `['email', 'userId']` (bidirectional: catches both a missing and an extra `required`), that `userId` is typed `ObjectId` (not string, which would silently match zero docs in `$match`), and that `notes`, `shippingMethod`, `deletedAt` remain optional.
- **`describe('orderSchema — status')`** — asserts the `status` enum equals `Object.values(OrderStatus)` and its default is `OrderStatus.pending`.
- **`describe('orderSchema — money')`** — asserts `shippingCost` defaults to `0` and has `min: 0` (rejects negative values).
- **`describe('orderSchema — the embedded snapshots')`** — asserts `items` sub-schema has `_id: false`, requires `quantity`, sets `excludeIndexes: true` on `product` (so catalogue indexes aren't duplicated onto the order collection), and verifies no order-level index references `items.*`. Asserts `shippingAddress` sub-schema has `_id: false` and requires all address fields except `phone`.
- **`describe('orderSchema — indexes')`** — asserts exactly three named indexes with correct direction (`orders_email`, `orders_userId_createdAt` with `createdAt-1`, `orders_userId_deletedAt`) and that none carry `unique` or `sparse` options.
- **`describe('orderSchema — options')`** — asserts `timestamps: true` so `createdAt`/`updatedAt` are maintained.

## Relationships

- **`src/modules/orders/model.ts`** — source under test; `orderSchema` is the single import from this module.
- **`src/types/index.ts`** — provides `OrderStatus`, used to assert the schema's status enum matches the canonical lifecycle states.
- **`tests/support/schema.ts`** — supplies all assertion helpers (`requiredPaths`, `typeOf`, `defaultOf`, `enumOf`, `subSchema`, `pathOptions`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) that inspect the Mongoose schema object without a database connection.

## Notes

- **Bidirectional assertions:** several tests use `toEqual` (exact set) rather than `toContain` so that both adding *and* removing a declaration fail the test.
- **Index names are pinned, not just shapes:** Mongo identifies indexes by name; a silent rename leaves the old index in production and builds a duplicate. The tests therefore assert the full `name: cols+direction` string.
- **`excludeIndexes` on `items.product`:** without it, Mongoose copies every catalogue index onto the order collection, creating indexes on `items.product.*` that no query ever uses. The test asserts both the flag and its consequence (no order index touches `items.*`).
- **Complementary, not redundant:** this file and `tests/integration/model.test.ts` cover different failure modes (declaration vs. behaviour) and neither replaces the other.
