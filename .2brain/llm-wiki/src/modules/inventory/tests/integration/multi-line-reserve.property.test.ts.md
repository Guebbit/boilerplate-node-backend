---
source: src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts
sha256: 953e1120fc6ed5f25de41541c6351b0516a9d983e354bab57fa10837c00a51d7
generated_at: 2026-11-14T20:09:19.087505+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts

## Purpose

Property-based integration test (against a real seeded MongoDB) that verifies two stock-level invariants over randomly generated sequences of multi-line hold, ship, release, and expire operations: (1) `reserved` always equals the sum of that product's lines across all `held`/`committed` reservations, and (2) a refused multi-line hold rolls back cleanly, leaving no open reservation and no counter moved.

## Key elements

- **`RUN`** — fast-check config: fixed seed `20_261_004`, `numRuns` from `PROPERTY_RUNS_WITH_DATABASE`, `endOnFailure: true`.
- **`OPENING_ON_HAND` (8)** — starting stock per product; deliberately low so generated holds contend and produce refusals.
- **`placeStep()`** — `fc.Arbitrary<Step>` that generates a "place order" step with 1–3 distinct products and quantities 1–6.
- **`resolveStep()`** — `fc.Arbitrary<Step>` that generates a "resolve" step (ship / release / expire) targeting an open hold by index.
- **`play(productIds, steps)`** — Executes the generated step sequence against `inventoryService`, then reads outcomes (`held`, `shipped`) from `reservationModel` (the source of truth), never from `stockLevelModel`.
- **Invariant test** (`"reserved equals the open holds…"`) — Asserts per-product `reserved`, `onHand`, and `available` match the computed expected values after the sequence.
- **Refusal test** (`"a refused multi-line hold leaves no open reservation…"`) — Forces the last line to exceed stock, asserts `outcome.held === false`, zero `held` reservations, and every counter unchanged.

## Relationships

- **`src/modules/inventory/model.ts`** — Imports `reservationModel` and `stockLevelModel`; reads reservation documents to compute expected totals and queries stock levels to assert.
- **`src/modules/inventory/services/index.ts`** — Imports `inventoryService`; calls `reserveForOrder`, `commitForOrder`, `shipForOrder`, and `releaseForOrder`.
- **`src/modules/products/tests/factories.ts`** — Imports `createProduct` to seed test products with known `onHand` / `reserved`.
- **`src/types/index.ts`** — Imports `StockMovementReason` (`.expire`, `.release`) for release calls.
- **`tests/support/knobs.ts`** — Imports `PROPERTY_RUNS_WITH_DATABASE` to control run count via environment.
- **`tests/support/setup-test-db.ts`** — Imports and calls `setupTestDb()` at module top-level to provision the test database.

## Notes

- Order IDs inside `play` are derived as `counter.toString(16).padStart(24, 'c')` — syntactically valid ObjectIds that make failing runs replayable from the logged seed.
- The refusal test uses the literal ID `'d'.repeat(24)`.
- Ship path calls `commitForOrder` **before** `shipForOrder` (payment settles the claim, then dispatch moves units); the outcome read treats both `held` and `committed` as "still claimed."
- `reservationModel.deleteMany({})` runs before each property iteration to reset state between independent runs.
- Follows the same structural pattern as `ledger.property.test.ts` (referenced in the module doc-comment).
