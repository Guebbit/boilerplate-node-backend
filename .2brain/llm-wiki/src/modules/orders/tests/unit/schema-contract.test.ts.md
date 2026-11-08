---
source: src/modules/orders/tests/unit/schema-contract.test.ts
sha256: 008598e6fd214135c1b872d5ae42240ee81c0fc511812d8ca519c539b9d2a17b
generated_at: 2026-11-08T07:13:53.693017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Asserts the **declaration** of `orderSchema` directly — required paths, types, enums, defaults, validation ranges, embedded sub-schema shapes, index names/directions/options, and `timestamps` — without a database. It exists because integration tests (which drive real saves) cannot catch declaration defects such as a dropped `required`, a flipped `_id: false`, or a reversed index direction, since none of those change what a *valid* document looks like.

## Key elements

- **`describe('orderSchema — what an order must carry')`** — Pins the required set to exactly `['currency', 'email', 'orderNumber']`; asserts `userId` is `ObjectId` type; confirms `notes`, `shippingMethod`, `deletedAt` are *not* required.
- **`describe('orderSchema — status')`** — Locks the `status` enum to `Object.values(OrderStatus)` and the default to `OrderStatus.pending`.
- **`describe('orderSchema — money')`** — Asserts `shippingCost` has no default (stays absent) and that negative values are refused by validation.
- **`describe('orderSchema — the embedded snapshots')`** — Verifies `items` and `items.product` have no `_id`, no inherited indexes; `shippingAddress` / `billingAddress` have `_id: false`, a fixed required set, and `phone` optional; `items.product.taxRate` is required in `[0, 1]`.
- **`describe('orderSchema — indexes')`** — Asserts the exact nine named index specs (name + field + direction) and the unique/sparse option map.
- **`describe('orderSchema — options')`** — Confirms `timestamps: true` is enabled.

## Relationships

- **`src/modules/orders/model.ts`** — Source of the `orderSchema` object under test.
- **`src/types/index.ts`** — Provides the `OrderStatus` enum used to assert the `status` field's allowed values and default.
- **`tests/support/schema.ts`** — Supplies all no-DB inspection helpers (`requiredPaths`, `typeOf`, `defaultOf`, `enumOf`, `subSchema`, `optionsOf`, `pathOptions`, `refuses`, `indexSpecs`, `indexOptionSpecs`) that read the schema object without a connection.

## Notes

- `userId` is intentionally **absent** from the required set: account-erasure unsets it, so the schema must not claim it is always present.
- Index names are asserted as literal strings (e.g. `orders_createdAt`) rather than derived, because Mongo identifies an index by name — a rename leaves the old index in production.
- The test checks that embedded sub-schemas declare **no indexes of their own**, preventing Mongoose from silently copying catalogue indexes onto the order collection's `items.*` paths.
- `shippingCost` is asserted to have **no default** (not `0`), matching the OpenAPI contract that both `shippingCost` and `shippingMethod` are absent together when no delivery was chosen.
