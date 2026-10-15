---
source: src/modules/payments/events.ts
sha256: fbadbb52b4be19a28d10127de6edfb8e1abe45eac5ff99d4dda0150b751c3e22
generated_at: 2026-10-15T11:25:43.802653+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/events.ts

## Purpose

Declares the three domain events the payments module emits (`payment.succeeded`, `payment.failed`, `payment.refunded`) by augmenting the kernel's `DomainEventMap`, and exports string constants for each event name. Uses the per-module augmentation pattern (rather than a central registry) for the same reasons documented in `modules/orders/events.ts`.

## Key elements

- **`DomainEventMap` augmentation (`declare module '@kernel/events'`)** — adds three typed payload shapes to the app-wide event map.
- **`PAYMENT_SUCCEEDED`** / **`PAYMENT_FAILED`** / **`PAYMENT_REFUNDED`** — exported string constants matching the event names; consumers reference these instead of raw strings.
- **`payment.succeeded` payload** — `{ paymentId, orderId }`. Emitted from `settlePayment` alongside `order.status_changed (to: 'paid')`.
- **`payment.failed` payload** — `{ paymentId, orderId }`. Can fire **more than once per order**; each retry attempt is its own fact.
- **`payment.refunded` payload** — `{ paymentId, orderId, refundId, returnId?, goods?, amount, currency, full }`. `amount` is this individual refund's, not the payment's. `goods` (lines + shipping) is present only when the refund pays for specific line items; absent for goodwill/cancellation refunds. `full` flags the single case where a credit note mirrors the whole invoice.

## Relationships

- **`services/settlement.ts`** — source of `payment.succeeded` and `payment.failed`; both are written in the same at-most-once `settlePayment` write.
- **`services/refunds.ts`** — source of `payment.refunded`; written in the transaction that settles the refund record.
- **`services/announce.ts`** — delivery channel for all three events via the transactional outbox; also provides `recordDecline` for `payment.failed`.
- **`asyncapi.public.yaml`** — documents these events in the public API contract.
- **`tests/integration/*`** — exercise the events end-to-end (announce, refunds, settlement-mismatch, concurrency races).

## Notes

- All three events are delivered **at-least-once** through the outbox; listeners must deduplicate on `meta.eventId`.
- `payment.failed` is **not** terminal for an order — the payment can be retried with a different method (`CONFIRMABLE_PAYMENT_STATUSES`), so multiple `payment.failed` events per order are expected.
- `payment.refunded` has **no event** when a refund is left for an operator (`leaveForOperator`); no refund record exists in that path.
- The `goods.lines` array and `shipping` in `payment.refunded` exist so downstream `invoicing` can apportion VAT per line; their absence signals a spread-across-all-rates credit note instead.
