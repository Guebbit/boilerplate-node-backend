---
source: src/modules/payments/events.ts
sha256: d206644d5d96248ea226bdd64922bc0cdddc2978edfadfdeabee6091bd0281e0
generated_at: 2026-09-23T19:18:04.610768+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/events.ts

## Purpose

Declares the two domain events the payments module emits and registers them into the kernel's app-wide `DomainEventMap` via TypeScript module augmentation. This follows the same pattern as `modules/orders/events.ts` — each module augments the shared interface rather than contributing to a central list, keeping the event namespace distributed alongside the code that owns it.

## Key elements

- **`declare module '@kernel/events'` block** — extends `DomainEventMap` with two keys:
    - `'payment.succeeded'` — payload `{ paymentId, orderId }`; fired when a payment is settled. Emitted in the same at-most-once write as `order.status_changed` (`to: 'paid'`).
    - `'payment.failed'` — payload `{ paymentId, orderId }`; fired when the provider declines the method. Can repeat per order (each retry attempt is its own event).
- **`PAYMENT_SUCCEEDED`** — exported string constant `'payment.succeeded'`, for use as an event-name reference without hardcoding.
- **`PAYMENT_FAILED`** — exported string constant `'payment.failed'`, same role.

## Relationships

- **`src/modules/payments/services/settlement.ts`** — Sole emitter. Both events are dispatched from `settlePayment`, the single reconciliation point in the module.
- **`src/modules/payments/module.ts`** — Module registration; likely wires these event names into the module's declared event list so the kernel knows which events the module produces.
- **`src/modules/payments/index.ts`** — Public barrel; re-exports the `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` constants (and the augmented types) for consumers outside the module.
- **`asyncapi.public.yaml`** — The AsyncAPI spec documents these events in the external API contract; this file is the in-code source of truth for their payloads.

## Notes

- `payment.failed` is **not** terminal: the payment remains in a confirmable status (`CONFIRMABLE_PAYMENT_STATUSES`), so the same order can produce multiple `payment.failed` events across retry attempts. Listeners should treat each occurrence as an independent fact, consistent with how `paymentsAuditActions.PAYMENT_FAILED` audit entries work.
- `payment.succeeded` is intentionally a separate event rather than inferred from `order.status_changed`. Downstream listeners (e.g. `webhooks`) need it as their own fact rather than coupling to order-status transitions.
- The payload shape is identical for both events (`{ paymentId, orderId }`). Any future differentiation (e.g. provider error code on failure) will require a breaking change to the augmented interface.
