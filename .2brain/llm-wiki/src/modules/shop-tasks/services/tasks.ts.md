---
source: src/modules/shop-tasks/services/tasks.ts
sha256: 176fc7fa3bab70272454c634c49b5e193d86bb198b13b12dfadeaa2415d3bf5a
generated_at: 2026-11-08T08:17:09.249803+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/tasks.ts

## Purpose

Maps domain events (payment, inventory, shipment, fulfillment) to shop-task openings or clears. It decides *which* situation an event represents, *which* staff screen the work belongs on, and *when* to open vs. close a task. The actual persistence and dedup are delegated to `taskService`; this file is purely the event-to-task translation layer.

## Key elements

- **`shopTasks`** (exported object) — the handler map that a module subscription file wires into the event bus. Each method is `(payload, meta) → Promise<void>`:
  - `onRefundOwedByHand` – opens a `manual_refund_owed` task on the payments-attention screen.
  - `onRefundFailed` – opens a `refund_refused` task only for a final, non-disputed failure; looks up the legal due date first.
  - `onRefundReversed` – opens a `refund_reversed` task unless the reversal is a dispute; uses legal due date or the attention window.
  - `onRefundClosed` – clears all three refund task kinds for a given `refundId`.
  - `onAmountMismatch` – opens an `amount_mismatch` task linked to the order screen.
  - `onDispute` – three-way branch: `needs_response` opens `dispute`; `under_review` clears `dispute` then opens `dispute_awaiting_bank`; any other status clears both.
  - `onHoldOrphaned` – opens a `paid_without_hold` task on the order screen.
  - `onOrderCanceled` – clears `paid_without_hold` for the order.
  - `onShipped` – clears both `paid_without_hold` (order) and `consent_due` (fulfillment order).
  - `onFulfillmentOrderCanceled` – clears `consent_due` for the fulfillment order.
  - `onDelayed` – calls `consentDueOpening`; if it returns an opening, opens a `consent_due` task, otherwise no-ops.
- **`open`** (private) – spreads a `ShopOpening` with a `work` URL and calls `taskService.openSystemTask`.
- **`guarded`** (private) – wraps a handler in `.catch`: logs via `logger.error` then **rethrows** so the outbox redelivers.
- **`attentionDueAt`** (private) – returns `now + paymentAttentionMinutes() * MINUTE_MS`.
- **`orderWork`** (private) – fills the order-detail URL via `fillPath`.
- **`PAYMENTS_ATTENTION_WORK`** (private const) – the payments page with `?tab=attention`.

## Relationships

- **`src/modules/tasks/service.ts`** (`taskService`) – the sole writer: every open calls `openSystemTask`, every close calls `clearSystemTasks`.
- **`src/modules/shop-tasks/domain/openings.ts`** – supplies all `*Opening` factory functions and the `ShopOpening` type; this file picks the right one per event.
- **`src/modules/payments/index.ts`** – provides `paymentService` (used for `refundLegalDueAt`) and `paymentAttentionMinutes` (used for the default due-date window).
- **`src/modules/shop/index.ts`** – provides `shopCountry()`, passed to `consentDueOpening` in `onDelayed`.
- **`src/infrastructure/http/frontend-link.ts`** – provides `fillPath` and `FRONTEND_LINK_RULES` to build the staff-screen URLs stored in `work`.
- **`src/infrastructure/adapters/logger.ts`** – `logger.error` inside `guarded`.
- **`src/kernel/events.ts`** – `DomainEventMap` / `DomainEventMeta` types for handler signatures.
- **`src/types/index.ts`** – `TaskKind` enum values and `RefundFailureReason` used in conditional logic.
- **`src/domain-primitives/time.ts`** – `MINUTE_MS` constant for due-date arithmetic.
- **`src/modules/shop-tasks/services/index.ts`** – re-exports `shopTasks` so the module barrel can subscribe it.

## Notes

- **Errors propagate after logging.** A failed handler does not swallow the exception; it rethrows so the transactional outbox redelivers. A missed open means a lost task.
- **`disputed` failures are intentionally skipped** in both `onRefundFailed` and `onRefundReversed` — the dispute to-do already owns that case.
- **`onDispute` mutates state in a sequence** (clear-then-open) when transitioning `needs_response → under_review`; the clear carries a human-readable reason string.
- **`onDelayed` may produce no task.** `consentDueOpening` returns `null` when the delay does not owe the buyer a question; the handler then resolves without side-effects.
- **Due dates are never the refund/order creation timestamp.** The legal due date (from `paymentService.refundLegalDueAt`) takes priority; the fallback is `now + attention window`. A past legal date is kept as-is ("a past date is truthful").
