---
source: src/modules/delivery/tests/integration/order-status-races.test.ts
sha256: a8feb34aae997a8284341c42dd50e989d721ae802e9681336d5d5fdc5bd7d003
generated_at: 2026-10-29T03:46:29.615310+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/order-status-races.test.ts

## Purpose

Integration test that verifies two concurrent HTTP status-change requests on the same order cannot both succeed. It exercises the delivery "ship door" under real contention (N-way ship-vs-ship, ship-vs-cancel) over live HTTP against a real database, asserting exactly-one-winner semantics, no duplicate emails, and no half-written state.

## Key elements

- **`describe('two admins racing the same ship door')`** — Two tests: (1) N concurrent full-ship requests produce exactly one `201`, the rest `409`, one email, one shipment; (2) N racers each requesting 1 of 3 units produce exactly three `201`s, the remainder `409`s, and the order ends `shipped`.
- **`describe('a ship racing a cancel of the whole order')`** — One test firing a ship and a cancel simultaneously via `Promise.all`. Branches on which returned `201`/`200` to assert the loser got `409` and the final order/fulfillment/shipment state is consistent.
- **`mockEnqueueEmail`** — `enqueueEmail` is replaced with a `jest.fn()` so the test counts invocations rather than sending mail.
- **`raceN(RACE_SIZE, …)`** — Fires N concurrent `api()` POSTs and collects the response array.
- **`eventually(…)` + `settleOutboxNudges()`** — Polls until the outbox relay has delivered, then asserts the mailer was called exactly once.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` runs once before all tests to create a fresh schema. |
| `tests/support/http.ts` | `api()` builds the HTTP client; `authenticateAs('admin')` yields bearer token + user id used by factories and the Authorization header. |
| `tests/support/race.ts` | `RACE_SIZE` (concurrency), `raceN` (fire-N-collect), `countStatus`, `expectNoServerErrors` — all race-harness primitives. |
| `tests/support/eventually.ts` | `eventually(fn)` polls `fn` until truthy, used to wait for the async outbox relay. |
| `src/kernel/outbox.ts` | `settleOutboxNudges()` flushes pending outbox entries (the email relay) so the mailer mock has been called by the time assertions run. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is the only thing from this module imported; it is mocked so the test asserts on call count, not real delivery. |
| `src/modules/delivery/tests/factories.ts` | `fulfillmentOrdersOf(orderId)` and `shipmentsOf(orderId)` read the domain state after the race. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `readOrder`, `toOrderItem` set up the order fixture. |
| `src/modules/products/tests/factories.ts` | `createProduct` creates the SKU referenced by the order line. |
| `src/types/index.ts` | `OrderStatus` enum values (`processing`, `shipped`, `cancelled`) used in fixtures and assertions. |

## Notes

- **Two distinct race shapes.** The first `describe` block uses `raceN` (N-way, same endpoint, same payload) — a single-winner lock. The second block uses `Promise.all` with *different* endpoints (ship vs cancel) — a mutual-exclusion test. The partial-quantity test (3 units / N racers) is a *bounded* race: exactly 3 win, not 1.
- **Mailer is fully mocked.** The test never sends real email. `settleOutboxNudges()` must be awaited *before* asserting on `mockEnqueueEmail.mock.calls.length`, otherwise the relay hasn't fired the mock yet.
- **Cancel path is event-driven.** The order-cancel endpoint emits an outbox event; a delivery listener then closes/cancels the fulfillment orders. You must call `settleOutboxNudges()` after the race before reading `fulfillmentOrdersOf` or `shipmentsOf`, or you'll see stale state.
- **`afterEach` restores all mocks.** Because `enqueueEmail` is mocked at module level, `jest.restoreAllMocks()` in `afterEach` prevents leakage between tests.
- **No `beforeEach`.** Each test creates its own order/product; there is no shared mutable fixture state to clean up between tests.
