---
source: tests/integration/journeys/a-receiver-that-stays-down.test.ts
sha256: 59350bd03535632325c581852ffd1c71148ef45b58d306ee80caf669442c408d
generated_at: 2026-10-29T06:56:05.683588+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/a-receiver-that-stays-down.test.ts

## Purpose

Integration test verifying the full auto-disable journey for a webhook subscription: after five consecutive failed delivery chains (six attempts each) **and** three days of continuous failure, the subscription disables itself, notifies staff, and writes a system audit row. Re-enabling via the API resets the failure counter and `failingSince` to zero. Asserts only the cross-module chain; the backoff ladder mechanics are tested elsewhere.

## Key elements

- **`runLadder()`** — Local helper that drives one full six-attempt retry chain by calling `drain('sweep:webhook-retries')` and advancing the clock 11 hours (past the 10-hour max backoff) between each sweep.
- **`subscription()`** (closure) — Fetches the subscription's current state via `GET /webhooks/subscriptions` and returns the matching entry.
- **`disabledNotices()`** (closure) — Queries `GET /notifications` and filters for `notifications.staff.webhook-disabled`.
- **`placeOne()`** (closure) — Creates a fresh shopper and places a single order, producing one `order.created` event destined for the failing endpoint. A new shopper is used each time because an account may hold at most two unpaid orders.
- **`it('switches itself off after five dead chains…')`** — The single test case. Sets up a 500-answering receiver, subscribes to `order.created`, fires five orders + ladders (still enabled), advances three days, fires a sixth order + ladder (expecting `enabled: false`, staff notification, audit row), then re-enables and asserts the counter and `failingSince` are cleared.
- **`afterEach`** — Restores real timers and stops the webhook receiver.
- **`HOUR_MS` / `DAY_MS`** — Millisecond constants for clock advancement.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initializes a fresh in-memory database before the test runs.
- **`tests/support/contract.ts`** — Side-effect import that loads API contract fixtures.
- **`tests/support/http.ts`** — Provides `api()` (supertest-style client), `authenticateAs()`, and `loginBearer()` used throughout for authenticated requests.
- **`tests/support/clock.ts`** — `freezeDate()` and `advanceDate()` control the virtual clock so backoff timers and the three-day window are deterministic.
- **`tests/support/body-of.ts`** — `bodyOf()` parses and type-checks JSON responses against Zod schemas.
- **`tests/support/drain.ts`** — `drain('sweep:webhook-retries')` processes all queued retry jobs in a given sweep, simulating the background worker.
- **`tests/support/webhook-receiver.ts`** — `startWebhookReceiver()` spins up a local HTTP server whose response code is configurable (`answerWith(500)`); `receiver.stop()` tears it down.
- **`tests/support/journey-orders.ts`** — `newShopper()` and `placeOrder()` create authenticated shoppers and place orders, triggering `order.created` webhooks.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a purchasable product for the orders.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository.findById()` is used at the end to assert `failingSince` was nulled at the database level after re-enabling.

## Notes

- The 11-hour advance between attempts deliberately exceeds the 10-hour maximum backoff step so no retry is skipped regardless of where it landed in the ladder.
- Five dead chains are **not** sufficient on their own; the test explicitly verifies `enabled: true` after five chains before advancing three days. Both conditions must hold simultaneously.
- The test checks `autoDisabledAt` is defined on the API response and `failingSince` is `undefined` in the stored document after re-enable, confirming the reset is complete at both layers.
- Only one audit row with action `system.webhook_subscription.auto_disabled` is expected across the entire run.
