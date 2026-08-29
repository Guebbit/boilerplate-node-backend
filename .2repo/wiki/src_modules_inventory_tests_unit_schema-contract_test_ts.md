# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Asserts the **database-level contracts** of the inventory schemas — unique indexes, defaults, enum values, required paths, and index specs. These guarantees are enforced by MongoDB, not by any service code path, so weakening them would not cause a test in the integration suite to fail. This file is the only place that pins those structural invariants.

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — Verifies the ledger schema:
  - Required paths are exactly `productId` + `reason`.
  - `reason` enum matches the generated `StockMovementReason` contract *and* the exported `MOVEMENT_REASONS` array (guards against a fourth independent declaration).
  - `productId` is an `ObjectId` ref to `Product`.
  - Both delta fields (`onHandDelta`, `reservedDelta`) default to `0` (replayability via column sum).
  - `timestamps` option is on.
  - Index list is exactly two, both with `createdAt: -1`.

- **`describe('reservationSchema — the hold')`** — Verifies the reservation schema:
  - `orderId` index is `unique=true` (the exactly-once reservation gate).
  - Required paths: `expiresAt`, `items`, `orderId`, `status`.
  - `status` enum is exactly `['held', 'committed', 'released']`; default is `'held'`.
  - Sub-schema `items` requires `productId` + `quantity` with `min: 1`; `_id` is disabled.
  - Index list is exactly the `orderId` unique index and the `status+1, expiresAt+1` sweep index.
  - No index carries `expireAfterSeconds` (deliberate: a TTL index would *delete* the doc and leak stock).

## Relationships

- **`src/modules/inventory/model.ts`** — Source of the two schemas under test (`stockMovementSchema`, `reservationSchema`) and the `MOVEMENT_REASONS` export cross-checked against the contract enum.
- **`src/types/index.ts`** — Provides `StockMovementReason` (a Zod/contract-generated enum) used as the ground truth for the `reason` field's allowed values.
- **`tests/support/schema.ts`** — Supplies all introspection helpers (`defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `indexBehaviour`, `optionsOf`, `pathOptions`, `requiredPaths`, `refOf`, `subSchema`, `typeOf`) that extract structural metadata from Mongoose schemas without instantiating them.

## Notes

- These tests assert **structure, not behavior**. A schema change that alters a default, adds an index, or widens an enum will fail here even though every integration test still passes. That is the point.
- The file documents *why* each assertion matters in inline comments (e.g., "a retried checkout is detected by the insert failing, with no read-then-write race to lose"). Read the comments before modifying a schema.
- The TTL-index check (`indexBehaviour`) is a **negative** assertion: it exists to prevent a well-intentioned "just add a TTL" fix from silently deleting reservations and leaking reserved stock.
- `MOVEMENT_REASONS` is asserted equal to `Object.values(StockMovementReason)` to catch drift if someone adds a reason in one place but not the other.
