---
source: src/modules/orders/tests/integration/order-numbering.test.ts
sha256: 219cb67bef2d1ac3778be9735c927da21e058c546b47a237628478cbc3ea89da
generated_at: 2026-09-27T15:18:18.311922+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-numbering.test.ts

## Purpose

Integration tests for `allocateOrderNumber` that verify the atomicity guarantee (no duplicate or skipped sequence numbers) against a real MongoDB instance. The atomicity under test lives in a single `findOneAndUpdate` call, which cannot be meaningfully asserted against a mock—hence the integration level.

## Key elements

- **`parse`** (local helper) — Splits a `{year}-{sequence}` string into a `[number, number]` tuple for assertions.
- **`describe('allocateOrderNumber')`** — Four test cases:
  - First call of a year yields `{year}-000001`.
  - Serial calls advance the sequence by exactly one (1, 2, 3).
  - 50 concurrent calls (`Promise.all`) produce 50 unique, gap-free sequence numbers.
  - Crossing into a new UTC year resets the sequence to 1 while the prior year's counter is untouched; returning to the old year resumes at the next value.

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** — Source of the `allocateOrderNumber` function under test.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()`; called at module top-level to establish a real Mongo connection for the integration suite.
- **`tests/support/clock.ts`** — Provides `freezeDate()`; used in the year-rollover test to simulate a UTC year boundary while the Mongo round-trip remains real.

## Notes

- `setupTestDb()` runs once at import time, not inside `beforeAll`/`beforeEach`.
- The year-rollover test restores real timers via `jest.useRealTimers()` in a `finally` block; forgetting this would leak the fake clock into subsequent tests.
- The concurrency test relies on `Promise.all` firing all 50 calls simultaneously—sequential awaiting would mask the race the test is designed to catch.
- Uses `.toSorted()` (ES2023) rather than `.sort()` to avoid mutating the source array.
