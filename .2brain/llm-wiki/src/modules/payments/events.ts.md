---
source: src/modules/payments/events.ts
sha256: b24b3bd5c94a04e3e1fe4e99dbaa0958cf1e90b32605e9b1bee7971864579c55
generated_at: 2026-10-29T05:06:17.949215+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/events.ts

## Purpose

Declares the domain events emitted by the payments module by augmenting the kernel's `DomainEventMap` interface (the same pattern as `modules/orders/events.ts`). Also exports a string constant for each event name so other code can reference them without hard-coding the string.

## Key elements

- **`DisputeEventPayload`** — shared payload interface for `payment.dispute_opened` and `payment.dispute_updated`; carries the provider's last-reported dispute snapshot (id, kind, status, reason, amount, currency, `fundsWithdrawn`, optional `evidenceDueBy`).
- **`declare module '@kernel/events'`** — extends `DomainEventMap` with ten event types:
  - `payment.succeeded` / `payment.failed` — settlement outcome (emitted from `settlePayment` in `./services/settlement`).
  - `payment.refunded` — one refund settled; includes optional `returnId`, `goods` (lines + shipping) for line-level VAT crediting, and `full` flag.
  - `payment.refund_canceled` — staff voided a not-yet-paid refund.
  - `payment.refund_failed` — provider refused/failed a refund; `final` distinguishes terminal vs. transient.
  - `payment.refund_reversed` — bank clawed back a previously settled refund.
  - `payment.dispute_opened` / `payment.dispute_updated` — chargeback/inquiry lifecycle.
  - `payment.refund_owed_by_hand` — refund of a hand-recorded (cash/transfer) payment; internal only.
  - `payment.amount_mismatch` — provider success that doesn't match the order's frozen payment; internal only.
- **10 exported `const` strings** (`PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED`, `PAYMENT_REFUND_CANCELED`, `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_REVERSED`, `PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`, `PAYMENT_REFUND_OWED_BY_HAND`, `PAYMENT_AMOUNT_MISMATCH`) — each is a one-line alias pointing back to the corresponding `DomainEventMap` key.

## Relationships

- **`./services/settlement.ts`** — callsite for `payment.succeeded` and `payment.failed` (via `settlePayment`).
- **`./services/refunds.ts`** — callsite for `payment.refunded` (`settleRefund`), `payment.refund_canceled` (`cancelRefund`), and the refund-failure/reversal events.
- **`./services/announce.ts`** — every event in this file is delivered through the transactional outbox managed here; nothing is emitted inline.
- **`./services/disputes.ts`** — related service in the same module; the dispute events defined here describe the data it records.
- **`index.ts`** — barrel re-export; downstream consumers import the string constants through it.
- **`module.ts`** — module registration file that wires listeners for these events.
- **`asyncapi.public.yaml`** — public event spec. Two events are explicitly marked "Internal only" (`payment.refund_owed_by_hand`, `payment.amount_mismatch`) and do **not** appear in the AsyncAPI channels.
- **Integration tests** (`announce.test.ts`, `cancelled.test.ts`, `disputes.test.ts`, `external-refunds.test.ts`, `hand-refund.test.ts`, `refund-cancel.test.ts`) — exercise the outbox delivery and payload shapes defined here.

## Notes

- **Augmentation, not central list.** This file intentionally extends the kernel's `DomainEventMap` via `declare module` rather than registering events in a shared registry. Follow this pattern when adding events to other modules.
- **At-least-once delivery.** Every event is written through the transactional outbox (`announce.ts`), so consumers must deduplicate on `meta.eventId`. `payment.succeeded` in particular can arrive *minutes* after the settlement HTTP response if the settlement died after charging.
- **`payment.failed` can fire multiple times per order.** Each declined attempt is its own event (mirrors `paymentsAuditActions.PAYMENT_FAILED`).
- **`payment.refunded` is per-refund, not per-payment.** A single payment can produce multiple `payment.refunded` events (one per partial refund). The `amount` field is that specific refund's amount, not the payment total.
- **Internal-only events.** `payment.refund_owed_by_hand` and `payment.amount_mismatch` are delivered through the outbox but have no AsyncAPI channel; they are consumed by internal modules (e.g., `tickets`) only.
- **Money is always a decimal in the event's `currency`**, not an integer in minor units.
