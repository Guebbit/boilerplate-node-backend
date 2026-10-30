---
source: src/modules/delivery/tests/unit/schema-contract.test.ts
sha256: d9e2c4045ea531b90c9d8bc5e8b8056255d32f6036046d71d16cae6323e34fc2
generated_at: 2026-10-29T03:50:35.825468+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin down the declarative contract of the two delivery Mongoose schemas — `fulfillmentOrderSchema` and `shipmentSchema`. They assert required paths, unique indexes, ObjectId references, allowed enum values, defaults, and timestamp options so that any schema drift is caught at test time rather than at runtime.

## Key elements

- **`describe('fulfillmentOrderSchema', …)`** — verifies required fields (`kind`, `lines`, `number`, `orderId`, `revision`), the unique `(orderId, number)` index, `orderId` → `Order` reference, enum sets for `status` / `kind` / `holdReason`, `status` default = `open`, `revision` default = `0`, and `timestamps: true`.
- **`describe('shipmentSchema', …)`** — verifies required fields (including `forced`, `shippedAt`; excluding optional `trackingCode`, `destination`, `deliveredAt`), the same unique `(orderId, number)` index (while confirming no standalone `orderId` unique index), references to `Order` and `FulfillmentOrder`, `status` default = `shipped`, `forced` default = `false`, `deliveredAt` default = `undefined`, and `timestamps: true`.
- **Schema-inspection helpers** (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `enumOf`, `defaultOf`, `optionsOf`) — imported from `@tests/schema`; each extracts a specific facet of a Mongoose schema for assertion.

## Relationships

- **`src/modules/delivery/model.ts`** — source of the two schemas under test; this file is purely its consumer here.
- **`src/types/index.ts`** — provides the enum value sets (`FulfillmentOrderStatus`, `FulfillmentOrderKind`, `FulfillmentHoldReason`, `ShipmentStatus`) used as the expected vocabulary.
- **`tests/support/schema.ts`** — supplies the seven helper functions that unwrap Mongoose schema internals into plain values for `expect` assertions.

## Notes

- Tests assert *schema shape*, not runtime behavior; they will pass even if the application logic is broken, but will fail if a required field is renamed, an index is dropped, or an enum gains/loses a member.
- `deliveredAt` is intentionally absent (no default) so that its missing value semantically means "in transit."
- `shipment.status` defaults to `shipped`, not a "pending" value — a shipment record only exists after dispatch.
- The unique `(orderId, number)` composite index is the exactly-once guarantee; the tests explicitly confirm it exists and that no *non-composite* `orderId` unique index exists (many shipments may share one order).
