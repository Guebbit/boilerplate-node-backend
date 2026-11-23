---
source: src/modules/delivery/tests/integration/retention.test.ts
source_sha256: fc8ad6ef63fd3bcca14535f03a4cace62d356a166c4ab92be32254b82aea8dc3
context_sha256: 42dec1689b74cc512ed1a3d8c7dfb489a919421c34bbc2f7ef609211c5b64746
generated_at: 2026-11-22T05:03:01.642937+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/retention.test.ts

## Purpose
Integration test, run against a real test database, for `scrubHoldNotes` in the delivery retention service. It checks that a hold note older than the retention window is removed, that a younger one is kept, that nothing else on the fulfillment order changes, and that a second run changes nothing. The module doc calls this the `reap:delivery` job.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `beforeEach`: sets `NODE_HOLD_NOTE_RETENTION_DAYS` to `"30"` through `setEnvironment`.
- `DAY_MS`, `WINDOW_DAYS` (30): constants used to build ages and the window.
- `customers`: counter that gives each created user a unique email (`hold-N@example.com`).
- `heldAged(ageDays)`: test helper that:
  - creates a user, a product (price `'10.00'`) and a `processing` order with one item;
  - takes the order's first fulfillment order via `fulfillmentOrdersOf`;
  - sets it to `status: 'on_hold'`, `holdReason: 'high_risk'`, `holdNote: 'rang twice, odd voice'`, with `updatedAt` set to `ageDays` ago;
  - writes this with `updateOne(..., { timestamps: false })` so Mongoose does not overwrite `updatedAt`;
  - returns `{ id, updatedAt }`.
- `stored(id)`: reads the fulfillment order back with `findById(...).lean()`.
- Test cases in `describe('scrubHoldNotes')`:
  - A note 31 days old is unset and `scrubHoldNotes()` returns 1. `status`, `holdReason` and `lines` (length 1) are unchanged, and `updatedAt` is identical to before.
  - A note 29 days old is kept and the return value is 0.
  - Two old orders give return values `[2, 0]` over two consecutive runs, so the second run is a no-op and only orders that held a note are counted.
  - `scrubHoldNotes(later)` with a date 31 days ahead removes the note of a 1-day-old order. This shows the window is measured from the date passed in.

## Relationships
- `src/modules/delivery/services/retention.ts`: provides `scrubHoldNotes`, the function under test.
- `src/modules/delivery/model.ts`: provides `fulfillmentOrderModel`, used for the raw writes and reads.
- `src/modules/delivery/tests/factories.ts`: `fulfillmentOrdersOf` fetches the fulfillment orders created for an order.
- `src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/orders/tests/factories.ts`: `createUser`, `createProduct`, `createOrder` and `toOrderItem` build the fixtures.
- `src/types/index.ts`: provides `OrderStatus`, whose `processing` member is used when creating the order.
- `tests/support/setup-test-db.ts` and `tests/support/environment.ts`: supply `setupTestDb` and `setEnvironment`, imported through the `@tests/...` alias.

## Notes
- `updatedAt` is written by hand with `timestamps: false` because the age of a note is measured from `updatedAt`. The test asserts that scrubbing leaves `updatedAt` unchanged.
- Order creation and the fulfillment order lookup rely on `createOrder` producing a fulfillment order. The test takes the first one and assumes it exists.
