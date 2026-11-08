---
source: src/modules/payments/events.ts
sha256: 26718f971f6c101131d8b2845910af076973ea228ee5d647b99018614d65f5e1
generated_at: 2026-11-08T07:21:03.354860+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/events.ts

## Purpose

Declares the payments module's domain event payload types by augmenting the kernel's `DomainEventMap` (TypeScript module augmentation in `@kernel/events`), and exports a string constant for each event name. It is the single source of truth for what data each payment event carries, decoupled from where and how the events are emitted.

## Key elements

- **`DisputeEventPayload`** (interface) — shared shape for `payment.dispute_opened` and `payment.dispute_updated`; carries provider-identified dispute fields (`disputeId`, `kind`, `status`, `reason`, `amount`, `currency`, `fundsWithdrawn`, optional `evidenceDueBy`).
- **`declare module '@kernel/events'`** — augments `DomainEventMap` with ten events:
  - `payment.succeeded` / `payment.failed` — basic `{ paymentId, orderId }`; the latter can fire multiple times per order (one per declined attempt).
  - `payment.refunded` — includes `refundId`, optional `returnId`, optional `goods` (line items + shipping) for per-rate credit notes, `amount`, `currency`, and `full` (whether it covers the whole payment).
  - `payment.refund_canceled` — staff voided a refund; no money moved.
  - `payment.refund_failed` — provider refusal; `final` distinguishes terminal from transient.
  - `payment.refund_reversed` — bank clawed back a settled refund; record reopens.
  - `payment.dispute_opened` / `payment.dispute_updated` — use `DisputeEventPayload`.
  - `payment.refund_owed_by_hand` — hand-paid refund opened; **internal only** (no AsyncAPI channel).
  - `payment.amount_mismatch` — provider success doesn't match the frozen payment; **internal only**.
- **`PAYMENT_*` constants** (10 exports) — string values for each event name, for use in emit/subscribe calls without hard-coding.

## Relationships

- **`services/settlement.ts`** — emits `payment.succeeded` and `payment.failed` as the sole reconciliation point.
- **`services/refunds.ts`** — emits `payment.refunded`, `payment.refund_canceled`, `payment.refund_failed`, `payment.refund_reversed`, and `payment.refund_owed_by_hand`.
- **`services/disputes.ts`** — emits `payment.dispute_opened` and `payment.dispute_updated`.
- **`services/announce.ts`** — the transactional outbox through which every event above is delivered; no event is emitted inline.
- **`services/external-refunds.ts` / `services/refund-settlement.ts`** — participate in the refund lifecycle that produces the events declared here.
- **`index.ts` / `module.ts`** — module registration; the augmentation makes these payloads visible kernel-wide.
- **Tests** (`announce.test.ts`, `canceled.test.ts`, `disputes.test.ts`, `external-refunds.test.ts`, `hand-refund.test.ts`, `refund-cancel.test.ts`, `refund-failed-event.test.ts`) — assert the event payloads and delivery semantics for each scenario.

## Notes

- **At-least-once delivery.** Every event goes through the outbox in `announce.ts`; listeners must deduplicate on `meta.eventId`.
- **Internal-only events.** `payment.refund_owed_by_hand` and `payment.amount_mismatch` have no AsyncAPI channel and are not exposed externally; `tasks` consumes the former.
- **Money is always a decimal string**, never a number, in every payload.
- **`payment.failed` is not unique per order.** Each declined attempt is its own event, mirroring the audit log.
- **Module augmentation, not a central registry.** The file follows the same pattern as `modules/orders/events.ts`; adding a new event means adding a key here, not editing a shared list.
- **Closed enum types only.** `kind`, `status`, `reason`, and `failureReason` are imported from `@types` as fixed unions — provider free-text is never stored in the payload.
