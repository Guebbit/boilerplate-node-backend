---
source: src/modules/payments/tests/integration/settlement-mismatch.test.ts
sha256: 0fdd755e825b21e5eda83e0f38ac080ac537cac76fa502c05e5b5bb7bfa1b485
generated_at: 2026-11-14T21:20:00.370930+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-mismatch.test.ts

## Purpose

Integration test covering the settlement-mismatch guard: when a provider reports `succeeded` but the collected money does not match the frozen payment (wrong amount, currency, or payment ID), the system must cancel the order, refund the collected money, announce no `payment.succeeded`, commit no stock, and issue no invoice. Uses real Mongo and the fake provider's receipt lever; no network mocks beyond the provider double.

## Key elements

- **`openIntent()`** – helper that creates a user, a 2-unit × 25.00 product/order, opens a payment intent, and returns the IDs needed by every test.
- **`MISMATCHES`** – table of three mismatch dimensions (`amount`, `currency`, `paymentId`) consumed by `describe.each`.
- **Parametrized block** *"a provider success whose %s is not the one frozen"* – asserts 409 `PAYMENT_ORDER_NOT_PAYABLE`, order canceled, one refund, zero `PAYMENT_SUCCEEDED` outbox events, exactly one `PAYMENT_AMOUNT_MISMATCH` event with correct payload, no invoice, stock restored, and the per-field metric incremented.
- **`describe('a mismatch recorded')`** – verifies the refund amount equals what the provider actually collected; the canceled order is protected from hard delete (`ORDER_HAS_MONEY_HISTORY`); the audit action is `payment.amount_mismatch` under `SYSTEM_ACTOR`, not a `security.*` action; the error code is not `PAYMENT_DECLINED`.
- **`describe('the other doors into the same settlement')`** – confirms the same cancellation/refund path fires through `syncPayment`, webhook `deliver`, and a provider response that omits all figures.
- **`describe('a matching success')`** – happy-path regression: a correct receipt is accepted, order becomes `paid`; float noise (50.000000001 vs 50.00) is tolerated.
- **`describe('a crash after the mismatch was recorded')`** – simulates a crash between recording the mismatch and finishing; expects the reservation-expiry cancel to complete the refund (file is truncated here).

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – source of `fakePaymentProvider` and `setFakeReceipt`; the receipt lever drives every mismatch scenario.
- **`src/infrastructure/observability/audit.ts`** – imported as the audit port; the test asserts that `emitAuditEvent` is called with the correct action, actor, and metadata. The module is replaced (not spied) because `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes.
- **`src/modules/payments/audit.ts`** – provides `paymentsAuditActions` enum used to verify the action string and assert it does not start with `security.`.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is queried to count/inspect `PAYMENT_SUCCEEDED` and `PAYMENT_AMOUNT_MISMATCH` events; `settleOutboxNudges` flushes pending work.
- **`src/kernel/events.ts`** – `resetDomainEvents` called in `afterEach` to isolate the event bus between tests.
- **`src/kernel/permissions.ts`** – `SYSTEM_ACTOR` referenced in the audit assertion to confirm the actor is the system, not the customer.
- **`src/modules/orders/index.ts`** – re-exports `orderService` used to read order status and attempt hard-delete.
- **`src/modules/orders/services/index.ts`** – source of the order-service methods the test calls (`getById`, `removeById`).
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the order fixture.
- **`src/modules/invoicing/index.ts`** – re-exports `invoicingService` used to assert no invoice exists for the order.
- **`src/modules/invoicing/module.ts`** – `invoicingModule` registered in `beforeEach` so the invoicing pipeline is active.
- **`src/modules/invoicing/services/index.ts`** – source of `invoicingService.findInvoiceForOrder` called to verify no invoice was issued.
- **`src/infrastructure/http/response.ts`** – `generateReject` imported (used in the truncated section for webhook/sync response shaping).
- **`src/infrastructure/i18n/index.ts`** – `t` imported for localized error-string assertions.
- **`src/infrastructure/i18n/context.ts`** – i18n context backing the translation calls above.

## Notes

- The audit module is **replaced** (not spied) due to the CommonJS getter constraint documented in the file's comment and mirrored in `orders/tests/integration/create-audit.test.ts`.
- `describe.each(MISMATCHES)` means the core assertion block runs three times; the only per-case difference is the `field` label used in the metric assertion.
- Float tolerance is intentional: the comparison is done in minor units, so `50.000000001` for a `50.00` freeze passes.
- The test asserts exactly **one** `PAYMENT_AMOUNT_MISMATCH` outbox row (the `more` array must be `[]`), guarding against duplicate announcements.
- `GOOD_METHOD` is an opaque provider handle (`pm_card_visa`), not a card number—consistent with the domain's no-PAN policy.
