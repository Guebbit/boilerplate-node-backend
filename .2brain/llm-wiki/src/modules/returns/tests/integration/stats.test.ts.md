---
source: src/modules/returns/tests/integration/stats.test.ts
source_sha256: 58f4ba64eb72451fc4446183b2b846486105038db06a194e9e0c2c8083ec2159
context_sha256: 5792f61c50d17d28c2616cf5168be5e6b0a09e252922c388ebd1406546d60fc9
generated_at: 2026-11-22T07:38:16.070322+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/stats.test.ts

## Purpose
Integration test for the grouped "returned units" reads that the stats service builds from returns. It checks which returns count (goods actually received, within the window) and which shop day (Europe/Rome) their units land on. It runs against a real test database.

## Key elements
- `setupTestDb()` – called at module level to set up the test database.
- `shoes`, `hats` – two fixed `ObjectId`s used as product ids for grouping.
- `window` – the query window: `2026-03-08T23:00Z` to `2026-03-12T23:00Z` (9–12 March in Rome, +01:00), `interval: 'day'`, `timeZone: 'Europe/Rome'`.
- `seedReturn(status, receivedAt, lines)` – creates a return through `returnModel` with fixed fields (EUR, reason `withdrawal`, consumer-paid postage, order number `2026-000001`). Each `[productId, quantity]` becomes a line. `receivedAt` is set only when given.
- `describe('returned units')` – `beforeEach` seeds four returns:
  - `received` on 10 March at 23:30Z (shoes ×2, hats ×1). This is already 11 March in Rome.
  - `closed` on 10 March at 10:00Z (shoes ×1).
  - `requested` with no `receivedAt` (shoes ×9). It must not count.
  - `received` on 1 Feb (shoes ×9). It falls outside the window and must not count.
- Test "buckets received units by shop day" – `returnedBuckets(window)` must return `{2026-03-09T23:00Z: 1, 2026-03-10T23:00Z: 3}`.
- Test "totals per product and for one product over time" – `returnedByProduct(window)` must return shoes 3 and hats 1. `returnedSeries(String(shoes), window)` must have per-bucket units `[1, 2]` after sorting.

## Relationships
- `src/modules/returns/services/stats.ts` – the code under test (`returnedBuckets`, `returnedByProduct`, `returnedSeries`).
- `src/modules/returns/model.ts` – supplies `returnModel`, used to seed returns.
- `tests/support/setup-test-db.ts` – supplies `setupTestDb` (imported via the `@tests` alias).
- `src/modules/delivery/tests/unit/fulfillment.test.ts` – no direct interaction is visible in this file.

## Notes
- Counting appears to depend on `receivedAt`, not on status alone. The `closed` return counts because it has a `receivedAt`, while the `requested` one has none.
- The timezone case is deliberate: the 23:30Z receipt lands in the 11 March Rome bucket, whose key is `2026-03-10T23:00Z`.
