---
source: src/modules/returns/tests/integration/cancel.test.ts
source_sha256: fb70c75ba5b58bbcec33c4c559e41451254ef83c1cbb7192b4ad0ab42595a94c
context_sha256: 333ebb48986cbb7709b04d43ed450d76af28495a6cbea140c555b37bfc98504d
generated_at: 2026-11-22T07:33:39.602038+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/cancel.test.ts

## Purpose
Integration tests for `returnService.cancelReturn`: cancelling an approved return whose goods never arrived (`approved → canceled`). The tests pin down that this is bookkeeping only: it writes an audit row and one order-timeline row, but moves no money or stock, publishes no event, and sends no mail.

## Key elements
- `paidAndDelivered()` – arranges a fixture: a new user, a Shirt (30.00 × 2) and a Mug (10.00 × 1), stock reserved via `inventoryService`, card payment created and confirmed via `paymentService`, order carried to `delivered`. The `Fixture` type is its return type.
- `openedReturn(fixture, reason, approve)` – creates a return as the customer and approves it as admin (unless `reason` is `'withdrawal'`, which is born approved, or `approve` is false). It then settles outbox nudges and clears the mail mock so setup side effects don't pollute assertions. Returns the return id.
- `refundsOf(orderId)` – reads the refunds on the order's payment.
- `mockEnqueueEmail` – the jest-mocked `enqueueEmail`.
- `audited` – audit entries captured through `registerAuditSink` and reset in `beforeEach`.
- Test groups:
  - **canceling an approved return** – status becomes `canceled` and `canceledAt` is set. One `admin.return.canceled` audit row carries the note in its metadata. One `return_canceled` timeline row exists, and the note does not appear in it. No refunds, stock changes, outbox events or mail result. Without a note, the audit metadata has no `note` key, and the order's `returnStatus` goes from `in_progress` to `none`. The canceled return's units become returnable again. A withdrawal can be canceled. `actions.cancel` is true for an admin only while the return is approved.
  - **what cannot be canceled** – a second cancel gives 409 `RETURN_NOT_CANCELABLE` and writes nothing more. The same code is returned for requested, received and declined returns. A missing return gives 404.
  - **after a cancel** – `receiveReturn` gives `RETURN_NOT_RECEIVABLE` and `closeReturnByHand` gives `RETURN_NOT_CLOSABLE`, and no refunds exist.

## Relationships
- Uses `returnService` (`returns/services`) as the unit under test, and registers `returns/module` together with `payments/module` through `registerCheckoutModules`.
- Uses `inventoryService` (`inventory`) to reserve stock, and `paymentService` (`payments`) to create intents, confirm payments and read refunds.
- Uses the test factories of `users`, `products` (`createProduct`, `countersOf`), `orders` (`createOrder`, `readOrder`, `timelineOf`, `toOrderItem`) and `delivery` (`carryOrderTo`).
- Mocks `infrastructure/adapters/mailer` (`enqueueEmail`) to assert no mail is sent.
- Uses `infrastructure/observability/audit` (`registerAuditSink`, `AuditEntry`) to capture audit rows.
- Uses `kernel/outbox` (`outboxEventModel`, `settleOutboxNudges`) to count and flush outbox events, and `kernel/events` (`resetDomainEvents`) for cleanup in `afterEach`.

## Notes
- `setupTestDb()` provides a real database, so these tests run against actual persistence rather than mocks. Only the mailer is mocked.
- The `customers` counter gives each fixture a distinct email.
- The cancel note is staff-only: it goes into the audit metadata but never into the order timeline.
