---
source: src/modules/orders/tests/integration/order-numbering.test.ts
sha256: 3301dd801453b8a5219c881ee415fdaeaa21d408012e0d1c185e849f03997c95
generated_at: 2026-10-29T04:54:38.473895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-numbering.test.ts

## Purpose

Integration tests for `allocateOrderNumber`, verifying that the atomic counter increment in Mongo guarantees unique, gap-free order numbers under real concurrency and correct year-boundary behavior. These tests run against a live database because the property under test—atomicity of a single `findOneAndUpdate`—cannot be meaningfully asserted against a mock.

## Key elements

- **`parse`** — local helper that splits a `{year}-{sequence}` order-number string into a `[year, sequence]` numeric tuple for assertions.
- **`describe('allocateOrderNumber')`** — the test suite, containing five cases:
  - *First number formatting* — asserts the initial order number is `{currentShopYear}-000001`.
  - *Shop-calendar year boundary* — freezes the clock at `2026-12-31T23:30Z` (still Dec 31 in UTC, Jan 1 in Rome) and expects the year component to read `2027`.
  - *Serial sequence* — three sequential calls yield sequences 1, 2, 3.
  - *Concurrent uniqueness & no gaps* — 50 simultaneous calls must produce exactly the set `{1…50}` with no duplicates or skips.
  - *Year rollover isolation* — after advancing the clock to the next UTC year, a fresh sequence starts at 1; returning to the original year resumes where it left off, confirming the two years use separate counter documents.

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** — source of `allocateOrderNumber`, the sole function under test.
- **`src/modules/orders/domain/shop-time.ts`** — provides `yearInZone`, used to compute the expected year in the first assertion.
- **`src/modules/shop/index.ts`** — re-exports `shopTimezone`, which supplies the IANA timezone string used by `yearInZone` and (implicitly) by the allocation logic.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to establish a real Mongo connection and ensure a clean collection before the suite runs.
- **`tests/support/clock.ts`** — `freezeDate` pins the system clock for timezone-boundary and year-rollover tests; each call is paired with `jest.useRealTimers()` in a `finally` block.

## Notes

- The concurrency test uses `Promise.all` over 50 unawaited calls specifically so that a read-then-increment race would surface as a duplicate or gap; serially `await`-ed calls would never expose the bug.
- Time-freezing tests always restore real timers in a `finally` block; a crash mid-test will not leave the suite pinned to a fake clock.
- The year-rollover test proves counter isolation (separate Mongo documents per year) rather than a single global counter being reset.
