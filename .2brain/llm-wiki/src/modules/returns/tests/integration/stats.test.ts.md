---
source: src/modules/returns/tests/integration/stats.test.ts
sha256: 58a24bf20c81ddb86dc4b9eebf4f5a94c1b543738f6b20001db7dc0c17221f5f
generated_at: 2026-10-15T12:00:52.957964+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/stats.test.ts

## Purpose

Integration test for the "returned units" read queries in the returns stats service. It verifies that `returnedBuckets`, `returnedByProduct`, and `returnedSeries` count only *received* goods (status `received` or `closed`) within a time window, bucket them by shop-local day (Europe/Rome), and aggregate correctly per product and per single product over time.

## Key elements

- **`seedReturn(status, receivedAt, lines)`** – Helper that creates a return document via `returnModel.create` with the given status, optional `receivedAt` timestamp, and an array of `[productId, quantity]` lines.
- **`window`** – Fixed query window: 9–12 March 2026, `interval: 'day'`, `timeZone: 'Europe/Rome'`.
- **`shoes` / `hats`** – Two constant `ObjectId` values used as the product identifiers across all seed data and assertions.
- **`describe('returned units')`** – Test suite; seeds four returns (two in-window, one requested-only, one out-of-window) in `beforeEach`.
  - *'buckets received units by shop day'* – Asserts `returnedBuckets` returns 1 unit on 09 Mar (Rome) and 3 units on 10 Mar (Rome).
  - *'totals per product and for one product over time'* – Asserts `returnedByProduct` sums (shoes = 3, hats = 1) and `returnedSeries` for shoes yields per-day values `[1, 2]`.

## Relationships

- **`src/modules/returns/services/stats.ts`** – The system under test; imports `returnedBuckets`, `returnedByProduct`, and `returnedSeries`.
- **`src/modules/returns/model.ts`** – Imports `returnModel` to create seed documents in the test database.
- **`tests/support/setup-test-db.ts`** – Imports `setupTestDb`, called once at module level to prepare a clean in-memory (or equivalent) database before tests run.

## Notes

- Timezone matters: a return stamped `23:30 UTC` on the 10th lands on the **11th** in Rome. The test deliberately uses this case to confirm bucket boundaries follow the shop's local calendar, not UTC.
- Only returns that have both a qualifying status *and* a `receivedAt` within the window contribute to counts. A `requested` return or a `received` return outside the window must produce zero.
- The file is an integration test (real model writes + service reads), not a pure unit test of the aggregation logic.
