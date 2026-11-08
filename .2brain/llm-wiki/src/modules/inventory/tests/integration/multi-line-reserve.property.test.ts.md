---
source: src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts
sha256: f073b491deebb68965b94f2db4779b4dd377fd21641df326433d99917487c4cf
generated_at: 2026-11-08T06:06:37.002756+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts

## Purpose

Property-based integration test that verifies two stock-level invariants over randomly generated sequences of multi-line holds, shipments, releases, and expiries against a real seeded Mongo: (1) `reserved` always equals the sum of per-product quantities across open holds, and (2) `available == onHand − reserved` with `onHand` reduced by exactly the shipped amount. A second test asserts that a refused multi-line hold is fully atomic—no reservation row or counter change survives the rollback.

## Key elements

- **`RUN`** – Fixed test config: seed `20_261_004`, run count from `PROPERTY_RUNS_WITH_DATABASE`, `endOnFailure: true`.
- **`OPENING_ON_HAND`** (8) / **`PRODUCT_COUNT`** (3) – Deliberately scarce starting stock so generated holds contend and some are refused.
- **`Line` / `Step`** – Type shapes for a single order line (product index + qty) and a single shop action (`place` or `resolve`).
- **`placeStep()`** – `fast-check` arbitrary producing 1–3 distinct-product lines with quantities 1–6.
- **`resolveStep()`** – Arbitrary producing a resolve action; picks a random open-hold index (mod length) and a disposition (`ship` | `release` | `expire`).
- **`Outcome` / `addTo()`** – Per-product running totals of held and shipped units, accumulated from reservation documents.
- **`play(productIds, steps)`** – Executes the generated step sequence through `inventoryService`, then reads `reservationModel` (the *oracle*) to compute expected held/shipped totals. Derives a deterministic 24-hex-char `orderId` from a local counter so a failing run replays.
- **`describe › it` (invariant)** – Asserts `reserved`, `onHand`, `available`, and the "never over-promised" bound for every product after a 1–20-step sequence.
- **`describe › it` (refused hold)** – Forces the last line to be unfulfillable (`OPENING_ON_HAND + 1`) and asserts zero reservation rows and unchanged counters for every product.

## Relationships

- **`src/modules/inventory/services/index.ts`** – Imports `inventoryService`; calls `reserveForOrder`, `commitForOrder`, `shipForOrder`, and `releaseForOrder` to drive the system under test.
- **`src/modules/inventory/model.ts`** – Imports `reservationModel` (read as oracle + cleaned between runs) and `stockLevelModel` (read to assert the invariants).
- **`src/modules/products/tests/factories.ts`** – Imports `createProduct` to seed products with a known `onHand`.
- **`src/types/index.ts`** – Imports `StockMovementReason` (`expire`, `release`) for the release path.
- **`tests/support/knobs.ts`** – Imports `PROPERTY_RUNS_WITH_DATABASE` for the run count.
- **`tests/support/setup-test-db.ts`** – Imports `setupTestDb`; called at module top to point Mongoose at the seeded test database.

## Notes

- **Oracle separation:** Expected totals are read from `reservationModel` documents, *not* from `stockLevelModel`. The counters under test are only used in the `expect` assertions, keeping the check independent.
- **Payment-before-ship ordering:** The `ship` path calls `commitForOrder` then `shipForOrder`, mirroring the real flow where payment settles the claim before dispatch decrements stock.
- **Refused-hold test constructs the impossible line last:** Earlier lines are individually fulfillable; only the final line exceeds stock. This isolates the rollback-atomicity concern (partial reservations must not survive) from the general invariant.
- **`reservationModel.deleteMany({})`** is called after product creation to clear any leftover state from a prior run within the same process.
- The module doc-block references `ledger.property.test.ts` as a sibling pattern; no import of that file exists here.
