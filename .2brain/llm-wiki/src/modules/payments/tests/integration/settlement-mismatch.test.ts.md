---
source: src/modules/payments/tests/integration/settlement-mismatch.test.ts
sha256: fda3a3fa1e525bdba0e79ecb005abbe3ec2aaf44d65723995af06aa22e9cd588
generated_at: 2026-10-29T05:21:45.207912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-mismatch.test.ts

## Purpose

Integration test covering the "provider reports success but the figures don't match" settlement path. Verifies that when amount, currency, or payment ID differs from what was frozen, the system cancels the order, refunds the collected money through the existing refund path, emits no `payment.succeeded` event, commits no stock, and issues no invoice. Runs against a real Mongo instance; the only fake is the payment provider's receipt lever.

## Key elements

- **`openIntent()`** – Shared setup: creates a user, a 2 × 25.00 product/order, opens a payment intent, and returns IDs plus the `providerRef`.
- **`MISMATCHES`** – Tuple of three parameterized cases (`amount`, `currency`, `paymentId`) consumed by `describe.each`.
- **`GOOD_METHOD`** – The opaque provider payment-method handle (`'pm_card_visa'`) passed to confirm/sync calls.
- **`jest.mock('@infrastructure/observability/audit', …)`** – Replaces the audit port with `auditPortMock()` from `@tests/ports` (see Notes).
- **`describe.each(MISMATCHES)`** – For each field, asserts 409 response, order cancelled, payment `succeeded` with one refund, zero `PAYMENT_SUCCEEDED` outbox events, exactly one `PAYMENT_AMOUNT_MISMATCH` event with correct payload, no invoice, stock restored, and the Prometheus counter labelled with the mismatched field.
- **`describe('a mismatch recorded')`** – Asserts the recorded amount reflects what *arrived* (not the frozen amount), the order is protected from hard delete (`ORDER_HAS_MONEY_HISTORY`), the audit row uses `payment.amount_mismatch` under the system actor, and the error is *not* coded `PAYMENT_DECLINED`.
- **`describe('the other doors into the same settlement')`** – Repeats the mismatch through `syncPayment`, `applyWebhookDelivery`, and a no-figures provider response; all must cancel the order.
- **`describe('a matching success')`** – Happy-path: a correct receipt is accepted, order becomes `paid`. Also verifies float-noise tolerance (50.000000001 ≈ 50.00).
- **`describe('a crash after the mismatch was recorded')`** – Simulates a process death between mismatch recording and order cancellation; the reservation-expiry job completes the cancel and refund.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Source of `fakePaymentProvider` and `setFakeReceipt`; the sole injection point for mismatched provider data.
- **`src/infrastructure/observability/audit.ts`** – Its `emitAuditEvent` is replaced wholesale via `jest.mock` so the test can assert audit payloads without hitting a real sink.
- **`src/infrastructure/http/response.ts`** – `generateReject` shapes the 409 responses the test inspects.
- **`src/infrastructure/i18n/index.ts`** – `t` is imported (likely used by error-message assertions or setup helpers).
- **`src/kernel/events.ts`** – `resetDomainEvents` called in `afterEach` to clear the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** – `outboxEventModel` queries for `PAYMENT_SUCCEEDED` / `PAYMENT_AMOUNT_MISMATCH` docs; `settleOutboxNudges` flushes pending outbox nudges before assertions.
- **`src/kernel/permissions.ts`** – `SYSTEM_ACTOR` is the expected `actorUserId` in the audit assertion.
- **`src/modules/orders/services/index.ts`** – `orderService.getById` / `.removeById` used to verify order state and delete-guard behavior.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the fixture order.
- **`src/modules/invoicing/index.ts` / `module.ts` / `services/index.ts`** – `invoicingModule` registered in `beforeEach`; `invoicingService.findInvoiceForOrder` asserts no invoice was created.
- **`src/modules/payments/audit.ts`** – `paymentsAuditActions.PAYMENT_AMOUNT_MISMATCH` provides the canonical action string the test asserts against.

## Notes

- The audit port is **replaced** (`jest.mock` → `auditPortMock()`), not spied on, because `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes. See `orders/tests/integration/create-audit.test.ts` for the same pattern.
- Real Mongo is used (`setupTestDb()`); there are no repository mocks. This makes the test slower but exercises actual query/transaction paths.
- `registerCheckoutModules([paymentsModule, invoicingModule])` runs in every `beforeEach`; omitting it would leave the module wiring absent and the service calls would fail.
- The float-tolerance test (`50 + 1e-9`) documents that the comparison is done in integer minor units, not floating-point equality—do not "fix" it to exact equality.
- The truncated tail (reservation-expiry crash test) implies a background/cron dependency; ensure the test harness advances or triggers the expiry job before asserting.
