---
source: src/modules/orders/tests/integration/order-numbering.test.ts
source_sha256: b9f1bea8c41c7a9b1801400e84ca1ed0bce25c0c3b0efb963591b63b5b25f44a
context_sha256: 861a07bd0ee57f5c78a9473d0a08f5c6586f18136998378d9278f815223915eb
generated_at: 2026-11-22T06:30:27.724443+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/order-numbering.test.ts

## Purpose
Integration test suite for `allocateOrderNumber`. It verifies the feature's core guarantee: no two orders receive the same number, and the sequence never skips, even under real concurrency. It runs against a real Mongo instance because the atomicity under test (a single `findOneAndUpdate` in `orderRepository.incrementOrderNumberCounter`) can't be proven with a mock.

## Key elements
- `setupTestDb()` — called at module level to provision the test database.
- `parse(orderNumber)` — local helper that splits `{year}-{sequence}` into a `[year, sequence]` number pair.
- `describe('allocateOrderNumber')` with these cases:
  - **First number format** — the first number of a year is `{year}-000001`, with the year computed via `yearInZone(new Date(), shopTimezone())`.
  - **Shop calendar year** — with the clock frozen at `2026-12-31T23:30:00Z`, the result is `2027-000001`, so the year is cut at the shop's calendar (Rome), not UTC's.
  - **Serial advance** — three sequential calls yield sequences 1, 2, 3.
  - **Concurrency** — 50 calls fired together with `Promise.all` give 50 unique sequences, exactly 1..50 once sorted. A read-then-increment race would show up as a duplicate or gap.
  - **New year rollover** — after freezing time to 1 January of the next year, the sequence restarts at 1. Back in the original year, it resumes at 2, because the new year's counter is a separate document.

## Relationships
- `../../services/order-numbering` — provides `allocateOrderNumber`, the unit under test.
- `@modules/shop` (`shopTimezone`) — supplies the timezone used to compute the expected year.
- `@domain-primitives/time` (`yearInZone`) — computes the expected year in the first-number test.
- `@tests/clock` (`freezeDate`) — freezes `Date` for the year-boundary and rollover tests.
- `@tests/setup-test-db` (`setupTestDb`) — sets up the real Mongo test database.

## Notes
- Tests that call `freezeDate` restore the clock with `jest.useRealTimers()` in a `finally` block so a failed assertion doesn't leak fake time into later tests.
- A comment says `freezeDate` moves only `Date`, so Mongo round trips remain real (see `@tests/clock`).
- The rollover test's name says "new UTC year", while the Rome-timezone test says the year follows the shop's calendar. The rollover test freezes to `Date.UTC(firstYear + 1, 0, 1)`, which is midnight UTC on 1 January.
- Assertions rely on `Array.prototype.toSorted`.
