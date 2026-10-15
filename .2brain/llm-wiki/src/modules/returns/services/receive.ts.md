---
source: src/modules/returns/services/receive.ts
sha256: ec0ff28d12fb10d18c1b2cb4b004ccf8ff0a0e3734177fa3c9482d28f420469d
generated_at: 2026-10-15T11:58:30.242357+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/receive.ts

## Purpose

Handles the "goods arrived" workflow for a return: atomically transitions the status from `approved` to `received`, restocks the returned units, enqueues the domain event, then refunds the customer and closes the return. The two facts — parcel received and money returned — are deliberately kept on separate clocks: the status move and restock are one idempotent transaction, while the refund is an independent, retryable operation on the payment.

## Key elements

- **`ReceiveReturnInput`** — Input interface; carries an optional `handlingDeduction` (Art. 14(2) deduction) in the return's currency.
- **`receiveReturn(id, input, context)`** — Main exported entry point. Loads the return, validates its status is receivable, then delegates to `receiveFor`. Returns `ResponseSuccess<ReturnDocument>` or a typed `ResponseReject`.
- **`claimAndRestock(returned, order, handlingDeduction, actor)`** — Runs inside `withTransaction`: locks the order row, reads all sibling returns, quotes the refund, performs a conditional `claimStatus` (only from `RECEIVABLE_RETURN_STATUSES`), restocks via `inventoryService`, enqueues `RETURN_RECEIVED` outbox event, appends to the order timeline. Returns a `Claimed` discriminated union (`deduction-too-high` | `lost` | `received`).
- **`quote(returned, order, earlier, handlingDeduction)`** — Computes the refund breakdown using the frozen return lines, the order's items, and every other return already settled on the order. Determines whether this return "takes the last unit" (affects shipping refund) via `cheapestStandardShipping`.
- **`refundAndClose(received, shipping, context)`** — Calls `paymentService.refundForReturn`; on success (or nothing-owed) invokes `closeReturn`. On provider refusal, logs the error and leaves the return in `received` state for the payment sweep to retry.
- **`receiveFor(id, returned, order, input, context)`** — Orchestrates the post-transaction steps: refreshes stock cache, syncs the return status projection, records audit, then calls `refundAndClose`.
- **`notReceivable()`** — Returns a 409 `ResponseReject` with `RETURN_NOT_RECEIVABLE`.

## Relationships

- **`@infrastructure/runtime/database`** — `withTransaction` wraps the claim + restock as a single atomic unit.
- **`@kernel/outbox`** — `enqueueOutboxEvent` publishes `RETURN_RECEIVED` inside the transaction; `nudgeOutbox` is called after the transaction commits.
- **`@modules/inventory`** — `inventoryService.restockReturnedLines` (in-transaction) and `inventoryService.refreshStockCacheForProducts` (post-transaction).
- **`@modules/orders`** — `orderService.appendTimeline` adds a `return_received` entry; `sumLineItems` feeds the shipping-calculation in `quote`; `OrderDocument` type.
- **`@modules/delivery`** — `cheapestStandardShipping` determines the maximum shipping credit when this return is the last on the order.
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject`, `fieldError` shape all return values.
- **`@infrastructure/i18n`** — `t()` localizes user-facing error/success messages.
- **`@infrastructure/observability/audit`** — `recordAudit` logs the admin action with outcome and refund amount.
- **`@infrastructure/adapters/logger`** — Logs (at `error` level) when a refund provider call fails, noting the sweep will retry.

## Notes

- **Idempotency via conditional update:** `claimStatus` only fires when the current status is in `RECEIVABLE_RETURN_STATUSES`, so repeated staff clicks are safe.
- **Order-lock serialization:** The transaction acquires `returnRepository.lockOrder` before reading siblings, preventing two concurrent receipts from both claiming the delivery.
- **Refund is not in the transaction:** The provider call happens *after* commit. A provider refusal leaves the refund as `failed` on the payment; the periodic payment sweep retries it, and a `PAYMENT_REFUNDED` listener (elsewhere) closes the return. The return is therefore never permanently stuck in `received`.
- **Zero-owed short-circuit:** If `refundAmount ≤ 0` (deduction consumed everything), `refundAndClose` skips the provider call and closes immediately.
- **`Stryker disable/restore`** comments suppress mutation testing on the refund-failure log path — the catch branch is intentionally inert (log + return existing state).
