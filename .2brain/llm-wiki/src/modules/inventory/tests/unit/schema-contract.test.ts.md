---
source: src/modules/inventory/tests/unit/schema-contract.test.ts
sha256: 291aca9336415a7c433d4463b29f1781a747a239c164e4aafc162c1ba21b80ab
generated_at: 2026-09-23T18:47:35.573411+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/schema-contract.test.ts

## Purpose

Validates that the two inventory Mongoose schemas (`stockMovementSchema` and `reservationSchema`) declare the correct database-level guarantees: required fields, enum values, defaults, type references, and index specifications. These assertions exist because the guarantees (exactly-once reservation, replayable ledger, terminal-state integrity) are enforced by the database, not by code paths — a silent schema drift would break invariants with no runtime error.

## Key elements

- **`describe('stockMovementSchema — the ledger')`** — seven tests asserting required paths (`productId`, `reason`), the six `StockMovementReason` values in order, `ObjectId`/`Product` reference, zero defaults on `onHandDelta`/`reservedDelta`, `timestamps: true`, and the exact two index specs (both `createdAt: -1`).
- **`describe('reservationSchema — the hold')`** — six tests asserting the unique `orderId` index (exactly-once), four required paths including `items`, the three-value `status` enum with `held` default, the `items` sub-schema (`productId` + `quantity` with `min: 1`, `_id` disabled), the sweep index (`status+1, expiresAt+1`), and the **absence** of any TTL index.
- **Test helpers** — all introspection is delegated to utilities imported from `@tests/schema` (`requiredPaths`, `enumOf`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `pathOptions`, `subSchema`, `indexSpecs`, `indexOptionSpecs`, `indexBehaviour`).

## Relationships

- **`src/modules/inventory/model.ts`** — the source of truth under test. This file imports `stockMovementSchema`, `reservationSchema`, and `MOVEMENT_REASONS` to introspect them.
- **`src/types/index.ts`** — provides the `StockMovementReason` enum used to cross-check that the schema's generated enum matches the shared type definition.
- **`tests/support/schema.ts`** — supplies every schema-introspection helper used in the assertions; without it the tests could not read Mongoose schema metadata programmatically.

## Notes

- The reasons test deliberately spells out the six literal strings rather than comparing `MOVEMENT_REASONS` to `Object.values(StockMovementReason)` — the latter would be the same expression on both sides (a tautology that can never fail).
- The "no TTL index" test is a regression guard: a TTL index **deletes** the reservation document, silently leaking reserved stock. Expiry must go through a sweep that releases units first.
- Zero defaults on the delta columns are not cosmetic: `$sum` treats `undefined` as absent, so an undefined delta breaks the ledger-replay invariant.
