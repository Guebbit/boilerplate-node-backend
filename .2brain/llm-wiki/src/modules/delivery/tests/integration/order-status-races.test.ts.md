---
source: src/modules/delivery/tests/integration/order-status-races.test.ts
sha256: d74180914268163f0bbc8ad02b1c65714107a27ed99261b44d0b4a320aa0eb90
generated_at: 2026-11-08T05:42:38.275989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/order-status-races.test.ts

## Purpose

Integration tests that verify concurrent status-change requests on the same order cannot both succeed. Two race scenarios are covered against real HTTP contention: (1) N admins simultaneously hitting the ship endpoint on one fulfillment order, and (2) a ship racing a full-order cancel. The file exists to guard the optimistic-revision claim that only one writer lands, and that the shipment email fires exactly once per real commit.

## Key elements

- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a `jest.fn()` so the test can assert call count without a real mail relay.
- **`describe('two admins racing the same ship door')`**
  - *"ships once…"* — fires `RACE_SIZE` concurrent POSTs to `/delivery/fulfillment-orders/:id/shipments`; asserts exactly **1 × 201**, the rest **409**, **1** email, **1** stored shipment, order status `shipped`.
  - *"never ships more than remains…"* — same endpoint, order holds 3 units, each racer requests 1; asserts exactly **3 × 201**, total shipped units = 3, order status `shipped`.
- **`describe('a ship racing a cancel of the whole order')`**
  - *"lets exactly one win…"* — fires ship and `POST /orders/:id/cancel` via `Promise.all`; branches on which got 201 and asserts the other got 409, order status is consistent (`shipped` or `canceled`), and fulfillment-order status is `closed` or `canceled` respectively.

## Relationships

- **`tests/support/race.ts`** — provides `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`; the concurrency harness every assertion in this file depends on.
- **`tests/support/http.ts`** — `api()` and `authenticateAs('admin')` build the Supertest calls and bearer token.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module scope to seed a clean database.
- **`tests/support/eventually.ts`** — `eventually()` retries the outbox-settlement check until the async email relay fires.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` must be awaited before asserting on `mockEnqueueEmail` calls; it drains the async outbox that gates email dispatch.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the mocked unit under observation (call-count assertions).
- **`src/modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf`, `shipmentsOf` query the delivery domain to verify post-race state.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `toOrderItem` build and inspect the order fixture.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the product referenced by order lines.
- **`src/types/index.ts`** — `OrderStatus` enum (`processing`, `shipped`, `canceled`) used in assertions.

## Notes

- **Outbox gating:** The email is not sent synchronously with the ship write. The test must `await settleOutboxNudges()` (possibly inside `eventually`) before checking `mockEnqueueEmail` call count. Skipping this step causes flaky "0 calls" failures.
- **Partial-ship arithmetic:** The second test in the first `describe` hardcodes 3 units / 1-unit-per-racer. If `RACE_SIZE` changes, the expected 201 count (3) stays fixed because it is bounded by remaining quantity, not by racer count.
- **Ship-vs-cancel branching:** The test does not know a priori which side wins; it inspects `ship.status === 201` and asserts the symmetric outcome. Both 201/409 paths are required to pass.
- **`afterEach(jest.restoreAllMocks)`** ensures the mailer mock resets between tests even though it is declared at module level.
