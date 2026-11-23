---
source: src/modules/payments/tests/integration/staff-reads.test.ts
source_sha256: 41a2874e2eec04c58eb33a2c9844ece17ba89d386f344e774ab32c33c8b593c9
context_sha256: f29543d91ef14d22f8b89719a2e6d99a5eb9acc1932935c56582b0ed74127954
generated_at: 2026-11-22T07:03:01.605448+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/staff-reads.test.ts

## Purpose
Integration tests, run against a real Mongo database, for the three reads behind the staff Payments page: the list (`paymentService.listPayments`), the refunds, and the needs-attention list (`paymentService.listAttention`). They check that every server-derived `displayStatus` label is found by its own filter, that the provider's ids reach staff only, and that a needs-attention row clears once its stored problem is fixed.

## Key elements
- **Setup**: `setupTestDb()` runs at module level. `beforeEach` calls `registerCheckoutModules([paymentsModule])`. `afterEach` calls `resetDomainEvents()`.
- **`refundRecord(overrides)`**: builds a schema-valid refund subdocument with defaults (10.00 EUR, `succeeded`, `goodwill`, and a random idempotency key).
- **`seedPayment(overrides)`**: creates a user, a product, an order and a `paymentModel` document (50.00 EUR, `succeeded`, provider `fake`, method `card`). It uses a module-level counter to keep payer emails unique. It returns `{ user, order, payment }`.
- **`idOf`**, **`idsOf(filters)`**: `idOf` returns a seeded row's payment id as a string. `idsOf` returns the ids on the first page of an admin `listPayments`.
- **`backdate(payment, minutesAgo)`**: rewrites `updatedAt` with `timestamps: false`, because a normal save would stamp it with now.
- **`staleRefund(hoursAgo)`**: seeds a payment with a single failed refund created that many hours ago.
- **`attentionRows()`**: returns the `items` from `listAttention()`.
- **`seedEveryLabel()`**: seeds one payment per `PaymentDisplayStatus`. The labels are incomplete, pending, succeeded, refund_pending, partially_refunded, refunded, failed and canceled. It returns a map of label to payment id.
- **Test groups**, as far as the visible part of the file shows:
  - `listPayments by displayStatus`: for each label, filtering returns exactly that payment and the row's `displayStatus` matches.
  - `listPayments rows carry the actions of the caller`: asserts the per-row `actions` object. Refund is offered only on money that arrived and is not fully returned. `settleRefundByHand` and `cancelRefund` list the pending refund ids of a manual/cash payment. `pay` is always false.
  - `listPayments filters and sort`: covers filters on method, provider, amount range, order id, reference, `createdTo` and `receivedFrom`. It also covers sorting by amount and by `payBy` (a payment with no deadline counts as earliest), and checks that each row carries its order's number and email.
  - `what each audience is sent`: compares `getForOrder` for an admin and for the customer. Staff get the provider refund ref and failure reason, and the payer gets neither.

## Relationships
- Seeds data through the users, products and orders test factories, and writes payments directly via `paymentModel` (`payments/model`).
- Exercises `paymentService` (`payments/services`). It imports `refundForOrder` from `payments/services/refunds`, but the visible part of the file doesn't show it being used.
- Uses `paymentsModule` with `registerCheckoutModules` (`tests/support/checkout-modules`) to register the module.
- `tests/support/callers` supplies `asAdmin`, `asCustomer` and `callerContextAs`, which stand in for the staff and payer audiences.
- `asSuccess` (`tests/support/response`) unwraps service responses.
- `withEnvironmentOverrides` comes from `tests/support/environment`.
- `resetDomainEvents` (`@kernel/events`) clears event state between tests.
- `PaymentDisplayStatus` and `PaymentAttentionItem` are types and enums from `@types`.
- `setupTestDb` comes from `tests/support/setup-test-db`.

## Notes
- Each case overrides only the stored field it reads on. Labels are derived from stored `status`, `amountRefunded` and `refunds`, so the seeds set those fields directly.
- Hand-paid (manual) payments are seeded with `providerRef: undefined` and `method: 'cash'`.
- `seedPayment` has two stacked JSDoc blocks, so the first one, which documents an `overrides` param, is orphaned.
