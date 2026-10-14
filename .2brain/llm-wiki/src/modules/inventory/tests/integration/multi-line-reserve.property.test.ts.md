---
source: src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts
sha256: f073b491deebb68965b94f2db4779b4dd377fd21641df326433d99917487c4cf
generated_at: 2026-10-14T16:02:32.714326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts

## Purpose

Property-based integration test that verifies two stock-level invariants over *generated* sequences of multi-line holds, shipments, releases, and expiries: (1) `reserved` equals the sum of open-hold lines per product, and (2) `available = onHand − reserved`, with `onHand` reduced only by shipped units. Also asserts that a refused multi-line hold rolls back atomically, leaving no reservation and no counter change. Runs against a real, seeded MongoDB.

## Key elements

- **`RUN`** — Config constant: fixed seed `20_261_004`, `numRuns` read from `PROPERTY_RUNS_WITH_DATABASE`, `endOnFailure: true`.
- **`OPENING_ON_HAND` (8)** / **`PRODUCT_COUNT` (3)** — Deliberately scarce inventory so generated holds contend and are sometimes refused.
- **`Line`** — One order line: product index + quantity.
- **`Step`** — Discriminated union: `place` (multi-line hold) or `resolve` (ship / release / expire an open hold).
- **`placeStep()`** — `fast-check` arbitrary producing 1–3 distinct products each with 1–6 units.
- **`resolveStep()`** — Arbitrary that picks an open-hold index (mod open count) and a resolution type.
- **`Outcome`** — `{ held: Map, shipped: Map }` accumulated from reservation documents, *not* from the counters under test.
- **`play(productIds, steps)`** — Executes the generated step sequence via `inventoryService`, then reads final state back from `reservationModel` to build the expected `Outcome`.
- **Test 1: "reserved equals the open holds, and available equals onHand minus reserved"** — Asserts the two invariants for every product after a random 1–20 step sequence.
- **Test 2: "a refused multi-line hold leaves no reservation and no counter moved"** — Forces the last line to exceed stock, asserts `outcome.held === false`, zero reservation documents, and all counters unchanged.

## Relationships

- **`src/modules/inventory/model.ts`** — Imports `reservationModel` (read back for expected outcomes; cleared between runs) and `stockLevelModel` (the counters under assertion).
- **`src/modules/inventory/services/index.ts`** — Imports `inventoryService` for `reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`.
- **`src/modules/products/tests/factories.ts`** — Imports `createProduct` to seed products with a known `onHand`.
- **`src/types/index.ts`** — Imports `StockMovementReason` (`expire`, `release`) for the release call.
- **`tests/support/knobs.ts`** — Imports `PROPERTY_RUNS_WITH_DATABASE` to parameterise run count.
- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` for a real, isolated Mongo per run.

## Notes

- Outcomes are read from **reservation documents**, never from the stock-level counters, so the assertion is an independent cross-check rather than a tautology.
- Order IDs are derived deterministically (`counter.toString(16).padStart(24, 'c')`) so a failing run replays identically under the fixed seed.
- The "ship" path calls `commitForOrder` *before* `shipForOrder` to mirror the real payment→dispatch sequence.
- `endOnFailure: true` means the property runner stops at the first shrunk counterexample rather than accumulating runs.
- The file follows the same structure and conventions as the sibling `ledger.property.test.ts` (mentioned in the module doc-block).
