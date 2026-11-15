---
source: src/modules/orders/tests/integration/timeline.test.ts
sha256: f17b8582649a58705e5a730e21f5fc86bd1d3f755ce5024ae6d42f9b099859be
generated_at: 2026-11-14T20:56:29.154308+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/timeline.test.ts

## Purpose

Integration tests for the order timeline: verifies that each lifecycle move writes exactly the expected row (type, actor, data, audience), that audience filtering hides staff-only rows and text from buyers, that GDPR obligations (erasure, text-retention scrubbing, hard-delete cleanup) behave correctly, and that the buyer data export includes only what it should. Runs against real MongoDB through `orderService`'s public API.

## Key elements

- **`orderOfBuyer(n, status, extras?)`** – Creates a distinct buyer + product + order (unique email/sku per `n`) to avoid the factory's single-default-email collision when a test needs multiple buyers.
- **`daysAgo(days)`** / **`typesOf(rows)`** – Small helpers for back-dated timestamps and extracting the `type` string array from timeline rows.
- **`describe('what each move writes')`** – Asserts the exact sequence and shape of timeline rows after create, paid→processing→shipped→delivered, digital vs. physical fulfillment, lost-race (no-op), outbox-failure rollback, cancellation (buyer vs. sweep), and status override.
- **`describe('who reads what')`** – Verifies `timelineAs` with `asAdmin()` vs. `asCustomer()`: buyer sees only buyer-audience rows without `actor`; staff text never leaks to the buyer view.
- **`describe('what the law lets go')`** – Covers `eraseAsScheduled` (clears actor, keeps rows), `scrubTimelineText` (removes text past the retention window, idempotent), and `removeById(_, true)` (deletes all timeline documents for a hard-deleted order).
- **`describe('the buyer's data export')`** – Checks `collectTimelineOf` includes the buyer's own rows and staff text but strips `actor` and excludes other users' orders.

## Relationships

- **`src/modules/orders/services/index.ts`** (`orderService`) – the system under test; all assertions call its public methods (`create`, `markProcessing`, `cancelOnRequestById`, `overrideStatus`, `appendTimeline`, `scrubTimelineText`, `removeById`, `collectTimelineOf`).
- **`src/modules/orders/friends/payments.ts`** (`markPaid`) – triggers the "paid" timeline row outside the main service.
- **`src/modules/orders/services/status.ts`** (`markShipped`, `markDelivered`, `markFulfillmentComplete`) – exercises the shipped/delivered and digital-fulfillment paths.
- **`src/modules/orders/services/cancel.ts`** (`cancelForErasureById`) – exercises the system-sweep cancellation path.
- **`src/modules/orders/domain/index.ts`** (`withdrawUntilFrom`) – used to compute the expected `withdrawUntil` value in the delivered-row assertion.
- **`src/modules/orders/model.ts`** (`orderEventModel`) – inspected directly to confirm documents are deleted after hard-delete.
- **`src/infrastructure/runtime/database.ts`** (`withTransaction`) – wraps fulfillment-complete calls to assert the timeline row is written in the same Mongo transaction.
- **`src/kernel/outbox.ts`** (`outboxEventModel`, `settleOutboxNudges`) – `outboxEventModel`'s `create` method is spied on to simulate a disk failure and verify rollback; `settleOutboxNudges` drains pending outbox nudges after the erasure-cancel test.
- **`src/kernel/events.ts`** (`resetDomainEvents`) – called in `afterEach` to clear the in-memory domain-event bus.
- **`src/modules/orders/tests/factories.ts`** – provides `createOrder`, `seedOrder`, `toOrderItem`, `timelineOf`, `timelineAs` used throughout.
- **`src/modules/users/tests/factories.ts`** (`createUser`, `eraseAsScheduled`) – buyer/staff fixtures and the GDPR erasure trigger.
- **`src/modules/products/tests/factories.ts`** (`createProduct`) – product fixture.
- **`tests/support/callers.ts`** (`asAdmin`, `asCustomer`, `callerContextAs`) – caller-context builders for service calls.
- **`src/types/index.ts`** (`OrderStatus`) – shared status enum.

## Notes

- This is a **real-MongoDB** integration test (`setupTestDb()`), not a unit test; it exercises transactional atomicity (a failed outbox write rolls the timeline row back) and reads back from the database.
- The module docstring points to `docs/modules/orders.md#the-timeline` for the domain rationale behind each assertion.
- `afterEach` calls `jest.restoreAllMocks()` **and** `resetDomainEvents()`; forgetting either can cause cross-test pollution (leaked mocks or stale domain events).
- The `orderOfBuyer` helper exists specifically because the shared `createUser` factory reuses one default email; calling it twice in the same test would violate a uniqueness constraint.
- GDPR tests use environment overrides (`NODE_ORDER_EVENT_TEXT_RETENTION_DAYS`) via `setEnvironment`; these are not cleaned up automatically—rely on test ordering or reset in `afterEach`.
