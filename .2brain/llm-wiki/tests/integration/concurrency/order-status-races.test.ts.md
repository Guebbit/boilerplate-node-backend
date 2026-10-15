---
source: tests/integration/concurrency/order-status-races.test.ts
sha256: 98bbade8b0bb997126d6ce42483eae05de1d19a39fb652760b19f28e9bfccd6f
generated_at: 2026-10-15T12:45:52.746444+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/order-status-races.test.ts

## Purpose

Integration test that fires concurrent HTTP requests at the same order's ship and cancel endpoints to prove that revision-claimed transactions and conditional writes prevent double-shipments, duplicate emails, and half-done state. It is the executable spec for the "exactly one winner" invariant under real network contention, not a unit test of a lock.

## Key elements

- **`describe('D2 — two admins racing the same ship door')`** — Two sub-tests that POST `N` (`RACE_SIZE`) concurrent ship requests to the same fulfillment order and assert exactly one `201`, the rest `409`, one `enqueueEmail` call, and one persisted shipment.
- **Partial-shipment test** — Order holds 3 units; each racer requests 1. Asserts exactly 3 succeed and the summed shipped quantity equals 3, proving the claim respects remaining stock under interleaving.
- **`describe('a ship racing a cancel of the whole order')`** — Fires ship and cancel via `Promise.all` (two-sided race). Asserts exactly one wins (`201`/`200`) and the other is refused (`409`), then verifies the persisted order status, shipment list, and fulfillment-order status are consistent with the winner.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a jest mock so the test can assert call-count without sending mail.
- **`setupTestDb()`** — Initializes a real test database for the suite.
- **`afterEach(() => jest.restoreAllMocks())`** — Resets the mailer mock between tests.

## Relationships

- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` to bring up the real test database before any test runs.
- **`tests/support/http.ts`** — Uses `api()` for raw HTTP calls and `authenticateAs('admin')` to obtain a bearer token.
- **`tests/support/race.ts`** — Imports `RACE_SIZE`, `raceN`, `countStatus`, and `expectNoServerErrors` to orchestrate and score N-way concurrency.
- **`src/modules/orders/model.ts`** — Calls `orderModel.findById` to read persisted order status after the race settles.
- **`src/modules/orders/tests/factories.ts`** — Uses `createOrder` and `toOrderItem` to seed test orders.
- **`src/modules/products/tests/factories.ts`** — Uses `createProduct` to seed a product for order lines.
- **`src/modules/delivery/tests/factories.ts`** — Uses `fulfillmentOrdersOf` to locate the fulfillment order under test and `shipmentsOf` to verify persisted shipment records.
- **`src/types/index.ts`** — Imports the `OrderStatus` enum for status assertions.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked; `enqueueEmail` is the sole spy to count shipped-parcel emails.
- **`src/kernel/outbox.ts`** — Calls `settleOutboxNudges()` after the cancel-wins branch so outbox-driven fulfillment-order cancellation propagates before assertions.

## Notes

- The ship-vs-cancel test uses `Promise.all` (2 racers) instead of `raceN`, because it models a specific two-sided race rather than N-way contention.
- In the cancel-wins branch, `settleOutboxNudges()` must be called before asserting fulfillment-order status; the cancel propagates to delivery via the outbox, not synchronously.
- The partial-shipment test's invariant (`exactly 3 win`) holds for any interleaving because the revision claim is atomic per line; the test does not pin *which* racers win.
- All requests go through real HTTP (`api()`); the only mock in the file is `enqueueEmail`. Everything else (DB, auth, delivery logic) is exercised for real.
