---
source: src/modules/delivery/services/cancel-remainder.ts
sha256: afae7de333f88f7f173194b3da6ad0d223c6dd0035339042fe67e7fe1f0b6b7c
generated_at: 2026-10-14T15:27:35.960199+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/cancel-remainder.ts

## Purpose

Cancels the unshipped remainder of fulfillment orders. It is the delivery-side "door" that the `returns` module calls (inside `returns`'s own transaction) to mark lines as cancelled after a buyer's partial withdrawal or a full order cancellation. Money, stock, and Return records are left to `returns`; this file only mutates fulfillment-order lines and status.

## Key elements

- **`RemainderCancel`** — Discriminated union returned by `cancelRemainder`. On success carries the per-product `lines` cancelled and a `waitingForStock` flag (true when the order was on-hold for stock, meaning `inventory` must release preorder allowance rather than shelf units). On failure carries a `reason` (`not-found`, `nothing-shipped`, `nothing-to-cancel`).
- **`cancelRemainder(fulfillmentOrderId, orderId, session, reason?)`** — Cancels the unshipped remainder of one fulfillment order within the caller's Mongoose transaction. Validates ownership and shipped status, computes cancelled lines via domain helpers, writes an optimistic-lock `claim`, reports order progress, settles the order, and fires announce/record hooks. Refusals before the first write return `ok: false`; a failure after the first write throws to abort the caller's transaction.
- **`cancelAllForOrder(orderId)`** — `ORDER_CANCELLED` event listener. Iterates every fulfillment order on the order, skips already `closed`/`cancelled` ones (idempotent), and claims each remaining order with `status: 'cancelled'`. Chooses `cancelReason` as `no_answer` (if the consent deadline expired) or `order`. Runs in its own transaction via `runAct`.

## Relationships

- **`../domain` (fulfillment.ts, preorder.ts, index.ts)** — Imports `remainderLines`, `withRemainderCancelled`, `statusOfLines`, `hasWaitExpired`, and the `ProductQuantity` type for line computation and cancel-reason logic.
- **`../repository`** — Uses `fulfillmentOrderRepository.findInSession`, `.claim` (optimistic-lock write), and `.findByOrderId` for all persistence.
- **`./announce`** — Calls `announceCancelled` (event emission) and `recordRemainderCancelled` (audit record) after a successful claim.
- **`./act`** — Uses `refuse` (structured error for post-write conflicts) and `runAct` (transactional wrapper for `cancelAllForOrder`).
- **`./progress`** — Calls `reportProgress` and `settleOrder` to recompute order-level status/summary after the remainder is cancelled (e.g. flipping an order to `shipped` + `delivered`).
- **`@modules/orders`** — Reads the order via `orderService.readOrder` to verify shipped status and to fetch progress context.
- **`src/modules/delivery/services/index.ts`** — Re-exports this module's public API.
- **`src/modules/delivery/module.ts`** — Registers `cancelAllForOrder` as the `ORDER_CANCELLED` listener.
- **Tests** (`preorder-board`, `preorder-late`, `service`, `timeline`) — Integration tests that exercise remainder-cancellation paths end-to-end.

## Notes

- **Transaction ownership:** `cancelRemainder` does *not* open its own transaction; it runs inside the caller's (`returns`) session. A throw after the first write is intentional — returning would commit a partial claim.
- **`cancelAllForOrder` is sequential by design:** a Mongoose session does not permit parallel operations, so the `for` loop is required, not just a style choice.
- **`waitingForStock` is a signal for `inventory`:** when true, the released quantity is a claim on the preorder allowance, not physical shelf stock. The caller (`returns` → `inventory`) must branch on this flag.
- **Idempotency in `cancelAllForOrder`:** already-`closed` or `cancelled` fulfillment orders are silently skipped, so redelivered `ORDER_CANCELLED` events are safe no-ops.
- **`unset` fields:** both cancel paths clear `holdReason`, `holdNote`, and `consentDeadline` — a cancelled remainder no longer carries hold metadata.
