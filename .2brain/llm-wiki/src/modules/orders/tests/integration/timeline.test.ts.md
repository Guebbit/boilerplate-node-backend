---
source: src/modules/orders/tests/integration/timeline.test.ts
source_sha256: e0480dececf1acff6fc0763238fc6a216317d3b3d4f272bb9720494affbcf491
context_sha256: 61fd260c9e4991cfe735d177bd4517aa1b430e665f725ac96807f2b18ad896c8
generated_at: 2026-11-22T06:34:39.627335+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/timeline.test.ts

## Purpose
Integration tests for the order timeline, run against a real Mongo test DB through the order service's public API. They check that each order move writes exactly one timeline row in the move's own transaction, that readers see only rows their audience allows, and that data-protection rules (erasure, retention, export) are applied to timeline rows.

## Key elements
- **Local helpers**
  - `orderOfBuyer(n, status, extras)` creates an additional buyer, product and order with unique email, username and SKU. `extras.digital` makes the product non-shipping.
  - `daysAgo(days)` returns a past `Date`.
  - `typesOf(rows)` maps timeline rows to their `type` values.
- **`describe('what each move writes')`**
  - Covers `created` on `orderService.create`.
  - Covers per-move rows (`paid`, `processing`, `shipped`, `delivered`) with actor and data. The `delivered` row's `data.withdrawUntil` comes from `withdrawUntilFrom(date, 30)`.
  - `markFulfillmentComplete` writes `shipped` then `delivered` for a physical order, and only `delivered` for a digital one.
  - A move that lost its race (`markPaid` on a canceled order, which returns a null result) writes nothing.
  - If the outbox event write fails, the timeline row rolls back with the move.
  - Cancellation records the actor: a customer cancel stores the buyer's id with `by: 'customer'`, and the erasure sweep stores `by: 'system'` with no `actor`.
  - `overrideStatus` writes `status_overridden` with the reason as `text`.
- **`describe('who reads what')`**
  - Staff see every row with its `actor`. Buyers see only buyer-audience rows, without `actor`.
  - Each row carries an `audience` of `buyer` or `staff`.
  - Buyers never see staff text.
- **`describe('what the law lets go')`**
  - Erasing a staff account clears `actor` on every row but keeps the rows.
  - `scrubTimelineText()` unsets staff text older than `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS`. It returns the count scrubbed and is idempotent (second call returns 0).
  - `removeById(id, true)` deletes the order's timeline rows.
- **`describe('the buyer's data export')`**
  - `collectTimelineOf(userId)` returns only the account's own orders' rows, including staff text but without `actor`.
  - The file content is cut off partway through this section.

## Relationships
- **Order services**
  - `orderService` from `src/modules/orders/services/index.ts` is the main entry point: `create`, `markProcessing`, `overrideStatus`, `cancelOnRequestById`, `appendTimeline`, `scrubTimelineText`, `collectTimelineOf` and `removeById`.
  - `src/modules/orders/services/status.ts` provides `markShipped`, `markDelivered` and `markFulfillmentComplete`.
  - `src/modules/orders/services/cancel.ts` provides `cancelForErasureById`.
- **Payments and domain**
  - `src/modules/orders/friends/payments.ts` provides `markPaid`.
  - `src/modules/orders/domain/index.ts` and `src/modules/orders/domain/withdrawal.ts` provide `withdrawUntilFrom`.
- **Persistence**
  - `src/modules/orders/model.ts` provides `orderEventModel`, used to count rows after a hard delete.
  - `src/infrastructure/runtime/database.ts` provides `withTransaction`.
- **Kernel**
  - `src/kernel/outbox.ts` provides `outboxEventModel`, whose `create` is spied on to force a failure, and `settleOutboxNudges`.
  - `src/kernel/events.ts` provides `resetDomainEvents`, called after each test.
- **Test support**
  - The order, product and user `factories` (`src/modules/orders/tests/factories.ts`, `src/modules/products/tests/factories.ts`, `src/modules/users/tests/factories.ts`) provide `createOrder`, `seedOrder`, `toOrderItem`, `timelineOf`, `timelineAs`, `createProduct`, `createUser` and `eraseAsScheduled`.
  - `tests/support/callers.ts` provides `asAdmin`, `asCustomer` and `callerContextAs`.
  - `src/types/index.ts` provides `OrderStatus`.

## Notes
- `setupTestDb()` sets up the DB. `afterEach` restores mocks and resets domain events.
- The erasure test calls `registerCheckoutModules()` first, and the retention test sets the retention env var through `setEnvironment`.
- The fixture's default user email is reused once per test, so extra buyers need explicit unique email, username and SKU values.
- The module docblock points to the orders module documentation, section "the timeline".
