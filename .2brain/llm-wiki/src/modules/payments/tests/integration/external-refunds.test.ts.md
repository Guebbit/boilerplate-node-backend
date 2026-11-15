---
source: src/modules/payments/tests/integration/external-refunds.test.ts
sha256: 71b5bc47b76504df2efd403ef47a797780cb682b05dda5a9a5c31a6565a78e79
generated_at: 2026-11-14T21:14:20.375936+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/external-refunds.test.ts

## Purpose

Integration test (real Mongo, fake provider) for refunds that originate in the payment provider's dashboard. Verifies that such external refunds are imported idempotently as settled `external` records with the correct follow-ups (status stamp, outbox event, buyer email), that our own refunds are *matched* to incoming events rather than double-imported, and that an external refund which overshoots the remaining balance causes our in-flight refund to be held unsent and surfaced for staff cancellation.

## Key elements

- **`paidOrder()`** – builds a user, product, order (2 × 50.00), reserves inventory, pays 100.00 by card; returns `{ orderId, providerRef }`.
- **`paymentOf` / `refundsOf` / `refundedOf` / `stampOf`** – small read helpers over the payment repository and order service for assertions.
- **`deliverRefund(providerRef, refundRef)`** – wraps `deliver()` to inject a provider refund event into the module.
- **`refundedEvents()`** – counts `PAYMENT_REFUNDED` rows in the outbox collection.
- **`overtaken()`** – shared setup: our 50.00 refund fails (transient), then an 80.00 external refund arrives.
- **Suite "a refund made in the dashboard"** – covers idempotent import (event delivered twice → one record), multiple partial refunds, pending/failed/foreign-currency skipping, and overshoot beyond the paid amount.
- **Suite "a refund that is ours"** – confirms the provider-echoed record ID triggers a *match* (status flip to `succeeded`) rather than a new import; also the timeout-then-succeed case.
- **Suite "an open refund of ours an outside refund left no room for"** – verifies retry does not re-send the held refund, the attention list reports the overshoot, and staff can cancel the held record.

## Relationships

- **`src/modules/payments/services/index.ts`** – the SUT; tests exercise its external-refund import, matching, hold, retry, attention-list, and cancel flows.
- **`src/modules/payments/repository.ts`** – read to assert on refund records and `amountRefunded` after each scenario.
- **`src/modules/payments/events.ts`** – supplies the `PAYMENT_REFUNDED` constant used to count outbox rows.
- **`src/modules/payments/module.ts`** – registered in `beforeEach` via `registerCheckoutModules`.
- **`src/modules/payments/tests/factories.ts`** – `payByCard` and `refundOrderPayment` create the initial payment and our-side refund actions.
- **`src/modules/payments/tests/deliver.ts`** – `deliver()` injects provider webhook events into the module.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` processes pending outbox entries; `outboxEventModel` queried for event counts.
- **`src/kernel/events.ts`** – `resetDomainEvents()` called in `afterEach` to clean up domain-event state.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked; assertions verify the `payments.refund-issued` template fires exactly once.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the order fixture.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** – order service used to read the `paymentStatus` stamp for assertions.
- **`src/modules/inventory/index.ts` / `src/modules/inventory/services/index.ts`** – inventory reservation set up before payment so the order is in a realistic state.
- **`scenarios/support/doubles/payments/fake.ts`** – the fake provider dashboard: `fakePaymentProvider`, `addFakeExternalRefund`, `refundRefOfRecord`, `setFakeRefundFailure`, `setFakeRefundTimeout`, `setFakeRefundOutcome`.

## Notes

- The test uses **real MongoDB** (`setupTestDb`); only the mailer and the provider are faked.
- Idempotency is enforced by the `idempotencyKey` `import:<refundRef>`; delivering the same event twice must yield exactly one refund record.
- "Overshoot" (external refund > amount paid) is **still recorded**; the system does not clamp the refunded total.
- Pending and failed external refunds are ignored entirely—no record is created.
- A currency mismatch (e.g. USD on a EUR payment) is treated as "not ours" and skipped.
- `withEnvironmentOverrides` zeroes `NODE_PAYMENT_REFUND_RETRY_MINUTES` to make retry/timeout assertions deterministic.
- The "matched, never imported" guarantee is checked by asserting the refunds array length stays 1 after the provider event for our own refund arrives.
