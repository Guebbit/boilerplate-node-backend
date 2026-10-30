---
source: src/modules/orders/tests/integration/timeline.test.ts
sha256: ac363cc9f544231264d8ed267b9a8a2ea9242d872afd376f213b770f650cd74b
generated_at: 2026-10-29T04:58:04.869943+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/timeline.test.ts

## Purpose
Integration tests for the order timeline: verifies that each lifecycle move writes exactly one row (in the move's transaction), that readers see only the rows their audience permits, that retention/erasure rules scrub or delete rows correctly, and that a buyer's data export includes the right rows with the right fields stripped. Runs against real MongoDB through `orderService`'s public API.

## Key elements
- **`orderOfBuyer(n, status, extras?)`** – helper that creates a uniquely-emailed buyer, a product, and an order; used to avoid fixture email collisions across tests.
- **`daysAgo(days)`** – returns a `Date` that many days in the past; used in retention-window tests.
- **`typesOf(rows)`** – projects a timeline row array down to its `type` strings for concise assertions.
- **`describe('what each move writes')`** – asserts the exact row sequence and payload for `created`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, and `status_overridden`; verifies race-loss writes nothing and that an outbox-write failure rolls the row back.
- **`describe('who reads what')`** – asserts buyer-visible rows hide `actor` and staff-only rows (e.g. `status_overridden`) are invisible to the buyer; each row carries its own `audience` tag.
- **`describe('what the law lets go')`** – verifies `eraseAsScheduled` nulls the actor on existing rows, `scrubTimelineText` unsets `text` only past the retention window (idempotent), and hard-delete removes all timeline documents.
- **`describe('the buyer's data export')`** – verifies `collectTimelineOf` returns only the exporting user's orders, includes `text` but strips `actor` (unless the actor is the buyer themselves), and excludes other buyers' orders.
- **`afterEach`** – restores all mocks and calls `resetDomainEvents()` to isolate kernel event state between tests.

## Relationships
- **`src/modules/orders/services/index.ts`** — imports `orderService`, the system under test; every test exercises its public methods (`create`, `markPaid`, `markFulfilmentComplete`, `overrideStatus`, `readTimeline`, `appendTimeline`, `scrubTimelineText`, `removeById`, `collectTimelineOf`, `cancelOnRequestById`).
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder`, `seedOrder`, `toOrderItem`, `timelineOf` for fixture setup and row reads.
- **`src/modules/users/tests/factories.ts`** — imports `createUser`, `eraseAsScheduled` for buyer/staff fixtures and GDPR erasure.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` for product fixtures.
- **`tests/support/callers.ts`** — imports `asAdmin`, `asCustomer`, `callerContextAs` to build request contexts for write and read operations.
- **`tests/support/checkout-modules.ts`** — imports `registerCheckoutModules` (used in the erasure test to wire up module registry).
- **`tests/support/environment.ts`** — imports `setEnvironment` to set `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS` for the retention test.
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction` to wrap fulfilment-complete and timeline-append calls in a Mongo session.
- **`src/kernel/outbox.ts`** — imports `outboxEventModel` (spied on to simulate a disk failure) and `settleOutboxNudges` (flushes outbox side-effects before hard-delete assertion).
- **`src/kernel/events.ts`** — imports `resetDomainEvents` in `afterEach`.
- **`src/modules/orders/domain/index.ts`** — imports `withdrawUntilFrom` to compute the expected `data.withdrawUntil` on a `delivered` row.
- **`src/modules/orders/domain/withdrawal.ts`** — source of `withdrawUntilFrom` (re-exported through domain index).
- **`src/modules/orders/model.ts`** — imports `orderEventModel` to assert `countDocuments` after hard delete.
- **`src/modules/orders/services/cancel.ts`** — imports `cancelForErasureById` to exercise the system-sweep cancellation path.
- **`src/types/index.ts`** — imports `OrderStatus` enum used throughout fixture and assertion code.

## Notes
- Tests run against **real MongoDB** (`setupTestDb()` at module scope), not an in-memory mock — this is an integration suite, not a unit suite.
- The file tests exclusively through `orderService`'s public surface; no internal repository or model methods are called directly except `orderEventModel.countDocuments` (a read-only assertion) and `outboxEventModel.create` (a spy target to force a failure).
- `orderOfBuyer` exists because the factory's default email is unique per test; calling `createUser` without a custom email twice in one test would collide.
- The buyer data-export test encodes a legal distinction: `text` (staff freeform reason) belongs to the buyer's data, while `actor` (which staff member wrote it) does not — asserted explicitly with comments referencing Nowak and Pankki S.
- The truncated final test (`collectTimelineOf` keeping the actor when the exporting user is the actor) implies a second export test that was cut off in the file excerpt.
