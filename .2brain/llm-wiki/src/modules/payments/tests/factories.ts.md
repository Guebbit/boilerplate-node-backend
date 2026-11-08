---
source: src/modules/payments/tests/factories.ts
sha256: a8de1bb3acbd368168d83ff6cb67d46c78bfc9da13307adacdeb9c1a4bd4c8b1
generated_at: 2026-11-08T07:31:01.308813+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/factories.ts

## Purpose
Test-factory helpers for the payments module. Each function replays the same production entry point (the `order.created` listener, `paymentService` methods, the repository) so a test gets the exact rows and references a real flow would produce — without spinning up HTTP or event-bus machinery.

## Key elements
- **`refundForOrder`** – Re-export of the cancel-listener's refund from `../services/refunds`; provided for sibling tests that need a refunded order without invoking the listener.
- **`refundForReturn(orderId, input, context)`** – Two-step return refund: opens the record inside a `withTransaction` block, then sends it after commit. Returns `'settled'`, `'open'`, or `null` (nothing owed).
- **`TransferOrderOptions`** – Optional knobs for `transferOrder`: `user`, `price` (default `'20.00'`), `holdHours` (default 168).
- **`transferOrder(options?)`** – Creates a customer, product, and a `bank_transfer` order, then calls `paymentService.openTransferPayment` (the same path the `order.created` listener uses). Returns `{ order, payment, reference }`.
- **`payByCard(order, user)`** – Opens a payment intent and confirms it with the fake provider's always-approved test card. Settlement event delivery is deferred; the test settles the outbox itself.
- **`refundOrderPayment(orderId, authContext, context, body?)`** – Looks up the order's payment via `paymentRepository`, then delegates to `paymentService.refundPayment`. Omitting `body` refunds the full remaining amount.
- **`providerRefOf(orderId)`** – Returns the provider's internal intent ID (`payment.providerRef`), which is not published on the wire but is needed to steer the fake provider.

## Relationships
- **`src/domain-primitives/time.ts`** – Imports `HOUR_MS` to compute the `payBy` deadline in `transferOrder`.
- **`src/infrastructure/runtime/database.ts`** – Imports `withTransaction` to wrap the return-refund open step in `refundForReturn`.
- **`src/modules/orders/tests/factories.ts`** – Imports `createOrder` and `toOrderItem` to build the order fixture inside `transferOrder`.
- **`src/modules/orders/index.ts` / `model.ts`** – Imports the `OrderDocument` type for signatures and return values.
- **`src/modules/payments/domain/index.ts`** – Imports `buildReference` to derive the RF reference in `transferOrder`.
- **`src/modules/payments/services/index.ts`** – Imports `paymentService`; all payment mutations (intent, confirm, transfer open, refund) go through it.
- **`src/modules/payments/repository.ts`** – Imports `paymentRepository` for lookups by order ID in `refundOrderPayment` and `providerRefOf`.
- **`src/modules/payments/model.ts`** – Imports `PaymentDocument` type.
- **`src/modules/payments/services/refunds.ts`** – Source of the re-exported `refundForOrder`.
- **Consumers (test files):** `api.contract.test.ts`, `shop.contract.test.ts`, `credit-note-catch-up.test.ts`, `issue-credit-note.test.ts` all import one or more of these factories to seed payment state.

## Notes
- `transferOrder` deliberately calls `paymentService.openTransferPayment` directly (the same function the `order.created` listener invokes in production) rather than emitting the event. The file docstring calls this "the listener, called once" — the helper *is* the listener for test purposes.
- `payByCard` does **not** await settlement-event delivery; any test that needs the order to advance past `requires_action` must flush the outbox itself.
- `refundForReturn` is split into open-then-send to mirror the production commit boundary; a test asserting on the intermediate `open` state should call `openReturnRefund` directly via the service.
- `providerRefOf` throws if the payment row exists but has no `providerRef`; this distinguishes "no payment at all" (handled by `refundOrderPayment`) from "payment exists but was never assigned a provider intent."
