---
source: src/modules/orders/tests/integration/order-numbering.test.ts
sha256: 950fbc24c6aa2fdd9dd629bf1dc6a164e469e2a98030a396ba5d19e3bebff895
generated_at: 2026-11-08T07:07:00.029448+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-numbering.test.ts

## Purpose

Integration test for `allocateOrderNumber` that verifies order-number allocation is atomic, gap-free, and duplicate-free against a real MongoDB instance. It exists because the correctness guarantee (atomic `findOneAndUpdate` counter increment) is only observable through a live database — a mock cannot prove it.

## Key elements

- **`parse(orderNumber)`** – Local helper that splits a `{year}-{sequence}` string into a `[number, number]` pair for assertions.
- **`describe('allocateOrderNumber')`** – Five test cases:
  - *First number format* – Asserts the shape is `{year}-000001` and that `year` matches `yearInZone(new Date(), shopTimezone())`.
  - *Year boundary is shop-local* – Freezes the clock to `2026-12-31T23:30Z` (which is 31 Dec in UTC but 31 Dec 23:30 in Rome) and asserts the number starts with `2027`.
  - *Serial increment* – Three sequential calls yield sequences 1, 2, 3.
  - *Concurrency (50 calls)* – `Promise.all` fires 50 simultaneous allocations; asserts all sequences are unique and contiguous (1–50), exercising the atomic `$inc`.
  - *Per-year counter isolation* – After freezing into the next UTC year, a new sequence starts at 1; when the clock returns to the original year, the counter resumes at 2 (the old document is untouched).

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** – Imports `allocateOrderNumber`, the function under test.
- **`src/domain-primitives/time.ts`** – Imports `yearInZone` to compute the expected year in the shop's timezone for assertions.
- **`src/modules/shop/index.ts`** → **`src/modules/shop/service.ts`** – Provides `shopTimezone` (re-exported through the module index) used to determine which calendar year applies.
- **`tests/support/clock.ts`** – Imports `freezeDate` to pin `Date` for the year-boundary and new-year tests; real timers are restored in `finally` blocks.
- **`tests/support/setup-test-db.ts`** – Imports and calls `setupTestDb()` to start a real MongoDB before the suite runs.

## Notes

- `freezeDate` mocks only the `Date` constructor/global; the MongoDB round-trip inside `allocateOrderNumber` still executes for real (noted in the file's own comment).
- The concurrency test relies on `Promise.all` (fire-and-forget) rather than serial `await`s; this is intentional to surface read-then-increment races that a serial test would hide.
- Tests that use `freezeDate` must restore real timers in a `finally` block to avoid leaking fake time into subsequent tests.
- The file uses `setupTestDb()` as a top-level side-effect (not inside `beforeAll`), meaning the DB is available before any test runs.
