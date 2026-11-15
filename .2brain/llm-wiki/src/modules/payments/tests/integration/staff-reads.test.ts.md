---
source: src/modules/payments/tests/integration/staff-reads.test.ts
sha256: 634777c22458493d14034a9f5eb5bc87364b02196231c073cfdef74a5f45f2c0
generated_at: 2026-11-14T21:20:18.487150+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/staff-reads.test.ts

## Purpose

Integration tests (against a real MongoDB) for the three staff-facing payment reads — **list**, **refunds**, and **needs-attention** — verifying that every `displayStatus` label the server derives is the label its filter matches, that provider-specific identifiers (provider refs, failure reasons) reach staff but not the payer, and that a needs-attention row clears once its underlying problem is resolved.

## Key elements

- **`seedPayment(overrides)`** — Seeds a full chain (user → product → order → payment document) and returns the triple. Uses a module-level `sequence` counter to guarantee unique emails.
- **`seedEveryLabel()`** — Creates one payment per `PaymentDisplayStatus` value (incomplete, pending, succeeded, refund_pending, partially_refunded, refunded, failed, canceled) and returns a `Map<PaymentDisplayStatus, string>` of label → payment id.
- **`refundRecord(overrides)`** — Returns a refund sub-document shaped to the schema, with a random `idempotencyKey`.
- **`backdate(payment, minutesAgo)`** — Overwrites `updatedAt` with a past timestamp (`timestamps: false`) to simulate elapsed time.
- **`idsOf(filters)`** — Calls `paymentService.listPayments` and extracts the ordered array of payment ids from the first page.
- **`staleRefund(hoursAgo)`** — Seeds a payment whose single refund failed a configurable number of hours ago.
- **`attentionRows()`** — Calls `paymentService.listAttention()` and returns the items array.
- **`describe` blocks:**
  - *listPayments by displayStatus* — each label returns exactly the one payment that derives to it.
  - *listPayments rows carry the actions of the caller* — refund / settleRefundByHand / cancelRefund / pay flags vary by payment state and method.
  - *listPayments filters and sort* — method, provider, amount range, orderId, reference, created date, received date, `payBy` deadline (null = earliest), and row composition (orderNumber, email).
  - *what each audience is sent* — staff see `providerRef`, `providerRefundRef`, `failureReason`; the payer sees none of them.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to connect to a real Mongo instance for the whole suite.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules([paymentsModule])` in `beforeEach` wires the payments module into the checkout event-bus registry.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears queued domain events so they don't leak between tests.
- **`src/modules/payments/services/index.ts`** — `paymentService` is the system under test; all `listPayments`, `getForOrder`, and `listAttention` calls go through it.
- **`src/modules/payments/model.ts`** — `paymentModel` is used for direct `create`, `findById`, and `updateOne` (backdating) operations; `PaymentDocument` type is imported.
- **`src/modules/payments/module.ts`** — `paymentsModule` is the registered module instance passed to `registerCheckoutModules`.
- **`src/modules/payments/services/refunds.ts`** — `refundForOrder` is imported (used in truncated portion of the file for refund-specific assertions).
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the payer.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the purchasable item.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the order that the payment references.
- **`src/types/index.ts`** — `PaymentDisplayStatus` enum and `PaymentAttentionItem` type shape the test assertions.
- **`tests/support/callers.ts`** — `asAdmin()`, `asCustomer(id)`, `callerContextAs` produce the caller context passed to every service call.
- **`tests/support/response.ts`** — `asSuccess` unwraps the result envelope from `getForOrder`.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` is imported (used in truncated portion for env-dependent assertions).

## Notes

- `seedPayment` increments a module-level `sequence` to keep emails unique; this means tests are **order-dependent** in their email generation but not in their assertions (each test seeds its own rows).
- `backdate` passes `{ timestamps: false }` to Mongoose to suppress the automatic `updatedAt` stamp — necessary for any test that checks `receivedFrom` / date-range filters against a known timestamp.
- The `payBy` sort test asserts that a payment with `payBy: null` sorts **first** in ascending order (treated as earliest deadline) and **last** in descending order.
- `refundRecord` generates a random `idempotencyKey` on every call, so duplicate refund records in different tests won't collide on uniqueness constraints.
- The audience test (staff vs. payer) calls `getForOrder` twice with different caller contexts and also checks the list row, confirming the filtering is consistent across both read paths.
