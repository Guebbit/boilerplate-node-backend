---
source: src/modules/orders/tests/integration/timeline.test.ts
sha256: f17b96a2d295794b08c213f89ee2e76e2830d7674e9a80fd661b817cd6d4e78e
generated_at: 2026-10-15T11:18:45.189703+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/timeline.test.ts

## Purpose
Integration test for the order timeline: verifies that each lifecycle transition writes exactly one row (with the correct type, actor, and data), that role-based visibility filters rows and fields for buyers vs. staff, that GDPR/retention rules scrub actors and staff text, and that a buyer's data export includes their own full timeline. Runs against real MongoDB through `orderService`'s public API.

## Key elements
- **`orderOfBuyer(n, status, extras?)`** — helper that creates a uniquely-identified buyer, product, and order in one call (avoids email collisions across tests).
- **`daysAgo(days)`** — returns a `Date` N days in the past; used for retention-window assertions.
- **`typesOf(rows)`** — projects an array of timeline rows down to their `type` strings for concise expectations.
- **`describe('what each move writes')`** — covers: initial `created` row; one row per paid → processing → shipped → delivered sequence; `shipped`+`delivered` vs. `delivered`-only for physical vs. digital fulfilment; no row when a transition loses its status race; transactional rollback of the row when the outbox write fails; actor attribution for customer vs. system cancellations; `status_overridden` with reason text.
- **`describe('who reads what')`** — buyer sees only buyer-visible rows without `actor`; staff sees every row with actor; buyer never sees staff `text`.
- **`describe('what the law lets go')`** — erasing an account nulls `actor` on all its rows (rows kept); `scrubTimelineText()` clears staff text older than the retention window (idempotent: returns count of rows changed); hard-deleting an order removes all its timeline rows from `orderEventModel`.
- **`describe('the buyer's data export')`** — `collectTimelineOf(userId)` returns full rows (including staff `text` and `actor`) for only that user's orders.

## Relationships
- **`src/modules/orders/services/index.ts`** (`orderService`) — the system under test; every assertion flows through its public methods (`create`, `markPaid`, `markProcessing`, `markShipped`, `markDelivered`, `markFulfilmentComplete`, `cancelById`, `overrideStatus`, `readTimeline`, `appendTimeline`, `scrubTimelineText`, `removeById`, `collectTimelineOf`).
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `seedOrder`, `toOrderItem`, and `timelineOf` (the read helper that queries `orderEventModel` directly).
- **`src/modules/products/tests/factories.ts`** — `createProduct` for building order line items.
- **`src/modules/users/tests/factories.ts`** — `createUser` for buyer and staff fixtures.
- **`tests/support/callers.ts`** — `asAdmin`, `asCustomer`, `callerContextAs` to build caller contexts passed to service methods.
- **`src/kernel/permissions.ts`** — `SYSTEM_ACTOR` constant used for system-initiated cancellations.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is spied on to simulate a write failure (rollback test); `settleOutboxNudges` processes outbox before hard-delete.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` to isolate event listeners between tests.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps multi-step mutations (fulfilment-complete, `appendTimeline`) in a real Mongo transaction.
- **`src/modules/orders/domain/index.ts`** / **`src/modules/orders/domain/withdrawal.ts`** — `withdrawUntilFrom` used to compute the expected `withdrawUntil` value in the delivered-row assertion.
- **`src/modules/orders/model.ts`** — `orderEventModel` queried directly to assert document count after hard delete.
- **`src/modules/users/index.ts`** — `userService.remove` exercises the account-erasure path that should null the actor on timeline rows.
- **`src/types/index.ts`** — `OrderStatus` enum for status literals.

## Notes
- The file header points to `docs/modules/orders.md#the-timeline` for the design rationale.
- Tests use **real MongoDB** (`setupTestDb`), not in-memory mocks; only `outboxEventModel.create` is spied on (once) to simulate failure.
- `afterEach` restores all mocks and resets domain events — no manual cleanup of in-memory state is needed between tests.
- The "race lost" test seeds an already-cancelled order and asserts `markPaid` returns `null` *and* no timeline row exists — the service guards the transition, not the test.
- `scrubTimelineText` is expected to be idempotent: the first call returns `1` (rows changed), the second returns `0`.
- The buyer data-export test asserts that `collectTimelineOf` **includes** staff `text` and `actor` (unlike the read path, which strips them for buyers) — the export is for the data subject, not a staff view.
