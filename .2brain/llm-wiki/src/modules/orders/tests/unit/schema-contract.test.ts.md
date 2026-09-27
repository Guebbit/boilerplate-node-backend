---
source: src/modules/orders/tests/unit/schema-contract.test.ts
sha256: 47bd9ca93e0f0bcf50f3a4a4a02e0511e94dec7e11b5f25f851aa09b7d2b9452
generated_at: 2026-09-27T15:22:22.264305+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/schema-contract.test.ts

## Purpose

Unit test that inspects the `orderSchema` Mongoose object *directly* — asserting declarations (required flags, types, defaults, enums, index specs, sub-schema shapes) rather than driving the schema through real saves. It exists to catch declaration defects (a dropped `required`, a flipped `_id: false`, a reversed index direction) that integration tests would miss because they don't change what a valid document looks like.

## Key elements

- **`describe('orderSchema — what an order must carry')`** — asserts `requiredPaths` is exactly `['email']`, `userId` is `ObjectId`, and optional fields (`notes`, `shippingMethod`, `deletedAt`, `orderNumber`, `transferReference`) are absent from required.
- **`describe('orderSchema — status')`** — asserts the enum equals `Object.values(OrderStatus)` and the default is `OrderStatus.pending`.
- **`describe('orderSchema — money')`** — asserts `shippingCost` has no default and `min` is 0.
- **`describe('orderSchema — the embedded snapshots')`** — asserts `items._id` is `false`, item `quantity` is required, `items.product` carries no inherited indexes, `taxRate` is required in `[0, 1]`, and `shippingAddress` is `_id: false` with five required fields (phone optional).
- **`describe('orderSchema — indexes')`** — asserts the exact six named index specs with directions, and the exact sparse/unique option set per index.
- **`describe('orderSchema — options')`** — asserts `timestamps` is `true`.

## Relationships

- **`src/modules/orders/model.ts`** — the test imports `orderSchema` from here; every assertion targets that object.
- **`src/types/index.ts`** — the test imports `OrderStatus` to validate the status enum and default.
- **`tests/support/schema.ts`** — the test imports the entire inspection helper set (`requiredPaths`, `typeOf`, `defaultOf`, `enumOf`, `pathOptions`, `optionsOf`, `subSchema`, `indexSpecs`, `indexOptionSpecs`); these functions read the Mongoose schema object in-memory with no database connection.

## Notes

- The test asserts *sets* (e.g., `requiredPaths` equals a specific array) rather than individual field checks, so it fails symmetrically on both a removed and an added `required`.
- Index assertions are full-string comparisons (`'name: field+1, field2-1'`); a rename in production would leave the old index orphaned, which is why names are pinned here.
- The `items.product` index assertion is a guard against Mongoose silently copying an embedded schema's indexes onto the parent collection — it currently passes because `orderLineProductSchema` declares none.
- `userId` is intentionally *not* required: account erasure unsets it, so the schema cannot claim it is always present.
