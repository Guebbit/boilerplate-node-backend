---
source: src/modules/orders/tests/unit/schema-contract.test.ts
sha256: 508845e4a1f14b6bf38ccb2ba3caa9a3af47e79da1109bea67aee831863aab77
generated_at: 2026-09-23T19:14:59.682609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Unit test that asserts the Mongoose schema **declaration** of `orderSchema` directly — required fields, types, defaults, enum bounds, sub-schema shapes, index specs, and schema options. It exists because integration tests that drive real saves cannot catch declaration-level defects (a removed `required`, a flipped `_id: false`, a reversed index direction) since those don't change what a valid document looks like.

## Key elements

- **`describe('orderSchema — what an order must carry')`** — Asserts the exact required set (`['email']`), that `userId` is `ObjectId` (not string), and that `notes`, `shippingMethod`, `deletedAt`, `invoiceNumber`, `transferReference` remain optional.
- **`describe('orderSchema — status')`** — Pins the `status` enum to `Object.values(OrderStatus)` and the default to `OrderStatus.pending`.
- **`describe('orderSchema — money')`** — Asserts `shippingCost` has no default and `min: 0`.
- **`describe('orderSchema — the embedded snapshots')`** — Verifies `items` sub-schema has `_id: false`, requires `quantity`; `items.product` inherits no catalogue indexes and requires `taxRate` in `[0, 1]`; `shippingAddress` has `_id: false`, requires `city/country/fullName/street/zip` but not `phone`.
- **`describe('orderSchema — indexes')`** — Asserts the exact set of six named, directed index specs and the exact set of index options (sparse/unique flags), using `toEqual` so any addition or removal fails.
- **`describe('orderSchema — options')`** — Asserts `timestamps: true`.
- **Helper imports from `@tests/schema`** — `defaultOf`, `enumOf`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `pathOptions`, `requiredPaths`, `subSchema`, `typeOf`: pure schema-object introspection utilities (no DB connection needed).

## Relationships

- **`src/modules/orders/model.ts`** — Source of `orderSchema`, the object under test.
- **`src/types/index.ts`** — Source of the `OrderStatus` enum used in the status assertions.
- **`tests/support/schema.ts`** — Provides all nine schema-introspection helpers that read Mongoose schema internals without a database.

## Notes

- Set assertions use `toEqual`, so the test fails if a `required` is *added* as well as *removed* — both directions are breaking.
- `userId` is intentionally **not** in the required set: account-erasure unsets it, so the schema cannot claim it is always present.
- Index names are explicit strings (e.g. `orders_userId_createdAt`) rather than Mongoose-derived names; a rename would orphan the old index in production.
- The `items.product` sub-schema deliberately uses `orderLineProductSchema` (not the catalogue's `productSchema`) so it carries no indexes of its own; the test proves no inherited `items.*` index leaks onto the order collection.
- The six-index assertion is an exact-match (`toEqual`), guarding against an unannounced seventh index or a silent removal.
