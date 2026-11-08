---
source: src/modules/returns/tests/integration/stats.test.ts
sha256: 20ab4e48b93507f4fa0527475605fa892198172dec0addd228b76cca28a35e23
generated_at: 2026-11-08T08:11:53.149692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/stats.test.ts

## Purpose

Integration tests for the returns stats service. Verifies that the three aggregation functions (`returnedBuckets`, `returnedByProduct`, `returnedSeries`) correctly count only goods actually received (not merely requested) and bucket them by shop day in a real database, using a fixed Rome-timezone window.

## Key elements

- **`window`** — shared constant defining the query period: 9–12 March 2026, `interval: 'day'`, `timeZone: 'Europe/Rome'`.
- **`seedReturn(status, receivedAt, lines)`** — helper that creates a return document via `returnModel.create` with the given status, optional `receivedAt`, and product/quantity lines.
- **`describe('returned units')`** — single test block with two `it` cases:
  - *buckets received units by shop day* — calls `returnedBuckets(window)` and asserts per-day unit counts.
  - *totals per product and for one product over time* — calls `returnedByProduct(window)` and `returnedSeries(productId, window)` and asserts per-product totals and the per-day series.
- **`beforeEach`** seeds four documents: two received/closed within the window, one `requested` (no `receivedAt`), and one received outside the window. The latter two must be excluded from results.

## Relationships

- **`src/modules/returns/services/stats.ts`** — the module under test; imports `returnedBuckets`, `returnedByProduct`, `returnedSeries`.
- **`src/modules/returns/model.ts`** — provides `returnModel` used to seed test documents.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` called at module scope to establish the in-memory/test database before any test runs.

## Notes

- **Timezone edge case is intentional:** the seed timestamp `2026-03-10T23:30:00Z` is the 11th in Europe/Rome. The expected bucket key (`2026-03-10T23:00:00.000Z`) is the start-of-day *in Rome* (UTC+1), not UTC midnight.
- **Status filter:** both `received` and `closed` statuses with a `receivedAt` date count; `requested` (no `receivedAt`) does not. The service presumably filters on `receivedAt` presence rather than status alone.
- **Window boundaries are exclusive of UTC midnight:** `from`/`to` are set at `23:00Z` to align with Rome midnight. A return at `2026-02-01` is excluded purely by the window, not by status.
- Tests run against a real (test) MongoDB instance via `setupTestDb`, not mocked collections.
