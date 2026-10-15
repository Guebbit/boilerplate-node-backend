---
source: src/modules/orders/tests/integration/order-numbering.test.ts
sha256: abb84f428d25043228f1a160aee766a6a5b604db5f0ec371a0a50c4042deab5c
generated_at: 2026-10-15T11:15:13.749708+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-numbering.test.ts

## Purpose

Integration test for `allocateOrderNumber`, verifying two invariants against a real MongoDB: order numbers are unique and the per-year sequence has no gaps. The concurrency test (50 simultaneous calls) specifically exercises the atomic `findOneAndUpdate` in the repository, which cannot be meaningfully asserted against a mock.

## Key elements

- **`parse`** — local helper that splits a `"YYYY-NNNNNN"` order-number string into a `[year, sequence]` tuple.
- **`allocateOrderNumber` first-number format** — asserts the initial number for a year is exactly `{year}-000001`, with the year derived via `yearInZone` / `shopTimezone` rather than UTC.
- **Timezone boundary test** — freezes the clock at `2026-12-31T23:30Z` (00:30 in Rome) and expects the year in the number to be `2027`, proving the year cut follows the shop's calendar.
- **Serial increment test** — three sequential calls yield sequences 1, 2, 3.
- **Concurrency test (50 calls)** — fires all calls via `Promise.all`, then asserts the collected sequences are exactly `1…50` with no duplicates or gaps.
- **Cross-year reset test** — allocates in year N, freezes the clock to year N+1, allocates again (expects sequence 1 in the new year), then returns to year N and expects sequence 2, confirming counters are separate per-year documents.

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** — source of `allocateOrderNumber`, the function under test.
- **`src/modules/orders/config.ts`** — provides `shopTimezone()` used to compute the expected year.
- **`src/modules/orders/domain/shop-time.ts`** — provides `yearInZone`, the timezone-aware year extractor.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to connect a real (in-memory or temp) MongoDB.
- **`tests/support/clock.ts`** — `freezeDate` freezes `Date` so year-boundary and cross-year tests are deterministic; `jest.useRealTimers()` in `finally` blocks restores it.

## Notes

- `freezeDate` only stubs `Date`; the Mongo round-trip inside `allocateOrderNumber` is still a real network call. This is intentional — the test needs the server-side `$inc` atomicity.
- The concurrency test's correctness depends on *not* awaiting calls sequentially; `Promise.all` is the minimal reproduction of a read-then-increment race.
- The cross-year test proves the counter is stored **per-year** (a separate Mongo document per year), not as a single monotonic counter that gets reset.
- All `freezeDate` calls are paired with `jest.useRealTimers()` in a `finally` block; forgetting the cleanup leaks the fake clock into subsequent tests.
