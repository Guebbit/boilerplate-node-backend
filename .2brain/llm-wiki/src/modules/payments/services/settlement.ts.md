---
source: src/modules/payments/services/settlement.ts
sha256: 1816e6eb13b6313f820cd6c65b7ab72c6b616ab4919812516b537e65b94b5a43
generated_at: 2026-09-27T15:27:36.506029+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/settlement.ts

## Purpose

The single reconciliation point for payment state. Whether the trigger is a provider webhook, a browser-driven confirm, or a sync poll, every path funnels into `settlePayment` so that inventory is committed (or refunded) at most once. The file exists to prevent two parallel settlement paths from double-committing stock or double-refunding.

## Key elements

- **`SETTLEABLE_PAYMENT_STATUSES`** – readonly tuple of non-terminal statuses (`requires_confirmation`, `requires_action`, `processing`, `declined`). Every conditional write uses this as the "from" set; terminal statuses (`succeeded`, `refunded`) are excluded, which is what gives the at-most-once guarantee.
- **`Settlement`** – the return shape: the latest `PaymentDocument` plus `orderLost: boolean`, telling the caller whether to respond with a refusal even though the payment status reads `succeeded`.
- **`settlePayment(payment, state)`** – the exported function. Branches on the provider-reported status:
  - *Non-terminal* (`processing`, `requires_action`): writes the payment status conditionally; for `processing` additionally extends the inventory hold to the bank-transfer window.
  - *`declined`*: conditional write; on success emits `PAYMENT_FAILED`.
  - *`succeeded`*: calls `orderService.markPaid`, then conditionally writes `succeeded` with `pendingEffects: ['commit']`. If the order is no longer `paid`, attempts a refund via `performRefund` and returns `orderLost: true`. Otherwise commits inventory via `inventoryService.commitForOrder`, clears the pending-effect marker, emits `PAYMENT_SUCCEEDED`, and enqueues the buyer's confirmation email.
- Imports `performRefund` from `./refunds` and `callerScope` from `./scope`; uses `claimWebhookEvent` / `releaseWebhookEvent` from `../repository` for webhook de-duplication (referenced in the module's broader flow).

## Relationships

- **`@infrastructure/adapters/logger`** – structured error logging for non-fatal failures (hold-extension failure, refund failure).
- **`@infrastructure/adapters/mailer`** – `enqueueEmail` dispatches the buyer's payment-confirmation email.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` build the HTTP payload the caller (webhook handler, confirm endpoint) returns.
- **`@infrastructure/i18n`** – `t` localizes email and response copy.
- **`@infrastructure/observability/analytics`** – `emitAnalyticsEvent`, `buildAnalyticsBase` record settlement analytics.
- **`@infrastructure/observability/audit`** – `recordAudit` writes an audit trail entry per settlement.
- **`@kernel/events`** – `emitDomainEvent` fires `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` (fire-and-forget via `void`).
- **`@modules/inventory`** – `inventoryService.commitForOrder` releases the held units; `inventoryService.extendHoldForOrder` extends the hold for bank-transfer timelines.
- **`@modules/orders`** – `orderService.markPaid`, `orderService.markRefundOwed`, `orderService.clearRefundOwed`, `orderService.getById` for order-state transitions and status re-reads; `bankTransferHoldHours`, `isPayable` from `orders/config`; `mailBuyer`, `paymentSucceededEmail` from `orders/emails`.

## Notes

- **At-most-once via conditional writes, not a lock.** Both the order's `markPaid` and the payment's `updateStatusIfIn` are optimistic; whichever caller wins the write is the one that proceeds. A redelivered webhook that loses both races exits with a no-op.
- **`pendingEffects: ['commit']`** is written atomically with the `succeeded` status. If the process dies before `commitForOrder` runs, `orders`' retry sweep (`effects.ts#retryPendingEffects`) picks it up. The marker is cleared on both success and refund paths.
- **Order status is re-read after the payment write.** `markPaid` returns a pre-write snapshot; a concurrent cancel could move the order away from `paid` between the two writes. Trusting the snapshot would retain money for a cancelled order.
- **`commitForOrder`'s return value is intentionally ignored.** `false` can mean either a harmless replay (hold already committed) or that an expiry sweep beat the payment to zero. `inventory` distinguishes and alarms only the second case.
- **`order.status_changed` fires before `commitForOrder`.** Any subscriber to that event sees `paid` before stock is committed. Currently only the `webhooks` listener reacts, and it forwards only `{ orderId }`, so this is safe — but reordering (commit first, then report) is required if a future listener needs to read committed stock.
- **Refund failure is logged, never rethrown.** The settlement must still answer its caller. The `ORDER_REFUND_OWED` sweep in `orders` retries the refund out-of-band.
- **`processing` vs. `requires_action` hold duration.** `processing` (provider-side work, e.g. SEPA) gets the multi-day bank-transfer window; `requires_action` (browser-side) gets the ordinary 30-minute window.
