---
source: src/modules/orders/tests/integration/service-status.test.ts
sha256: b21f0499e50594cda456cc8e9db8073ddd498722275e5d1b09d69a263e94de15
generated_at: 2026-11-14T20:55:52.290929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-status.test.ts

## Purpose

Integration tests for the order status transition functions in `services/status.ts`, run against a **real MongoDB** instance (not mocks). Verifies three guarantees: (1) conditional writes refuse invalid transitions, (2) exactly one `ORDER_STATUS_CHANGED` outbox event fires per successful move, and (3) transactional (session-variant) doors commit atomically with the caller's transaction. Also covers deadline calculations and concurrent-race correctness.

## Key elements

- **`describe('markPaid')`** — pending→paid happy path (asserts `paidAt` stamp), refusal from `paid`/`processing`/`canceled`.
- **`describe('markProcessing')`** — paid→processing, refusal from `pending`, and that the method is reachable via the `orderService` object.
- **`describe('markShipped')`** — processing→shipped, refusal from `paid`.
- **`describe('markDelivered')`** — shipped→delivered; asserts `withdrawUntil` (30 days, end-of-day UTC) and `conformityUntil` (2 years) are frozen from the delivery timestamp passed in; refusal from `processing`.
- **`describe('markFulfillmentComplete')`** — physical order: processing→shipped→delivered in one write (two events); digital-only order: processing→delivered (one event, clock from `paidAt`); refusal from `paid`/`shipped`/`delivered`; rollback leaves the order untouched and outbox empty.
- **`describe('the doors that take the caller's session')`** — verifies that session-variant `markShipped`/`markDelivered` are invisible until the caller's transaction commits, then announce via outbox.
- **`describe('two callers racing the same move')`** — concurrent `markPaid` calls land exactly one write and one event.
- **`inTransaction` helper** — thin wrapper around `withTransaction` used to invoke session-variant doors within their own transaction.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/status.ts` | Module under test; all `mark*` functions are imported and exercised. |
| `src/modules/orders/services/index.ts` | `orderService` is called to confirm methods are exposed on the service object. |
| `src/modules/orders/domain/index.ts` | `NO_FULFILLMENT` and `FulfillmentSummary` imported (re-exported barrel). |
| `src/modules/orders/domain/fulfillment.ts` | Origin of the `FulfillmentSummary` type and `NO_FULFILLMENT` constant used in digital-order assertions. |
| `src/modules/orders/events.ts` | `ORDER_STATUS_CHANGED` event name used for subscription and outbox assertions. |
| `src/kernel/events.ts` | `markDomainEventsWired` / `resetDomainEvents` / `onDomainEvent` manage the in-process event bus for assertions. |
| `src/kernel/outbox.ts` | `nudgeOutbox` / `settleOutboxNudges` / `outboxEventModel` drive and inspect the async outbox relay. |
| `src/infrastructure/runtime/database.ts` | `withTransaction` provides the `ClientSession`-scoped transaction used by session-variant tests. |
| `src/modules/orders/tests/factories.ts` | `seedOrder`, `seedDigitalOrder`, `readOrder` create and verify fixtures. |
| `tests/support/setup-test-db.ts` | `setupTestDb` connects the test run to a real MongoDB. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` lets a single test override `NODE_WITHDRAWAL_PERIOD_DAYS`. |
| `src/types/index.ts` | `OrderStatus` enum used throughout for seeding and assertions. |

## Notes

- **No mocks.** The module doc-block states the guarantee under test is the conditional `$in` filter inside `updateStatusIfIn`; a mock cannot reproduce a race, so a real database is required.
- **Outbox is async by design.** You must call `settleOutboxNudges()` (or `nudgeOutbox()` then settle) *before* asserting on `events`. Forgetting this makes event assertions flaky.
- **`markDomainEventsWired()` in `beforeEach`.** The outbox relay only delivers in a process whose modules are subscribed; without this call, no events arrive and assertions silently pass as empty arrays.
- **Session-variant doors require the caller to nudge.** When a test calls a door with a `ClientSession`, the outbox write is part of that transaction; the test must call `nudgeOutbox()` after the transaction resolves to trigger delivery.
- **Deadlines are end-of-day UTC.** All `*Until` fields are stamped at `23:59:59.999Z` of the target day, not at the exact delivery timestamp.
- **`markFulfillmentComplete` only accepts `processing`.** It is the single door for fulfillment; calling it from `paid`, `shipped`, or `delivered` returns `null` and writes no outbox row.
