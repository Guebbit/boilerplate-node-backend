---
source: src/modules/delivery/services/holds.ts
sha256: 23a8803a9f607172a32c7d1a60a3d7a19a167d77df160558489360364f430939
generated_at: 2026-11-08T05:36:08.514457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/holds.ts

## Purpose

Implements the two staff-facing mutations for a fulfillment order's hold state: **hold** (stop shipping, record a reason) and **release** (clear the hold, resume shipping). Both run inside a Mongoose transaction, enforce preconditions, write through the repository, fire downstream notifications, and emit an audit entry before returning the updated order view.

## Key elements

- **`HoldInput`** (exported) – Payload staff submit when holding: a `reason` (excludes `awaiting_stock`), an optional internal `note`, and an optional buyer-facing `message`.
- **`holdFulfillmentOrder`** (exported) – Public entry point to place a hold. Delegates to `guarded` with `holdAct`.
- **`releaseFulfillmentOrder`** (exported) – Public entry point to release a hold. Delegates to `guarded` with `releaseAct`.
- **`holdAct`** (private) – Validates that the order is still in-progress and the fulfillment order is holdable, then calls `fulfillmentOrderRepository.claim` to set status/hold fields, reports progress, and announces the hold.
- **`releaseAct`** (private) – Validates releasability, calls `claim` to unset all four hold fields and restore line-based status, reports progress, and announces the release.
- **`guarded`** (private) – Shared wrapper that runs the act via `runAct`, records the audit log entry, fetches a fresh order, and shapes the success/reject HTTP response.
- **`isWorked`** (private) – One-line guard: `isAwaitingGoods(order.status)`; rejects hold/release on delivered or canceled orders.

## Relationships

- **`services/act.ts`** – Provides `readWithOrder` (load FO + parent order in-session), `refuse` (structured 409), and `runAct` (transaction runner).
- **`services/announce.ts`** – `announceHeld` / `announceReleased` send buyer notifications after the write commits.
- **`services/progress.ts`** – `reportProgress` updates the parent order's delivery progress after either mutation.
- **`services/actions.ts`** – `viewFulfillmentOrder` shapes the response payload (includes caller-specific action buttons).
- **`domain/` (fulfillment.ts, index.ts)** – `isHoldable`, `isReleasable`, and `statusOfLines` encode the state-machine preconditions and the status derived from line items.
- **`repository.ts`** – `fulfillmentOrderRepository.claim` performs the optimistic-concurrency write (revision check) inside the transaction.
- **`model.ts`** – `FulfillmentOrderDocument` is the Mongoose document type used throughout.
- **`delivery/audit.ts`** – `deliveryAuditActions` supplies the stable action identifiers (`ADMIN_FULFILLMENT_ORDER_HELD`, `…RELEASED`) for the audit log.
- **`@infrastructure/observability/audit`** – `recordAudit` persists the structured audit entry (action, target, reason code).
- **`@infrastructure/http/response`** – `generateSuccess` and the `ResponseReject`/`ResponseSuccess` union type shape the HTTP reply.
- **`modules/orders`** – `isAwaitingGoods` (lifecycle guard) and `orderService.getById` (fetch fresh order for the response view).
- **`services/index.ts`** – Barrel re-export so callers import `holdFulfillmentOrder` / `releaseFulfillmentOrder` from the module root.

## Notes

- **`awaiting_stock` is system-managed only.** `HoldInput.reason` is typed as `Exclude<FulfillmentHoldReason, 'awaiting_stock'>`, so staff cannot set or clear that reason here. A hand release would ship stock the allocation ledger never counted out.
- **Audit metadata omits `holdNote`.** Only the `reason` code is recorded; free-text notes are deliberately excluded because the audit pipeline ships unhashed text to Loki.
- **Reason is captured pre-write in `releaseAct`.** After `claim` unsets `holdReason`, the post-write document no longer carries it, so the code is read from the pre-write `fulfillmentOrder` and passed through `Changed.reason`.
- **Optimistic concurrency.** Both acts pass `fulfillmentOrder.revision` to `claim`; a `null` return means a concurrent mutation won the race and the act refuses with 409.
