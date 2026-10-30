---
source: src/modules/payments/tests/integration/transfer.test.ts
sha256: e9fd9159e85578bfbb86ad869e0e0fc572e4189dca24858be9b0d38be47fc34d
generated_at: 2026-10-29T05:23:05.010530+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/transfer.test.ts

## Purpose

Integration test covering the full lifecycle of a bank-transfer payment: opening (from `order.created`), presenting instructions, recording the money, handling expiry, and matching a transfer that arrives after the order is already closed. It runs against a real MongoDB instance; only the mailer is mocked.

## Key elements

- **`transferOrder`** (imported from `../factories`) — creates a user, product, order, and the transfer payment row in one call; the primary fixture for every suite.
- **`mockEnqueueEmail`** — the sole jest mock (`@infrastructure/adapters/mailer`); all mail assertions go through it.
- **Helper closures** — `templatesSent`, `paymentOf`, `paymentStatusOf`, `orderStatusOf`, `lapse`: thin wrappers over the repository/service API to keep test bodies short.
- **`lapse`** — simulates the reservation-sweep by calling `orderService.expireReservationById` + `settleOutboxNudges`, then asserts on the payment side.
- **Test suites** (`describe` blocks):
  - *opening the transfer payment* — idempotency, eligibility guards, existing-payment guard.
  - *the instructions on the payment* — `presentPayment` output shape, optional BIC, method-switch, beneficiary-unset.
  - *what the buyer may still do* — `actions.pay` flag and its dependency on a configured card provider.
  - *recording the money* — `recordOfflinePayment` converts the same row (200, not 201) and marks the order paid.
  - *a transfer nobody sent* — expiry sends exactly one `payments.transfer-expired` mail; a buyer-initiated cancel does not.
  - *a transfer that lands after its order was cancelled* — late match by reference, `amountRefunded` set, refund row left open, audit entry written.

## Relationships

- **`@modules/payments/services`** — every action under test (`openTransferPayment`, `createIntent`, `recordOfflinePayment`, `getForOrder`, `listPayments`).
- **`@modules/payments/presenter`** — `presentPayment` is the function whose output shape is asserted for instructions.
- **`@modules/payments/repository`** — `findByOrderId` used by all "read back" helpers.
- **`@modules/payments/model`** — `countDocuments` used in the idempotency check.
- **`@modules/payments/module`** — registered via `registerCheckoutModules` in `beforeEach`.
- **`@modules/orders/index`** (`orderService`) — `expireReservationById` and `cancelOnRequestById` drive the two cancel paths.
- **`@modules/orders/tests/factories`** — `createOrder`, `readOrder`, `toOrderItem` build the order fixture.
- **`@modules/users/tests/factories`** / **`@modules/products/tests/factories`** — `createUser`, `createProduct` for fixture construction.
- **`@kernel/events`** — `resetDomainEvents` in `afterEach` prevents cross-test event leakage.
- **`@kernel/outbox`** — `settleOutboxNudges` flushes outbox side-effects before assertions.
- **`@infrastructure/observability/audit`** — `registerAuditSink` captures audit entries for the late-refund assertion.
- **`@infrastructure/adapters/mailer`** — the only external I/O; mocked to avoid real sends and to assert template/order.

## Notes

- Real Mongo: `setupTestDb()` is called once at module scope; there is no in-memory DB.
- `beforeEach` re-registers checkout modules and clears the mail mock; `afterEach` resets the domain-event bus.
- The late-transfer test asserts the refund row's status is **not** `'succeeded'` (operator must complete it off-system) and that exactly one audit entry with action `payment.refund*` is written.
- `withEnvironmentOverrides` is used to exercise config-conditional branches (BIC, beneficiary, card-provider) without mutating process env globally.
- The "mails once" test calls `openTransferPayment` twice deliberately to verify idempotency at the service level, not just at the DB level.
