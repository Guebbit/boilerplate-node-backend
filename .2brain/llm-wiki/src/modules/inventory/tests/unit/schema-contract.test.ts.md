---
source: src/modules/inventory/tests/unit/schema-contract.test.ts
sha256: f62ee2045af1b4a86654d6e07786b6b276667f139cbe1533fad78b9e595a793e
generated_at: 2026-09-27T14:57:27.997005+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that assert the database-level invariants of the two inventory schemas (`stockMovementSchema` and `reservationSchema`). These rules (unique indexes, zero-defaulted deltas, enum constraints, index shapes) are enforced by MongoDB, not by application code, so they can silently disappear without any runtime failure. This file pins them down so a schema refactor that weakens a constraint is caught in CI.

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — asserts required paths, the seven-reason enum, `productId` ref/type, zero defaults on `onHandDelta`/`reservedDelta`, `timestamps: true`, and the exact two composite indexes (both `createdAt: -1`).
- **`describe('reservationSchema — the hold')`** — asserts the unique `orderId` index (exactly-once reservation), required paths, the four-state `status` enum with `held` default, the nested `items` sub-schema (positive quantity, no `_id`), the two indexes (unique `orderId`, sweep `status+1, expiresAt+1`), and that **no** index carries `expireAfterSeconds` (TTL would delete documents and leak stock).
- **Introspection helpers** (from `@tests/schema`) — `requiredPaths`, `defaultOf`, `enumOf`, `indexSpecs`, `indexOptionSpecs`, `indexBehaviour`, `optionsOf`, `pathOptions`, `refOf`, `subSchema`, `typeOf`. All are thin readers over the Mongoose schema definition.

## Relationships

- **`src/modules/inventory/model.ts`** — source of `stockMovementSchema`, `reservationSchema`, and `MOVEMENT_REASONS`; the sole subject under test.
- **`src/types/index.ts`** — provides the `StockMovementReason` enum; used once to confirm the schema's enum mirrors the generated type (the "not a fourth declaration" guard).
- **`tests/support/schema.ts`** — supplies every introspection helper used in the assertions; the tests contain no schema-reading logic of their own.

## Notes

- The seven-reason test spells the literals out rather than comparing `MOVEMENT_REASONS` to `Object.values(StockMovementReason)`. The file's own comment explains why: `MOVEMENT_REASONS` *is* defined as that expression, so the comparison would be tautological. Spelling the list makes a dropped or reordered member visible.
- The TTL-index test iterates `Object.values(indexBehaviour(reservationSchema))` and asserts none carry `expireAfterSeconds`. This guards against a future dev adding a TTL index "for convenience" that would silently delete reservations and orphan the reserved stock.
- The module doc-block frames the testing philosophy: these are invariants whose absence causes no exception — "the guarantee just stops existing, silently." The tests exist because there is no other mechanism to detect the loss.
