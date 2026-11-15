---
source: src/modules/shop-tasks/services/tasks.ts
sha256: 3302faf07ceae565ccfd3037096c19296866406398d049b7a35a1cb13ccfdedf
generated_at: 2026-11-14T21:54:09.588606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/tasks.ts

## Purpose

Maps domain events (payment, inventory, shipment, fulfillment) to concrete shop tasks. It decides *which* event opens or clears *which* task and *which* staff screen the task links to. The actual persistence and dedup live in the tasks engine (`taskService`); this file is purely the event-to-situation translation layer.

## Key elements

- **`shopTasks`** (exported object) — the handler collection that `module.ts` subscribes to. Each method is `(payload, meta) => Promise<void>`:
  - `onRefundOwedByHand` — opens a manual-refund task on the payments-attention screen.
  - `onRefundFailed` — opens a refund-refused task only for final, non-disputed failures; skips `disputed` (bank already handled it).
  - `onRefundReversed` — re-opens the refund-owed task when the bank returns money; skips disputed reversals.
  - `onRefundClosed` — clears all three refund-related task kinds by `refundId`.
  - `onAmountMismatch` — opens a mismatch task linked to the order page.
  - `onDispute` — single handler for `dispute_opened`/`dispute_updated`; transitions between `dispute` → `dispute_awaiting_bank` → closed based on `payload.status`.
  - `onHoldOrphaned` — opens a paid-without-hold task on the order page.
  - `onOrderCanceled` — clears the paid-without-hold task.
  - `onShipped` — clears both paid-without-hold (by order) and consent-due (by fulfillment order).
  - `onFulfillmentOrderCanceled` — clears the consent-due task.
  - `onDelayed` — opens a consent-due task only when `consentDueOpening` returns a non-null opening.
- **`open(opening, work, meta)`** — thin wrapper around `taskService.openSystemTask` that merges the opening with its staff-screen link.
- **`guarded(name, work)`** — catches handler errors, logs via `logger.error`, then re-throws so the outbox redelivers (a missed open = lost task).
- **`attentionDueAt(now)`** — computes a due date from `paymentAttentionMinutes()` for situations with no legal clock.
- **`legalDeadlineOf(due)`** — projects a `RefundDue` into a `LegalDeadline` (`rule` + day in shop timezone).
- **`orderWork(orderId)`** / **`PAYMENTS_ATTENTION_WORK`** — build the staff-screen URLs passed as the task's `work` field.

## Relationships

- **`src/modules/tasks/index.ts` / `src/modules/tasks/services/index.ts`** — sole write path; this file calls `openSystemTask` and `clearSystemTasks` and nothing else.
- **`src/modules/shop-tasks/domain/openings.ts`** — provides the `ShopOpening` constructors (`refundOwedOpening`, `disputeOpening`, etc.) and the `LegalDeadline` / `ShopOpening` types. This file chooses *which* constructor to call; the constructors encode the domain shape.
- **`src/modules/payments/index.ts` / `src/modules/payments/services/index.ts`** — reads `paymentService` (to fetch stamped legal deadlines for refunds) and `paymentAttentionMinutes` (threshold for non-legal due dates).
- **`src/modules/payments/config.ts`** — source of `paymentAttentionMinutes`.
- **`src/modules/payments/domain/lifecycle.ts`** — defines `RefundDue` type consumed by `legalDeadlineOf`.
- **`src/modules/shop/index.ts` / `src/modules/shop/service.ts`** — reads `shopTimezone` and `shopCountry` for calendar/day calculations.
- **`src/infrastructure/http/frontend-link.ts`** — `FRONTEND_LINK_RULES` + `fillPath` produce the staff URLs.
- **`src/infrastructure/adapters/logger.ts`** — used only inside `guarded` for error logging.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` (unit conversion) and `dayInZone` (timezone-aware day extraction).
- **`src/kernel/events.ts`** — `DomainEventMap` / `DomainEventMeta` types shape every handler's parameters.
- **`src/modules/shop-tasks/services/index.ts`** — barrel re-export for the shop-tasks services module.
- **`src/modules/shop-tasks/services/delayed.ts`** — sibling service; `onDelayed` here is described as "the task half of `fulfillment_order.delayed`", implying `delayed.ts` handles the non-task half.

## Notes

- `onRefundFailed` and `onRefundReversed` both **skip** `disputed` failures silently (return `Promise.resolve()`) because the dispute task already covers that case. Do not "fix" this by also opening a refund task.
- `onDispute` is a single handler for two events (`dispute_opened` + `dispute_updated`). The `under_review` branch first *clears* the `dispute` task, then *opens* `dispute_awaiting_bank` — the ordering matters for dedup keys.
- `onShipped` clears tasks across **two different entity types** (order and fulfillment order) in sequence; if the first clear fails, the second never runs.
- `onDelayed` may resolve with no-op if `consentDueOpening` returns `null` (delay doesn't trigger a consent obligation in that case).
- All handlers that open a task pass `meta` (event delivery facts) so the tasks engine can deduplicate redeliveries by `eventId`.
