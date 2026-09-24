---
source: src/modules/delivery/tests/unit/schema-contract.test.ts
sha256: c4c76a50f667948679f2148247d5529d591da5025a838b0a765556d1694d2425
generated_at: 2026-09-23T18:38:53.312192+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins down the structural contract of `shipmentSchema`: which fields are required, the database-level uniqueness guarantee on `orderId`, the ObjectId reference to `Order`, the `ShipmentStatus` enum with its `shipped` default, and the intentional absence of a `deliveredAt` default. It exists so that schema changes that would break exactly-once dispatch semantics are caught immediately.

## Key elements

- **`describe('shipmentSchema')`** — single block, six assertions covering:
    - `requiredPaths` → only `orderId` is required (trackingCode/deliveredAt are intentionally optional).
    - `indexOptionSpecs` → `orderId` has `unique=true` (DB-level exactly-once guarantee).
    - `typeOf` / `refOf` → `orderId` is an `ObjectId` referencing the `Order` collection.
    - `enumOf` / `defaultOf` → `status` matches `ShipmentStatus` values and defaults to `shipped`.
    - `defaultOf('deliveredAt')` → `undefined` (absence means "in transit").
    - `optionsOf(...).timestamps` → `true` (Mongoose auto-manages `createdAt`/`updatedAt`).

## Relationships

- **`src/modules/delivery/model.ts`** — source of `shipmentSchema`, the object under test.
- **`src/types/index.ts`** — source of the `ShipmentStatus` enum used to validate the `status` field's allowed values.
- **`tests/support/schema.ts`** — provides the assertion helpers (`requiredPaths`, `indexOptionSpecs`, `typeOf`, `refOf`, `enumOf`, `defaultOf`, `optionsOf`) that introspect Mongoose schema internals without spinning up a database.

## Notes

- The module docblock frames `unique: true` on `orderId` as the _same_ exactly-once mechanism the payment schema relies on — a shared invariant across modules, not just a delivery concern.
- `trackingCode` is optional at the schema level; its requirement is a service-level rule keyed on shipping method. Do not "fix" this by making it required in the schema.
- `deliveredAt` having **no** default is deliberate: its absence is the "in transit" signal. Adding a default (e.g., `null`) would break that semantic.
- Tests assert on schema metadata (Mongoose options), not on database state, so they run without a live Mongo connection.
