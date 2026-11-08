---
source: src/modules/payments/tests/integration/settlement-mismatch.test.ts
sha256: eb24541b090bdb53b156d49b7d1173eb040170ab03c7fca63e184c3cfb07b305
generated_at: 2026-11-08T07:37:46.693779+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-mismatch.test.ts

## Purpose

Integration test verifying the guard-rail for a payment provider that reports `succeeded` but collected money that does not match the frozen payment (wrong amount, wrong currency, or wrong payment ID). It asserts the full negative outcome: order canceled, collected funds refunded exactly once, no `payment.succeeded` outbox event, no stock committed, no invoice issued, and a single `PAYMENT_AMOUNT_MISMATCH` event for operational follow-up. Also covers the sync, webhook, and no-figures entry points, the happy-path regression, float tolerance, and the reservation-expiry crash recovery path.

## Key elements

- **`openIntent()`** – Shared setup: creates a user, a product (2 × 25.00), an order, opens a payment intent, and returns identifiers plus the provider reference.
- **`MISMATCHES`** – Tuple array parameterising three single-field drifts (`amountReceived`, `currency`, `paymentId`) consumed by `describe.each`.
- **`describe.each(MISMATCHES)` block** – For each drifted field asserts 409 response, `PAYMENT_ORDER_NOT_PAYABLE` code, order canceled, payment `succeeded` with one refund, zero `PAYMENT_SUCCEEDED` outbox events, exactly one `PAYMENT_AMOUNT_MISMATCH` event, no invoice, and stock restored.
- **`describe('a mismatch recorded')`** – Verifies the payment's stored amount reflects what *arrived* (not the frozen figure), hard-delete is blocked (`ORDER_HAS_MONEY_HISTORY`), audit entry uses `SYSTEM_ACTOR` with action `payment.amount_mismatch` (not under `security.*`), and the error code is not `PAYMENT_DECLINED`.
- **`describe('the other doors into the same settlement')`** – Exercises `syncPayment`, `applyWebhookDelivery`, and a provider that returns no figures at all; all must produce the same cancel-and-refund outcome.
- **`describe('a matching success')`** – Regression: an honest payment still succeeds; a float-noise receipt (`50.000000001` vs `50.00`) is accepted.
- **`describe('a crash after the mismatch was recorded')`** – (Truncated in source) Validates that reservation-expiry cancellation completes the cleanup if the process dies after recording the mismatch.
- **`jest.mock('@infrastructure/observability/audit')`** – Replaces the audit port with `auditPortMock()` rather than spying (see Notes).
- **`setFakeReceipt(providerRef, receipt)`** – The "receipt lever" on the fake provider: injects what the provider will report as collected.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Provides `fakePaymentProvider` (the only provider used) and `setFakeReceipt`, which dictates the receipt returned by `confirm`.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is queried to assert which domain events were enqueued; `settleOutboxNudges` flushes pending outbox work before assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents` clears the in-memory event buffer between tests.
- **`src/kernel/permissions.ts`** – `SYSTEM_ACTOR` is the expected actor on the audit row for mismatches.
- **`src/modules/orders/index.ts`** – `orderService` is used to read order status and to attempt hard-delete.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` / `toOrderItem` build the order fixture.
- **`src/modules/invoicing/index.ts`** – `invoicingService.findInvoiceForOrder` asserts no invoice exists after a mismatch.
- **`src/modules/invoicing/module.ts`** – `invoicingModule` is registered in `beforeEach` via `registerCheckoutModules`.
- **`src/modules/payments/audit.ts`** – `paymentsAuditActions.PAYMENT_AMOUNT_MISMATCH` provides the audit action string under assertion.
- **`src/infrastructure/observability/audit.ts`** – Mocked at module level; `observePort` is used to capture `emitAuditEvent` calls.
- **`src/infrastructure/http/response.ts`** – `generateReject` shapes the 409 error envelope asserted on.
- **`src/infrastructure/i18n/index.ts`** – `t` is imported (used in error-message assertions or setup).

## Notes

- The audit port is **replaced** via `jest.mock` + `auditPortMock()`, not spied on with `jest.spyOn`, because the CommonJS namespace re-export exposes a non-configurable getter that `spyOn` cannot redefine.
- The payment document's `status` is set to `'succeeded'` even on a mismatch (the provider *did* collect money); the *order* is what gets canceled. This is intentional and asserted explicitly.
- Float tolerance is tested: a receipt of `50.000000001` for a frozen `50.00` must still be accepted (minor-unit comparison).
- The response to a mismatched confirm/sync is **409** with code `PAYMENT_ORDER_NOT_PAYABLE`, deliberately *not* `PAYMENT_DECLINED` (a mismatch is not a provider decline).
- Tests run against **real MongoDB** (`setupTestDb`); only the provider and the audit port are faked.
