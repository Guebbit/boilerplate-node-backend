---
source: src/modules/payments/tests/integration/transfer.test.ts
source_sha256: f5b2dfccc00333544f1671e891aac30715cfe766841ac044631a9960cd76bc8a
context_sha256: 3852ef593fa15268a127af0ae45a71b7131c2fb40e0647690aa38d6611e1ace6
generated_at: 2026-11-22T07:03:52.282234+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/transfer.test.ts

## Purpose
Integration test suite for the bank-transfer payment lifecycle. It covers a payment opened when an order is placed (`order.created` creates a `requires_action` row carrying the RF reference and deadline), the instructions shown on it (`nextAction`) and mailed once, money recorded onto the same row, closure on lapse or cancel, and a late transfer matched by its reference and owed back. It runs against real Mongo; only the mailer is mocked.

## Key elements
- **`jest.mock('@infrastructure/adapters/mailer')`** / **`mockEnqueueEmail`**: replaces `enqueueEmail` so tests can assert which mail was queued.
- **`setupTestDb()`**, plus `beforeEach` (registers `paymentsModule` via `registerCheckoutModules`, clears the mock) and `afterEach` (`resetDomainEvents`).
- **Helpers**:
  - `templatesSent()` returns the queued mail templates in order.
  - `paymentOf()` reads a payment by order id.
  - `paymentStatusOf()` reads a payment's status.
  - `orderStatusOf()` reads an order's status.
  - `lapse()` expires the order's reservation through `orderService.expireReservationById`, then settles outbox nudges.
- **`describe` groups**:
  - *opening the transfer payment*: the payment's fields, idempotent open with a single mail (`payments.transfer-instructions`), no payment for card, method-less or non-payable orders, and an existing payment left untouched.
  - *the instructions on the payment*: `presentPayment(...).nextAction` carries the beneficiary, IBAN (grouped in fours), reference and `payBy`. BIC appears only if `NODE_BANK_TRANSFER_BIC` is set. The instructions disappear after a switch to card and when the beneficiary is unconfigured.
  - *what the buyer may still do*: `actions.pay` is true for an open transfer, false when `NODE_PAYMENT_PROVIDER` is unset.
  - *recording the money*: `recordOfflinePayment` settles the same payment row (status 200, order becomes `paid`).
  - *a transfer nobody sent*: expiry cancels the payment and sends `payments.transfer-expired`. The buyer's own cancel sends only `orders.order-canceled`.
  - *a transfer that lands after cancel*: found via `listPayments({ transferReference })`, recorded as `succeeded` with `amountRefunded` equal to the full amount. The refund record stays non-succeeded because an operator pays it off-system. An audit entry is captured through `registerAuditSink`. The file continues beyond what is documented here.

## Relationships
- **`payments/services`** (`paymentService`): the unit under test (`openTransferPayment`, `createIntent`, `getForOrder`, `recordOfflinePayment`, `listPayments`).
- **`payments/model`** (`paymentModel`) and **`payments/repository`** (`paymentRepository`): used to read back payment state directly, as counts and lookups by order id.
- **`payments/presenter`**: `presentPayment` computes `nextAction`.
- **`payments/module`**: registered via `registerCheckoutModules` so its event handling is active.
- **`orders`** (`orderService`) and **`orders/tests/factories`**: order expiry and cancel, plus `createOrder`, `readOrder` and `toOrderItem`.
- **`payments/tests/factories`** (`../factories`): `transferOrder`, which sets up an order with its transfer payment and reference.
- **`users` and `products` test factories**: seed buyers and products.
- **`kernel/events`** (`resetDomainEvents`) and **`kernel/outbox`** (`settleOutboxNudges`): reset events between tests and flush async outbox delivery.
- **`infrastructure/adapters/mailer`**: mocked.
- **`infrastructure/observability/audit`**: `registerAuditSink` and `AuditEntry` capture audit rows.

## Notes
- `lapse()` simulates the reservation sweep, not a user action. Cancel and expiry are deliberately distinguished by which mail is sent.
- Environment-dependent behavior is tested with `withEnvironmentOverrides`, covering BIC, beneficiary and payment provider.
- The card take-over goes through `POST /payments`, which answers 409 without a provider, hence `actions.pay` is false when none is configured.
