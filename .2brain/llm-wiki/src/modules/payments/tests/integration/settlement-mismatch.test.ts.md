---
source: src/modules/payments/tests/integration/settlement-mismatch.test.ts
sha256: b107b676b60b487541b986f7ac102bdcedbc3d20623999aab01438c6840e93aa
generated_at: 2026-10-15T11:36:42.540331+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-mismatch.test.ts

## Purpose

Integration test proving that when the payment provider reports `succeeded` but the collected amount, currency, or payment ID does not match what was frozen, the system rejects the settlement: the order is cancelled, the money is returned via the refund path, no `PAYMENT_SUCCEEDED` outbox event is emitted, stock is not committed, and no invoice is issued. Uses real MongoDB; only the provider is faked (via its receipt lever).

## Key elements

- **`openIntent()`** — builds the fixture: one user, one product (2 × 25.00), one order, one confirmed-but-unpaid payment intent. Returns IDs and the `providerRef`.
- **`MISMATCHES`** — parameterized cases (`amount`, `currency`, `paymentId`) driving `describe.each` to verify each single-field discrepancy is caught.
- **`describe('a mismatch recorded')`** — asserts the *received* figures (not the frozen ones) are stored on the payment and mirrored in the refund amount; audit is written as `payment.amount_mismatch` by `SYSTEM_ACTOR` (not under `security.*`); the error code is `PAYMENT_ORDER_NOT_PAYABLE`, not `PAYMENT_DECLINED`.
- **`describe('the other doors into the same settlement')`** — covers `syncPayment` (browser poll), `applyWebhookDelivery`, and a provider that returns `succeeded` with no figures at all; all must cancel + refund.
- **`describe('a matching success')`** — regression guard: a fully honest payment is still accepted; float noise (50 + 1e-9) is tolerated.
- **`describe('a crash after the mismatch was recorded')`** — simulates a process death between the payment write and the cancel; verifies the reservation-expiry sweep still cancels the pending order and refunds.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit module (not spied) so `emitAuditEvent` is a mock fn; `recordAudit` is re-wired to build events via the real `buildAuditEvent`.
- **`GOOD_METHOD`** (`'pm_card_visa'`) — the opaque payment-method handle passed to every confirm/sync call.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider.confirm` and `setFakeReceipt` are the sole fakes; they control what the provider "collects" per `providerRef`.
- **`src/kernel/outbox.ts`** — `outboxEventModel.countDocuments` verifies zero `PAYMENT_SUCCEEDED` events; `settleOutboxNudges` flushes pending outbox work before assertions.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears in-memory domain-event buffers in `afterEach`.
- **`src/kernel/permissions.ts`** — `SYSTEM_ACTOR` is the actor used for the crash-recovery `cancelById` call and asserted in audit metadata.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService.getById` checks order status; `orderService.cancelById` is spied in the crash test.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the order fixture.
- **`src/modules/invoicing/index.ts` / `module.ts`** — `findInvoiceForOrder` asserts no invoice; `invoicingModule` is registered in `beforeEach`.
- **`src/modules/payments/audit.ts`** — `paymentsAuditActions.PAYMENT_AMOUNT_MISMATCH` provides the action name asserted in the audit test.
- **`src/infrastructure/observability/audit.ts`** — mocked module; `observePort(auditPort.emitAuditEvent)` captures audit emissions.
- **`src/infrastructure/http/response.ts`** — `generateReject` imported (used in truncated portion for error-shape assertions).
- **`src/infrastructure/i18n/index.ts`** — `t` imported for error-message assertions.

## Notes

- The audit port is **replaced via `jest.mock`**, not spied on, because `jest.spyOn` cannot redefine the non-configurable getter on a CommonJS namespace import (same pattern as `orders/tests/integration/create-audit.test.ts`).
- `setFakeReceipt` takes the `providerRef` (opaque handle) as its key, not the payment ID — the fake is keyed on what the provider sees, not what the domain stores.
- The mismatch check is **per-field**: a single differing field (amount *or* currency *or* paymentId) is sufficient for rejection; the test does not require all three to differ simultaneously.
- The refund amount equals the **received** amount (e.g. 47.5), not the frozen amount (50.0) — the system returns what was actually collected.
- `PAYMENT_DECLINED` is explicitly **not** the error code here; the code is `PAYMENT_ORDER_NOT_PAYABLE`. This distinction matters for client-side handling (a decline implies retry, a mismatch does not).
