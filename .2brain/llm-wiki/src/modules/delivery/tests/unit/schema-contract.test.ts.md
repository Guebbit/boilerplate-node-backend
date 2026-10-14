---
source: src/modules/delivery/tests/unit/schema-contract.test.ts
sha256: 70197340458a0b375fdb97a6a88da761ae54906a7657f3d7728c4f5a0bb4002b
generated_at: 2026-10-14T15:40:03.009871+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin the Mongoose schema contracts for `fulfillmentOrderSchema` and `shipmentSchema`. They verify that required fields, unique compound indexes, ObjectId references, enum boundaries, and defaults match the intended data model so that the database — not application logic — enforces invariants like "one fulfillment order per number per order" and "one shipment per number per order."

## Key elements

- **`describe('fulfillmentOrderSchema', …)`** — asserts the six required paths (`kind`, `lines`, `number`, `orderId`, `revision`, `slips`), the `orderId_1_number_1` unique index, `orderId` → `Order` ObjectId ref, enum boundaries for `status`/`kind`/`holdReason`, default `status = open`, default `revision = 0`, and `timestamps: true`.
- **`describe('shipmentSchema', …)`** — asserts the six required paths (`forced`, `fulfillmentOrderId`, `lines`, `number`, `orderId`, `shippedAt`), the `orderId_1_number_1` unique index (and explicitly *not* a bare `orderId` unique), ObjectId refs for `orderId` → `Order` and `fulfillmentOrderId` → `FulfillmentOrder`, enum boundary + default `status = shipped`, `forced` defaults to `false`, `deliveredAt` has no default, and `timestamps: true`.
- **Schema-inspection helpers** (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `enumOf`, `defaultOf`, `optionsOf`) — pulled from `tests/support/schema.ts`; each extracts a specific facet of a Mongoose schema for assertion.

## Relationships

- **`src/modules/delivery/model.ts`** — source of `fulfillmentOrderSchema` and `shipmentSchema`; the sole subject under test here.
- **`src/types/index.ts`** — provides the four enum types (`FulfillmentHoldReason`, `FulfillmentOrderKind`, `FulfillmentOrderStatus`, `ShipmentStatus`) whose values the tests compare against the schema's `enum` options.
- **`tests/support/schema.ts`** — supplies the seven inspection helpers that let these tests read schema metadata without instantiating documents.

## Notes

- The file is a **`@module`** (side-effect only); it exports nothing.
- Tests assert *schema metadata*, not runtime CRUD behaviour — a failing assertion means the model definition drifted, not that a code path is broken.
- Inline comments document intentional omissions: `trackingCode` is optional (service-level rule, not schema), `deliveredAt` carries no default (absence *is* "in transit"), and shipment defaults to `shipped` because a "pending" parcel is a contradiction.
- The unique-index assertions encode the core exactly-once guarantee: the database, not a lock or an optimistic check, is the final arbiter of duplicate `(orderId, number)` pairs.
