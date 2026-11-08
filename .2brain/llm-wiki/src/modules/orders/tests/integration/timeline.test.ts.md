---
source: src/modules/orders/tests/integration/timeline.test.ts
sha256: 9b80080cba99a12cd867f0f236d9d8368495ce1a2365879c05cfa6e5daf75483
generated_at: 2026-11-08T07:11:11.837220+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/timeline.test.ts

## Purpose

Integration tests for the order timeline: verifies that every lifecycle move writes exactly the expected row (type, actor, data, audience), that readers see only the rows their audience permits, that erasure/retention rules clear actors and staff text without deleting rows, and that the buyer's data export includes only their own rows. Runs against real MongoDB through `orderService`'s public API.

## Key elements

- **`orderOfBuyer(n, status, extras?)`** – Creates a distinct buyer + product + order (unique email/username per call) so multiple orders can coexist in one test.
- **`daysAgo(days)`** – Returns a `Date` that many days in the past; used for retention-window assertions.
- **`typesOf(rows)`** – Extracts the `type` field from an array of timeline rows for concise assertions.
- **`describe('what each move writes')`** – Asserts the row sequence and payload for `created`, `paid`, `processing`, `shipped`, `delivered`, `markFulfillmentComplete` (physical vs. digital), a lost-race no-op, rollback on outbox failure, `canceled` (buyer vs. system), and `status_overridden`.
- **`describe('who reads what')`** – Verifies audience-based filtering: staff see every row with `actor`; buyer sees only buyer-audience rows without `actor` and never sees staff `text`.
- **`describe('what the law lets go')`** – Tests GDPR/retention: erasing an account clears `actor` but keeps the row; `scrubTimelineText` unsets text past `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS` (idempotent); hard-deleting an order removes all timeline rows.
- **`describe('the buyer's data export')`** – Verifies `collectTimelineOf` returns only the requesting user's orders, includes staff `text`, excludes `actor`, and excludes other users' orders.
- **`afterEach`** – Restores all mocks and calls `resetDomainEvents()`.

## Relationships

- **`src/modules/orders/services/index.ts`** (`orderService`) – The system under test; every assertion goes through its public methods (`create`, `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfillmentComplete`, `cancelOnRequestById`, `overrideStatus`, `readTimeline`, `appendTimeline`, `scrubTimelineText`, `removeById`, `collectTimelineOf`).
- **`src/modules/orders/tests/factories.ts`** – Provides `createOrder`, `seedOrder`, `toOrderItem`, and `timelineOf` (the read helper that queries the timeline directly).
- **`src/modules/users/tests/factories.ts`** – `createUser` and `eraseAsScheduled` for buyer/staff fixtures and erasure simulation.
- **`src/modules/products/tests/factories.ts`** – `createProduct` to seed a purchasable item.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` wraps calls that must run in a Mongo session (e.g., `markFulfillmentComplete`, `appendTimeline`).
- **`src/kernel/outbox.ts`** – `outboxEventModel.create` is mocked to simulate a write failure (rollback test); `settleOutboxNudges` finalizes erasure side-effects.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` prevents cross-test leakage.
- **`src/modules/orders/domain/index.ts`** – `withdrawUntilFrom` used to compute the expected `withdrawUntil` value on the `delivered` row.
- **`src/modules/orders/model.ts`** – `orderEventModel` queried directly (`countDocuments`) to verify hard-delete removed all rows.
- **`src/modules/orders/services/cancel.ts`** – `cancelForErasureById` for the system-initiated cancellation path.
- **`tests/support/callers.ts`** – `asAdmin`, `asCustomer`, `callerContextAs` build the caller contexts passed to service methods.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` needed before erasure tests.
- **`tests/support/environment.ts`** – `setEnvironment` sets `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS` for the scrub test.
- **`src/types/index.ts`** – `OrderStatus` enum for seeding and assertions.

## Notes

- The file header links to `docs/modules/orders.md#the-timeline` for the design narrative.
- Tests exercise the service's **public door** (not internal model writes), except for two deliberate exceptions: mocking `outboxEventModel.create` to force a failure, and calling `orderEventModel.countDocuments` to confirm hard-delete.
- `orderOfBuyer` exists solely because the shared `createUser` fixture email is unique per test run; incrementing `n` avoids collisions.
- The retention-scrub test asserts idempotency by calling `scrubTimelineText()` twice and expecting `1` then `0`.
- Comments cite GDPR case law (Nowak, Pankki S) to justify why staff `text` is exported but `actor` is not.
