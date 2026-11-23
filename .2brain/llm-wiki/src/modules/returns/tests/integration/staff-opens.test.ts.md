---
source: src/modules/returns/tests/integration/staff-opens.test.ts
source_sha256: ebbda5dc047e5953f63d3056ccbbc54dfb30edda2a51c7296050f2fad0e46c87
context_sha256: d047015bcd706f04c58804113db2b1feec0ec670f7afab06bffddd6a41711d2b
generated_at: 2026-11-22T07:38:09.275259+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/staff-opens.test.ts

## Purpose
Integration tests for staff (support/moderator) acting on behalf of a buyer in the returns module. They cover opening a return the way a phone call would request it, waiving the shop's own deadline and the Art. 16 exclusion with the waiver recorded on the return, and recording a withdrawal the buyer stated outside the shop, judged on the day it was sent rather than the day it was read.

## Key elements
- **Mocks and setup**: `@infrastructure/adapters/mailer` is mocked so `enqueueEmail` is a `jest.fn` (`mockEnqueueEmail`). `setupTestDb()` provides the DB. `beforeEach` registers `paymentsModule` and `returnsModule` via `registerCheckoutModules`, installs an audit sink that collects `audited` entries, and clears the mail mock. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- **`buyerWithOrder(Wanted)`**: creates a user, a shirt (30.00) and a mug (10.00), an order with both, and reserves inventory. Options are `madeDaysAgo`, `excluded` (mug gets `noWithdrawal: true`) and `status` (default `processing`).
- **`deliveredOrder`**: builds on `buyerWithOrder`, carries the order to `delivered`, sets the withdraw-until date (`endsInDays`, default 7), settles outbox nudges, and clears the mail mock.
- **`paidOrder`**: a pending order 3 days old, paid by card via `payByCard`, with nudges settled and the mail mock cleared.
- **`staff(role)`**: returns the `[auth, callerContext]` pair for `support` or `moderator`.
- **Describe "staff opening a return for the buyer"**:
  - The return opens `approved` with `openedBy: 'staff'` and empty `policyExceptions`, and has two lines.
  - It emits `return.requested` and `return.decided` outbox events and sends exactly one mail of the `returns.notice` template ("We opened your return").
  - The audit row carries `onBehalfOfBuyer: true`, the timeline actor is `test-support`, and `returnStatus` is `in_progress`.
  - `requestedAt` sets the return's date; a future date or one before the order gives `RETURN_STATEMENT_INVALID`.
  - `statedVia` on a non-withdrawal reason gives `RETURN_STATEMENT_INVALID`.
  - Warehouse staff and strangers get 404.
  - The quantity guard returns `RETURN_LINES_INVALID`.
  - After a decline, staff can open a new return, while approving the declined one gives `RETURN_NOT_DECIDABLE`.
- **Describe "what staff waive, and what they cannot"**:
  - A goodwill return after the deadline records `policyExceptions: ['window_closed']`.
  - If the buyer asked inside the window and staff opened it late, no exception is recorded.
  - The remaining cases are not visible in the provided content.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: mocked, so the tests can assert which emails were enqueued.
- `src/infrastructure/observability/audit.ts`: `registerAuditSink` and `AuditEntry` capture audit rows for assertions.
- `src/kernel/events.ts`: `resetDomainEvents` is called after each test.
- `src/kernel/outbox.ts`: `outboxEventModel` and `settleOutboxNudges` are used to flush and inspect emitted events.
- `src/modules/orders/tests/factories.ts`, `src/modules/products/tests/factories.ts`, `src/modules/delivery/tests/factories.ts`, `src/modules/payments/tests/factories.ts`: build the orders, products, delivered state, and card payments.
- `src/modules/inventory/index.ts` (`inventoryService`): reserves stock for the order lines.
- `src/modules/payments/index.ts` and `src/modules/payments/module.ts`: `paymentService` is imported from the former, and `paymentsModule` from the latter is registered alongside `returnsModule`.
- `src/modules/returns/module.ts` and `src/modules/returns/repository.ts`: `returnsModule` is registered, and `returnRepository` (via `findByOrderId`) checks that nothing was persisted on a refused request. `returnService` is imported from `../../services`.

## Notes
- Customers get distinct emails (`staff-opens-N@example.com`) via a module-level counter.
- Test helpers return caller pairs, so staff calls take `(auth, callerContext)` as separate arguments.
- `paymentService` is imported but is not used in the visible portion of the file.
