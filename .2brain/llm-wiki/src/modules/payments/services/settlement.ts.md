---
source: src/modules/payments/services/settlement.ts
sha256: 991a4ae71ec2e85d3325c81df12fa195336e9172ff7191f63297136d7d6542a4
generated_at: 2026-09-23T19:22:26.331630+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/settlement.ts

## Purpose

The single reconciliation point for all payment state transitions. Browser-driven confirm, sync, and provider webhook all funnel into `settlePayment`, ensuring money is settled exactly once regardless of which entry point triggered it. Without this funnel, duplicate writes would double-commit inventory or double-refund.

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** (exported) — Readonly array of statuses (`requires_confirmation`, `declined`) the confirm endpoint will accept. Deliberately an array (not `Set`) so it can be spread directly into MongoDB `$in` conditional writes.
- **`SETTLEABLE_PAYMENT_STATUSES`** (internal) — All non-terminal statuses a settlement may transition away from. Excluding `succeeded` and `refunded` is what makes settlement at-most-once.
- **`Settlement`** (internal interface) — The result of a settlement: the current payment document plus an `orderLost` flag indicating the order was no longer payable and the money was refunded.
- **`settlePayment`** (exported) — The core reconciliation function. Applies the provider's reported state: for non-terminal states it updates the payment status; for `declined` it records the failure and emits `PAYMENT_FAILED`; for `succeeded` it conditionally marks the order paid, writes the payment to `succeeded`, commits inventory, or (if the order is gone) performs a refund. All writes are conditional so racing/retried deliveries settle exactly once.
- **`settlementResponse`** (internal) — Maps a `Settlement` to an HTTP response. In-flight statuses return 200 (the browser still has work to do); `declined` returns 409 with `PAYMENT_DECLINED`; `orderLost` returns 409 with `PAYMENT_ORDER_NOT_PAYABLE`.
- **`reportAttempt`** (internal) — After a confirm/sync answer is known, records an audit entry and analytics event. Only fires for `succeeded` and `declined` outcomes; request-shape rejections and in-flight responses are not events.

## Relationships

- **`@modules/orders`** (`orderService`) — Calls `markPaid` (conditional `pending → paid` write that gates settlement) and `getById` (to re-check order status when the initial write lost a race).
- **`@modules/inventory`** (`inventoryService`) — Calls `commitForOrder` to release the inventory hold once the payment is confirmed `succeeded`.
- **`@kernel/events`** (`emitDomainEvent`) — Fires `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` domain events (fire-and-forget) after the relevant write lands.
- **`../events`** — Source of the `PAYMENT_SUCCEEDED` and `PAYMENT_FAILED` event constants.
- **`@infrastructure/http/response`** — Uses `generateSuccess` / `generateReject` to shape the HTTP answer in `settlementResponse`.
- **`@infrastructure/i18n`** (`t`) — Translates user-facing messages in `settlementResponse`.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` in `reportAttempt`.
- **`@infrastructure/observability/audit`** (`recordAudit`) — Records audit entries in `reportAttempt`.
- **`../analytics`** (`paymentsAnalyticsEvents`) / **`../audit`** (`paymentsAuditActions`) — Constants naming the specific analytics events and audit actions for confirm/sync outcomes.
- **`../model`** (`PaymentDocument`) — The payment shape passed through the entire flow.
- **`./refunds`** (`performRefund`) — Called when the order is no longer payable, so the refund goes through the same at-most-once guard as every other refund path.
- **`../repository`** (`paymentRepository`) — `updateStatusIfIn` provides the conditional status writes that enforce at-most-once semantics.

## Notes

- **Ordering hazard (acknowledged in code):** `markPaid` fires `order.status_changed` *before* `inventoryService.commitForOrder` runs. A subscriber reacting to the status event sees `paid` before the reservation is committed. Currently safe because the only listener (`webhooks`) forwards only `{ orderId }`, but the comment explicitly warns to reorder (commit then report) if a future listener needs committed stock.
- **`settlementResponse` treats in-flight as 200:** A payment still in `processing` or `requires_action` returns a success response (200) with a status-specific message, because a 4xx would tell the browser to stop when it actually has a next step.
- **`reportAttempt` is outcome-gated:** Only `PAYMENT_DECLINED` rejections and `succeeded` outcomes produce audit/analytics events. Other rejections (not found, wrong state, order gone) are considered request-shape or race problems, not facts about the money.
- **Inventory commit result is intentionally unchecked:** `commitForOrder` returning `false` covers both a harmless replay and an expiry-sweep race; `inventory` differentiates and alarms on the latter.
