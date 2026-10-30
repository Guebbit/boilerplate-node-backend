---
source: src/modules/orders/tests/unit/schema-contract.test.ts
sha256: 008598e6fd214135c1b872d5ae42240ee81c0fc511812d8ca519c539b9d2a17b
generated_at: 2026-10-29T05:00:15.815540+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Asserts the Mongoose `orderSchema` object's *declarations* (required paths, types, defaults, enums, sub-schema options, index names/directions/flags) directly against expected values. It exists because integration tests that drive real saves will pass even when a `required` flag is dropped, a `_id: false` is flipped, or an index direction is reversed — none of those change what a valid document looks like, so only introspecting the schema object catches them.

## Key elements

- **`describe('orderSchema — what an order must carry')`** — asserts `requiredPaths` equals exactly `['currency','email','orderNumber']`; `userId` is `ObjectId` type; `notes`, `shippingMethod`, `deletedAt` are *not* required.
- **`describe('orderSchema — status')`** — asserts `enumOf` matches `Object.values(OrderStatus)` and `defaultOf` is `OrderStatus.pending`.
- **`describe('orderSchema — money')`** — asserts `shippingCost` has no default and `refuses` negative values but not zero.
- **`describe('orderSchema — the embedded snapshots')`** — asserts `items` has no `_id`, requires `quantity`, its nested `product` has no inherited indexes and requires `taxRate` in [0,1]; `shippingAddress`/`billingAddress` have no `_id`, require city/country/fullName/street/zip, and do *not* require `phone`.
- **`describe('orderSchema — indexes')`** — asserts the exact set of nine named indexes with their directions, and the exact unique/sparse flags per index.
- **`describe('orderSchema — options')`** — asserts `timestamps` is `true`.
- **Test helpers imported from `@tests/schema`** — `requiredPaths`, `typeOf`, `enumOf`, `defaultOf`, `refuses`, `subSchema`, `optionsOf`, `pathOptions`, `indexSpecs`, `indexOptionSpecs`.

## Relationships

- **`src/modules/orders/model.ts`** — source of `orderSchema`, the single object under test in every block.
- **`src/types/index.ts`** — source of the `OrderStatus` enum used to assert the status field's allowed values and default.
- **`tests/support/schema.ts`** — provides all ten introspection helpers; no database connection is needed because the helpers read the schema object's internal structure directly.

## Notes

- `userId` is intentionally absent from `requiredPaths`; a comment explains that account erasure unsets it, so the schema cannot claim it is always present.
- Index assertions are **exact-match** (both the name list and the per-index option list), so adding, removing, or renaming an index breaks the test. A rename is specifically called out as dangerous because Mongo identifies indexes by name.
- The embedded `items.product` sub-schema uses `orderLineProductSchema` (not the catalogue's `productSchema`) specifically so no catalogue indexes are inherited onto `items.product.*`.
- The `_id: false` checks on embedded sub-schemas (`items`, `shippingAddress`, `billingAddress`) exist because Mongoose's default `_id: true` would inject an ObjectId into every embedded document, violating the `additionalProperties: false` OpenAPI contract.
