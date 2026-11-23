---
source: src/modules/returns/tests/integration/retention.test.ts
source_sha256: 78fad55f0048ca5449e44668b5e0d21ee32b9416f33cc942b2d9a48653b7860a
context_sha256: b3fe1903799cc78044ade500532063e3f9192310643f759b2f8ec8abd18dff47
generated_at: 2026-11-22T07:37:05.175301+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/retention.test.ts

## Purpose
Integration test, run against a real test database, for the return free-text retention job (`reap:returns`). It checks four things. Text older than the retention window is removed. Text inside the window is kept. No other field on the return changes. A rerun changes nothing.

## Key elements
- `setupTestDb()` is called at module level to wire up the real database.
- `beforeEach` sets `NODE_RETURN_TEXT_RETENTION_DAYS` to `WINDOW_DAYS` (30) through `setEnvironment`.
- `returnAged(ageDays)` is a helper that builds a user, product and delivered order with the factories. It creates a `declined` return that has a `note` and a `declineMessage`. It then back-dates `updatedAt` by `ageDays` using `updateOne(..., { timestamps: false })`, so Mongoose doesn't overwrite it. It returns `{ id, updatedAt }`. A module-level counter gives each user a unique email.
- `stored(id)` reads the raw return with `findById().lean()`.
- The `scrubReturnText` tests cover these cases:
  - A return past the window loses `note` and `declineMessage`. It keeps `declineReason`, `status`, `reason`, `currency`, `lines`, `decidedAt` and `updatedAt`. The call returns `1`.
  - A return inside the window (`WINDOW_DAYS - 1`) is untouched. The call returns `0`.
  - A return that has only one of the two texts is still scrubbed, in both directions (note only, or decline message only).
  - A second run returns `0`.
  - `returnRepository.scrubFreeTextBefore(cutoff)` respects the cutoff it is given. A cutoff 10 days back returns `0` for a 5-day-old return, and `new Date()` returns `1` and removes the note.

## Relationships
- `src/modules/returns/services/retention.ts`: provides `scrubReturnText`, the function under test. It returns the number of scrubbed returns.
- `src/modules/returns/repository.ts`: `returnRepository` is imported, and its `scrubFreeTextBefore(date)` method is called directly in the cutoff test.
- `src/modules/returns/model.ts`: `returnModel` creates returns, back-dates `updatedAt`, unsets fields and reads the stored documents.
- `src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/orders/tests/factories.ts`: `createUser`, `createProduct`, `createOrder` and `toOrderItem` build the order the return refers to.
- `src/types/index.ts`: supplies `OrderStatus`, which is used to give the order a delivered status.
- `tests/support/setup-test-db.ts` and `tests/support/environment.ts`: supply the DB lifecycle (`setupTestDb`) and the env override (`setEnvironment`).

## Notes
- The window is read from the `NODE_RETURN_TEXT_RETENTION_DAYS` environment variable, which is reset in `beforeEach`.
- Back-dating `updatedAt` needs `timestamps: false`. The same option is used when unsetting a single text field, so the age isn't reset.
- The `declineReason` code is deliberately kept because it is not free text. The record still says why the return was declined.
- The test asserts that `updatedAt` is unchanged after scrubbing, so the scrub must not touch it.
