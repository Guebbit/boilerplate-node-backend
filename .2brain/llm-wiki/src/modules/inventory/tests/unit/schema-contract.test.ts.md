---
source: src/modules/inventory/tests/unit/schema-contract.test.ts
sha256: 622d82e7f3abc78c6319b5eb5bb6c9dacb9395ecd1562de3841ea4ec4fcb483e
generated_at: 2026-10-14T16:04:23.347773+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Contract test for the two inventory Mongoose schemas (`stockMovementSchema` and `reservationSchema`). It asserts the structural guarantees the database enforces—required fields, enum values, defaults, index definitions, and the absence of a TTL index—so that a silent schema drift (a dropped enum member, a missing default, a reordered index) is caught by CI even though no runtime code path would fail.

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — Asserts required paths, the reason enum (spelled out as a literal array to avoid a tautological comparison against `MOVEMENT_REASONS`), `productId` type/ref, zero defaults on both delta fields, `timestamps: true`, and the exact two composite index specs.
- **`describe('reservationSchema — the hold')`** — Asserts the unique `orderId` index (exactly-once), required paths including `items`, the four-value `status` enum with `held` default, the nested `items` sub-schema constraints (`min: 1` on quantity, `_id: false`), the three index specs, and a **negative** assertion that no index carries `expireAfterSeconds` (expiry must be a sweep, not a TTL delete).
- All assertions delegate to inspection helpers (`requiredPaths`, `enumOf`, `defaultOf`, `indexSpecs`, etc.) rather than inserting documents, making the suite fast and side-effect-free.

## Relationships

- **`src/modules/inventory/model.ts`** — Source of `stockMovementSchema`, `reservationSchema`, and `MOVEMENT_REASONS` under test.
- **`src/types/index.ts`** — Provides the `StockMovementReason` enum, used to cross-check the schema's `reason` enum values.
- **`tests/support/schema.ts`** — Supplies every schema-inspection helper (`requiredPaths`, `enumOf`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`, `subSchema`, `pathOptions`, `indexBehaviour`).

## Notes

- The `MOVEMENT_REASONS` test intentionally compares against a **hand-spelled** literal array rather than `Object.values(StockMovementReason)`, because `MOVEMENT_REASONS` is defined as `Object.values(StockMovementReason)`—comparing the two would be an assertion that can never fail.
- The file validates schema *metadata only*; it does not exercise Mongoose save hooks, middleware, or actual DB round-trips. If a hook or plugin mutates the schema at runtime, these tests will not see it.
- The TTL-index test iterates `Object.values(indexBehaviour(reservationSchema))` to confirm the property is absent on **every** index, guarding against a future index being added with an `expireAfterSeconds` option.
