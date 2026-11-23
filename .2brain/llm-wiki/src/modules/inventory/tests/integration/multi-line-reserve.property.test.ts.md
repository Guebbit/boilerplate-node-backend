---
source: src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts
source_sha256: 205d5ba73a1605a351388295d73243abc4e613acc3d6e283de1964ea80c9d0d8
context_sha256: a82aecbf6b43234e385863fca2d411a570312b66dc52fbcf1ec4f0f1ccd89a03
generated_at: 2026-11-22T05:27:12.102307+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts

## Purpose
A property-based integration test (fast-check, real seeded Mongo) asserting that, for any generated sequence of multi-line holds, shipments, releases and expiries, the stock level agrees with the open reservations. It states two invariants once over generated sequences instead of example tables: `reserved` equals the sum of lines across open reservations per product, and `available == onHand - reserved` with `onHand` reduced by exactly the shipped units. It also checks that a refused multi-line hold leaves nothing behind.

## Key elements
- `RUN` — shared fast-check config: fixed seed `20_261_004`, `numRuns` from `PROPERTY_RUNS_WITH_DATABASE` (env `TEST_PROPERTY_RUNS_DB`), `endOnFailure: true`.
- `OPENING_ON_HAND` (8) / `PRODUCT_COUNT` (3) — small, scarce stock so generated holds contend and get refused.
- `Line`, `Step` — a generated order line (product index, quantity) and a step: `place` (1–3 distinct products, quantities 1–6) or `resolve` (`ship` | `release` | `expire`).
- `placeStep()` / `resolveStep()` — arbitraries for those steps. `resolve` picks an open hold by `which % open.length`.
- `Outcome`, `addTo()` — per-product totals of claimed (`held`) and `shipped` units.
- `play(productIds, steps)` — executes the steps through `inventoryService` and then computes the expected totals from the `reservations` collection itself, not from the counters under test:
  - `place` → `reserveForOrder` with a deterministic 24-char hex order id (`counter` hex-padded with `'c'`).
  - `ship` → `commitForOrder` then `shipForOrder`.
  - `release`/`expire` → `releaseForOrder` with `StockMovementReason.release` or `.expire`.
  - Claimed units count reservations with status `held` or `committed`; shipped units count status `shipped`.
- Test 1 — after `play`, per product: `reserved == held`, `onHand == 8 - shipped`, `available == 8 - shipped - held`, and `held <= 8 - shipped`.
- Test 2 — builds 2–3 products where the last line asks for `OPENING_ON_HAND + 1`; asserts `reserveForOrder` returns `held: false`, no `held` reservations exist, and every product's stock level is back to `onHand 8, reserved 0, available 8`.

## Relationships
- `src/modules/inventory/services/index.ts` — `inventoryService` (`reserveForOrder`, `commitForOrder`, `shipForOrder`, `releaseForOrder`) is the system under test.
- `src/modules/inventory/model.ts` — `reservationModel` and `stockLevelModel` are queried directly (`find`, `findOne`, `deleteMany`, `countDocuments`) for expected values and assertions.
- `src/modules/products/tests/factories.ts` — `createProduct({ onHand, reserved })` seeds products.
- `src/types/index.ts` — supplies `StockMovementReason` (`expire`, `release`).
- `tests/support/setup-test-db.ts` — `setupTestDb()` provides the real Mongo test database.
- `tests/support/knobs.ts` — supplies `PROPERTY_RUNS_WITH_DATABASE`.
- `src/modules/delivery/tests/unit/fulfillment.test.ts` — listed as a graph neighbor; no direct interaction is visible in this file.

## Notes
- Each property run creates fresh products and calls `reservationModel.deleteMany({})`, so reservations are reset per run while stock levels come from new products.
- The header says it follows the same pattern as `ledger.property.test.ts`.
- Fixed seed plus order ids derived from a counter make failing runs replayable.
