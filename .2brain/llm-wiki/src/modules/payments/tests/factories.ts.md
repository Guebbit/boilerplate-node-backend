---
source: src/modules/payments/tests/factories.ts
sha256: fce077d436897ca3b0f2eaa2b40f365ddf68b1f29975ace3a549713fac0f8500
generated_at: 2026-10-29T05:15:12.844571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/factories.ts

## Purpose

Test factories for the payments module. Provides high-level helpers that build common payment scenarios (card payment, bank-transfer order, refunds) through the same service/repo doors production uses, so integration and contract tests get realistic state—reference numbers, deadlines, `requires_action` rows—without duplicating setup logic.

## Key elements

- **`refundForOrder`** (re-export from `../services/refunds`) — the cancel-listener refund, exposed so a sibling test can trigger a refund on an order.
- **`refundForReturn`** — two-step return refund: opens the refund record inside a transaction (`withTransaction`), then calls `sendOpenedRefund` after commit. Returns `'settled' | 'open' | null` (null = nothing owed).
- **`TransferOrderOptions`** — optional pin-points for `transferOrder`: `user`, `price` (default 20), `holdHours` (default 168).
- **`transferOrder`** — creates a customer, a single-line product, a `bank_transfer` order with a future `payBy` deadline, then calls `paymentService.openTransferPayment` (the same path the `order.created` listener uses). Returns `{ order, payment, reference }`.
- **`payByCard`** — creates a payment intent and confirms it with the fake provider's always-approved Visa test card (`pm_card_visa`). Throws on refusal.
- **`refundOrderPayment`** — operator-facing partial/full refund: looks up the order's payment by ID, then delegates to `paymentService.refundPayment`.
- **`providerRefOf`** — resolves the provider's intent ID (`providerRef`) for a given order; throws if absent. Used to steer the fake provider in tests.

## Relationships

- **`@infrastructure/runtime/database`** — `withTransaction` wraps the return-refund open step to guarantee atomicity.
- **`@modules/orders/tests/factories`** — `createOrder` and `toOrderItem` build the order fixture consumed by `transferOrder`.
- **`@modules/payments/domain` (index)** — `buildReference` derives the RF reference string returned by `transferOrder`.
- **`@modules/payments/services` (index)** — `paymentService` is the primary door for intent creation, confirmation, transfer-opening, return-refund, and operator-refund calls.
- **`@modules/payments/repository`** — `paymentRepository.findByOrderId` is used to fetch the payment row after `transferOrder` and inside `refundOrderPayment` / `providerRefOf`.
- **`@modules/payments/model`** — `PaymentDocument` type annotation on return values.
- **`@modules/payments/services/refunds`** — source of the re-exported `refundForOrder`.
- **`@modules/users/tests/factories` / `@modules/products/tests/factories`** — `createUser` and `createProduct` supply the buyer and item for `transferOrder`.
- **`@tests/callers`** — `asCustomer` and `testCallerContext` build the caller/auth contexts passed to service calls.

## Notes

- `transferOrder` deliberately calls `paymentService.openTransferPayment` directly rather than emitting an `order.created` event; the comment states the helper *is* the listener, called once. This avoids wiring an event bus in tests.
- `payByCard` uses the hard-coded provider card ID `pm_card_visa`. Settlement event delivery is async (outbox); tests that advance the order must drain the outbox themselves.
- `refundOrderPayment` falls back to `orderId` as the `paymentId` argument when no payment row exists (`payment?._id ?? orderId`), so a missing payment surfaces as a service-level refusal rather than a factory crash.
- `providerRefOf` is the only way for a test to steer the fake provider per-order; the wire never publishes this ID, so it must be read from the repository.
