# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Unit test that inspects the Mongoose `orderSchema` object **declaration-by-declaration** (required flags, types, defaults, embedded options, index specs) without a database. It exists because the integration suite (`tests/integration/model.test.ts`) exercises the schema only through valid-document saves, which cannot surface declaration defects like a dropped `required`, a flipped `_id: false`, or a reversed index direction.

## Key elements

- **`describe('orderSchema — what an order must carry')`** — asserts the exact required-path set (`['email', 'userId']`), that `userId` is typed `ObjectId`, and that `notes` / `shippingMethod` / `deletedAt` are *not* required.
- **`describe('orderSchema — status')`** — asserts the enum equals `Object.values(OrderStatus)` and the default is `OrderStatus.pending`.
- **`describe('orderSchema — money')`** — asserts `shippingCost` defaults to `0` and has `min: 0`.
- **`describe('orderSchema — the embedded snapshots')`** — asserts `items` has `_id: false`, requires `quantity`, uses `excludeIndexes` on the `product` sub-path, and that `shippingAddress` has `_id: false` with a specific required set (everything but `phone`).
- **`describe('orderSchema — indexes')`** — asserts exactly three named indexes with explicit directions, and that none carries `unique` or `sparse` options.
- **`describe('orderSchema — options')`** — asserts `timestamps` is `true`.

All assertions use helper utilities from `tests/support/schema.ts` (`requiredPaths`, `typeOf`, `enumOf`, `defaultOf`, `optionsOf`, `pathOptions`, `subSchema`, `indexSpecs`, `indexOptionSpecs`).

## Relationships

- **`src/modules/orders/model.ts`** — sole subject under test; this file imports `orderSchema` and reads its Mongoose internals directly.
- **`src/types/index.ts`** — provides the `OrderStatus` enum used to verify the `status` path's enum values and default.
- **`tests/support/schema.ts`** — supplies every schema-inspection helper; without it this file would need to reach into Mongoose internals ad hoc.

## Notes

- The file deliberately uses **set-equality** (`toEqual`) for required-path and index assertions rather than individual `toContain` checks, so that *adding* a path or index is as detectable as removing one.
- Index names are asserted verbatim because they are hand-assigned (not auto-derived); a silent rename would leave stale indexes in production.
- The `excludeIndexes` assertion on `items.product` is paired with a negative assertion (`indexSpecs` containing no `items.` entries) to prove the catalogue indexes were not copied onto the order collection.
- No database connection is opened or required — the entire file runs against the in-memory schema object.
