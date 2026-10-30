---
source: src/modules/payments/tests/integration/disputes.test.ts
sha256: 0cfbfca33543e4aacd7ed949ff6b8cc17d6b2ebfc0156a5a5133eaa0e00b6d4d
generated_at: 2026-10-29T05:16:10.067047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/disputes.test.ts

## Purpose

Integration tests for the card-payment dispute (chargeback / inquiry) workflow. They verify that a provider's dispute delivery is persisted on the payment, announced exactly once via domain events, surfaced on the order's staff timeline and attention list, gates or reduces the refundable amount, and is never exposed to the payer — while confirming a dispute is *not* a refund (no `payment.refunded` event, no credit note, no order-status change). Runs against real Mongo through the `paymentService` public API and the fake provider's dispute lever.

## Key elements

- **`paidOrder()`** — creates a unique buyer, a 50-unit product × 2, an order, a card payment, and returns `{ orderId, providerRef }`.
- **`report(over?)`** — builds a default `ProviderDisputeState` (`dp_1`, chargeback, `needs_response`, 100 EUR) with per-test overrides.
- **`deliver(providerRef, over?)`** — calls `paymentService.applyWebhookDelivery(setFakeDispute(…))`, simulating the webhook route.
- **`staffView(orderId)`** — fetches the admin-facing payment view via `paymentService.getForOrder`.
- **`events(name)`** — counts outbox rows for a given event name (used to assert exactly-once announcements).
- **`refund(orderId, amount?)`** — invokes `refundOrderPayment` as an admin to exercise the refund path.
- **`describe('a dispute is reported')`** — storage, single announcement, timeline entry, buyer invisibility, idempotency (stale/repeat deliveries ignored), update + close semantics, closed→reopened flip, and rejection of unknown intent / wrong provider / wrong currency.
- **`describe('the refund door while a dispute stands')`** — 409 `PAYMENT_DISPUTED` for an open chargeback, refunds still allowed during an inquiry, and a lost chargeback reducing the refundable ceiling (422 on overshoot).
- **`describe('a refund the chargeback blocks')`** — a refund triggered by order cancellation fails final as `disputed` without contacting the provider and is not retryable.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — supplies `fakePaymentProvider` and `setFakeDispute`, the sole mechanism for injecting dispute reports.
- **`src/modules/payments/services/index.ts`** — `paymentService` is the public API every assertion goes through (`applyWebhookDelivery`, `getForOrder`, `retryOpenRefunds`).
- **`src/modules/payments/events.ts`** — event-name constants (`PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`, `PAYMENT_REFUNDED`) used in outbox count assertions.
- **`src/modules/payments/providers/index.ts`** — `ProviderDisputeState` type shapes the report fixture.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` for direct DB spot-checks (e.g., refund array, `providerRef`).
- **`src/kernel/outbox.ts`** — `outboxEventModel.countDocuments` and `settleOutboxNudges` for event-assertion and async flushing.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach`.
- **`src/modules/orders/index.ts` / `services/index.ts`** — `orderService.getById` to prove the order is untouched by a dispute.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `timelineOf` (filters timeline rows by `dispute_` prefix).
- **`src/modules/users/tests/factories.ts`** — `createUser` for the buyer.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for the line item.
- **`src/modules/payments/tests/factories.ts`** — `payByCard`, `refundForOrder`, `refundOrderPayment` helpers.
- **`src/modules/payments/module.ts`** — registered in `beforeEach` via `registerCheckoutModules`.

## Notes

- All provider-clock times derive from a fixed `START` instant (`2026-10-01T10:00:00Z`) via `when()`/`at()`; tests compare against these, not wall-clock.
- `buyers` is a module-level counter ensuring a unique email per test (avoids Mongo unique-index collisions across parallel `it` blocks).
- The "dispute lever" is `setFakeDispute(providerRef, state)` — it does **not** hit a real provider; it configures what `fakePaymentProvider` returns on the next webhook call.
- Tests assert through the service's public door (`applyWebhookDelivery`), not by writing to the repository directly; repository reads are only for verification.
- `asReject` (from `@tests/response`) is the helper for asserting HTTP-style error envelopes (status + error code) on rejected promises.
- The "refunds the chargeback blocks" block sets `NODE_PAYMENT_REFUND_RETRY_MINUTES=0` via `withEnvironmentOverrides` to force the retry listener to run synchronously in-test.
