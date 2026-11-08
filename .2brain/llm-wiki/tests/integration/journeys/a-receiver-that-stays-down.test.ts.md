---
source: tests/integration/journeys/a-receiver-that-stays-down.test.ts
sha256: aec0e6719717d8c7382f1326753134e0b4e92bed260742e852e33be7dbebf500
generated_at: 2026-11-08T09:39:22.052592+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/a-receiver-that-stays-down.test.ts

## Purpose

Integration test for the webhook auto-disable journey: a subscription whose receiver endpoint always returns 500 accumulates failed retry chains, and after five dead chains **plus** three days of continuous failure, the system disables the subscription, notifies staff, and writes an audit row. Re-enabling resets the streak to zero.

## Key elements

- **`runLadder`** — async helper that simulates all six retry attempts by calling `drain('sweep:webhook-retries')` and advancing the frozen clock past the longest backoff wait (11 h) in each iteration.
- **`placeOne`** — creates a fresh shopper (to avoid the two-unpaid-orders-per-account limit) and places a single-item order, producing one `order.created` event for the failing endpoint.
- **`subscription()`** — fetches the target subscription via the list endpoint and returns the matching record.
- **`disabledNotices()`** — fetches the admin's notification bell and filters for `notifications.staff.webhook-disabled`.
- **`HOUR_MS` / `DAY_MS`** — time-unit constants used by `runLadder` and the three-day advancement.
- **`afterEach`** — restores real timers and stops the webhook receiver.

## Relationships

- **`src/modules/products/tests/factories.ts`** — calls `createProduct` to seed a product for the order.
- **`src/modules/webhooks/repository.ts`** — calls `webhookSubscriptionRepository.findById` to verify the DB-level `failingSince` field is cleared after re-enable.
- **`tests/support/body-of.ts`** — wraps every API response to extract and Zod-validate the body.
- **`tests/support/clock.ts`** — provides `freezeDate` / `advanceDate` to drive time deterministically.
- **`tests/support/contract.ts`** — imported for global test-setup side effects (request validation contracts).
- **`tests/support/drain.ts`** — triggers the `sweep:webhook-retries` job so each retry attempt actually executes.
- **`tests/support/http.ts`** — provides `api`, `authenticateAs`, `loginBearer` for authenticated Supertest calls.
- **`tests/support/journey-orders.ts`** — provides `newShopper` and `placeOrder` to generate `order.created` events.
- **`tests/support/setup-test-db.ts`** — initializes the in-memory test database before the suite runs.
- **`tests/support/webhook-receiver.ts`** — spins up a local HTTP receiver whose response code the test configures (`answerWith(500)`).

## Notes

- The test runs under **fake timers** (`freezeDate`); real time never passes. `afterEach` calls `jest.useRealTimers()` to clean up.
- "Five dead chains" alone do **not** disable the subscription — the three-day `failingSince` window must also elapse. The test asserts both conditions independently.
- The backoff ladder itself (exponential timing, max attempts) is covered by separate unit tests; this journey test only asserts the cross-module outcome (disable, notify, audit, re-enable reset).
- `autoDisabledAt` is the wire-level marker of auto-disable (distinct from a manual pause); `failingSince` is the DB-level anchor for the three-day floor. Both are expected to be `undefined` after re-enable.
- A new shopper is created per order because the domain allows at most two unpaid orders per account.
